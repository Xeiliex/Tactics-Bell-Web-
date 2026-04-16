'use strict';

const { join, relative, isAbsolute } = require('path');
const crypto = require('crypto');
const fs = require('fs');

const MAX_SAVE_SIZE_BYTES = 512 * 1024;
const MAX_JSON_BODY_BYTES = 1024 * 1024;
const SAVE_STORE_DIR = join(__dirname, 'data', 'saves');
const ROOM_TTL_MS = 5 * 60 * 1000;
const ROOMS_PER_MINUTE = 10;

// ─── SSO session & cloud-save storage ─────────────────────────────────────────

/**
 * Active sessions.
 * Key = 32-byte hex token (set as HttpOnly cookie `tb_session`).
 * Value = { userId, email, name, picture }
 */
const sessions = {};

/**
 * Server-side save states, one blob per authenticated user.
 * Key = Google userId (the `sub` claim from the ID token).
 * Value = Base64-encoded save string (same format as localStorage).
 *
 * Saves are mirrored to disk under data/saves/ so restarts do not lose progress.
 */
const cloudSaves = {};

/** Per-client room creation timestamps used for rate limiting. */
const roomCreateBuckets = {};

function _saveFilePathForUser(userId) {
  const idHash = crypto.createHash('sha256').update(String(userId)).digest('hex');
  return join(SAVE_STORE_DIR, idHash + '.json');
}

function _ensureSaveDir() {
  if (!fs.existsSync(SAVE_STORE_DIR)) fs.mkdirSync(SAVE_STORE_DIR, { recursive: true });
}

function _persistCloudSave(userId, saveBlob) {
  try {
    _ensureSaveDir();
    fs.writeFileSync(
      _saveFilePathForUser(userId),
      JSON.stringify({ userId: String(userId), save: saveBlob }),
      'utf8'
    );
  } catch (err) {
    console.error('Failed to persist cloud save:', err && err.message ? err.message : err);
  }
}

function _loadCloudSaves() {
  try {
    _ensureSaveDir();
    const files = fs.readdirSync(SAVE_STORE_DIR);
    files.forEach(function (name) {
      if (!name.endsWith('.json')) return;
      try {
        const raw = fs.readFileSync(join(SAVE_STORE_DIR, name), 'utf8');
        const data = JSON.parse(raw);
        if (!data || typeof data.userId !== 'string' || typeof data.save !== 'string') return;
        cloudSaves[data.userId] = data.save;
      } catch (_) {
        // Ignore malformed save files so one bad file doesn't block startup.
      }
    });
  } catch (err) {
    console.error('Failed to load cloud saves:', err && err.message ? err.message : err);
  }
}

function _clientKeyForSocket(ws) {
  if (ws && ws._clientIp) return String(ws._clientIp);
  if (ws && ws.data && ws.data.ip) return String(ws.data.ip);
  return 'unknown';
}

function _canCreateRoom(ws) {
  const key = _clientKeyForSocket(ws);
  const now = Date.now();
  const bucket = roomCreateBuckets[key] || [];
  const recent = bucket.filter(function (ts) { return now - ts < 60 * 1000; });
  if (recent.length >= ROOMS_PER_MINUTE) {
    roomCreateBuckets[key] = recent;
    return false;
  }
  recent.push(now);
  roomCreateBuckets[key] = recent;
  return true;
}

function _extractForwardedIp(forwardedForHeader) {
  if (!forwardedForHeader) return 'unknown';
  const first = String(forwardedForHeader).split(',')[0].trim();
  return first || 'unknown';
}

_loadCloudSaves();

/** Parse a raw Cookie header into a { key: value } map. */
function _parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(function (pair) {
    const idx = pair.indexOf('=');
    if (idx < 0) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch (_) { out[k] = v; }
  });
  return out;
}

/** Return true if a request arrived over a secure (HTTPS) connection. */
function _isSecureRequest(req) {
  // Bun Request exposes a full URL; Node IncomingMessage uses req.socket.
  const proto = (typeof req.headers.get === 'function')
    ? new URL(req.url).protocol
    : (req.headers['x-forwarded-proto'] || (req.socket && req.socket.encrypted ? 'https:' : 'http:'));
  return proto === 'https:' || proto === 'https';
}

/** Extract the session object from a request (Bun Request or Node IncomingMessage). */
function _getSession(req) {
  const cookieHeader = (typeof req.headers.get === 'function')
    ? req.headers.get('cookie')
    : req.headers['cookie'];
  const token = _parseCookies(cookieHeader || '').tb_session;
  return token ? (sessions[token] || null) : null;
}

/**
 * Verify a Google ID token using Google's public tokeninfo endpoint.
 * Returns { userId, email, name, picture } on success, null on failure.
 */
async function _verifyGoogleToken(credential) {
  try {
    const res = await fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential)
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.sub) return null;
    // Validate that the token was issued for our app when a client ID is configured.
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (clientId && data.aud !== clientId) return null;
    return {
      userId:  data.sub,
      email:   data.email   || '',
      name:    data.name    || data.email || '',
      picture: data.picture || '',
    };
  } catch (_) {
    return null;
  }
}

/**
 * Handle all /api/* routes.
 * Returns { status, headers?, body } when matched, null otherwise.
 */
async function _handleApiRequest(req, pathname, body) {
  // ── GET /api/config — public configuration for the front-end ──────────────
  if (pathname === '/api/config' && req.method === 'GET') {
    return {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' }),
    };
  }

  // ── POST /api/auth/google — exchange a Google credential for a session ─────
  if (pathname === '/api/auth/google' && req.method === 'POST') {
    const credential = body && body.credential;
    if (!credential || typeof credential !== 'string') {
      return { status: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing credential' }) };
    }
    const user = await _verifyGoogleToken(credential);
    if (!user) {
      return { status: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid or expired Google token' }) };
    }
    const token = crypto.randomBytes(32).toString('hex');
    sessions[token] = user;
    const secure = _isSecureRequest(req) ? '; Secure' : '';
    return {
      status:  200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie':   `tb_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`,
      },
      body: JSON.stringify({ user: { email: user.email, name: user.name, picture: user.picture } }),
    };
  }

  // ── POST /api/auth/logout ──────────────────────────────────────────────────
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const cookieHeader = (typeof req.headers.get === 'function')
      ? req.headers.get('cookie')
      : req.headers['cookie'];
    const token = _parseCookies(cookieHeader || '').tb_session;
    if (token) delete sessions[token];
    const secure = _isSecureRequest(req) ? '; Secure' : '';
    return {
      status:  200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie':   `tb_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
      },
      body: JSON.stringify({ ok: true }),
    };
  }

  // ── GET /api/auth/me — return current session user (or null) ──────────────
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const session = _getSession(req);
    return {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user: session ? { email: session.email, name: session.name, picture: session.picture } : null,
      }),
    };
  }

  // ── GET /api/save — fetch the cloud save for the current user ─────────────
  if (pathname === '/api/save' && req.method === 'GET') {
    const session = _getSession(req);
    if (!session) {
      return { status: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    return {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ save: cloudSaves[session.userId] || null }),
    };
  }

  // ── POST /api/save — persist the cloud save for the current user ──────────
  if (pathname === '/api/save' && req.method === 'POST') {
    const session = _getSession(req);
    if (!session) {
      return { status: 401, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    if (!body || typeof body.save !== 'string') {
      return { status: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid save data' }) };
    }
    if (Buffer.byteLength(body.save, 'utf8') > MAX_SAVE_SIZE_BYTES) {
      return { status: 413, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Save too large' }) };
    }
    cloudSaves[session.userId] = body.save;
    _persistCloudSave(session.userId, body.save);
    return {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ok: true }),
    };
  }

  return null; // not an API route
}

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
      if (!_canCreateRoom(ws)) {
        _wsSend(ws, { type: 'error', message: 'Too many rooms created. Please wait a minute and try again.' });
        return;
      }
      let code, attempts = 0;
      do { code = _generateRoomCode(); attempts++; } while (rooms[code] && attempts < 200);
      if (attempts >= 200) {
        _wsSend(ws, { type: 'error', message: 'Server is full — please try again.' });
        return;
      }
      rooms[code] = { players: [ws, null], createdAt: Date.now() };
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

const roomMaintenanceTimer = setInterval(function () {
  const now = Date.now();

  Object.keys(rooms).forEach(function (code) {
    const room = rooms[code];
    if (!room) return;
    // Expire unpaired rooms to avoid unbounded room growth.
    if (!room.players[1] && room.createdAt && (now - room.createdAt > ROOM_TTL_MS)) {
      delete rooms[code];
    }
  });

  Object.keys(roomCreateBuckets).forEach(function (key) {
    const recent = roomCreateBuckets[key].filter(function (ts) { return now - ts < 60 * 1000; });
    if (recent.length) roomCreateBuckets[key] = recent;
    else delete roomCreateBuckets[key];
  });
}, 30 * 1000);

if (typeof roomMaintenanceTimer.unref === 'function') roomMaintenanceTimer.unref();

const PORT      = parseInt(process.env.PORT || '8003', 10);
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
      open(ws)         { ws._clientIp = (ws.data && ws.data.ip) || 'unknown'; },
      message(ws, msg) { _handleWsMessage(ws, msg); },
      close(ws)        { _handleWsClose(ws); },
    },

    async fetch(req, server) {
      const url      = new URL(req.url);
      const pathname = url.pathname;

      // WebSocket upgrade for /ws
      if (pathname === '/ws' && req.headers.get('upgrade') === 'websocket') {
        const ok = server.upgrade(req, {
          data: { ip: _extractForwardedIp(req.headers.get('x-forwarded-for')) },
        });
        if (ok) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      // API routes
      if (pathname.startsWith('/api/')) {
        let body = null;
        if (req.method !== 'GET') {
          const cl = parseInt(req.headers.get('content-length') || '0', 10);
          if (Number.isFinite(cl) && cl > MAX_JSON_BODY_BYTES) {
            return new Response(JSON.stringify({ error: 'Payload too large' }), {
              status: 413,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          const ct = req.headers.get('content-type') || '';
          if (ct.includes('application/json')) {
            try {
              const raw = await req.text();
              if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_BODY_BYTES) {
                return new Response(JSON.stringify({ error: 'Payload too large' }), {
                  status: 413,
                  headers: { 'Content-Type': 'application/json' },
                });
              }
              body = JSON.parse(raw);
            } catch (_) {}
          }
        }
        const result = await _handleApiRequest(req, pathname, body);
        if (result) {
          return new Response(result.body || '', {
            status:  result.status || 200,
            headers: result.headers || {},
          });
        }
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
  const zlib  = require('zlib');

  const server = http.createServer(async (req, res) => {
    try {
      const url      = new URL(req.url, `http://localhost:${PORT}`);
      const pathname = url.pathname;

      // API routes
      if (pathname.startsWith('/api/')) {
        let body = null;
        if (req.method !== 'GET') {
          const cl = parseInt(req.headers['content-length'] || '0', 10);
          if (Number.isFinite(cl) && cl > MAX_JSON_BODY_BYTES) {
            res.writeHead(413, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Payload too large' }));
            return;
          }
          const ct = req.headers['content-type'] || '';
          if (ct.includes('application/json')) {
            body = await new Promise(function (resolve) {
              let raw = '';
              let bytes = 0;
              let tooLarge = false;
              req.on('data', function (chunk) {
                if (tooLarge) return;
                bytes += chunk.length;
                if (bytes > MAX_JSON_BODY_BYTES) {
                  tooLarge = true;
                  return;
                }
                raw += chunk;
              });
              req.on('end',  function () {
                if (tooLarge) {
                  resolve('__payload_too_large__');
                  return;
                }
                try { resolve(JSON.parse(raw)); } catch (_) { resolve(null); }
              });
            });
            if (body === '__payload_too_large__') {
              res.writeHead(413, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Payload too large' }));
              return;
            }
          }
        }
        const result = await _handleApiRequest(req, pathname, body);
        if (result) {
          res.writeHead(result.status || 200, result.headers || {});
          res.end(result.body || '');
          return;
        }
      }

      const resolvedPath = pathname === '/' ? '/index.html' : pathname;
      const resolved = resolveSafe(resolvedPath);

      if (!resolved) {
        res.writeHead(403);
        return res.end('Forbidden');
      }

      // Try the requested file; fall back to index.html for unknown paths (SPA)
      let filePath;
      if (fs.existsSync(resolved)) {
        // Check if it's a directory - if so, forbid access to prevent directory listing
        if (fs.statSync(resolved).isDirectory()) {
          res.writeHead(403);
          return res.end('Directory listing not allowed');
        }
        filePath = resolved;
      } else {
        filePath = join(publicDir, 'index.html');
      }
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
  wss.on('connection', (ws, req) => {
    const forwarded = req && req.headers ? req.headers['x-forwarded-for'] : null;
    ws._clientIp = _extractForwardedIp(forwarded) || (req && req.socket ? req.socket.remoteAddress : 'unknown');
    ws.on('message', (raw) => _handleWsMessage(ws, raw.toString()));
    ws.on('close',   ()    => _handleWsClose(ws));
    ws.on('error',   ()    => { /* swallow errors on individual sockets */ });
  });

  server.listen(PORT, () => {
    console.log(`Tactics Bell (Node) running on http://localhost:${PORT}`);
  });
}

