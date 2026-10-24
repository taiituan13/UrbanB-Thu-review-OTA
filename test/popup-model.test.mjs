import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewRow } from "../extension/popup-model.js";

const CH = ["booking", "agoda"];
const cfg = { hotel: "UB1", sheetUrl: "https://s", secret: "x", intervalHours: 6, enabled: { booking: true, agoda: true } };

test("reviewRow: chưa cài đặt xong · chưa bật kênh · chưa quét", () => {
  assert.equal(reviewRow({ ...cfg, secret: "" }, {}, CH).state, "Chưa cài đặt xong");
  assert.equal(reviewRow({ ...cfg, enabled: {} }, {}, CH).state, "Chưa bật kênh nào");
  assert.match(reviewRow(cfg, {}, CH).state, /Chưa quét lần nào, 2 kênh đang bật/);
});

test("reviewRow: kênh cần đăng nhập là vàng, kênh lỗi là đỏ", () => {
  const login = reviewRow(cfg, { booking: { state: "login", at: "2026-10-16T01:00:00Z" }, agoda: { state: "ok", count: 3, at: "2026-10-16T01:00:00Z" } }, CH);
  assert.equal(login.tone, "warn");
  assert.match(login.state, /1 kênh cần đăng nhập lại/);
  const err = reviewRow(cfg, { booking: { state: "error" }, agoda: { state: "login" } }, CH);
  assert.equal(err.tone, "err");
  assert.equal(err.state, "2 kênh lỗi");
});

test("reviewRow: chạy ổn cộng số bài; kênh đã tắt không tính", () => {
  const r = reviewRow({ ...cfg, enabled: { booking: true } }, { booking: { state: "ok", count: 4, at: "2026-10-16T01:00:00Z" }, agoda: { state: "error" } }, CH);
  assert.equal(r.tone, "ok");
  assert.equal(r.state, "Đang chạy, 1 kênh");
  assert.match(r.detail, /4 bài\. Máy tự quét mỗi 6 giờ/);
});

test("reviewRow: Sheet ổn mà Hub không nhận ⇒ nói rõ; chưa đăng nhập Hub là vàng, lỗi khác là đỏ", () => {
  const at = "2026-10-20T01:00:00Z";
  const out = reviewRow(cfg, {
    booking: { state: "ok", count: 2, at, hub: { ok: false, login: true } },
    agoda: { state: "ok", count: 1, at, hub: { ok: true } },
  }, CH);
  assert.equal(out.tone, "warn");
  assert.match(out.state, /cần đăng nhập Hub/);
  assert.match(out.detail, /Sheet vẫn nhận/);
  const err = reviewRow(cfg, { booking: { state: "ok", count: 2, at, hub: { ok: false } }, agoda: { state: "ok", count: 1, at } }, CH);
  assert.equal(err.tone, "err");
  assert.equal(err.state, "Gửi Hub lỗi ở 1 kênh");
  assert.equal(reviewRow(cfg, { booking: { state: "ok", count: 2, at, hub: { ok: true } }, agoda: { state: "ok", at } }, CH).tone, "ok");
});

test("🔴 YC-156 L2 — chỉ đường đúng tên trên Hub: màn Kết nối › tab Mã kết nối Booking OTA › khối Sheet review / Extension máy quầy", async () => {
  const { noChannelText } = await import("../extension/popup-model.js");
  const { reviewMissingText } = await import("../extension/hub-config.js");
  for (const text of [noChannelText({ collect: { fromHub: { enabled: true } } }), noChannelText({})]) {
    assert.match(text, /màn Kết nối, tab Mã kết nối Booking OTA, khối Extension máy quầy/);
    assert.doesNotMatch(text, /phần Extension máy quầy/);
  }
  const { HUB_SHEET_PLACE } = await import("../extension/hub-config.js");
  assert.equal(HUB_SHEET_PLACE, "màn Kết nối, tab Mã kết nối Booking OTA, khối Sheet review");
  const sheet = reviewMissingText({ hubSeen: true, hotel: "UB1", sheetUrl: "", secret: "" }) ?? "";
  const all = [sheet, readFileSync(new URL("../extension/hub-config.js", import.meta.url), "utf8")].join("\n");
  assert.doesNotMatch(all, /bảng tính thu review|phần Extension máy quầy/);
});

test("🔴 YC-156 L7 — dòng đầu popup ghi tên tài khoản đang đăng nhập Hub; popup tự hỏi tên khi mở", async () => {
  const { whoText } = await import("../extension/popup-model.js");
  const snap = { session: "ok", origin: "https://hub.urbanb.vn", notifications: { state: "ok", me: "Nguyễn Lễ Tân" }, branchName: "UB1" };
  assert.equal(whoText(snap), "Nguyễn Lễ Tân đã đăng nhập hub.urbanb.vn, đang mở UB1");
  assert.equal(whoText({ ...snap, origin: "https://urbanb.xyz", branchName: "" }), "Nguyễn Lễ Tân đã đăng nhập urbanb.xyz (bãi thử)");
  assert.equal(whoText({ ...snap, notifications: undefined }), "Đã đăng nhập hub.urbanb.vn, đang mở UB1");
  assert.equal(whoText({ session: "out", origin: "https://hub.urbanb.vn" }), "Chưa đăng nhập hub.urbanb.vn");
  assert.equal(whoText({ ...snap, session: "expired" }), "Phiên hub.urbanb.vn đã hết");
  // Tên chỉ có khi route thông báo đã được hỏi: popup hỏi một lượt mỗi lần mở (không chờ khung trên PMS).
  const js = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.match(js, /\$\("who"\)\.textContent = whoText\(snap\);\s*refreshAccountName\(session\);/);
  assert.match(js, /sendMessage\(\{ type: "quay:notifications" \}\)/);
});

test("🔴 YC-156 L1 — nút Mở Hub mở màn Cài extension khi Hub có màn ấy; Hub cũ thì trang chủ", async () => {
  const { hubHasSetupPage, parseHubSettings, setupPagePath } = await import("../extension/hub-config.js");
  // Hub mới (có L6) ⇒ /extension.
  assert.equal(setupPagePath(parseHubSettings({ ok: true, reviewSheet: null, reviewSheetReason: "NOT_CONFIGURED" })), "/extension");
  // Hub có reviewIds trong scope=mine (cùng đợt với màn Cài extension) ⇒ /extension.
  assert.equal(hubHasSetupPage({ ok: true, branches: [{ id: "b", reviewIds: { booking: null } }], reviewSheet: null }), true);
  // Production cũ: không có dấu nào ⇒ "/" (không mở trang 404).
  assert.equal(setupPagePath(parseHubSettings({ ok: true, branches: [{ id: "b" }], reviewSheet: null })), "/");
  assert.equal(setupPagePath(null), "/");
  const js = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.match(js, /type: "quay:openHub", path: setupPagePath\(/);
  assert.doesNotMatch(js, /type: "quay:openHub", path: "\/" \}/);
});

test("🔴 YC-156 L1 — lối đổi Hub thấy được: dòng Hub đang dùng ngoài Cài đặt, nút chuyển sang Hub kia", async () => {
  const { hubSwitchTargets } = await import("../extension/popup-model.js");
  assert.deepEqual(hubSwitchTargets("https://hub.urbanb.vn"), [
    { origin: "https://urbanb.xyz", label: "urbanb.xyz (bãi thử)", url: "https://urbanb.xyz/extension" },
  ]);
  assert.deepEqual(hubSwitchTargets("https://urbanb.xyz").map((t) => t.url), ["https://hub.urbanb.vn/extension"]);
  const html = readFileSync(new URL("../extension/popup.html", import.meta.url), "utf8");
  // Dòng Hub nằm NGOÀI khối Cài đặt gập sẵn.
  assert.ok(html.indexOf('id="hubLine"') > 0 && html.indexOf('id="hubLine"') < html.indexOf('<details id="settings"'));
  assert.match(html, /id="hubLineOpen">Đổi Hub</);
  assert.match(html, /id="hubSwitch"/);
});

test("🔴 YC-188 — popup không hỏi được phần chạy nền thì nói thẳng, không hiện chữ 'Hub' trơn", async () => {
  const { hubLabel, whoText, NO_WORKER_TEXT } = await import("../extension/popup-model.js");
  assert.equal(hubLabel(null), "chưa kết nối");
  assert.equal(hubLabel({ session: "ok" }), "chưa kết nối");
  assert.equal(hubLabel({ origin: "https://urbanb.xyz" }), "urbanb.xyz (bãi thử)");
  assert.equal(hubLabel({ origin: "https://hub.urbanb.vn" }), "hub.urbanb.vn");
  assert.equal(whoText(null), NO_WORKER_TEXT);
  assert.match(NO_WORKER_TEXT, /chrome:\/\/extensions/);
  const js = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.doesNotMatch(js, /\?\? "Hub"/, "popup không được rơi về chữ 'Hub' trơn");
  assert.match(js, /\$\("hubLineNow"\)\.textContent = hub;/);
  assert.match(js, /\$\("outBox"\)\.hidden = !snap \|\| session !== "out";/);
});

test("🔴 YC-188 — mở popup mà bản trên đĩa mới hơn bản đang chạy thì nạp lại ngay; popup ghi bản đang chạy", async () => {
  const { needsReload } = await import("../extension/popup-model.js");
  assert.equal(needsReload("1.4.4", "1.4.3"), true);
  assert.equal(needsReload("1.4.3", "1.4.3"), false);
  assert.equal(needsReload("1.4.2", "1.4.3"), false, "bản trên đĩa cũ hơn thì không nạp");
  const js = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.match(js, /const RUNNING = chrome\.runtime\.getManifest\(\)\.version;/);
  assert.match(js, /if \(needsReload\(VERSION, RUNNING\)\) \{[\s\S]*?chrome\.runtime\.reload\(\);\s*\} else \{/);
  // Mọi chỗ popup báo "máy đang chạy bản …" đọc bản đang chạy, không đọc bản trên đĩa.
  assert.doesNotMatch(js, /đang chạy bản \$\{VERSION\}|mới nhất \(\$\{VERSION\}\)|phiên bản \$\{VERSION\}|updateNotice\(update, VERSION\)/);
  assert.match(js, /phiên bản \$\{RUNNING\}/);
});
