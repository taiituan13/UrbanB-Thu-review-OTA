import { test } from "node:test";
import assert from "node:assert/strict";
import * as N from "../extension/quay/notifications.js";

const item = (o) => ({ id: "n1", title: "Tiêu đề", body: "", from: "", createdAt: "2026-10-16T02:00:00Z", readAt: null, url: "/notifications", kind: "bulletin", sticky: false, ...o });

test("parseNotifications: dòng hỏng bị bỏ, sticky chỉ nhận true, thời gian tự ẩn mặc định", () => {
  const r = N.parseNotifications({ ok: true, me: { name: "Lan" }, items: [item({}), { id: "", title: "x" }, { id: "n2", title: "  " }, item({ id: "n3", sticky: "true" })] });
  assert.equal(r.items.length, 2);
  assert.equal(r.items[1].sticky, false, "chuỗi 'true' không phải ghim");
  assert.equal(r.unread, 2, "Hub không trả unread ⇒ đếm dòng chưa đọc");
  assert.equal(r.toastSeconds, N.TOAST_SECONDS_DEFAULT);
  assert.equal(r.me.name, "Lan");
  assert.equal(N.parseNotifications({ ok: true, items: [], unread: 5, settings: { toastSeconds: 12 } }).toastSeconds, 12);
  assert.equal(N.parseNotifications({ ok: true, items: [], unread: 5 }).unread, 5, "số của Hub thắng (H-1262 a: Hub đếm)");
  assert.equal(N.parseNotifications({ ok: false }), null);
});

test("sortForList: ghim chưa đọc trước, rồi chưa đọc, rồi đã đọc; mới trước", () => {
  const list = [
    item({ id: "a", readAt: "x", createdAt: "2026-10-16T05:00:00Z" }),
    item({ id: "b", createdAt: "2026-10-16T01:00:00Z" }),
    item({ id: "c", createdAt: "2026-10-16T03:00:00Z" }),
    item({ id: "d", sticky: true, createdAt: "2026-10-15T01:00:00Z" }),
    item({ id: "e", sticky: true, readAt: "x", createdAt: "2026-10-16T06:00:00Z" }),
  ];
  assert.deepEqual(N.sortForList(list).map((n) => n.id), ["d", "c", "b", "e", "a"]);
});

test("chipModel: ẩn khi không có chưa đọc, trừ khi danh sách đang mở", () => {
  assert.equal(N.chipModel(0, false), null);
  assert.equal(N.chipModel(0, true).n, 0);
  assert.equal(N.chipModel(3, false).n, 3);
});

test("toastQueue: lần đầu chỉ ghi nhận; danh sách mở thì không bắn; đã thấy hoặc đã đọc thì không bắn", () => {
  const items = [item({ id: "a", createdAt: "2026-10-16T01:00:00Z" }), item({ id: "b", createdAt: "2026-10-16T03:00:00Z" }), item({ id: "c", readAt: "x" })];
  assert.deepEqual(N.toastQueue(items, new Set(), { firstRun: true, listOpen: false }), []);
  assert.deepEqual(N.toastQueue(items, new Set(), { firstRun: false, listOpen: true }), []);
  assert.deepEqual(N.toastQueue(items, new Set(["a"]), { firstRun: false, listOpen: false }).map((n) => n.id), ["b"]);
  assert.deepEqual(N.toastQueue(items, new Set(), { firstRun: false, listOpen: false }).map((n) => n.id), ["b", "a"]);
});

test("rememberSeen giữ tối đa SEEN_LIMIT id mới nhất", () => {
  const many = Array.from({ length: N.SEEN_LIMIT + 5 }, (_, i) => item({ id: "x" + i }));
  const seen = N.rememberSeen([], many);
  assert.equal(seen.length, N.SEEN_LIMIT);
  assert.equal(seen.at(-1), "x" + (N.SEEN_LIMIT + 4));
  assert.deepEqual(N.rememberSeen(["a"], [item({ id: "a" })]), ["a"]);
});

test("toastTimeoutMs: ghim (H-1344) không tự ẩn", () => {
  assert.equal(N.toastTimeoutMs(item({ sticky: true }), 8), null);
  assert.equal(N.toastTimeoutMs(item({}), 8), 8000);
  assert.equal(N.toastTimeoutMs(item({}), 0), N.TOAST_SECONDS_DEFAULT * 1000);
});

test("markRead chỉ đổi dòng được bấm, không sửa bản cũ", () => {
  const list = [item({ id: "a" }), item({ id: "b" })];
  const next = N.markRead(list, ["a"], "T");
  assert.equal(next[0].readAt, "T");
  assert.equal(next[1].readAt, null);
  assert.equal(list[0].readAt, null);
});

test("Công tắc đọc-hết tắt sẵn (H-1263 b: bấm Đã đọc rõ ràng từng thông báo)", () => {
  assert.equal(N.SWITCHES.readAll, false);
});

test("badgeText: số chưa đọc thắng; không có thì '!' khi máy có việc cần xem (H-1264 a)", () => {
  assert.equal(N.badgeText({ unread: 3, problem: true }), "3");
  assert.equal(N.badgeText({ unread: 120, problem: false }), "99+");
  assert.equal(N.badgeText({ unread: 0, problem: true }), "!");
  assert.equal(N.badgeText({ unread: 0, problem: false }), "");
});

test("listReply: route chưa có (404 không JSON) ⇒ ẩn tính năng; 401 ⇒ out", () => {
  assert.equal(N.listReply({ status: 404, json: null }).state, "unavailable");
  assert.equal(N.listReply({ status: 401, json: { ok: false, error: "NOT_SIGNED_IN" } }).state, "out");
  assert.equal(N.listReply({ netError: "x" }).state, "net");
  assert.equal(N.listReply({ status: 500, json: null }).state, "server");
  assert.equal(N.listReply({ status: 200, json: { ok: true, items: [item({})] } }).state, "ok");
});

test("hubSource: GET danh sách, POST Đã đọc gửi đúng thân", async () => {
  const calls = [];
  const fetchJson = async (url, init) => {
    calls.push({ url, init });
    return url.endsWith("/read") ? { status: 200, json: { ok: true, unread: 1 } } : { status: 200, json: { ok: true, items: [] } };
  };
  const src = N.hubSource("https://hub.urbanb.vn", fetchJson);
  assert.equal((await src.list()).state, "ok");
  assert.deepEqual(await src.read(["a", "b"]), { ok: true, unread: 1 });
  assert.equal(calls[0].url, "https://hub.urbanb.vn/api/extension/notifications");
  assert.equal(calls[1].url, "https://hub.urbanb.vn/api/extension/notifications/read");
  assert.equal(calls[1].init.method, "POST");
  assert.deepEqual(JSON.parse(calls[1].init.body), { ids: ["a", "b"] });
});

test("fakeSource: đọc rồi thì giảm chưa đọc; push thêm thông báo mới", async () => {
  const src = N.fakeSource(() => new Date("2026-10-16T03:00:00Z"));
  const a = await src.list();
  assert.equal(a.unread, 2);
  assert.deepEqual(await src.read(["f2"]), { ok: true, unread: 1 });
  src.push({});
  assert.equal((await src.list()).unread, 2);
});

test("whenText", () => {
  const now = new Date(2026, 9, 16, 10, 0);
  assert.equal(N.whenText(new Date(2026, 9, 16, 9, 20).toISOString(), now), "09:20");
  assert.equal(N.whenText(new Date(2026, 9, 15, 17, 40).toISOString(), now), "Hôm qua 17:40");
  assert.equal(N.whenText(new Date(2026, 9, 10, 8, 0).toISOString(), now), "10/10 08:00");
});

// ---------- H-1374 a (YC-152 mục 4): canMarkRead ----------

// Đúng hình dạng Hub trả (repo UrbanB: notifications/feed.rules.ts).
const ack = { id: "bulletin:p1", title: "SOP mới", body: "", from: "Trần Thị Mai", createdAt: "2026-10-20T01:00:00Z", readAt: null, url: "/bulletin/p1", kind: "bulletin", sticky: true, canMarkRead: false };
const sys = { id: "notification:n1", title: "Bảo trì xong", body: "", from: "Bảo trì", createdAt: "2026-10-20T02:00:00Z", readAt: null, url: "/maintenance/m1", kind: "maintenance", sticky: false, canMarkRead: false };
const plain = { id: "bulletin:p2", title: "Tin thường", body: "", from: "Quản lý", createdAt: "2026-10-20T03:00:00Z", readAt: null, url: "/bulletin/p2", kind: "bulletin", sticky: false, canMarkRead: true };

test("canMarkRead đọc đúng; vắng (nguồn cũ) ⇒ ghi được như trước", () => {
  assert.equal(N.normalizeItem(ack).canMarkRead, false);
  assert.equal(N.normalizeItem(plain).canMarkRead, true);
  const { canMarkRead, ...old } = plain;
  assert.equal(N.normalizeItem(old).canMarkRead, true);
});

test("🔴 Tin canMarkRead: false không có nút Đã đọc; có nút mở Hub (tin Bảng tin: Xác nhận trên Hub)", () => {
  const a = N.rowAction(N.normalizeItem(ack));
  assert.equal(a.kind, "hub");
  assert.equal(a.label, "Xác nhận trên Hub");
  assert.equal(a.path, "/bulletin/p1");
  const s = N.rowAction(N.normalizeItem(sys));
  assert.deepEqual(s, { kind: "hub", label: "Mở trên Hub", path: "/maintenance/m1" });
  assert.equal(N.rowAction(N.normalizeItem({ ...ack, url: null })).path, N.NOTIFICATIONS_PAGE);
  assert.deepEqual(N.rowAction(N.normalizeItem(plain)), { kind: "read", label: "Đã đọc" });
  assert.equal(N.rowAction(N.normalizeItem({ ...plain, readAt: "2026-10-20T04:00:00Z" })), null);
});

test("🔴 Tin không ghi được ở quầy không bao giờ đi POST …/read, kể cả qua Đánh dấu đã đọc hết", () => {
  const items = [ack, sys, plain].map(N.normalizeItem);
  assert.deepEqual(N.markableIds(items, ["bulletin:p1", "notification:n1", "bulletin:p2", "lạ"]), ["bulletin:p2"]);
  assert.deepEqual(N.markableIds(items, ["bulletin:p1"]), []);
});

test("Khung trên PMS vẽ nút theo rowAction và lọc id trước khi ghi", async () => {
  const { readFileSync } = await import("node:fs");
  const ui = readFileSync(new URL("../extension/quay/ui-notify.js", import.meta.url), "utf8");
  assert.match(ui, /const act = N\.rowAction\(n\)/);
  assert.match(ui, /const ids = N\.markableIds\(T\.items, wanted\)/);
});
