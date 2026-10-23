// YC-156 · H-1527 a: thu review tự nhận cấu hình từ Hub (Sheet, mã bí mật, tên khách sạn, mã chỗ nghỉ).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHANNELS, DEFAULT_CONFIG } from "../extension/config.js";
import { effectiveReview, parseHubSettings, parseReviewSheet, reviewMissingHelp, reviewMissingText, reviewSendsSheet, sheetSkipText } from "../extension/hub-config.js";
import { reviewRow, reviewSourceLines } from "../extension/popup-model.js";
import * as H from "../extension/quay/hub-quay.js";

const URL_HUB = "https://script.google.com/macros/s/HubSheet/exec";
const URL_OLD = "https://script.google.com/macros/s/OldSheet/exec";
const sheet = { sheetUrl: URL_HUB, secret: "bi-mat-hub", updatedAt: "2026-10-20T01:00:00.000Z" };
// Đúng hình dạng Hub trả cho scope=mine (repo UrbanB: connection/route.ts; reviewIds do làn Hub thêm).
const mineReply = {
  ok: true,
  branches: [
    { id: "br_col", name: "Colline", code: "COL", ezcloudHotelId: 15739, otaSync: null, reviewIds: { booking: "111", agoda: null, expedia: "333" } },
    { id: "br_pct", name: "Phạm Công Trứ", code: "PCT", ezcloudHotelId: 1234, otaSync: null },
  ],
  reviewSheet: sheet,
};
const branches = H.parseMine(mineReply);
const hub = { ...parseHubSettings(mineReply), at: 1 };
// Máy cũ đã cài bằng mã URB1 / ô nhập tay.
const old = { ...DEFAULT_CONFIG, sheetUrl: URL_OLD, secret: "bi-mat-cu", hotel: "Tên cũ", bookingHotelId: "999", agodaPropertyId: "888", expediaPropertyId: "" };

test("reviewSheet của Hub: đủ URL Web App + mã bí mật thì nhận; null, vắng, URL lạ, mã rỗng ⇒ null", () => {
  assert.deepEqual(parseReviewSheet(sheet), sheet);
  assert.deepEqual(parseReviewSheet({ sheetUrl: ` ${URL_HUB} `, secret: " s ", updatedAt: 5 }), { sheetUrl: URL_HUB, secret: "s", updatedAt: null });
  assert.equal(parseReviewSheet(null), null);
  assert.equal(parseReviewSheet(undefined), null);
  assert.equal(parseReviewSheet({ sheetUrl: "https://evil.example/exec", secret: "s" }), null);
  assert.equal(parseReviewSheet({ sheetUrl: URL_HUB, secret: "  " }), null);
  assert.deepEqual(parseHubSettings(mineReply).reviewSheet, sheet);
  assert.equal("reviewSheet" in parseHubSettings({ ok: true, reviewSheet: null }), false);
});

test("reviewIds của cơ sở: chuỗi giữ, số thành chuỗi, rỗng / null / vắng ⇒ null", () => {
  assert.deepEqual(H.parseReviewIds({ booking: "111", agoda: 222, expedia: " " }), { booking: "111", agoda: "222", expedia: null });
  assert.deepEqual(H.parseReviewIds(undefined), { booking: null, agoda: null, expedia: null });
  assert.deepEqual(H.parseReviewIds(["111"]), { booking: null, agoda: null, expedia: null });
  assert.deepEqual(branches[0].reviewIds, { booking: "111", agoda: null, expedia: "333" });
  assert.deepEqual(branches[1].reviewIds, { booking: null, agoda: null, expedia: null });
});

test("🔴 Hub có Sheet ⇒ Hub thắng cấu hình cũ: Sheet, mã bí mật, tên = tên cơ sở, mã chỗ nghỉ theo cơ sở", () => {
  const r = effectiveReview(old, hub, branches, "br_col");
  assert.equal(r.sheetUrl, URL_HUB);
  assert.equal(r.secret, "bi-mat-hub");
  assert.equal(r.hotel, "Colline");
  assert.equal(r.bookingHotelId, "111");
  assert.equal(r.agodaPropertyId, "888", "Hub null ⇒ giữ mã cũ của máy");
  assert.equal(r.expediaPropertyId, "333");
  assert.deepEqual(r.fromHub, { sheet: true, hotel: true, booking: true, agoda: false, expedia: true });
  assert.equal(reviewMissingText(r), null);
});

test("Máy mới (không có cấu hình cũ): Hub có Sheet, cơ sở không có reviewIds ⇒ tự dò mọi kênh", () => {
  const r = effectiveReview(DEFAULT_CONFIG, hub, branches, "br_pct");
  assert.equal(r.hotel, "Phạm Công Trứ");
  assert.equal(r.bookingHotelId, "");
  assert.equal(r.agodaPropertyId, "");
  assert.equal(r.expediaPropertyId, "");
  assert.equal(reviewMissingText(r), null);
});

test("🔴 Hub không có Sheet (null) ⇒ máy chạy nguyên cấu hình cũ, kể cả tên và mã chỗ nghỉ", () => {
  for (const h of [{ at: 1 }, null, { ...parseHubSettings({ ...mineReply, reviewSheet: null }), at: 1 }]) {
    const r = effectiveReview(old, h, branches, "br_col");
    assert.equal(r.sheetUrl, URL_OLD);
    assert.equal(r.secret, "bi-mat-cu");
    assert.equal(r.hotel, "Tên cũ");
    assert.equal(r.bookingHotelId, "999");
    assert.equal(r.expediaPropertyId, "");
    assert.deepEqual(r.fromHub, { sheet: false, hotel: false, booking: false, agoda: false, expedia: false });
  }
});

test("Tài khoản nhiều chi nhánh chưa chọn: máy cũ giữ tên cũ; máy mới được nhắc chọn chi nhánh", () => {
  assert.equal(effectiveReview(old, hub, branches, "").hotel, "Tên cũ");
  const fresh = effectiveReview(DEFAULT_CONFIG, hub, branches, "");
  assert.equal(fresh.hotel, "");
  assert.equal(fresh.branchState, "ask");
  assert.match(reviewMissingText(fresh), /nhiều chi nhánh.*Chọn chi nhánh của máy này/);
});

test("Câu nhắc thiếu cấu hình: chưa nhận gì từ Hub ⇒ đăng nhập; Hub đã trả mà không có Sheet ⇒ KHÔNG chặn, chỉ 'chưa ghi Sheet' (H-1903 b)", () => {
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, null, null, "")), /chưa nhận cấu hình từ Hub.*đăng nhập bằng tài khoản của bạn/);
  const hubOnly = effectiveReview(DEFAULT_CONFIG, { at: 1 }, branches, "br_col");
  assert.equal(reviewMissingText(hubOnly), null);
  assert.match(sheetSkipText(hubOnly), /^Chưa ghi Sheet\. Review vẫn gửi lên Hub\. Hub chưa có cấu hình Sheet review\. Nhắn Quản trị hệ thống nhập Sheet review trên Hub: màn Kết nối, tab Mã kết nối Booking OTA, khối Sheet review/);
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, hub, [], "")), /chưa gắn với chi nhánh nào.*tài khoản Lễ tân của chi nhánh này/);
});

const effCfg = (cfgIn, h, list, chosen) => {
  const review = effectiveReview(cfgIn, h, list, chosen);
  const { fromHub: _a, branchState: _b, hubSeen: _c, sheetReason: _d, ...fields } = review;
  return { ...cfgIn, ...fields, review, collect: { fromHub: { enabled: false } } };
};

test("Popup: nói rõ nguồn; Hub vắng ⇒ 'Hub chưa có cấu hình thu review'; KHÔNG in URL Sheet hay mã bí mật", () => {
  const hubLines = reviewSourceLines(effCfg(old, hub, branches, "br_col"), CHANNELS).map((l) => l.text);
  assert.match(hubLines.join("\n"), /Sheet thu review: theo cấu hình trên Hub/);
  assert.match(hubLines.join("\n"), /Tên khách sạn: Colline \(tên chi nhánh trên Hub\)/);
  assert.match(hubLines.join("\n"), /Booking 111 \(Hub\), Agoda 888 \(cấu hình cũ\), Expedia 333 \(Hub\)/);
  const oldLines = reviewSourceLines(effCfg(old, { at: 1 }, branches, "br_col"), CHANNELS);
  assert.match(oldLines[0].text, /^Hub chưa có cấu hình thu review\. Máy đang chạy bằng cấu hình cũ/);
  assert.equal(oldLines[0].warn, true);
  for (const lines of [hubLines, oldLines.map((l) => l.text)]) {
    const text = lines.join("\n");
    for (const bad of ["script.google.com", "bi-mat"]) assert.ok(!text.includes(bad), bad);
  }
});

test("Dòng Thu review chưa cài đặt xong không còn bảo dán mã URB1", () => {
  const row = reviewRow(effCfg(DEFAULT_CONFIG, { at: 1 }, [], ""), {}, CHANNELS);
  assert.equal(row.state, "Chưa cài đặt xong");
  assert.doesNotMatch(row.detail, /URB1|Nhận mã/);
  assert.match(row.detail, /chưa gắn với chi nhánh nào/);
});

test("🔴 Popup không còn mã URB1 và ô nhập tay (tên, URL Sheet, mã bí mật, kênh quét, mã Booking/Agoda/Expedia)", () => {
  const html = readFileSync(new URL("../extension/popup.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  for (const id of ["setupCode", "applyCode", "hotel", "sheetUrl", "secret", "bookingHotelId", "agodaPropertyId", "expediaPropertyId", "save", "en-booking"]) {
    assert.ok(!html.includes(`id="${id}"`), `popup.html còn ô ${id}`);
  }
  assert.ok(!/type="checkbox"|type="password"/.test(html));
  assert.ok(!/saveConfig|applySetupCode/.test(js), "popup.js còn ghi cấu hình tay");
});

test("Lượt quét, huy hiệu, Thử Sheet dùng cấu hình đã áp Hub và câu nhắc chung", () => {
  const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  const body = (name) => bg.slice(bg.indexOf(`async function ${name}(`), bg.indexOf("\n}\n", bg.indexOf(`async function ${name}(`)));
  assert.match(body("runScan"), /const missing = reviewMissingText\(cfg\.review\);\s+if \(missing\) return missing;/);
  assert.match(body("refreshBadge"), /reviewMissingText\(cfg\.review\)/);
  assert.match(body("pingSheet"), /reviewMissingText\(cfg\.review\)/);
});

// ---------- YC-156 L5 (H-1903 b) và L6 ----------

test("🔴 L5 — máy chưa có Sheet mà đã nhận lời đáp Hub: lượt quét CHẠY, gửi Hub, chỉ bỏ Sheet", () => {
  const hubOnly = effectiveReview(DEFAULT_CONFIG, { at: 1 }, branches, "br_col");
  // Không bị chặn ⇒ background.js runScan chạy vòng quét và sendHub.
  assert.equal(reviewMissingHelp(hubOnly), null);
  assert.equal(reviewSendsSheet(hubOnly), false);
  // Tên và mã chỗ nghỉ theo cơ sở trên Hub, để lượt gửi Hub đúng chi nhánh.
  assert.equal(hubOnly.hotel, "Colline");
  assert.equal(hubOnly.bookingHotelId, "111");
  // Có Sheet (Hub hoặc cấu hình cũ) ⇒ ghi Sheet như trước, không có câu "chưa ghi Sheet".
  assert.equal(reviewSendsSheet(effectiveReview(DEFAULT_CONFIG, hub, branches, "br_col")), true);
  assert.equal(sheetSkipText(effectiveReview(DEFAULT_CONFIG, hub, branches, "br_col")), null);
  assert.equal(sheetSkipText(effectiveReview(old, { at: 1 }, branches, "br_col")), null);
  // Máy còn Sheet cũ: tên giữ như cũ (không tách dữ liệu Sheet cũ thành hai tên).
  assert.equal(effectiveReview(old, { at: 1 }, branches, "br_col").hotel, "Tên cũ");
});

test("🔴 L5 — popup: thu review không chặn khi thiếu Sheet; dòng nói rõ 'chưa ghi Sheet', không nói 'Sheet vẫn nhận'", () => {
  const c = { ...effCfg(DEFAULT_CONFIG, { at: 1 }, branches, "br_col"), enabled: { booking: true }, intervalHours: 6 };
  const never = reviewRow(c, {}, CHANNELS);
  assert.notEqual(never.state, "Chưa cài đặt xong");
  assert.match(never.detail, /Chưa ghi Sheet vì Hub chưa có cấu hình Sheet review/);
  const ok = reviewRow(c, { booking: { state: "ok", count: 2, at: "2026-10-24T01:00:00Z", hub: { ok: true } } }, CHANNELS);
  assert.equal(ok.tone, "ok");
  assert.match(ok.detail, /Chưa ghi Sheet/);
  const hubLogin = reviewRow(c, { booking: { state: "ok", count: 2, at: "2026-10-24T01:00:00Z", hub: { ok: false, login: true } } }, CHANNELS);
  assert.doesNotMatch(hubLogin.detail, /Sheet vẫn nhận/);
  const lines = reviewSourceLines(c, CHANNELS).map((l) => l.text).join("\n");
  assert.match(lines, /Chưa ghi Sheet\. Review vẫn gửi lên Hub/);
});

test("🔴 L6 — Hub mới gửi reviewSheetReason; NO_BRANCH_ACCESS KHÔNG bị đọc thành 'Hub chưa có cấu hình'", () => {
  const noAccess = { ...parseHubSettings({ ok: true, branches: [], reviewSheet: null, reviewSheetReason: "NO_BRANCH_ACCESS" }), at: 1 };
  assert.equal(noAccess.reviewSheetReason, "NO_BRANCH_ACCESS");
  assert.equal(parseHubSettings({ ok: true, reviewSheet: null, reviewSheetReason: "LẠ" }).reviewSheetReason, null);
  const r = effectiveReview(DEFAULT_CONFIG, noAccess, [], "");
  const text = reviewMissingText(r);
  assert.match(text, /không lấy được cấu hình máy quầy của chi nhánh nào/);
  assert.doesNotMatch(text, /Hub chưa có cấu hình/);
  // Máy còn Sheet cũ: dòng nguồn nói đúng lý do.
  const oldLines = reviewSourceLines(effCfg(old, noAccess, [], ""), CHANNELS).map((l) => l.text).join("\n");
  assert.match(oldLines, /Hub không gửi cấu hình Sheet cho tài khoản đang đăng nhập/);
  assert.doesNotMatch(oldLines, /Hub chưa có cấu hình/);
});

test("L6 — Hub cũ (không có reviewSheetReason) ⇒ lời như bản trước", () => {
  const oldHub = { ...parseHubSettings({ ok: true, branches: [], reviewSheet: null }), at: 1 };
  assert.equal("reviewSheetReason" in oldHub, false);
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, oldHub, [], "")), /chưa gắn với chi nhánh nào/);
  const oldLines = reviewSourceLines(effCfg(old, oldHub, [], ""), CHANNELS).map((l) => l.text);
  assert.match(oldLines[0], /^Hub chưa có cấu hình thu review\. Máy đang chạy bằng cấu hình cũ/);
});

test("🔴 L5 — background.js: lượt quét chỉ dừng theo reviewMissingText; mọi lượt ghi Sheet đi sau cờ toSheet", () => {
  const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  const body = (name) => bg.slice(bg.indexOf(`async function ${name}(`), bg.indexOf("\n}\n", bg.indexOf(`async function ${name}(`)));
  const run = body("runScan");
  assert.match(run, /const toSheet = reviewSendsSheet\(cfg\.review\)/);
  assert.match(run, /scanOne\(channel, cfg, trigger, runId, toSheet\)/);
  assert.doesNotMatch(run, /!cfg\.sheetUrl|!cfg\.secret/, "runScan không được chặn riêng vì thiếu Sheet");
  assert.match(run, /if \(toSheet\) \{\s*try \{\s*await postSheet\(cfg, \{ action: "heartbeat" \}\)/);
  const one = body("scanOne");
  const posts = one.match(/postSheet\(/g) ?? [];
  assert.equal(posts.length, 2);
  assert.match(one, /const sent = toSheet\s*\?\s*await postSheet\(/);
  assert.match(one, /if \(toSheet\) \{\s*try \{\s*await postSheet\(cfg, \{ action: "ingest", run, reviews: \[\]/);
  // Hub vẫn đi trước, không phụ thuộc Sheet.
  assert.ok(one.indexOf("await sendHub(") < one.indexOf("const sent = toSheet"));
});
