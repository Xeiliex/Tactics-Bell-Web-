'use strict';

const { join, relative, isAbsolute } = require('path');

// ─── WebSocket room management (shared between Bun and Node runtimes) ─────────

/** Active multiplayer rooms.  Key = 4-char room code; value = { players: [ws0, ws1] } */
const rooms = {};

function _generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function _wsSend(ws, msg) {
  const str = JSON.stringify(msg);
  try {
    if (typeof Bun !== 'undefined') {
      ws.send(str);
    } else {
      if (ws.readyState === 1 /* OPEN */) ws.send(str);
    }
  } catch (_) { /* ignore closed sockets */ }
}

function _handleWsMessage(ws, rawMsg) {
  let msg;
  try { msg = JSON.parse(rawMsg); } catch (_) { return; }

  switch (msg.type) {
    case 'create_room': {
      let code, attempts = 0;
      do { code = _generateRoomCode(); attempts++; } while (rooms[code] && attempts < 200);
      if (attempts >= 200) {
        _wsSend(ws, { type: 'error', message: 'Server is full — please try again.' });
        return;
      }
      rooms[code] = { players: [ws, null] };
      ws._roomCode   = code;
      ws._playerIdx  = 0;
      _wsSend(ws, { type: 'room_created', code });
      break;
    }

    case 'join_room': {
      const code = (msg.code || '').toString().toUpperCase().trim();
      const room = rooms[code];
      if (!room) {
        _wsSend(ws, { type: 'error', message: 'Room not found.' });
        return;
      }
      if (room.players[1]) {
        _wsSend(ws, { type: 'error', message: 'Room is already full.' });
        return;
      }
      room.players[1] = ws;
      ws._roomCode  = code;
      ws._playerIdx = 1;
      _wsSend(ws, { type: 'room_joined', playerIdx: 1 });
      _wsSend(room.players[0], { type: 'opponent_joined' });
      break;
    }

    // Messages that are simply relayed to the other player in the same room.
    case 'game_start':
    case 'action':
    case 'game_over': {
      const room = ws._roomCode ? rooms[ws._roomCode] : null;
      if (!room) return;
      const otherIdx = ws._playerIdx === 0 ? 1 : 0;
      const other    = room.players[otherIdx];
      if (other) _wsSend(other, msg);
      break;
    }

    default: break;
  }
}

function _handleWsClose(ws) {
  const code = ws._roomCode;
  if (!code) return;
  const room = rooms[code];
  if (!room) return;
  const otherIdx = ws._playerIdx === 0 ? 1 : 0;
  const other    = room.players[otherIdx];
  if (other) _wsSend(other, { type: 'opponent_left' });
  delete rooms[code];
}

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

    websocket: {
      open(ws)         { /* nothing on open */ },
      message(ws, msg) { _handleWsMessage(ws, msg); },
      close(ws)        { _handleWsClose(ws); },
    },

    async fetch(req, server) {
      const url      = new URL(req.url);
      const pathname = url.pathname;

      // WebSocket upgrade for /ws
      if (pathname === '/ws' && req.headers.get('upgrade') === 'websocket') {
        const ok = server.upgrade(req);
        if (ok) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      const filePath = pathname === '/' ? '/index.html' : pathname;
      const resolved = resolveSafe(filePath);

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

  // Attach WebSocket server to the existing HTTP server using the `ws` package.
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    ws.on('message', (raw) => _handleWsMessage(ws, raw.toString()));
    ws.on('close',   ()    => _handleWsClose(ws));
    ws.on('error',   ()    => { /* swallow errors on individual sockets */ });
  });

  server.listen(PORT, () => {
    console.log(`Tactics Bell (Node) running on http://localhost:${PORT}`);
  });
}

