import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as S from "../extension/quay/shift-handover.js";

// YC-246 (H-2034 b) — lễ tân bấm Bàn giao trên PMS ⇒ extension gửi Hub số vừa chốt (chỉ số và mã).
// Hình dạng thân request/phản hồi ShiftHandover CHƯA đo lượt bấm thật: mẫu dưới dựng theo GetCurrentShift
// (fixture g2j_price_crawler/fixtures/tien_ket) và DO-yc27 ("thân = cả Data của ca"). Không có dữ liệu thật.

const TOKEN = "eyJhbGciOi.token-gia.chu-ky";
const shiftData = (over = {}) => ({
  ShiftId: 52011,
  HotelId: 17704,
  ShiftNumber: 14,
  CreateDate: "2026-10-20T01:00:00Z",
  CreateUserId: "nguoi-tao-gia",
  CreateUserName: "Lễ Tân Giả",
  Receiver: "Người Nhận Giả",
  IsFinish: false,
  Token: TOKEN,
  ListShiftDetailModels: [
    { MoneyId: 2, MoneyName: "USD", MoneyInTheSafe: 5, MoneyNextShift: 5, MoneyAssignManagement: 0 },
    { MoneyId: 1, MoneyName: "VND", MinorUnit: "0", MoneyBeginShift: 260000, TotalRevenue: 1115526763, TotalExpenditure: 26637191, MoneyCurrent: 1089149572, MoneyInTheSafe: 1089149572, MoneyDifference: 0, MoneyNextShift: 89149572, MoneyAssignManagement: 1000000000 },
  ],
  ...over,
});
const OK = JSON.stringify({ Code: 0, Message: "SUCCESS", Data: null });
const report = (over = {}) => S.handoverReport({ requestBody: JSON.stringify(shiftData(over)), handedOverAt: "2026-10-26T14:58:10.000Z", extensionVersion: "1.5.5" });

// ---------- Thân tin ----------

test("🔴 thân tin chỉ có tám trường số và mã, đúng dòng VND; không token, không tên người", () => {
  const r = report();
  assert.deepEqual(r, {
    ezcloudHotelId: "17704",
    ezShiftId: 52011,
    ezShiftNumber: 14,
    moneyInTheSafe: 1089149572,
    moneyNextShift: 89149572,
    moneyAssignManagement: 1000000000,
    handedOverAt: "2026-10-26T14:58:10.000Z",
    extensionVersion: "1.5.5",
  });
  const wire = S.shiftHandoverRequest("https://hub.urbanb.vn", r);
  assert.equal(wire.url, "https://hub.urbanb.vn/api/extension/shift-handover");
  assert.equal(wire.init.method, "POST");
  for (const leak of [TOKEN, "Lễ Tân Giả", "Người Nhận Giả", "nguoi-tao-gia"]) assert.ok(!wire.init.body.includes(leak), `lộ ${leak}`);
});

test("object ca bọc trong Data cũng đọc được; thiếu HotelId thì lấy mã khách sạn của tab PMS", () => {
  const wrapped = S.handoverReport({ requestBody: JSON.stringify({ Data: shiftData() }), handedOverAt: "t", extensionVersion: "1.5.5" });
  assert.equal(wrapped?.moneyNextShift, 89149572);
  const noHotel = S.handoverReport({ requestBody: JSON.stringify(shiftData({ HotelId: undefined })), handedOverAt: "t", extensionVersion: "1.5.5", pageHotelId: "15739" });
  assert.equal(noHotel?.ezcloudHotelId, "15739");
});

test("không dòng VND, thiếu mã ca, số không phải số, thân hỏng ⇒ không dựng thân tin", () => {
  assert.equal(report({ ListShiftDetailModels: [{ MoneyName: "USD", MoneyInTheSafe: 1, MoneyNextShift: 1, MoneyAssignManagement: 0 }] }), null);
  assert.equal(report({ ShiftId: 0 }), null);
  assert.equal(report({ ListShiftDetailModels: [{ MoneyName: "VND", MoneyInTheSafe: 1, MoneyNextShift: "1", MoneyAssignManagement: 0 }] }), null);
  assert.equal(S.handoverReport({ requestBody: "{hỏng", handedOverAt: "t", extensionVersion: "1" }), null);
});

test("cleanReport (tin từ bridge tới service worker): dựng lại đúng tám trường, bỏ mọi khoá lạ", () => {
  const dirty = { ...report(), token: TOKEN, name: "x" };
  assert.deepEqual(Object.keys(S.cleanReport(dirty)).sort(), Object.keys(report()).sort());
  assert.equal(S.cleanReport({ ...report(), ezShiftId: "52011" }), null);
});

// ---------- Chỉ gửi khi ezCloud báo xong ----------

test("🔴 phản hồi lỗi ⇒ không gửi: Code ≠ 0, HTTP lỗi, thân không phải JSON", () => {
  // ĐỐI CHỨNG: bỏ vế Code === 0 ⇒ ca Code 1 ra true ⇒ ĐỎ.
  assert.equal(S.ezcloudSucceeded(200, OK), true);
  assert.equal(S.ezcloudSucceeded(200, JSON.stringify({ Code: 1, Message: "FAIL" })), false);
  assert.equal(S.ezcloudSucceeded(500, OK), false);
  assert.equal(S.ezcloudSucceeded(200, "<html>"), false);
  assert.equal(S.ezcloudSucceeded(200, ""), false);
});

test("chỉ POST …/api/Shift/ShiftHandover trên PMS là lượt Bàn giao", () => {
  assert.equal(S.isShiftHandoverRequest("https://pms.ezcloudhotel.com/api/Shift/ShiftHandover", "POST"), true);
  assert.equal(S.isShiftHandoverRequest("/api/shift/shifthandover", "post"), true);
  assert.equal(S.isShiftHandoverRequest("/api/Shift/ShiftHandover", "GET"), false);
  assert.equal(S.isShiftHandoverRequest("/api/Shift/GetCurrentShift?shiftId=0", "POST"), false);
  assert.equal(S.isShiftHandoverRequest("https://evil.example/api/Shift/ShiftHandover", "POST"), false);
});

// ---------- Chống trùng, hàng chờ, lời đáp Hub ----------

test("🔴 gửi trùng ⇒ một lần: cùng ca xếp hai lần còn một; ca đã gửi xong không xếp lại", () => {
  // ĐỐI CHỨNG: bỏ kiểm khoá trong enqueue ⇒ hàng có 2 lượt ⇒ ĐỎ.
  const r = report();
  const q1 = S.enqueue([], [], r, 1);
  const q2 = S.enqueue(q1, [], { ...r, moneyNextShift: 1 }, 2);
  assert.equal(q2.length, 1);
  assert.deepEqual(S.enqueue([], S.markSent([], S.reportKey(r)), r, 3), []);
  assert.equal(S.enqueue(q1, [], report({ ShiftId: 52012 }), 4).length, 2, "ca khác vẫn xếp");
});

test("hàng chờ bỏ lượt quá hạn; danh sách đã gửi có trần", () => {
  const q = S.enqueue([], [], report(), 0);
  assert.equal(S.pruneQueue(q, S.QUEUE_TTL_MS).length, 1);
  assert.equal(S.pruneQueue(q, S.QUEUE_TTL_MS + 1).length, 0);
  let sent = [];
  for (let i = 0; i < S.SENT_MAX + 5; i += 1) sent = S.markSent(sent, "k" + i);
  assert.equal(sent.length, S.SENT_MAX);
  assert.equal(sent.at(-1), "k" + (S.SENT_MAX + 4));
});

test("🔴 lời đáp Hub: Hub cũ chưa có route ⇒ giữ trong hàng, không báo phiên; từ chối hẳn ⇒ bỏ", () => {
  // ĐỐI CHỨNG: coi 404 không kèm error là drop ⇒ ca đầu ĐỎ.
  assert.deepEqual(S.settle({ status: 404, json: null }), { action: "keep" });
  assert.deepEqual(S.settle({ status: 200, json: { ok: true, duplicate: true } }), { action: "sent" });
  assert.deepEqual(S.settle({ status: 401, json: { ok: false, error: "NOT_SIGNED_IN" } }), { action: "keep", out: true });
  assert.deepEqual(S.settle({ netError: "x" }), { action: "keep" });
  assert.deepEqual(S.settle({ status: 502, json: null }), { action: "keep" });
  assert.equal(S.settle({ status: 404, json: { ok: false, error: "HOTEL_NOT_LINKED" } }).action, "drop");
  assert.equal(S.settle({ status: 400, json: { ok: false, error: "INVALID_BODY" } }).action, "drop");
  assert.equal(S.settle({ status: 403, json: { ok: false, error: "OUT_OF_SCOPE" } }).action, "drop");
});

// ---------- capture.js: bắt request + phản hồi trong trang ----------

function loadPms() {
  const posted = [];
  class FakeXHR {
    constructor() {
      this.listeners = {};
      this.responseType = "";
    }
    open() {}
    setRequestHeader() {}
    addEventListener(name, fn) {
      this.listeners[name] = fn;
    }
    send() {}
    finish(status, text) {
      this.status = status;
      this.responseText = text;
      this.listeners.loadend?.();
    }
  }
  const href = "https://pms.ezcloudhotel.com/#/shiftHandover";
  const u = new URL(href);
  const window = {
    fetch: async () => ({ ok: true, status: 200, clone: () => ({ text: async () => OK }) }),
    postMessage: (data, origin) => posted.push({ data, origin }),
  };
  const ctx = { window, location: { href, hostname: u.hostname, origin: u.origin }, XMLHttpRequest: FakeXHR, URL, JSON, Number, String };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../extension/capture.js", import.meta.url), "utf8"), ctx);
  return { window, XHR: FakeXHR, posted: () => posted.filter((p) => p.data.__urbanbQuay === "shiftHandover") };
}

test("🔴 capture.js: XHR Bàn giao ⇒ chuyển thân request, mã HTTP và phản hồi cho bridge, SAU khi phản hồi về", () => {
  const { XHR, posted } = loadPms();
  const x = new XHR();
  x.open("POST", "/api/Shift/ShiftHandover");
  x.send(JSON.stringify(shiftData()));
  assert.equal(posted().length, 0, "chưa có phản hồi thì chưa chuyển");
  x.finish(200, OK);
  assert.equal(posted().length, 1);
  const { data, origin } = posted()[0];
  assert.equal(origin, "https://pms.ezcloudhotel.com");
  assert.equal(data.status, 200);
  assert.equal(data.response, OK);
  assert.equal(S.handoverReport({ requestBody: data.body, handedOverAt: "t", extensionVersion: "1.5.5" })?.moneyNextShift, 89149572);
});

test("capture.js: fetch Bàn giao cũng bắt; request khác (GET ca, POST khác) không chuyển gì", async () => {
  const { window, XHR, posted } = loadPms();
  await window.fetch("/api/Shift/ShiftHandover", { method: "POST", body: JSON.stringify(shiftData()) });
  await new Promise((r) => setImmediate(r));
  assert.equal(posted().length, 1);
  await window.fetch("/api/Shift/GetCurrentShift?shiftId=0");
  const x = new XHR();
  x.open("POST", "/api/Room/Save");
  x.send("{}");
  x.finish(200, OK);
  assert.equal(posted().length, 1);
});

test("dây nối: bridge chỉ gửi khi ezCloud báo xong; service worker có tin quay:shiftHandover; báo thức gửi lại hàng chờ", () => {
  const bridge = readFileSync(new URL("../extension/bridge.js", import.meta.url), "utf8");
  assert.match(bridge, /if \(!S\.ezcloudSucceeded\(d\.status, d\.response\)\) return;/);
  assert.match(bridge, /type: "quay:shiftHandover", report/);
  const sw = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  assert.match(sw, /"quay:shiftHandover": \(m\) => onShiftHandover\(m\.report\)/);
  const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  assert.match(bg, /flushShiftHandovers\(\);/);
});

// ---------- sw.js chạy thật: hàng chờ, chống trùng, Hub cũ ----------

function event() {
  const fns = [];
  return { addListener: (f) => fns.push(f), removeListener() {}, fire: (...a) => fns.map((f) => f(...a)) };
}
const store = { quayHubOrigin: "https://hub.urbanb.vn" };
const local = {
  get: async (keys) => {
    const ks = keys == null ? Object.keys(store) : [].concat(keys);
    return Object.fromEntries(ks.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
  },
  set: async (obj) => void Object.assign(store, structuredClone(obj)),
  remove: async (keys) => void [].concat(keys).forEach((k) => delete store[k]),
};
const sentMessages = [];
globalThis.chrome = {
  storage: { local, session: { get: async () => ({}), set: async () => {} }, onChanged: event() },
  runtime: { getManifest: () => ({ version: "1.5.5" }), getPlatformInfo: (cb) => cb?.({}), onMessage: event(), lastError: undefined },
  tabs: { query: async () => [], sendMessage: async (_id, msg) => void sentMessages.push(msg) },
};
const hubCalls = [];
let hubReply = () => ({ status: 404, body: null });
globalThis.fetch = async (url, init = {}) => {
  if (String(url).endsWith("/api/extension/shift-handover")) hubCalls.push(JSON.parse(init.body));
  const { status, body } = hubReply(url);
  return {
    status,
    url: String(url),
    redirected: false,
    headers: { get: () => (body ? "application/json" : "text/html") },
    json: async () => body,
  };
};
const SW = await import("../extension/quay/sw.js");

test("🔴 sw.js: Hub cũ chưa có route ⇒ lượt ở lại hàng, không báo lỗi lên khung; Hub có route ⇒ gửi một lần", async () => {
  hubReply = () => ({ status: 404, body: null });
  assert.deepEqual(await SW.onShiftHandover(report()), { ok: true });
  assert.equal(hubCalls.length, 1);
  assert.equal(store[S.QUEUE_KEY].length, 1, "giữ trong hàng");
  assert.equal(sentMessages.length, 0, "không tin nào tới khung quầy");
  assert.notEqual(store.quayLastSession, "out", "Hub cũ không phải hết phiên");

  hubReply = () => ({ status: 200, body: { ok: true, duplicate: false } });
  await SW.onShiftHandover(report()); // lễ tân bấm lại / PMS gửi lại cùng ca
  assert.equal(hubCalls.length, 2, "lượt trùng không xếp thêm; lượt đang chờ được gửi");
  assert.deepEqual(store[S.QUEUE_KEY], []);
  assert.deepEqual(store[S.SENT_KEY], ["17704:52011"]);

  await SW.onShiftHandover(report());
  await SW.flushShiftHandovers();
  assert.equal(hubCalls.length, 2, "ca đã gửi xong không gửi lại");
  for (const body of hubCalls) assert.deepEqual(Object.keys(body).sort(), Object.keys(report()).sort());
});

test("sw.js: tin hình sai từ bridge ⇒ bỏ, không gọi Hub", async () => {
  const before = hubCalls.length;
  assert.deepEqual(await SW.onShiftHandover({ token: TOKEN }), { ok: false });
  assert.equal(hubCalls.length, before);
});
