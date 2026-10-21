// Máy quầy báo Hub (YC-157): thân lượt báo đúng hợp đồng counter-device.rules.ts của UrbanB.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHANNELS } from "../extension/config.js";
import { CHANNEL_LABEL } from "../extension/report.js";
import { reviewStatusModel } from "../extension/quay/review-status.js";
import * as C from "../extension/quay/counter-heartbeat.js";

const status = {
  booking: { at: "2026-10-22T01:00:00Z", okAt: "2026-10-22T01:00:00Z", state: "ok", count: 3 },
  agoda: {
    at: "2026-10-22T01:05:00Z",
    okAt: "2026-10-21T19:00:00Z",
    state: "login",
    count: 0,
    error: { ref: "E-AG1", code: "AGD-LOGIN", help: { what: "Agoda cần đăng nhập lại.", why: "", steps: ["Mở Agoda"] } },
  },
  trip: { at: "2026-10-22T01:06:00Z", state: "error", count: 0, error: { code: "TRIP-HTTP" } },
};
const enabled = { booking: true, agoda: true, trip: true, expedia: false, traveloka: false, go2joy: false };
const model = reviewStatusModel({ status, order: CHANNELS, enabled, labels: CHANNEL_LABEL, missing: null });

test("Ảnh kênh chỉ mang trường không lộ gì: không lời hướng dẫn, không số bài", () => {
  const ch = C.heartbeatChannels(model);
  assert.deepEqual(ch.map((c) => c.channel), ["booking", "agoda", "trip"]);
  assert.deepEqual(Object.keys(ch[1]).sort(), ["at", "channel", "code", "okAt", "ref", "state"]);
  assert.equal(ch[1].state, "login");
  assert.equal(ch[1].ref, "E-AG1");
});

test("🔴 Lượt lỗi: chỉ kênh lỗi CÓ mã tham chiếu; kênh ổn không thành lượt lỗi", () => {
  assert.deepEqual(C.failuresOf(model), [{ channel: "agoda", kind: "login", code: "AGD-LOGIN", ref: "E-AG1", at: "2026-10-22T01:05:00.000Z" }]);
});

test("Hàng đợi: trùng ref giữ một, giữ tối đa 20 lượt mới nhất", () => {
  const f = (ref) => ({ channel: "agoda", kind: "error", ref, at: "2026-10-22T01:00:00.000Z" });
  assert.deepEqual(C.mergeFailures([f("A")], [f("A"), f("B")]).map((x) => x.ref), ["A", "B"]);
  const many = Array.from({ length: 25 }, (_, i) => f(`R${i}`));
  const kept = C.mergeFailures(many, []);
  assert.equal(kept.length, C.HEARTBEAT_FAILURES_MAX);
  assert.equal(kept[0].ref, "R5");
  assert.deepEqual(C.mergeFailures(null, undefined), []);
});

test("Đẩy phiên PMS: kết quả của flushToken ⇒ chữ Hub hiểu; kết quả lạ ⇒ không báo", () => {
  const at = Date.parse("2026-10-22T02:00:00Z");
  assert.deepEqual(C.tokenPushOf("go2joy", "saved", at), { at: "2026-10-22T02:00:00.000Z", kind: "go2joy", result: "saved" });
  assert.equal(C.tokenPushOf("ezcloud", "pending", at).result, "waiting");
  assert.equal(C.tokenPushOf("ezcloud", "rejected", at).result, "rejected");
  assert.equal(C.tokenPushOf("ezcloud", "retry", at), null);
  assert.equal(C.tokenPushOf("booking", "saved", at), null);
});

test("🔴 Thân lượt báo: không ảnh kênh ⇒ vắng `channels` (Hub giữ ảnh cũ); không chi nhánh ⇒ vắng `branchId`", () => {
  const lock = C.heartbeatBody({ deviceId: "dev-1", version: "1.4.0", g2jLock: { at: "2026-10-22T02:00:00.000Z" } });
  assert.deepEqual(lock, { deviceId: "dev-1", version: "1.4.0", g2jLock: { at: "2026-10-22T02:00:00.000Z" } });
  const scan = C.heartbeatBody({ deviceId: "dev-1", version: "1.4.0", branchId: "b1", model, failures: C.failuresOf(model) });
  assert.equal(scan.branchId, "b1");
  assert.equal(scan.channels.length, 3);
  assert.equal(scan.failures.length, 1);
  assert.equal("tokenPush" in scan, false);
});

test("Lời gọi: POST JSON tới route connection của Hub đang dùng", () => {
  const { url, init } = C.heartbeatRequest("https://hub.urbanb.vn", { deviceId: "d", version: "1" });
  assert.equal(url, "https://hub.urbanb.vn/api/extension/connection");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), { deviceId: "d", version: "1" });
});

test("🔴 dây nối: báo Hub sau mọi lượt quét, sau lần đẩy phiên PMS và sau lần Khoá G2J thành công", async () => {
  const { readFileSync } = await import("node:fs");
  const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  const sw = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  const fin = bg.slice(bg.indexOf("async function runScan"), bg.indexOf("async function scanOne"));
  assert.match(fin.slice(fin.indexOf("} finally {")), /sendHeartbeat\(\{ scan: true \}\)/);
  assert.match(sw, /sendHeartbeat\(\{ tokenPush: C\.tokenPushOf\(kind, reply\.outcome, now\(\)\) \}\)/);
  assert.match(sw, /if \(outcome\.ok\) sendHeartbeat\(\{ g2jLock:/);
});
