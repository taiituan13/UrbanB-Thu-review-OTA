// Mã cài đặt: Code.gs dựng (setupPayload + base64 an toàn cho URL), extension đọc (parseSetupCode).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { CHANNELS } from "../extension/config.js";
import { SETUP_CODE_PREFIX, parseSetupCode } from "../extension/setup-code.js";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), ctx);
const { setupPayload } = ctx;

const URL_OK = "https://script.google.com/macros/s/AKfyTHU-123_abc/exec";
const SECRET = "a".repeat(64);

/** Như Utilities.base64EncodeWebSafe: bảng chữ - _ và GIỮ dấu "=" ở cuối. */
function encodeLikeAppsScript(payload) {
  const b64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return ctx.SETUP_CODE_PREFIX + b64.replace(/\+/g, "-").replace(/\//g, "_");
}

test("Hai phía cùng một tiền tố", () => {
  assert.equal(ctx.SETUP_CODE_PREFIX, SETUP_CODE_PREFIX);
});

test("Code.gs và extension biết cùng một bộ kênh", () => {
  assert.deepEqual(Object.keys(ctx.CHANNEL_NAMES).sort(), [...CHANNELS].sort());
});

test("Mã do Code.gs tạo được extension đọc lại đủ, kể cả tên có dấu", () => {
  const code = encodeLikeAppsScript(setupPayload("  Secret Garden Bình Thạnh ", URL_OK, SECRET, "Booking, agoda;go2joy booking"));
  const r = parseSetupCode(code, CHANNELS);
  assert.equal(r.hotel, "Secret Garden Bình Thạnh");
  assert.equal(r.sheetUrl, URL_OK);
  assert.equal(r.secret, SECRET);
  assert.deepEqual(r.enabled, { booking: true, agoda: true, trip: false, expedia: false, traveloka: false, go2joy: true });
});

test("Mã chứa cả - và _ của base64 an toàn cho URL vẫn đọc được", () => {
  // Tên này được chọn vì bản mã hoá của nó có đủ hai ký tự ấy; kiểm lại để ca thử không mất tác dụng.
  const code = encodeLikeAppsScript(setupPayload("Khách sạn ~~~ ữữ ???", URL_OK, SECRET, "trip"));
  assert.ok(code.includes("-", SETUP_CODE_PREFIX.length) && code.includes("_"), "mẫu thử phải chứa cả - và _");
  assert.equal(parseSetupCode(code, CHANNELS).hotel, "Khách sạn ~~~ ữữ ???");
});

test("Mã dán kèm xuống dòng hoặc dấu cách vẫn đọc được", () => {
  const code = encodeLikeAppsScript(setupPayload("Linh Đan", URL_OK, SECRET, "trip"));
  const messy = ` ${code.slice(0, 20)}\n${code.slice(20, 50)} ${code.slice(50)}\n`;
  assert.equal(parseSetupCode(messy, CHANNELS).hotel, "Linh Đan");
});

test("Code.gs từ chối đầu vào sai", () => {
  assert.throws(() => setupPayload("", URL_OK, SECRET, "booking"), /tên khách sạn/);
  assert.throws(() => setupPayload("A", "https://script.google.com/macros/s/x/dev", SECRET, "booking"), /URL Web App/);
  assert.throws(() => setupPayload("A", URL_OK, null, "booking"), /mã bí mật/);
  assert.throws(() => setupPayload("A", URL_OK, SECRET, "booking, bkg"), /Kênh lạ: bkg/);
  assert.throws(() => setupPayload("A", URL_OK, SECRET, " , "), /Chưa chọn kênh/);
});

test("Extension từ chối mã sai tiền tố, bị cắt, hoặc khác phiên bản", () => {
  const code = encodeLikeAppsScript(setupPayload("A", URL_OK, SECRET, "booking"));
  assert.throws(() => parseSetupCode(code.slice(SETUP_CODE_PREFIX.length), CHANNELS), /bắt đầu bằng/);
  assert.throws(() => parseSetupCode(code.slice(0, code.length - 12), CHANNELS), /chép sai/);
  const v2 = encodeLikeAppsScript({ ...setupPayload("A", URL_OK, SECRET, "booking"), v: 2 });
  assert.throws(() => parseSetupCode(v2, CHANNELS), /phiên bản khác/);
});

test("Extension cũ gặp kênh nó chưa biết ⇒ báo cập nhật, không âm thầm bỏ kênh", () => {
  const code = encodeLikeAppsScript(setupPayload("A", URL_OK, SECRET, "booking, go2joy"));
  assert.throws(() => parseSetupCode(code, ["booking", "agoda"]), /chưa biết: go2joy/);
});

test("Extension từ chối mã có URL sai dạng dù tiền tố đúng", () => {
  const bad = encodeLikeAppsScript({ v: 1, hotel: "A", sheetUrl: "https://evil.example/exec", secret: SECRET, channels: ["booking"] });
  assert.throws(() => parseSetupCode(bad, CHANNELS), /URL Web App sai dạng/);
});
