/**
 * Generate OG default image for SManga
 * Run: node scripts/generate-og-default.mjs
 * Output: apps/frontend/public/og-default.png (1200x630, <200KB)
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputPath = join(__dirname, '..', 'apps', 'frontend', 'public', 'og-default.png');

// SManga brand colors
// Primary bg: pink-50 → zinc-50 gradient
// Headline: zinc-900 (#18181B)
// Subhead: zinc-600 (#52525B)
// Muted: zinc-500 (#71717A)
// Accent: pink-500 (#EC4899)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDF2F8" />
      <stop offset="100%" stop-color="#F4F4F5" />
    </linearGradient>
    <linearGradient id="accentLine" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#EC4899" />
      <stop offset="100%" stop-color="#F472B6" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Decorative circle top-right -->
  <circle cx="1100" cy="80" r="180" fill="#FDF2F8" opacity="0.6"/>
  <circle cx="1100" cy="80" r="100" fill="#FCE7F3" opacity="0.5"/>

  <!-- Decorative circle bottom-left -->
  <circle cx="80" cy="580" r="120" fill="#F4F4F5" opacity="0.7"/>

  <!-- Book icon (simplified open book glyph) -->
  <g transform="translate(100, 180)" opacity="0.15">
    <rect x="0" y="0" width="60" height="80" rx="4" fill="#18181B"/>
    <rect x="70" y="0" width="60" height="80" rx="4" fill="#18181B"/>
    <rect x="28" y="0" width="4" height="80" fill="#18181B"/>
    <rect x="98" y="0" width="4" height="80" fill="#18181B"/>
  </g>

  <!-- Pink accent left bar -->
  <rect x="0" y="200" width="6" height="230" fill="#EC4899" rx="3"/>

  <!-- Headline: SManga -->
  <text
    x="100"
    y="340"
    font-family="Newsreader, Georgia, 'Times New Roman', serif"
    font-size="148"
    font-weight="700"
    fill="#18181B"
    letter-spacing="-2"
  >SManga</text>

  <!-- Subhead -->
  <text
    x="104"
    y="410"
    font-family="Roboto, Arial, Helvetica, sans-serif"
    font-size="40"
    font-weight="400"
    fill="#52525B"
    letter-spacing="0.5"
  >&#272;&#7885;c truy&#7879;n ch&#7919; Vi&#7879;t online</text>

  <!-- Domain -->
  <text
    x="106"
    y="460"
    font-family="Roboto, Arial, Helvetica, sans-serif"
    font-size="22"
    font-weight="400"
    fill="#A1A1AA"
    letter-spacing="1"
  >smanga.shop</text>

  <!-- Pink accent stripe bottom -->
  <rect x="0" y="614" width="1200" height="16" fill="url(#accentLine)"/>
</svg>`;

const png = await sharp(Buffer.from(svg))
  .resize(1200, 630, { fit: 'fill' })
  .png({ quality: 90, compressionLevel: 9 })
  .toBuffer();

writeFileSync(outputPath, png);
console.log(`Wrote ${png.length} bytes (${(png.length / 1024).toFixed(1)} KB) to ${outputPath}`);
