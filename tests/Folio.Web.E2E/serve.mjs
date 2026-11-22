import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(process.argv[2]); const port = Number(process.argv[3] || 5080);
const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json','.dll':'application/octet-stream','.dat':'application/octet-stream','.woff2':'font/woff2','.svg':'image/svg+xml'};
createServer(async (req, res) => {
  let path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!path.startsWith(root)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html'); }
  catch { if (!extname(path)) path = resolve(root, 'index.html'); }
  try { const body = await readFile(path); res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream'}); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log('listening', port));
