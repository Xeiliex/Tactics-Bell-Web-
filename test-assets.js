const path = require('path');
const fs = require('fs');

// Test the asset counting and scanning logic
const ASSETS_TO_PRELOAD = [
  'public/models/',
  'public/vendor/',
  'public/js/',
  'public/css/',
  'Assets/all-together-20260227T155318Z/Blends/',
  'Assets/medieval-village-megakit/OBJ/',
  'Assets/medieval-village-megakit/Textures/'
];

const appPath = __dirname;
let totalAssets = 0;
let loadedAssets = 0;

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

function scanDirectory(dirPath, callback) {
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
        // Recursively scan subdirectories
        scanDirectory(filePath, () => {
          pending--;
          if (pending === 0) callback();
        });
      } else {
        // Count file
        loadedAssets++;

        const progressPercent = Math.round((loadedAssets / totalAssets) * 100);
        console.log(`Progress: ${progressPercent}% - ${path.relative(appPath, filePath)}`);

        pending--;
        if (pending === 0) callback();
      }
    });
  });
}

function startAssetScanning() {
  console.log('Starting asset scanning...');
  let pendingDirs = ASSETS_TO_PRELOAD.length;
  let completedDirs = 0;

  ASSETS_TO_PRELOAD.forEach((assetDir, index) => {
    const fullPath = path.join(appPath, assetDir);
    scanDirectory(fullPath, () => {
      completedDirs++;
      console.log(`Completed scanning ${assetDir} (${completedDirs}/${ASSETS_TO_PRELOAD.length})`);

      if (completedDirs === ASSETS_TO_PRELOAD.length) {
        console.log('Asset scanning complete!');
      }
    });
  });
}

// Test the logic
countAssets(() => {
  console.log(`Total assets counted: ${totalAssets}`);
  if (totalAssets > 0) {
    startAssetScanning();
  } else {
    console.log('No assets to scan');
  }
});