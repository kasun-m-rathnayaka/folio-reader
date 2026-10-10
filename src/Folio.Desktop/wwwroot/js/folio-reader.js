import * as pdfjsLib from '../lib/pdfjs/pdf.min.mjs';
import { PageGeometry } from '../lib/coordinate_space.mjs';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/pdf.worker.min.mjs';

class FolioReaderEngine {
    constructor() {
        this.container = null;
        this.dotNetHelper = null;
        this.pdfDoc = null;
        this.totalPages = 0;
        this.currentPageIndex = 0;
        this.zoom = 1.0;
        this.layoutMode = 'continuous'; // 'continuous' or 'single'
        this.rotation = 0; // 0, 90, 180, 270
        this.pages = []; // { pageNumber, pageProxy, geometry, rendered, rendering, canvas, textLayer, container, width, height }
        this.renderQueue = new Set();
        this.isDisposed = false;
        this.searchMatches = [];
        this.currentSearchMatchIndex = -1;
        this.currentSearchQuery = '';
        this.scrollDebounceTimer = null;
        this.resizeObserver = null;
    }

    init(containerElementId, dotNetHelper) {
        this.container = document.getElementById(containerElementId);
        this.dotNetHelper = dotNetHelper;

        if (!this.container) {
            console.error('[FolioReader] Container not found:', containerElementId);
            return;
        }

        this.container.classList.add('folio-reader-container');

        // Scroll listener for continuous mode and virtualization
        this.container.addEventListener('scroll', () => this.handleScroll(), { passive: true });

        // Selection listener for text extraction
        this.container.addEventListener('mouseup', () => this.handleTextSelection());

        // Keyboard navigation
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Resize observer for fit-width adjustments
        this.resizeObserver = new ResizeObserver(() => {
            if (this.zoom === -1) {
                this.setFitWidth();
            } else if (this.zoom === -2) {
                this.setFitPage();
            }
        });
        this.resizeObserver.observe(this.container);

        console.log('[FolioReader] Initialized on container:', containerElementId);
    }

    async loadDocument(url, initialPageIndex = 0, initialOffsetPercent = 0.0, initialZoom = 1.0, layoutMode = 'continuous') {
        try {
            console.log('[FolioReader] Loading document:', url);
            this.container.innerHTML = '<div class="folio-reader-loading">Loading document...</div>';

            this.pdfDoc = await pdfjsLib.getDocument({
                url: url,
                isEvalSupported: false,
                disableAutoFetch: true
            }).promise;

            this.totalPages = this.pdfDoc.numPages;
            this.layoutMode = layoutMode;
            this.zoom = initialZoom > 0 ? initialZoom : 1.0;
            this.currentPageIndex = Math.max(0, Math.min(initialPageIndex, this.totalPages - 1));

            // Extract Outline (Table of Contents)
            let outline = [];
            try {
                const rawOutline = await this.pdfDoc.getOutline();
                outline = this.formatOutline(rawOutline);
            } catch (outlineErr) {
                console.warn('[FolioReader] Outline extraction fallback:', outlineErr);
            }

            // Notify Blazor that document is loaded
            if (this.dotNetHelper) {
                await this.dotNetHelper.invokeMethodAsync('OnDocumentLoaded', {
                    totalPages: this.totalPages,
                    outline: outline
                });
            }

            // Build page placeholder containers
            this.container.innerHTML = '';
            this.pages = [];

            for (let i = 1; i <= this.totalPages; i++) {
                const pageProxy = await this.pdfDoc.getPage(i);
                const view = pageProxy.view; // [x0, y0, x1, y1]
                const rotate = pageProxy.rotate || 0;
                const geometry = new PageGeometry(view, null, rotate);

                const pageEl = document.createElement('div');
                pageEl.id = `folio-page-${i}`;
                pageEl.className = 'folio-page-wrapper';
                pageEl.dataset.pageIndex = (i - 1).toString();

                // Placeholder dimensions based on aspect ratio
                const initialWidth = geometry.visibleWidth * this.getEffectiveZoom();
                const initialHeight = geometry.visibleHeight * this.getEffectiveZoom();
                pageEl.style.width = `${initialWidth}px`;
                pageEl.style.height = `${initialHeight}px`;

                // Layers
                const canvasWrap = document.createElement('div');
                canvasWrap.className = 'folio-canvas-layer';
                pageEl.appendChild(canvasWrap);

                const textLayer = document.createElement('div');
                textLayer.className = 'folio-text-layer';
                pageEl.appendChild(textLayer);

                const overlayLayer = document.createElement('div');
                overlayLayer.className = 'folio-overlay-layer';
                pageEl.appendChild(overlayLayer);

                this.container.appendChild(pageEl);

                this.pages.push({
                    pageNumber: i,
                    pageProxy: pageProxy,
                    geometry: geometry,
                    container: pageEl,
                    canvasWrap: canvasWrap,
                    textLayer: textLayer,
                    overlayLayer: overlayLayer,
                    rendered: false,
                    rendering: false,
                    renderTask: null
                });
            }

            // Apply layout visibility
            this.updateLayoutDisplay();

            // Scroll to initial position
            if (this.currentPageIndex > 0 || initialOffsetPercent > 0) {
                this.goToPage(this.currentPageIndex, initialOffsetPercent);
            } else {
                this.scheduleVirtualization();
            }

            console.log(`[FolioReader] Loaded ${this.totalPages} pages successfully.`);
        } catch (err) {
            console.error('[FolioReader] Load error:', err);
            this.container.innerHTML = `<div class="folio-reader-error">Failed to load document: ${err.message}</div>`;
        }
    }

    formatOutline(rawOutline) {
        if (!rawOutline || !Array.isArray(rawOutline)) return [];

        const formatNode = (node) => {
            let pageIndex = 0;
            if (node.dest) {
                // If destination object has explicit target or page index
                if (Array.isArray(node.dest) && typeof node.dest[0] === 'object') {
                    // Ref resolved later if needed
                }
            }
            return {
                title: node.title || 'Untitled',
                pageIndex: pageIndex,
                destination: typeof node.dest === 'string' ? node.dest : null,
                children: (node.items || []).map(formatNode)
            };
        };

        return rawOutline.map(formatNode);
    }

    getEffectiveZoom() {
        if (this.zoom > 0) return this.zoom;
        if (!this.container || this.pages.length === 0) return 1.0;

        const containerWidth = this.container.clientWidth - 40; // padding
        const containerHeight = this.container.clientHeight - 40;
        const firstPage = this.pages[0].geometry;

        if (this.zoom === -1) {
            // Fit Width
            return Math.max(0.25, Math.min(4.0, containerWidth / firstPage.visibleWidth));
        } else if (this.zoom === -2) {
            // Fit Page
            const scaleW = containerWidth / firstPage.visibleWidth;
            const scaleH = containerHeight / firstPage.visibleHeight;
            return Math.max(0.25, Math.min(4.0, Math.min(scaleW, scaleH)));
        }
        return 1.0;
    }

    updateLayoutDisplay() {
        if (this.layoutMode === 'single') {
            this.pages.forEach((p, idx) => {
                p.container.style.display = idx === this.currentPageIndex ? 'block' : 'none';
            });
        } else {
            this.pages.forEach(p => {
                p.container.style.display = 'block';
            });
        }
        this.updatePageDimensions();
    }

    updatePageDimensions() {
        const scale = this.getEffectiveZoom();
        this.pages.forEach(p => {
            const rot = (p.geometry.rotation + this.rotation) % 360;
            const isSideways = (rot === 90 || rot === 270);
            const w = (isSideways ? p.geometry.pdfHeight : p.geometry.pdfWidth) * scale;
            const h = (isSideways ? p.geometry.pdfWidth : p.geometry.pdfHeight) * scale;

            p.container.style.width = `${w}px`;
            p.container.style.height = `${h}px`;
        });
    }

    handleScroll() {
        if (this.layoutMode === 'single') return;

        // Determine currently visible page and scroll offset
        const scrollTop = this.container.scrollTop;
        const containerHeight = this.container.clientHeight;
        const centerY = scrollTop + containerHeight / 3;

        for (let i = 0; i < this.pages.length; i++) {
            const p = this.pages[i];
            const top = p.container.offsetTop;
            const height = p.container.offsetHeight;

            if (centerY >= top && centerY <= top + height) {
                if (this.currentPageIndex !== i) {
                    this.currentPageIndex = i;
                }
                const offsetPercent = height > 0 ? Math.max(0, Math.min(1, (scrollTop - top) / height)) : 0;

                // Debounce telemetry dispatch to Blazor
                clearTimeout(this.scrollDebounceTimer);
                this.scrollDebounceTimer = setTimeout(() => {
                    if (this.dotNetHelper) {
                        this.dotNetHelper.invokeMethodAsync('OnPositionChanged', {
                            pageIndex: this.currentPageIndex,
                            offsetPercent: offsetPercent,
                            zoom: this.zoom
                        });
                    }
                }, 300);
                break;
            }
        }

        this.scheduleVirtualization();
    }

    scheduleVirtualization() {
        if (this.isDisposed || this.pages.length === 0) return;

        const effectiveScale = this.getEffectiveZoom();
        const buffer = 2; // Render +/- 2 pages around visible window

        let start = Math.max(0, this.currentPageIndex - buffer);
        let end = Math.min(this.pages.length - 1, this.currentPageIndex + buffer);

        if (this.layoutMode === 'single') {
            start = this.currentPageIndex;
            end = this.currentPageIndex;
        }

        for (let i = 0; i < this.pages.length; i++) {
            const p = this.pages[i];
            if (i >= start && i <= end) {
                if (!p.rendered && !p.rendering) {
                    this.renderPage(p, effectiveScale);
                }
            } else {
                // Recycle / detach canvas for offscreen pages
                if (p.rendered) {
                    this.recyclePage(p);
                }
            }
        }
    }

    async renderPage(page, scale) {
        if (page.rendering || this.isDisposed) return;
        page.rendering = true;

        try {
            const totalRotation = (page.geometry.rotation + this.rotation) % 360;
            const viewport = page.pageProxy.getViewport({ scale: scale, rotation: totalRotation });

            // Clear previous canvas
            page.canvasWrap.innerHTML = '';
            const canvas = document.createElement('canvas');
            const outputScale = window.devicePixelRatio || 1;

            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;

            const ctx = canvas.getContext('2d');
            ctx.scale(outputScale, outputScale);

            page.canvasWrap.appendChild(canvas);

            page.renderTask = page.pageProxy.render({
                canvasContext: ctx,
                viewport: viewport
            });

            await page.renderTask.promise;
            page.rendered = true;

            // Render Text Layer
            try {
                const textContent = await page.pageProxy.getTextContent();
                page.textLayer.innerHTML = '';
                page.textLayer.style.width = `${Math.floor(viewport.width)}px`;
                page.textLayer.style.height = `${Math.floor(viewport.height)}px`;

                if (pdfjsLib.TextLayer) {
                    const tl = new pdfjsLib.TextLayer({
                        textContentSource: textContent,
                        container: page.textLayer,
                        viewport: viewport
                    });
                    await tl.render();
                }
            } catch (tlErr) {
                console.warn(`[FolioReader] TextLayer render note for p.${page.pageNumber}:`, tlErr);
            }
        } catch (renderErr) {
            if (renderErr.name !== 'RenderingCancelledException') {
                console.error(`[FolioReader] Error rendering page ${page.pageNumber}:`, renderErr);
            }
        } finally {
            page.rendering = false;
            page.renderTask = null;
        }
    }

    recyclePage(page) {
        if (page.renderTask) {
            try { page.renderTask.cancel(); } catch { }
        }
        page.canvasWrap.innerHTML = '';
        page.textLayer.innerHTML = '';
        page.rendered = false;
        page.rendering = false;
        page.renderTask = null;
    }

    goToPage(pageIndex, offsetPercent = 0.0) {
        pageIndex = Math.max(0, Math.min(pageIndex, this.pages.length - 1));
        this.currentPageIndex = pageIndex;

        if (this.layoutMode === 'single') {
            this.updateLayoutDisplay();
            this.container.scrollTop = 0;
            this.scheduleVirtualization();
        } else {
            const page = this.pages[pageIndex];
            if (page && page.container) {
                const top = page.container.offsetTop;
                const height = page.container.offsetHeight;
                this.container.scrollTop = top + (height * offsetPercent);
                this.scheduleVirtualization();
            }
        }

        if (this.dotNetHelper) {
            this.dotNetHelper.invokeMethodAsync('OnPositionChanged', {
                pageIndex: this.currentPageIndex,
                offsetPercent: offsetPercent,
                zoom: this.zoom
            });
        }
    }

    setZoom(newZoom) {
        this.zoom = newZoom;
        this.pages.forEach(p => this.recyclePage(p));
        this.updatePageDimensions();
        this.scheduleVirtualization();
    }

    setFitWidth() {
        this.zoom = -1;
        this.pages.forEach(p => this.recyclePage(p));
        this.updatePageDimensions();
        this.scheduleVirtualization();
    }

    setFitPage() {
        this.zoom = -2;
        this.pages.forEach(p => this.recyclePage(p));
        this.updatePageDimensions();
        this.scheduleVirtualization();
    }

    setLayoutMode(mode) {
        if (this.layoutMode === mode) return;
        this.layoutMode = mode;
        this.pages.forEach(p => this.recyclePage(p));
        this.updateLayoutDisplay();
        this.goToPage(this.currentPageIndex, 0);
    }

    setRotation(degrees) {
        this.rotation = ((this.rotation + degrees) % 360 + 360) % 360;
        this.pages.forEach(p => this.recyclePage(p));
        this.updatePageDimensions();
        this.scheduleVirtualization();
    }

    handleTextSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

        const text = selection.toString().trim();
        if (!text) return;

        const range = selection.getRangeAt(0);
        // Find which page container holds this selection
        let node = range.commonAncestorContainer;
        while (node && !node.classList?.contains('folio-page-wrapper')) {
            node = node.parentElement;
        }

        if (node && node.dataset.pageIndex) {
            const pageIndex = parseInt(node.dataset.pageIndex, 10);
            const page = this.pages[pageIndex];
            const pageRect = node.getBoundingClientRect();
            const clientRects = range.getClientRects();

            const normalizedRects = [];
            for (let i = 0; i < clientRects.length; i++) {
                const r = clientRects[i];
                if (r.width <= 0 || r.height <= 0) continue;

                normalizedRects.push({
                    x: Math.max(0, Math.min(1, (r.left - pageRect.left) / pageRect.width)),
                    y: Math.max(0, Math.min(1, (r.top - pageRect.top) / pageRect.height)),
                    width: Math.min(1, r.width / pageRect.width),
                    height: Math.min(1, r.height / pageRect.height)
                });
            }

            if (this.dotNetHelper && normalizedRects.length > 0) {
                this.dotNetHelper.invokeMethodAsync('OnTextSelected', {
                    pageIndex: pageIndex,
                    selectedText: text,
                    rects: normalizedRects
                });
            }
        }
    }

    drawOverlays(pageIndex, rects, colorHex = '#FFE082') {
        const page = this.pages[pageIndex];
        if (!page || !page.overlayLayer) return;

        page.overlayLayer.innerHTML = '';
        rects.forEach(r => {
            const el = document.createElement('div');
            el.className = 'folio-highlight-overlay';
            el.style.left = `${r.x * 100}%`;
            el.style.top = `${r.y * 100}%`;
            el.style.width = `${r.width * 100}%`;
            el.style.height = `${r.height * 100}%`;
            el.style.backgroundColor = colorHex;
            page.overlayLayer.appendChild(el);
        });
    }

    clearOverlays(pageIndex) {
        const page = this.pages[pageIndex];
        if (page && page.overlayLayer) {
            page.overlayLayer.innerHTML = '';
        }
    }

    async search(query, forward = true) {
        if (!query || !this.pdfDoc) return;
        query = query.trim().toLowerCase();

        if (this.currentSearchQuery !== query) {
            this.currentSearchQuery = query;
            this.searchMatches = [];
            this.currentSearchMatchIndex = -1;

            // Search through text across all pages
            for (let i = 1; i <= this.totalPages; i++) {
                const p = await this.pdfDoc.getPage(i);
                const tc = await p.getTextContent();
                const str = tc.items.map(item => item.str).join(' ').toLowerCase();

                let pos = str.indexOf(query);
                while (pos !== -1) {
                    this.searchMatches.push({
                        pageIndex: i - 1,
                        charIndex: pos
                    });
                    pos = str.indexOf(query, pos + query.length);
                }
            }
        }

        if (this.searchMatches.length === 0) {
            if (this.dotNetHelper) {
                this.dotNetHelper.invokeMethodAsync('OnSearchMatch', {
                    currentMatch: 0,
                    totalMatches: 0,
                    pageIndex: this.currentPageIndex
                });
            }
            return;
        }

        if (forward) {
            this.currentSearchMatchIndex = (this.currentSearchMatchIndex + 1) % this.searchMatches.length;
        } else {
            this.currentSearchMatchIndex = (this.currentSearchMatchIndex - 1 + this.searchMatches.length) % this.searchMatches.length;
        }

        const match = this.searchMatches[this.currentSearchMatchIndex];
        this.goToPage(match.pageIndex, 0.0);

        if (this.dotNetHelper) {
            this.dotNetHelper.invokeMethodAsync('OnSearchMatch', {
                currentMatch: this.currentSearchMatchIndex + 1,
                totalMatches: this.searchMatches.length,
                pageIndex: match.pageIndex
            });
        }
    }

    clearSearch() {
        this.searchMatches = [];
        this.currentSearchMatchIndex = -1;
        this.currentSearchQuery = '';
    }

    handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (e.key === 'ArrowRight' || e.key === 'PageDown') {
            e.preventDefault();
            this.goToPage(this.currentPageIndex + 1, 0);
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
            e.preventDefault();
            this.goToPage(this.currentPageIndex - 1, 0);
        } else if (e.key === 'Home') {
            e.preventDefault();
            this.goToPage(0, 0);
        } else if (e.key === 'End') {
            e.preventDefault();
            this.goToPage(this.totalPages - 1, 0);
        }
    }

    dispose() {
        this.isDisposed = true;
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }
        this.pages.forEach(p => this.recyclePage(p));
        this.pages = [];
        this.pdfDoc = null;
    }
}

// Global instance attached to window for Blazor JS interop
window.folioReader = new FolioReaderEngine();
