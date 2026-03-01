const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(width, height, r, g, b) {
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    const table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c;
    }
    for (let i = 0; i < buf.length; i++) {
      crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function chunk(type, data) {
    const typeBytes = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcData = Buffer.concat([typeBytes, data]);
    const crcVal = Buffer.alloc(4);
    crcVal.writeUInt32BE(crc32(crcData));
    return Buffer.concat([len, typeBytes, data, crcVal]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type (RGB)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const offset = y * (1 + width * 3);
    rawData[offset] = 0; // filter none

    const cy = y / height;
    const r1 = 108, g1 = 92, b1 = 231;    // #6C5CE7
    const r2 = 168, g2 = 85, b2 = 247;    // #A855F7

    for (let x = 0; x < width; x++) {
      const cx = x / width;
      const t = (cx + cy) / 2;
      const px = offset + 1 + x * 3;

      const cornerDist = Math.sqrt(
        Math.pow(Math.max(0, Math.abs(cx - 0.5) - 0.3) * width, 2) +
        Math.pow(Math.max(0, Math.abs(cy - 0.5) - 0.3) * height, 2)
      );
      const cornerRadius = width * 0.2;

      if (cornerDist > cornerRadius) {
        rawData[px] = 0;
        rawData[px + 1] = 0;
        rawData[px + 2] = 0;
        continue;
      }

      const isShield = cy > 0.25 && cy < 0.75 &&
        cx > 0.25 + (cy - 0.5) * 0.3 &&
        cx < 0.75 - (cy - 0.5) * 0.3;

      if (isShield) {
        rawData[px] = 255;
        rawData[px + 1] = 255;
        rawData[px + 2] = 255;
      } else {
        rawData[px] = Math.round(r1 + (r2 - r1) * t);
        rawData[px + 1] = Math.round(g1 + (g2 - g1) * t);
        rawData[px + 2] = Math.round(b1 + (b2 - b1) * t);
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', iend)
  ]);
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const png = createPNG(size, size, 108, 92, 231);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), png);
  console.log(`Created icon${size}.png (${png.length} bytes)`);
}

console.log('Done!');
