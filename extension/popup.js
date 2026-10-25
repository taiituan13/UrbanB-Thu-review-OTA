import { CHANNELS, CHANNEL_LABEL, VERSION, getDeviceId, loadStatus } from "./config.js";
import { formatErrorReport } from "./report.js";
import { UPDATE_COMMAND, updateNotice } from "./update.js";
import { branchPicker, popupPmsRow } from "./quay/hub-quay.js";
import { hubLabel, hubSwitchTargets, needsReload, noChannelText, reviewRow, reviewSourceLines, whoText } from "./popup-model.js";
import { LOGIN_PAGE } from "./login-watch.js";
import { loadEffectiveConfig, loadHubCollect, reviewMissingText, scheduleText, setupPagePath } from "./hub-config.js";

const $ = (id) => document.getElementById(id);
/** Bản Chrome đang chạy. `VERSION` (config.js) là bản trên đĩa, có thể mới hơn khi vừa chạy lệnh cài. */
const RUNNING = chrome.runtime.getManifest().version;
const STATE_TEXT = { ok: "ổn", error: "lỗi", login: "cần đăng nhập lại" };

/** Dòng chữ dưới nút Quét review ngay; `where` = "settingsNote" cho dòng trong khối Cài đặt. */
function note(text, where = "note") {
  $(where).textContent = text;
}

/**
 * Dòng "Tự quét mỗi N giờ" và khối "Thu review OTA" trong Cài đặt: tên khách sạn, kênh, mã chỗ nghỉ
 * và nguồn của từng thứ (H-1527 a: theo Hub; Hub chưa có thì cấu hình cũ của máy). Chỉ để xem.
 */
async function renderCollect() {
  const cfg = await loadEffectiveConfig();
  const auto = scheduleText(cfg.collect, cfg.review);
  $("auto").hidden = !auto;
  $("auto").textContent = auto ?? "";
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
  const hub = hubLabel(snap);
  $("who").textContent = whoText(snap);
  refreshAccountName(session);
  // Không hỏi được phần chạy nền thì chưa biết phiên Hub: không hiện hộp "chưa đăng nhập".
  $("outBox").hidden = !snap || session !== "out";
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
  $("hubNow").textContent = hub;
  $("hubLineNow").textContent = hub;
  renderHubSwitch(snap?.origin);
}

/** Nút chuyển Hub trong Cài đặt › Hub (YC-156 L1): mở màn Cài extension trên Hub kia trong tab mới. */
function renderHubSwitch(origin) {
  const box = $("hubSwitch");
  box.textContent = "";
  if (!origin) return;
  for (const t of hubSwitchTargets(origin)) {
    const b = document.createElement("button");
    b.className = "secondary";
    b.textContent = `Chuyển sang ${t.label}`;
    b.onclick = () => chrome.tabs.create({ url: t.url });
    box.appendChild(b);
  }
}

/**
 * L7: mỗi lần mở popup hỏi lại route thông báo một lượt để có tên tài khoản đang đăng nhập, kể cả khi chưa mở
 * PMS (trước đây chỉ khung trên PMS hỏi route ấy). Ảnh trạng thái đổi thì popup tự vẽ lại (onChanged quaySnap).
 */
let askedName = false;
function refreshAccountName(session) {
  if (askedName || session === "out" || session === "expired") return;
  askedName = true;
  chrome.runtime.sendMessage({ type: "quay:notifications" }).catch(() => {});
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
  // Có kênh lỗi ⇒ mở sẵn danh sách kênh để thấy mã lỗi ngay; kênh cần đăng nhập ⇒ thấy ngay hai nút (YC-199).
  if (row.tone === "err" || Object.values(status ?? {}).some((s) => s?.state === "login")) $("rvMore").open = true;
}

async function fill() {
  const cfg = await renderCollect();
  // Thu review chưa đủ cấu hình: mở sẵn khối Cài đặt để thấy ngay thiếu gì.
  if (reviewMissingText(cfg.review)) $("settings").open = true;
}

/** Chép đoạn báo lỗi đầy đủ (mã, khách sạn, máy, phiên bản, lỗi) để dán gửi người quản lý. */
async function copyReport(entry, button) {
  const cfg = await loadEffectiveConfig();
  const text = formatErrorReport(entry, { hotel: cfg.hotel, deviceId: await getDeviceId(), version: RUNNING });
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Đã chép";
  } catch {
    button.textContent = "Chép hỏng — bôi đen mã";
  }
  setTimeout(() => (button.textContent = "Sao chép"), 2000);
}

/**
 * Khung đỏ: chuyện gì đang xảy ra, vì sao, các bước có số (YC-158, bổ sung của user 21/10/2026), rồi mã
 * lỗi + nút Sao chép. Bản cũ trong bộ nhớ chưa có `help` ⇒ hiện câu gợi ý một dòng như trước.
 */
function errorBox(entry) {
  const box = document.createElement("div");
  box.className = "err";
  box.innerHTML = `<div class="what"></div><div class="why"></div><ol class="steps"></ol><div class="hint"></div><div class="top">Mã lỗi <span class="ref"></span> <span class="code"></span><button class="secondary">Sao chép</button></div>`;
  box.querySelector(".ref").textContent = entry.ref;
  box.querySelector(".code").textContent = `(${entry.code})`;
  const help = entry.help;
  if (help?.what) {
    box.querySelector(".what").textContent = help.what;
    box.querySelector(".why").textContent = help.why ? `Vì sao: ${help.why}` : "";
    for (const step of help.steps ?? []) {
      const li = document.createElement("li");
      li.textContent = step;
      box.querySelector(".steps").appendChild(li);
    }
  } else box.querySelector(".hint").textContent = entry.hint ?? "";
  const button = box.querySelector("button");
  button.onclick = () => copyReport(entry, button);
  return box;
}

/**
 * YC-199: dòng kênh cần đăng nhập lại có hai nút — mở trang đăng nhập của kênh (tab mới, ngay trước mặt), và quét
 * lại riêng kênh này. Đăng nhập xong thì máy cũng tự quét lại kênh ấy (background.js), nút để bấm khi không muốn chờ.
 */
function loginActions(ch) {
  const row = document.createElement("div");
  row.className = "acts";
  const open = document.createElement("button");
  open.className = "secondary";
  open.textContent = "Mở trang đăng nhập";
  open.onclick = () => chrome.tabs.create({ url: LOGIN_PAGE[ch], active: true });
  const again = document.createElement("button");
  again.className = "secondary";
  again.textContent = "Quét lại kênh này";
  again.onclick = async () => {
    again.disabled = true;
    note(`Đang quét lại ${CHANNEL_LABEL[ch] ?? ch}…`);
    try {
      const r = await chrome.runtime.sendMessage({ type: "scanChannel", channel: ch });
      note(r?.ok ? `Xong lượt quét ${CHANNEL_LABEL[ch] ?? ch}.` : `Lỗi: ${r?.error ?? "không rõ"}`);
    } finally {
      again.disabled = false;
    }
    await renderStatus();
  };
  row.append(open, again);
  return row;
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
    const detail = s ? `${STATE_TEXT[s.state] ?? s.state}, ${s.count} bài.${s.message ? " " + s.message : ""}` : "";
    div.innerHTML = `<span class="dot"></span><div class="body"><div class="line"><span class="name"></span><span class="when"></span></div><div class="detail"></div></div>`;
    div.querySelector(".name").textContent = CHANNEL_LABEL[ch];
    div.querySelector(".when").textContent = when;
    div.querySelector(".detail").textContent = detail;
    if (s?.state === "login") div.querySelector(".body").appendChild(loginActions(ch));
    if (s?.error?.ref) div.querySelector(".body").appendChild(errorBox(s.error));
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
  const notice = updateNotice(update, RUNNING);
  $("update").hidden = !notice;
  if (notice) $("updTitle").textContent = `Có bản mới ${notice.latest} (máy đang chạy ${notice.current})`;
  $("updState").textContent = !update?.latest
    ? `Máy đang chạy bản ${RUNNING}. Chưa kiểm được bản mới nhất trên GitHub.`
    : notice
      ? `Máy đang chạy bản ${RUNNING}; bản mới nhất ${update.latest}.`
      : `Máy đang chạy bản mới nhất (${RUNNING}).`;
}

/** Một dòng kết quả Thử Hub (background.js pingHub). */
function pingText(r) {
  return r?.ok ? "Hub: ổn." : `Lỗi Hub${r?.ref ? " " + r.ref : ""}: ${r?.error ?? "không rõ"}`;
}

/** Kết quả áp mã cài đặt (background.js applySetupText). */
function setupText(r) {
  if (!r?.ok) return `Không nhận được mã cài đặt: ${r?.error ?? "không rõ"}`;
  return `Đã nhận cài đặt của ${r.hotel}. ${pingText(r.ping)}`;
}

async function ping() {
  note("Đang thử…", "settingsNote");
  const r = await chrome.runtime.sendMessage({ type: "pingHub" });
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
  const next = setupResult.ping?.ok ? " Bước tiếp: đăng nhập trang quản lý khách sạn của từng kênh trong Chrome này, rồi bấm Quét review ngay." : "";
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
// L1: mở màn Cài extension (Hub có màn ấy) thay cho trang chủ, đúng chỗ các câu nhắc chỉ tới.
$("openHub").onclick = async () =>
  chrome.runtime.sendMessage({ type: "quay:openHub", path: setupPagePath(await loadHubCollect().catch(() => null)) });
$("hubLineOpen").onclick = () => {
  $("settings").open = true;
  $("hubGroup").scrollIntoView({ block: "start" });
};
$("quayBranch").onchange = async () => {
  const r = await chrome.runtime.sendMessage({ type: "quay:setBranch", branchId: $("quayBranch").value });
  note(r?.ok ? "Đã chọn chi nhánh của máy quầy." : `Không chọn được chi nhánh: ${r?.error ?? "không rõ"}`);
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

// YC-188: vừa chạy lệnh cài thì trên đĩa là bản mới mà Chrome vẫn chạy bản cũ. Nạp lại ngay (ô bật lên tự
// đóng; mở lại là bản mới), không bắt người ở quầy vào chrome://extensions, không chờ báo thức 30 phút.
if (needsReload(VERSION, RUNNING)) {
  $("who").textContent = `Đang nạp bản ${VERSION} (máy đang chạy ${RUNNING}). Ô này sẽ tự đóng, mở lại sau vài giây.`;
  chrome.runtime.reload();
} else {
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
    $("device").textContent = `Mã máy ${id.slice(0, 8)}, phiên bản ${RUNNING}`;
  });
}
