import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as W from "../extension/quay/web-orders.js";
import { classifyHubReply } from "../extension/quay/hub-quay.js";

// YC-171 — đơn web urbanb.vn lệch số booking: khối trên tab Booking OTA + nút "Đã xử lý".

const order = (o) => ({ id: "w1", orderCode: "2610055681", roomCount: 2, createdCount: 1, roomTypes: "Deluxe, Deluxe", checkIn: "2026-10-26T07:00:00Z", checkOut: "2026-10-27T05:00:00Z", receivedAt: "2026-10-21T03:10:00Z", ...o });

test("đường GET mang mã khách sạn ezCloud đang mở", () => {
  assert.equal(W.webOrdersUrl("https://hub.urbanb.vn", "1234"), "https://hub.urbanb.vn/api/extension/web-orders?ezcloudHotelId=1234");
});

test("🔴 parseWebOrders: chỉ giữ đơn LỆCH (số phòng khác số booking), dòng hỏng bị bỏ", () => {
  const r = W.parseWebOrders({ ok: true, canResolve: true, orders: [order({}), order({ id: "w2", createdCount: 2 }), order({ id: "w3", createdCount: 3 }), { id: "", orderCode: "1" }, order({ id: "w4", roomCount: "2" })] });
  assert.deepEqual(r.orders.map((o) => o.id), ["w1", "w3"], "đủ số thì không hiện; thừa cũng là lệch");
  assert.equal(r.canResolve, true);
  assert.equal(W.parseWebOrders({ ok: true, orders: [] }).canResolve, false, "Hub không nói được bấm ⇒ không hiện nút");
  assert.equal(W.parseWebOrders({ ok: false, error: "OUT_OF_SCOPE" }), null);
});

test("thẻ đơn: nói thiếu bao nhiêu booking và việc cần làm; không có tên hay số điện thoại khách", () => {
  const c = W.webOrderCard(order({}));
  assert.equal(c.title, "Đơn web urbanb.vn 2610055681");
  assert.match(c.gap, /Thư có 2 phòng, Apps Script mới tạo 1 booking ezCloud: thiếu 1 booking\./);
  assert.match(c.todo, /nhập tay phòng còn thiếu/);
  assert.match(c.meta, /^Deluxe, Deluxe \| \d{2}\/10 \d{2}:\d{2} đến \d{2}\/10 \d{2}:\d{2}$/);
  assert.match(W.webOrderCard(order({ createdCount: 3 })).gap, /thừa 1 booking/);
  assert.equal(W.dayTime("hỏng"), "");
});

test("listState: lỗi phiên/cơ sở đi qua bảng lỗi chung; hình sai ⇒ server", () => {
  assert.equal(W.listState(classifyHubReply({ status: 200, json: { ok: true, orders: [order({})] } })).orders.length, 1);
  assert.equal(W.listState(classifyHubReply({ status: 401, json: { ok: false, error: "NOT_SIGNED_IN" } })).state, "out");
  assert.equal(W.listState(classifyHubReply({ status: 403, json: { ok: false, error: "OUT_OF_SCOPE" } })).state, "nobranch");
  assert.equal(W.listState(classifyHubReply({ status: 404, json: null })).state, "missing", "Hub chưa có route ⇒ ẩn khối");
  assert.equal(W.listState(classifyHubReply({ status: 200, json: { ok: true } })).state, "server");
});

test("resolveState: ghi xong · đơn đã có người xử lý · không có quyền · hết phiên · mất mạng", () => {
  assert.deepEqual(W.resolveState({ status: 200, json: { ok: true, orders: [] } }), { ok: true, orders: [], text: "Đã ghi Đã xử lý." });
  assert.equal(W.resolveState({ status: 404, json: { ok: false, error: "NOT_FOUND" } }).gone, true);
  assert.match(W.resolveState({ status: 403, json: { ok: false, error: "OUT_OF_SCOPE" } }).text, /không có quyền/);
  assert.equal(W.resolveState({ status: 401, json: { ok: false, error: "NOT_SIGNED_IN" } }).state, "out");
  assert.equal(W.resolveState({ netError: "x" }).ok, false);
});

test("thân POST Đã xử lý: đúng một đơn, kèm mã khách sạn để Hub kẹp cơ sở", () => {
  const init = W.resolveInit("1234", "w1");
  assert.equal(init.method, "POST");
  assert.deepEqual(JSON.parse(init.body), { ezcloudHotelId: "1234", id: "w1" });
});

test("dây nối: service worker có hai tin quay:webOrders / quay:webOrderResolve; khung vẽ khối ở tab Booking OTA", () => {
  const sw = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  assert.match(sw, /"quay:webOrders": \(m\) => webOrders\(/);
  assert.match(sw, /"quay:webOrderResolve": \(m\) => resolveWebOrder\(/);
  const ui = readFileSync(new URL("../extension/quay/ui.js", import.meta.url), "utf8");
  assert.match(ui, /const web = webOrdersBlock\(\);/);
  assert.match(ui, /\$\{ban\}\$\{tok\}\$\{web\}\$\{problem\}/, "khối đơn lệch đứng trên ô tìm của tab Booking OTA");
  assert.match(ui, /else if \(a === "webDone"\) return doWebDone\(t\);/);
  // Logic thuần không gọi mạng (luật chung của quay/*.js trừ sw.js).
  assert.doesNotMatch(readFileSync(new URL("../extension/quay/web-orders.js", import.meta.url), "utf8"), /\bfetch\(/);
});
