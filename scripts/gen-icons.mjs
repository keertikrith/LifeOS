// Renders the Life OS monochrome icon to PNGs. Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const svg = (pad = 0, rounded = true) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="96"' : ""} fill="#0a0a0a"/>
  <g transform="translate(256 256) scale(${1 - pad}) translate(-256 -256)">
    <circle cx="256" cy="256" r="132" fill="none" stroke="#fafafa" stroke-width="28"/>
    <circle cx="256" cy="256" r="36" fill="#fafafa"/>
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
