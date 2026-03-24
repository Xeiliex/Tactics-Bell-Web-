const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;

// Asset preloading configuration - expanded for better loading experience
const ASSETS_TO_PRELOAD = [
  'public/models/',
  'public/vendor/',
  'public/js/',
  'public/css/',
  'Assets/all-together-20260227T155318Z/Blends/',
  'Assets/medieval-village-megakit/OBJ/',
  'Assets/medieval-village-megakit/Textures/'
];

function preloadAssets(callback) {
  const appPath = __dirname; // electron-main.js is in the root directory
  let totalAssets = 0;
  let loadedAssets = 0;
  let currentPhase = 'Initializing...';

  // Send initial progress to main window
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('loading-progress', {
      loaded: 0,
      total: 1,
      currentFile: 'Preparing asset scanner...',
      phase: 'Initializing game engine...'
    });
  }

  // Simulate initial loading phases
  const initialPhases = [
    { phase: 'Initializing game engine...', delay: 500 },
    { phase: 'Loading core systems...', delay: 300 },
    { phase: 'Preparing battlefield...', delay: 400 },
    { phase: 'Scanning game assets...', delay: 200 }
  ];

  let phaseIndex = 0;
  const runInitialPhases = () => {
    if (phaseIndex < initialPhases.length) {
      const currentInitialPhase = initialPhases[phaseIndex];
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('loading-progress', {
          loaded: phaseIndex + 1,
          total: initialPhases.length + 1,
          currentFile: currentInitialPhase.phase.toLowerCase(),
          phase: currentInitialPhase.phase
        });
      }
      setTimeout(() => {
        phaseIndex++;
        runInitialPhases();
      }, currentInitialPhase.delay);
    } else {
      // Now start actual asset scanning
      startAssetScanning();
    }
  };

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

          // Update phase based on file type
          if (filePath.includes('.js')) currentPhase = 'Loading JavaScript modules...';
          else if (filePath.includes('.css')) currentPhase = 'Loading stylesheets...';
          else if (filePath.includes('.json')) currentPhase = 'Loading configuration...';
          else if (filePath.includes('.png') || filePath.includes('.jpg') || filePath.includes('.webp')) currentPhase = 'Loading textures...';
          else if (filePath.includes('.obj') || filePath.includes('.gltf') || filePath.includes('.fbx')) currentPhase = 'Loading 3D models...';
          else currentPhase = 'Loading game assets...';

          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('loading-progress', {
              loaded: loadedAssets,
              total: Math.max(totalAssets, loadedAssets + 10), // Ensure we don't go over 100%
              currentFile: path.relative(appPath, filePath),
              phase: currentPhase
            });
          }

          // Add small artificial delay to make loading visible
          setTimeout(() => {
            pending--;
            if (pending === 0) callback();
          }, Math.random() * 50 + 10); // 10-60ms random delay
        }
      });
    });
  }

  const startAssetScanning = () => {
    // Start scanning assets
    let pendingDirs = ASSETS_TO_PRELOAD.length;
    ASSETS_TO_PRELOAD.forEach(assetDir => {
      const fullPath = path.join(appPath, assetDir);
      scanDirectory(fullPath, () => {
        pendingDirs--;
        if (pendingDirs === 0) {
          // All directories scanned
          setTimeout(() => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('loading-complete');
            }
            callback();
          }, 1000); // Longer delay to show completion
        }
      });
    });
  };

  // Start the loading process
  runInitialPhases();
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
  // Create the main browser window (shown immediately with loading overlay)
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
    show: true // Show immediately with loading overlay
  });

  // Load the app
  const startUrl = process.env.ELECTRON_IS_DEV
    ? 'http://localhost:8003'
    : `file://${path.join(__dirname, 'public', 'index.html')}`;

  mainWindow.loadURL(startUrl);

  // Start preloading assets
  preloadAssets(() => {
    // Assets loaded, hide loading overlay
    if (mainWindow) {
      // Open DevTools in development
      if (process.env.ELECTRON_IS_DEV) {
        mainWindow.webContents.openDevTools();
      }
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