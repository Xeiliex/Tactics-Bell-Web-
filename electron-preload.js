const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  isPackaged: () => ipcRenderer.invoke('is-packaged'),

  // Platform detection
  platform: process.platform,

  // Version info
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});

// Also expose a simple API for asset loading status
let assetLoadCallback = null;

contextBridge.exposeInMainWorld('assetLoader', {
  onProgress: (callback) => {
    assetLoadCallback = callback;
  },

  reportProgress: (loaded, total) => {
    if (assetLoadCallback) {
      assetLoadCallback(loaded, total);
    }
  }
});