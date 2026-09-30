(function (root) {
  "use strict";
  const VERSION = "1.0.5";
  const DEFAULTS = Object.freeze({
    eventUrl: "https://ticketbox.vn/viewing-party-chung-ket-tong-giai-dau-valorant-champions-2026-26611",
    insideUrl: "https://ticketbox.vn/events/26611/bookings/40591273081648/select-ticket",
    tier: "RADIANT", quantity: 4, entryMode: "scheduled", saleTime: "", mode: "exact", leadMs: 1000,
    earlyBuy: true, keepInside: true, exactFallback: true,
    retryRefresh: false, retryMs: 5000, maxRefresh: 12,
    clockMode: "auto", manualMinutes: 45
  });
  const normalize = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").replace(/\s+/g, " ").trim().toLowerCase();
  const tierName = value => normalize(value).replace(/^hang ve\s+/, "");
  function ticketUrl(value) {
    const url = new URL(value);
    if (url.origin !== "https://ticketbox.vn" || url.username || url.password) throw Error("Link phải thuộc https://ticketbox.vn.");
    url.hash = "";
    return url;
  }
  function parseSaleTime(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw Error("Nhập ngày và giờ mở bán (giờ Việt Nam).");
    const ms = Date.parse(value + "+07:00");
    if (!Number.isFinite(ms)) throw Error("Giờ mở bán không hợp lệ.");
    return ms;
  }
  function validate(input) {
    const c = { ...DEFAULTS, ...input };
    const event = ticketUrl(c.eventUrl);
    const inside = ticketUrl(c.insideUrl);
    const match = inside.pathname.match(/^\/events\/(\d+)\/bookings\/\d+\/select-ticket\/?$/);
    if (!match || !event.pathname.endsWith("-" + match[1])) throw Error("Link sự kiện và link chọn vé phải cùng sự kiện.");
    if (!c.tier.trim() || c.tier.length > 100) throw Error("Nhập tên hạng vé.");
    if (!Number.isInteger(c.quantity) || c.quantity < 1 || c.quantity > 20) throw Error("Số vé phải từ 1 đến 20; giới hạn thực tế do Ticketbox quyết định.");
    if (!["scheduled", "direct"].includes(c.entryMode)) throw Error("Chế độ vào trang không hợp lệ.");
    if (!["exact", "early"].includes(c.mode)) throw Error("Chế độ canh giờ không hợp lệ.");
    if (!["auto", "manual", "local"].includes(c.clockMode)) throw Error("Nguồn giờ không hợp lệ.");
    if (!Number.isFinite(c.leadMs) || c.leadMs < 0 || c.leadMs > 60000) throw Error("Khoảng tải sớm phải từ 0 đến 60000 ms.");
    if (!Number.isFinite(c.manualMinutes) || Math.abs(c.manualMinutes) > 120) throw Error("Bù cache phải trong ±120 phút.");
    if (!Number.isInteger(c.retryMs) || c.retryMs < 3000 || c.retryMs > 60000) throw Error("Chu kỳ tải lại phải từ 3000 đến 60000 ms.");
    if (!Number.isInteger(c.maxRefresh) || c.maxRefresh < 1 || c.maxRefresh > 30) throw Error("Số lần tải lại phải từ 1 đến 30.");
    for (const key of ["earlyBuy", "keepInside", "exactFallback", "retryRefresh"]) c[key] = Boolean(c[key]);
    c.eventUrl = event.href; c.insideUrl = inside.href;
    c.eventId = match[1]; c.targetMs = parseSaleTime(c.saleTime);
    return c;
  }
  function pageKind(href, config) {
    try {
      const url = ticketUrl(href);
      if (url.pathname === new URL(config.eventUrl).pathname) return "outside";
      if (new RegExp("^/events/" + config.eventId + "/bookings/\\d+/select-ticket/?$").test(url.pathname)) return "inside";
      return "other";
    } catch { return "other"; }
  }
  // HTTP Date/Age is a coarse HTTP/CDN clock estimate, not a booking-server timestamp.
  function clockSample(headers, t0, t1, mode = "auto", manualMinutes = 45) {
    const dateText = headers.get("date");
    const date = Date.parse(dateText);
    if (!Number.isFinite(date)) throw Error("Ticketbox không trả header Date.");
    const rawAge = headers.get("age");
    if (rawAge !== null && !/^\d+$/.test(rawAge.trim())) throw Error("Header Age không hợp lệ.");
    const age = rawAge === null ? null : Number(rawAge);
    const cache = headers.get("x-tkb-cache") || headers.get("x-cache") || "";
    if (mode === "auto" && age === null && /hit/i.test(cache)) throw Error("Phản hồi cache HIT thiếu Age; không thể tự suy ra giờ hiện tại.");
    const correction = mode === "manual" ? manualMinutes * 60000 : (age || 0) * 1000;
    const rttMs = Math.max(0, t1 - t0);
    return { dateText, age, cache, cacheControl: headers.get("cache-control") || "",
      offsetMs: date + correction + rttMs / 2 - t1, rttMs,
      uncertaintyMs: 1000 + rttMs / 2, measuredAt: t1, mode, manualMinutes,
      source: mode === "manual" ? `Date + ${manualMinutes} phút (thủ công)` : "HTTP Date + Age (ước tính)" };
  }
  function refreshReason(run, now, inside) {
    const c = run.config;
    const stages = run.refreshStages || [];
    // Direct entry always gets its first scheduled load, even when starting
    // inside an empty selection page. Keep-inside applies after that load.
    if (inside && c.keepInside && !(c.entryMode === "direct" && !stages.includes("scheduled"))) return null;
    if (run.refreshCount >= c.maxRefresh) return null;
    const firstAt = c.targetMs - (c.mode === "early" ? c.leadMs : 0);
    if (!stages.includes("scheduled") && now >= firstAt) return "scheduled";
    if (c.mode === "early" && c.exactFallback && !stages.includes("exact-fallback") && now >= c.targetMs) return "exact-fallback";
    if (c.retryRefresh && now >= c.targetMs && run.refreshCount < c.maxRefresh && now - (run.lastRefreshAt || 0) >= c.retryMs) return "retry";
    return null;
  }
  const api = { VERSION, DEFAULTS, normalize, tierName, ticketUrl, parseSaleTime, validate, pageKind, clockSample, refreshReason };
  root.TBCore = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
