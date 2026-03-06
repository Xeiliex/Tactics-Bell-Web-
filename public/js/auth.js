/* jshint esversion: 6 */
'use strict';

/**
 * auth — SSO authentication module
 *
 * Integrates Google Identity Services (One Tap + Sign-In button) so players
 * can log in with their Google account and have their save state stored on the
 * server.  Falls back gracefully to localStorage-only saves when
 * GOOGLE_CLIENT_ID is not configured or when the player is not signed in.
 *
 * Public API:
 *   auth.init()            — call once on DOMContentLoaded (after game.js)
 *   auth.getUser()         — returns { email, name, picture } or null
 *   auth.saveToCloud(blob) — persist a save blob; resolves to true on success
 *   auth.loadFromCloud()   — fetch cloud save blob; resolves to string or null
 *   auth.logout()          — end the session
 */
var auth = (function () {

  /** Must match the SAVE_KEY constant in game.js. */
  var SAVE_KEY = 'tactics-bell-save';

  /** Currently signed-in user, or null. */
  var _user = null;

  // ─── Public API ────────────────────────────────────────────────────────────

  function getUser() { return _user; }

  /**
   * Initialize the module: check for an existing session, then boot Google
   * Identity Services if a client ID has been configured on the server.
   */
  function init() {
    fetch('/api/config', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (cfg) {
        // Restore any existing server session first so the Continue button
        // is updated before GSI scripts finish loading.
        _checkSession(function () {
          if (cfg.googleClientId) {
            _loadGsi(cfg.googleClientId);
          }
        });
      })
      .catch(function () {
        // Server unreachable — SSO disabled, app works with localStorage only.
      });

    // Wire up the logout button (if present in the DOM).
    var logoutBtn = document.getElementById('btn-sso-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () { logout(); });
    }
  }

  /**
   * Persist a save blob to the server for the currently signed-in user.
   * Fire-and-forget safe — callers do not need to await the result.
   * @param {string} saveBlob  Base64-encoded save string
   * @returns {Promise<boolean>}
   */
  function saveToCloud(saveBlob) {
    if (!_user) return Promise.resolve(false);
    return fetch('/api/save', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ save: saveBlob }),
      credentials: 'same-origin',
    })
      .then(function (r) { return r.ok; })
      .catch(function () { return false; });
  }

  /**
   * Retrieve the cloud save blob for the current user.
   * @returns {Promise<string|null>}
   */
  function loadFromCloud() {
    if (!_user) return Promise.resolve(null);
    return fetch('/api/save', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) { return d.save || null; })
      .catch(function () { return null; });
  }

  /** Sign the user out of their server session. */
  function logout() {
    fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      .catch(function () {});
    _setUser(null);
    if (typeof google !== 'undefined') {
      google.accounts.id.disableAutoSelect();
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /** Check whether a server session cookie is already set. */
  function _checkSession(callback) {
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _setUser(d.user || null);
        if (_user) {
          // Pull the cloud save into localStorage so the Continue button works
          // immediately, even before the GSI script finishes loading.
          _syncCloudToLocal();
        }
        if (callback) callback();
      })
      .catch(function () { if (callback) callback(); });
  }

  /** Dynamically inject the Google Identity Services script. */
  function _loadGsi(clientId) {
    var script  = document.createElement('script');
    script.src  = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = function () { _initGsi(clientId); };
    document.head.appendChild(script);
  }

  /** Initialize Google Identity Services once the script has loaded. */
  function _initGsi(clientId) {
    if (typeof google === 'undefined' || !google.accounts) return;

    google.accounts.id.initialize({
      client_id:             clientId,
      callback:              _handleCredential,
      auto_select:           true,
      cancel_on_tap_outside: false,
    });

    // Render the "Sign in with Google" button into the placeholder element.
    var btnEl = document.getElementById('sso-signin-btn');
    if (btnEl && !_user) {
      google.accounts.id.renderButton(btnEl, {
        theme:          'outline',
        size:           'medium',
        text:           'signin_with',
        logo_alignment: 'left',
      });
    }

    // Show the One Tap prompt when no user is signed in.
    if (!_user) {
      google.accounts.id.prompt();
    }
  }

  /** Called by GSI with the credential response after the user signs in. */
  function _handleCredential(response) {
    fetch('/api/auth/google', {
      method:      'POST',
      headers:     { 'Content-Type': 'application/json' },
      body:        JSON.stringify({ credential: response.credential }),
      credentials: 'same-origin',
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Auth failed: ' + r.status);
        return r.json();
      })
      .then(function (d) {
        _setUser(d.user);
        _syncCloudToLocal();
      })
      .catch(function (e) {
        console.error('[auth] Google sign-in failed:', e);
      });
  }

  /**
   * Download the cloud save (if any) and mirror it into localStorage so the
   * rest of the game can read it via the normal loadSave() path.
   */
  function _syncCloudToLocal() {
    loadFromCloud().then(function (blob) {
      if (blob) {
        try { localStorage.setItem(SAVE_KEY, blob); } catch (_) {}
      }
      // Ask game.js to refresh the Continue button.
      if (typeof game !== 'undefined' && game.updateContinueButton) {
        game.updateContinueButton();
      }
    });
  }

  /** Update _user and re-render the auth widget. */
  function _setUser(user) {
    _user = user;
    _renderWidget();
  }

  /** Sync the title-screen auth widget to the current _user state. */
  function _renderWidget() {
    var widget  = document.getElementById('sso-user-widget');
    var signBtn = document.getElementById('sso-signin-btn');
    if (!widget) return;

    if (_user) {
      var avatarEl = widget.querySelector('.sso-avatar');
      var nameEl   = widget.querySelector('.sso-name');
      if (avatarEl) {
        avatarEl.innerHTML = _user.picture
          ? '<img src="' + _user.picture + '" alt="" referrerpolicy="no-referrer" />'
          : '<span>' + (_user.name || '?')[0].toUpperCase() + '</span>';
      }
      if (nameEl) nameEl.textContent = _user.name || _user.email || '';
      widget.classList.remove('hidden');
      if (signBtn) signBtn.classList.add('hidden');
    } else {
      widget.classList.add('hidden');
      if (signBtn) signBtn.classList.remove('hidden');
    }
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init: init, getUser: getUser, saveToCloud: saveToCloud, loadFromCloud: loadFromCloud, logout: logout };

}());
