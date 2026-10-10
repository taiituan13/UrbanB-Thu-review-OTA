// Mã cài đặt: Sheet tạo (Code.gs), cai-dat.ps1 ghi ra tệp, extension đọc (setup-code.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { DEFAULT_CONFIG } from "../extension/config.js";
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
  assert.equal(setup.hubToken, "t");
  assert.equal(setup.agodaPropertyId, "123");
  assert.equal(setup.bookingHotelId, "");
  assert.deepEqual(setup.channels, ["booking", "go2joy"]);
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
  assert.throws(() => decodeSetupCode(encodeSetupCode({ ...base, sheetUrl: "https://example.com/exec" })), /URL Sheet/);
  assert.throws(() => decodeSetupCode(encodeSetupCode({ ...base, secret: "" })), /mã bí mật/);
  assert.throws(() => decodeSetupCode(encodeSetupCode({ ...base, channels: ["facebook"] })), /chưa chọn kênh/);
  assert.throws(() => decodeSetupCode("URB1." + Buffer.from('{"v":2}').toString("base64url")), /bản extension khác/);
});

test("Áp mã: mọi ô theo mã, kênh ngoài mã tắt, chu kỳ quét giữ nguyên", () => {
  const old = { ...DEFAULT_CONFIG, hotel: "Tên cũ", hubUrl: "https://urbanb.xyz", hubToken: "cũ", intervalHours: 3 };
  const next = applySetup(old, decodeSetupCode(encodeSetupCode(base)));
  assert.equal(next.hotel, base.hotel);
  assert.equal(next.hubUrl, "", "mã không có Hub ⇒ thôi gửi Hub");
  assert.equal(next.hubToken, "");
  assert.equal(next.intervalHours, 3);
  assert.deepEqual(next.enabled, { booking: true, agoda: false, trip: false, expedia: false, traveloka: false, go2joy: true });
});

test("Sheet tạo mã mà extension đọc được", () => {
  const payload = gs.setupPayload({ ...base, hotel: "  Mường Thanh  ", channels: ["agoda", "lạ"] }, "s3cr3t");
  const code = gs.encodeSetupCode(payload);
  assert.doesNotMatch(code, /=/, "bỏ dấu = cho lệnh gọn");
  const setup = decodeSetupCode(code);
  assert.equal(setup.hotel, "Mường Thanh");
  assert.equal(setup.secret, "s3cr3t");
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
