window.folioShell = {
    applyPreferences(preferences) {
        const root = document.documentElement;
        root.dataset.theme = preferences.darkMode ? 'dark' : 'light';
        root.style.setProperty('--folio-font-scale', preferences.fontScale || 1);
        window.chrome?.webview?.postMessage({ kind: 'theme-changed', darkMode: !!preferences.darkMode });
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
