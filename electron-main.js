const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;
let loadingWindow;

// Asset preloading configuration - simplified for testing
const ASSETS_TO_PRELOAD = [
  'public/models/',
  'public/vendor/'
];

function preloadAssets(callback) {
  const appPath = __dirname; // electron-main.js is in the root directory
  let totalAssets = 0;
  let loadedAssets = 0;

  function scanDirectory(dirPath, callback) {
    fs.readdir(dirPath, { withFileTypes: true }, (err, files) => {
      if (err) {
        console.log(`Directory not found or inaccessible: ${dirPath} - ${err.message}`);
        callback(); // Continue with other directories
        return;
      }

      let pending = files.length;
      if (pending === 0) {
        callback();
        return;
      }

      files.forEach(file => {
        const filePath = path.join(dirPath, file.name);
        totalAssets++;

        if (file.isDirectory()) {
          // Recursively scan subdirectories
          scanDirectory(filePath, () => {
            pending--;
            if (pending === 0) callback();
          });
        } else {
          // Count file
          loadedAssets++;
          if (loadingWindow && loadingWindow.webContents) {
            loadingWindow.webContents.send('loading-progress', {
              loaded: loadedAssets,
              total: totalAssets,
              currentFile: path.relative(appPath, filePath)
            });
          }
          pending--;
          if (pending === 0) callback();
        }
      });
    });
  }

  // Start scanning assets
  let pendingDirs = ASSETS_TO_PRELOAD.length;
  ASSETS_TO_PRELOAD.forEach(assetDir => {
    const fullPath = path.join(appPath, assetDir);
    scanDirectory(fullPath, () => {
      pendingDirs--;
      if (pendingDirs === 0) {
        // All directories scanned
        setTimeout(() => {
          if (loadingWindow) {
            loadingWindow.webContents.send('loading-complete');
          }
          callback();
        }, 500); // Small delay to show completion
      }
    });
  });
}

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'electron-preload.js')
    },
    backgroundColor: '#1a1410',
    show: false
  });

  const loadingHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Loading - Tactics Bell</title>
      <link rel="stylesheet" href="css/style.css">
    </head>
    <body>
      <div id="screen-loading">
        <div class="loading-screen-content">
          <div class="loading-bell-icon">🔔</div>
          <h1 class="loading-title">Tactics Bell</h1>
          <p class="loading-subtitle">Preparing your adventure...</p>

          <div class="loading-progress-container">
            <div class="loading-progress-bar" id="progress-bar"></div>
          </div>

          <div class="loading-status" id="loading-status">Scanning game assets...</div>
          <div class="loading-spinner"></div>

          <p class="loading-hint">This may take a moment on first launch</p>
        </div>
      </div>

      <script>
        const { ipcRenderer } = require('electron');

        ipcRenderer.on('loading-progress', (event, data) => {
          const progressBar = document.getElementById('progress-bar');
          const status = document.getElementById('loading-status');

          const percentage = (data.loaded / data.total) * 100;
          progressBar.style.width = percentage + '%';

          status.textContent = \`Loading: \${data.currentFile}\`;
        });

        ipcRenderer.on('loading-complete', () => {
          const status = document.getElementById('loading-status');
          status.textContent = 'Ready to begin!';
          setTimeout(() => {
            window.close();
          }, 1000);
        });
      </script>
    </body>
    </html>
  `;

  loadingWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`);

  loadingWindow.once('ready-to-show', () => {
    loadingWindow.show();
  });

  loadingWindow.on('closed', () => {
    loadingWindow = null;
  });
}

// Custom protocol for launching from links
function registerCustomProtocol() {
  protocol.registerFileProtocol('tacticsbell', (request, callback) => {
    // Handle tacticsbell:// URLs
    const url = request.url.substr(13); // Remove 'tacticsbell://'
    callback({ path: path.join(__dirname, 'public', 'index.html') });
  });
}

function createWindow() {
  // Create loading window first
  createLoadingWindow();

  // Create the main browser window (hidden initially)
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'electron-preload.js')
    },
    icon: path.join(__dirname, 'public', 'favicon.ico'),
    title: 'Tactics Bell',
    show: false // Don't show until assets are loaded
  });

  // Load the app
  const startUrl = process.env.ELECTRON_IS_DEV
    ? 'http://localhost:8003'
    : `file://${path.join(__dirname, 'public', 'index.html')}`;

  mainWindow.loadURL(startUrl);

  // Start preloading assets
  preloadAssets(() => {
    // Assets loaded, show main window
    if (mainWindow) {
      mainWindow.show();

      // Open DevTools in development
      if (process.env.ELECTRON_IS_DEV) {
        mainWindow.webContents.openDevTools();
      }
    }

    // Close loading window
    if (loadingWindow) {
      loadingWindow.close();
    }
  });

  // Emitted when the window is closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// App event handlers
app.whenReady().then(() => {
  registerCustomProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app launch from custom protocol
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow) {
    mainWindow.focus();
  } else {
    createWindow();
  }
});

// IPC handlers for communication with renderer
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});

ipcMain.handle('get-platform', () => {
  return process.platform;
});

ipcMain.handle('is-packaged', () => {
  return app.isPackaged;
});