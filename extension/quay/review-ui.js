// YC-158 (H-1539 lối 2) — khối "Thu review" trong tab Cần xử lý của khung quầy trên PMS. Trước đây lỗi thu
// review chỉ nằm trong ô bật lên (phải bấm icon Chrome), nên lễ tân không biết kênh nào đang hỏng.
//
// Mỗi kênh lỗi nói đủ ba điều (bổ sung của user 21/10/2026): chuyện gì đang xảy ra, vì sao, làm gì tiếp
// theo từng bước có số; kèm mã lỗi và nút Sao chép để gửi người quản lý. HTML thuần, không đọc DOM.

import { failedWhenText, reviewSummaryText } from "./review-status.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Số việc thu review cần lễ tân xem, cộng vào số của tab Cần xử lý. Chưa đọc được ⇒ 0. */
export function reviewProblemCount(model) {
  if (!model) return 0;
  if (model.state === "missing") return 1;
  return model.bad;
}

/** Lời hướng dẫn ba phần: chuyện gì, vì sao, các bước có số. */
export function helpHTML(help) {
  if (!help) return "";
  const why = help.why ? `<div class="rv-why"><span class="k">Vì sao:</span> ${esc(help.why)}</div>` : "";
  const steps = help.steps?.length
    ? `<div class="rv-steps"><span class="k">Làm gì tiếp theo:</span><ol>${help.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol></div>`
    : "";
  return `<div class="rv-what">${esc(help.what)}</div>${why}${steps}`;
}

const STATE_LABEL = { error: "Đang lỗi", login: "Cần đăng nhập lại" };

function channelCard(row, now) {
  const when = failedWhenText(row, now);
  const ref = row.ref
    ? `<div class="rv-ref"><span>Mã lỗi</span><code>${esc(row.ref)}</code><button class="cb-btn2" data-act="reviewCopy" data-ref="${esc(row.ref)}">Sao chép</button></div>`
    : "";
  return `<div class="rv-card" data-ch="${esc(row.key)}">
    <div class="rv-hd"><b>${esc(row.label)}</b><span class="rv-st ${row.state}">${esc(STATE_LABEL[row.state] ?? "")}</span></div>
    ${when ? `<div class="rv-when">${esc(when)}</div>` : ""}${helpHTML(row.help)}${ref}</div>`;
}

/**
 * Nội dung khối. `scanning` = đang chờ lượt quét bấm từ khung; `scanNote` = câu báo sau lượt ấy
 * (vd. "Đang có một lượt quét chạy"); `copied` = mã vừa chép.
 */
export function reviewBlockHTML(model, { now = new Date(), scanning = false, scanNote = "", copied = "" } = {}) {
  if (!model) return `<div class="ota-muted">Đang tải...</div>`;
  const scanBtn = `<button class="cb-btn2" data-act="reviewScan" ${scanning ? "disabled" : ""}>${scanning ? "Đang quét..." : "Quét review ngay"}</button>`;
  const note = scanNote ? `<div class="ota-muted" role="status">${esc(scanNote)}</div>` : "";
  const copiedNote = copied ? `<div class="ota-muted" role="status">Đã chép mã ${esc(copied)}. Dán mã này khi nhắn người quản lý.</div>` : "";
  if (model.state === "missing") return `<div class="rv-card">${helpHTML(model.missing)}</div>`;
  if (model.state !== "bad") {
    const btn = model.state === "none" ? "" : `<div class="bt">${scanBtn}</div>`;
    return `<div class="rv-ok"><span>${esc(reviewSummaryText(model, now))}</span>${btn}</div>${note}`;
  }
  const failed = model.rows.filter((r) => r.state === "error" || r.state === "login");
  return `<div class="ota-muted">${esc(reviewSummaryText(model, now))} Làm theo các bước dưới từng kênh. Xong thì bấm Quét review ngay để kiểm lại.</div>
    ${failed.map((r) => channelCard(r, now)).join("")}${copiedNote}<div class="bt">${scanBtn}</div>${note}`;
}
