/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  ASSET CACHE — in-memory caching for terrain model files
//  + memory-usage monitoring
// ═══════════════════════════════════════

var AssetCache = (function () {

  // ─── Internal state ──────────────────────────────────────────────────────────

  // url string → blob: URL string
  var _blobUrls = Object.create(null);

  // Whether all terrain model preloads have been attempted (success or failure)
  var _ready          = false;
  var _pending        = 0;

  // Whether all character model preloads have been attempted (success or failure)
  var _charReady      = false;
  var _charPending    = 0;

  // ─── Config ───────────────────────────────────────────────────────────────────

  // OBJ + MTL pairs for every configured terrain model
  var TERRAIN_MODEL_BASE = 'models/terrain/';
  var TERRAIN_FILENAMES  = [
    'terrain-grass.obj',    'terrain-grass.mtl',
    'terrain-forest.obj',   'terrain-forest.mtl',
    'terrain-water.obj',    'terrain-water.mtl',
    'terrain-mountain.obj', 'terrain-mountain.mtl',
    'terrain-road.obj',     'terrain-road.mtl'
  ];

  // glTF + bin files for every configured character model (high-quality assets).
  // Textures are NOT blob-cached because the glTF loader fetches them via relative
  // URL at the same root as the .gltf file.  Blob-caching the .gltf alone is also
  // insufficient because external .bin buffers use relative paths.  We list them
  // here only so the preload status tracking works correctly; actual loading is
  // always done directly from the server path.
  var CHARACTER_MODEL_BASE = 'models/character/';
  var CHARACTER_FILENAMES  = [
    'Male_Peasant.gltf',
    'Male_Ranger.gltf',
    'Female_Ranger.gltf',
    'Female_Peasant.gltf'
  ];

  // Memory warning fires when used JS heap exceeds this fraction of the limit.
  // 75 % is chosen as a level where performance degradation can start to occur
  // before the browser hard-limits and forces a GC pause.
  var MEMORY_WARN_RATIO         = 0.75;
  // How often (ms) to sample heap usage while a battle is in progress.
  var MEMORY_CHECK_INTERVAL_MS  = 10000;
  var _memCheckInterval = null;

  // ─── File caching helpers ─────────────────────────────────────────────────────

  function _store(url, blob) {
    var blobUrl = URL.createObjectURL(blob);
    _blobUrls[url] = blobUrl;
  }

  function _fetchOne(url, onDone) {
    if (_blobUrls[url]) { onDone(); return; }
    if (typeof fetch === 'undefined') { onDone(); return; }

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        _store(url, blob);
        onDone();
      })
      .catch(function () {
        // Non-fatal — game keeps working without the cache
        onDone();
      });
  }

  // ─── Public: preload terrain models ──────────────────────────────────────────

  /**
   * Fetch all terrain OBJ and MTL files in the background and store them as
   * blob: URLs so that subsequent stage loads avoid network round-trips.
   * Safe to call multiple times — only runs once.
   *
   * @param {Function} [onComplete]  Called when all fetches have settled.
   */
  function preloadTerrainModels(onComplete) {
    if (_ready) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    if (typeof fetch === 'undefined') {
      _ready = true;
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    _pending = TERRAIN_FILENAMES.length;

    function _check() {
      _pending--;
      if (_pending === 0) {
        _ready = true;
        if (typeof onComplete === 'function') onComplete();
      }
    }

    TERRAIN_FILENAMES.forEach(function (filename) {
      _fetchOne(TERRAIN_MODEL_BASE + filename, _check);
    });
  }

  // ─── Public: preload character models ────────────────────────────────────────

  /**
   * Fetch all character OBJ and MTL files in the background and store them as
   * blob: URLs so that subsequent stage loads avoid network round-trips.
   * Safe to call multiple times — only runs once.
   *
   * @param {Function} [onComplete]  Called when all fetches have settled.
   */
  function preloadCharacterModels(onComplete) {
    if (_charReady) {
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    if (typeof fetch === 'undefined') {
      _charReady = true;
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    _charPending = CHARACTER_FILENAMES.length;

    function _checkChar() {
      _charPending--;
      if (_charPending === 0) {
        _charReady = true;
        if (typeof onComplete === 'function') onComplete();
      }
    }

    CHARACTER_FILENAMES.forEach(function (filename) {
      _fetchOne(CHARACTER_MODEL_BASE + filename, _checkChar);
    });
  }

  // ─── Public: cache query ──────────────────────────────────────────────────────

  /** Returns true if the given URL has been successfully cached. */
  function hasCached(url) {
    return Object.prototype.hasOwnProperty.call(_blobUrls, url);
  }

  /** Returns the cached blob: URL for the given original URL, or null. */
  function getCachedUrl(url) {
    return _blobUrls[url] || null;
  }

  /** Returns true once all preload fetches have settled (hit or miss). */
  function isReady() { return _ready; }

  // ─── Memory monitoring ────────────────────────────────────────────────────────

  /**
   * Returns an object { used, total, ratio } from performance.memory, or null
   * in browsers that do not expose the API (non-Chromium engines).
   */
  function getMemoryInfo() {
    if (window.performance && window.performance.memory) {
      var m = window.performance.memory;
      return {
        used:  m.usedJSHeapSize,
        total: m.jsHeapSizeLimit,
        ratio: m.usedJSHeapSize / m.jsHeapSizeLimit
      };
    }
    return null;
  }

  /**
   * Start polling memory every 10 s.  Calls onHighMemory(info) whenever
   * usedJSHeapSize / jsHeapSizeLimit exceeds MEMORY_WARN_RATIO.
   * Calling this while a monitor is already running is a no-op.
   *
   * @param {Function} onHighMemory  Receives the same object as getMemoryInfo().
   */
  function startMemoryMonitor(onHighMemory) {
    if (_memCheckInterval) return;
    _memCheckInterval = setInterval(function () {
      var info = getMemoryInfo();
      if (info && info.ratio >= MEMORY_WARN_RATIO) {
        if (typeof onHighMemory === 'function') onHighMemory(info);
      }
    }, MEMORY_CHECK_INTERVAL_MS);
  }

  /** Stop the memory monitor started by startMemoryMonitor(). */
  function stopMemoryMonitor() {
    if (_memCheckInterval) {
      clearInterval(_memCheckInterval);
      _memCheckInterval = null;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────────

  return {
    preloadTerrainModels:    preloadTerrainModels,
    preloadCharacterModels:  preloadCharacterModels,
    hasCached:               hasCached,
    getCachedUrl:            getCachedUrl,
    isReady:                 isReady,
    getMemoryInfo:           getMemoryInfo,
    startMemoryMonitor:      startMemoryMonitor,
    stopMemoryMonitor:       stopMemoryMonitor
  };

}());
