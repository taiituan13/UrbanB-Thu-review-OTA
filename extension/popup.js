import { CHANNELS, CHANNEL_LABEL, VERSION, getDeviceId, loadLastError, loadStatus } from "./config.js";
import { formatErrorReport } from "./report.js";
import { UPDATE_COMMAND, updateNotice } from "./update.js";
import { HUB_LABELS } from "./env.js";
import { branchPicker, popupPmsRow } from "./quay/hub-quay.js";
import { noChannelText, reviewRow, reviewSourceLines } from "./popup-model.js";
import { loadEffectiveConfig, reviewMissingText, scheduleText } from "./hub-config.js";

const $ = (id) => document.getElementById(id);
const STATE_TEXT = { ok: "ổn", error: "lỗi", login: "cần đăng nhập lại" };

/** Dòng chữ dưới nút Quét ngay; `where` = "settingsNote" cho dòng trong khối Cài đặt. */
function note(text, where = "note") {
  $(where).textContent = text;
}

/**
 * Dòng "Tự quét mỗi N giờ" và khối "Thu review OTA" trong Cài đặt: Sheet, tên khách sạn, kênh, mã chỗ nghỉ
 * và nguồn của từng thứ (H-1527 a: theo Hub; Hub chưa có thì cấu hình cũ của máy). Chỉ để xem.
 */
async function renderCollect() {
  const cfg = await loadEffectiveConfig();
  $("auto").textContent = scheduleText(cfg.collect);
  const box = $("reviewSrc");
  box.textContent = "";
  for (const line of reviewSourceLines(cfg, CHANNELS)) {
    const d = document.createElement("div");
    d.className = "small" + (line.warn ? " warn" : "");
    d.textContent = line.text;
    box.appendChild(d);
  }
  return cfg;
}

/** Một dòng tình trạng (chấm màu · tình trạng · việc cần làm). */
function paintRow(prefix, row) {
  $(prefix + "Row").className = "pch " + (row.tone || "off");
  $(prefix + "State").textContent = row.state ?? "";
  $(prefix + "Detail").textContent = row.detail ?? "";
  if ($(prefix + "When")) $(prefix + "When").textContent = row.when ?? "";
}

/** Phiên Hub + mục "Khung trên PMS": đọc qua service worker (quay/sw.js statusForPopup). */
async function renderQuay() {
  let snap;
  try {
    snap = await chrome.runtime.sendMessage({ type: "quay:status" });
  } catch {
    snap = null;
  }
  const session = snap?.session ?? "out";
  const hubLabel = HUB_LABELS[snap?.origin] ?? snap?.origin ?? "Hub";
  $("who").textContent =
    session === "out" ? `Chưa đăng nhập ${hubLabel}`
    : session === "expired" ? `Phiên ${hubLabel} đã hết`
    : snap?.net ? `Không gọi được ${hubLabel} · đang hiện lượt trước`
    : `${snap?.notifications?.me ? snap.notifications.me + " · " : "Đã đăng nhập "}${hubLabel}${snap?.branchName ? " · " + snap.branchName : ""}`;
  $("outBox").hidden = session !== "out";
  $("expired").hidden = session !== "expired";
  $("tm").hidden = !snap?.tampermonkey;
  $("openHub").hidden = session === "out";
  const row = popupPmsRow(snap);
  paintRow("pms", { ...row, when: "" });
  const subs = $("pmsSubs");
  subs.textContent = "";
  for (const x of row.subs) {
    const d = document.createElement("span");
    d.className = "d " + (x.tone === "off" ? "" : x.tone);
    const t = document.createElement("span");
    t.textContent = x.text;
    const m = document.createElement("span");
    m.className = "m";
    m.textContent = x.at ? shortTime(x.at) : "";
    subs.append(d, t, m);
  }
  $("hubNow").textContent = hubLabel;
}

/** Ô chọn cơ sở (H-1351 c): đọc danh sách cơ sở của người đăng nhập qua lượt chỉ đọc scope=mine. */
async function renderBranches() {
  let r;
  try {
    r = await chrome.runtime.sendMessage({ type: "quay:mine" });
  } catch {
    r = null;
  }
  const model = branchPicker(r?.branches ?? null, r?.chosenId ?? "");
  $("branchBox").hidden = !model;
  if (!model) return;
  $("branchBox").className = "band " + (model.ask ? "upd" : "info");
  $("branchText").textContent = model.text;
  const sel = $("quayBranch");
  sel.textContent = "";
  for (const o of model.options) sel.add(new Option(o.label, o.value));
  sel.value = model.value;
}

/** Mục "Thu review OTA": một dòng tóm tắt; chi tiết từng kênh nằm trong "Xem từng kênh". */
async function renderReviewRow() {
  const [cfg, status] = await Promise.all([loadEffectiveConfig(), loadStatus()]);
  const row = reviewRow(cfg, status, CHANNELS);
  paintRow("rv", row);
  // Có kênh lỗi ⇒ mở sẵn danh sách kênh để thấy mã lỗi ngay.
  if (row.tone === "err") $("rvMore").open = true;
}

async function fill() {
  const cfg = await renderCollect();
  // Thu review chưa đủ cấu hình: mở sẵn khối Cài đặt để thấy ngay thiếu gì.
  if (reviewMissingText(cfg.review)) $("settings").open = true;
}

/** Chép đoạn báo lỗi đầy đủ (mã, khách sạn, máy, phiên bản, lỗi) để dán gửi người quản lý. */
async function copyReport(entry, button) {
  const cfg = await loadEffectiveConfig();
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
  renderReviewRow();
  const [cfg, status] = await Promise.all([loadEffectiveConfig(), loadStatus()]);
  const box = $("status");
  box.textContent = "";
  const shown = new Set();
  const enabled = CHANNELS.filter((ch) => cfg.enabled[ch]);
  if (!enabled.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = `Chưa bật kênh nào. ${noChannelText(cfg)}`;
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
    // Kết quả gửi Hub (theo phiên đăng nhập) của lượt đó.
    if (s?.hub) {
      const hub = document.createElement("div");
      hub.className = "hub" + (s.hub.ok ? "" : " bad");
      // Câu lỗi Hub tự nhắc chữ "Hub" rồi; chỉ thêm tiền tố khi chưa có.
      hub.textContent = /Hub/.test(s.hub.text) ? s.hub.text : `Hub: ${s.hub.text}`;
      div.querySelector(".body").appendChild(hub);
      if (s.hub.error?.ref && !s.hub.ok) div.querySelector(".body").appendChild(errorBox(s.hub.error));
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

/** Chép lệnh cập nhật; đổi chữ trên nút một lúc để người bấm biết đã chép. */
async function copyCommand(button) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(UPDATE_COMMAND);
    button.textContent = "Đã chép";
  } catch {
    button.textContent = "Chép hỏng — bôi đen lệnh";
  }
  setTimeout(() => (button.textContent = label), 2000);
}

/** Dải "Có bản mới" và dòng phiên bản trong Cài đặt, theo kết quả kiểm GitHub đã lưu. */
async function renderUpdate() {
  const { update } = await chrome.storage.local.get("update");
  const notice = updateNotice(update, VERSION);
  $("update").hidden = !notice;
  if (notice) $("updTitle").textContent = `Có bản mới ${notice.latest} (máy đang chạy ${notice.current})`;
  $("updState").textContent = !update?.latest
    ? `Máy đang chạy bản ${VERSION}. Chưa kiểm được bản mới nhất trên GitHub.`
    : notice
      ? `Máy đang chạy bản ${VERSION}; bản mới nhất ${update.latest}.`
      : `Máy đang chạy bản mới nhất (${VERSION}).`;
}

/** Một dòng kết quả Thử Sheet (kèm Hub nếu máy gửi Hub). */
function pingText(r) {
  const sheet = r?.ok ? `Sheet trả lời: ${r.sheet ?? "ok"}` : `Lỗi Sheet${r?.ref ? " " + r.ref : ""}: ${r?.error ?? "không rõ"}`;
  const hub = !r?.hub ? "" : r.hub.ok ? " · Hub: ổn" : ` · Lỗi Hub ${r.hub.ref ?? ""}: ${r.hub.error ?? "không rõ"}`;
  return sheet + hub;
}

/** Kết quả áp mã cài đặt (background.js applySetupText). */
function setupText(r) {
  if (!r?.ok) return `Không nhận được mã cài đặt: ${r?.error ?? "không rõ"}`;
  return `Đã nhận cài đặt của ${r.hotel}. ${pingText(r.ping)}`;
}

async function ping() {
  note("Đang thử…", "settingsNote");
  const r = await chrome.runtime.sendMessage({ type: "pingSheet" });
  note(pingText(r), "settingsNote");
  await renderStatus();
}

/**
 * Lệnh cài kèm mã: extension tự áp lúc nạp. Lần mở ô đầu tiên sau đó báo lại kết quả một lần,
 * để người cài thấy máy đã nhận đúng khách sạn.
 */
async function showSetupFromFile() {
  await chrome.runtime.sendMessage({ type: "importSetupFile" }).catch(() => {});
  const { setupResult } = await chrome.storage.local.get("setupResult");
  if (setupResult?.from !== "tệp" || setupResult.shown) return;
  await chrome.storage.local.set({ setupResult: { ...setupResult, shown: true } });
  await fill();
  const next = setupResult.ping?.ok ? " Bước tiếp: đăng nhập các extranet trong Chrome này rồi bấm Quét ngay." : "";
  note(setupText(setupResult) + next);
}

$("ping").onclick = () => ping();

$("scan").onclick = async () => {
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

for (const b of document.querySelectorAll("[data-login]"))
  b.onclick = () => chrome.runtime.sendMessage({ type: "quay:openHub", path: "/login" });
$("openHub").onclick = () => chrome.runtime.sendMessage({ type: "quay:openHub", path: "/" });
$("quayBranch").onchange = async () => {
  const r = await chrome.runtime.sendMessage({ type: "quay:setBranch", branchId: $("quayBranch").value });
  note(r?.ok ? "Đã chọn cơ sở của máy quầy." : `Không chọn được cơ sở: ${r?.error ?? "không rõ"}`);
  await renderBranches();
};

$("copyUpdate").onclick = () => copyCommand($("copyUpdate"));
$("copyCmd").onclick = () => copyCommand($("copyCmd"));

chrome.storage.onChanged.addListener((changes) => {
  if (changes.status || changes.lastError || changes.config || changes.hubCollect) renderStatus();
  if (changes.hubCollect || changes.quayMine || changes.quayBranchId || changes.config) renderCollect();
  if (changes.update) renderUpdate();
  if (changes.quaySnap) renderQuay();
});

$("updateCmd").value = UPDATE_COMMAND;
fill();
// Cấu hình chung và danh sách cơ sở trên Hub có thể vừa đổi: hỏi lại (lượt chỉ đọc scope=mine);
// cấu hình đổi thì popup tự vẽ lại (onChanged hubCollect).
renderBranches();
renderQuay();
renderStatus();
renderUpdate();
showSetupFromFile();
chrome.runtime.sendMessage({ type: "checkUpdate" }).catch(() => {});
getDeviceId().then((id) => {
  $("device").textContent = `Mã máy ${id.slice(0, 8)} · phiên bản ${VERSION}`;
});
