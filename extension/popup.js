import { CHANNELS, CHANNEL_LABEL, VERSION, getDeviceId, loadConfig, loadLastError, loadStatus, saveConfig } from "./config.js";
import { formatErrorReport } from "./report.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["hotel", "sheetUrl", "secret", "bookingHotelId", "agodaPropertyId", "expediaPropertyId", "intervalHours"];
const STATE_TEXT = { ok: "ổn", error: "lỗi", login: "cần đăng nhập lại" };

function note(text) {
  $("note").textContent = text;
}

async function fill() {
  const cfg = await loadConfig();
  for (const f of FIELDS) $(f).value = cfg[f] ?? "";
  for (const ch of CHANNELS) $(`en-${ch}`).checked = !!cfg.enabled[ch];
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
  box.innerHTML = `<div>Mã lỗi <span class="ref"></span> <span class="msg"></span><button>Sao chép</button></div><div class="hint"></div>`;
  box.querySelector(".ref").textContent = entry.ref;
  box.querySelector("span.msg").textContent = `(${entry.code})`;
  box.querySelector(".hint").textContent = entry.hint ?? "";
  const button = box.querySelector("button");
  button.onclick = () => copyReport(entry, button);
  return box;
}

async function renderStatus() {
  const status = await loadStatus();
  const box = $("status");
  box.textContent = "";
  const shown = new Set();
  for (const ch of CHANNELS) {
    const s = status[ch];
    const div = document.createElement("div");
    div.className = "ch " + (s?.state ?? "");
    const when = s?.at ? new Date(s.at).toLocaleString("vi-VN") : "chưa quét";
    const detail = s ? `${STATE_TEXT[s.state] ?? s.state} · ${s.count} bài · ${s.message}` : "";
    div.innerHTML = `<span class="dot"></span><div class="body"><b></b> <span class="msg"></span><div class="msg"></div></div>`;
    div.querySelector("b").textContent = CHANNEL_LABEL[ch];
    div.querySelector("span.msg").textContent = when;
    div.querySelector("div.msg").textContent = detail;
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
    h.textContent = `Lỗi gửi Sheet · ${new Date(last.at).toLocaleString("vi-VN")}`;
    const msg = document.createElement("div");
    msg.className = "msg";
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
}

$("save").onclick = async () => {
  await save();
  note("Đã lưu.");
};

$("ping").onclick = async () => {
  await save();
  note("Đang thử…");
  const r = await chrome.runtime.sendMessage({ type: "pingSheet" });
  note(r?.ok ? `Sheet trả lời: ${r.sheet ?? "ok"}` : `Lỗi${r?.ref ? " " + r.ref : ""}: ${r?.error ?? "không rõ"}`);
  await renderStatus();
};

$("scan").onclick = async () => {
  await save();
  note("Đang quét — có thể mất vài phút, có thể đóng ô này.");
  const r = await chrome.runtime.sendMessage({ type: "scanNow" });
  note(r?.ok ? "Xong lượt quét." : `Lỗi: ${r?.error ?? "không rõ"}`);
  await renderStatus();
};

chrome.storage.onChanged.addListener((changes) => {
  if (changes.status || changes.lastError) renderStatus();
});

fill();
renderStatus();
getDeviceId().then((id) => {
  $("device").textContent = `Mã máy ${id.slice(0, 8)} · phiên bản ${VERSION}`;
});
