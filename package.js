const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const target = process.argv[2] || 'chrome';
const distDir = path.join(__dirname, 'dist', target);
const version = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8')).version;
const zipName = `adblockprime-${target}-v${version}.zip`;
const zipPath = path.join(__dirname, 'dist', zipName);

if (!fs.existsSync(distDir)) {
  console.error(`Error: dist/${target}/ not found. Run 'node build.js ${target}' first.`);
  process.exit(1);
}

try {
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

  const archiver = (() => {
    try { return require('archiver'); } catch { return null; }
  })();

  if (archiver) {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);
    archive.directory(distDir, false);
    archive.finalize();
    output.on('close', () => {
      const size = (archive.pointer() / 1024).toFixed(1);
      console.log(`\n  Packaged: ${zipName} (${size} KB)`);
      console.log(`  Location: ${zipPath}\n`);
    });
  } else {
    try {
      if (process.platform === 'win32') {
        execSync(
          `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`,
          { stdio: 'inherit' }
        );
      } else {
        execSync(`cd "${distDir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
      }
      const stats = fs.statSync(zipPath);
      const size = (stats.size / 1024).toFixed(1);
      console.log(`\n  Packaged: ${zipName} (${size} KB)`);
      console.log(`  Location: ${zipPath}\n`);
    } catch (err) {
      console.error('Failed to create ZIP:', err.message);
      process.exit(1);
    }
  }
} catch (err) {
  console.error('Packaging error:', err);
  process.exit(1);
}
