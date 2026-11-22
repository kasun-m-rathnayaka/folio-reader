import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.FOLIO_PLAYWRIGHT_PATH || require.resolve('playwright', { paths: [resolve(root, 'src/Folio.UI')] }));
const artifacts = resolve(root, '.artifacts/reader-tests');
await mkdir(artifacts, { recursive:true });
const errors = [], results = [];
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/favicon.ico') { response.writeHead(204);response.end();return; }
    if (url.pathname === '/original.pdf' && process.env.FOLIO_ORIGINAL_PDF) {
      response.setHeader('Content-Type','application/pdf');response.end(await readFile(process.env.FOLIO_ORIGINAL_PDF));return;
    }
    if (url.pathname === '/') {
      response.setHeader('Content-Type','text/html');
      response.end(`<!doctype html><html><head><link rel="stylesheet" href="/lib/pdfjs/pdf_viewer.css"><link rel="stylesheet" href="/css/m3-tokens.css"><link rel="stylesheet" href="/css/folio-reader.css"></head><body><div class="folio-reader"><div class="folio-reader-workspace"><div class="folio-reader-viewport"><div id="reader"></div></div></div></div><script>window.events=[];window.helper={invokeMethodAsync:async(method,data)=>{window.events.push({method,data});}};</script><script type="module" src="/js/folio-reader.js"></script></body></html>`);
      return;
    }
    const base = url.pathname.startsWith('/fixtures/') ? resolve(root,'fixtures/pdf') : resolve(root,'src/Folio.UI/wwwroot');
    const relative = url.pathname.startsWith('/fixtures/') ? url.pathname.slice('/fixtures/'.length) : url.pathname.slice(1);
    const path = resolve(base, decodeURIComponent(relative));
    if (!path.startsWith(base + '/'.replace('/',process.platform === 'win32' ? '\\' : '/'))) { response.writeHead(403);response.end();return; }
    const types = {'.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.pdf':'application/pdf'};
    response.setHeader('Content-Type',types[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({ headless:true, ...(process.env.FOLIO_BROWSER_PATH ? {executablePath:process.env.FOLIO_BROWSER_PATH} : {channel:'msedge'}) });
try {
  const page = await browser.newPage({ viewport:{width:1200,height:850} });
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('console',message=>{ if(message.type()==='error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(()=>!!window.folioReader);
  const start=Date.now();
  await page.evaluate(async()=>{ window.folioReader.init('reader',window.helper); await window.folioReader.loadDocument('/fixtures/01_single_column_book_300p.pdf',0,0,1,'continuous'); });
  await page.waitForFunction(()=>window.events.some(e=>e.method==='OnDocumentLoaded'));
  assert.equal(await page.evaluate(()=>window.folioReader.pdfDoc.numPages),300);
  results.push({scenario:'300-page PDF opens and renders text',passed:true,engineOpenMs:Date.now()-start});

  await page.evaluate(()=>{
    const span=Array.from(document.querySelectorAll('[data-page-index="0"] .textLayer span')).find(s=>s.textContent.startsWith('In a world'));
    if(!span)throw new Error('Body text layer missing');
    const range=document.createRange();range.selectNodeContents(span);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    span.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.waitForFunction(()=>window.events.some(e=>e.method==='OnTextSelected'));
  const selected=await page.evaluate(()=>window.events.filter(e=>e.method==='OnTextSelected').at(-1).data);
  assert.equal(selected.pageIndex,0);assert.ok(selected.selectedText.startsWith('In a world'));assert.ok(selected.rects.length>0);
  await page.evaluate(selection=>window.folioReader.drawAnnotations(0,[
    {id:'verification-highlight',type:'Highlight',colorHex:'#FFEB3B',rects:selection.rects},
    {id:'verification-underline',type:'Underline',colorHex:'#64B5F6',rects:selection.rects}
  ]),selected);
  const alignment=await page.evaluate(()=>{
    const range=window.getSelection().getRangeAt(0).getBoundingClientRect();const overlay=document.querySelector('.folio-annotation-item').getBoundingClientRect();
    return {left:Math.abs(range.left-overlay.left),top:Math.abs(range.top-overlay.top),width:Math.abs(range.width-overlay.width)};
  });
  assert.ok(alignment.left<1 && alignment.top<1 && alignment.width<1,JSON.stringify(alignment));
  results.push({scenario:'Selection events and highlight geometry align with the text layer',passed:true,alignment});
  await page.screenshot({path:resolve(artifacts,'highlight-alignment.png')});

  await page.evaluate(()=>{window.getSelection().removeAllRanges();window.folioReader.setRotation(90);});
  await page.waitForFunction(()=>window.folioReader.engine.pages[0].rendered);
  const rotated=await page.evaluate(()=>{ const p=window.folioReader.engine.pages[0];const r=p.annotations[0].rects[0],el=p.overlayLayer.querySelector('.folio-annotation-item');return {left:parseFloat(el.style.left),expected:(1-r.y-r.height)*100}; });
  assert.ok(Math.abs(rotated.left-rotated.expected)<.001,JSON.stringify(rotated));
  const underlineEdge=await page.evaluate(()=>document.querySelector('[data-annotation-id="verification-underline"]').style.borderLeftWidth);
  assert.equal(underlineEdge,'2px');
  results.push({scenario:'Highlights and underlines rotate with the page',passed:true});

  await page.evaluate(()=>{window.folioReader.setRotation(270);window.folioReader.goToPage(299);});
  await page.waitForFunction(()=>window.events.some(e=>e.method==='OnPositionChanged'&&e.data.pageIndex===299));
  await page.waitForFunction(()=>window.folioReader.engine.pages[299].rendered);
  const canvases=await page.locator('.folio-canvas-layer canvas').count();assert.ok(canvases<=4,`Retained ${canvases} canvases`);
  results.push({scenario:'Last-page navigation retains a bounded canvas window',passed:true,canvases});

  await page.evaluate(async()=>await window.folioReader.search('Paragraph 15.1'));
  const match=await page.evaluate(()=>window.events.filter(e=>e.method==='OnSearchMatch').at(-1).data);
  assert.equal(match.totalMatches,1);assert.equal(match.pageIndex,14);
  results.push({scenario:'Find-in-book resolves a unique match to the right page',passed:true});
  await page.evaluate(async()=>{await window.folioReader.dispose();window.folioReader.init('reader',window.helper);await window.folioReader.loadDocument('/fixtures/06_rotated_and_cropped.pdf');});
  assert.equal(await page.evaluate(()=>window.folioReader.pdfDoc.numPages),4);
  await page.evaluate(async()=>await window.folioReader.dispose());
  assert.equal(await page.locator('.folio-page-wrapper').count(),0);
  results.push({scenario:'Dispose and reopen release the previous document',passed:true});
  if (process.env.FOLIO_ORIGINAL_PDF) {
    await page.evaluate(async()=>{window.folioReader.init('reader',window.helper);await window.folioReader.loadDocument('/original.pdf');});
    await page.evaluate(()=>window.folioReader.goToPage(1));
    await page.waitForFunction(()=>window.folioReader.engine.pages[1].rendered);
    await page.evaluate(()=>window.folioReader.goToPage(2));
    await page.waitForFunction(()=>window.folioReader.engine.pages[2].rendered);
    results.push({scenario:'Existing-library PDF renders its first three pages',passed:true});
    await page.evaluate(async()=>await window.folioReader.dispose());
  }
  await page.evaluate(async()=>{
    window.folioReader.init('reader',window.helper);
    await window.folioReader.loadDocument('/fixtures/04_scanned_book.pdf');
  });
  await page.waitForFunction(()=>window.folioReader.engine.pages[0].rendered);
  await page.evaluate(async()=>await window.folioReader.search('needle'));
  const scannedMatch=await page.evaluate(()=>window.events.filter(e=>e.method==='OnSearchMatch').at(-1).data);
  assert.equal(scannedMatch.totalMatches,0);
  assert.equal(await page.evaluate(()=>window.events.some(e=>e.method==='OnOcrPageRequested')),false);
  results.push({scenario:'Scanned PDF without a text layer renders and finds nothing, with no OCR request',passed:true});
  await page.evaluate(async()=>await window.folioReader.dispose());
  assert.deepEqual(errors,[],'Unexpected browser errors');
  console.log(JSON.stringify(results,null,2));
} finally {
  await writeFile(resolve(artifacts,'results.json'),JSON.stringify({results,errors},null,2));
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
