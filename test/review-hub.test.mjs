// YC-156 · H-1527 a: thu review tự nhận cấu hình từ Hub (Sheet, mã bí mật, tên khách sạn, mã chỗ nghỉ).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHANNELS, DEFAULT_CONFIG } from "../extension/config.js";
import { effectiveReview, parseHubSettings, parseReviewSheet, reviewMissingText } from "../extension/hub-config.js";
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

test("Câu nhắc thiếu cấu hình: chưa nhận gì từ Hub ⇒ đăng nhập; Hub đã trả mà không có Sheet ⇒ báo Quản trị", () => {
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, null, null, "")), /chưa nhận cấu hình từ Hub.*đăng nhập bằng tài khoản của bạn/);
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, { at: 1 }, branches, "br_col")), /Hub chưa có cấu hình thu review\. Nhắn Quản trị hệ thống/);
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, hub, [], "")), /chưa gắn với chi nhánh nào.*tài khoản Lễ tân của chi nhánh này/);
});

const effCfg = (cfgIn, h, list, chosen) => {
  const review = effectiveReview(cfgIn, h, list, chosen);
  const { fromHub: _a, branchState: _b, hubSeen: _c, ...fields } = review;
  return { ...cfgIn, ...fields, review, collect: { fromHub: { enabled: false } } };
};

test("Popup: nói rõ nguồn; Hub vắng ⇒ 'Hub chưa có cấu hình thu review'; KHÔNG in URL Sheet hay mã bí mật", () => {
  const hubLines = reviewSourceLines(effCfg(old, hub, branches, "br_col"), CHANNELS).map((l) => l.text);
  assert.match(hubLines.join("\n"), /Sheet thu review: theo cấu hình trên Hub/);
  assert.match(hubLines.join("\n"), /Tên khách sạn: Colline \(tên chi nhánh trên Hub\)/);
  assert.match(hubLines.join("\n"), /Booking 111 \(Hub\) · Agoda 888 \(cấu hình cũ\) · Expedia 333 \(Hub\)/);
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
  assert.match(row.detail, /Hub chưa có cấu hình thu review/);
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
