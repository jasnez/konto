#!/usr/bin/env node
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const publicDir = path.join(projectRoot, 'public', 'icons');

// Ensure icons directory exists
await fs.mkdir(publicDir, { recursive: true });

// Brand colors
const brandGreen = '#22C55E';
const white = '#FFFFFF';
const fontSize = 320; // For 512px icon

async function generateIcon(size) {
  // Create SVG with "K" letter
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${brandGreen}"/>
      <text
        x="${size / 2}"
        y="${size / 2}"
        font-family="Inter, sans-serif"
        font-size="${Math.round(size * 0.6)}"
        font-weight="bold"
        fill="${white}"
        text-anchor="middle"
        dominant-baseline="middle"
      >K</text>
    </svg>
  `;

  const filename =
    size === 192 ? 'icon-192.png' : size === 512 ? 'icon-512.png' : `icon-${size}.png`;
  const filepath = path.join(publicDir, filename);

  try {
    await sharp(Buffer.from(svg)).png().toFile(filepath);
    console.log(`[OK] Generated ${filename} (${size}x${size})`);
  } catch (err) {
    console.error(`[ERROR] Failed to generate ${filename}:`, err.message);
    process.exit(1);
  }
}

async function generateAppleTouchIcon() {
  // Apple touch icon is 180x180
  const size = 180;
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${brandGreen}" rx="40"/>
      <text
        x="${size / 2}"
        y="${size / 2}"
        font-family="Inter, sans-serif"
        font-size="${Math.round(size * 0.6)}"
        font-weight="bold"
        fill="${white}"
        text-anchor="middle"
        dominant-baseline="middle"
      >K</text>
    </svg>
  `;

  const filepath = path.join(publicDir, 'apple-touch-icon.png');

  try {
    await sharp(Buffer.from(svg)).png().toFile(filepath);
    console.log(`[OK] Generated apple-touch-icon.png (180x180)`);
  } catch (err) {
    console.error(`[ERROR] Failed to generate apple-touch-icon.png:`, err.message);
    process.exit(1);
  }
}

async function main() {
  console.log('Generating PWA icons...\n');

  await generateIcon(192);
  await generateIcon(512);
  await generateAppleTouchIcon();

  console.log('\n[OK] All icons generated successfully!');
}

main();
