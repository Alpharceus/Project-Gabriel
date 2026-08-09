// Rasterize the Gabriel app icon set into app/icons/.
import sharp from "sharp";
import { mkdirSync } from "fs";

// Indigo-violet gradient tile, white "G" with a message-dot — matches the
// PWA accent (--accent #4f6ae0 → --accent-2 #7a5cd6).
const svg = (pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4f6ae0"/>
      <stop offset="1" stop-color="#7a5cd6"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${pad ? 0 : 115}" fill="url(#g)"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <text x="242" y="342" font-family="Segoe UI, Arial, sans-serif" font-size="300"
          font-weight="700" text-anchor="middle" fill="#ffffff">G</text>
    <circle cx="382" cy="330" r="34" fill="#ffffff"/>
    <circle cx="382" cy="330" r="16" fill="#5f63db"/>
  </g>
</svg>`;

mkdirSync("app/icons", { recursive: true });
await sharp(Buffer.from(svg())).resize(192, 192).png().toFile("app/icons/icon-192.png");
await sharp(Buffer.from(svg())).resize(512, 512).png().toFile("app/icons/icon-512.png");
await sharp(Buffer.from(svg(0.18))).resize(512, 512).png().toFile("app/icons/icon-maskable-512.png");
console.log("icons written to app/icons/");
