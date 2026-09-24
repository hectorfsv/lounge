#!/usr/bin/env node
/*
 * The hologram's pixel density, in REAL WebKit (Hector 2026-09-23, on his iPhone: "even when it's supposed to be at
 * 60fps it looks pixelated!"). His iPhone 18 Pro Max is a 3x touch screen; his Mac is a mouse and must not change.
 *   phone (touch, 3x): the globe drawn at the screen's own density, the glow enlarged in two steps, the nebula at 1x
 *   Mac (mouse, 2x):   2x, one step, 0.6x - exactly as before (his rule: the Mac never works harder)
 *   node test/holo-density.js [url]      (default: the local file) - prints PASS/FAIL lines, exit 1 on a FAIL
 */
const path = require('path');
const pw = require(path.join(__dirname, '../../webkit-check/node_modules/playwright'));
const URL = process.argv[2] || 'file://' + path.join(__dirname, '..', 'index.html');
(async () => {
  const b = await pw.webkit.launch(), out = [];
  const T = (c, m) => out.push((c ? 'PASS  ' : 'FAIL  ') + m);
  for (const [name, vp, dpr, touch] of [['phone', { width: 440, height: 956 }, 3, true], ['Mac', { width: 2026, height: 1037 }, 2, false]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dpr, hasTouch: touch });
    await ctx.route(/hectorfsv\.app\.n8n\.cloud/, r => /login/.test(r.request().postData() || '')
      ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' }) : r.abort());
    await ctx.route(/open-meteo|openfreemap|maplibre|youtube|statsapi|coingecko|stooq|finnhub|wheretheiss/, r => r.abort());   // widgets: not under test
    const p = await ctx.newPage();
    await p.goto(URL); await p.fill('#pw', 'x'); await p.click('#unlock');
    await p.waitForFunction(() => window.__lounge && window.__lounge.holo, null, { timeout: 15000 });
    await p.evaluate(() => window.__lounge.holo.open());
    await p.waitForFunction(() => window.__lounge.holo.frames > 6, null, { timeout: 15000 }).catch(() => {});
    const r = await p.evaluate(() => { const st = document.getElementById('holo-stage'), cv = document.getElementById('holo-cv'), nb = document.getElementById('holo-neb');
      return { W: Math.round(st.clientWidth), holo: cv.width, neb: nb.width, nebCss: Math.round(nb.getBoundingClientRect().width), fps: window.__lounge.holo.fps }; });
    if (touch) {
      T(r.holo === r.W * 3, 'phone: the globe is drawn at the screen’s own 3x (' + r.holo + ' for ' + r.W + ' points)');
      T(r.neb >= r.nebCss, 'phone: the nebula at full size, not stretched (' + r.neb + ' for ' + r.nebCss + ' points)');
      T(r.fps === 60, 'phone: still 60 a second (' + r.fps + ')');
    } else {
      T(r.holo === r.W * 2, 'Mac: the globe stays at 2x (' + r.holo + ' for ' + r.W + ' points)');
      T(r.neb === Math.max(1, Math.round(r.nebCss * Math.min(.6, 800 / r.nebCss))), 'Mac: the nebula stays at its old scale (' + r.neb + ' for ' + r.nebCss + ')');
      T(r.fps === 30, 'Mac: still 30 a second (' + r.fps + ')');
    }
    await ctx.close();
  }
  await b.close(); console.log(out.join('\n')); process.exit(out.some(l => l.startsWith('FAIL')) ? 1 : 0);
})();
