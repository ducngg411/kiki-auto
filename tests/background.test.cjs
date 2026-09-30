const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../extension/core.js');
const code = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');
function environment() {
  const session = {}, local = {};
  const reloads = [], sent = [], updates = [];
  const tab = { id: 7, url: C.DEFAULTS.eventUrl };
  const storage = data => ({
    async get(keys) { const result = {}; for (const key of typeof keys === 'string' ? [keys] : keys) if (key in data) result[key] = structuredClone(data[key]); return result; },
    async set(value) { Object.assign(data, structuredClone(value)); }
  });
  let listener;
  const chrome = { storage: { local: storage(local), session: storage(session) }, runtime: { onMessage: { addListener(fn) { listener = fn; } } }, tabs: {
    async get(id) { return { ...tab, id }; },
    async sendMessage(id, message) { sent.push({ id, message }); return { ready: true, version: C.VERSION }; },
    async reload(id, options) { reloads.push({ id, options }); },
    async update(id, options) { updates.push({ id, options }); tab.url = options.url; return { ...tab, id }; },
    onRemoved: { addListener() {} }
  } };
  function restart() { vm.runInNewContext(code, { importScripts() {}, TBCore: C, chrome, crypto: require('node:crypto').webcrypto, Date, AbortSignal, fetch, URL }); }
  restart();
  return { session, local, reloads, sent, updates, tab, restart,
    request(message, sender = {}) { return new Promise(resolve => listener(message, sender, resolve)); }
  };
}
async function start(env, overrides = {}) {
  const saleTime = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 19);
  env.local.clock = { mode: 'local', offsetMs: 0, measuredAt: Date.now() };
  const response = await env.request({ type: 'START', tabId: 7, config: { ...C.DEFAULTS, saleTime, clockMode: 'local', ...overrides } });
  assert.equal(response.ok, true, response.error); return response.run;
}
test('Only the owning tab can see and mutate its running session', async () => {
  const e = environment(), run = await start(e);
  const other = { tab: { id: 8 }, url: C.DEFAULTS.insideUrl };
  assert.equal((await e.request({ type: 'GET' }, other)).run, null);
  assert.equal((await e.request({ type: 'CHECKOUT', id: run.id }, other)).allowed, false);
  await e.request({ type: 'STOP' }, other);
  assert.equal(e.session.run.active, true);
  const duplicate = await e.request({ type: 'START', tabId: 8, config: run.config });
  assert.equal(duplicate.ok, false);
});
test('Concurrent checkout claims allow only one click, also after worker restart', async () => {
  const e = environment(), run = await start(e);
  e.tab.url = C.DEFAULTS.insideUrl;
  const sender = { tab: { id: 7 }, url: C.DEFAULTS.insideUrl };
  const replies = await Promise.all(Array.from({ length: 4 }, () => e.request({ type: 'CHECKOUT', id: run.id, href: C.DEFAULTS.insideUrl }, sender)));
  assert.equal(replies.filter(r => r.allowed).length, 1);
  assert.equal(e.session.run.active, true); // Observe a possible CAPTCHA; claim still prevents duplicates.
  e.restart();
  assert.equal((await e.request({ type: 'CHECKOUT', id: run.id }, sender)).allowed, false);
});
test('Scheduled reload is persisted once and survives worker restart', async () => {
  const e = environment(), run = await start(e);
  const sender = { tab: { id: 7 }, url: C.DEFAULTS.eventUrl };
  assert.equal((await e.request({ type: 'REFRESH', id: run.id }, sender)).allowed, true);
  assert.equal(e.reloads.length, 1);
  assert.equal(e.reloads[0].options.bypassCache, true);
  e.restart();
  assert.equal((await e.request({ type: 'REFRESH', id: run.id }, sender)).allowed, false);
  assert.equal(e.reloads.length, 1);
});
test('Expired session and user stop prevent late checkout', async () => {
  const e = environment(), run = await start(e);
  const sender = { tab: { id: 7 }, url: C.DEFAULTS.insideUrl };
  e.session.run.expiresAt = Date.now() - 1;
  assert.equal((await e.request({ type: 'CHECKOUT', id: run.id }, sender)).allowed, false);
  e.session.run.expiresAt = Date.now() + 10000;
  await e.request({ type: 'STOP' });
  assert.equal((await e.request({ type: 'CHECKOUT', id: run.id }, sender)).allowed, false);
});
test('Stale clock sample cannot start a scheduled purchase', async () => {
  const e = environment(), run = await start(e);
  await e.request({ type: 'STOP' });
  e.local.clock.measuredAt = Date.now() - 900001;
  const response = await e.request({ type: 'START', tabId: 7, config: run.config });
  assert.equal(response.ok, false); assert.match(response.error, /Đo giờ/);
});
test('Checkout uses current tab route after SPA navigation, not the original sender route', async () => {
  const e = environment(), run = await start(e);
  e.tab.url = C.DEFAULTS.insideUrl;
  const response = await e.request({ type: 'CHECKOUT', id: run.id, href: C.DEFAULTS.insideUrl }, { tab: { id: 7 }, url: C.DEFAULTS.eventUrl });
  assert.equal(response.allowed, true);
});
test('Rejected checkout reports its reason instead of silently waiting', async () => {
  const e = environment(), run = await start(e);
  const response = await e.request({ type: 'CHECKOUT', id: run.id, href: C.DEFAULTS.eventUrl }, { tab: { id: 7 }, url: C.DEFAULTS.eventUrl });
  assert.equal(response.allowed, false);
  assert.match(response.reason, /trang chọn vé/);
});
test('CAPTCHA blocks reload/checkout, survives worker restart, and only re-arms once', async () => {
  const e = environment(), run = await start(e, { keepInside: false }); e.tab.url = C.DEFAULTS.insideUrl;
  const sender = { tab: { id: 7 }, url: C.DEFAULTS.insideUrl };
  const claim = { type: 'CHECKOUT', id: run.id, href: C.DEFAULTS.insideUrl };
  assert.equal((await e.request(claim, sender)).allowed, true);
  const wait = await e.request({ type: 'CAPTCHA_WAIT', id: run.id }, sender);
  assert.equal(wait.allowed, true); assert.equal(wait.captcha.afterCheckout, true);
  assert.equal((await e.request({ type: 'REFRESH', id: run.id }, sender)).allowed, false);
  assert.equal((await e.request(claim, sender)).allowed, false);
  e.restart();
  const resume = { type: 'CAPTCHA_RESUME', id: run.id, captchaId: wait.captcha.id, solved: true };
  assert.equal((await e.request({ ...resume, solved: false }, sender)).allowed, false);
  const replies = await Promise.all([e.request(resume, sender), e.request(resume, sender)]);
  assert.equal(replies.filter(r => r.allowed).length, 1);
  assert.equal((await e.request(claim, sender)).allowed, true);
  assert.equal((await e.request(claim, sender)).allowed, false);
});
test('A solved CAPTCHA cannot re-arm checkout after the site already navigated', async () => {
  const e = environment(), run = await start(e); e.tab.url = C.DEFAULTS.insideUrl;
  const sender = { tab: { id: 7 }, url: C.DEFAULTS.insideUrl };
  await e.request({ type: 'CHECKOUT', id: run.id, href: C.DEFAULTS.insideUrl }, sender);
  const wait = await e.request({ type: 'CAPTCHA_WAIT', id: run.id }, sender);
  e.tab.url = C.DEFAULTS.insideUrl.replace('select-ticket', 'buyer-info');
  assert.equal((await e.request({ type: 'CAPTCHA_RESUME', id: run.id, captchaId: wait.captcha.id, solved: true }, sender)).allowed, false);
  assert.equal(e.session.run.checkoutClaimed, true);
});

test('Direct mode waits until the scheduled time, then opens the link exactly once', async () => {
  const e = environment();
  const saleTime = new Date(Date.now() + 7 * 3600000 + 60000).toISOString().slice(0, 19);
  const run = await start(e, { entryMode: 'direct', saleTime });
  const sender = { tab: { id: 7 } }, message = { type: 'REFRESH', id: run.id };
  assert.equal(run.config.targetMs, C.parseSaleTime(saleTime));
  assert.equal(e.updates.length, 0);
  assert.equal((await e.request(message, sender)).allowed, false);
  e.session.run.config.targetMs = Date.now() - 1;
  assert.equal((await e.request(message, sender)).allowed, true);
  assert.equal(e.updates.length, 1); assert.equal(e.tab.url, C.DEFAULTS.insideUrl);
  assert.equal(e.reloads.length, 0);
  e.restart();
  assert.equal((await e.request(message, sender)).allowed, false);
  assert.equal(e.updates.length, 1);
});

test('Direct mode starting inside reloads at its first scheduled deadline', async () => {
  const e = environment(); e.tab.url = C.DEFAULTS.insideUrl;
  const run = await start(e, { entryMode: 'direct' });
  assert.equal(e.updates.length, 0);
  assert.equal(e.reloads.length, 0);
  assert.ok(e.sent.some(item => item.message.type === 'RUN'));
  const message = { type: 'REFRESH', id: run.id }, sender = { tab: { id: 7 } };
  assert.equal((await e.request(message, sender)).allowed, true);
  assert.equal(e.reloads.length, 1);
  assert.equal((await e.request(message, sender)).allowed, false);
});

test('Direct early entry retains exact-time fallback and bounded retry', async () => {
  const e = environment();
  const saleTime = new Date(Date.now() + 7 * 3600000 + 30000).toISOString().slice(0, 19);
  const run = await start(e, { entryMode: 'direct', mode: 'early', leadMs: 60000, saleTime, keepInside: false, retryRefresh: true, maxRefresh: 3 });
  const message = { type: 'REFRESH', id: run.id }, sender = { tab: { id: 7 } };
  assert.equal((await e.request(message, sender)).allowed, true);
  assert.equal(e.updates.length, 1);
  assert.equal((await e.request(message, sender)).allowed, false);
  e.session.run.config.targetMs = Date.now() - 1;
  assert.equal((await e.request(message, sender)).allowed, true);
  assert.equal(e.reloads.length, 1);
  assert.equal((await e.request(message, sender)).allowed, false);
  e.session.run.lastRefreshAt -= 5001;
  assert.equal((await e.request(message, sender)).allowed, true);
  e.session.run.lastRefreshAt -= 5001;
  assert.equal((await e.request(message, sender)).allowed, false);
  assert.equal(e.reloads.length, 2);
});

test('Direct scheduled entry requires a sale time and a fresh clock sample', async () => {
  const e = environment();
  const missingTime = await e.request({ type: 'START', tabId: 7, config: { ...C.DEFAULTS, entryMode: 'direct' } });
  assert.equal(missingTime.ok, false);
  const run = await start(e, { entryMode: 'direct' });
  await e.request({ type: 'STOP' });
  e.local.clock.measuredAt = Date.now() - 900001;
  const stale = await e.request({ type: 'START', tabId: 7, config: run.config });
  assert.equal(stale.ok, false); assert.match(stale.error, /Đo giờ/);
});

test('Resuming a CAPTCHA near expiry grants time for the remaining flow', async () => {
  const e = environment(), run = await start(e);
  const sender = { tab: { id: 7 }, url: C.DEFAULTS.eventUrl };
  const wait = await e.request({ type: 'CAPTCHA_WAIT', id: run.id }, sender);
  e.session.run.expiresAt = Date.now() + 1000;
  const response = await e.request({ type: 'CAPTCHA_RESUME', id: run.id, captchaId: wait.captcha.id, solved: true }, sender);
  assert.equal(response.allowed, true);
  assert.ok(response.expiresAt >= Date.now() + 299000);
});
