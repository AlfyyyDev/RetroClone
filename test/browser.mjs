// Drives the built game in headless Chrome: practice vs CPU, screenshots each phase.
// Usage: node build.mjs && node test/browser.mjs <outDir>
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const out = process.argv[2] || 'shots';
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = join('dist', decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  if (p.endsWith('dist\\') || p.endsWith('dist/')) p = join(p, 'index.html');
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(8137);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const vp = process.env.MOBILE ? { width: 844, height: 390 } : { width: 1280, height: 720 };
const page = await browser.newPage({ viewport: vp, hasTouch: !!process.env.MOBILE });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto('http://localhost:8137/');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/01-menu.png` });
await page.click('#btn-cpu');
await page.waitForTimeout(300);
const ph = () => page.evaluate(() => window.__rg.st && window.__rg.st.ph);
let shots = 0;
const snap = async (name) => page.screenshot({ path: `${out}/${String(++shots + 1).padStart(2, '0')}-${name}.png` });
await snap('draft');
// Draft by clicking the first available player when it's our turn.
for (let k = 0; k < 400 && (await ph()) === 'DRAFT'; k++) {
  const b = await page.$('.pl:not([disabled])');
  if (b) await b.click().catch(() => {});
  await page.waitForTimeout(120);
}
await snap('draft-done');
const seen = new Set();
const t0 = Date.now();
while (Date.now() - t0 < (+process.env.SECS || 90) * 1000) {
  const p = await ph();
  const st = await page.evaluate(() => { const s = window.__rg.st; return s && { ph: s.ph, t: s.t, pl: s.pl && s.pl.ph, k: s.kick && s.kick.tm, poss: s.g && s.g.poss }; });
  if (!st) break;
  const tag = `${st.ph}-${st.pl || ''}`;
  if (!seen.has(tag) && st.t > 20) { seen.add(tag); await snap(tag); }
  if (st.ph === 'CALL') { const c = await page.$('.card:not([disabled])'); if (c) await c.click().catch(() => {}); }
  if (st.ph === 'KICK' && st.k === 0) { await page.keyboard.press('Space'); }
  if (st.ph === 'PAT') await page.keyboard.press('Digit1');
  if (st.ph === 'HALF') { const c = await page.$('.choice:not([disabled])'); if (c) await c.click().catch(() => {}); }
  if (st.ph === 'PLAY' && st.pl === 'live' && st.poss === 0) {
    // Throw to the first receiver after a moment.
    const t = await page.evaluate(() => window.__rg.st.pl.t);
    if (t > 60 && t < 70) await page.keyboard.press('Digit1');
  }
  await page.waitForTimeout(100);
}
const final = await page.evaluate(() => { const s = window.__rg.st; return { ph: s.ph, score: s.teams.map((t) => t.score), q: s.g && s.g.q, clock: s.g && s.g.clock, frame: s.frame }; });
console.log('final', JSON.stringify(final));
console.log('phases seen', [...seen].join(' '));
console.log('errors', errors.length ? errors.join('\n') : 'none');
await browser.close();
server.close();
