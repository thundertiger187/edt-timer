import * as F from '/workspace/rep-timer/src/figures.js';
import fs from 'node:fs'; import { chromium } from 'playwright';
const css = fs.readFileSync('/workspace/rep-timer/src/style.css','utf8');
const rows = F.FIGURES.map(ex => `<div class=row><b>${ex}</b>${[0,0.25,0.5,0.75,1].map(p=>`<div class=c>${F.frameSvg(ex,p)}<small>p=${p}</small></div>`).join('')}</div>`).join('');
fs.writeFileSync('/tmp/prev.html', `<html><style>${css} body{background:#0b0d10;color:#fff;padding:10px} .row{display:flex;gap:6px;align-items:center;margin-bottom:8px}.row b{width:90px}.c .fig{width:150px;height:125px;border:1px solid #333}</style><body>${rows}</body></html>`);
const b = await chromium.launch({channel:'chrome'}); const pg = await b.newPage({viewport:{width:900,height:620}});
await pg.goto('file:///tmp/prev.html'); await pg.screenshot({path:'/tmp/prev.png'}); await b.close();
