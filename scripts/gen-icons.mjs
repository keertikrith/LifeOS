// Renders the Life OS diya icon to PNGs. Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const svg = (pad = 0, rounded = true) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F28A1B"/><stop offset="1" stop-color="#F5B700"/></linearGradient>
    <linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#D64933"/><stop offset="1" stop-color="#FFE27A"/></linearGradient>
  </defs>
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ""} fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <path d="M256 92c38 44 56 78 56 108a56 56 0 0 1-112 0c0-30 18-64 56-108z" fill="url(#fl)"/>
    <path d="M256 150c16 22 24 38 24 52a24 24 0 0 1-48 0c0-14 8-30 24-52z" fill="#FFF3C4"/>
    <path d="M96 288h320c0 70-64 124-160 124S96 358 96 288z" fill="#7A1F2B"/>
    <rect x="92" y="272" width="328" height="26" rx="13" fill="#3B1D12"/>
    <circle cx="176" cy="338" r="9" fill="#F5B700"/><circle cx="256" cy="358" r="9" fill="#F5B700"/><circle cx="336" cy="338" r="9" fill="#F5B700"/>
  </g>
</svg>`;

writeFileSync("public/icons/icon.svg", svg());
for (const [name, size, pad, rounded] of [
  ["icon-192.png", 192, 0, true],
  ["icon-512.png", 512, 0, true],
  ["icon-maskable-512.png", 512, 0.18, false], // full-bleed with safe zone
  ["apple-touch-icon.png", 180, 0, false],
]) {
  await sharp(Buffer.from(svg(pad, rounded))).resize(size, size).png().toFile(`public/icons/${name}`);
}
console.log("icons written");
