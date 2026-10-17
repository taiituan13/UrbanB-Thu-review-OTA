import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

// H-1265 a: chữ "OTA Sync" đổi thành "Booking OTA". Chỉ còn được nhắc TÊN RIÊNG của userscript cũ
// ("EZCloud OTA Sync", và tên tệp ezcloud-ota-sync.user.js trong chú thích), vì đó là chữ lễ tân thấy trong bảng điều khiển Tampermonkey khi tắt nó.
const dir = new URL("../extension/", import.meta.url);
const files = [
  ...readdirSync(dir).filter((f) => /\.(js|html|json)$/.test(f)).map((f) => new URL(f, dir)),
  ...readdirSync(new URL("quay/", dir)).filter((f) => f.endsWith(".js")).map((f) => new URL("quay/" + f, dir)),
];

test('extension không còn chữ "OTA Sync" ngoài tên riêng userscript cũ', () => {
  const bad = [];
  for (const f of files) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/OTA[ -]Sync/i.test(line.replace(/EZCloud OTA Sync|ezcloud-ota-sync\.user\.js/g, ""))) bad.push(`${f.pathname.split("/extension/")[1]}:${i + 1}`);
      });
  }
  assert.deepEqual(bad, []);
});

test("phép quét bắt được chữ cũ (đối chứng)", () => {
  assert.equal(/OTA[ -]Sync/i.test("Mã kết nối OTA Sync".replace(/EZCloud OTA Sync/g, "")), true);
  assert.equal(/OTA[ -]Sync/i.test("userscript EZCloud OTA Sync 3.2.0".replace(/EZCloud OTA Sync/g, "")), false);
  assert.ok(files.length > 10, "quét đủ tệp");
});
