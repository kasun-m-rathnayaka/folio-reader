window.folioShell = {
    applyPreferences(preferences) {
        const root = document.documentElement;
        root.dataset.theme = preferences.darkMode ? 'dark' : 'light';
        root.dataset.reducedMotion = preferences.reducedMotion ? 'true' : 'false';
        root.style.setProperty('--folio-font-scale', preferences.fontScale || 1);
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
window.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !window.folioReader?.pdfDoc) {
        const search = document.getElementById('folio-library-search');
        if (search) { event.preventDefault(); search.focus(); search.select(); }
    }
});
