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

function checkForUpdates(callback) {
  // Simple update check - in a real app, this would check a remote server
  // For now, we'll just simulate a quick check
  const https = require('https');

  // Check GitHub for latest release (example - replace with your repo)
  const options = {
    hostname: 'api.github.com',
    path: '/repos/wintercoker/Tactics-bell-web/releases/latest',
    method: 'GET',
    headers: {
      'User-Agent': 'Tactics-Bell-App'
    }
  };

  const req = https.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      try {
        const release = JSON.parse(data);
        const latestVersion = release.tag_name || '1.0.0';
        const currentVersion = require('./package.json').version;

        if (latestVersion !== currentVersion) {
          console.log(`Update available: ${latestVersion} (current: ${currentVersion})`);
          // In a real app, you might show a dialog here
        } else {
          console.log('App is up to date');
        }
      } catch (e) {
        console.log('Could not check for updates');
      }
      callback();
    });
  });

  req.on('error', (e) => {
    console.log('Update check failed:', e.message);
    callback();
  });

  req.setTimeout(3000, () => {
    req.destroy();
    console.log('Update check timed out');
    callback();
  });

  req.end();
}

function preloadAssets(callback) {
  const appPath = __dirname; // electron-main.js is in the root directory
  let totalAssets = 0;
  let loadedAssets = 0;
  let currentPhase = 'Initializing...';

  // Send initial progress to main window
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('loading-progress', {
      loaded: 0,
      total: 100,
      currentFile: 'Preparing asset scanner...',
      phase: 'Initializing game engine...'
    });
  }

  // First, count all assets to get accurate totals
  function countAssets(callback) {
    console.log('Counting assets...');
    let pendingDirs = ASSETS_TO_PRELOAD.length;

    if (pendingDirs === 0) {
      callback();
      return;
    }

    ASSETS_TO_PRELOAD.forEach(assetDir => {
      const fullPath = path.join(appPath, assetDir);
      countDirectory(fullPath, () => {
        pendingDirs--;
        if (pendingDirs === 0) {
          console.log(`Found ${totalAssets} total assets to load`);
          callback();
        }
      });
    });
  }

  function countDirectory(dirPath, callback) {
    fs.readdir(dirPath, { withFileTypes: true }, (err, files) => {
      if (err) {
        console.log(`Directory not found: ${dirPath} - ${err.message}`);
        callback();
        return;
      }

      let pending = files.length;
      if (pending === 0) {
        callback();
        return;
      }

      files.forEach(file => {
        const filePath = path.join(dirPath, file.name);

        if (file.isDirectory()) {
          // Recursively count subdirectories
          countDirectory(filePath, () => {
            pending--;
            if (pending === 0) callback();
          });
        } else {
          // Count this file
          totalAssets++;
          pending--;
          if (pending === 0) callback();
        }
      });
    });
  }

  // Simulate initial loading phases
  const initialPhases = [
    { phase: 'Checking for updates...', delay: 300 },
    { phase: 'Initializing game engine...', delay: 500 },
    { phase: 'Loading core systems...', delay: 300 },
    { phase: 'Preparing battlefield...', delay: 400 },
    { phase: 'Caching 3D models...', delay: 1000 },
    { phase: 'Scanning game assets...', delay: 200 }
  ];

  let phaseIndex = 0;
  const runInitialPhases = () => {
    if (phaseIndex < initialPhases.length) {
      const currentInitialPhase = initialPhases[phaseIndex];
      const progressPercent = Math.round((phaseIndex / initialPhases.length) * 30); // First 30% for initial phases

      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('loading-progress', {
          loaded: progressPercent,
          total: 100,
          currentFile: currentInitialPhase.phase.toLowerCase(),
          phase: currentInitialPhase.phase
        });
      }

      // If this is the update check phase, actually perform the check
      if (currentInitialPhase.phase === 'Checking for updates...') {
        checkForUpdates(() => {
          setTimeout(() => {
            phaseIndex++;
            runInitialPhases();
          }, currentInitialPhase.delay);
        });
        return;
      }

      // If this is the model caching phase, trigger it in the renderer
      if (currentInitialPhase.phase === 'Caching 3D models...') {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('start-model-cache');
        }
        setTimeout(() => {
          phaseIndex++;
          runInitialPhases();
        }, currentInitialPhase.delay);
        return;
      }

      setTimeout(() => {
        phaseIndex++;
        runInitialPhases();
      }, currentInitialPhase.delay);
    } else {
      // Now count assets first, then scan
      countAssets(() => {
        startAssetScanning();
      });
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

      // Add timeout to prevent getting stuck
      const timeout = setTimeout(() => {
        console.log(`Timeout scanning directory: ${dirPath}`);
        callback();
      }, 5000); // 5 second timeout per directory

      files.forEach(file => {
        const filePath = path.join(dirPath, file.name);

        if (file.isDirectory()) {
          // Recursively scan subdirectories
          scanDirectory(filePath, () => {
            pending--;
            if (pending === 0) {
              clearTimeout(timeout);
              callback();
            }
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

          // Progress is now 30% (initial phases) + 70% (scanning phase)
          const progressPercent = 30 + Math.round((loadedAssets / totalAssets) * 70);

          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('loading-progress', {
              loaded: progressPercent,
              total: 100,
              currentFile: path.relative(appPath, filePath),
              phase: currentPhase
            });
          }

          // Add small artificial delay to make loading visible
          setTimeout(() => {
            pending--;
            if (pending === 0) {
              clearTimeout(timeout);
              callback();
            }
          }, Math.random() * 20 + 5); // 5-25ms random delay (faster)
        }
      });
    });
  }

  const startAssetScanning = () => {
    console.log('Starting asset scanning...');
    // Start scanning assets
    let pendingDirs = ASSETS_TO_PRELOAD.length;
    let completedDirs = 0;

    if (totalAssets === 0) {
      // No assets to scan, complete immediately
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('loading-progress', {
          loaded: 100,
          total: 100,
          currentFile: 'All assets ready!',
          phase: 'Loading complete!'
        });
      }
      setTimeout(() => {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('loading-complete');
        }
        callback();
      }, 500);
      return;
    }

    ASSETS_TO_PRELOAD.forEach((assetDir, index) => {
      const fullPath = path.join(appPath, assetDir);
      scanDirectory(fullPath, () => {
        completedDirs++;
        pendingDirs--;

        const progressPercent = 30 + Math.round((completedDirs / ASSETS_TO_PRELOAD.length) * 70); // 30-100% for scanning

        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('loading-progress', {
            loaded: progressPercent,
            total: 100,
            currentFile: `Completed scanning ${assetDir}`,
            phase: `Scanning game assets... (${completedDirs}/${ASSETS_TO_PRELOAD.length})`
          });
        }

        if (pendingDirs === 0) {
          // All directories scanned
          console.log(`Asset scanning complete. Processed ${loadedAssets} files.`);
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('loading-progress', {
              loaded: 100,
              total: 100,
              currentFile: 'Asset scanning complete!',
              phase: 'Loading complete!'
            });
          }

          setTimeout(() => {
            if (mainWindow && mainWindow.webContents) {
              mainWindow.webContents.send('loading-complete');
            }
            callback();
          }, 500);
        }
      });
    });
  };

  // Start the loading process
  runInitialPhases();

  // Add a safety timeout to ensure loading always completes
  setTimeout(() => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('loading-complete');
    }
    callback();
  }, 15000); // 15 second absolute timeout
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