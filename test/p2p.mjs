// End-to-end P2P test: two isolated browser contexts connect through the real public
// signaling relays, play with random inputs, and compare sim hashes (desync detection).
// Usage: node build.mjs && node test/p2p.mjs <outDir> [seconds]
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const out = process.argv[2] || 'shots-p2p';
const secs = +process.argv[3] || 60;
mkdirSync(out, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = join('dist', decodeURIComponent(req.url.split('?')[0]));
  if (req.url === '/' || req.url.startsWith('/?')) p = 'dist/index.html';
  if (!existsSync(p)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
  res.end(readFileSync(p));
}).listen(8138);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const mk = async (name) => {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 620 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.errors.push(`[${name}] ${m.text()}`); });
  page.on('pageerror', (e) => page.errors.push(`[${name}] PAGEERROR ${e.message}`));
  await page.goto('http://localhost:8138/' + (process.env.LAG ? '?' + process.env.LAG : ''));
  return page;
};
const host = await mk('host');
const guest = await mk('guest');
await host.click('#btn-create');
const code = (await host.textContent('#lobby-code')).trim();
console.log('code', code);
await guest.fill('#in-code', code);
await guest.click('#btn-join');
const t0 = Date.now();
await host.waitForSelector('#btn-start:not(.hidden)', { timeout: 90000 }).catch(() => {});
console.log('connect time', ((Date.now() - t0) / 1000).toFixed(1), 's', '| host:', await host.textContent('#lobby-status'), '| guest:', await guest.textContent('#lobby-status'));
if (!(await host.$('#btn-start:not(.hidden)'))) { await host.screenshot({ path: `${out}/fail-host.png` }); console.log(host.errors.concat(guest.errors).join('\n')); process.exit(1); }
await host.click('#btn-start');
await guest.waitForFunction(() => window.__rg && window.__rg.st, null, { timeout: 15000 });

// Random-ish human inputs on both sides.
const actors = [host, guest].map((page, i) => (async () => {
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const end = Date.now() + secs * 1000;
  while (Date.now() < end) {
    const s = await page.evaluate(() => { const s = window.__rg.st; return s && { ph: s.ph }; }).catch(() => null);
    if (!s) break;
    if (s.ph === 'DRAFT') { const b = await page.$('.pl:not([disabled])'); if (b) await b.click().catch(() => {}); }
    else if (s.ph === 'CALL' || s.ph === 'HALF' || s.ph === 'PAT' || s.ph === 'OVER') {
      const opts = await page.$$('#panel [data-menu]:not([disabled])');
      if (opts.length && Math.random() < 0.3) await opts[Math.floor(Math.random() * opts.length)].click().catch(() => {});
    } else if (s.ph === 'KICK' || s.ph === 'PLAY') {
      const k = keys[Math.floor(Math.random() * 4)];
      await page.keyboard.down(k);
      if (Math.random() < 0.2) await page.keyboard.press(Math.random() < 0.5 ? 'Space' : 'KeyE');
      if (Math.random() < 0.1) await page.keyboard.press('Digit' + (1 + Math.floor(Math.random() * 4)));
      await page.waitForTimeout(80 + Math.random() * 200);
      await page.keyboard.up(k);
    }
    await page.waitForTimeout(50 + Math.random() * 100);
  }
})());
let n = 0;
const shotTimer = setInterval(async () => {
  n++;
  await host.screenshot({ path: `${out}/host-${String(n).padStart(2, '0')}.png` }).catch(() => {});
  await guest.screenshot({ path: `${out}/guest-${String(n).padStart(2, '0')}.png` }).catch(() => {});
}, Math.max(5000, secs * 1000 / 8));
await Promise.all(actors);
clearInterval(shotTimer);
const info = async (p) => p.evaluate(() => { const s = window.__rg.sess, st = s.state; return { frame: st.frame, ph: st.ph, score: st.teams.map((t) => t.score), rtt: Math.round(s.rtt), rollbacks: s.rollbacks, rollFrames: s.rollFrames, desync: s.desync, hashes: s.myHashes.size }; });
console.log('host ', JSON.stringify(await info(host)));
console.log('guest', JSON.stringify(await info(guest)));
const errs = host.errors.concat(guest.errors).filter((e) => !e.includes('favicon'));
console.log('errors:', errs.length ? '\n' + errs.slice(0, 30).join('\n') : 'none');
await browser.close();
server.close();
