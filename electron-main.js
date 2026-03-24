const { app, BrowserWindow, protocol, ipcMain } = require('electron');
const path = require('path');

// Keep a global reference of the window object
let mainWindow;
let loadingWindow;

function preloadAssets(callback) {
  // Simple asset preloading
  setTimeout(() => {
    callback();
  }, 2000);
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

          <div class="loading-progress-section">
            <div class="loading-progress-container">
              <div class="loading-progress-bar" id="progress-bar"></div>
            </div>
            <div class="loading-progress-text">
              <span id="progress-percentage">0%</span>
              <span id="progress-count">(0/0)</span>
            </div>
          </div>

          <div class="loading-details">
            <div class="loading-status" id="loading-status">Initializing...</div>
            <div class="loading-current-file" id="loading-current-file">Scanning game files...</div>
          </div>

          <div class="loading-whimsy">
            <div class="loading-message" id="loading-message">The bells are ringing... your adventure awaits!</div>
            <div class="loading-hint" id="loading-hint">💡 Pro tip: Position your units strategically to control the battlefield</div>
          </div>

          <div class="loading-spinner"></div>
        </div>
      </div>

      <script>
        const { ipcRenderer } = require('electron');

        // Whimsical messages and hints
        const whimsicalMessages = [
          "The bells are ringing... your adventure awaits!",
          "Sharpening swords and polishing armor...",
          "Consulting ancient tomes of strategy...",
          "Awakening the spirits of fallen heroes...",
          "Calibrating magical energies...",
          "Preparing the battlefield for glory...",
          "Whispering secrets to the wind...",
          "Forging alliances with legendary warriors...",
          "Unraveling the mysteries of tactics...",
          "Summoning the courage of champions..."
        ];

        const gameHints = [
          "💡 Pro tip: Position your units strategically to control the battlefield",
          "💡 Remember: Each unit has unique strengths and weaknesses",
          "💡 Tip: Use terrain to your advantage in combat",
          "💡 Hint: Timing is everything in battle - strike at the right moment",
          "💡 Strategy: Surround your enemies to limit their movement",
          "💡 Wisdom: A good tactician knows when to advance and when to retreat",
          "💡 Secret: Some units can perform special abilities in combat",
          "💡 Lore: Ancient bells hold the power to turn the tide of battle"
        ];

        let messageIndex = 0;
        let hintIndex = 0;

        // Cycle through messages every 3 seconds
        setInterval(() => {
          messageIndex = (messageIndex + 1) % whimsicalMessages.length;
          document.getElementById('loading-message').textContent = whimsicalMessages[messageIndex];
        }, 3000);

        // Cycle through hints every 5 seconds
        setInterval(() => {
          hintIndex = (hintIndex + 1) % gameHints.length;
          document.getElementById('loading-hint').textContent = gameHints[hintIndex];
        }, 5000);

        ipcRenderer.on('loading-progress', (event, data) => {
          const progressBar = document.getElementById('progress-bar');
          const progressPercentage = document.getElementById('progress-percentage');
          const progressCount = document.getElementById('progress-count');
          const status = document.getElementById('loading-status');
          const currentFile = document.getElementById('loading-current-file');

          const percentage = Math.round((data.loaded / data.total) * 100);
          progressBar.style.width = percentage + '%';
          progressPercentage.textContent = percentage + '%';
          progressCount.textContent = \`(\${data.loaded}/\${data.total})\`;

          status.textContent = data.phase || 'Loading Assets...';
          currentFile.textContent = data.currentFile || 'Processing files...';
        });

        ipcRenderer.on('loading-complete', () => {
          const status = document.getElementById('loading-status');
          const currentFile = document.getElementById('loading-current-file');
          const message = document.getElementById('loading-message');

          status.textContent = 'Ready to begin!';
          currentFile.textContent = 'All assets loaded successfully';
          message.textContent = 'Your adventure begins now!';

          setTimeout(() => {
            window.close();
          }, 1500);
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
    // Assets loaded, show main window and close loading window immediately
    if (mainWindow) {
      mainWindow.show();

      // Open DevTools in development
      if (process.env.ELECTRON_IS_DEV) {
        mainWindow.webContents.openDevTools();
      }
    }

    // Close loading window immediately (no delay)
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