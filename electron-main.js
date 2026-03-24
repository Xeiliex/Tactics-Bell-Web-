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
  // In development mode, skip heavy asset scanning since the dev server handles file serving
  if (process.env.ELECTRON_IS_DEV) {
    console.log('Development mode: Skipping asset preloading, assets served via dev server');
    
    // Send quick loading progress for UI feedback
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('loading-progress', {
        loaded: 100,
        total: 100,
        currentFile: 'Development mode - assets served locally',
        phase: 'Ready to play!'
      });
    }

    // Complete quickly
    setTimeout(() => {
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('loading-complete');
      }
      callback();
    }, 500);
    return;
  }

  // Production mode: Complete loading without fake delays
  console.log('Production mode: Starting asset validation');
  
  // Send initial status
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('loading-progress', {
      loaded: 50,
      total: 100,
      currentFile: 'Validating game assets...',
      phase: 'Loading game resources...'
    });
  }

  // Validate that critical asset directories exist
  const appPath = __dirname;
  let validDirs = 0;
  let failedDirs = [];

  ASSETS_TO_PRELOAD.forEach(assetDir => {
    const fullPath = path.join(appPath, assetDir);
    if (fs.existsSync(fullPath)) {
      validDirs++;
    } else {
      failedDirs.push(assetDir);
    }
  });

  if (failedDirs.length > 0) {
    console.warn('Missing asset directories:', failedDirs);
  }

  // Send completion
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('loading-progress', {
      loaded: 100,
      total: 100,
      currentFile: `Ready to play! (${validDirs}/${ASSETS_TO_PRELOAD.length} asset libraries available)`,
      phase: 'Loading complete!'
    });
  }

  // Complete loading
  setTimeout(() => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('loading-complete');
    }
    callback();
  }, 300);
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

  // Wait for page to load before starting asset preloading
  // This ensures IPC listeners are registered before we send events
  mainWindow.webContents.on('did-finish-load', () => {
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