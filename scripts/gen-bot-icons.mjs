// Renders one PNG per bot body and colour into public/bot-icons. Notification banners
// cannot draw the live mascot, so they use these stills. Run with:
// node --experimental-strip-types scripts/gen-bot-icons.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { CARVED_BODIES, CARVED_BODY_IDS } from "../shared/carved-bodies.ts";
import { MASCOT_BODIES, MASCOT_BODY_IDS } from "../shared/mascot-bodies.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "bot-icons");
const COLORS = {
  green: "#009957", blue: "#377FE6", red: "#D94B52", orange: "#E78531", purple: "#8057C8", cyan: "#0EA5C6",
  pink: "#D84F8B", yellow: "#D8A729", teal: "#01A492", coral: "#E5634E", silver: "#A8ADB4", chrome: "#B3BAC4",
};
const CHROME = ["#F1F4F7", "#AEB8C3", "#66717E"];

function mix(hex, toward, t) {
  const a = Number.parseInt(hex.slice(1), 16);
  const b = Number.parseInt(toward.slice(1), 16);
  const channel = (shift) => Math.round(((a >> shift) & 255) + ((((b >> shift) & 255) - ((a >> shift) & 255)) * t));
  return `#${[channel(16), channel(8), channel(0)].map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}
function gradient(color) {
  if (color === "chrome") return CHROME;
  const fill = COLORS[color];
  return [mix(fill, "#ffffff", 0.55), fill, mix(fill, "#000000", 0.42)];
}
function vivid(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return hex;
  const s = Math.min(1, (l > 0.5 ? d / (2 - max - min) : d / (max + min)) * 1.15);
  const h = (max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) / 6;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (x) => {
    const t = (x + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return `#${[ch(h + 1 / 3), ch(h), ch(h - 1 / 3)].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("")}`;
}
function fills(body, color) {
  const accent = vivid(COLORS[color]);
  if (body.paint === "bone") return { body: body.bone ?? "#f1ede6", accent };
  if (body.paint === "pale") return { body: mix(COLORS[color], "#ffffff", 0.86), accent };
  return { body: accent, accent };
}
const round = (n) => Math.round(n * 100) / 100;
function carvedFace(body) {
  const e = body.eyes;
  const spread = e.dx;
  const eyes = [-1, 1].map((side) => {
    const x = e.cx + side * spread;
    return `<rect x="${round(x - e.w / 2)}" y="${round(e.cy - e.h / 2)}" width="${e.w}" height="${e.h}" rx="${round(Math.min(e.w, e.h) / 2)}" fill="${e.ink}"/>`;
  }).join("");
  const mw = e.dx * 0.46;
  const my = e.mouthY ?? e.cy + e.h * 0.5 + e.dx * 0.42;
  const smile = e.mouth
    ? `<path d="M${round(e.cx - mw)} ${round(my - mw * 0.5 * 0.35)} Q${round(e.cx)} ${round(my + mw * 0.5)} ${round(e.cx + mw)} ${round(my - mw * 0.5 * 0.35)}" fill="none" stroke="${e.mouthInk}" stroke-width="${round(e.w * 0.36)}" stroke-linecap="round"/>`
    : "";
  return `${eyes}${smile}`;
}
function mascotSvg(id, color) {
  const body = MASCOT_BODIES[id];
  const [light, mid, edge] = gradient(color);
  const shape = body.body.replace("{{GRADIENT}}", "url(#g)");
  const anchor = body.anchor;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-15 -15 258.541 258.541">
    <defs>
      <linearGradient id="g" x1="1" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${light}"/><stop offset="55%" stop-color="${mid}"/><stop offset="100%" stop-color="${edge}"/>
      </linearGradient>
      <clipPath id="c" transform="${body.fit}">${body.clip}</clipPath>
    </defs>
    <g transform="${body.fit}">${shape}</g>
    <g clip-path="url(#c)">
      <g transform="translate(${anchor.x} ${anchor.y}) scale(${anchor.scale}) translate(-120 -122.5)">
        <ellipse cx="92" cy="112" rx="18" ry="28" fill="#1c2430"/>
        <ellipse cx="148" cy="112" rx="18" ry="28" fill="#1c2430"/>
        <path d="M96 158 Q120 178 144 158" fill="none" stroke="#1c2430" stroke-width="8" stroke-linecap="round"/>
      </g>
    </g>
  </svg>`;
}
function carvedSvg(id, color) {
  const body = CARVED_BODIES[id];
  const paint = fills(body, color);
  const resolve = (fill) => fill === "body" ? paint.body : fill === "accent" ? paint.accent : fill;
  const parts = body.parts.map((part) => `<path d="${part.d}" fill="${resolve(part.fill)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -14 268 268">
    <defs><clipPath id="c"><path d="${body.clip}"/></clipPath></defs>
    ${parts}
    <g clip-path="url(#c)">${carvedFace(body)}</g>
  </svg>`;
}
function png(svg) {
  return new Resvg(svg, { fitTo: { mode: "width", value: 192 } }).render().asPng();
}

mkdirSync(root, { recursive: true });
const colors = Object.keys(COLORS);
let count = 0;
for (const id of MASCOT_BODY_IDS) for (const color of colors) { writeFileSync(join(root, `${id}-${color}.png`), png(mascotSvg(id, color))); count++; }
for (const id of CARVED_BODY_IDS) for (const color of colors) { writeFileSync(join(root, `${id}-${color}.png`), png(carvedSvg(id, color))); count++; }
console.log(`wrote ${count} icons to ${root}`);
