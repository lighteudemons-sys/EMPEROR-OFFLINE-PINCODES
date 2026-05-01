/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

function copyDirectorySync(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read all files and directories in source
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy directories
      copyDirectorySync(srcPath, destPath);
    } else {
      // Copy files
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const staticSource = path.join(process.cwd(), '.next', 'static');
const staticDest = path.join(process.cwd(), '.next', 'standalone', '.next', 'static');

const publicSource = path.join(process.cwd(), 'public');
const publicDest = path.join(process.cwd(), '.next', 'standalone', 'public');

try {
  console.log('Copying .next/static to .next/standalone/.next/static...');
  if (fs.existsSync(staticSource)) {
    copyDirectorySync(staticSource, staticDest);
    console.log('✓ Copied .next/static');
  } else {
    console.log('⚠ .next/static not found, skipping...');
  }

  console.log('Copying public to .next/standalone/public...');
  if (fs.existsSync(publicSource)) {
    copyDirectorySync(publicSource, publicDest);
    console.log('✓ Copied public');
  } else {
    console.log('⚠ public not found, skipping...');
  }

  console.log('✓ Build files copied successfully!');
} catch (error) {
  console.error('Error copying build files:', error);
  process.exit(1);
}
