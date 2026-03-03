/* jshint esversion: 6 */
'use strict';

// ═══════════════════════════════════════
//  MULTIPLAYER — WebSocket client module
// ═══════════════════════════════════════
//
// Manages the WebSocket connection, room lifecycle, and message relay for
// two-player PvP battles.
//
// Usage:
//   Multiplayer.connect(function(err) { ... });
//   Multiplayer.createRoom();
//   Multiplayer.joinRoom('ABCD');
//   Multiplayer.sendGameStart({ hostParty, guestParty, grid, weatherId });
//   Multiplayer.sendAction({ kind, unitIdx, ... });
//   Multiplayer.disconnect();
//
// Events (assign before calling connect):
//   Multiplayer.onRoomCreated  = function(code) {}
//   Multiplayer.onRoomJoined   = function() {}
//   Multiplayer.onOpponentJoined = function() {}
//   Multiplayer.onGameStart    = function(data) {}
//   Multiplayer.onAction       = function(action) {}
//   Multiplayer.onOpponentLeft = function() {}
//   Multiplayer.onError        = function(msg) {}

var Multiplayer = (function () {

  var _ws         = null;
  var _playerIdx  = -1;   // 0 = host, 1 = guest
  var _roomCode   = null;
  var _connected  = false;

  // ─── Public event callbacks ───────────────────────────────────────────────

  var _pub = {
    onRoomCreated:    null,
    onRoomJoined:     null,
    onOpponentJoined: null,
    onGameStart:      null,
    onAction:         null,
    onOpponentLeft:   null,
    onError:          null,
  };

  // ─── Internals ────────────────────────────────────────────────────────────

  function _send(msg) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(msg));
    }
  }

  function _dispatch(name, arg) {
    if (typeof _pub[name] === 'function') _pub[name](arg);
  }

  function _handleMessage(msg) {
    switch (msg.type) {
      case 'room_created':
        _roomCode  = msg.code;
        _playerIdx = 0;
        _dispatch('onRoomCreated', msg.code);
        break;

      case 'room_joined':
        _playerIdx = 1;
        _dispatch('onRoomJoined');
        break;

      case 'opponent_joined':
        _dispatch('onOpponentJoined');
        break;

      case 'game_start':
        _dispatch('onGameStart', msg);
        break;

      case 'action':
        _dispatch('onAction', msg);
        break;

      case 'opponent_left':
        _dispatch('onOpponentLeft');
        break;

      case 'error':
        _dispatch('onError', msg.message);
        break;

      default: break;
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Open a WebSocket connection to the server's /ws endpoint.
   * @param {Function} [cb] - called with null on success, or an Error on failure.
   */
  function connect(cb) {
    if (_ws) disconnect();
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var url   = proto + '//' + location.host + '/ws';
    _ws = new WebSocket(url);

    _ws.onopen = function () {
      _connected = true;
      if (cb) cb(null);
    };

    _ws.onerror = function () {
      _connected = false;
      if (cb) cb(new Error('WebSocket connection failed'));
    };

    _ws.onclose = function () {
      _connected = false;
      if (_playerIdx !== -1) {
        // Only fire if we were in a match
        _dispatch('onOpponentLeft');
      }
      _playerIdx = -1;
      _roomCode  = null;
    };

    _ws.onmessage = function (evt) {
      var msg;
      try { msg = JSON.parse(evt.data); } catch (_) { return; }
      _handleMessage(msg);
    };
  }

  /** Close the WebSocket connection. */
  function disconnect() {
    if (_ws) {
      try { _ws.close(); } catch (_) {}
      _ws = null;
    }
    _connected = false;
    _playerIdx = -1;
    _roomCode  = null;
  }

  /** Ask the server to create a new room.  Triggers onRoomCreated when done. */
  function createRoom() {
    _send({ type: 'create_room' });
  }

  /** Join an existing room by its 4-character code.  Triggers onRoomJoined. */
  function joinRoom(code) {
    _send({ type: 'join_room', code: (code || '').toUpperCase().trim() });
  }

  /**
   * Broadcast the initial game state to the opponent (host only).
   * @param {object} data - { hostParty, guestParty, gridData, weatherId }
   */
  function sendGameStart(data) {
    _send(Object.assign({ type: 'game_start' }, data));
  }

  /**
   * Send a player action to the opponent.
   * @param {object} action - e.g. { kind:'move', unitIdx, row, col } or
   *                          { kind:'attack', unitIdx, targetIdx, skillId, result }
   */
  function sendAction(action) {
    _send(Object.assign({ type: 'action' }, action));
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  return Object.assign(_pub, {
    connect:       connect,
    disconnect:    disconnect,
    createRoom:    createRoom,
    joinRoom:      joinRoom,
    sendGameStart: sendGameStart,
    sendAction:    sendAction,

    get playerIdx()  { return _playerIdx; },
    get roomCode()   { return _roomCode; },
    get isConnected(){ return _connected; },
    get isHost()     { return _playerIdx === 0; },
  });

}());
