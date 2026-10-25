// YC-228 · H-1924 a — bản 1.5.2 bỏ Google Sheet review: chạy thật background.js với `chrome` và `fetch` giả.
// Máy giả mang đủ thứ bản 1.5.1 để lại (URL Sheet + mã bí mật trong cấu hình, Sheet do Hub gửi, hàng đợi nhật
// ký lỗi, dấu lỗi gửi Sheet), Hub giả vẫn gửi `reviewSheet` có giá trị. Lượt quét không được gọi Sheet, kênh
// quét được không được đỏ vì Sheet, huy hiệu không hiện "!" vì dấu Sheet cũ.
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeSetupCode } from "../extension/setup-code.js";

const SHEET_URL = "https://script.google.com/macros/s/SheetCu/exec";
const HUB_SHEET_URL = "https://script.google.com/macros/s/SheetHub/exec";
const OLD_CODE = encodeSetupCode({ hotel: "Tên trong mã", sheetUrl: SHEET_URL, secret: "bi-mat-ma", channels: ["trip", "agoda"] });

// Lời đáp scope=mine của Hub: một chi nhánh, bật Trip và Agoda, vẫn kèm Sheet review (Hub giữ cho bản cũ).
const MINE = {
  ok: true,
  branches: [{ id: "br_pct", name: "Phạm Công Trứ", code: "PCT", ezcloudHotelId: 1234, otaSync: null, reviewIds: { booking: null, agoda: "222", expedia: null } }],
  reviewCollect: { enabled: { booking: false, agoda: true, trip: true, expedia: false, traveloka: false, go2joy: false }, intervalHours: 6 },
  reviewSheet: { sheetUrl: HUB_SHEET_URL, secret: "bi-mat-hub", updatedAt: "2026-10-20T01:00:00.000Z" },
  reviewSheetReason: null,
};

/** Bộ nhớ của máy đang chạy 1.5.1, có Sheet cũ và đang mang dấu lỗi gửi Sheet. */
function oldMachine() {
  return {
    config: { sheetUrl: SHEET_URL, secret: "bi-mat-cu", hotel: "Tên cũ", enabled: { booking: true, agoda: true, trip: true } },
    hubCollect: { reviewSheet: { sheetUrl: HUB_SHEET_URL, secret: "bi-mat-hub", updatedAt: null }, at: 1 },
    pendingLogs: [{ id: "x", ref: "E-OLD", stage: "gửi Sheet", code: "SHEET-URL" }],
    lastError: { id: "x", ref: "E-OLD", stage: "gửi Sheet", code: "SHEET-URL", at: "2026-10-25T09:59:00.000Z", channel: "agoda" },
    deviceId: "dev-test",
  };
}

// Bài Trip giả (dạng trường như test/normalize.test.mjs), không phải review thật.
const TRIP_REVIEW = {
  commentId: 3001,
  userName: "C",
  addtime: "/Date(1791227994000+0800)/",
  content: "Nice",
  score: { avgScore: 9, maxScore: 10, subScores: [{ type: "clean", name: "Cleanliness", score: 9 }] },
};

const state = { store: {}, fetched: [], badges: [], setupFile: null };

function event() {
  const fns = [];
  return {
    addListener: (f) => fns.push(f),
    removeListener: (f) => fns.includes(f) && fns.splice(fns.indexOf(f), 1),
    fire: (...a) => fns.map((f) => f(...a)),
    fns,
  };
}

const keysOf = (keys) => (keys == null ? Object.keys(state.store) : typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys));
const area = (getStore) => ({
  get: async (keys) => Object.fromEntries(keysOf(keys).filter((k) => k in getStore()).map((k) => [k, structuredClone(getStore()[k])])),
  set: async (obj) => void Object.assign(getStore(), structuredClone(obj)),
  remove: async (keys) => void [].concat(keys).forEach((k) => delete getStore()[k]),
});
const session = {};
const tabs = new Map();
let nextTab = 1;
const tabUpdated = event();

globalThis.chrome = {
  storage: { local: area(() => state.store), session: area(() => session), onChanged: event() },
  alarms: { create: async () => {}, clear: async () => true, get: async () => undefined, onAlarm: event() },
  runtime: {
    onInstalled: event(),
    onStartup: event(),
    onMessage: event(),
    lastError: undefined,
    getURL: (p) => `chrome-extension://urbanb/${p}`,
    getManifest: () => ({ version: "1.5.2" }),
    getPlatformInfo: (cb) => cb?.({}),
    reload: () => {},
    sendMessage: async () => {},
  },
  tabs: {
    create: async ({ url }) => {
      const t = { id: nextTab++, url, status: "complete" };
      tabs.set(t.id, t);
      return { ...t };
    },
    update: async (id, { url }) => {
      // Agoda giả hết phiên: mở trang nào cũng bị đá về trang đăng nhập.
      tabs.get(id).url = url.includes("agoda.com") ? "https://ycs.agoda.com/public/login" : url;
      setTimeout(() => tabUpdated.fire(id, { status: "complete" }, { ...tabs.get(id) }), 0);
      return { ...tabs.get(id) };
    },
    get: async (id) => ({ ...tabs.get(id), status: "complete" }),
    remove: async (id) => void tabs.delete(id),
    query: async () => [],
    sendMessage: async () => {},
    onUpdated: tabUpdated,
    onRemoved: event(),
  },
  scripting: { executeScript: async () => [{ result: { ok: true, reviews: [TRIP_REVIEW], total: 1, channelHotelId: "555", snapshots: [] } }] },
  action: { setBadgeText: async ({ text }) => void state.badges.push(text), setBadgeBackgroundColor: async () => {} },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  state.fetched.push({ url: u, method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : "" });
  if (u.endsWith("/ma-cai-dat.txt")) return state.setupFile ? new Response(state.setupFile) : new Response("", { status: 404 });
  if (u.includes("script.google.com")) return new Response("<html>Sheet</html>", { status: 404 });
  if (u.includes("/api/extension/connection")) return json(MINE);
  if (u.includes("/api/ingest/reviews")) return json({ ok: true, inserted: 0, updated: 0, unchanged: 0, unmatched: 0, errors: [], rejected: [] });
  return json({ ok: true });
};

// Lượt mở trang của background.js chờ 2,5 giây cho trang tự chuyển hướng; trong test thì khỏi chờ.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 2500 ? 0 : ms, ...a);

await import("../extension/background.js");

/** Gửi một tin như ô bật lên gửi; chờ lời đáp của listener nào nhận. */
function message(msg) {
  return new Promise((resolve) => {
    for (const fn of chrome.runtime.onMessage.fns) if (fn(msg, {}, resolve) === true) return;
    resolve(undefined);
  });
}

const sheetCalls = () => state.fetched.filter((f) => f.url.includes("script.google.com") || /bi-mat|SheetCu|SheetHub/.test(f.body));

test("🔴 (b) máy còn Sheet cũ trong bộ nhớ, Hub vẫn gửi reviewSheet: lượt quét không gọi Sheet, kênh quét được là ok", async () => {
  Object.assign(state, { store: oldMachine(), fetched: [], badges: [], setupFile: null });
  const reply = await message({ type: "scanNow" });
  assert.deepEqual(reply, { ok: true });
  assert.deepEqual(sheetCalls(), [], "không được gọi Web App Sheet hay gửi mã bí mật Sheet");
  // Hub vẫn nhận như 1.5.1: lô review của Trip và lượt báo sống sau lượt quét.
  const ingest = state.fetched.filter((f) => f.url.endsWith("/api/ingest/reviews") && f.body.includes('"ingest"'));
  assert.equal(ingest.length, 1);
  assert.match(ingest[0].body, /"channel":"trip"/);
  assert.ok(state.fetched.some((f) => f.url.endsWith("/api/extension/connection") && f.method === "POST"), "lượt báo sống lên Hub");
  const trip = state.store.status.trip;
  assert.equal(trip.state, "ok");
  assert.equal(trip.count, 1);
  assert.doesNotMatch(JSON.stringify(trip), /Sheet/);
  assert.equal(trip.hub.ok, true);
  // Kênh đỏ / vàng chỉ vì chính lượt quét: Agoda hết phiên.
  assert.equal(state.store.status.agoda.state, "login");
  // Bản cấu hình Hub vừa nhận không giữ Sheet, dù Hub có gửi.
  assert.equal("reviewSheet" in state.store.hubCollect, false);
  // Không còn xếp hàng nhật ký lỗi chờ Sheet: hàng đợi cũ không dài thêm, lỗi Agoda chỉ thành lỗi gần nhất.
  assert.deepEqual(state.store.pendingLogs, oldMachine().pendingLogs);
  assert.equal(state.store.lastError.stage, "đăng nhập");
  assert.equal(state.store.lastError.channel, "agoda");
});

test("🔴 (a) quét thành công không có Sheet: kênh ok, không lỗi giai đoạn gửi Sheet, huy hiệu không '!' vì dấu Sheet cũ", async () => {
  const machine = oldMachine();
  machine.hubCollect = { at: 1 };
  Object.assign(state, { store: machine, fetched: [], badges: [], setupFile: null });
  MINE.reviewCollect.enabled.agoda = false;
  try {
    assert.deepEqual(await message({ type: "scanChannel", channel: "trip" }), { ok: true });
  } finally {
    MINE.reviewCollect.enabled.agoda = true;
  }
  assert.deepEqual(sheetCalls(), []);
  assert.equal(state.store.status.trip.state, "ok");
  assert.equal(state.store.status.trip.message, "");
  // Dấu lỗi Sheet của 1.5.1 vẫn nằm trong bộ nhớ (chưa qua lượt lên bản) mà huy hiệu không đọc nó nữa.
  assert.equal(state.store.lastError.stage, "gửi Sheet");
  assert.equal(state.badges.at(-1), "");
});

test("🔴 (c) lên 1.5.2: dọn Sheet cũ khỏi bộ nhớ; mã URB1 cũ có Sheet vẫn áp được, chỉ thử Hub", async () => {
  Object.assign(state, { store: oldMachine(), fetched: [], badges: [], setupFile: OLD_CODE });
  await Promise.all(chrome.runtime.onInstalled.fire({ reason: "update" }));
  const { config, setupResult } = state.store;
  assert.equal(setupResult.ok, true, setupResult.error);
  assert.equal(setupResult.hotel, "Tên trong mã");
  assert.equal(setupResult.ping.ok, true);
  assert.ok(!("sheetUrl" in config) && !("secret" in config), "Sheet cũ còn trong cấu hình");
  assert.doesNotMatch(JSON.stringify(state.store), /bi-mat|SheetCu|SheetHub/, "còn Sheet hoặc mã bí mật trong bộ nhớ");
  assert.equal("pendingLogs" in state.store, false);
  assert.equal("lastError" in state.store, false, "dấu lỗi gửi Sheet phải mất khi lên bản");
  assert.deepEqual(sheetCalls(), []);
  assert.ok(state.fetched.some((f) => f.url.includes("/api/ingest/reviews") && f.body.includes('"ping"')), "áp mã xong thử Hub");
});
