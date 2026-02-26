/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  HARDWARE DETECTION
//  Probes the WebGL renderer string to decide whether the device has a
//  real GPU ('high') or is running a software / CPU-fallback path ('low').
//
//  HARDWARE_TIER values
//    'high' — hardware GPU detected; full PBR, noise textures, shadows,
//              particles, and environment lighting are all enabled.
//    'low'  — software renderer or no GPU; noise textures and per-tile
//              shadow casting are skipped so the game stays playable.
// ═══════════════════════════════════════

var HARDWARE_TIER = (function () {
  try {
    var canvas = document.createElement('canvas');
    var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      console.log('[HW] WebGL unavailable — low-end mode');
      return 'low';
    }

    var debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      var renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      console.log('[HW] GPU renderer:', renderer);
      // Software / CPU-only renderers
      if (/swiftshader|software|llvmpipe|microsoft basic render/i.test(renderer)) {
        console.log('[HW] Software renderer detected — low-end mode');
        return 'low';
      }
    }

    console.log('[HW] Hardware GPU detected — high-end mode');
    return 'high';
  } catch (e) {
    console.warn('[HW] Detection error:', e.message, '— defaulting to high-end mode');
    return 'high';
  }
}());
