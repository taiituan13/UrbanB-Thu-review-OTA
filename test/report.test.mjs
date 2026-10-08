// Gửi lại khi Google trả lỗi chập chờn, và nhật ký lỗi không làm lộ phiên đăng nhập.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SheetError,
  classifyError,
  formatErrorReport,
  makeErrorRef,
  makeLogEntry,
  parseSheetReply,
  pushLimited,
  stripUrl,
  withRetry,
} from "../extension/report.js";

const noSleep = async () => {};

test("Trang lỗi HTML của Google (404) ⇒ lỗi gửi lại được; Sheet từ chối mã ⇒ không gửi lại", () => {
  assert.throws(() => parseSheetReply(404, "<!DOCTYPE html><title>Không tìm thấy trang</title>"), (e) => e.retryable === true);
  assert.throws(() => parseSheetReply(200, '{"ok":false,"error":"Sai mã bí mật"}'), (e) => e.retryable === false);
  assert.throws(() => parseSheetReply(200, '{"ok":false,"error":"Sheet đang bận, thử lại sau"}'), (e) => e.retryable === true);
  assert.deepEqual(parseSheetReply(200, '{"ok":true,"inserted":2}'), { ok: true, inserted: 2 });
});

test("Gửi lại tới khi được, tối đa 3 lần", async () => {
  let calls = 0;
  const r = await withRetry(async () => {
    calls++;
    if (calls < 3) throw new SheetError("404", true);
    return "ok";
  }, { sleep: noSleep });
  assert.equal(r, "ok");
  assert.equal(calls, 3);

  calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw new SheetError("404", true); }, { sleep: noSleep }));
  assert.equal(calls, 3, "không gửi quá 3 lần");
});

test("Lỗi không gửi lại được thì dừng ngay", async () => {
  let calls = 0;
  await assert.rejects(withRetry(async () => { calls++; throw new SheetError("Sai mã bí mật", false); }, { sleep: noSleep }));
  assert.equal(calls, 1);
});

test("URL trong nhật ký bỏ query: ses của Booking không được ra khỏi máy", () => {
  const url = "https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/reviews.html?hotel_id=1&ses=BIMAT#x";
  assert.equal(stripUrl(url), "https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/reviews.html");
  assert.equal(stripUrl("không phải url"), "");
  const entry = makeLogEntry({ channel: "booking", stage: "quét", error: new Error("hỏng"), url });
  assert.ok(!JSON.stringify(entry).includes("BIMAT"));
  assert.equal(entry.message, "hỏng");
  assert.ok(entry.id);
});

test("Hàng đợi lỗi giữ 50 dòng mới nhất", () => {
  let q = [];
  for (let i = 0; i < 60; i++) q = pushLimited(q, i);
  assert.equal(q.length, 50);
  assert.equal(q[0], 10);
  assert.equal(q[49], 59);
});

// ---------- Mã lỗi ----------

test("Mã tham chiếu E-XXXXXX, không có ký tự dễ nhầm (0 O 1 I L)", () => {
  for (let i = 0; i < 500; i++) assert.match(makeErrorRef(), /^E-[2-9A-HJKMNP-Z]{6}$/);
  assert.equal(makeErrorRef(() => new Uint8Array(6)), "E-222222");
  const seen = new Set(Array.from({ length: 2000 }, () => makeErrorRef()));
  assert.ok(seen.size > 1990, "mã gần như không trùng");
});

test("Loại lỗi: mỗi nguyên nhân đã biết một mã riêng, kèm cách xử lý theo tên kênh", () => {
  const cases = [
    ["booking", "đăng nhập", "Cần đăng nhập lại", "BKG-LOGIN"],
    ["booking", "quét", "Tài khoản Booking thấy 2 chỗ nghỉ (1, 2). Điền mã Booking trong cài đặt.", "BKG-MULTI"],
    ["agoda", "quét", "Không dò được mã khách sạn Agoda. Điền mã Agoda trong cài đặt.", "AGD-NOID"],
    ["trip", "quét", "Hết giờ chờ trang tải", "TRP-TIMEOUT"],
    ["booking", "quét", "No tab with id: 1044178882.", "BKG-TAB"],
    ["booking", "mở tab", "bất kỳ", "BKG-TAB"],
    ["expedia", "quét", "Không bắt được request review của trang Expedia", "EXP-CAPTURE"],
    ["booking", "quét", "Không thấy request danh sách review của trang Booking", "BKG-CAPTURE"],
    ["traveloka", "quét", "Traveloka HTTP 400", "TVL-HTTP"],
    ["trip", "quét", "Trip báo lỗi: []", "TRP-API"],
    ["agoda", "chuẩn hoá", "3 bài lỗi chuẩn hoá", "AGD-NORM"],
    ["agoda", "quét", "điều chưa từng thấy", "AGD-SCAN"],
    ["trip", "gửi Sheet", "Sheet từ chối: Sai mã bí mật", "SHEET-SECRET"],
    ["", "gửi Sheet", 'Sheet trả về không phải JSON (HTTP 404). Kiểm lại URL Web App và quyền "Bất kỳ ai".', "SHEET-URL"],
    ["", "gửi Sheet", "Không gọi được Sheet: Failed to fetch", "SHEET-NET"],
    ["", "gửi Sheet", "Sheet từ chối: Sheet đang bận, thử lại sau", "SHEET-BUSY"],
    ["", "gửi Sheet", "Sheet từ chối: Hành động lạ", "SHEET-OLD"],
    ["", "gửi Sheet", "Chưa điền URL Sheet hoặc mã bí mật", "SHEET-CONFIG"],
    ["", "gửi Sheet", "Sheet từ chối: chuyện khác", "SHEET-REJECT"],
  ];
  for (const [channel, stage, message, code] of cases) {
    assert.equal(classifyError(channel, stage, message).code, code, message);
  }
  // Đăng nhập là theo GIAI ĐOẠN, không theo chữ: cùng thông điệp ở giai đoạn quét không phải LOGIN.
  assert.equal(classifyError("booking", "quét", "Cần đăng nhập lại").code, "BKG-SCAN");
  assert.match(classifyError("agoda", "đăng nhập", "").hint, /Mở Agoda/);
  assert.doesNotMatch(classifyError("agoda", "đăng nhập", "").hint, /\{kênh\}/);
});

test("Dòng nhật ký mang mã tham chiếu và loại lỗi", () => {
  const e = makeLogEntry({ channel: "booking", stage: "đăng nhập", error: new Error("Cần đăng nhập lại") });
  assert.match(e.ref, /^E-/);
  assert.equal(e.code, "BKG-LOGIN");
  assert.ok(e.hint);
});

test("Đoạn báo lỗi để sao chép: đủ mã, máy, phiên bản; không có URL hay bí mật", () => {
  const entry = makeLogEntry({
    at: "2026-10-08T11:22:51.358Z",
    channel: "expedia",
    stage: "quét",
    error: new Error("Không bắt được request review của trang Expedia"),
    url: "https://apps.expediapartnercentral.com/x?ses=BIMAT",
  });
  const text = formatErrorReport(entry, { hotel: "Linh Đan", deviceId: "442c980f-aaaa-bbbb", version: "0.4.0" });
  assert.match(text, new RegExp(`^Mã lỗi: ${entry.ref} \\(EXP-CAPTURE\\)`));
  assert.match(text, /Linh Đan · máy 442c980f · bản 0\.4\.0/);
  assert.match(text, /18:22:51/, "giờ Việt Nam");
  assert.match(text, /Kênh: Expedia · giai đoạn: quét/);
  assert.doesNotMatch(text, /BIMAT|expediapartnercentral|aaaa-bbbb/);
});
