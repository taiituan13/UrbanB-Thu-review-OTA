// YC-156 · H-1527 a: thu review tự nhận cấu hình từ Hub (tên khách sạn, mã chỗ nghỉ).
// YC-228 · H-1924 a (1.5.2): không còn Sheet review — Sheet Hub gửi hay Sheet cũ của máy đều bỏ qua.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHANNELS, DEFAULT_CONFIG } from "../extension/config.js";
import * as HC from "../extension/hub-config.js";
const { effectiveReview, parseHubSettings, reviewMissingHelp, reviewMissingText } = HC;
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

test("🔴 YC-228 — Hub còn gửi reviewSheet có giá trị: máy không giữ, cấu hình thực dùng không có Sheet", () => {
  assert.equal("reviewSheet" in parseHubSettings(mineReply), false);
  for (const name of ["parseReviewSheet", "reviewSendsSheet", "sheetSkipText", "sheetSkipHelp", "HUB_SHEET_PLACE"]) {
    assert.equal(name in HC, false, `hub-config.js còn ${name}`);
  }
  // Bản cấu hình Hub do 1.5.1 lưu còn reviewSheet ⇒ vẫn bỏ qua.
  const r = effectiveReview(old, { ...hub, reviewSheet: sheet }, branches, "br_col");
  assert.ok(!("sheetUrl" in r) && !("secret" in r));
  assert.doesNotMatch(JSON.stringify(r), /script\.google|bi-mat/);
});

test("reviewIds của cơ sở: chuỗi giữ, số thành chuỗi, rỗng / null / vắng ⇒ null", () => {
  assert.deepEqual(H.parseReviewIds({ booking: "111", agoda: 222, expedia: " " }), { booking: "111", agoda: "222", expedia: null });
  assert.deepEqual(H.parseReviewIds(undefined), { booking: null, agoda: null, expedia: null });
  assert.deepEqual(H.parseReviewIds(["111"]), { booking: null, agoda: null, expedia: null });
  assert.deepEqual(branches[0].reviewIds, { booking: "111", agoda: null, expedia: "333" });
  assert.deepEqual(branches[1].reviewIds, { booking: null, agoda: null, expedia: null });
});

test("🔴 Hub biết chi nhánh ⇒ Hub thắng cấu hình cũ (kể cả máy còn Sheet cũ): tên = tên cơ sở, mã chỗ nghỉ theo cơ sở", () => {
  const r = effectiveReview(old, hub, branches, "br_col");
  assert.equal(r.hotel, "Colline");
  assert.equal(r.bookingHotelId, "111");
  assert.equal(r.agodaPropertyId, "888", "Hub null ⇒ giữ mã cũ của máy");
  assert.equal(r.expediaPropertyId, "333");
  assert.deepEqual(r.fromHub, { hotel: true, booking: true, agoda: false, expedia: true });
  assert.equal(reviewMissingText(r), null);
  // H-1924 a: tới 1.5.1 máy còn Sheet cũ mà Hub không có Sheet thì giữ tên cũ; nay theo Hub.
  assert.equal(effectiveReview(old, { at: 1 }, branches, "br_col").hotel, "Colline");
});

test("Máy mới (không có cấu hình cũ): cơ sở không có reviewIds ⇒ tự dò mọi kênh", () => {
  const r = effectiveReview(DEFAULT_CONFIG, hub, branches, "br_pct");
  assert.equal(r.hotel, "Phạm Công Trứ");
  assert.equal(r.bookingHotelId, "");
  assert.equal(r.agodaPropertyId, "");
  assert.equal(r.expediaPropertyId, "");
  assert.equal(reviewMissingText(r), null);
});

test("🔴 Chưa biết chi nhánh (chưa có danh sách cơ sở) ⇒ tên và mã chỗ nghỉ theo cấu hình cũ, không có Sheet", () => {
  for (const h of [{ at: 1 }, null, hub]) {
    const r = effectiveReview(old, h, null, "");
    assert.equal(r.hotel, "Tên cũ");
    assert.equal(r.bookingHotelId, "999");
    assert.equal(r.expediaPropertyId, "");
    assert.deepEqual(r.fromHub, { hotel: false, booking: false, agoda: false, expedia: false });
    assert.ok(!("sheetUrl" in r));
  }
});

test("Tài khoản nhiều chi nhánh chưa chọn: máy cũ giữ tên cũ; máy mới được nhắc chọn chi nhánh", () => {
  assert.equal(effectiveReview(old, hub, branches, "").hotel, "Tên cũ");
  const fresh = effectiveReview(DEFAULT_CONFIG, hub, branches, "");
  assert.equal(fresh.hotel, "");
  assert.equal(fresh.branchState, "ask");
  assert.match(reviewMissingText(fresh), /nhiều chi nhánh.*Chọn chi nhánh của máy này/);
});

test("Câu nhắc thiếu cấu hình: chưa nhận gì từ Hub ⇒ đăng nhập (kể cả máy còn Sheet cũ); Hub đã trả ⇒ không chặn", () => {
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, null, null, "")), /chưa nhận cấu hình từ Hub.*đăng nhập bằng tài khoản của bạn/);
  // 1.5.2: Sheet cũ không còn là chỗ gửi review ⇒ chưa đăng nhập Hub lần nào là chặn.
  assert.match(reviewMissingText(effectiveReview(old, null, null, "")), /chưa nhận cấu hình từ Hub/);
  const hubOnly = effectiveReview(DEFAULT_CONFIG, { at: 1 }, branches, "br_col");
  assert.equal(reviewMissingText(hubOnly), null);
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, hub, [], "")), /chưa gắn với chi nhánh nào.*tài khoản Lễ tân của chi nhánh này/);
});

const effCfg = (cfgIn, h, list, chosen) => {
  const review = effectiveReview(cfgIn, h, list, chosen);
  const { fromHub: _a, branchState: _b, hubSeen: _c, sheetReason: _d, ...fields } = review;
  return { ...cfgIn, ...fields, review, collect: { fromHub: { enabled: false } } };
};

test("Popup: nói rõ nguồn; không còn dòng Sheet; KHÔNG in URL Sheet hay mã bí mật", () => {
  const hubLines = reviewSourceLines(effCfg(old, hub, branches, "br_col"), CHANNELS).map((l) => l.text);
  assert.match(hubLines.join("\n"), /Tên khách sạn: Colline \(tên chi nhánh trên Hub\)/);
  assert.match(hubLines.join("\n"), /Booking 111 \(Hub\), Agoda 888 \(cấu hình cũ\), Expedia 333 \(Hub\)/);
  const oldLines = reviewSourceLines(effCfg(old, { at: 1 }, null, ""), CHANNELS).map((l) => l.text);
  assert.match(oldLines.join("\n"), /Tên khách sạn: Tên cũ \(cấu hình cũ của máy\)/);
  for (const lines of [hubLines, oldLines]) {
    assert.doesNotMatch(lines.join("\n"), /Sheet/);
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

test("Lượt quét, huy hiệu dùng cấu hình đã áp Hub và câu nhắc chung; nút Thử Hub thay Thử Sheet", () => {
  const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  const body = (name) => bg.slice(bg.indexOf(`async function ${name}(`), bg.indexOf("\n}\n", bg.indexOf(`async function ${name}(`)));
  assert.match(body("runScan"), /const missing = reviewMissingText\(cfg\.review\);\s+if \(missing\) return missing;/);
  assert.match(body("refreshBadge"), /reviewMissingText\(cfg\.review\)/);
  const html = readFileSync(new URL("../extension/popup.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.match(html, /<button class="secondary" id="ping">Thử Hub<\/button>/);
  assert.match(js, /sendMessage\(\{ type: "pingHub" \}\)/);
  assert.match(bg, /msg\?\.type === "pingHub"/);
});

// ---------- YC-156 L5 (H-1903 b) và L6, đọc lại theo 1.5.2 ----------

test("🔴 L5 — đã nhận lời đáp Hub: lượt quét CHẠY và gửi Hub; tên và mã chỗ nghỉ theo cơ sở", () => {
  const hubOnly = effectiveReview(DEFAULT_CONFIG, { at: 1 }, branches, "br_col");
  assert.equal(reviewMissingHelp(hubOnly), null);
  assert.equal(hubOnly.hotel, "Colline");
  assert.equal(hubOnly.bookingHotelId, "111");
});

test("🔴 YC-228 — popup: dòng Thu review không còn nói 'chưa ghi Sheet' hay 'Sheet vẫn nhận'", () => {
  const c = { ...effCfg(DEFAULT_CONFIG, { at: 1 }, branches, "br_col"), enabled: { booking: true }, intervalHours: 6 };
  const never = reviewRow(c, {}, CHANNELS);
  assert.notEqual(never.state, "Chưa cài đặt xong");
  const ok = reviewRow(c, { booking: { state: "ok", count: 2, at: "2026-10-24T01:00:00Z", hub: { ok: true } } }, CHANNELS);
  assert.equal(ok.tone, "ok");
  const hubLogin = reviewRow(c, { booking: { state: "ok", count: 2, at: "2026-10-24T01:00:00Z", hub: { ok: false, login: true } } }, CHANNELS);
  const hubErr = reviewRow(c, { booking: { state: "ok", count: 2, at: "2026-10-24T01:00:00Z", hub: { ok: false } } }, CHANNELS);
  const lines = reviewSourceLines(c, CHANNELS).map((l) => l.text).join("\n");
  for (const text of [never.detail, ok.detail, hubLogin.detail, hubErr.detail, lines]) assert.doesNotMatch(text, /Sheet/);
});

test("🔴 L6 — Hub mới gửi reviewSheetReason; NO_BRANCH_ACCESS KHÔNG bị đọc thành 'Hub chưa có cấu hình'", () => {
  const noAccess = { ...parseHubSettings({ ok: true, branches: [], reviewSheet: null, reviewSheetReason: "NO_BRANCH_ACCESS" }), at: 1 };
  assert.equal(noAccess.reviewSheetReason, "NO_BRANCH_ACCESS");
  assert.equal(parseHubSettings({ ok: true, reviewSheet: null, reviewSheetReason: "LẠ" }).reviewSheetReason, null);
  const r = effectiveReview(DEFAULT_CONFIG, noAccess, [], "");
  const text = reviewMissingText(r);
  assert.match(text, /không lấy được cấu hình máy quầy của chi nhánh nào/);
  assert.doesNotMatch(text, /Hub chưa có cấu hình/);
});

test("L6 — Hub cũ (không có reviewSheetReason) ⇒ lời như bản trước", () => {
  const oldHub = { ...parseHubSettings({ ok: true, branches: [], reviewSheet: null }), at: 1 };
  assert.equal("reviewSheetReason" in oldHub, false);
  assert.match(reviewMissingText(effectiveReview(DEFAULT_CONFIG, oldHub, [], "")), /chưa gắn với chi nhánh nào/);
});

test("🔴 YC-228 — background.js không còn đường ghi Sheet; lượt quét chỉ dừng theo reviewMissingText", () => {
  const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  for (const bad of ["postSheet", "pingSheet", "toSheet", "sheetUrl", "cfg.secret", "gửi Sheet", "sheetDown", "SHEET_TIMEOUT_MS", "sheetReviews"]) {
    assert.ok(!bg.includes(bad), `background.js còn ${bad}`);
  }
  const body = (name) => bg.slice(bg.indexOf(`async function ${name}(`), bg.indexOf("\n}\n", bg.indexOf(`async function ${name}(`)));
  assert.match(body("runScan"), /scanOne\(channel, cfg, trigger, runId\)/);
  assert.match(body("scanOne"), /await sendHub\(channel, batch\.reviews,/);
});
