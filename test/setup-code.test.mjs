// Mã cài đặt: Sheet tạo (Code.gs), cai-dat.ps1 ghi ra tệp, extension đọc (setup-code.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DEFAULT_CONFIG, withDefaults } from "../extension/config.js";
import { UPDATE_COMMAND } from "../extension/update.js";
import { SETUP_FILE, applySetup, decodeSetupCode, encodeSetupCode } from "../extension/setup-code.js";

const SHEET = "https://script.google.com/macros/s/AKfycbx123/exec";
const base = { hotel: "Secret Garden Bình Thạnh", sheetUrl: SHEET, secret: "s3cr3t", channels: ["booking", "go2joy"] };

// Code.gs trong vm, Utilities của Google giả bằng Buffer (base64EncodeWebSafe có giữ dấu =).
const gs = {
  Utilities: {
    Charset: { UTF_8: "UTF-8" },
    base64EncodeWebSafe: (text) => Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_"),
  },
};
vm.createContext(gs);
vm.runInContext(readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), gs);

test("Mã giữ nguyên tên khách sạn tiếng Việt và mọi ô", () => {
  const setup = decodeSetupCode(encodeSetupCode({ ...base, hubUrl: "https://hub.urbanb.vn", hubToken: "t", agodaPropertyId: "123" }));
  assert.equal(setup.hotel, "Secret Garden Bình Thạnh");
  assert.equal(setup.agodaPropertyId, "123");
  assert.equal(setup.bookingHotelId, "");
  assert.deepEqual(setup.channels, ["booking", "go2joy"]);
});

test("🔴 Mã v1 do Sheet cũ tạo còn mang hubUrl/hubToken: vẫn đọc được, nhưng máy không giữ token (H-1233 a)", () => {
  const setup = decodeSetupCode(encodeSetupCode({ ...base, hubUrl: "https://hub.urbanb.vn", hubToken: "tok-cu" }));
  assert.equal(setup.hotel, base.hotel);
  assert.ok(!("hubToken" in setup) && !("hubUrl" in setup));
  const next = applySetup({ ...DEFAULT_CONFIG, hubToken: "tok-cu", hubUrl: "https://urbanb.xyz" }, setup);
  assert.ok(!JSON.stringify(next).includes("tok-cu"), "token cũ còn nằm trong cấu hình");
});

test("🔴 YC-228 — mã URB1 v1 cũ mang URL Sheet + mã bí mật: vẫn áp được, phần Sheet bỏ qua", () => {
  const setup = decodeSetupCode(encodeSetupCode({ ...base, bookingHotelId: "111" }));
  assert.equal(setup.hotel, base.hotel);
  assert.equal(setup.bookingHotelId, "111");
  assert.ok(!("sheetUrl" in setup) && !("secret" in setup));
  const old = { ...DEFAULT_CONFIG, sheetUrl: "https://script.google.com/macros/s/Cu/exec", secret: "bi-mat-cu" };
  const next = applySetup(old, setup);
  assert.ok(!("sheetUrl" in next) && !("secret" in next), "Sheet cũ còn nằm trong cấu hình");
  assert.ok(!JSON.stringify(next).includes(SHEET) && !JSON.stringify(next).includes("s3cr3t"));
  assert.deepEqual(next.enabled, { booking: true, agoda: false, trip: false, expedia: false, traveloka: false, go2joy: true });
  // Mã thiếu hẳn phần Sheet (hoặc Sheet sai dạng) cũng nhận, không báo lỗi.
  assert.equal(decodeSetupCode(encodeSetupCode({ hotel: "UB1", channels: ["trip"] })).hotel, "UB1");
  assert.equal(decodeSetupCode(encodeSetupCode({ ...base, sheetUrl: "https://example.com/exec", secret: "" })).hotel, base.hotel);
});

test("Cấu hình bản 1.5.1 còn sheetUrl/secret trong bộ nhớ ⇒ đọc ra là bỏ", () => {
  const cfg = withDefaults({ hotel: "UB1", sheetUrl: SHEET, secret: "s3cr3t" });
  assert.ok(!("sheetUrl" in cfg) && !("secret" in cfg));
  assert.ok(!("sheetUrl" in DEFAULT_CONFIG) && !("secret" in DEFAULT_CONFIG));
});

test("Cấu hình bản 1.0.0 còn hubUrl/hubToken trong bộ nhớ ⇒ đọc ra là bỏ", () => {
  const cfg = withDefaults({ hotel: "UB1", hubUrl: "https://hub.urbanb.vn", hubToken: "tok-cu", enabled: { go2joy: true } });
  assert.equal(cfg.hotel, "UB1");
  assert.ok(!("hubToken" in cfg) && !("hubUrl" in cfg));
  assert.equal(cfg.enabled.go2joy, true);
  assert.equal(cfg.enabled.booking, true, "kênh không lưu ⇒ mặc định");
});

test("Chép dán có xuống dòng, khoảng trắng hay dấu = vẫn đọc được", () => {
  const code = encodeSetupCode(base);
  const messy = `  ${code.slice(0, 20)}\n${code.slice(20, 50)} ${code.slice(50)}==\n`;
  assert.equal(decodeSetupCode(messy).hotel, base.hotel);
});

test("Mã sai báo câu dễ hiểu", () => {
  assert.throws(() => decodeSetupCode("abc"), /bắt đầu bằng URB1\./);
  assert.throws(() => decodeSetupCode(encodeSetupCode(base).slice(0, 30)), /bị cắt hoặc chép sai/);
  assert.throws(() => decodeSetupCode(encodeSetupCode({ ...base, hotel: " " })), /thiếu tên khách sạn/);
  assert.throws(() => decodeSetupCode(encodeSetupCode({ ...base, channels: ["facebook"] })), /chưa chọn kênh/);
  assert.throws(() => decodeSetupCode("URB1." + Buffer.from('{"v":2}').toString("base64url")), /bản extension khác/);
});

test("Áp mã: mọi ô theo mã, kênh ngoài mã tắt, chu kỳ quét giữ nguyên", () => {
  const old = { ...DEFAULT_CONFIG, hotel: "Tên cũ", bookingHotelId: "cũ", intervalHours: 3 };
  const next = applySetup(old, decodeSetupCode(encodeSetupCode(base)));
  assert.equal(next.hotel, base.hotel);
  assert.equal(next.bookingHotelId, "", "mã để trống ⇒ ô thành trống");
  assert.equal(next.intervalHours, 3);
  assert.deepEqual(next.enabled, { booking: true, agoda: false, trip: false, expedia: false, traveloka: false, go2joy: true });
});

test("Sheet tạo mã mà extension đọc được (phần Sheet bỏ qua từ 1.5.2)", () => {
  const payload = gs.setupPayload({ ...base, hotel: "  Mường Thanh  ", channels: ["agoda", "lạ"] }, "s3cr3t");
  const code = gs.encodeSetupCode(payload);
  assert.doesNotMatch(code, /=/, "bỏ dấu = cho lệnh gọn");
  const setup = decodeSetupCode(code);
  assert.equal(setup.hotel, "Mường Thanh");
  assert.ok(!("secret" in setup) && !("sheetUrl" in setup));
  assert.deepEqual(setup.channels, ["agoda"]);
});

test("Sheet chặn ô sai trước khi tạo lệnh", () => {
  assert.throws(() => gs.setupPayload({ ...base, hotel: "" }, "s"), /tên khách sạn/);
  assert.throws(() => gs.setupPayload({ ...base, sheetUrl: SHEET.replace("/exec", "/dev") }, "s"), /\/exec/);
  assert.throws(() => gs.setupPayload(base, null), /chạy hàm setup/);
  assert.throws(() => gs.setupPayload({ ...base, channels: [] }, "s"), /ít nhất một kênh/);
  assert.throws(() => gs.setupPayload({ ...base, hubUrl: "https://hub.urbanb.vn" }, "s"), /Token Hub/);
  assert.equal(gs.setupPayload({ ...base, hubToken: "thừa" }, "s").hubToken, "", "không có URL Hub thì bỏ token");
});

test("Lệnh cài kèm mã = đặt $UrbanBMa rồi đúng lệnh cài thường", () => {
  const code = encodeSetupCode(base);
  const cmd = gs.installCommand(code);
  assert.ok(cmd.startsWith(`$UrbanBMa='${code}'; `));
  assert.ok(cmd.endsWith(UPDATE_COMMAND));
});

test("cai-dat.ps1 ghi đúng tệp extension đọc, chừa nó khỏi /MIR, nhận mã Sheet tạo", () => {
  const ps1 = readFileSync(new URL("../windows/cai-dat.ps1", import.meta.url), "utf8");
  assert.ok(ps1.includes(`Join-Path $ExtDir "${SETUP_FILE}"`));
  assert.match(ps1, new RegExp(`robocopy .*/XF manifest\\.json ${SETUP_FILE.replace(".", "\\.")} `));
  // Cùng biểu thức Read-SetupHotel dùng; PowerShell -match không phân biệt hoa thường, JS thì có.
  const psPattern = /'\^URB1\\\.\(\[A-Za-z0-9_-\]\+\)=\*\$'/;
  assert.match(ps1, psPattern);
  const accepts = /^URB1\.([A-Za-z0-9_-]+)=*$/i;
  assert.ok(accepts.test(gs.encodeSetupCode(gs.setupPayload(base, "s"))));
  assert.ok(accepts.test(encodeSetupCode(base)));
});
