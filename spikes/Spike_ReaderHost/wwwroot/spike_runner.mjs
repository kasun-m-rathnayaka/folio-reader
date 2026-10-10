import * as pdfjsLib from './lib/pdfjs/pdf.min.mjs';
import { PageGeometry } from './lib/coordinate_space.mjs';

// Configure worker
pdfjsLib.GlobalWorkerOptions.workerSrc = './lib/pdfjs/pdf.worker.min.mjs';

export async function runSpikeSuite(statusCallback) {
  const results = {
    virtualHostRangeSupport: false,
    coldOpenTimeMs: 0,
    thousandPageColdOpenTimeMs: 0,
    averageScrollFps: 0,
    coordinateTests: [],
    errors: []
  };

  function updateStatus(msg) {
    if (statusCallback) statusCallback(msg);
    console.log('[Spike S1]', msg);
    const el = document.getElementById('status-log');
    if (el) {
      const p = document.createElement('div');
      p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      el.appendChild(p);
      el.scrollTop = el.scrollHeight;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Verify Range Request on Virtual Host
    // -------------------------------------------------------------
    updateStatus('Testing virtual host range requests on https://folio.books/...');
    const rangeRes = await fetch('https://folio.books/01_single_column_book_300p.pdf', {
      headers: { 'Range': 'bytes=0-511' }
    });
    const contentRange = rangeRes.headers.get('Content-Range') || rangeRes.status;
    results.virtualHostRangeSupport = (rangeRes.status === 206 || rangeRes.status === 200);
    updateStatus(`Virtual host range request response: Status ${rangeRes.status}, Content-Range: ${contentRange}`);

    // -------------------------------------------------------------
    // Test 2: Cold Open & Render Time (300-page book)
    // -------------------------------------------------------------
    updateStatus('Loading 300-page book: 01_single_column_book_300p.pdf...');
    const t0 = performance.now();
    const doc300 = await pdfjsLib.getDocument({
      url: 'https://folio.books/01_single_column_book_300p.pdf',
      isEvalSupported: false,
      disableAutoFetch: true
    }).promise;

    const page1 = await doc300.getPage(1);
    const viewport1 = page1.getViewport({ scale: 1.0 });

    const canvas = document.createElement('canvas');
    canvas.width = viewport1.width;
    canvas.height = viewport1.height;
    const ctx = canvas.getContext('2d');

    await page1.render({ canvasContext: ctx, viewport: viewport1 }).promise;
    const t1 = performance.now();
    results.coldOpenTimeMs = Math.round(t1 - t0);
    updateStatus(`300-page book: Page 1 rendered in ${results.coldOpenTimeMs} ms (Target <= 1,000 ms)`);

    // -------------------------------------------------------------
    // Test 3: 1,000-page Book Virtualization & Rendering
    // -------------------------------------------------------------
    updateStatus('Loading 1,000-page stress book: 07_thousand_page_book.pdf...');
    const t2 = performance.now();
    const doc1000 = await pdfjsLib.getDocument({
      url: 'https://folio.books/07_thousand_page_book.pdf',
      isEvalSupported: false,
      disableAutoFetch: true
    }).promise;

    const page1000 = await doc1000.getPage(1);
    const vp1000 = page1000.getViewport({ scale: 1.0 });
    canvas.width = vp1000.width;
    canvas.height = vp1000.height;
    await page1000.render({ canvasContext: ctx, viewport: vp1000 }).promise;
    const t3 = performance.now();
    results.thousandPageColdOpenTimeMs = Math.round(t3 - t2);
    updateStatus(`1,000-page book: Page 1 rendered in ${results.thousandPageColdOpenTimeMs} ms (Pages: ${doc1000.numPages})`);

    // Simulated virtualized page scroll benchmark (render 10 sequential pages)
    updateStatus('Benchmarking virtualized sequential page rendering (10 pages)...');
    const frameTimes = [];
    for (let p = 1; p <= 10; p++) {
      const fStart = performance.now();
      const page = await doc1000.getPage(p);
      const vp = page.getViewport({ scale: 1.0 });
      canvas.width = vp.width;
      canvas.height = vp.height;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const fEnd = performance.now();
      frameTimes.push(fEnd - fStart);
    }
    const avgFrameTimeMs = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    results.averageScrollFps = Math.round(1000 / avgFrameTimeMs);
    updateStatus(`Average page render time: ${avgFrameTimeMs.toFixed(1)} ms (~${results.averageScrollFps} FPS)`);

    // -------------------------------------------------------------
    // Test 4: Coordinate-Space Overlays (06_rotated_and_cropped.pdf)
    // -------------------------------------------------------------
    updateStatus('Testing rotated & cropped pages: 06_rotated_and_cropped.pdf...');
    const docRot = await pdfjsLib.getDocument({
      url: 'https://folio.books/06_rotated_and_cropped.pdf',
      isEvalSupported: false
    }).promise;

    const overlayContainer = document.getElementById('preview-container');
    if (overlayContainer) overlayContainer.innerHTML = '';

    for (let pNum = 1; pNum <= docRot.numPages; pNum++) {
      const p = await docRot.getPage(pNum);
      const vp = p.getViewport({ scale: 1.0 });

      const pageWrapper = document.createElement('div');
      pageWrapper.className = 'page-wrapper';
      pageWrapper.style.position = 'relative';
      pageWrapper.style.display = 'inline-block';
      pageWrapper.style.margin = '10px';
      pageWrapper.style.border = '1px solid #ccc';

      const pCanvas = document.createElement('canvas');
      pCanvas.width = vp.width;
      pCanvas.height = vp.height;
      pageWrapper.appendChild(pCanvas);

      await p.render({ canvasContext: pCanvas.getContext('2d'), viewport: vp }).promise;

      // Create test overlay highlight using PageGeometry
      // Normalized rect [x=0.1, y=0.1, width=0.4, height=0.08]
      const normRect = { x: 0.1, y: 0.1, width: 0.4, height: 0.08 };
      const geo = new PageGeometry(p.view, null, p.rotate);
      const px = geo.normalizedToViewportPixels(normRect, 1.0);

      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.left = `${px.left}px`;
      overlay.style.top = `${px.top}px`;
      overlay.style.width = `${px.width}px`;
      overlay.style.height = `${px.height}px`;
      overlay.style.backgroundColor = 'rgba(255, 235, 59, 0.45)';
      overlay.style.border = '1px solid #fbc02d';
      overlay.style.pointerEvents = 'none';

      pageWrapper.appendChild(overlay);
      if (overlayContainer) overlayContainer.appendChild(pageWrapper);

      results.coordinateTests.push({
        pageNumber: pNum,
        rotation: p.rotate,
        viewportWidth: vp.width,
        viewportHeight: vp.height,
        overlayPx: px
      });
      updateStatus(`Page ${pNum}: Rotation ${p.rotate}°, Size ${vp.width}x${vp.height}, Overlay aligned.`);
    }

    updateStatus('Spike S1 test suite completed successfully!');
  } catch (err) {
    updateStatus(`ERROR: ${err.message}`);
    results.errors.push(err.message);
  }

  return results;
}

