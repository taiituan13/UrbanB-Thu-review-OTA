// Tự cập nhật bản cài giải nén: so phiên bản, và hai thứ windows/cai-dat.ps1 dựa vào.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../extension/config.js";
import { REPO, UPDATE_COMMAND, UPDATE_VIDEO_URL, isNewer, parseRemoteVersion, updateNotice } from "../extension/update.js";

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

test("cai-dat.ps1 giải nén vào thư mục tạm dưới C:\\UrbanB, không qua TEMP, dọn cả khi lỗi (YC-223)", () => {
  const ps1 = readFileSync(new URL("../windows/cai-dat.ps1", import.meta.url), "utf8");
  const code = ps1.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
  // TEMP của người dùng tên có dấu là tên ngắn 8.3 (C:\Users\ANHRUA~1) ⇒ Expand-Archive chết.
  assert.doesNotMatch(code, /\$env:(TEMP|TMP)\b|GetTempPath/i, "không được dùng thư mục tạm của Windows");
  assert.match(code, /\$TmpRoot = Join-Path \$Root "tmp"/);
  assert.match(code, /\$tmp = Join-Path \$TmpRoot /);
  assert.match(code, /Expand-Archive -Path \$zip -DestinationPath \$tmp /);
  const fin = code.slice(code.indexOf("} finally {"));
  assert.match(fin.slice(0, fin.indexOf("\n}\n")), /Remove-Item -Recurse -Force \$tmp /, "dọn thư mục tạm trong finally");
});

test("cai-dat.ps1 tải codeload trước, lui về đường archive cũ, mỗi đường thử lại (504 ngày 27/10)", () => {
  const ps1 = readFileSync(new URL("../windows/cai-dat.ps1", import.meta.url), "utf8");
  const code = ps1.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
  const codeload = code.indexOf('"https://codeload.github.com/$Repo/zip/refs/heads/main"');
  const archive = code.indexOf('"https://github.com/$Repo/archive/refs/heads/main.zip"');
  assert.ok(codeload > 0 && archive > codeload, "codeload đứng trước đường archive cũ");
  assert.match(code, /^\$ZipTries = [2-9]$/m, "thử lại ít nhất hai lần mỗi đường");
  assert.match(code, /foreach \(\$url in \$ZipUrls\)/);
  assert.match(code, /Invoke-WebRequest -Uri \$url /, "tải theo danh sách, không ghim một đường");
  assert.equal((code.match(/Invoke-WebRequest -Uri/g) || []).length, 1, "chỉ một chỗ tải");
  assert.match(code, /^\s+Get-LatestZip \$zip$/m, "Install-Latest tải qua hàm có thử lại");
});

test("cai-dat.ps1 bật UTF-8 cho cửa sổ trước dòng chữ đầu tiên (YC-223)", () => {
  const ps1 = readFileSync(new URL("../windows/cai-dat.ps1", import.meta.url), "utf8");
  const code = ps1.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
  const utf8 = code.search(/\[Console\]::OutputEncoding = \$Utf8/);
  assert.ok(utf8 > 0, "đặt [Console]::OutputEncoding");
  assert.match(code, /\$Utf8 = New-Object System\.Text\.UTF8Encoding \$false/);
  assert.match(code, /^\$OutputEncoding = \$Utf8$/m);
  const firstOutput = code.search(/Write-Host|Write-Log /);
  assert.ok(utf8 < firstOutput, "UTF-8 phải đặt trước khi in chữ có dấu");
});

test("Lệnh cập nhật trong ô bật lên trùng nguyên văn lệnh trong cai-dat.ps1 và tài liệu cài", () => {
  const ps1 = readFileSync(new URL("../windows/cai-dat.ps1", import.meta.url), "utf8");
  const doc = readFileSync(new URL("../docs/cai-tu-xa.md", import.meta.url), "utf8");
  assert.ok(ps1.includes(UPDATE_COMMAND), "cai-dat.ps1");
  assert.ok(doc.includes(UPDATE_COMMAND), "docs/cai-tu-xa.md");
  assert.ok(ps1.includes(`$Repo = "${REPO}"`), "cai-dat.ps1 tải từ đúng repo");
});

test("Số phiên bản trên GitHub: chỉ nhận dạng số chấm số", () => {
  assert.equal(parseRemoteVersion('{"version": "0.8.1"}'), "0.8.1");
  assert.equal(parseRemoteVersion("<html>404</html>"), null);
  assert.equal(parseRemoteVersion('{"version": "<script>"}'), null);
  assert.equal(parseRemoteVersion('{"name": "x"}'), null);
});

test("Dải 'Có bản mới' chỉ hiện khi GitHub mới hơn bản đang chạy", () => {
  assert.deepEqual(updateNotice({ latest: "0.8.1" }, "0.7.0"), { latest: "0.8.1", current: "0.7.0" });
  assert.equal(updateNotice({ latest: "0.8.1" }, "0.8.1"), null);
  assert.equal(updateNotice({ latest: "0.8.0" }, "0.8.1"), null, "máy chạy bản mới hơn GitHub (đang thử) thì không nhắc");
  assert.equal(updateNotice(undefined, "0.8.1"), null);
});

test("Ô bật lên có link video hướng dẫn cập nhật ở dải Có bản mới và nhóm Cập nhật, mở tab mới", () => {
  const html = readFileSync(new URL("../extension/popup.html", import.meta.url), "utf8");
  assert.match(UPDATE_VIDEO_URL, /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/view$/);
  const block = (start, end) => html.slice(html.indexOf(start), html.indexOf(end, html.indexOf(start)));
  const banner = block('<div class="update" id="update"', "</div>");
  const settings = block('<h3 class="grp">Cập nhật</h3>', "</details>");
  for (const [name, part] of [["dải Có bản mới", banner], ["nhóm Cập nhật", settings]]) {
    const a = part.match(/<a [^>]*class="video"[^>]*>/)?.[0];
    assert.ok(a, `thiếu link video ở ${name}`);
    assert.ok(a.includes(`href="${UPDATE_VIDEO_URL}"`), `link ở ${name} lệch UPDATE_VIDEO_URL`);
    assert.match(a, /target="_blank"/, `link ở ${name} phải mở tab mới, không đè ô bật lên`);
  }
});
