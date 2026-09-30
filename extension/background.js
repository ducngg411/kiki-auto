importScripts("core.js");
const C = TBCore;
let serial = Promise.resolve();
const getRun = async () => (await chrome.storage.session.get("run")).run;
const saveRun = async run => { await chrome.storage.session.set({ run }); return run; };
const nowFor = run => Date.now() + run.clock.offsetMs;
function authorized(run, sender, id) { return run?.active && run.id === id && sender.tab?.id === run.tabId && nowFor(run) <= run.expiresAt; }
async function syncClock(config) {
  if (config.clockMode === "local") {
    const clock = { offsetMs: 0, measuredAt: Date.now(), mode: "local", source: "Đồng hồ máy", uncertaintyMs: null, rttMs: 0 };
    await chrome.storage.local.set({ clock }); return clock;
  }
  const url = C.ticketUrl(config.eventUrl);
  const samples = []; const errors = [];
  let probeUrl = url.href;
  for (let i = 0; i < 3; i++) {
    let t0 = Date.now();
    try {
      let response = await fetch(probeUrl, { method: "HEAD", cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(7000) });
      // Public event routes can reject HEAD while the public homepage serves it.
      // A homepage measurement is explicitly labeled as a CDN/HTTP estimate.
      if (!response.ok && probeUrl !== url.origin + "/") {
        probeUrl = url.origin + "/";
        t0 = Date.now();
        response = await fetch(probeUrl, { method: "HEAD", cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(7000) });
      }
      const t1 = Date.now();
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      samples.push({ ...C.clockSample(response.headers, t0, t1, config.clockMode, config.manualMinutes), probeUrl });
    } catch (error) { errors.push(error.message); }
  }
  if (!samples.length) throw Error("Không đo được giờ: " + errors.join("; "));
  samples.sort((a, b) => a.rttMs - b.rttMs);
  const clock = { ...samples[0], url: url.href, sampleCount: samples.length,
    spreadMs: Math.max(...samples.map(s => s.offsetMs)) - Math.min(...samples.map(s => s.offsetMs)) };
  await chrome.storage.local.set({ clock }); return clock;
}
async function handle(message, sender) {
  const run = await getRun();
  switch (message.type) {
    case "GET": return { run: sender.tab && sender.tab.id !== run?.tabId ? null : run, ...(await chrome.storage.local.get(["config", "clock"])) };
    case "SYNC": {
      if (run?.active) throw Error("Dừng phiên đang chạy trước khi đổi nguồn giờ.");
      return { clock: await syncClock({ ...C.DEFAULTS, ...message.config }) };
    }
    case "START": {
      const config = C.validate(message.config);
      if (run?.active && nowFor(run) <= run.expiresAt) throw Error("Đang có một phiên chạy. Bấm Dừng trước khi bắt đầu lại.");
      const tab = await chrome.tabs.get(message.tabId);
      if (C.pageKind(tab.url, config) === "other") throw Error("Mở đúng trang sự kiện hoặc trang chọn vé trước để hẹn giờ.");
      let page;
      try { page = await chrome.tabs.sendMessage(tab.id, { type: "PING" }); }
      catch { throw Error("Tab chưa nhận extension. Tải lại tab một lần rồi thử lại."); }
      if (page?.version !== C.VERSION) throw Error(`Tab đang chạy code ${page?.version || "cũ"}, extension là ${C.VERSION}. Cần tải lại tab để hai bản khớp nhau.`);
      const { clock } = await chrome.storage.local.get("clock");
      if (!clock || clock.mode !== config.clockMode || (clock.mode !== "local" && clock.url !== config.eventUrl) || (clock.mode === "manual" && clock.manualMinutes !== config.manualMinutes) || Date.now() - clock.measuredAt > 900000) throw Error("Bấm Đo giờ trước (kết quả có hiệu lực 15 phút để bắt đầu).");
      const now = Date.now() + clock.offsetMs;
      if (config.targetMs < now - 86400000 || config.targetMs > now + 86400000) throw Error("Chọn ngày mở bán trong vòng 24 giờ quanh hiện tại.");
      const next = { id: crypto.randomUUID(), tabId: tab.id, active: true, config, clock,
        startedAt: now, expiresAt: Math.max(now, config.targetMs) + 300000,
        refreshStages: [], refreshCount: 0, lastRefreshAt: 0,
        status: "Đang canh vé", logs: [] };
      await chrome.storage.local.set({ config });
      await saveRun(next);
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "RUN", run: next });
      } catch (error) {
        await saveRun({ ...next, active: false, status: "Không khởi động được tab: " + error.message });
        throw error;
      }
      return { run: next };
    }
    case "STOP": {
      if (sender.tab && sender.tab.id !== run?.tabId) return {};
      if (!run) return {};
      run.active = false; run.status = message.reason || "Đã dừng";
      await saveRun(run);
      await chrome.tabs.sendMessage(run.tabId, { type: "RUN", run }).catch(() => {});
      return { run };
    }
    case "STATUS": {
      if (!authorized(run, sender, message.id)) return {};
      run.status = String(message.status).slice(0, 250);
      run.logs = [...run.logs, { at: nowFor(run), text: run.status }].slice(-40);
      await saveRun(run); return {};
    }
    case "REFRESH": {
      if (!authorized(run, sender, message.id)) return { allowed: false };
      if (run.captcha || run.checkoutClaimed) return { allowed: false };
      const tab = await chrome.tabs.get(run.tabId);
      const kind = C.pageKind(tab.url, run.config);
      if (kind === "other") return { allowed: false };
      const now = nowFor(run);
      const reason = C.refreshReason(run, now, kind === "inside");
      if (!reason) return { allowed: false };
      run.refreshStages = [...new Set([...run.refreshStages, reason])];
      // An overdue early reload also satisfies the exact-time fallback.
      if (reason === "scheduled" && now >= run.config.targetMs) run.refreshStages.push("exact-fallback");
      run.refreshCount++; run.lastRefreshAt = now;
      const enterDirect = run.config.entryMode === "direct" && kind === "outside";
      run.status = `${enterDirect ? "Mở link chọn vé" : "Tải lại"} ${run.refreshCount}: ${reason}`;
      await saveRun(run);
      if (enterDirect) await chrome.tabs.update(run.tabId, { url: run.config.insideUrl });
      else await chrome.tabs.reload(run.tabId, { bypassCache: true });
      return { allowed: true, run };
    }
    case "CAPTCHA_WAIT": {
      if (!authorized(run, sender, message.id)) return { allowed: false, reason: "Phiên đã dừng hoặc hết hạn." };
      if (!run.captcha) {
        run.captcha = { id: crypto.randomUUID(), afterCheckout: Boolean(run.checkoutClaimed) };
        // Allow manual verification up to ten minutes without refreshing the cart.
        run.expiresAt = Math.max(run.expiresAt, nowFor(run) + 600000);
        run.status = "Có CAPTCHA · bạn giải trên trang, extension đang tạm chờ.";
        await saveRun(run);
      }
      return { allowed: true, captcha: run.captcha, expiresAt: run.expiresAt };
    }
    case "CAPTCHA_RESUME": {
      if (!authorized(run, sender, message.id) || !run.captcha || run.captcha.id !== message.captchaId) return { allowed: false, reason: "Phiên CAPTCHA không còn hiệu lực." };
      if (message.solved !== true) return { allowed: false, reason: "Chưa có tín hiệu CAPTCHA thành công." };
      if ((run.captchaResumes || 0) >= 3) return { allowed: false, reason: "CAPTCHA lặp lại 3 lần; kiểm tra trang và bắt đầu lại bằng tay." };
      const tab = await chrome.tabs.get(run.tabId);
      if (C.pageKind(tab.url, run.config) === "other") return { allowed: false, reason: "Trang đã chuyển bước; không bấm lại." };
      if (run.captcha.afterCheckout && C.pageKind(tab.url, run.config) !== "inside") return { allowed: false, reason: "Đã rời trang chọn vé; không bấm lại Tiếp tục." };
      const retryCheckout = run.captcha.afterCheckout;
      if (retryCheckout) run.checkoutClaimed = false;
      run.captcha = null; run.captchaResumes = (run.captchaResumes || 0) + 1;
      run.expiresAt = Math.max(run.expiresAt, nowFor(run) + 300000);
      run.status = "CAPTCHA đã được xác nhận · tiếp tục thao tác trên trang.";
      await saveRun(run);
      return { allowed: true, retryCheckout, expiresAt: run.expiresAt };
    }
    case "CHECKOUT": {
      if (!run || run.id !== message.id || sender.tab?.id !== run.tabId) return { allowed: false, reason: "Phiên hoặc tab không khớp với phiên đang canh." };
      if (run.checkoutClaimed) return { allowed: false, reason: "Phiên này đã cấp một lần bấm Tiếp tục." };
      if (!run.active) return { allowed: false, reason: "Phiên đã dừng." };
      if (run.captcha) return { allowed: false, reason: "Đang chờ giải CAPTCHA." };
      if (nowFor(run) > run.expiresAt) return { allowed: false, reason: "Phiên đã hết thời gian canh." };
      const tab = await chrome.tabs.get(run.tabId);
      // Read the current route instead of trusting document-start sender metadata.
      if (C.pageKind(tab.url, run.config) !== "inside" || C.pageKind(message.href, run.config) !== "inside") return { allowed: false, reason: "Tab hiện tại không phải trang chọn vé của sự kiện đã cấu hình." };
      if (new URL(tab.url).pathname !== new URL(message.href).pathname) return { allowed: false, reason: "Tab đang chuyển sang booking khác; chưa bấm Tiếp tục." };
      run.checkoutClaimed = true;
      run.status = "Đã cấp một lần bấm Tiếp tục · đang theo dõi chuyển trang/CAPTCHA.";
      await saveRun(run); return { allowed: true, run };
    }
    default: throw Error("Lệnh không hợp lệ.");
  }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  serial = serial.catch(() => {}).then(() => handle(message, sender));
  serial.then(value => respond({ ok: true, ...value }), error => respond({ ok: false, error: error.message }));
  return true;
});
chrome.tabs.onRemoved.addListener(tabId => {
  serial = serial.catch(() => {}).then(async () => {
    const run = await getRun();
    if (run?.tabId === tabId && run.active) await saveRun({ ...run, active: false, status: "Tab đã đóng" });
  });
});
