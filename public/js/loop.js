/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  GAME LOOP — requestAnimationFrame-based update loop
// ═══════════════════════════════════════
//
// Provides a delta-time (dt, in seconds) tick to all registered callbacks.
// Runs independently of the Babylon.js render loop (which handles GPU rendering).
// Use this loop for game-logic updates: weather animation, status effect timers,
// and any continuous state that needs per-frame processing.
//
// Usage:
//   gameLoop.register(fn);   // fn(dt) called every frame
//   gameLoop.unregister(fn);
//   gameLoop.start();
//   gameLoop.stop();

function GameLoop() {
  this._callbacks = [];   // Array of fn(dt) update callbacks
  this._rafId     = null;
  this._lastTime  = 0;
  this._running   = false;
}

// Maximum allowed delta-time per tick (seconds).
// Caps the dt value after tab suspension or long GC pauses to prevent a
// spiral-of-death where a massive dt causes runaway simulation updates.
GameLoop.MAX_DELTA = 0.1;

// Register an update callback.
// fn(dt) is called every frame while the loop is running, dt = seconds since last frame.
GameLoop.prototype.register = function (fn) {
  if (this._callbacks.indexOf(fn) === -1) {
    this._callbacks.push(fn);
  }
};

// Remove a previously registered callback.
GameLoop.prototype.unregister = function (fn) {
  var idx = this._callbacks.indexOf(fn);
  if (idx !== -1) this._callbacks.splice(idx, 1);
};

// Start the loop.  Idempotent — calling start() when already running is a no-op.
GameLoop.prototype.start = function () {
  if (this._running) return;
  this._running  = true;
  this._lastTime = performance.now();
  var self = this;
  function tick(now) {
    if (!self._running) return;
    // Cap dt at MAX_DELTA to prevent a spiral-of-death after tab suspension.
    var dt = Math.min((now - self._lastTime) / 1000, GameLoop.MAX_DELTA);
    self._lastTime = now;
    for (var i = 0; i < self._callbacks.length; i++) {
      try { self._callbacks[i](dt); } catch (e) {
        // Never let one broken callback kill the whole loop.
        console.warn('GameLoop callback error:', e);
      }
    }
    self._rafId = requestAnimationFrame(tick);
  }
  this._rafId = requestAnimationFrame(tick);
};

// Stop the loop and clear all registered callbacks.
GameLoop.prototype.stop = function () {
  this._running = false;
  if (this._rafId !== null) {
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }
  this._callbacks = [];
};

// Global singleton — started when a battle begins, stopped when returning to title.
var gameLoop = new GameLoop();
