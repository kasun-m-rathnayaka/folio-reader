import * as pdfjs from '../lib/pdfjs/pdf.min.mjs';
import { rotateRect, clampRect, resolvePageIndex, squareToQuad, quadToSquare, quadMatrix3d } from './reader-geometry.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('../lib/pdfjs/pdf.worker.min.mjs', import.meta.url).href;

class FolioReaderEngine {
    constructor() {
        this.pages = []; this.pdfDoc = null; this.zoom = 1; this.rotation = 0; this.currentPageIndex = 0;
        this.layoutMode = 'continuous'; this.searchMatches = []; this.searchVersion = 0;
        this.currentSearchMatchIndex = -1; this.currentSearchQuery = ''; this.disposed = true;
        this.history = []; this.historyIndex = -1;
    }
    init(id, helper) {
        this.container = document.getElementById(id);
        if (!this.container) throw new Error('Reader viewport is unavailable.');
        this.dotNetHelper = helper; this.disposed = false;
        this.events = new AbortController();
        const options = { signal: this.events.signal };
        this.container.classList.add('folio-reader-container');
        this.container.addEventListener('scroll', () => this.handleScroll(), { ...options, passive: true });
        this.container.addEventListener('mouseup', () => requestAnimationFrame(() => this.handleTextSelection()), options);
        document.addEventListener('selectionchange', () => {
            clearTimeout(this.selectionTimer);
            this.selectionTimer = setTimeout(() => this.handleTextSelection(), 60);
        }, options);
        window.addEventListener('keydown', e => this.handleKeyDown(e), options);
        // WP6: in 3D reading the stage draws the pages and tells this engine where they are, so the text layer, highlights and
        // dog-ears sit exactly over them.
        window.addEventListener('folio-spread', e => this.setSpread(e.detail), options);
        window.addEventListener('pointermove', e => {
            const reader = document.querySelector('.folio-zen-active');
            if (reader && e.clientY < 90) {
                reader.classList.add('folio-chrome-revealed'); clearTimeout(this.chromeTimer);
                this.chromeTimer = setTimeout(() => reader.classList.remove('folio-chrome-revealed'), 2000);
            }
        }, options);
        this.resizeObserver = new ResizeObserver(() => {
            if (this.zoom < 0 && this.pdfDoc) this.refreshLayout();
        });
        this.resizeObserver.observe(this.container);
    }
    async notify(method, payload) {
        if (this.disposed || !this.dotNetHelper) return;
        try { await this.dotNetHelper.invokeMethodAsync(method, ...(payload === undefined ? [] : [payload])); }
        catch (error) {
            console.error(`[FolioReader] ${method} failed`, error);
            window.chrome?.webview?.postMessage({kind:'reader-error',code:`interop:${method}`,detail:String(error.message || error)});
        }
    }
    async loadDocument(url, initialPage = 0, initialOffset = 0, initialZoom = 1, mode = 'continuous', password = null, spread = false) {
        let timeout;
        try {
            this.container.replaceChildren();
            this.loadingTask = pdfjs.getDocument({ url, password: password || undefined, isEvalSupported: false, disableAutoFetch: true });
            timeout = setTimeout(() => this.loadingTask?.destroy(), 30000);
            this.pdfDoc = await this.loadingTask.promise;
            clearTimeout(timeout);
            if (this.disposed) return;
            this.totalPages = this.pdfDoc.numPages;
            this.currentPageIndex = resolvePageIndex(initialPage, this.totalPages);
            this.zoom = initialZoom === -1 || initialZoom === -2 ? initialZoom : Math.max(.25, Math.min(4, initialZoom));
            this.layoutMode = spread ? 'spread' : mode; this.previousMode = mode; this.rotation = 0;
            if (spread) this.container.classList.add('folio-spread-overlay');
            const firstPage = await this.pdfDoc.getPage(this.currentPageIndex + 1);
            const viewport = firstPage.getViewport({ scale: 1 });
            const fragment = document.createDocumentFragment();
            this.pages = Array.from({ length: this.totalPages }, (_, index) => {
                const wrapper = document.createElement('div');
                wrapper.className = 'folio-page-wrapper'; wrapper.dataset.pageIndex = index; wrapper.setAttribute('aria-label', `Page ${index + 1}`);
                const canvasWrap = document.createElement('div'); canvasWrap.className = 'folio-canvas-layer';
                const textLayer = document.createElement('div'); textLayer.className = 'folio-text-layer textLayer';
                const linkLayer = document.createElement('div'); linkLayer.className = 'folio-link-layer';
                const overlay = document.createElement('div'); overlay.className = 'folio-overlay-layer';
                const dogEar = document.createElement('button'); dogEar.className = 'folio-dog-ear'; dogEar.setAttribute('aria-label', `Bookmark page ${index + 1}`); dogEar.setAttribute('aria-pressed', 'false'); dogEar.innerHTML = '<span class="folio-dog-ear-triangle"></span>';
                dogEar.addEventListener('click', () => this.notify('OnDogEarToggled', index), { signal: this.events.signal });
                wrapper.append(canvasWrap, textLayer, linkLayer, overlay, dogEar); fragment.append(wrapper);
                return { index, container: wrapper, canvasWrap, textLayer, linkLayer, overlayLayer: overlay, dogEar,
                    width: viewport.width, height: viewport.height, proxy: index === this.currentPageIndex ? firstPage : null,
                    rendered: false, rendering: false, generation: 0, annotations: [] };
            });
            this.container.append(fragment);
            if (spread) this.pages.forEach(p => { p.container.style.display = 'none'; });      // the stage places them when it lands on a page
            else { this.updateLayoutDisplay(); this.goToPage(this.currentPageIndex, initialOffset, false, false); await this.renderPage(this.pages[this.currentPageIndex]); }
            if (this.disposed) return;
            await this.notify('OnDocumentLoaded', { totalPages: this.totalPages, outline: [] });
            this.scheduleVirtualization();
            this.pdfDoc.getOutline().then(async outline => {
                const resolved = await this.formatOutline(outline);
                await this.notify('OnOutlineLoaded', resolved);
            }).catch(() => {});
        } catch (error) {
            clearTimeout(timeout);
            if (this.disposed) return;
            await this.notify('OnReaderError', { code: error.name === 'PasswordException' ? 'password' : 'load', message: 'The document could not be opened.' });
            console.error('[FolioReader] Document loading failed', error);
        }
    }
    async destinationIndex(destination) {
        const dest = typeof destination === 'string' ? await this.pdfDoc.getDestination(destination) : destination;
        if (!Array.isArray(dest)) return 0;
        return resolvePageIndex(typeof dest[0] === 'number' ? dest[0] : await this.pdfDoc.getPageIndex(dest[0]), this.totalPages);
    }
    async formatOutline(outline) {
        return await Promise.all((outline || []).map(async node => ({ title: node.title || 'Untitled',
            pageIndex: await this.destinationIndex(node.dest).catch(() => 0), children: await this.formatOutline(node.items) })));
    }
    getEffectiveZoom(forPage) {
        if (this.layoutMode === 'spread' && forPage?.spreadScale) return forPage.spreadScale;
        if (this.zoom > 0) return this.zoom;
        const page = this.pages[this.currentPageIndex];
        if (!page) return 1;
        const sideways = this.rotation % 180 !== 0;
        const w = sideways ? page.height : page.width, h = sideways ? page.width : page.height;
        const scaleW = Math.max(1, this.container.clientWidth - 64) / w;
        const scaleH = Math.max(1, this.container.clientHeight - 48) / h;
        return Math.max(.25, Math.min(4, this.zoom === -2 ? Math.min(scaleW, scaleH) : scaleW));
    }
    updatePageDimensions() {
        if (this.layoutMode === 'spread') return;
        const scale = this.getEffectiveZoom(), sideways = this.rotation % 180 !== 0;
        for (const page of this.pages) {
            page.container.style.width = `${(sideways ? page.height : page.width) * scale}px`;
            page.container.style.height = `${(sideways ? page.width : page.height) * scale}px`;
        }
    }
    updateLayoutDisplay() {
        if (this.layoutMode === 'spread') return;      // setSpread decides which pages show, and where
        for (const page of this.pages) page.container.style.display = this.layoutMode === 'single' && page.index !== this.currentPageIndex ? 'none' : 'block';
        this.updatePageDimensions();
    }
    currentOffset() {
        const page = this.pages[this.currentPageIndex];
        // A hidden or closing reader has zero-height pages: report the top of the page, never NaN.
        if (!page || !page.container.offsetHeight) return 0;
        const offset = (this.container.scrollTop - page.container.offsetTop) / page.container.offsetHeight;
        return Number.isFinite(offset) ? Math.max(0, Math.min(1, offset)) : 0;
    }
    handleScroll() {
        if (this.disposed || !this.pages.length || this.layoutMode === 'spread') return;
        const marker = this.container.scrollTop + Math.min(120, this.container.clientHeight / 4);
        if (this.layoutMode !== 'single') {
            let nearest = 0;
            for (const page of this.pages) { if (page.container.offsetTop <= marker) nearest = page.index; else break; }
            this.currentPageIndex = nearest;
        }
        // Throttle rather than debounce: uninterrupted scrolling still reports progress.
        if (!this.positionTimer) this.positionTimer = setTimeout(() => { this.positionTimer = null; this.emitPosition(); }, 200);
        this.scheduleVirtualization();
    }
    async emitPosition() {
        if (this.positionBusy) { this.positionPending = true; return; }
        this.positionBusy = true;
        try {
            do {
                this.positionPending = false;
                await this.notify('OnPositionChanged', { pageIndex: this.currentPageIndex, offsetPercent: this.currentOffset(), zoom: this.zoom });
            } while (this.positionPending && !this.disposed);
        } finally { this.positionBusy = false; }
    }
    scheduleVirtualization() {
        if (this.disposed || !this.pages.length || this.layoutMode === 'spread') return;
        const firstVisible = this.pages.findIndex(p => p.container.offsetTop + p.container.offsetHeight > this.container.scrollTop);
        let endVisible = this.currentPageIndex;
        for (let i = Math.max(0, firstVisible); i < this.pages.length; i++) {
            if (this.pages[i].container.offsetTop > this.container.scrollTop + this.container.clientHeight) break;
            endVisible = i;
        }
        const start = this.layoutMode === 'single' ? this.currentPageIndex : Math.max(0, Math.min(this.currentPageIndex, firstVisible) - 1);
        const end = this.layoutMode === 'single' ? this.currentPageIndex : Math.min(this.pages.length - 1, endVisible + 1);
        for (const page of this.pages) {
            const visible = page.index >= start && page.index <= end;
            page.container.inert = !visible;
            if (visible) { if (!page.rendered && !page.rendering) this.renderPage(page); }
            else if (page.rendered || page.rendering) this.recyclePage(page);
        }
    }
    async renderPage(page) {
        if (!page || page.rendering || this.disposed) return;
        page.rendering = true;
        const generation = ++page.generation;
        try {
            page.proxy ||= await this.pdfDoc.getPage(page.index + 1);
            if (generation !== page.generation || this.disposed) return;
            const base = page.proxy.getViewport({ scale: 1 });
            if (page.width !== base.width || page.height !== base.height) {
                const offset = this.currentOffset(); page.width = base.width; page.height = base.height; this.updatePageDimensions();
                this.goToPage(this.currentPageIndex, offset, false);
            }
            const viewport = page.proxy.getViewport({ scale: this.getEffectiveZoom(page), rotation: (page.proxy.rotate + this.rotation) % 360 });
            page.viewport = viewport;
            if (this.layoutMode !== 'spread') {        // in 3D reading the stage draws the page; only the layers above it are drawn here
                const canvas = document.createElement('canvas');
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                canvas.width = Math.ceil(viewport.width * dpr); canvas.height = Math.ceil(viewport.height * dpr);
                canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
                page.canvasWrap.replaceChildren(canvas);
                page.canvasWrap.style.filter = this.theme?.cssFilter || 'none';
                page.renderTask = page.proxy.render({ canvasContext: canvas.getContext('2d'), viewport,
                    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
                await page.renderTask.promise;
                if (generation !== page.generation || this.disposed) return;
            }
            page.textLayer.replaceChildren();
            page.container.style.setProperty('--scale-factor', viewport.scale);
            page.container.style.setProperty('--total-scale-factor', viewport.scale);
            page.textTask = new pdfjs.TextLayer({ textContentSource: await page.proxy.getTextContent(), container: page.textLayer, viewport });
            await page.textTask.render();
            if (generation !== page.generation || this.disposed) return;
            await this.renderLinks(page, viewport);
            page.rendered = true;
            this.drawAnnotations(page.index, page.annotations);
            this.markSearch(page);
            await this.notify('OnPageRendered', page.index);
        } catch (error) {
            if (generation === page.generation && !this.disposed && error.name !== 'RenderingCancelledException' && error.name !== 'AbortException') {
                console.error(`[FolioReader] Page ${page.index + 1} failed`, error);
                window.chrome?.webview?.postMessage({kind:'reader-error',code:error.name,detail:error.message});
                if (!page.canvasWrap.querySelector('canvas')) page.canvasWrap.textContent = 'This page could not be displayed. Try another page or reopen the book.';
            }
        } finally {
            if (generation === page.generation) { page.rendering = false; page.renderTask = null; page.textTask = null; }
        }
    }
    async renderLinks(page, viewport) {
        page.linkLayer.replaceChildren();
        for (const annotation of await page.proxy.getAnnotations({ intent: 'display' })) {
            if (annotation.subtype !== 'Link' || (!annotation.url && !annotation.dest)) continue;
            const [x0,y0,x1,y1] = annotation.rect;
            const box = [...viewport.convertToViewportPoint(x0,y0), ...viewport.convertToViewportPoint(x1,y1)];
            const link = document.createElement('button'); link.className = 'folio-pdf-link';
            link.style.left = `${Math.min(box[0], box[2])}px`; link.style.top = `${Math.min(box[1], box[3])}px`;
            link.style.width = `${Math.abs(box[2] - box[0])}px`; link.style.height = `${Math.abs(box[3] - box[1])}px`;
            link.setAttribute('aria-label', annotation.url ? `Open external link: ${annotation.url}` : 'Follow reference in this book');
            link.title = annotation.url || 'Go to reference';
            link.addEventListener('click', async () => {
                if (annotation.url) await this.notify('OnExternalLinkRequested', annotation.url);
                else { this.history.splice(this.historyIndex + 1); this.history.push({ page: this.currentPageIndex, offset: this.currentOffset() }); this.historyIndex = this.history.length - 1; this.goToPage(await this.destinationIndex(annotation.dest)); }
            }, { signal: this.events.signal });
            page.linkLayer.append(link);
        }
    }
    recyclePage(page) {
        page.generation++; page.renderTask?.cancel(); page.textTask?.cancel();
        page.canvasWrap.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; });
        page.canvasWrap.replaceChildren(); page.textLayer.replaceChildren(); page.linkLayer.replaceChildren();
        page.rendered = false; page.rendering = false; page.renderTask = null; page.textTask = null;
    }
    goToPage(index, offset = 0, report = true, schedule = true) {
        if (!this.pages.length) return;
        if (this.layoutMode === 'spread') {            // the stage turns (one curl) or riffles to the page, then reports the new spread
            window.dispatchEvent(new CustomEvent('folio-goto', { detail: { index: resolvePageIndex(index, this.pages.length) } }));
            return;
        }
        this.currentPageIndex = resolvePageIndex(index, this.pages.length);
        if (this.layoutMode === 'single') this.updateLayoutDisplay();
        const page = this.pages[this.currentPageIndex];
        this.container.scrollTop = page.container.offsetTop + page.container.offsetHeight * Math.max(0, Math.min(1, offset));
        if (schedule) this.scheduleVirtualization(); if (report) this.emitPosition();
    }
    /**
     * WP6: the stage reports where it drew the two pages of the spread (viewport CSS pixels, already fitted to each page's aspect).
     * Those pages get a wrapper fixed over the rectangle, with the text layer, links, highlights and dog-ear; everything else hides.
     * `visible: false` (while a page turns) hides the overlay without losing the spread.
     */
    setSpread(detail) {
        if (this.disposed || !this.pages.length || !detail) return;
        if (detail.off) { this.exitSpread(); return; }
        if (this.layoutMode !== 'spread') { this.previousMode = this.layoutMode; this.layoutMode = 'spread'; this.container.classList.add('folio-spread-overlay'); }
        const entries = [detail.left, detail.right].filter(Boolean);
        for (const page of this.pages) {
            const entry = detail.visible === false ? null : entries.find(e => e.index === page.index);
            const style = page.container.style;
            if (!entry) { style.display = 'none'; page.container.inert = true; if (page.rendered || page.rendering) this.recyclePage(page); continue; }
            const base = page.proxy?.getViewport({ scale: 1 }) ?? { width: page.width, height: page.height };
            // A page of the tilted book is a quadrilateral: lay the wrapper at the page's own size, then map it onto the corners with a
            // perspective transform, so text, highlights and selection sit exactly on the drawn page.
            const quad = entry.quad;
            const edge = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
            const height = quad ? (edge(quad[0], quad[3]) + edge(quad[1], quad[2])) / 2 : entry.rect.height;
            const scale = height / base.height, width = base.width * scale;
            const changed = Math.abs((page.spreadScale ?? 0) - scale) > 1e-4;
            page.spreadScale = scale;
            if (quad) {
                page.spreadToUnit = quadToSquare(squareToQuad(quad));
                Object.assign(style, { display: 'block', position: 'fixed', left: '0px', top: '0px', width: `${width}px`, height: `${height}px`, transformOrigin: '0 0', transform: quadMatrix3d(width, height, quad), margin: '0', background: 'transparent', boxShadow: 'none' });
            } else {
                page.spreadToUnit = null;
                Object.assign(style, { display: 'block', position: 'fixed', left: `${entry.rect.x}px`, top: `${entry.rect.y}px`, width: `${entry.rect.width}px`, height: `${entry.rect.height}px`, transform: '', margin: '0', background: 'transparent', boxShadow: 'none' });
            }
            page.container.inert = false;
            if (changed && (page.rendered || page.rendering)) this.recyclePage(page);
            if (!page.rendered && !page.rendering) this.renderPage(page);
        }
        if (detail.visible !== false && entries.length) {
            this.currentPageIndex = entries[0].index;
            this.emitPosition();
        }
    }

    exitSpread() {
        if (this.layoutMode !== 'spread') return;
        this.layoutMode = this.previousMode === 'single' ? 'single' : 'continuous';
        this.container.classList.remove('folio-spread-overlay');
        for (const page of this.pages) {
            Object.assign(page.container.style, { position: '', left: '', top: '', margin: '', background: '', boxShadow: '', transform: '', transformOrigin: '' });
            page.spreadToUnit = null;
            if (page.rendered || page.rendering) this.recyclePage(page);
        }
        this.refreshLayout();
    }

    /** The shape of a page (width / height), known before it renders; the stage fits its page images to it. */
    pageAspect(index) {
        const page = this.pages[index] ?? this.pages[this.currentPageIndex];
        return page ? page.width / page.height : 0.7;
    }

    /** A page rendered to its own canvas, for the stage to use as a texture; independent of the layout and of the page wrappers. */
    async renderPageImage(index, heightPx) {
        if (!this.pdfDoc || this.disposed || index < 0 || index >= this.totalPages) return null;
        const proxy = await this.pdfDoc.getPage(index + 1);
        const base = proxy.getViewport({ scale: 1 }), scale = Math.max(0.2, heightPx / base.height);
        const viewport = proxy.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const task = proxy.render({ canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
        if (this.disposed) { canvas.width = canvas.height = 0; return null; }
        return { canvas, aspect: base.width / base.height };
    }

    refreshLayout() {
        if (this.layoutMode === 'spread') return;
        const index = this.currentPageIndex, offset = this.currentOffset();
        this.pages.forEach(p => this.recyclePage(p)); this.updateLayoutDisplay(); this.goToPage(index, offset);
    }
    setZoom(zoom) { this.zoom = zoom; this.refreshLayout(); }
    setFitWidth() { this.setZoom(-1); }
    setFitPage() { this.setZoom(-2); }
    setLayoutMode(mode) { this.layoutMode = mode; this.refreshLayout(); }
    setRotation(degrees) { this.rotation = ((this.rotation + degrees) % 360 + 360) % 360; this.refreshLayout(); }
    handleTextSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        const closestPage = node => (node?.nodeType === 1 ? node : node?.parentElement)?.closest('.folio-page-wrapper');
        const node = closestPage(range.startContainer), end = closestPage(range.endContainer);
        if (!node) return;
        if (node !== end) { this.notify('OnSelectionUnavailable'); return; }
        const pageRect = node.getBoundingClientRect();
        // On the tilted 3D page, client rectangles are mapped back through the page's perspective into its own 0–1 space.
        const toUnit = this.pages[Number(node.dataset.pageIndex)]?.spreadToUnit;
        const normalize = r => {
            if (!toUnit) return { x: (r.left - pageRect.left) / pageRect.width, y: (r.top - pageRect.top) / pageRect.height, width: r.width / pageRect.width, height: r.height / pageRect.height };
            const points = [[r.left, r.top], [r.right, r.top], [r.right, r.bottom], [r.left, r.bottom]].map(([x, y]) => toUnit(x, y));
            const us = points.map(p => p[0]), vs = points.map(p => p[1]);
            return { x: Math.min(...us), y: Math.min(...vs), width: Math.max(...us) - Math.min(...us), height: Math.max(...vs) - Math.min(...vs) };
        };
        const rects = Array.from(range.getClientRects()).filter(r => r.width > 1 && r.height > 1)
            .map(r => rotateRect(clampRect(normalize(r)), -this.rotation));
        const text = selection.toString().trim();
        if (text && rects.length) {
            const bounds = range.getBoundingClientRect();
            this.notify('OnTextSelected', { pageIndex: Number(node.dataset.pageIndex), selectedText: text, rects,
                clientX: Math.max(12, Math.min(window.innerWidth - 360, bounds.left)), clientY: Math.max(70, bounds.top - 52) });
        }
    }
    clearSelectionBox() { window.getSelection()?.removeAllRanges(); }
    drawAnnotations(index, annotations) {
        const page = this.pages[index]; if (!page) return;
        page.annotations = annotations || [];
        page.overlayLayer.querySelectorAll('.folio-annotation-item').forEach(el => el.remove());
        for (const annotation of page.annotations) for (const original of annotation.rects || []) {
            const r = rotateRect(original, this.rotation), el = document.createElement('div');
            el.className = `folio-annotation-item folio-annotation-${(annotation.type || 'Highlight').toLowerCase()}`;
            el.dataset.annotationId = annotation.id;
            Object.assign(el.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` });
            if (annotation.type === 'Underline') {
                const edge = {0:'borderBottom',90:'borderLeft',180:'borderTop',270:'borderRight'}[this.rotation];
                el.style[edge] = `2px solid ${annotation.colorHex}`;
            }
            else if (annotation.type === 'Strike') { el.style.background = `linear-gradient(${this.rotation % 180 ? 'to right' : 'to bottom'}, transparent 45%, ${annotation.colorHex} 45%, ${annotation.colorHex} 55%, transparent 55%)`; }
            else { el.style.backgroundColor = annotation.colorHex; el.style.opacity = '.3'; }
            el.addEventListener('dblclick', () => this.notify('OnAnnotationClicked', annotation.id), { signal: this.events.signal });
            page.overlayLayer.append(el);
        }
    }
    pulseAnnotation(id) { document.querySelectorAll(`[data-annotation-id="${id}"]`).forEach(el => { el.classList.add('folio-annotation-pulsing'); setTimeout(() => el.classList.remove('folio-annotation-pulsing'), 1000); }); }
    setDogEar(index, folded) { const ear = this.pages[index]?.dogEar; ear?.classList.toggle('active', folded); ear?.setAttribute('aria-pressed', folded ? 'true' : 'false'); }
    /** OPN-1/2: where the current page is drawn, in viewport CSS pixels (the stage aligns its 3D page to it). */
    currentPageRect() {
        if (this.layoutMode === 'spread') return null;
        const page = this.pages[this.currentPageIndex];
        const canvas = page?.canvasWrap.querySelector('canvas') ?? page?.container;
        if (!canvas) return null;
        const r = canvas.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
    }
    async getPageText(index) {
        if (!this.pdfDoc) return null;
        const page = await this.pdfDoc.getPage(index + 1), content = await page.getTextContent();
        return { text: content.items.map(i => i.str || '').join(' '), items: [] };
    }
    async getThumbnail(index) {
        if (!this.pdfDoc || this.disposed) return null;
        const page = await this.pdfDoc.getPage(index + 1);
        const base = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: 110 / base.width });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const result = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0; return result;
    }
    async search(query, forward = true) {
        if (!this.pdfDoc || !query.trim()) return;
        const normalized = query.trim().toLowerCase();
        if (normalized !== this.currentSearchQuery) {
            this.currentSearchQuery = normalized; this.currentSearchMatchIndex = -1; this.searchMatches = [];
            const version = ++this.searchVersion;
            for (let index = 0; index < this.totalPages; index++) {
                const proxy = await this.pdfDoc.getPage(index + 1), content = await proxy.getTextContent();
                if (version !== this.searchVersion || this.disposed) return;
                let text = content.items.map(i => i.str || '').join(' ').toLowerCase();
                let position = text.indexOf(normalized);
                while (position !== -1) { this.searchMatches.push({ pageIndex:index, charIndex:position }); position = text.indexOf(normalized, position + normalized.length); }
                if (index === this.currentPageIndex) this.markSearch(this.pages[index]);
                if (index % 8 === 0) await new Promise(resolve => setTimeout(resolve, 0));
            }
        }
        const total = this.searchMatches.length;
        if (total) {
            this.currentSearchMatchIndex = (this.currentSearchMatchIndex + (forward ? 1 : -1) + total) % total;
            this.goToPage(this.searchMatches[this.currentSearchMatchIndex].pageIndex);
        }
        this.pages.filter(p => p.rendered).forEach(p => this.markSearch(p));
        await this.notify('OnSearchMatch', { currentMatch:total ? this.currentSearchMatchIndex + 1 : 0, totalMatches:total, pageIndex:this.currentPageIndex });
    }
    markSearch(page) { if (!page) return; for (const span of page.textLayer.querySelectorAll('span')) span.classList.toggle('folio-search-hit', !!this.currentSearchQuery && span.textContent.toLowerCase().includes(this.currentSearchQuery)); }
    clearSearch() { this.searchVersion++; this.currentSearchQuery = ''; this.searchMatches = []; this.currentSearchMatchIndex = -1; this.pages.forEach(p => this.markSearch(p)); }
    handleKeyDown(e) {
        if (e.target.closest('input,textarea,select,[contenteditable="true"],.mud-dialog') || this.disposed) return;
        const ctrl = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
        if (!ctrl && key === 'z' && !e.altKey && this.layoutMode !== 'spread') { e.preventDefault(); this.notify('OnReaderShortcut', { key:'z', ctrlKey:false, altKey:false }); return; }
        if ((ctrl && ['g','d','f','k','+','=','-'].includes(key)) || ['F11','Escape'].includes(e.key) || (!ctrl && ['h'].includes(key) && window.getSelection()?.toString().trim())) {
            e.preventDefault(); this.notify('OnReaderShortcut', { key:e.key, ctrlKey:ctrl, altKey:e.altKey }); return;
        }
        if (e.altKey && e.key === 'ArrowLeft' && this.historyIndex >= 0) {
            e.preventDefault(); const current = { page:this.currentPageIndex, offset:this.currentOffset() };
            const target = this.history[this.historyIndex]; this.history[this.historyIndex--] = current; this.goToPage(target.page, target.offset); return;
        }
        if (e.altKey && e.key === 'ArrowRight' && this.historyIndex + 1 < this.history.length) {
            e.preventDefault(); const current = { page:this.currentPageIndex, offset:this.currentOffset() };
            const target = this.history[++this.historyIndex]; this.history[this.historyIndex] = current; this.goToPage(target.page,target.offset); return;
        }
        if (this.layoutMode === 'spread') {            // the stage turns pages and riffles in 3D reading
            if (!ctrl && key === 'z') { e.preventDefault(); this.notify('OnReaderShortcut', { key:'z', ctrlKey:false, altKey:false }); }
            return;
        }
        const deltas = { ArrowRight:1, PageDown:1, ArrowLeft:-1, PageUp:-1 };
        if (e.key in deltas) { e.preventDefault(); this.goToPage(this.currentPageIndex + deltas[e.key]); }
        else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); this.goToPage(e.key === 'Home' ? 0 : this.totalPages - 1); }
    }
    applyTheme(theme) { this.theme = theme; this.pages.forEach(p => p.canvasWrap.style.filter = theme.cssFilter || 'none'); }
    async dispose() {
        this.disposed = true; this.searchVersion++; clearTimeout(this.positionTimer); clearTimeout(this.chromeTimer); clearTimeout(this.selectionTimer); this.events?.abort(); this.resizeObserver?.disconnect();
        this.pages.forEach(p => this.recyclePage(p)); this.pages = []; this.dotNetHelper = null;
        await this.loadingTask?.destroy(); this.pdfDoc = null; this.loadingTask = null;
        this.container?.replaceChildren();
    }
}
const methods = ['loadDocument','goToPage','setZoom','setFitWidth','setFitPage','setLayoutMode','setRotation','search','clearSearch','getPageText','getThumbnail','drawAnnotations','pulseAnnotation','setDogEar','clearSelectionBox','applyTheme','currentPageRect','setSpread','pageAspect','renderPageImage'];
window.folioReader = {
    engine: null,
    get pdfDoc() { return this.engine?.pdfDoc; },
    init(id, helper) { this.engine = new FolioReaderEngine(); this.engine.init(id, helper); },
    async dispose() { await this.engine?.dispose(); this.engine = null; }
};
for (const method of methods) window.folioReader[method] = (...args) => window.folioReader.engine?.[method](...args);
