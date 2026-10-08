// Gửi lại khi Google trả lỗi chập chờn, và nhật ký lỗi không làm lộ phiên đăng nhập.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SheetError, makeLogEntry, parseSheetReply, pushLimited, stripUrl, withRetry } from "../extension/report.js";

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
