// Kopiert src/ nach dist/ und setzt eine Inhalts-Version in Service Worker und App.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src'), DIST = path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json')));
fs.rmSync(DIST, { recursive: true, force: true });
const files = []; const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : files.push(p); }); walk(SRC);
const h = crypto.createHash('sha256'); files.sort().forEach(f => h.update(fs.readFileSync(f)));
const ver = `${pkg.version}-${h.digest('hex').slice(0, 8)}`;
for (const f of files) {
  const out = path.join(DIST, path.relative(SRC, f)); fs.mkdirSync(path.dirname(out), { recursive: true });
  if (/\.(js|html|css|webmanifest)$/.test(f)) {
    let txt = fs.readFileSync(f, 'utf8').replaceAll('__VERSION__', ver);
    // v1.6.1 Cache-Busting: Skripte und CSS mit Build-Kennung laden, damit nie eine alte Datei aus dem HTTP-Cache kommt
    const q = `?v=${ver.split('-')[1]}`;
    if (f.endsWith('.js') && !f.endsWith('sw.js')) txt = txt.replace(/(from\s+['"]\.\/[\w-]+\.js)(['"])/g, `$1${q}$2`);
    if (f.endsWith('.html')) txt = txt.replace(/(href="style\.css|src="app\.js)"/g, `$1${q}"`);
    fs.writeFileSync(out, txt);
  }
  else fs.copyFileSync(f, out);
}
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
console.log(`dist/ gebaut, Version ${ver}, ${files.length} Dateien`);
