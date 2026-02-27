'use strict';

const { join, relative, isAbsolute } = require('path');

const PORT      = parseInt(process.env.PORT || '8080', 10);
const publicDir = join(__dirname, 'public');

/** Minimal MIME map for the assets this project serves. */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.ttf':  'font/ttf',
  '.obj':  'model/obj',
  '.mtl':  'model/mtl',
  '.gltf': 'model/gltf+json',
  '.bin':  'application/octet-stream',
};

/**
 * Extensions that benefit from gzip on-the-fly compression.
 * Binary image/font formats are already compressed, so we skip them.
 */
const GZIP_EXTS = new Set(['.html', '.css', '.js', '.json', '.svg', '.obj', '.mtl', '.gltf']);

function mimeFor(filePath) {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  return MIME[ext] || 'application/octet-stream';
}

/** Resolve a URL pathname to a safe absolute file path, or null if outside publicDir. */
function resolveSafe(pathname) {
  const resolved = join(publicDir, pathname);
  const rel      = relative(publicDir, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return resolved;
}

// ─── Bun ─────────────────────────────────────────────────────────────────────
if (typeof Bun !== 'undefined') {
  Bun.serve({
    port: PORT,

    async fetch(req) {
      const url      = new URL(req.url);
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      const resolved = resolveSafe(pathname);

      if (!resolved) return new Response('Forbidden', { status: 403 });

      const file = Bun.file(resolved);
      if (!(await file.exists())) {
        // SPA fallback — serve index.html for unknown paths
        return new Response(Bun.file(join(publicDir, 'index.html')), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }

      return new Response(file, {
        headers: { 'Content-Type': mimeFor(resolved) },
      });
    },

    error(err) {
      return new Response('Internal Server Error: ' + err.message, { status: 500 });
    },
  });

  console.log(`Tactics Bell (Bun) running on http://localhost:${PORT}`);

// ─── Node.js ──────────────────────────────────────────────────────────────────
} else {
  const http  = require('http');
  const fs    = require('fs');
  const zlib  = require('zlib');

  const server = http.createServer((req, res) => {
    try {
      const url      = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      const resolved = resolveSafe(pathname);

      if (!resolved) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      // Try the requested file; fall back to index.html for unknown paths (SPA)
      const filePath = fs.existsSync(resolved) ? resolved : join(publicDir, 'index.html');
      const ext      = filePath.slice(filePath.lastIndexOf('.'));
      const mime     = mimeFor(filePath);

      // Async read — does not block the event loop
      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Internal Server Error');
          return;
        }

        // On-the-fly gzip compression for text and model assets.
        // Only compress if the client signals Accept-Encoding: gzip.
        const acceptsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
        if (acceptsGzip && GZIP_EXTS.has(ext)) {
          zlib.gzip(content, (gzErr, compressed) => {
            if (gzErr) {
              // Compression failed — fall back to uncompressed
              res.writeHead(200, { 'Content-Type': mime });
              res.end(content);
              return;
            }
            res.writeHead(200, {
              'Content-Type':     mime,
              'Content-Encoding': 'gzip',
              'Content-Length':   compressed.length,
            });
            res.end(compressed);
          });
        } else {
          res.writeHead(200, { 'Content-Type': mime });
          res.end(content);
        }
      });
    } catch (err) {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  });

  server.listen(PORT, () => {
    console.log(`Tactics Bell (Node) running on http://localhost:${PORT}`);
  });
}

