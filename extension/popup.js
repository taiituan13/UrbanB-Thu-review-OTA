import { CHANNELS, CHANNEL_LABEL, VERSION, getDeviceId, loadConfig, loadLastError, loadStatus, saveConfig } from "./config.js";
import { formatErrorReport } from "./report.js";
import { parseSetupCode } from "./setup-code.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["hotel", "sheetUrl", "secret", "bookingHotelId", "agodaPropertyId", "expediaPropertyId", "intervalHours"];
const STATE_TEXT = { ok: "ổn", error: "lỗi", login: "cần đăng nhập lại" };

/** Dòng chữ dưới nút Quét ngay; `where` = "settingsNote" cho dòng trong khối Cài đặt. */
function note(text, where = "note") {
  $(where).textContent = text;
}

/** Tên khách sạn trên dải đầu và dòng "Tự quét mỗi N giờ" theo cấu hình đã lưu. */
function renderHeader(cfg) {
  $("hdrHotel").textContent = cfg.hotel || "Chưa đặt tên khách sạn";
  $("auto").textContent = `Tự quét mỗi ${Math.max(1, Number(cfg.intervalHours) || 6)} giờ.`;
}

async function fill() {
  const cfg = await loadConfig();
  for (const f of FIELDS) $(f).value = cfg[f] ?? "";
  for (const ch of CHANNELS) $(`en-${ch}`).checked = !!cfg.enabled[ch];
  renderHeader(cfg);
  // Máy mới cài: mở sẵn khối Cài đặt để người cài thấy ngay ô phải điền.
  if (!cfg.hotel || !cfg.sheetUrl || !cfg.secret) $("settings").open = true;
}

/** Chép đoạn báo lỗi đầy đủ (mã, khách sạn, máy, phiên bản, lỗi) để dán gửi người quản lý. */
async function copyReport(entry, button) {
  const cfg = await loadConfig();
  const text = formatErrorReport(entry, { hotel: cfg.hotel, deviceId: await getDeviceId(), version: VERSION });
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Đã chép";
  } catch {
    button.textContent = "Chép hỏng — bôi đen mã";
  }
  setTimeout(() => (button.textContent = "Sao chép"), 2000);
}

/** Khung đỏ: mã lỗi + nút Sao chép + cách xử lý. */
function errorBox(entry) {
  const box = document.createElement("div");
  box.className = "err";
  box.innerHTML = `<div class="top">Mã lỗi <span class="ref"></span> <span class="code"></span><button class="secondary">Sao chép</button></div><div class="hint"></div>`;
  box.querySelector(".ref").textContent = entry.ref;
  box.querySelector(".code").textContent = `(${entry.code})`;
  box.querySelector(".hint").textContent = entry.hint ?? "";
  const button = box.querySelector("button");
  button.onclick = () => copyReport(entry, button);
  return box;
}

/** Giờ ngắn gọn: "14:05 8/10". */
function shortTime(iso) {
  const d = new Date(iso);
  return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Chỉ hiện các kênh đang bật; kênh đã tắt giữ trạng thái cũ trong bộ nhớ nhưng không hiện. */
async function renderStatus() {
  const [cfg, status] = await Promise.all([loadConfig(), loadStatus()]);
  const box = $("status");
  box.textContent = "";
  const shown = new Set();
  const enabled = CHANNELS.filter((ch) => cfg.enabled[ch]);
  if (!enabled.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Chưa bật kênh nào. Mở Cài đặt, chọn kênh rồi bấm Lưu.";
    box.appendChild(empty);
  }
  for (const ch of enabled) {
    const s = status[ch];
    const div = document.createElement("div");
    div.className = "ch " + (s?.state ?? "");
    const when = s?.at ? shortTime(s.at) : "chưa quét";
    const detail = s ? `${STATE_TEXT[s.state] ?? s.state} · ${s.count} bài · ${s.message}` : "";
    div.innerHTML = `<span class="dot"></span><div class="body"><div class="line"><span class="name"></span><span class="when"></span></div><div class="detail"></div></div>`;
    div.querySelector(".name").textContent = CHANNEL_LABEL[ch];
    div.querySelector(".when").textContent = when;
    div.querySelector(".detail").textContent = detail;
    if (s?.error?.ref) {
      div.querySelector(".body").appendChild(errorBox(s.error));
      shown.add(s.error.ref);
    }
    box.appendChild(div);
  }
  // Lỗi gửi Sheet không thuộc kênh nào (Thử Sheet, báo sống) chỉ hiện ở đây; gửi được lại thì tự mất.
  const last = await loadLastError();
  const lastBox = $("last");
  lastBox.textContent = "";
  if (last?.ref && last.stage === "gửi Sheet" && !shown.has(last.ref)) {
    const h = document.createElement("h2");
    h.textContent = `Lỗi gửi Sheet · ${shortTime(last.at)}`;
    const msg = document.createElement("div");
    msg.className = "detail";
    msg.textContent = `${CHANNEL_LABEL[last.channel] ?? "Sheet"} · ${last.stage} · ${last.message}`;
    lastBox.append(h, msg, errorBox(last));
  }
}

async function save() {
  const cfg = await loadConfig();
  for (const f of FIELDS) cfg[f] = $(f).value.trim();
  cfg.intervalHours = Math.max(1, Number(cfg.intervalHours) || 6);
  for (const ch of CHANNELS) cfg.enabled[ch] = $(`en-${ch}`).checked;
  await saveConfig(cfg);
  await chrome.runtime.sendMessage({ type: "reschedule" });
  renderHeader(cfg);
  await renderStatus();
}

$("save").onclick = async () => {
  await save();
  note("Đã lưu.", "settingsNote");
};

async function ping() {
  note("Đang thử…", "settingsNote");
  const r = await chrome.runtime.sendMessage({ type: "pingSheet" });
  note(r?.ok ? `Sheet trả lời: ${r.sheet ?? "ok"}` : `Lỗi${r?.ref ? " " + r.ref : ""}: ${r?.error ?? "không rõ"}`, "settingsNote");
  await renderStatus();
}

$("ping").onclick = async () => {
  await save();
  await ping();
};

// Mã cài đặt điền tên, URL, mã bí mật và kênh; các mã khách sạn trên kênh và chu kỳ quét giữ nguyên.
$("applyCode").onclick = async () => {
  let parsed;
  try {
    parsed = parseSetupCode($("setupCode").value, CHANNELS);
  } catch (e) {
    note(e.message, "settingsNote");
    return;
  }
  const cfg = await loadConfig();
  await saveConfig({ ...cfg, ...parsed });
  await chrome.runtime.sendMessage({ type: "reschedule" });
  $("setupCode").value = "";
  await fill();
  await ping();
};

$("scan").onclick = async () => {
  await save();
  $("scan").disabled = true;
  note("Đang quét. Có thể mất vài phút, đóng ô này cũng không sao.");
  try {
    const r = await chrome.runtime.sendMessage({ type: "scanNow" });
    note(r?.ok ? "Xong lượt quét." : `Lỗi: ${r?.error ?? "không rõ"}`);
  } finally {
    $("scan").disabled = false;
  }
  await renderStatus();
};

chrome.storage.onChanged.addListener((changes) => {
  if (changes.status || changes.lastError || changes.config) renderStatus();
});

fill();
renderStatus();
getDeviceId().then((id) => {
  $("device").textContent = `Mã máy ${id.slice(0, 8)} · phiên bản ${VERSION}`;
});
