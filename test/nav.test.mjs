// Mở trang trong tab nền: tab trống, trang lỗi, tab bị đóng. Câu lỗi Chrome dưới đây là nguyên văn
// đo 09/10/2026 trên Chromium (E-48868G, Linh Đan Hotel Phú Nhuận).
import { test } from "node:test";
import assert from "node:assert/strict";
import { TAB_CLOSED_MESSAGE, blankTabMessage, explainInjectError, hostOf, isBlankTab } from "../extension/nav.js";
import { classifyError } from "../extension/report.js";

const BLANK = 'Cannot access contents of url "about:blank". Extension manifest must request permission to access this host.';
const ERROR_PAGE = "Frame with ID 0 is showing error page";
const kind = (m) => classifyError("booking", "quét", m).code;

test("Tab còn trống: about:blank hay chưa có URL", () => {
  assert.equal(isBlankTab("about:blank"), true);
  assert.equal(isBlankTab(""), true);
  assert.equal(isBlankTab(undefined), true);
  assert.equal(isBlankTab("https://admin.booking.com/"), false);
});

test("Lượt mở bị dừng hoặc bị huỷ (tab vẫn trống) ⇒ lỗi OPEN có tên trang, không còn câu Chrome khó hiểu", () => {
  const m = explainInjectError(BLANK, "about:blank");
  assert.equal(m, blankTabMessage("about:blank"));
  assert.equal(kind(m), "BKG-OPEN");
  assert.match(blankTabMessage("https://admin.booking.com/"), /admin\.booking\.com/);
  assert.equal(kind(blankTabMessage("https://admin.booking.com/")), "BKG-OPEN");
  // Đối chứng: câu Chrome gốc mà không qua bộ đổi thì vẫn chỉ là SCAN.
  assert.equal(kind(BLANK), "BKG-SCAN");
});

test("Trang lỗi của Chrome (mất mạng, bị chặn) ⇒ OPEN", () => {
  const m = explainInjectError(ERROR_PAGE, "https://admin.booking.com/?ses=bimat");
  assert.equal(m, "Trang admin.booking.com không tải được (mất mạng hoặc bị chặn)");
  assert.ok(!m.includes("bimat"), "ses không được vào câu lỗi");
  assert.equal(kind(m), "BKG-OPEN");
});

test("Tab bị đóng lúc đang tải ⇒ TAB ngay, không còn TIMEOUT", () => {
  assert.equal(kind(TAB_CLOSED_MESSAGE), "BKG-TAB");
  assert.equal(kind("Hết giờ chờ trang tải"), "BKG-TIMEOUT");
});

test("Tab bị chuyển sang trang khác (người dùng gõ địa chỉ khác) ⇒ PAGE", () => {
  const m = explainInjectError('Cannot access contents of url "https://www.google.com/". Extension manifest…', "https://www.google.com/search?q=x");
  assert.equal(m, "Tab chuyển sang www.google.com giữa lượt quét");
  assert.equal(kind(m), "BKG-PAGE");
});

test("Câu lỗi chưa biết thì giữ nguyên văn", () => {
  assert.equal(explainInjectError("Lỗi lạ X", "about:blank"), "Lỗi lạ X");
  assert.equal(hostOf("không phải url"), "trang đích");
});
