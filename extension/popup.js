import { CHANNELS, CHANNEL_LABEL, loadConfig, loadStatus, saveConfig } from "./config.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["hotel", "sheetUrl", "secret", "bookingHotelId", "agodaPropertyId", "intervalHours"];
const STATE_TEXT = { ok: "ổn", error: "lỗi", login: "cần đăng nhập lại" };

function note(text) {
  $("note").textContent = text;
}

async function fill() {
  const cfg = await loadConfig();
  for (const f of FIELDS) $(f).value = cfg[f] ?? "";
  for (const ch of CHANNELS) $(`en-${ch}`).checked = !!cfg.enabled[ch];
}

async function renderStatus() {
  const status = await loadStatus();
  const box = $("status");
  box.textContent = "";
  for (const ch of CHANNELS) {
    const s = status[ch];
    const div = document.createElement("div");
    div.className = "ch " + (s?.state ?? "");
    const when = s?.at ? new Date(s.at).toLocaleString("vi-VN") : "chưa quét";
    const detail = s ? `${STATE_TEXT[s.state] ?? s.state} · ${s.count} bài · ${s.message}` : "";
    div.innerHTML = `<span class="dot"></span><div><b></b> <span class="msg"></span><div class="msg"></div></div>`;
    div.querySelector("b").textContent = CHANNEL_LABEL[ch];
    div.querySelector("span.msg").textContent = when;
    div.querySelector("div.msg").textContent = detail;
    box.appendChild(div);
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
  note(r?.ok ? `Sheet trả lời: ${r.sheet ?? "ok"}` : `Lỗi: ${r?.error ?? "không rõ"}`);
};

$("scan").onclick = async () => {
  await save();
  note("Đang quét — có thể mất vài phút, có thể đóng ô này.");
  const r = await chrome.runtime.sendMessage({ type: "scanNow" });
  note(r?.ok ? "Xong lượt quét." : `Lỗi: ${r?.error ?? "không rõ"}`);
  await renderStatus();
};

chrome.storage.onChanged.addListener((changes) => {
  if (changes.status) renderStatus();
});

fill();
renderStatus();
