'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const TEST_PORT = 18003;

function waitForServerReady(proc, timeoutMs) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('Timed out waiting for server startup log.'));
    }, timeoutMs);

    function onData(buf) {
      const text = String(buf || '');
      if (text.includes('running on http://localhost:')) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      }
    }

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);

    proc.on('exit', (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(new Error('Server exited before becoming ready (code ' + code + ').'));
    });
  });
}

test('server responds 200 on /api/config', async () => {
  const env = { ...process.env, PORT: String(TEST_PORT) };
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServerReady(proc, 7000);
    const res = await fetch('http://127.0.0.1:' + TEST_PORT + '/api/config');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(Object.prototype.hasOwnProperty.call(json, 'googleClientId'));
  } finally {
    if (!proc.killed) proc.kill('SIGTERM');
  }
});
