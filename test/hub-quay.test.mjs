import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as H from "../extension/quay/hub-quay.js";

const HUB = "https://hub.urbanb.vn";
const reply = (status, json, extra = {}) => ({ status, url: HUB + "/api/extension/connection", redirected: false, json, ...extra });

test("hubOrigin chỉ nhận gốc trong danh sách", () => {
  assert.equal(H.hubOrigin("https://urbanb.xyz/abc"), "https://urbanb.xyz");
  assert.equal(H.hubOrigin("https://hub.urbanb.vn.evil.example"), HUB);
  assert.equal(H.hubOrigin("rác"), HUB);
});

test("URL route: connection kèm báo, indicators, case, results", () => {
  assert.equal(H.connectionUrl(HUB, ""), HUB + "/api/extension/connection");
  const u = new URL(H.connectionUrl(HUB, "4123", { kind: "rejected", message: "x".repeat(400) }));
  assert.equal(u.searchParams.get("ezcloudHotelId"), "4123");
  assert.equal(u.searchParams.get("report"), "rejected");
  assert.equal(u.searchParams.get("message").length, 300);
  // YC-192: kèm tên khách sạn trên ezCloud và mã máy khi hỏi theo mã khách sạn; không có thì không thêm khoá.
  const seen = new URL(H.connectionUrl(HUB, "4123", null, { hotelName: "KS Thu - Q1", deviceId: "dev-1" }));
  assert.equal(seen.searchParams.get("ezcloudHotelName"), "KS Thu - Q1");
  assert.equal(seen.searchParams.get("deviceId"), "dev-1");
  assert.equal(H.connectionUrl(HUB, "4123", null, { hotelName: "", deviceId: "" }), HUB + "/api/extension/connection?ezcloudHotelId=4123");
  assert.equal(H.connectionUrl(HUB, "", null, { hotelName: "x", deviceId: "d" }), HUB + "/api/extension/connection");
  assert.equal(H.indicatorsUrl(HUB, "4123"), HUB + "/api/extension/indicators?ezcloudHotelId=4123");
  assert.equal(H.caseUrl(HUB, "s1"), HUB + "/cong-suat/ket-qua?case=s1");
  assert.equal(H.resultsUrl(HUB, "b1"), HUB + "/cong-suat/ket-qua?br=b1");
});

test("classifyHubReply: mỗi mã lỗi Hub một trạng thái", () => {
  assert.equal(H.classifyHubReply(reply(200, { ok: true })).state, "ok");
  assert.equal(H.classifyHubReply(reply(401, { ok: false, error: "NOT_SIGNED_IN" })).state, "out");
  assert.deepEqual(H.classifyHubReply(reply(400, { ok: false, error: "MISSING_HOTEL" })), { state: "nobranch", why: "wait", code: "MISSING_HOTEL" });
  assert.equal(H.classifyHubReply(reply(404, { ok: false, error: "HOTEL_NOT_LINKED" })).why, "unmapped");
  assert.equal(H.classifyHubReply(reply(403, { ok: false, error: "OUT_OF_SCOPE" })).why, "scope");
  assert.equal(H.classifyHubReply(reply(403, { ok: false, error: "FORBIDDEN_ORIGIN" })).state, "forbidden");
  assert.equal(H.classifyHubReply(reply(200, null, { redirected: true, url: HUB + "/login" })).state, "out");
  assert.equal(H.classifyHubReply(reply(404, null)).state, "missing");
  assert.equal(H.classifyHubReply(reply(500, null)).state, "server");
  assert.equal(H.classifyHubReply({ netError: "Failed to fetch" }).state, "net");
  // Đối chứng: 404 có JSON lỗi lạ không bị đọc thành "route chưa có".
  assert.equal(H.classifyHubReply(reply(404, { ok: false, error: "KHAC" })).state, "server");
});

test("H-1245 a: hết phiên sau khi đã từng đăng nhập ⇒ expired, chưa từng ⇒ out", () => {
  assert.equal(H.sessionState("out", true), "expired");
  assert.equal(H.sessionState("out", false), "out");
  assert.equal(H.sessionState("ok", false), "ok");
  assert.deepEqual(H.RUNS_WHEN_EXPIRED, { bookings: true, board: true, indicators: false, notifications: false, reviews: false });
});

test("usableOtaSync: Hub trả mã mới thì dùng; lỗi mạng (undefined) dùng bản đệm; Hub nói null là không có", () => {
  const cached = { otaSync: { webAppUrl: "https://c/exec", pushKey: "p" } };
  assert.equal(H.usableOtaSync(undefined, cached).webAppUrl, "https://c/exec");
  assert.equal(H.usableOtaSync({ webAppUrl: "https://n/exec" }, cached).webAppUrl, "https://n/exec");
  assert.equal(H.usableOtaSync(null, cached), null);
  assert.equal(H.usableOtaSync(undefined, null), null);
  assert.equal(H.isFresh({ at: 1000 }, 1000 + H.CONNECTION_MAX_AGE_MS - 1, H.CONNECTION_MAX_AGE_MS), true);
  assert.equal(H.isFresh({ at: 1000 }, 1000 + H.CONNECTION_MAX_AGE_MS, H.CONNECTION_MAX_AGE_MS), false);
});

test("reportToSend: chỉ báo Hub khi kết quả đổi", () => {
  const code = { webAppUrl: "u", updatedAt: "2026-10-16T01:00:00Z" };
  const r1 = H.reportToSend(null, code, { kind: "rejected", message: "Sai" });
  assert.equal(r1.kind, "rejected");
  assert.equal(H.reportToSend(r1, code, { kind: "rejected", message: "Sai" }), null, "đã báo rồi thì thôi");
  assert.equal(H.reportToSend(r1, { ...code, updatedAt: "khác" }, { kind: "rejected" }).kind, "rejected", "mã mới bị từ chối ⇒ báo lại");
  assert.equal(H.reportToSend(r1, code, { kind: "accepted" }).kind, "accepted");
  assert.equal(H.reportToSend(null, code, { kind: "accepted" }), null, "không tự xoá dấu máy khác đặt");
  assert.equal(H.reportToSend(null, null, { kind: "rejected" }), null);
});

test("blockedNote: out chặn, expired không chặn, không gọi được Hub mà có bản đệm thì không chặn", () => {
  assert.equal(H.blockedNote({ session: "out" }).login, true);
  assert.equal(H.blockedNote({ session: "expired" }), null);
  assert.equal(H.blockedNote({ session: "ok" }), null);
  assert.equal(H.blockedNote({ session: "net", hasCache: true }), null);
  assert.equal(H.blockedNote({ session: "net" }).retry, true);
  assert.match(H.blockedNote({ session: "nobranch", why: "unmapped", hotelId: "4123" }).text, /4123/);
  assert.match(H.blockedNote({ session: "nobranch", why: "scope" }).text, /không được gán/);
  assert.match(H.blockedNote({ session: "nobranch", why: "wait" }).title, /Chưa biết/);
});

test("dockModel: nút gập nói số booking lỗi và chấm mức chỉ báo (H-1246 a)", () => {
  assert.deepEqual(H.dockModel({ session: "out" }).segs, [{ dot: "off", text: "chưa đăng nhập" }]);
  const m = H.dockModel({ session: "ok", booking: { issues: 2, count: 9 }, indicators: { exceeded: 3, level: "cb" } });
  assert.deepEqual(m.segs, [{ text: "Booking 2 lỗi", bad: true }, { dot: "cb", text: "Chỉ báo 3 đang vượt" }]);
  assert.equal(H.dockModel({ session: "ok", booking: { issues: 0, count: 9 }, indicators: { exceeded: 0 } }).segs[0].bad, false);
  assert.equal(H.dockModel({ session: "expired", booking: { issues: 0, count: 1 } }).segs[1].text, "Chỉ báo dừng cập nhật");
});

test("popupPmsRow: từng phần một dòng, phần hỏng đẩy màu chung", () => {
  assert.equal(H.popupPmsRow({ session: "out" }).state, "Chưa chạy");
  const ok = H.popupPmsRow({ session: "ok", branchName: "UB1", booking: { count: 5, issues: 0, at: 1 }, indicators: { exceeded: 0, at: 1 } });
  assert.equal(ok.tone, "ok");
  assert.equal(ok.subs.length, 2);
  const none = H.popupPmsRow({ session: "ok", branchName: "UB1", codeState: "none", indicators: { exceeded: 1, at: 1 } });
  assert.equal(none.tone, "err");
  assert.match(none.subs[0].text, /chưa có mã kết nối Booking OTA của UB1/);
  const exp = H.popupPmsRow({ session: "expired", booking: { count: 1, issues: 0 } });
  assert.equal(exp.tone, "warn");
  assert.match(exp.state, /phiên Hub đã hết/);
});

test("popupPmsRow: chưa ghép cơ sở và mất Hub KHÔNG bị đọc thành 'Hub chưa có mã kết nối'", () => {
  const un = H.popupPmsRow({ session: "nobranch", why: "unmapped", codeState: "unknown" });
  assert.match(un.subs[0].text, /chưa được ghép với chi nhánh/);
  assert.ok(!un.subs.some((x) => /chưa có mã kết nối/.test(x.text)));
  const down = H.popupPmsRow({ session: "server", codeState: "unknown" });
  assert.match(down.subs[0].text, /không gọi được Hub/);
  assert.ok(!down.subs.some((x) => /chưa có mã kết nối/.test(x.text)));
  // Đối chứng: Hub trả lời được mà không có mã ⇒ vẫn là "chưa có mã kết nối".
  assert.match(H.popupPmsRow({ session: "ok", codeState: "none", branchName: "UB1" }).subs[0].text, /chưa có mã kết nối Booking OTA của UB1/);
  assert.equal(H.frameSubtitle({ session: "server", branchName: "" }), "Không gọi được Hub");
  assert.equal(H.frameSubtitle({ session: "server", branchName: "UB1" }), "UB1, theo PMS đang mở");
});

test("🔴 Chưa đăng nhập: chỉ ghi ảnh trạng thái khi phiên đổi (bản 1.0.0 ghi mỗi lượt ⇒ popup gọi Hub không ngừng)", () => {
  assert.deepEqual(H.outSessionPatch({ session: "ok" }, true), { session: "expired" });
  assert.deepEqual(H.outSessionPatch(undefined, false), { session: "out" });
  assert.equal(H.outSessionPatch({ session: "expired", booking: {} }, true), null);
  assert.equal(H.outSessionPatch({ session: "out" }, false), null);
  const sw = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  const note = sw.slice(sw.indexOf("async function noteSession("), sw.indexOf("\n}\n", sw.indexOf("async function noteSession(")));
  assert.match(note, /if \(patch\) await patchSnap\(patch\)/);
});

test("YC-159 — quay lại tab PMS: đọc chỉ báo ngay, trừ khi vừa đọc chưa tới 1 phút", () => {
  const now = 1_000_000_000;
  assert.equal(H.reloadIndicatorsOnVisible(null, now), true, "chưa đọc lần nào ⇒ đọc");
  assert.equal(H.reloadIndicatorsOnVisible(now - 4 * 60_000, now), true, "ẩn 4 phút ⇒ đọc ngay, không chờ lượt 5 phút");
  assert.equal(H.reloadIndicatorsOnVisible(now - H.INDICATORS_ON_VISIBLE_MIN_GAP_MS, now), true);
  // Đối chứng: đổi tab liên tục ⇒ không dồn lượt gọi Hub.
  assert.equal(H.reloadIndicatorsOnVisible(now - 10_000, now), false);
});

test("YC-159 — ui.js nối visibilitychange vào lượt đọc chỉ báo", () => {
  const src = readFileSync(new URL("../extension/quay/ui.js", import.meta.url), "utf8");
  const i = src.indexOf('addEventListener("visibilitychange"');
  assert.ok(i > 0);
  const body = src.slice(i, src.indexOf("});", i));
  assert.match(body, /reloadIndicatorsOnVisible\(indAskedAt/);
  assert.match(body, /loadIndicators\(\)/);
});

test("🔴 YC-156 L3 — tiêu đề Khung trên PMS không nói 'Đang chạy' cạnh dòng 'chưa mở PMS'", () => {
  const closed = H.popupPmsRow({ session: "ok", codeState: "ok", notifications: { state: "ok", unread: 0, at: 1 } });
  assert.match(closed.subs[0].text, /chưa mở PMS/);
  assert.equal(closed.state, "Chưa mở PMS");
  assert.equal(closed.tone, "off");
  assert.doesNotMatch(closed.state, /Đang chạy/);
  // Đối chứng: PMS đã mở và chạy ổn ⇒ "Đang chạy"; có lỗi thì lỗi vẫn thắng.
  const ok = H.popupPmsRow({ session: "ok", branchName: "UB1", booking: { count: 5, issues: 0, at: 1 }, indicators: { exceeded: 0, at: 1 } });
  assert.equal(ok.state, "Đang chạy");
  assert.equal(ok.tone, "ok");
  assert.equal(H.popupPmsRow({ session: "ok", codeState: "none", branchName: "UB1" }).tone, "err");
  // Cờ nội bộ không lọt ra dòng con.
  assert.ok(!closed.subs.some((x) => "pmsClosed" in x));
});
