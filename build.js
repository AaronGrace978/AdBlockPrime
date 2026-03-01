const fs = require('fs');
const path = require('path');

const target = process.argv[2] || 'chrome';
const distDir = path.join(__dirname, 'dist', target);

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

function build() {
  console.log(`\n  Building AdBlockPrime for ${target}...\n`);

  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  ensureDir(distDir);

  if (target === 'firefox') {
    copyFile(
      path.join(__dirname, 'manifest.firefox.json'),
      path.join(distDir, 'manifest.json')
    );
  } else {
    copyFile(
      path.join(__dirname, 'manifest.json'),
      path.join(distDir, 'manifest.json')
    );
  }

  copyDir(path.join(__dirname, 'src'), path.join(distDir, 'src'));
  copyDir(path.join(__dirname, 'icons'), path.join(distDir, 'icons'));

  if (target === 'chrome') {
    const firefoxFiles = [
      path.join(distDir, 'src', 'background', 'service-worker-firefox.js'),
      path.join(distDir, 'src', 'content', 'content-script-firefox.js')
    ];
    for (const f of firefoxFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  if (target === 'firefox') {
    const chromeFiles = [
      path.join(distDir, 'src', 'background', 'service-worker.js'),
      path.join(distDir, 'src', 'content', 'content-script.js')
    ];
    for (const f of chromeFiles) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }

  const fileCount = countFiles(distDir);
  console.log(`  Done! ${fileCount} files written to dist/${target}/`);
  console.log(`\n  To install:`);
  if (target === 'chrome') {
    console.log(`  1. Go to chrome://extensions`);
    console.log(`  2. Enable "Developer mode"`);
    console.log(`  3. Click "Load unpacked" and select: ${distDir}`);
  } else {
    console.log(`  1. Go to about:debugging#/runtime/this-firefox`);
    console.log(`  2. Click "Load Temporary Add-on"`);
    console.log(`  3. Select manifest.json from: ${distDir}`);
  }
  console.log('');
}

function countFiles(dir) {
  let count = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

build();
