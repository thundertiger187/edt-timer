// Rendert die PNG-Icons aus icons/icon.svg (Chrome headless).
import { chromium } from 'playwright'; import fs from 'node:fs'; import path from 'node:path';
const D = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/icons');
const svg = fs.readFileSync(path.join(D, 'icon.svg'), 'utf8');
const b = await chromium.launch({ channel: 'chrome' }); const p = await b.newPage();
const shot = async (name, size, pad, bg) => {
  await p.setViewportSize({ width: size, height: size });
  const inner = svg.replace('<svg ', `<svg width="${size - 2 * pad}" height="${size - 2 * pad}" `);
  await p.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:${size}px">${inner}</body></html>`);
  await p.screenshot({ path: path.join(D, name), omitBackground: bg === 'transparent' });
};
await shot('icon-192.png', 192, 0, 'transparent');
await shot('icon-512.png', 512, 0, 'transparent');
await shot('maskable-512.png', 512, 0, '#0b0d10');
await shot('apple-touch-icon.png', 180, 0, '#0b0d10');
await b.close(); console.log('Icons erzeugt');
