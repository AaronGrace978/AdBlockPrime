const fs = require('fs');
const path = require('path');

function createSVGIcon(size) {
  const r = Math.round(size * 0.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6C5CE7"/>
      <stop offset="100%" stop-color="#A855F7"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <path d="M${size*0.286} ${size*0.714}L${size*0.5} ${size*0.286}L${size*0.714} ${size*0.714}H${size*0.59}L${size*0.5} ${size*0.536}L${size*0.41} ${size*0.714}H${size*0.286}Z" fill="white" opacity="0.95"/>
  <line x1="${size*0.375}" y1="${size*0.643}" x2="${size*0.625}" y2="${size*0.643}" stroke="white" stroke-width="${Math.max(1, size*0.05)}" stroke-linecap="round"/>
</svg>`;
}

const { createCanvas } = (() => {
  try {
    return require('canvas');
  } catch {
    return { createCanvas: null };
  }
})();

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const sizes = [16, 48, 128];

for (const size of sizes) {
  const svg = createSVGIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.svg`), svg);
  console.log(`Created icon${size}.svg`);
}

if (createCanvas) {
  console.log('canvas module found, generating PNGs...');
  const { createCanvas: cc, loadImage } = require('canvas');
  for (const size of sizes) {
    const canvas = cc(size, size);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#6C5CE7');
    gradient.addColorStop(1, '#A855F7');

    const r = size * 0.2;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(size - r, 0);
    ctx.quadraticCurveTo(size, 0, size, r);
    ctx.lineTo(size, size - r);
    ctx.quadraticCurveTo(size, size, size - r, size);
    ctx.lineTo(r, size);
    ctx.quadraticCurveTo(0, size, 0, size - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.moveTo(size * 0.286, size * 0.714);
    ctx.lineTo(size * 0.5, size * 0.286);
    ctx.lineTo(size * 0.714, size * 0.714);
    ctx.lineTo(size * 0.59, size * 0.714);
    ctx.lineTo(size * 0.5, size * 0.536);
    ctx.lineTo(size * 0.41, size * 0.714);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'white';
    ctx.lineWidth = Math.max(1, size * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.375, size * 0.643);
    ctx.lineTo(size * 0.625, size * 0.643);
    ctx.stroke();

    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
    console.log(`Created icon${size}.png`);
  }
} else {
  console.log('\nNote: "canvas" npm package not installed. Creating placeholder PNGs.');
  console.log('Icons will use SVG format. For PNG icons, run: npm install canvas');
  console.log('Then re-run: node generate-icons.js\n');

  for (const size of sizes) {
    const svg = createSVGIcon(size);
    fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), svg);
  }
}

console.log('\nIcons generated in /icons/');
