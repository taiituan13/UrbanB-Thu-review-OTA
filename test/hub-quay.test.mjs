import { test } from "node:test";
import assert from "node:assert/strict";
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
