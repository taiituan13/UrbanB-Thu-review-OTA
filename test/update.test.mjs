// Tự cập nhật bản cài giải nén: so phiên bản, và hai thứ windows/cai-dat.ps1 dựa vào.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../extension/config.js";
import { isNewer } from "../extension/update.js";

test("So phiên bản theo số, không theo chữ", () => {
  assert.equal(isNewer("0.10.0", "0.9.9"), true);
  assert.equal(isNewer("0.6.0", "0.6.0"), false);
  assert.equal(isNewer("0.5.9", "0.6.0"), false);
  assert.equal(isNewer("1.0", "0.99.99"), true);
  assert.equal(isNewer("0.6.1", "0.6"), true);
  assert.equal(isNewer(undefined, "0.6.0"), false);
});

test("VERSION trong config.js khớp manifest.json", () => {
  // Máy khách sạn và extension đều đọc phiên bản từ manifest.json; ô bật lên và Sheet đọc VERSION.
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.version, VERSION);
});

test("cai-dat.ps1 trong repo không có BOM và không gọi exit", () => {
  const bytes = readFileSync(new URL("../windows/cai-dat.ps1", import.meta.url));
  assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "BOM làm hỏng irm | iex");
  const code = bytes.toString("utf8").split("\n").filter((l) => !l.trimStart().startsWith("#"));
  assert.equal(code.filter((l) => /\bexit\b/i.test(l)).length, 0, "exit qua iex đóng cửa sổ của người cài");
});
