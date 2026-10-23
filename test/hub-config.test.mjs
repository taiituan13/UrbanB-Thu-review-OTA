// Cấu hình thu review đặt trên Hub (YC-152 mục 2 · H-1348 a): kênh quét, chu kỳ, thời gian tự ẩn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_CONFIG } from "../extension/config.js";
import { alarmMinutes, effectiveCollect, parseHubSettings, scheduleText } from "../extension/hub-config.js";
import * as H from "../extension/quay/hub-quay.js";
import * as N from "../extension/quay/notifications.js";

// Đúng hình dạng Hub trả (repo UrbanB: counter-settings.rules.ts extensionSettingsPayload).
const hubReply = {
  ok: true,
  branches: [],
  reviewSheet: null,
  settings: { toastSeconds: 21 },
  reviewCollect: { enabled: { booking: true, agoda: false, trip: false, expedia: true, traveloka: false, go2joy: false }, intervalHours: 3 },
};

test("Đọc cấu hình Hub: kênh, chu kỳ, thời gian tự ẩn", () => {
  assert.deepEqual(parseHubSettings(hubReply), {
    enabled: { booking: true, agoda: false, trip: false, expedia: true, traveloka: false, go2joy: false },
    intervalHours: 3,
    toastSeconds: 21,
  });
});

test("Hub vắng trường (chưa có dòng cấu hình) ⇒ không có trường nào; số ngoài cận coi như vắng", () => {
  assert.deepEqual(parseHubSettings({ ok: true, branches: [] }), {});
  assert.deepEqual(parseHubSettings({ reviewCollect: { intervalHours: 0 }, settings: { toastSeconds: 999 } }), {});
  assert.deepEqual(parseHubSettings({ reviewCollect: { intervalHours: 2.5, enabled: ["booking"] } }), {});
  assert.deepEqual(parseHubSettings(null), {});
});

test("🔴 Kênh Hub gửi thiếu khoá ⇒ kênh ấy TẮT, không trộn với mặc định của máy", () => {
  const p = parseHubSettings({ reviewCollect: { enabled: { go2joy: true, booking: "true" } } });
  assert.deepEqual(p.enabled, { booking: false, agoda: false, trip: false, expedia: false, traveloka: false, go2joy: true });
});

test("🔴 Có cấu hình Hub ⇒ kênh và chu kỳ theo Hub, đè cấu hình của máy", () => {
  const cfg = { ...DEFAULT_CONFIG, intervalHours: 12, enabled: { ...DEFAULT_CONFIG.enabled, agoda: true, go2joy: true } };
  const eff = effectiveCollect(cfg, parseHubSettings(hubReply));
  assert.equal(eff.intervalHours, 3);
  assert.deepEqual(eff.enabled, hubReply.reviewCollect.enabled);
  assert.deepEqual(eff.fromHub, { enabled: true, intervalHours: true, branch: false });
});

test("Hub vắng ⇒ kênh theo máy (mã cài đặt), chu kỳ theo mặc định extension (bỏ số cũ của ô đã gỡ)", () => {
  const cfg = { ...DEFAULT_CONFIG, intervalHours: 12, enabled: { booking: false, agoda: true } };
  for (const hub of [null, {}, { toastSeconds: 5, at: 1 }]) {
    const eff = effectiveCollect(cfg, hub);
    assert.equal(eff.intervalHours, DEFAULT_CONFIG.intervalHours);
    assert.equal(eff.enabled.booking, false);
    assert.equal(eff.enabled.agoda, true);
    assert.equal(eff.enabled.trip, DEFAULT_CONFIG.enabled.trip);
    assert.deepEqual(eff.fromHub, { enabled: false, intervalHours: false, branch: false });
  }
  // Chỉ có chu kỳ ⇒ chu kỳ theo Hub, kênh theo máy.
  const half = effectiveCollect(cfg, { intervalHours: 24 });
  assert.equal(half.intervalHours, 24);
  assert.equal(half.enabled.agoda, true);
});

test("🔴 YC-157 · H-1715 a: chi nhánh có cấu hình riêng ⇒ kênh và chu kỳ theo chi nhánh, thắng cả chuỗi", () => {
  // Đúng hình dạng Hub gửi trong `branches[]` của scope=mine (connection-codes.ts branchReviewCollect).
  const [branch] = H.parseMine({
    ok: true,
    branches: [
      {
        id: "b1",
        name: "Bến Thành",
        reviewCollect: { enabled: { booking: true, agoda: false, trip: false, expedia: false, traveloka: false, go2joy: false }, intervalHours: 12 },
      },
    ],
  });
  const eff = effectiveCollect(DEFAULT_CONFIG, parseHubSettings(hubReply), branch);
  assert.equal(eff.intervalHours, 12);
  assert.equal(eff.enabled.expedia, false);
  assert.equal(eff.enabled.booking, true);
  assert.equal(eff.fromHub.branch, true);
  assert.match(scheduleText(eff), /mỗi 12 giờ \(theo cấu hình riêng của chi nhánh trên Hub\)/);
  // Chi nhánh không có cấu hình riêng (Hub gửi null) ⇒ theo cả chuỗi.
  const [plain] = H.parseMine({ ok: true, branches: [{ id: "b2", name: "Q1", reviewCollect: null }] });
  assert.equal(plain.reviewCollect, null);
  const chain = effectiveCollect(DEFAULT_CONFIG, parseHubSettings(hubReply), plain);
  assert.equal(chain.intervalHours, 3);
  assert.equal(chain.fromHub.branch, false);
  // Cấu hình riêng sai dạng ⇒ coi như vắng, không đè cả chuỗi.
  assert.equal(effectiveCollect(DEFAULT_CONFIG, parseHubSettings(hubReply), { reviewCollect: { intervalHours: 999 } }).intervalHours, 3);
});

test("Báo thức: giờ ⇒ phút, không dày hơn 30 phút; chữ dưới nút nói nguồn của chu kỳ", () => {
  assert.equal(alarmMinutes(3), 180);
  assert.equal(alarmMinutes(168), 168 * 60);
  assert.equal(alarmMinutes(0.1), 30);
  assert.equal(alarmMinutes(undefined), DEFAULT_CONFIG.intervalHours * 60);
  assert.match(scheduleText(effectiveCollect(DEFAULT_CONFIG, { intervalHours: 3 })), /mỗi 3 giờ \(theo cấu hình trên Hub\)/);
  assert.match(scheduleText(effectiveCollect(DEFAULT_CONFIG, null)), /mỗi 6 giờ \(mặc định, chưa nhận cấu hình từ Hub\)/);
});

test("Cấu hình đọc bằng lượt liệt kê chỉ đọc scope=mine (không kèm mã khách sạn, không report)", () => {
  assert.equal(H.mineUrl("https://hub.urbanb.vn"), "https://hub.urbanb.vn/api/extension/connection?scope=mine");
});

test("Thông báo: route thông báo có toastSeconds ⇒ đánh dấu là của Hub; vắng ⇒ service worker lấy số của route connection", () => {
  assert.equal(N.parseNotifications({ ok: true, items: [], settings: { toastSeconds: 12 } }).toastFromHub, true);
  const none = N.parseNotifications({ ok: true, items: [] });
  assert.equal(none.toastFromHub, false);
  assert.equal(none.toastSeconds, N.TOAST_SECONDS_DEFAULT);
});

test("🔴 Popup không còn ô nhập chu kỳ quét tại máy", () => {
  const html = readFileSync(new URL("../extension/popup.html", import.meta.url), "utf8");
  const js = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.ok(!html.includes('id="intervalHours"'), "popup.html còn ô Quét mỗi (giờ)");
  assert.ok(!/"intervalHours"/.test(js), "popup.js còn đọc/ghi ô chu kỳ");
});

test("Lịch quét và lượt quét đọc cấu hình đã áp Hub, không đọc thẳng cấu hình máy", () => {
  const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  const body = (name) => bg.slice(bg.indexOf(`async function ${name}(`), bg.indexOf("\n}\n", bg.indexOf(`async function ${name}(`)));
  for (const fn of ["schedule", "runScan", "refreshBadge", "pingSheet"]) {
    assert.match(body(fn), /loadEffectiveConfig\(\)/, `${fn} phải dùng loadEffectiveConfig`);
    assert.doesNotMatch(body(fn), /loadConfig\(\)/, `${fn} còn dùng loadConfig`);
  }
  assert.match(body("runScan"), /syncHubSettings\(\)/, "runScan phải hỏi Hub trước khi quét");
});

test("🔴 YC-156 L4 — dòng 'tự quét mỗi N giờ' ẩn khi thu review không tự chạy được", () => {
  const eff = effectiveCollect(DEFAULT_CONFIG, { intervalHours: 6, enabled: { booking: true } });
  const ready = { sheetUrl: "https://s", secret: "x", hotel: "UB1", hubSeen: true };
  assert.match(scheduleText(eff, ready), /mỗi 6 giờ/);
  // Bị chặn: Chrome chưa đăng nhập Hub lần nào và máy không có Sheet.
  assert.equal(scheduleText(eff, { sheetUrl: "", secret: "", hotel: "", hubSeen: false }), null);
  // Bị chặn: chưa biết chi nhánh.
  assert.equal(scheduleText(eff, { ...ready, hotel: "" }), null);
  // Không bật kênh nào.
  assert.equal(scheduleText(effectiveCollect(DEFAULT_CONFIG, { intervalHours: 6, enabled: {} }), ready), null);
  // H-1903 b: chưa có Sheet nhưng vẫn gửi Hub ⇒ vẫn tự quét ⇒ dòng còn.
  assert.match(scheduleText(eff, { sheetUrl: "", secret: "", hotel: "UB1", hubSeen: true }), /mỗi 6 giờ/);
  // popup.js truyền cấu hình thu review vào và ẩn dòng khi null.
  const js = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.match(js, /scheduleText\(cfg\.collect, cfg\.review\)/);
  assert.match(js, /\$\("auto"\)\.hidden = !auto/);
});
