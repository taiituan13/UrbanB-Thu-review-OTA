import { test } from "node:test";
import assert from "node:assert/strict";
import * as B from "../extension/quay/booking-ota.js";

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${b64u(payload)}.chuky`;

test("isTokenApi: ezCloud chỉ /api/ trên pms; Go2Joy chỉ api-ha", () => {
  assert.equal(B.isTokenApi("ezcloud", "/api/Room/List", "https://pms.ezcloudhotel.com/"), true);
  assert.equal(B.isTokenApi("ezcloud", "/assets/a.js", "https://pms.ezcloudhotel.com/"), false);
  assert.equal(B.isTokenApi("ezcloud", "https://evil.example/api/x", "https://pms.ezcloudhotel.com/"), false);
  assert.equal(B.isTokenApi("go2joy", "https://api-ha.go2joy.vn/api/v1/x", "https://ha.go2joy.vn/"), true);
  assert.equal(B.isTokenApi("go2joy", "https://ha.go2joy.vn/api/v1/x", "https://ha.go2joy.vn/"), false);
});

test("bearerOf và hotelSnOf (URL trước, rồi thân JSON)", () => {
  assert.equal(B.bearerOf("Bearer abc.def"), "abc.def");
  assert.equal(B.bearerOf("Basic xyz"), "");
  assert.equal(B.hotelSnOf("https://api-ha.go2joy.vn/x?hotelSn=10715", undefined, null), 10715);
  assert.equal(B.hotelSnOf("https://api-ha.go2joy.vn/x", undefined, '{"hotelSn":"222"}'), 222);
  assert.equal(B.hotelSnOf("https://api-ha.go2joy.vn/x", undefined, "{}"), 0);
});

test("ezcloudHotelIdOf: claim HotelId khớp lỏng, chỉ nhận số", () => {
  assert.equal(B.ezcloudHotelIdOf(jwt({ HotelId: 4123, name: "x" })), "4123");
  assert.equal(B.ezcloudHotelIdOf(jwt({ "http://schemas/claims/hotelid": "77" })), "77");
  assert.equal(B.ezcloudHotelIdOf(jwt({ hotel_id: "88" })), "88");
  // Đối chứng: claim gần giống nhưng khác nghĩa, hoặc giá trị không phải số ⇒ không nhận.
  assert.equal(B.ezcloudHotelIdOf(jwt({ HotelIdList: "1,2" })), "");
  assert.equal(B.ezcloudHotelIdOf(jwt({ HotelId: "abc" })), "");
  assert.equal(B.ezcloudHotelIdOf("không-phải-jwt"), "");
});

test("findJwtIn: khoá có access/token xét trước", () => {
  const a = jwt({ a: 1 }), b = jwt({ b: 2 });
  assert.equal(B.findJwtIn([{ other: a, accessToken: b }]), b);
  assert.equal(B.findJwtIn([{ x: "không" }, { y: a }]), a);
  assert.equal(B.findJwtIn([{}]), "");
});

test("bộ nhớ token: 10 phút không gửi lại, giữ 20 mục mới nhất, không sửa bản cũ", () => {
  const now = 1_000_000_000;
  let memo = {};
  memo = B.remember(memo, "k", "rejected", "Sai", now);
  assert.equal(B.isRemembered(memo, "k", now + B.RESEND_MS - 1), true);
  assert.equal(B.isRemembered(memo, "k", now + B.RESEND_MS), false);
  assert.equal(B.lastErrorOf(memo, "k"), "Sai");
  const before = { ...memo };
  for (let i = 0; i < 30; i += 1) memo = B.remember(memo, "k" + i, "saved", "", now + i);
  assert.equal(Object.keys(memo).length, B.MEMO_LIMIT);
  assert.ok(memo.k29 && !memo.k0, "giữ mới nhất");
  assert.deepEqual(before, { k: { status: "rejected", at: now, error: "Sai" } });
  assert.notEqual(B.memoKey("ezcloud", "u", "t1"), B.memoKey("ezcloud", "u", "t2"));
  assert.ok(!B.memoKey("ezcloud", "u", "tokenbimat").includes("tokenbimat"), "không lưu token thật");
});

test("parsePushReply: các kết cục và mã bị từ chối", () => {
  assert.equal(B.parsePushReply('{"ok":true,"result":{"status":"SAVED"}}').outcome, "saved");
  assert.equal(B.parsePushReply('{"ok":true,"result":{"status":"PENDING"}}').outcome, "pending");
  assert.equal(B.parsePushReply('{"ok":true,"result":{"status":"UNCHANGED"}}').outcome, "unchanged");
  assert.equal(B.parsePushReply('{"ok":false,"error":"Đang bận, thử lại"}').outcome, "retry");
  const r = B.parsePushReply('{"ok":false,"error":"Sai mã kết nối. Kiểm lại."}');
  assert.equal(r.outcome, "rejected");
  assert.equal(r.codeRejected, true);
  assert.equal(B.parsePushReply('{"ok":false,"error":"Token hết hạn"}').codeRejected, false);
  assert.equal(B.parsePushReply("<html>").outcome, "bad-reply");
  assert.deepEqual(JSON.parse(B.pushTokenBody({ kind: "go2joy", token: "t", hotelSn: 5, pushKey: "k" })), { action: "pushToken", kind: "go2joy", token: "t", hotelSn: 5, key: "k" });
});

test("parseApiReply: mã kết nối bị từ chối ⇒ ApiError rejected; lỗi khác ⇒ api", () => {
  assert.deepEqual(B.parseApiReply('{"ok":true,"result":[1],"hotel":"A"}'), { result: [1], hotel: "A" });
  assert.throws(() => B.parseApiReply('{"ok":false,"error":"Invalid or missing OTA status API token."}'), (e) => e.kind === "rejected");
  assert.throws(() => B.parseApiReply('{"ok":false,"error":"Sheet trống"}'), (e) => e.kind === "api");
  assert.throws(() => B.parseApiReply("oops"), (e) => e.kind === "not-json");
});

test("isAppsScriptUrl và apiUrl", () => {
  assert.equal(B.isAppsScriptUrl("https://script.google.com/macros/s/AKfy_123-x/exec"), true);
  assert.equal(B.isAppsScriptUrl("https://script.google.com.evil.example/macros/s/A/exec"), false);
  assert.equal(B.isAppsScriptUrl("http://script.google.com/macros/s/A/exec"), false);
  const u = new URL(B.apiUrl("https://script.google.com/macros/s/A/exec", B.lockParams("K1", true), "tok"));
  assert.equal(u.searchParams.get("action"), "lockG2J");
  assert.equal(u.searchParams.get("confirmPaid"), "1");
  assert.equal(u.searchParams.get("token"), "tok");
  assert.equal(new URL(B.apiUrl("https://x/exec", B.recentParams(), "")).searchParams.has("token"), false);
});

test("Booking lỗi lên đầu, đếm lỗi, nút Khoá G2J", () => {
  const ok = { id: 1, ezCloud: { status: "CREATED" }, go2Joy: { lockStatus: "LOCKED" } };
  const ez = { id: 2, ezCloud: { status: "ERROR" } };
  const sk = { id: 3, ezCloud: { status: "CREATED" }, go2Joy: { lockStatus: "SKIPPED" } };
  assert.deepEqual(B.sortForCounter([ok, ez, sk]).map((m) => m.id), [2, 3, 1]);
  assert.equal(B.countIssues([ok, ez, sk]), 2);
  assert.equal(B.canLock(ok), false);
  assert.equal(B.canLock(sk), true);
  assert.equal(B.canLock(ez), false);
});

test("lockConfirm: booking UrbanB chưa thanh toán ⇒ gửi confirmPaid", () => {
  assert.equal(B.lockConfirm({ source: "UrbanB", paymentStatus: "Chưa thanh toán" }).confirmPaid, true);
  assert.equal(B.lockConfirm({ source: "Agoda", paymentStatus: "Chưa thanh toán" }).confirmPaid, false);
  assert.equal(B.lockConfirm({ source: "UrbanB", paymentStatus: "Đã thanh toán" }).confirmPaid, false);
  assert.deepEqual(B.lockOutcome({ lockResult: { status: "LOCKED", message: "ok" } }), { ok: true, text: "G2J LOCKED: ok" });
});

test("chipClass", () => {
  assert.equal(B.chipClass("CREATED"), "ok");
  assert.equal(B.chipClass("ERROR"), "err");
  assert.equal(B.chipClass("SKIPPED"), "warn");
  assert.equal(B.chipClass("AVAILABLE"), "info");
  assert.equal(B.chipClass(""), "none");
});

test("haCoversDay / coversDay theo loại khoá", () => {
  assert.equal(B.haCoversDay({ lockCategory: "overnight", startDate: "2026-10-16", endDate: "2026-10-18" }, "2026-10-17"), true);
  assert.equal(B.haCoversDay({ lockCategory: "overnight", startDate: "2026-10-16", endDate: "2026-10-18" }, "2026-10-18"), false);
  assert.equal(B.haCoversDay({ lockCategory: "hourly", startDate: "2026-10-16" }, "2026-10-17"), false);
  assert.equal(B.coversDay({ lockCategory: "overnight", checkIn: "2026-10-16T14:00", checkOut: "2026-10-17T12:00" }, "2026-10-16"), true);
  assert.equal(B.coversDay({ lockCategory: "overnight", checkIn: "2026-10-16T14:00", checkOut: "2026-10-17T12:00" }, "2026-10-17"), false);
});

test("boardModel: ô trống/hết/không rõ, biểu tượng khoá, cảnh báo khoá lệch loại phòng", () => {
  const occ = {
    ok: true,
    days: ["2026-10-16", "2026-10-17"],
    generatedAt: "16/10 09:00",
    roomTypes: [{ roomTypeId: "R1", name: "Deluxe", total: 3, rooms: ["101", "102"], perDay: [{ free: 0, total: 3 }, { free: null, total: 3 }] }],
  };
  const locks = { haOk: true, count: 1, haLocks: [{ ezRoomTypeId: "R1", lockCategory: "daily", startDate: "2026-10-16", endDate: "2026-10-16" }, { ezRoomTypeId: "", roomTypeName: "Lạ", startDate: "2026-10-17" }], locks: [] };
  const m = B.boardModel(occ, locks, "2026-10-16");
  assert.equal(m.days[0].today, true);
  assert.equal(m.rows[0].cells[0].cls, "f0");
  assert.equal(m.rows[0].cells[1].cls, "fn");
  assert.equal(m.rows[0].cells[1].n, "?");
  assert.deepEqual(m.rows[0].cells[0].icons, ["daily"]);
  assert.match(m.warn, /1 khoá Go2Joy không khớp/);
  assert.deepEqual(B.boardModel({ ok: false, message: "hỏng" }, null, "x"), { error: "Không đọc được timeline EZCloud: hỏng" });
});
