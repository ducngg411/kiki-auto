const C = TBCore, form = document.querySelector("form"), statusBox = document.querySelector("#status");
let clock = null, currentRun = null;
const fields = Object.keys(C.DEFAULTS);
function read() {
  const result = {};
  for (const key of fields) {
    const el = form.elements[key];
    result[key] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value;
  }
  return result;
}
function write(config) {
  for (const key of fields) { const el = form.elements[key]; if (el.type === "checkbox") el.checked = config[key]; else el.value = config[key]; }
  controls();
}
function controls() {
  const direct = form.elements.entryMode.value === "direct";
  document.querySelector("#directHint").hidden = !direct;
  document.querySelector("#start").textContent = direct ? "Hẹn giờ vào trang chọn vé" : "Bắt đầu canh vé";
  document.querySelector("#manualField").hidden = form.elements.clockMode.value !== "manual";
  form.elements.leadMs.disabled = form.elements.mode.value !== "early";
}
function message(text, error = false) {
  statusBox.textContent = text; statusBox.classList.toggle("error", error);
  statusBox.dataset.state = !error && currentRun?.active ? "running" : "idle";
}
async function send(data) {
  const response = await chrome.runtime.sendMessage(data);
  if (!response?.ok) throw Error(response?.error || "Không kết nối được extension.");
  return response;
}
function clockText() {
  const el = document.querySelector("#clock");
  el.classList.toggle("empty", !clock);
  if (!clock) { el.textContent = "Chưa đo giờ"; return; }
  const current = new Date(Date.now() + clock.offsetMs).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
  el.textContent = `${current} · giờ VN\n${clock.source}\nLệch máy: ${(clock.offsetMs / 1000).toFixed(2)}s${clock.uncertaintyMs === null ? "" : ` · sai số ước tính ≥ ${(clock.uncertaintyMs / 1000).toFixed(2)}s`}\n${clock.dateText ? `Date: ${clock.dateText}\nAge: ${clock.age == null ? "không có" : clock.age + "s"} · RTT: ${Math.round(clock.rttMs)}ms\n${[clock.cacheControl, clock.cache].filter(Boolean).join(" · ") || "Không có header cache"}\nNguồn: ${clock.probeUrl || clock.url}` : "Hãy đồng bộ giờ hệ điều hành trước."}`;
}
function saleText() {
  const el = document.querySelector("#saleHint");
  let target;
  try { target = C.parseSaleTime(form.elements.saleTime.value); } catch { el.textContent = ""; return; }
  const wait = target - Date.now() - (clock?.offsetMs || 0), s = Math.round(Math.abs(wait) / 1000);
  const span = `${Math.floor(s / 3600)} giờ ${Math.floor(s % 3600 / 60)} phút ${s % 60} giây`;
  el.textContent = wait > 0 ? `Còn ${span} đến giờ mở bán` : `Giờ mở bán đã qua ${span}. Bắt đầu lúc này tool sẽ chạy ngay; kiểm tra lại ngày.`;
  el.classList.toggle("late", wait <= 0);
}
async function activeTab() { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); if (!tab) throw Error("Không có tab đang mở."); return tab; }
document.querySelector("#sync").onclick = async event => {
  event.target.disabled = true;
  try { message("Đang lấy 3 mẫu giờ từ Ticketbox…"); ({ clock } = await send({ type: "SYNC", config: read() })); clockText(); message("Đã đo giờ. Kiểm tra ngày mở bán rồi bấm Bắt đầu."); }
  catch (error) { message(error.message, true); }
  finally { event.target.disabled = false; }
};
form.onsubmit = async event => {
  event.preventDefault();
  const button = document.querySelector("#start"); button.disabled = true;
  try {
    const config = C.validate(read()); const tab = await activeTab();
    const response = await send({ type: "START", config, tabId: tab.id });
    currentRun = response.run; message(`Đang canh ${config.quantity} vé ${config.tier}. Giữ tab vé mở phía trước. Esc để dừng.`);
  } catch (error) { message(error.message, true); }
  finally { button.disabled = false; }
};
document.querySelector("#stop").onclick = async () => {
  try { await send({ type: "STOP", reason: "Đã dừng từ popup" }); message("Đã dừng"); }
  catch (error) { message(error.message, true); }
};
document.querySelector("#openInside").onclick = async () => {
  try {
    const { run } = await send({ type: "GET" });
    if (run?.active) throw Error("Dừng phiên đang chạy trước khi đổi trang.");
    const url = C.ticketUrl(form.elements.insideUrl.value);
    if (!/^\/events\/\d+\/bookings\/\d+\/select-ticket\/?$/.test(url.pathname)) throw Error("Link chọn vé không hợp lệ.");
    await chrome.storage.local.set({ config: read() });
    await chrome.tabs.update((await activeTab()).id, { url: url.href });
    message("Đã mở link. Chờ trang tải xong rồi bấm Bắt đầu.");
  } catch (error) { message(error.message, true); }
};
form.addEventListener("change", () => { controls(); void chrome.storage.local.set({ config: read() }); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes.run?.newValue) {
    currentRun = changes.run.newValue; message(currentRun.status); renderLogs();
  }
});
function renderLogs() {
  document.querySelector("#logs").textContent = currentRun?.logs?.map(item => `${new Date(item.at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} ${item.text}`).join("\n") || "Chưa có thao tác";
}
async function init() {
  document.querySelector("#version").textContent = `v${C.VERSION}`;
  const data = await send({ type: "GET" });
  const config = { ...C.DEFAULTS, ...data.config };
  if (!config.saleTime) config.saleTime = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) + "T12:00:00";
  write(config); clock = data.clock; currentRun = data.run;
  clockText(); renderLogs(); if (currentRun) message(currentRun.status);
}
document.querySelector("#diagnose").onclick = async () => {
  const output = document.querySelector("#diagnostics");
  try {
    const tab = await activeTab();
    const data = await chrome.tabs.sendMessage(tab.id, { type: "DIAGNOSE" });
    if (!data) throw Error("Tab chưa có bản chẩn đoán mới.");
    output.textContent = JSON.stringify({ extension: C.VERSION, ...data }, null, 2);
  } catch (error) { output.textContent = error.message; }
};
void init().catch(error => message(error.message, true));
setInterval(() => { clockText(); saleText(); }, 250);
