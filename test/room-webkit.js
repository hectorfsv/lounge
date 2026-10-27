#!/usr/bin/env node
/* The room camera tile in REAL WebKit (Safari's engine), against a fake camera service on 127.0.0.1 that serves a real
   multipart MJPEG stream and counts its open connections. It proves what the Chromium harness (./test/run.sh, mode
   room) cannot: WebKit draws the MJPEG stream in an <img>, and Stop, folding the tile, the phone's hub folding away and
   the lock really close the connection (the real service lets the camera rest 20 s after the last one closes).
   The n8n login is answered by a route (0 executions); every other outside address is refused except the fonts; the
   real camera is never asked.
     cd projects/lounge && node test/room-webkit.js
   Uses ../webkit-check's version-locked Playwright (1.51.0, WebKit 18.4). Muted, a hard time limit, the browser closed
   in finally. Pictures of each state land in test/build/room-wk/. */
const path = require('path'), fs = require('fs'), http = require('http'), { execFileSync } = require('child_process');
const { webkit } = require(path.join(__dirname, '..', '..', 'webkit-check', 'node_modules', 'playwright'));
const KILL = setTimeout(() => { console.log('FAIL  hard time limit (4 min)'); process.exit(2); }, 240000);
const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'build', 'room-wk');
fs.mkdirSync(OUT, { recursive: true });
// two frames that look nothing alike (the black hole, the Vader face) and a still, from pictures the page already has
const sips = (src, args, out) => execFileSync('sips', ['-s', 'format', 'jpeg', ...args, path.join(ROOT, src), '--out', path.join(OUT, out)], { stdio: 'ignore' });
sips('gargantua.jpg', ['-z', '360', '640'], 'a.jpg'); sips('face.png', ['-z', '360', '640'], 'b.jpg'); sips('gargantua.jpg', ['-z', '180', '320'], 'still.jpg');
const A = fs.readFileSync(path.join(OUT, 'a.jpg')), B = fs.readFileSync(path.join(OUT, 'b.jpg')), STILL = fs.readFileSync(path.join(OUT, 'still.jpg'));

// the fake service: the real one's /state, /last.jpg and /stream, open to any origin (the real one answers only the Lounge)
const st = { state: 'idle', msg: 'Open this page to wake the camera.', age: 99, last_photo: '2026-10-27T02:48:17' };
let open = 0, total = 0;
const srv = http.createServer((q, r) => {
  const p = q.url.split('?')[0], cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
  if (p === '/state') { r.writeHead(200, { 'Content-Type': 'application/json', ...cors }); r.end(JSON.stringify({ ...st, viewers: open })); return; }
  if (p === '/last.jpg') { r.writeHead(200, { 'Content-Type': 'image/jpeg', ...cors }); r.end(STILL); return; }
  if (p === '/stream') {
    open++; total++;
    r.writeHead(200, { 'Content-Type': 'multipart/x-mixed-replace; boundary=f', 'Cache-Control': 'no-cache, no-store' });
    let i = 0, gone = false;
    const iv = setInterval(() => {   // 5 frames a second, only while "live" (waking sends nothing, like the real service)
      if (st.state !== 'live') return;
      const j = (i++ % 2) ? B : A;
      r.write('--f\r\nContent-Type: image/jpeg\r\nContent-Length: ' + j.length + '\r\n\r\n'); r.write(j); r.write('\r\n');
    }, 200);
    const bye = () => { if (!gone) { gone = true; clearInterval(iv); open--; } };
    q.on('close', bye); r.on('close', bye);
    return;
  }
  r.writeHead(404); r.end();
});

let fails = 0;
const T = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + m); if (!c) fails++; };
const waitFor = async (f, ms) => { const t = Date.now(); while (!f() && Date.now() - t < ms) await new Promise(r => setTimeout(r, 50)); return f(); };

(async () => {
  let browser;
  try {
    await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
    const base = 'http://127.0.0.1:' + srv.address().port;
    browser = await webkit.launch();
    for (const vp of [{ w: 2026, h: 1037, mobile: false, tag: 'desktop 2026x1037' }, { w: 440, h: 956, mobile: true, tag: 'iPhone 440x956' }]) {
      st.state = 'idle'; st.msg = 'Open this page to wake the camera.'; st.age = 99;
      const t0 = total;
      let refuse = false;   // the lock: the next login answers 401
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.mobile, hasTouch: vp.mobile });
      await ctx.addInitScript(b => {
        window.ROOM_CAM = b;
        const p = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { this.muted = true; this.volume = 0; return p.call(this); };
      }, base);
      await ctx.route(u => u.protocol !== 'file:' && !u.href.startsWith(base) && !/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname), route => {
        if (route.request().url().startsWith('https://hectorfsv.app.n8n.cloud/'))
          return route.fulfill({ status: refuse ? 401 : 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(refuse ? { error: 'unauthorized' } : { ok: true }) });
        return route.abort();
      });
      const page = await ctx.newPage();
      const errs = []; page.on('pageerror', e => errs.push(String(e.message || e)));
      const click = async sel => { try { await page.click(sel, { timeout: 3000 }); return 'mouse'; } catch (e) { await page.$eval(sel, el => el.click()); return 'script'; } };
      await page.goto('file://' + path.join(ROOT, 'index.html'));
      await page.fill('#pw', 'test'); await page.click('#unlock');
      await page.waitForSelector('#scr-chat.on', { timeout: 10000 });
      const tag = vp.tag;
      const stillOK = await page.waitForFunction(() => { const s = document.getElementById('rc-still'); return s && !s.hidden && s.naturalWidth === 320; }, null, { timeout: 10000 }).then(() => true, () => false);
      T(stillOK && total === t0, tag + ': the newest picture shows, and no stream opened by itself (' + (total - t0) + ')');
      const cap = await page.textContent('#rc-cap');
      T(/^Last picture · (Today|[A-Z][a-z]{2} \d+) 02:48$/.test(cap || ''), tag + ': labelled with its time (' + cap + ')');
      await page.locator('.hb-room').scrollIntoViewIfNeeded();
      await page.locator('.hb-room').screenshot({ path: path.join(OUT, 'idle-' + vp.w + '.png') });
      const how = await click('#rc-watch');
      T(await waitFor(() => open === 1, 5000), tag + ': Watch live opens one stream (' + how + ' click)');
      const waking = await page.textContent('#rc-msg-t');
      T(/Waking the camera/.test(waking || ''), tag + ': while it wakes the screen says so (' + waking + ')');
      st.state = 'live'; st.msg = ''; st.age = 0.3;
      const drawn = await page.waitForFunction(() => {
        const f = document.getElementById('rc-live'), im = f && f.contentDocument && f.contentDocument.querySelector('img');
        return document.getElementById('rc-cap').classList.contains('live') && !!im && im.naturalWidth === 640;
      }, null, { timeout: 8000 }).then(() => true, () => false);
      T(drawn, tag + ': WebKit draws the MJPEG stream (640 wide, inside its frame) and marks it Live');
      const scr = page.locator('#rc-screen');
      const s1 = await scr.screenshot(); await page.waitForTimeout(700); const s2 = await scr.screenshot();
      T(!s1.equals(s2), tag + ': the live picture moves from frame to frame');
      await page.locator('.hb-room').screenshot({ path: path.join(OUT, 'live-' + vp.w + '.png') });
      await click('#rc-stop');
      T(await waitFor(() => open === 0, 4000), tag + ': Stop closes the connection (' + open + ' open)');
      await click('#rc-watch'); await waitFor(() => open === 1, 4000);
      await click('#rc-h');
      T(await waitFor(() => open === 0, 4000), tag + ': folding the tile closes it (' + open + ' open)');
      await click('#rc-h'); await page.waitForTimeout(1500);
      T(open === 0, tag + ': unfolding does not open it again');
      if (vp.mobile) {
        await click('#rc-watch'); await waitFor(() => open === 1, 4000);
        await click('#now');
        T(await waitFor(() => open === 0, 4000), tag + ': the hub folding away closes it (' + open + ' open)');
        await click('#now'); await page.waitForTimeout(800);
      }
      await click('#rc-watch'); await waitFor(() => open === 1, 4000);
      refuse = true; await page.$eval('#ib-refresh', el => el.click());
      const locked = await page.waitForSelector('#scr-lock.on', { timeout: 6000 }).then(() => true, () => false);
      T(locked && await waitFor(() => open === 0, 4000), tag + ': the lock closes it (' + open + ' open)');
      T(await page.$eval('#rc-still', el => !el.getAttribute('src')), tag + ': and drops the picture of his room');
      T(errs.length === 0, tag + ': no page errors (' + errs.join(' | ').slice(0, 200) + ')');
      await ctx.close();
    }
  } catch (e) {
    T(false, 'the run stopped: ' + (e && e.message || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    srv.close(); clearTimeout(KILL);
    console.log(fails ? 'FAILURES: ' + fails : 'ALL GREEN');
    process.exit(fails ? 1 : 0);
  }
})();
