const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const C = require('../extension/core.js');
const root = path.join(__dirname, '..');
const savedInside = fs.readFileSync(path.join(root, 'Đặt vé sự kiện.html'), 'utf8');
const savedOutside = fs.readFileSync(path.join(root, fs.readdirSync(root).find(n => n.startsWith('VIEWING') && n.endsWith('.html'))), 'utf8');
const counter = fs.readFileSync(path.join(root, 'cpn2.txt'), 'utf8');
const suppliedContinue = fs.readFileSync(path.join(root, 'cpn5.txt'), 'utf8');
const config = extra => C.validate({ ...C.DEFAULTS, saleTime: '2026-09-30T12:00:00', ...extra });
function dom(html) {
  const d = new JSDOM(html, { url: C.DEFAULTS.insideUrl, runScripts: 'outside-only', pretendToBeVisual: true });
  // Retain the saved DOM and inline states; enormous generated style sheets make
  // jsdom's synthetic style resolution slow and cannot emulate browser layout anyway.
  d.window.document.querySelectorAll('style').forEach(s => s.remove());
  const originalClose = d.window.close.bind(d.window);
  d.window.close = () => { d.window.dispatchEvent(new d.window.Event('pagehide')); originalClose(); };
  // jsdom has no layout engine; emulate geometry only. CSS/disabled checks remain real.
  d.window.HTMLElement.prototype.getClientRects = function () { return this.isConnected ? [{}] : []; };
  for (const name of ['core.js', 'dom.js']) d.window.eval(fs.readFileSync(path.join(root, 'extension', name), 'utf8'));
  return d;
}
function makeAvailable(d, max = 4, delay = 0) {
  const D = d.window.TBDom;
  const row = D.inspect(d.window.document, 'RADIANT').row;
  const tag = row.querySelector('.tag');
  tag.parentElement.innerHTML = counter;
  const input = row.querySelector('input');
  const plus = [...row.querySelectorAll('button')].find(b => b.textContent.trim() === '+');
  let plusClicks = 0;
  d.window.document.querySelector('button.bottomBooking').outerHTML = suppliedContinue;
  const button = d.window.document.querySelector('button.bottomBooking');
  button.disabled = true;
  plus.onclick = () => {
    plusClicks++;
    d.window.setTimeout(() => {
      input.value = String(Math.min(max, Number(input.value) + 1));
      input.setAttribute('value', input.value);
      plus.disabled = Number(input.value) >= max;
      button.disabled = Number(input.value) === 0;
    }, delay);
  };
  return { row, input, plus, button, clicks: () => plusClicks };
}
function harness(d, overrides = {}, targetOffset = -1000, checkoutReply = { ok: true, allowed: true }, options = {}) {
  const w = d.window;
  const c = config(overrides);
  c.targetMs = Date.now() + targetOffset;
  const run = { id: 'test', tabId: 1, active: true, config: c, clock: { offsetMs: 0 }, expiresAt: Date.now() + 60000, refreshStages: [], refreshCount: 0, status: 'test' };
  const messages = []; let listener; let claims = 0;
  let gate = null;
  w.chrome = { runtime: {
    onMessage: { addListener(fn) { listener = fn; } },
    async sendMessage(message) {
      messages.push(message);
      if (message.type === 'GET') return { ok: true, run: structuredClone(run) };
      if (message.type === 'CHECKOUT') { claims++; return checkoutReply; }
      if (message.type === 'CAPTCHA_WAIT') {
        gate = { id: 'captcha-test', afterCheckout: claims > 0 };
        if (options.captchaWaitDelay) await new Promise(resolve => w.setTimeout(resolve, options.captchaWaitDelay));
        return { ok: true, allowed: true, captcha: gate, expiresAt: Date.now() + 600000 };
      }
      if (message.type === 'CAPTCHA_RESUME') return { ok: true, allowed: true, retryCheckout: gate?.afterCheckout };
      if (message.type === 'REFRESH') return { ok: true, allowed: true };
      return { ok: true };
    }
  } };
  w.eval(fs.readFileSync(path.join(root, 'extension/content.js'), 'utf8'));
  return { messages, claims: () => claims, stop: () => listener({ type: 'RUN', run: { ...run, active: false } }, {}, () => {}) };
}
async function until(predicate, timeout = 4000) {
  const start = Date.now();
  while (!predicate()) { if (Date.now() - start > timeout) throw Error('Timed out waiting for automation'); await new Promise(resolve => setTimeout(resolve, 20)); }
}
// Structure modeled from the supplied screenshot and the captcha-module CSS in
// the saved HTML. No CAPTCHA image, slider movement or solution is generated.
function addCaptcha(d) {
  const node = d.window.document.createElement('div');
  node.className = 'captcha-module_wrapper__BQNzi';
  node.innerHTML = '<div class="captcha-module_header__MmwHT">Xác Minh Người Dùng</div><p>Chống bot tự động mua vé</p><div class="captcha-module_dragSlideBar__OAgFk"></div>';
  d.window.document.body.append(node); return node;
}
function markSolved(d, node) {
  const message = d.window.document.createElement('div');
  message.className = 'captcha-module_messageSuccess__EhQLo'; message.textContent = 'Xác minh thành công';
  node.append(message);
}
test('Date + actual Age, not max-age or fixed 45 minutes', () => {
  const epoch = Date.parse('Wed, 30 Sep 2026 05:00:00 GMT');
  const sample = C.clockSample(new Headers({ date: new Date(epoch).toUTCString(), age: '3178', 'cache-control': 'max-age=3600' }), epoch + 3178000, epoch + 3178100);
  assert.equal(sample.offsetMs, -50); assert.equal(sample.age, 3178);
  assert.equal(sample.uncertaintyMs, 1050);
});
test('Manual +45 replaces Age; cached response with missing Age is rejected', () => {
  const epoch = Date.parse('2026-09-30T05:00:00Z');
  const h = new Headers({ date: new Date(epoch).toUTCString(), age: '300' });
  assert.equal(C.clockSample(h, epoch, epoch, 'manual', 45).offsetMs, 2700000);
  assert.throws(() => C.clockSample(new Headers({ date: new Date(epoch).toUTCString(), 'x-tkb-cache': 'HIT' }), epoch, epoch), /thiếu Age/);
  assert.throws(() => C.clockSample(new Headers({ date: 'invalid' }), epoch, epoch));
});
test('Explicit Vietnam time and event-scoped navigation', () => {
  const c = config();
  assert.equal(c.targetMs, Date.parse('2026-09-30T05:00:00Z'));
  assert.equal(C.pageKind(c.insideUrl, c), 'inside');
  assert.equal(C.pageKind(c.insideUrl.replace('26611', '26612'), c), 'other');
  assert.equal(C.pageKind(c.insideUrl.replace('select-ticket', 'payment'), c), 'other');
  assert.throws(() => config({ insideUrl: 'https://evil.example/events/26611/bookings/1/select-ticket' }));
});
test('Exact/early reload stages, keep-inside precedence, retry bounds', () => {
  const c = config({ mode: 'early', leadMs: 1000 });
  const r = { config: c, refreshStages: [], refreshCount: 0 };
  assert.equal(C.refreshReason(r, c.targetMs - 1001, false), null);
  assert.equal(C.refreshReason(r, c.targetMs - 1000, false), 'scheduled');
  assert.equal(C.refreshReason(r, c.targetMs, true), null);
  r.refreshStages = ['scheduled'];
  assert.equal(C.refreshReason(r, c.targetMs, false), 'exact-fallback');
  r.refreshStages.push('exact-fallback'); c.retryRefresh = true; r.refreshCount = c.maxRefresh;
  assert.equal(C.refreshReason(r, c.targetMs + 10000, false), null);
});
test('Actual saved snapshot: RADIANT is sold out and has no counter', () => {
  const d = dom(savedInside);
  const s = d.window.TBDom.inspect(d.window.document, 'radiant');
  assert.equal(s.state, 'found'); assert.equal(s.soldOut, true); assert.equal(s.quantity, null);
  assert.equal(s.plus, undefined); assert.equal(s.others.length, 0);
  d.window.close();
});
test('Matching is exact and does not pick summary, GOLD, or radiant-plus', () => {
  const d = dom(savedInside);
  assert.equal(d.window.TBDom.inspect(d.window.document, 'radient').state, 'missing');
  const s = d.window.TBDom.inspect(d.window.document, 'RADIANT');
  const duplicate = s.row.cloneNode(true); s.row.after(duplicate);
  assert.equal(d.window.TBDom.inspect(d.window.document, 'RADIANT').state, 'ambiguous');
  d.window.close();
});
test('Delayed UI updates: exactly four increments and one checkout', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d, 4, 90); let checkouts = 0;
    controls.button.onclick = () => checkouts++;
    const h = harness(d);
    await until(() => checkouts === 1);
    await new Promise(r => setTimeout(r, 250));
    assert.equal(controls.input.value, '4'); assert.equal(controls.clicks(), 4);
    assert.equal(h.claims(), 1); assert.equal(checkouts, 1);
    assert.equal(h.messages.filter(m => m.type === 'REFRESH').length, 0);
  } finally { d.window.close(); }
});
test('Other tier in cart prevents both increment and checkout', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d);
    const other = d.window.TBDom.rows(d.window.document).find(row => row !== controls.row && row.querySelector('input'));
    other.querySelector('input').value = '4';
    const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'STOP'));
    assert.equal(controls.clicks(), 0); assert.equal(h.claims(), 0);
    assert.match(h.messages.find(m => m.type === 'STOP').reason, /hạng khác/);
  } finally { d.window.close(); }
});
test('Site limit below four never submits a partial order or reloads the cart', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d, 2);
    const h = harness(d, { keepInside: false, retryRefresh: true });
    await until(() => controls.input.value === '2');
    await new Promise(r => setTimeout(r, 350));
    assert.equal(controls.clicks(), 2); assert.equal(h.claims(), 0);
    assert.equal(h.messages.filter(m => m.type === 'REFRESH').length, 0);
  } finally { d.window.close(); }
});
test('Sold out snapshot does not increment, submit or reload in keep-inside mode', async () => {
  const d = dom(savedInside);
  try {
    const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'STATUS'));
    assert.equal(h.claims(), 0); assert.equal(h.messages.filter(m => m.type === 'REFRESH').length, 0);
  } finally { d.window.close(); }
});
test('Disabled outer buy button respects native, aria and CSS states', () => {
  const d = dom(savedOutside), D = d.window.TBDom;
  const b = d.window.document.querySelector('#buynow-btn');
  assert.ok(D.enabled(b)); b.disabled = true; assert.ok(!D.enabled(b));
  b.disabled = false; b.setAttribute('aria-disabled', 'true'); assert.ok(!D.enabled(b));
  b.removeAttribute('aria-disabled'); b.style.pointerEvents = 'none'; assert.ok(!D.enabled(b));
  d.window.close();
});
test('Early enabled outer button is clicked once without a reload', async () => {
  const d = dom(savedOutside); d.reconfigure({ url: C.DEFAULTS.eventUrl });
  try {
    const button = d.window.document.querySelector('#buynow-btn'); let clicks = 0;
    button.closest('a').removeAttribute('href');
    button.addEventListener('click', () => clicks++);
    const h = harness(d, {}, 60000);
    await until(() => clicks === 1);
    await new Promise(r => setTimeout(r, 300));
    assert.equal(clicks, 1); assert.equal(h.messages.filter(m => m.type === 'REFRESH').length, 0);
  } finally { d.window.close(); }
});
test('Disabled outer button opening early is detected; no forced enabling', async () => {
  const d = dom(savedOutside); d.reconfigure({ url: C.DEFAULTS.eventUrl });
  try {
    const button = d.window.document.querySelector('#buynow-btn'); let clicks = 0;
    button.closest('a').removeAttribute('href'); button.disabled = true;
    button.addEventListener('click', () => clicks++);
    harness(d, {}, 60000);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(clicks, 0); assert.equal(button.disabled, true);
    button.disabled = false;
    await until(() => clicks === 1);
  } finally { d.window.close(); }
});
test('Turning off early purchase waits even when inside controls are available', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d); const h = harness(d, { earlyBuy: false }, 60000);
    await new Promise(r => setTimeout(r, 150));
    assert.equal(controls.clicks(), 0); assert.equal(h.claims(), 0);
  } finally { d.window.close(); }
});
test('Continue remains clickable when its parent ignores pointers but the button accepts them', () => {
  const d = dom('<div style="pointer-events:none"><button class="bottomBooking" style="pointer-events:auto">Tiếp tục - 1.036.000 đ</button></div>');
  try {
    const D = d.window.TBDom, button = D.continueButton(d.window.document);
    assert.equal(D.enabled(button), true);
    button.style.pointerEvents = 'none';
    assert.equal(D.enabled(button), false);
  } finally { d.window.close(); }
});
test('Continue selector supports the booking class on the wrapper and prefers an enabled copy', () => {
  const d = dom('<button class="bottomBooking" disabled>Tiếp tục</button><div class="bottomBooking"><button id="ready"><span>Tiếp tục</span> - 1.036.000 đ</button></div>');
  try {
    assert.equal(d.window.TBDom.continueButton(d.window.document)?.id, 'ready');
  } finally { d.window.close(); }
});
test('Real disabled and inert states still block Continue under a pointer override', () => {
  const d = dom('<fieldset disabled style="pointer-events:none"><button class="bottomBooking" style="pointer-events:auto">Tiếp tục</button></fieldset>');
  try {
    const D = d.window.TBDom, button = D.continueButton(d.window.document);
    assert.equal(D.enabled(button), false);
    button.parentElement.disabled = false;
    button.parentElement.setAttribute('inert', '');
    assert.equal(D.enabled(button), false);
    button.parentElement.removeAttribute('inert');
    button.setAttribute('aria-disabled', 'true');
    assert.equal(D.enabled(button), false);
  } finally { d.window.close(); }
});
test('Full cart clicks Continue once through a wrapper with pointer-events none', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d); let checkouts = 0;
    controls.button.parentElement.style.pointerEvents = 'none';
    controls.button.style.pointerEvents = 'auto';
    controls.button.onclick = () => checkouts++;
    const h = harness(d);
    await until(() => checkouts === 1);
    assert.equal(controls.clicks(), 4); assert.equal(h.claims(), 1);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(checkouts, 1);
  } finally { d.window.close(); }
});
test('Denied checkout stops with a visible reason and does not retry indefinitely', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d); let checkouts = 0;
    controls.button.onclick = () => checkouts++;
    const h = harness(d, {}, -1000, { ok: true, allowed: false, reason: 'Tab hiện tại không phải trang chọn vé.' });
    await until(() => h.messages.some(m => m.type === 'STOP'));
    assert.match(h.messages.find(m => m.type === 'STOP').reason, /Chưa bấm Tiếp tục: Tab hiện tại/);
    assert.equal(h.claims(), 1); assert.equal(checkouts, 0);
    const claim = h.messages.find(m => m.type === 'CHECKOUT');
    assert.equal(claim.href, C.DEFAULTS.insideUrl);
  } finally { d.window.close(); }
});
test('Visible Ticketbox CAPTCHA pauses selection and reload until success', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d), captcha = addCaptcha(d);
    const h = harness(d, { keepInside: false, retryRefresh: true });
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    await new Promise(r => setTimeout(r, 100));
    assert.equal(controls.clicks(), 0); assert.equal(h.claims(), 0);
    assert.equal(h.messages.some(m => m.type === 'REFRESH'), false);
    markSolved(d, captcha); captcha.remove();
    await until(() => h.claims() === 1);
    assert.equal(controls.clicks(), 4);
    assert.equal(h.messages.filter(m => m.type === 'CAPTCHA_RESUME').length, 1);
  } finally { d.window.close(); }
});
test('Closing CAPTCHA without success does not treat it as solved', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d), captcha = addCaptcha(d); const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    captcha.remove();
    await until(() => h.messages.some(m => m.type === 'STATUS' && m.status.includes('chưa thấy tín hiệu thành công')));
    assert.equal(controls.clicks(), 0); assert.equal(h.claims(), 0);
    assert.equal(h.messages.some(m => m.type === 'CAPTCHA_RESUME'), false);
  } finally { d.window.close(); }
});
test('Buy button retries once after a manually solved CAPTCHA', async () => {
  const d = dom(savedOutside); d.reconfigure({ url: C.DEFAULTS.eventUrl });
  try {
    const button = d.window.document.querySelector('#buynow-btn'); button.closest('a').removeAttribute('href');
    let clicks = 0, captcha;
    button.onclick = () => { clicks++; if (clicks === 1) captcha = addCaptcha(d); };
    const h = harness(d, {}, 60000);
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    assert.equal(clicks, 1);
    markSolved(d, captcha); captcha.remove();
    await until(() => clicks === 2);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(clicks, 2); assert.equal(h.messages.some(m => m.type === 'STOP'), false);
  } finally { d.window.close(); }
});
test('CAPTCHA after Continue re-arms exactly one click without adding more tickets', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d); let checkouts = 0, captcha;
    controls.button.onclick = () => { checkouts++; if (checkouts === 1) captcha = addCaptcha(d); };
    const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    assert.equal(checkouts, 1); assert.equal(controls.clicks(), 4);
    markSolved(d, captcha); captcha.remove();
    await until(() => checkouts === 2);
    await new Promise(r => setTimeout(r, 200));
    assert.equal(checkouts, 2); assert.equal(h.claims(), 2); assert.equal(controls.clicks(), 4);
  } finally { d.window.close(); }
});
test('Site navigation after CAPTCHA succeeds does not submit again', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d); let checkouts = 0, captcha;
    controls.button.onclick = () => { checkouts++; captcha = addCaptcha(d); };
    const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    markSolved(d, captcha); captcha.remove();
    d.window.history.pushState({}, '', C.DEFAULTS.insideUrl.replace('select-ticket', 'buyer-info'));
    await until(() => h.messages.some(m => m.type === 'STOP'));
    assert.equal(checkouts, 1); assert.equal(h.messages.some(m => m.type === 'CAPTCHA_RESUME'), false);
  } finally { d.window.close(); }
});
test('Stop during CAPTCHA prevents resume when success arrives later', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d), captcha = addCaptcha(d); const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    h.stop(); markSolved(d, captcha); captcha.remove();
    await new Promise(r => setTimeout(r, 300));
    assert.equal(controls.clicks(), 0); assert.equal(h.messages.some(m => m.type === 'CAPTCHA_RESUME'), false);
  } finally { d.window.close(); }
});

test('Direct mode continues the normal quantity flow when controls open', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d); controls.plus.disabled = true;
    const h = harness(d, { entryMode: 'direct', earlyBuy: true }, 60000);
    await new Promise(r => setTimeout(r, 100));
    assert.equal(controls.clicks(), 0); assert.equal(h.claims(), 0);
    controls.plus.disabled = false;
    await until(() => h.claims() === 1);
    assert.equal(controls.clicks(), 4);
    assert.equal(h.messages.some(m => m.type === 'REFRESH'), false);
  } finally { d.window.close(); }
});

test('Direct mode reloads an empty sold-out page when its scheduled load is due', async () => {
  const d = dom(savedInside);
  try {
    const h = harness(d, { entryMode: 'direct', keepInside: false, retryRefresh: true });
    await until(() => h.messages.some(m => m.type === 'REFRESH'));
    assert.equal(h.messages.filter(m => m.type === 'REFRESH').length, 1);
    assert.equal(h.claims(), 0);
  } finally { d.window.close(); }
});

for (const mode of ['exact', 'early']) {
  test(`Direct ${mode} mode waits for its deadline instead of clicking the outer buy button`, async () => {
    const d = dom(savedOutside); d.reconfigure({ url: C.DEFAULTS.eventUrl });
    try {
      const button = d.window.document.querySelector('#buynow-btn'); button.closest('a').removeAttribute('href');
      let clicks = 0; button.onclick = () => clicks++;
      const before = Date.now();
      const h = harness(d, { entryMode: 'direct', mode, leadMs: 1000 }, mode === 'early' ? 1700 : 700);
      await new Promise(r => setTimeout(r, 100));
      assert.equal(h.messages.some(m => m.type === 'REFRESH'), false);
      await until(() => h.messages.some(m => m.type === 'REFRESH'));
      assert.ok(Date.now() - before >= 650);
      assert.equal(clicks, 0);
      assert.equal(h.messages.filter(m => m.type === 'REFRESH').length, 1);
    } finally { d.window.close(); }
  });
}

test('Direct mode still honors disabling early purchase and protects selected tickets', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d); controls.input.value = '1';
    const h = harness(d, { entryMode: 'direct', mode: 'early', leadMs: 60000, earlyBuy: false, keepInside: false }, 30000);
    await new Promise(r => setTimeout(r, 150));
    assert.equal(controls.clicks(), 0); assert.equal(h.claims(), 0);
    assert.equal(h.messages.some(m => m.type === 'REFRESH'), false);
  } finally { d.window.close(); }
});

test('CAPTCHA defers a due direct entry until the user solves it', async () => {
  const d = dom(savedOutside); d.reconfigure({ url: C.DEFAULTS.eventUrl });
  try {
    const captcha = addCaptcha(d), h = harness(d, { entryMode: 'direct' });
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    assert.equal(h.messages.some(m => m.type === 'REFRESH'), false);
    markSolved(d, captcha); captcha.remove();
    await until(() => h.messages.some(m => m.type === 'REFRESH'));
    assert.equal(h.messages.filter(m => m.type === 'CAPTCHA_RESUME').length, 1);
  } finally { d.window.close(); }
});

test('CAPTCHA success during the asynchronous pause registration resumes automatically', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d), captcha = addCaptcha(d);
    const h = harness(d, {}, -1000, undefined, { captchaWaitDelay: 200 });
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    markSolved(d, captcha); captcha.remove();
    await until(() => h.claims() === 1);
    assert.equal(controls.clicks(), 4);
    assert.equal(h.messages.filter(m => m.type === 'CAPTCHA_RESUME').length, 1);
  } finally { d.window.close(); }
});

test('A transient success class cleared before the observer runs is retained', async () => {
  const d = dom(savedInside);
  try {
    makeAvailable(d); const captcha = addCaptcha(d);
    const message = d.window.document.createElement('div'); captcha.append(message);
    const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    message.className = 'captcha-module_messageSuccess__EhQLo';
    message.className = ''; captcha.remove();
    await until(() => h.claims() === 1);
  } finally { d.window.close(); }
});

test('Hidden success templates do not auto-resume a closed unsolved CAPTCHA', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d), captcha = addCaptcha(d);
    markSolved(d, captcha); captcha.lastElementChild.hidden = true;
    const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    captcha.remove();
    await new Promise(r => setTimeout(r, 350));
    assert.equal(controls.clicks(), 0);
    assert.equal(h.messages.some(m => m.type === 'CAPTCHA_RESUME'), false);
  } finally { d.window.close(); }
});

test('Unexpected CAPTCHA intercepting a quantity click retries from the actual cart', async () => {
  const d = dom(savedInside);
  try {
    const controls = makeAvailable(d); const increment = controls.plus.onclick;
    let captcha;
    controls.plus.onclick = () => {
      if (!captcha) captcha = addCaptcha(d);
      else increment();
    };
    const h = harness(d);
    await until(() => h.messages.some(m => m.type === 'CAPTCHA_WAIT'));
    assert.equal(controls.input.value, '0');
    markSolved(d, captcha); captcha.remove();
    await until(() => h.claims() === 1);
    assert.equal(controls.input.value, '4'); assert.equal(controls.clicks(), 4);
    assert.equal(h.messages.some(m => m.type === 'STOP'), false);
  } finally { d.window.close(); }
});
