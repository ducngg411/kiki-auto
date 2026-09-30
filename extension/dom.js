(function (root) {
  "use strict";
  const C = root.TBCore;
  function visible(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return false;
    for (let p = el; p; p = p.parentElement) {
      const style = p.ownerDocument.defaultView.getComputedStyle(p);
      if (p.hidden || p.getAttribute("aria-hidden") === "true" || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    }
    return true;
  }
  function disabledReason(el) {
    if (!el) return "chưa tìm thấy nút Tiếp tục hiển thị đúng nhãn";
    if (!visible(el)) return "nút đang ẩn";
    if (el.disabled || el.matches(":disabled")) return "nút có disabled hoặc nằm trong fieldset disabled";
    // pointer-events is inherited but descendants can override it with auto.
    // Inspect the target's computed value, not every ancestor's value.
    if (el.ownerDocument.defaultView.getComputedStyle(el).pointerEvents === "none") return "nút có pointer-events: none";
    if (/(^|\s)(disabled|disable|ant-btn-loading)(\s|$)/.test(el.getAttribute("class") || "")) return "nút có class disabled/loading";
    for (let p = el; p; p = p.parentElement) {
      if (p.inert || p.hasAttribute("inert")) return "nút nằm trong vùng inert";
      if (p.getAttribute("aria-disabled") === "true") return "nút hoặc vùng chứa có aria-disabled";
    }
    return null;
  }
  function enabled(el) { return disabledReason(el) === null; }
  function rows(doc) { return [...doc.querySelectorAll(".tbox-row.row-default")].filter(visible); }
  function title(row) { return row.querySelector("article, [data-ticket-name], .title-tickettype"); }
  function quantity(row) {
    const input = [...row.querySelectorAll("input")].find(visible);
    if (!input || !/^\d+$/.test(input.value.trim())) return null;
    return Number(input.value);
  }
  function inspect(doc, tier) {
    const all = rows(doc);
    const matches = all.filter(row => C.tierName(title(row)?.textContent || "") === C.tierName(tier));
    if (matches.length !== 1) return { state: matches.length ? "ambiguous" : "missing", all };
    const row = matches[0];
    const others = all.filter(r => r !== row && (quantity(r) || 0) > 0);
    const plus = [...row.querySelectorAll("button")].find(b => b.textContent.trim() === "+");
    const soldOut = /het ve|sold out/.test(C.normalize(row.querySelector(".tag")?.textContent || ""));
    return { state: "found", row, all, others, quantity: quantity(row), plus, soldOut };
  }
  function continueButton(doc) {
    const candidates = [...doc.querySelectorAll("button.bottomBooking, .bottomBooking button")]
      .filter(b => visible(b) && /^(tiep tuc|thanh toan)\b/.test(C.normalize(b.textContent)));
    // Responsive layouts can retain an inactive copy ahead of the active one.
    return candidates.find(enabled) || candidates[0];
  }
  const CAPTCHA_ROOT = '[class*="captcha-module_wrapper__"]';
  const CAPTCHA_SUCCESS = '[class*="captcha-module_messageSuccess__"]';
  function captcha(doc) {
    const custom = [...doc.querySelectorAll(CAPTCHA_ROOT)].find(visible);
    if (custom) return { element: custom, type: "Ticketbox slider" };
    const dialog = [...doc.querySelectorAll('[role="dialog"], .ant-modal')].find(el => visible(el) && /xac minh nguoi dung|chong bot tu dong mua ve|keo mui ten qua phai/.test(C.normalize(el.textContent)));
    if (dialog) return { element: dialog, type: "Xác minh Ticketbox" };
    const frame = [...doc.querySelectorAll('iframe[src*="bframe"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"]')].find(visible);
    return frame ? { element: frame, type: "CAPTCHA trong iframe" } : null;
  }
  function captchaSucceeded(element) {
    if (!element || element.nodeType !== 1) return false;
    const candidates = [...element.querySelectorAll(CAPTCHA_SUCCESS)];
    if (element.matches(CAPTCHA_SUCCESS)) candidates.unshift(element);
    // Removed nodes are still useful evidence in a MutationObserver batch.
    // Connected but hidden success templates must not count as solved.
    return candidates.some(node => node.isConnected ? visible(node) : !node.hidden && node.getAttribute("aria-hidden") !== "true" && node.style.display !== "none" && node.style.visibility !== "hidden" && node.style.opacity !== "0");
  }
  function blockingMessage(doc) {
    const notices = [...doc.querySelectorAll('[role="dialog"], .ant-modal, .ant-message-notice, .ant-notification-notice, .ant-alert-error')].filter(visible);
    for (const notice of notices) {
      const s = C.normalize(notice.textContent);
      if (/het han|phien.*het|dang nhap|login|khong du|vuot qua|qua nhieu|thu lai|loi|that bai|xep hang|hang doi|waiting room|queue|captcha|xac minh/.test(s)) return notice.textContent.trim().slice(0, 180);
    }
    return null;
  }
  root.TBDom = { visible, enabled, disabledReason, rows, quantity, inspect, continueButton, blockingMessage, captcha, captchaSucceeded, CAPTCHA_ROOT, CAPTCHA_SUCCESS };
  if (typeof module !== "undefined") module.exports = root.TBDom;
})(globalThis);
