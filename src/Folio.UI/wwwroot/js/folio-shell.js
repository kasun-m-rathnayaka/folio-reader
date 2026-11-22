window.folioShell = {
    applyPreferences(preferences) {
        const root = document.documentElement;
        root.dataset.theme = preferences.darkMode ? 'dark' : 'light';
        root.style.setProperty('--folio-font-scale', preferences.fontScale || 1);
        this.motionPreference = preferences.motion || 'system';
        this.applyMotion();
        root.dataset.libraryStyle = preferences.libraryStyle || '3d';
        window.chrome?.webview?.postMessage({ kind: 'theme-changed', darkMode: !!preferences.darkMode });
    },
    // SET-1: Full, Reduced or Off; "system" follows prefers-reduced-motion and keeps following it.
    applyMotion() {
        const query = matchMedia('(prefers-reduced-motion: reduce)');
        if (!this.motionQueryBound) { query.addEventListener('change', () => this.applyMotion()); this.motionQueryBound = true; }
        const level = this.motionPreference === 'system' || !this.motionPreference ? (query.matches ? 'reduced' : 'full') : this.motionPreference;
        document.documentElement.dataset.motion = level;
        return level;
    },
    // LIB-2: the marquee moves only when the featured book changes, never on its own.
    centerMarquee(container) {
        const current = container?.querySelector('.is-current');
        if (!current) return;
        const left = current.offsetLeft - (container.clientWidth - current.clientWidth) / 2;
        container.scrollTo({ left, behavior: this.motion === 'full' ? 'smooth' : 'instant' });
    },
    focusElement(id) { document.getElementById(id)?.focus({ preventScroll: true }); },
    setSceneKeyTarget(reference) { this.sceneKeyTarget = reference; },
    get motion() { return document.documentElement.dataset.motion || 'full'; },
    async waitFor(selector, timeout = 800) {
        const started = performance.now();
        while (performance.now() - started < timeout) {
            const element = document.querySelector(selector);
            if (element) return element;
            // Not requestAnimationFrame: rendering is paused inside a view transition's update callback.
            await new Promise(resolve => setTimeout(resolve, 16));
        }
        return null;
    },
    find(selector) {
        if (!selector) return null;
        return /^[.#\[]/.test(selector) ? document.querySelector(selector) : document.getElementById(selector);
    },
    // OPN-3: without the 3D stage, a same-document View Transition morphs the book into the reader page (and back).
    // Reduced motion keeps only the 150 ms root crossfade; Off, or a browser without View Transitions, cuts instantly.
    async navigateWithTransition(url, fromSelector, toSelector) {
        const navigate = () => window.Blazor.navigateTo(url);
        const level = this.motion;
        if (!document.startViewTransition || level === 'off') { navigate(); return; }
        const from = level === 'full' ? this.find(fromSelector) : null;
        if (from) from.style.viewTransitionName = 'folio-book';
        const transition = document.startViewTransition(async () => {
            if (from) from.style.viewTransitionName = '';
            navigate();
            const to = await this.waitFor(toSelector);
            if (from && to) to.style.viewTransitionName = 'folio-book';
        });
        transition.ready.catch(() => {});
        transition.finished.catch(() => {}).finally(() => document.querySelectorAll('[style*="view-transition-name"]').forEach(e => e.style.viewTransitionName = ''));
        await transition.updateCallbackDone.catch(() => {});
    },
    async colorModule() { return this._color ??= await import(new URL('_content/Folio.UI/js/folio-color.mjs', document.baseURI).href); },
    async dominantColor(url) {
        if (!url) return null;
        try {
            const image = new Image(); image.crossOrigin = 'anonymous'; image.src = url;
            await image.decode();
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
            const context = canvas.getContext('2d', { willReadFrequently: true });
            context.drawImage(image, 0, 0, 48, 48);
            return (await this.colorModule()).dominantColor(context.getImageData(0, 0, 48, 48).data);
        } catch { return null; }
    },
    observeGrid(helper) {
        this.disconnectGrid();
        const grid = document.getElementById('folio-library-grid');
        if (!grid) return;
        this.gridObserver = new ResizeObserver(entries => {
            const width = entries[0].contentRect.width;
            if (width > 0) helper.invokeMethodAsync('OnColumnsChanged', Math.max(1, Math.min(8, Math.floor((width + 20) / 170)))).catch(() => {});
        });
        this.gridObserver.observe(grid);
    },
    disconnectGrid() { this.gridObserver?.disconnect(); this.gridObserver = null; }
};
// Scene shortcuts (Enter, D, Space, Esc, arrows, 1–9, ?). Ignored while typing, inside dialogs and menus, in the reader,
// and for Enter/Space on a focused control so its own activation runs once.
window.addEventListener('keydown', event => {
    const target = window.folioShell.sceneKeyTarget;
    if (!target || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || window.folioReader?.pdfDoc) return;
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('input, textarea, select, [contenteditable="true"], .mud-dialog, .mud-popover-open, [role="menu"]')) return;
    const keys = ['Enter', 'Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '?', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    if (!keys.includes(event.key)) return;
    if (event.key === 'Enter' && element?.closest('button, a[href], [role="button"], summary')) return;
    if (event.key.startsWith('Arrow') && element?.closest('.folio-shelves-list, .folio-books-scroll') && !element.closest('button')) return;
    if (event.key.startsWith('Arrow')) event.preventDefault();
    target.invokeMethodAsync('OnSceneKey', event.key, event.shiftKey).catch(() => {});
});
window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !window.folioReader?.pdfDoc) {
        const search = document.getElementById('folio-library-search');
        if (search) { event.preventDefault(); search.focus(); search.select(); }
    }
});

// File objects cross the WebView boundary through WebView2's typed additionalObjects API.
document.addEventListener('dragover', event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; document.body.classList.add('folio-drop-active');
});
document.addEventListener('dragleave', event => { if (!event.relatedTarget) document.body.classList.remove('folio-drop-active'); });
document.addEventListener('drop', async event => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault(); document.body.classList.remove('folio-drop-active');
    const items = Array.from(event.dataTransfer.items), files = Array.from(event.dataTransfer.files);
    try {
        const handles = await Promise.all(items.map(item => item.getAsFileSystemHandle?.()));
        window.chrome?.webview?.postMessageWithAdditionalObjects({kind:'import-drop'}, handles.every(Boolean) ? handles : files);
    } catch { window.chrome?.webview?.postMessageWithAdditionalObjects({kind:'import-drop'}, files); }
});
