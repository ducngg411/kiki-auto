(() => {
  "use strict";
  const C = TBCore, D = TBDom;
  let run = null, busy = false, pending = null, outsideClicked = false, navigating = false;
  let timer, observer, lastStatus = "", panel, baseLocal = 0, baseMono = 0;
  let captchaWait = null, checkoutPending = null;
  const send = async message => {
    const result = await chrome.runtime.sendMessage(message);
    if (!result?.ok) throw Error(result?.error || "Mất kết nối extension");
    return result;
  };
  const now = () => baseLocal + performance.now() - baseMono + run.clock.offsetMs;
  function show(status) {
    if (!panel) {
      const host = document.createElement("div");
      host.id = "tb-assistant-panel";
      host.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483647";
      const shadow = host.attachShadow({ mode: "closed" });
      shadow.innerHTML = `<style>:host{all:initial}section{font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:oklch(0.95 0.005 155);background:oklch(0.19 0.008 155);border:1px solid oklch(0.36 0.01 155);border-radius:10px;padding:12px;width:300px;box-shadow:0 8px 24px oklch(0 0 0/.45)}header{display:flex;justify-content:space-between;align-items:center;gap:12px;font-weight:600}button{font:inherit;font-size:12px;font-weight:500;color:inherit;background:transparent;border:1px solid oklch(0.48 0.012 155);border-radius:6px;padding:3px 10px;cursor:pointer}button:hover{background:oklch(1 0 0/.08)}button:focus-visible{outline:2px solid oklch(0.76 0.17 153);outline-offset:2px}p{margin:8px 0 0}small{display:block;font-size:12px;color:oklch(0.72 0.012 155);font-variant-numeric:tabular-nums}section>button{display:block;width:100%;margin-top:10px;padding:6px 10px;background:oklch(0.76 0.17 153);border-color:transparent;color:oklch(0.2 0.05 153);font-weight:600}section>button:hover{background:oklch(0.81 0.16 153)}section>button[hidden]{display:none}</style><section><header>Ticketbox · Canh vé <button>Dừng</button></header><p></p><small></small></section>`;
      panel = { status: shadow.querySelector("p"), clock: shadow.querySelector("small") };
      shadow.querySelector("button").onclick = () => stop("Đã dừng bằng nút trên trang");
      panel.resume = document.createElement("button");
      panel.resume.textContent = "Tôi đã giải xong · tiếp tục";
      panel.resume.hidden = true;
      panel.resume.onclick = () => {
        if (run?.active && captchaWait && !D.captcha(document)) {
          captchaWait.confirmed = true; void tick();
        }
      };
      shadow.querySelector("section").append(panel.resume);
      document.documentElement.append(host);
    }
    panel.status.textContent = status;
  }
  function status(value) {
    show(value);
    if (value !== lastStatus) {
      lastStatus = value;
      void send({ type: "STATUS", id: run.id, status: value }).catch(() => {});
    }
  }
  async function stop(reason) {
    if (run) run.active = false;
    clearTimeout(timer); observer?.disconnect();
    show(reason);
    panel.resume.hidden = true;
    try { await send({ type: "STOP", reason }); } catch { /* Local stop still applies. */ }
  }
  function apply(next) {
    clearTimeout(timer); observer?.disconnect();
    const changed = run?.id !== next?.id;
    run = next;
    if (!run) return;
    baseLocal = Date.now(); baseMono = performance.now();
    if (changed) {
      pending = null; outsideClicked = false; navigating = false; lastStatus = "";
      captchaWait = run.captcha ? { id: run.captcha.id, successSeen: false } : null;
      checkoutPending = run.checkoutClaimed ? { at: performance.now() } : null;
    }
    show(run.status);
    if (!run.active) return;
    observer = new MutationObserver(records => {
      if (captchaWait) {
        for (const record of records) {
          // Preserve a success marker even when the site inserts it and removes
          // the entire dialog before the next polling tick.
          const withinCaptcha = record.target === captchaWait.element || captchaWait.element?.contains(record.target);
          if (withinCaptcha && D.captchaSucceeded(record.target)) captchaWait.successSeen = true;
          // Some widgets reuse a message node and clear its success class in
          // the same task as closing the dialog. Keep the previous class too.
          if (withinCaptcha && record.type === "attributes" && record.attributeName === "class" &&
              /captcha-module_messageSuccess__/.test(record.oldValue || "") &&
              (!record.target.isConnected || D.visible(record.target))) captchaWait.successSeen = true;
          for (const node of [...(record.addedNodes || []), ...(record.removedNodes || [])]) {
            if ((withinCaptcha || node.nodeType === 1 && (node.matches(D.CAPTCHA_ROOT) || node.querySelector(D.CAPTCHA_ROOT))) && D.captchaSucceeded(node)) captchaWait.successSeen = true;
          }
        }
      }
      if (run?.active && records.length) void tick();
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
    void tick();
  }
  async function handleCaptcha() {
    const runId = run.id;
    const challenge = D.captcha(document);
    if (challenge) {
      if (!captchaWait) {
        // Capture before messaging the worker: success can arrive while the
        // persistent pause is being saved.
        captchaWait = { element: challenge.element, successSeen: D.captchaSucceeded(challenge.element) };
        const response = await send({ type: "CAPTCHA_WAIT", id: run.id });
        if (!run?.active || run.id !== runId) return true;
        if (!response.allowed) { await stop(response.reason || "Không thể tạm chờ CAPTCHA."); return true; }
        captchaWait.id = response.captcha.id;
        run.captcha = response.captcha; run.expiresAt = response.expiresAt;
      }
      if (captchaWait.element && captchaWait.element !== challenge.element) {
        captchaWait.successSeen = false; captchaWait.confirmed = false;
      }
      captchaWait.element = challenge.element; captchaWait.clearAt = null;
      if ([...challenge.element.querySelectorAll('[class*="captcha-module_messageError__"]')].some(D.visible)) captchaWait.successSeen = false;
      else if (D.captchaSucceeded(challenge.element)) captchaWait.successSeen = true;
      panel.resume.hidden = true;
      status(captchaWait.successSeen ? "CAPTCHA báo thành công · chờ hộp xác minh đóng" : "Có CAPTCHA · bạn kéo mảnh ghép trên trang. Tool đang chờ, không tải lại hoặc bấm vé.");
      return true;
    }
    if (!captchaWait) return false;
    if (!captchaWait.successSeen && !captchaWait.confirmed) {
      panel.resume.hidden = false;
      status("Hộp CAPTCHA đã đóng nhưng chưa thấy tín hiệu thành công. Nếu đã giải xong, bấm ‘Tôi đã giải xong · tiếp tục’ trên bảng ở góc trang.");
      return true;
    }
    // Let the site's own success callback navigate first; never submit again on
    // an already advanced booking page. This is not a server-verification claim.
    if (captchaWait.clearAt == null) captchaWait.clearAt = performance.now();
    if (performance.now() - captchaWait.clearAt < 250) return true;
    const response = await send({ type: "CAPTCHA_RESUME", id: run.id, captchaId: captchaWait.id, solved: true });
    if (!run?.active || run.id !== runId) return true;
    if (!response.allowed) { await stop(response.reason || "Không thể tiếp tục sau CAPTCHA."); return true; }
    captchaWait = null; run.captcha = null; panel.resume.hidden = true;
    if (response.expiresAt) run.expiresAt = response.expiresAt;
    outsideClicked = false;
    if (response.retryCheckout) { checkoutPending = null; run.checkoutClaimed = false; }
    if (pending) { pending.at = performance.now(); pending.retryAfterCaptcha = true; }
    status("CAPTCHA đã được xác nhận · kiểm tra lại vé và tiếp tục");
    return false;
  }
  async function insideStep() {
    const s = D.inspect(document, run.config.tier);
    if (s.state === "ambiguous") { await stop("Có nhiều dòng cùng hạng vé; cần chọn lại bằng tay."); return { selected: true }; }
    if (s.state === "missing") { status("Chờ danh sách vé tải xong / kiểm tra tên hạng vé"); return { selected: D.rows(document).some(r => D.quantity(r) > 0) }; }
    if (s.others.length) { await stop("Đang có vé hạng khác trong giỏ. Xóa vé đó rồi bắt đầu lại."); return { selected: true }; }
    if (s.quantity > run.config.quantity) { await stop("Giỏ đã vượt số lượng đã đặt; kiểm tra lại bằng tay."); return { selected: true }; }
    if (pending) {
      if (s.quantity === pending.from + 1) pending = null;
      else if (s.quantity === pending.from && pending.retryAfterCaptcha) pending = null;
      else if (s.quantity !== null && s.quantity !== pending.from) { await stop("Số lượng đổi bất thường; dừng để tránh chọn nhầm."); return { selected: true }; }
      else if (performance.now() - pending.at > 3500) { await stop("Bấm + chưa được trang xác nhận. Kiểm tra giới hạn vé hoặc lỗi rồi bắt đầu lại."); return { selected: true }; }
      else { status("Đợi trang xác nhận số lượng…"); return { selected: true }; }
    }
    if (!run.config.earlyBuy && now() < run.config.targetMs) {
      status("Đã ở trong trang vé · chờ đúng giờ mở bán"); return { selected: s.quantity > 0 };
    }
    if (s.quantity === run.config.quantity) {
      const button = D.continueButton(document);
      const waitReason = D.disabledReason(button);
      if (waitReason) { status("Đã đủ vé · " + waitReason); return { selected: true }; }
      const id = run.id;
      status("Đã đủ vé · tìm thấy nút Tiếp tục khả dụng · đang xác nhận phiên");
      const permission = await send({ type: "CHECKOUT", id, href: location.href });
      if (run.id !== id || !run.active) return { selected: true };
      if (!permission.allowed) { await stop("Chưa bấm Tiếp tục: " + (permission.reason || "không nhận được quyền bấm từ extension")); return { selected: true }; }
      checkoutPending = { at: performance.now() }; run.checkoutClaimed = true;
      if (D.captcha(document)) return { selected: true };
      const verify = D.inspect(document, run.config.tier);
      const freshButton = D.continueButton(document);
      if (verify.state !== "found" || verify.others.length || verify.quantity !== run.config.quantity || !D.enabled(freshButton) || D.blockingMessage(document)) {
        await stop("Trang đổi trong lúc xác nhận. Chưa bấm Tiếp tục; kiểm tra rồi bắt đầu lại."); return { selected: true };
      }
      freshButton.click();
      status(`Đã bấm Tiếp tục cho ${run.config.quantity} vé ${run.config.tier} · chờ chuyển bước hoặc CAPTCHA`);
      return { selected: true };
    }
    if (s.soldOut) { status(`${run.config.tier}: đang hết vé · chờ trang cập nhật`); return { selected: false }; }
    if (s.quantity === null || !s.plus) { status("Chưa có bộ chọn số lượng cho hạng vé này"); return { selected: false }; }
    if (!D.enabled(s.plus)) { status(`Đang có ${s.quantity}/${run.config.quantity} vé · nút + chưa mở hoặc đã chạm giới hạn`); return { selected: s.quantity > 0 }; }
    pending = { from: s.quantity, at: performance.now() };
    s.plus.click();
    status(`Đã bấm + · chờ xác nhận vé ${s.quantity + 1}/${run.config.quantity}`);
    return { selected: true };
  }
  async function tick() {
    if (busy || !run?.active || navigating) return;
    busy = true;
    try {
      if (now() > run.expiresAt) { await stop("Hết thời gian canh (5 phút sau giờ mở bán hoặc lúc bắt đầu muộn)"); return; }
      const kind = C.pageKind(location.href, run.config);
      if (kind === "other") { await stop("Đã sang trang khác. Kiểm tra và hoàn tất bước tiếp theo bằng tay."); return; }
      if (await handleCaptcha()) return;
      if (!run?.active) return;
      // Re-check after awaiting the worker: another challenge or navigation
      // may have happened while the resume was being persisted.
      if (D.captcha(document) || C.pageKind(location.href, run.config) !== kind) return;
      const blocked = D.blockingMessage(document);
      if (blocked) { await stop(blocked); return; }
      if (checkoutPending) {
        if (performance.now() - checkoutPending.at > 15000) await stop("Đã bấm Tiếp tục nhưng chưa thấy chuyển bước/CAPTCHA sau 15 giây. Kiểm tra trang; không tự gửi lại.");
        return;
      }
      const delta = run.config.targetMs - now();
      const timing = delta > 0 ? "còn " + (delta / 1000).toFixed(1) + "s" : "đã đến giờ";
      panel.clock.textContent = `${new Date(now()).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false })} VN · ${timing}${document.hidden ? " · tab nền có thể bị trễ" : ""}`;
      let selected = false;
      if (kind === "inside") ({ selected } = await insideStep());
      else if (run.config.entryMode === "direct") {
        const due = run.config.targetMs - (run.config.mode === "early" ? run.config.leadMs : 0);
        status(!run.refreshStages.includes("scheduled")
          ? `Chờ tự mở link chọn vé · ${run.config.mode === "early" ? "sớm " + run.config.leadMs + " ms" : "đúng giờ mở bán"} · còn ${Math.max(0, (due - now()) / 1000).toFixed(1)}s`
          : "Link chọn vé đã chuyển về trang sự kiện · chờ lịch tải tiếp hoặc cập nhật link nếu hết hạn");
      } else {
        const button = document.querySelector("#buynow-btn");
        if (D.enabled(button) && (run.config.earlyBuy || delta <= 0)) {
          if (!outsideClicked) { outsideClicked = true; button.click(); status("Đã bấm Mua vé ngay · chờ trang chọn vé"); }
          // Do not interrupt navigation or an event/showing modal with a scheduled reload.
          return;
        }
        status(delta > 0 ? "Chờ giờ mở bán / nút Mua vé ngay" : "Đã đến giờ · chờ nút Mua vé ngay mở");
      }
      if (!run.active || selected || pending) return;
      const reason = C.refreshReason(run, now(), kind === "inside");
      if (reason) {
        navigating = true;
        const response = await send({ type: "REFRESH", id: run.id });
        if (response.run) run = response.run;
        if (!response.allowed) navigating = false;
      }
    } catch (error) { await stop("Dừng: " + error.message); }
    finally {
      busy = false; clearTimeout(timer);
      if (run?.active && !navigating) {
        const due = run.config.targetMs - (run.config.mode === "early" && !run.refreshStages.includes("scheduled") ? run.config.leadMs : 0);
        timer = setTimeout(tick, captchaWait || checkoutPending || pending || Math.abs(due - now()) < 2000 ? 25 : 200);
      }
    }
  }
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (message.type === "PING") reply({ ready: true, version: C.VERSION });
    if (message.type === "DIAGNOSE") {
      const buttons = [...document.querySelectorAll("button.bottomBooking, .bottomBooking button")];
      const chosen = D.continueButton(document);
      reply({ version: C.VERSION, path: location.pathname, active: Boolean(run?.active), status: lastStatus, captcha: { visible: Boolean(D.captcha(document)), waiting: Boolean(captchaWait), successSeen: Boolean(captchaWait?.successSeen) },
        chosen: chosen ? buttons.indexOf(chosen) + 1 : null,
        buttons: buttons.map(b => ({ text: b.textContent.trim().slice(0, 120), className: b.className, reason: D.disabledReason(b) || "có thể bấm" })) });
    }
    if (message.type === "RUN") { apply(message.run); reply({ ready: true }); }
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && run?.active) void stop("Đã dừng bằng Esc"); });
  window.addEventListener("pagehide", () => { clearTimeout(timer); observer?.disconnect(); });
  void send({ type: "GET" }).then(result => { if (result.run) apply(result.run); }).catch(() => {});
})();
