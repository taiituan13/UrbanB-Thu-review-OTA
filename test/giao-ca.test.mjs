// YC-239 · H-1996 a, H-1976 c — trang Giao ca quầy trên Hub ra lệnh quét qua hub-bridge.js (`ext:scan`), nhận tiến độ
// từng kênh và đúng một kết quả với trạng thái thật từng kênh. Chạy thật background.js với `chrome` và `fetch` giả,
// và hub-bridge.js trong một trang Hub giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { HUB_ORIGINS } from "../extension/env.js";
import { CHANNEL_STATE, MSG, OUTCOME, REQUEST_ID_MAX, SCAN_PORT, createScanRun, isHubSender, joinMode, parseRequestId } from "../extension/shift-scan.js";
import { retryAlarmName } from "../extension/tab-scan.js";

// Chuỗi đánh dấu bí mật: không được lọt vào bất kỳ tin nào gửi trang. Giá trị giả, không phải bí mật thật.
const SECRETS = {
  sheet: "https://script.google.com/macros/s/SheetGiaoCa/exec",
  secret: "bi-mat-giao-ca",
  token: "tok-giao-ca-123",
  ota: "ma-ket-noi-ota-giao-ca",
  email: "le.tan.gia@example.test",
  query: "ses=phien-booking-gia",
};

// Lời đáp scope=mine của Hub: một chi nhánh, bật Trip và Go2Joy; mang thêm mã kết nối OTA và email để soi rò rỉ.
const MINE = {
  ok: true,
  user: { email: SECRETS.email },
  branches: [
    {
      id: "br_pct",
      name: "Phạm Công Trứ",
      code: "PCT",
      ezcloudHotelId: 1234,
      otaSync: { code: SECRETS.ota, sheetUrl: SECRETS.sheet, updatedAt: "2026-10-26T01:00:00.000Z" },
      reviewIds: { booking: null, agoda: null, expedia: null },
    },
  ],
  reviewCollect: { enabled: { booking: false, agoda: false, trip: true, expedia: false, traveloka: false, go2joy: true }, intervalHours: 6 },
  reviewSheetReason: null,
};

// Bài Trip giả (dạng trường như test/normalize.test.mjs), không phải review thật.
const TRIP_REVIEW = { commentId: 3001, userName: "C", addtime: "/Date(1791227994000+0800)/", content: "Nice", score: { avgScore: 9, maxScore: 10, subScores: [] } };
const TRIP_OK = { ok: true, reviews: [TRIP_REVIEW], total: 1, channelHotelId: "555", snapshots: [] };

const machine = () => ({
  config: { hotel: "Tên máy", enabled: { trip: true, go2joy: true }, sheetUrl: SECRETS.sheet, secret: SECRETS.secret, hubToken: SECRETS.token },
  hubCollect: { at: 1 },
  deviceId: "dev-test",
});

const state = { store: {}, fetched: [], created: [], closeOn: [], tripResult: null, hubFail: false, mine: MINE, scanDelay: 0 };

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
const alarms = new Map();
let nextTab = 1;
let nextGroup = 100;
const tabUpdated = event();
const tabRemoved = event();

globalThis.chrome = {
  storage: { local: area(() => state.store), session: area(() => session), onChanged: event() },
  alarms: {
    create: async (name, info) => void alarms.set(name, { name, ...info }),
    clear: async (name) => alarms.delete(name),
    get: async (name) => alarms.get(name),
    getAll: async () => [...alarms.values()],
    onAlarm: event(),
  },
  runtime: {
    id: "urbanb",
    onInstalled: event(),
    onStartup: event(),
    onMessage: event(),
    onConnect: event(),
    lastError: undefined,
    getURL: (p) => `chrome-extension://urbanb/${p}`,
    getManifest: () => ({ version: "1.5.4" }),
    getPlatformInfo: (cb) => cb?.({}),
    reload: () => {},
    sendMessage: async () => {},
  },
  tabs: {
    create: async (props) => {
      const t = { id: nextTab++, url: props.url, status: "complete", windowId: 7, groupId: -1 };
      state.created.push({ ...props, at: Date.now() });
      tabs.set(t.id, t);
      return { ...t };
    },
    update: async (id, { url }) => {
      if (!tabs.has(id)) throw new Error(`No tab with id: ${id}.`);
      tabs.get(id).url = url;
      const close = state.closeOn.findIndex((host) => url.includes(host));
      if (close >= 0) {
        state.closeOn.splice(close, 1);
        tabs.delete(id);
        setTimeout(() => tabRemoved.fire(id, {}), 0);
        return { id, url };
      }
      setTimeout(() => tabs.has(id) && tabUpdated.fire(id, { status: "complete" }, { ...tabs.get(id) }), 0);
      return { ...tabs.get(id) };
    },
    get: async (id) => {
      if (!tabs.has(id)) throw new Error(`No tab with id: ${id}.`);
      return { ...tabs.get(id), status: "complete" };
    },
    remove: async (id) => {
      if (!tabs.delete(id)) throw new Error(`No tab with id: ${id}.`);
      tabRemoved.fire(id, {});
    },
    group: async ({ groupId, tabIds }) => {
      const g = groupId ?? nextGroup++;
      for (const id of [].concat(tabIds)) if (tabs.has(id)) tabs.get(id).groupId = g;
      return g;
    },
    query: async () => [],
    sendMessage: async () => {},
    onUpdated: tabUpdated,
    onRemoved: tabRemoved,
  },
  tabGroups: { query: async () => [], update: async () => {} },
  scripting: {
    executeScript: async ({ target, func }) => {
      if (func.name === "showScanBanner") return [{ result: true }];
      if (!tabs.has(target.tabId)) throw new Error(`No tab with id: ${target.tabId}.`);
      if (state.scanDelay) await new Promise((r) => realSetTimeout(r, state.scanDelay));
      if (func.name === "scanTripInPage" && state.tripResult) return [{ result: structuredClone(state.tripResult) }];
      return [{ result: { ok: true, reviews: [], total: 0, channelHotelId: "555", snapshots: [] } }];
    },
  },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  state.fetched.push({ url: u, method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : "", at: Date.now() });
  if (u.endsWith("/ma-cai-dat.txt")) return new Response("", { status: 404 });
  if (u.includes("/api/extension/connection")) return json(state.mine);
  if (u.includes("/api/ingest/reviews")) {
    if (state.hubFail && init.body?.includes('"ingest"')) return json({ ok: false, error: "Hub chưa bật nhận review" }, 403);
    return json({ ok: true, inserted: 0, updated: 0, unchanged: 0, unmatched: 0, errors: [], rejected: [] });
  }
  return json({ ok: true });
};

const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...a) => realSetTimeout(fn, ms === 2500 ? 0 : ms, ...a);

await import("../extension/background.js");

function message(msg) {
  return new Promise((resolve) => {
    for (const fn of chrome.runtime.onMessage.fns) if (fn(msg, {}, resolve) === true) return;
    resolve(undefined);
  });
}

function fresh(extra = {}) {
  Object.assign(state, { store: machine(), fetched: [], created: [], closeOn: [], tripResult: null, hubFail: false, mine: MINE, scanDelay: 0, ...extra });
  tabs.clear();
  alarms.clear();
}

/** Cổng như hub-bridge.js mở từ một trang. `got` = mọi tin service worker gửi về. */
function connect(url = "https://hub.urbanb.vn/giao-ca", { frameId = 0, name = SCAN_PORT } = {}) {
  const got = [];
  const onMessage = event();
  const onDisconnect = event();
  const p = { disconnected: false, closedByPage: false };
  const port = {
    name,
    sender: { id: "urbanb", tab: { id: 99 }, frameId, url, origin: new URL(url).origin },
    postMessage: (m) => {
      if (p.closedByPage) throw new Error("Attempting to use a disconnected port object");
      got.push(structuredClone(m));
    },
    disconnect: () => {
      p.disconnected = true;
    },
    onMessage,
    onDisconnect,
  };
  chrome.runtime.onConnect.fire(port);
  return Object.assign(p, {
    got,
    send: (m) => onMessage.fire(m),
    scan: (requestId) => onMessage.fire({ type: MSG.scan, requestId }),
    close: () => {
      p.closedByPage = true;
      onDisconnect.fire(port);
    },
    results: () => got.filter((m) => m.type === MSG.result),
  });
}

async function until(pred, what) {
  for (let i = 0; i < 400; i++) {
    if (pred()) return;
    await new Promise((r) => realSetTimeout(r, 5));
  }
  assert.fail(`không xảy ra: ${what}`);
}
const settle = () => new Promise((r) => realSetTimeout(r, 40));
const byChannel = (result) => Object.fromEntries(result.channels.map((c) => [c.channel, c]));

// ---------- (a) ext:scan hợp lệ ⇒ tiến độ từng kênh + đúng một kết quả cùng requestId ----------

test("🔴 (a) ext:scan hợp lệ ⇒ mở lượt mọi kênh đang bật, tiến độ từng kênh, đúng một ext:scan-result cùng requestId", async () => {
  fresh({ tripResult: TRIP_OK });
  const page = connect();
  page.scan("rq-1");
  await until(() => page.results().length, "kết quả");
  await settle();
  assert.equal(page.results().length, 1, "đúng một kết quả");
  assert.ok(page.got.every((m) => m.requestId === "rq-1"), "mọi tin mang requestId của trang");
  assert.deepEqual(page.got[0], { type: MSG.accepted, requestId: "rq-1", mode: "started", startedAt: page.got[0].startedAt });
  const progress = page.got.filter((m) => m.type === MSG.progress).map((m) => `${m.channel}:${m.state}`);
  assert.deepEqual(progress, ["trip:running", "trip:ok", "go2joy:running", "go2joy:ok"]);
  const r = page.results()[0];
  assert.equal(r.outcome, OUTCOME.done);
  assert.equal(r.version, "1.5.4");
  assert.ok(Date.parse(r.startedAt) <= Date.parse(r.finishedAt));
  assert.deepEqual(r.channels.map((c) => [c.channel, c.state]), [["trip", "ok"], ["go2joy", "ok"]]);
  for (const c of r.channels) {
    assert.ok(Date.parse(c.startedAt) <= Date.parse(c.finishedAt), c.channel);
    assert.equal(c.code, null);
  }
  assert.deepEqual(r.channels.map((c) => c.count), [1, 0], "số bài đọc được của từng kênh");
  assert.equal(state.created.length, 2, "Trip và Go2Joy, mỗi kênh một tab");
  // Lượt giao ca gửi Hub như lượt người bấm (mã Hub đã biết), hợp đồng HTTP không đổi.
  const ingest = state.fetched.filter((f) => f.url.endsWith("/api/ingest/reviews") && f.body.includes('"ingest"'));
  assert.ok(ingest.length >= 1);
  assert.ok(ingest.every((f) => /"trigger":"manual"/.test(f.body)));
  // Kết quả tới trang sau lượt báo Hub: trang nhận kết quả thì Hub đã có trạng thái lượt này.
  assert.ok(state.fetched.some((f) => f.url.includes("/api/extension/connection") && f.method === "POST"), "đã báo sống sau lượt");
});

// ---------- (b) kênh lỗi ⇒ trạng thái lỗi và mã thật ----------

test("🔴 (b) kênh lỗi ⇒ kết quả mang state error và mã thật (không phải đạt), kênh khác vẫn đạt", async () => {
  fresh({ tripResult: { ok: false, error: `Trip báo lỗi HTTP 500 tại https://ebooking.trip.com/x?${SECRETS.query}` } });
  const page = connect();
  page.scan("rq-b");
  await until(() => page.results().length, "kết quả");
  const ch = byChannel(page.results()[0]);
  assert.equal(page.results()[0].outcome, OUTCOME.done);
  assert.equal(ch.trip.state, CHANNEL_STATE.error);
  assert.equal(ch.trip.code, "TRP-HTTP");
  assert.equal(ch.trip.code, state.store.status.trip.error.code, "đúng mã đã lưu và đã báo Hub");
  assert.match(ch.trip.ref, /^E-[2-9A-Z]{6}$/);
  assert.equal(ch.trip.ref, state.store.lastError.ref, "mã tham chiếu tra được ở lỗi gần nhất");
  assert.ok(ch.trip.what && ch.trip.steps.length, "có lời hướng dẫn");
  assert.equal(ch.go2joy.state, CHANNEL_STATE.ok);
  const prog = page.got.filter((m) => m.type === MSG.progress && m.channel === "trip").at(-1);
  assert.equal(prog.state, CHANNEL_STATE.error);
  assert.equal(prog.code, "TRP-HTTP");
});

test("🔴 (b) cần đăng nhập lại ⇒ state login, mã TRP-LOGIN", async () => {
  fresh();
  const realUpdate = chrome.tabs.update;
  chrome.tabs.update = async (id, { url }) => realUpdate(id, { url: url.includes("trip.com") ? "https://ebooking.trip.com/login/index" : url });
  try {
    const page = connect();
    page.scan("rq-login");
    await until(() => page.results().length, "kết quả");
    const ch = byChannel(page.results()[0]);
    assert.equal(ch.trip.state, CHANNEL_STATE.login);
    assert.equal(ch.trip.code, "TRP-LOGIN");
  } finally {
    chrome.tabs.update = realUpdate;
  }
});

test("🔴 (b) đọc được nhưng gửi Hub hỏng ⇒ với trang là lỗi (review chưa lên Hub), mã HUB-*", async () => {
  fresh({ hubFail: true, tripResult: TRIP_OK });
  const page = connect();
  page.scan("rq-hub");
  await until(() => page.results().length, "kết quả");
  const ch = byChannel(page.results()[0]);
  assert.equal(state.store.status.trip.state, "ok", "trạng thái máy vẫn như cũ: quét được");
  assert.equal(ch.trip.state, CHANNEL_STATE.error);
  assert.match(ch.trip.code, /^HUB-/);
});

// ---------- (c) chỉ trang Hub thật được ra lệnh ----------

test("🔴 (c) cổng từ gốc khác, khung con, tên cổng khác ⇒ không quét", async () => {
  fresh();
  const evil = connect("https://evil.example/giao-ca");
  evil.scan("rq-c1");
  const lookalike = connect("https://hub.urbanb.vn.evil.example/");
  lookalike.scan("rq-c2");
  const http = connect("http://hub.urbanb.vn/giao-ca");
  http.scan("rq-c3");
  const frame = connect("https://hub.urbanb.vn/giao-ca", { frameId: 3 });
  frame.scan("rq-c4");
  const other = connect("https://hub.urbanb.vn/giao-ca", { name: "khac" });
  other.scan("rq-c5");
  await settle();
  assert.equal(state.created.length, 0, "không mở tab nào");
  for (const p of [evil, lookalike, http, frame]) {
    assert.equal(p.disconnected, true, "cổng bị ngắt");
    assert.equal(p.got.length, 0);
  }
  assert.equal(other.got.length, 0);
});

test("🔴 (c) trên trang Hub thật: tin kiểu khác hay requestId sai ⇒ không quét", async () => {
  fresh();
  const page = connect();
  page.send({ type: "ext:hello", requestId: "rq-x" });
  page.send({ type: "scanNow", requestId: "rq-x" });
  for (const bad of [undefined, 123, "", "a b", "x".repeat(REQUEST_ID_MAX + 1), "<script>", { id: 1 }]) page.scan(bad);
  await settle();
  assert.equal(state.created.length, 0);
  assert.equal(page.got.length, 0);
});

// ---------- (d) không mở lượt thứ hai ----------

test("🔴 (d) đang có lượt mọi kênh (Quét review ngay) ⇒ gắn trang vào lượt ấy, không mở lượt thứ hai", async () => {
  fresh({ scanDelay: 20 });
  const popup = message({ type: "scanNow" });
  await until(() => state.created.length === 1, "lượt bấm tay đã mở tab đầu");
  const page = connect();
  page.scan("rq-d");
  await popup;
  await until(() => page.results().length, "kết quả");
  assert.equal(state.created.length, 2, "chỉ một lượt: hai kênh, hai tab");
  assert.equal(page.got[0].mode, "joined");
  const r = page.results()[0];
  assert.equal(r.outcome, OUTCOME.done);
  assert.deepEqual(r.channels.map((c) => [c.channel, c.state]), [["trip", "ok"], ["go2joy", "ok"]]);
  // Kênh đã bắt đầu trước lúc gắn vẫn có tiến độ (gửi lại lúc gắn).
  assert.ok(page.got.some((m) => m.type === MSG.progress && m.channel === "trip"));
});

test("🔴 (d) hai trang (hai requestId) bấm cùng lúc ⇒ một lượt, mỗi requestId đúng một kết quả", async () => {
  fresh({ scanDelay: 10 });
  const a = connect();
  const b = connect("https://urbanb.xyz/giao-ca");
  a.scan("rq-a");
  b.scan("rq-b2");
  a.scan("rq-a"); // bấm lại cùng requestId: bỏ qua
  await until(() => a.results().length && b.results().length, "hai kết quả");
  await settle();
  assert.equal(state.created.length, 2);
  assert.equal(a.results().length, 1);
  assert.equal(b.results().length, 1);
  assert.equal(b.got[0].mode, "joined");
  assert.equal(a.results()[0].startedAt, b.results()[0].startedAt, "cùng một lượt");
});

test("🔴 (d) đang có lượt một kênh (Quét lại kênh này) ⇒ chờ nó xong rồi mới mở lượt mọi kênh, không chạy chồng", async () => {
  fresh({ scanDelay: 120 });
  const one = message({ type: "scanChannel", channel: "go2joy" });
  await until(() => state.created.length === 1, "lượt một kênh đã mở tab");
  const page = connect();
  page.scan("rq-q");
  await new Promise((r) => realSetTimeout(r, 20));
  assert.deepEqual(page.got.map((m) => m.type), [MSG.accepted]);
  assert.equal(page.got[0].mode, "queued");
  assert.equal(page.got[0].startedAt, null);
  assert.deepEqual(await one, { ok: true });
  await until(() => page.results().length, "kết quả");
  const accepted = page.got.filter((m) => m.type === MSG.accepted).map((m) => m.mode);
  assert.deepEqual(accepted, ["queued", "started"]);
  assert.equal(state.created.length, 3, "một tab của lượt một kênh, rồi hai tab của lượt giao ca");
  assert.deepEqual(page.results()[0].channels.map((c) => c.channel), ["trip", "go2joy"]);
  assert.equal(await message({ type: "scanNow" }).then((r) => r.ok), true, "xong rồi thì lượt mới vẫn mở được");
});

// ---------- (e) tab bị đóng ⇒ TAB ngay ----------

test("🔴 (e) tab bị đóng ⇒ kết quả báo TRP-TAB ngay, không chờ 2 phút; lần đọc lại của 1.5.3 vẫn hẹn", async () => {
  fresh({ closeOn: ["ebooking.trip.com"] });
  const page = connect();
  const t0 = Date.now();
  page.scan("rq-e");
  await until(() => page.results().length, "kết quả");
  const ch = byChannel(page.results()[0]);
  assert.equal(ch.trip.state, CHANNEL_STATE.error);
  assert.equal(ch.trip.code, "TRP-TAB");
  assert.ok(Date.now() - t0 < 10_000, "không chờ lần đọc lại");
  assert.ok(Date.parse(page.results()[0].finishedAt) < Date.parse(ch.trip.retryAt), "kết quả tới trước giờ đọc lại");
  assert.equal(ch.trip.retryAt, state.store.tabRetry.trip.retryAt, "giờ đọc lại đúng giờ máy đã hẹn");
  assert.ok(alarms.has(retryAlarmName("trip")), "lần đọc lại vẫn hẹn");
  assert.match(ch.trip.what, /bị đóng/);
  assert.doesNotMatch(ch.trip.why, /đã tự đọc lại/, "không dùng lời của lần đọc lại hỏng");
  assert.equal(ch.go2joy.state, CHANNEL_STATE.ok);
  assert.equal("lastError" in state.store, false, "hành vi 1.5.3 giữ nguyên: lần đóng đầu chưa thành lỗi gần nhất");
});

// ---------- Trang đóng giữa chừng ----------

test("🔴 trang đóng giữa chừng ⇒ lượt quét vẫn chạy hết, vẫn gửi Hub, không ném", async () => {
  fresh({ scanDelay: 15, tripResult: TRIP_OK });
  const page = connect();
  page.scan("rq-close");
  await until(() => state.created.length === 1, "đã mở tab đầu");
  page.close();
  await until(() => state.store.status?.go2joy?.state === "ok", "kênh cuối xong");
  await until(() => state.fetched.at(-1)?.url.includes("/api/extension/connection"), "báo sống sau lượt");
  assert.equal(state.store.status.trip.state, "ok");
  assert.ok(state.fetched.some((f) => f.url.endsWith("/api/ingest/reviews") && f.body.includes('"ingest"')));
  assert.equal(page.results().length, 0, "trang đã đóng không nhận gì nữa");
  assert.equal(await message({ type: "scanNow" }).then((r) => r.ok), true, "lượt sau mở được: không kẹt cờ đang quét");
});

test("Máy chưa đủ cấu hình thu review ⇒ outcome not-configured, không quét, có lời hướng dẫn", async () => {
  fresh({ mine: { ...MINE, branches: [] } });
  state.store.config.hotel = "";
  const page = connect();
  page.scan("rq-cfg");
  await until(() => page.results().length, "kết quả");
  const r = page.results()[0];
  assert.equal(r.outcome, OUTCOME.notConfigured);
  assert.deepEqual(r.channels, []);
  assert.ok(r.what && r.steps.length);
  assert.equal(state.created.length, 0);
});

// ---------- (f) không lộ bí mật ----------

test("🔴 (f) tin gửi trang không chứa token, mã bí mật, URL Sheet, email, mã kết nối OTA, câu lỗi thô", async () => {
  const all = [];
  for (const extra of [{}, { tripResult: { ok: false, error: `Trip báo lỗi HTTP 500 tại https://ebooking.trip.com/x?${SECRETS.query}` } }, { hubFail: true, tripResult: TRIP_OK }, { closeOn: ["ebooking.trip.com"] }]) {
    fresh(extra);
    const page = connect();
    page.scan("rq-f");
    await until(() => page.results().length, "kết quả");
    all.push(...page.got);
  }
  const text = JSON.stringify(all);
  for (const [name, value] of Object.entries(SECRETS)) assert.ok(!text.includes(value), `lộ ${name}`);
  assert.ok(!text.includes("ebooking.trip.com"), "không có URL trang kênh");
  const keys = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) keys.add(k), walk(x);
  };
  walk(all);
  for (const bad of ["token", "hubToken", "secret", "sheetUrl", "email", "otaSync", "url", "message", "detail", "hub", "deviceId"]) {
    assert.ok(!keys.has(bad), `có khoá ${bad}`);
  }
  // Danh sách khoá đóng: thêm khoá mới phải sửa hợp đồng (docs/hop-dong-hub-bridge.md) và test này.
  const allowed = new Set(["type", "requestId", "mode", "startedAt", "finishedAt", "outcome", "version", "channels", "channel", "label", "state", "count", "code", "ref", "retryAt", "what", "why", "steps"]);
  assert.deepEqual([...keys].filter((k) => !allowed.has(k)), []);
});

// ---------- Phần thuần ----------

test("parseRequestId: chỉ chuỗi ngắn [A-Za-z0-9_-]", () => {
  assert.equal(parseRequestId("abc-DEF_123"), "abc-DEF_123");
  assert.equal(parseRequestId("x".repeat(REQUEST_ID_MAX)), "x".repeat(REQUEST_ID_MAX));
  for (const bad of [null, undefined, 1, "", "x".repeat(REQUEST_ID_MAX + 1), "a/b", "a.b", "é"]) assert.equal(parseRequestId(bad), null, String(bad));
});

test("isHubSender: cần tab, khung chính, gốc nằm trong danh sách", () => {
  const ok = { tab: { id: 1 }, frameId: 0, origin: "https://hub.urbanb.vn" };
  assert.equal(isHubSender(ok, HUB_ORIGINS), true);
  assert.equal(isHubSender({ tab: { id: 1 }, frameId: 0, url: "https://urbanb.xyz/giao-ca" }, HUB_ORIGINS), true);
  assert.equal(isHubSender({ ...ok, tab: undefined }, HUB_ORIGINS), false, "popup, trang extension");
  assert.equal(isHubSender({ ...ok, frameId: 2 }, HUB_ORIGINS), false);
  assert.equal(isHubSender({ ...ok, origin: "https://evil.example" }, HUB_ORIGINS), false);
  assert.equal(isHubSender({ tab: { id: 1 }, frameId: 0, url: "không phải url" }, HUB_ORIGINS), false);
  assert.equal(isHubSender(undefined, HUB_ORIGINS), false);
});

test("joinMode: không có lượt ⇒ started; lượt mọi kênh ⇒ joined; lượt vài kênh ⇒ queued", () => {
  assert.equal(joinMode(false, null), "started");
  assert.equal(joinMode(true, { full: true }), "joined");
  assert.equal(joinMode(true, { full: false }), "queued");
});

test("createScanRun: gắn muộn vẫn nhận kênh đã xong; kết quả đúng một lần; lượt hỏng ⇒ kênh chưa tới là not-run", async () => {
  let t = 0;
  const run = createScanRun({ full: true, version: "1.5.4", labels: { trip: "Trip", go2joy: "Go2Joy" }, now: () => new Date(Date.UTC(2026, 9, 26, 3, 0, t++)).toISOString() });
  run.setChannels(["trip", "go2joy"]);
  run.channelStarted("trip");
  run.channelDone("trip", { status: { at: "x", state: "ok", count: 2, hub: { ok: true } } });
  run.channelStarted("go2joy");
  const late = [];
  run.subscribe((m) => late.push(m));
  assert.deepEqual(late.map((m) => `${m.channel}:${m.state}`), ["trip:ok", "go2joy:running"]);
  const r1 = run.finish({ outcome: OUTCOME.failed });
  const r2 = run.finish({ outcome: OUTCOME.done });
  assert.equal(r1, r2, "gọi lần hai trả lại kết quả cũ");
  assert.equal(late.filter((m) => m.type === MSG.result).length, 1);
  assert.deepEqual(r1.channels.map((c) => [c.channel, c.state]), [["trip", "ok"], ["go2joy", "not-run"]]);
  assert.equal(r1.channels[0].count, 2);
  assert.deepEqual(await run.done, r1);
  const after = [];
  run.subscribe((m) => after.push(m));
  assert.deepEqual(after, [r1], "gắn sau khi xong ⇒ nhận ngay kết quả");
});

// ---------- hub-bridge.js trong trang Hub giả ----------

function loadHubPage(href, { connectThrows = false } = {}) {
  const u = new URL(href);
  const posted = [];
  const listeners = [];
  const ports = [];
  const window = {
    addEventListener: (type, fn) => type === "message" && listeners.push(fn),
    postMessage: (data, origin) => posted.push({ data: structuredClone(data), origin }),
  };
  const document = { documentElement: { dataset: {} } };
  const location = { href, origin: u.origin, pathname: u.pathname };
  const chrome = {
    runtime: {
      lastError: undefined,
      getManifest: () => ({ version: "1.5.4" }),
      sendMessage: (msg, cb) => queueMicrotask(() => cb({ ok: true, status: { version: "1.5.4" } })),
      connect: ({ name }) => {
        if (connectThrows) throw new Error("Extension context invalidated.");
        const onMessage = event();
        const onDisconnect = event();
        const port = { name, sent: [], disconnected: false, onMessage, onDisconnect, postMessage: (m) => port.sent.push(m), disconnect: () => (port.disconnected = true) };
        ports.push(port);
        return port;
      },
    },
  };
  const ctx = { window, document, location, chrome, queueMicrotask, Promise, Set, Date };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../extension/hub-bridge.js", import.meta.url), "utf8"), ctx);
  const send = (data, { source = window, origin = u.origin } = {}) => listeners.forEach((fn) => fn({ source, origin, data }));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const scans = () => posted.filter((p) => p.data.type?.startsWith("ext:scan"));
  return { window, posted, ports, send, flush, scans };
}

const SCAN = (requestId) => ({ source: "urbanb-hub", type: "ext:scan", requestId });

test("🔴 (a) hub-bridge: ext:scan hợp lệ ⇒ mở cổng SCAN_PORT, chuyển lệnh, chuyển tiến độ và đúng một kết quả về trang", async () => {
  const p = loadHubPage("https://hub.urbanb.vn/giao-ca");
  await p.flush();
  p.send(SCAN("rq-1"));
  assert.equal(p.ports.length, 1);
  const port = p.ports[0];
  assert.equal(port.name, SCAN_PORT);
  assert.deepEqual(JSON.parse(JSON.stringify(port.sent)), [{ type: MSG.scan, requestId: "rq-1" }]);
  port.onMessage.fire({ type: MSG.accepted, requestId: "rq-1", mode: "started", startedAt: "t" });
  port.onMessage.fire({ type: MSG.progress, requestId: "rq-1", channel: "trip", state: "running" });
  port.onMessage.fire({ type: MSG.progress, requestId: "khac", channel: "trip", state: "ok" }); // requestId khác: bỏ
  port.onMessage.fire({ type: "ext:status", requestId: "rq-1", status: {} }); // kiểu lạ: bỏ
  port.onMessage.fire({ type: MSG.result, requestId: "rq-1", outcome: "done", channels: [] });
  port.onMessage.fire({ type: MSG.result, requestId: "rq-1", outcome: "done", channels: [] }); // lần hai: bỏ
  port.onDisconnect.fire(port); // ngắt sau kết quả: không thêm kết quả "interrupted"
  const got = p.scans();
  assert.deepEqual(got.map((x) => x.data.type), [MSG.accepted, MSG.progress, MSG.result]);
  assert.ok(got.every((x) => x.origin === "https://hub.urbanb.vn" && x.data.source === "urbanb-ext" && x.data.requestId === "rq-1"));
  assert.equal(port.disconnected, true, "có kết quả thì đóng cổng");
});

test("🔴 (c) hub-bridge: khung khác, gốc khác, nguồn khác, requestId sai ⇒ không mở cổng", async () => {
  const p = loadHubPage("https://hub.urbanb.vn/giao-ca");
  await p.flush();
  p.send(SCAN("rq-1"), { source: {} });
  p.send(SCAN("rq-1"), { origin: "https://evil.example" });
  p.send({ ...SCAN("rq-1"), source: "urbanb-ext" });
  p.send({ ...SCAN("rq-1"), source: "khac" });
  for (const bad of [undefined, 5, "", "a b", "x".repeat(REQUEST_ID_MAX + 1)]) p.send(SCAN(bad));
  await p.flush();
  assert.equal(p.ports.length, 0);
  assert.equal(p.scans().length, 0);
});

test("hub-bridge: bấm lại cùng requestId khi đang chờ ⇒ không mở cổng thứ hai; xong rồi thì dùng lại được", async () => {
  const p = loadHubPage("https://hub.urbanb.vn/giao-ca");
  p.send(SCAN("rq-1"));
  p.send(SCAN("rq-1"));
  assert.equal(p.ports.length, 1);
  p.ports[0].onMessage.fire({ type: MSG.result, requestId: "rq-1", outcome: "done", channels: [] });
  p.send(SCAN("rq-1"));
  assert.equal(p.ports.length, 2);
});

test("🔴 hub-bridge: mất kết nối trước khi có kết quả (extension nạp lại) ⇒ đúng một kết quả interrupted", async () => {
  const p = loadHubPage("https://hub.urbanb.vn/giao-ca");
  p.send(SCAN("rq-lost"));
  p.ports[0].onDisconnect.fire(p.ports[0]);
  p.ports[0].onDisconnect.fire(p.ports[0]);
  const res = p.scans().filter((x) => x.data.type === MSG.result);
  assert.equal(res.length, 1);
  assert.equal(res[0].data.outcome, OUTCOME.interrupted);
  assert.equal(res[0].data.requestId, "rq-lost");
  assert.deepEqual(res[0].data.channels, []);
  const q = loadHubPage("https://hub.urbanb.vn/giao-ca", { connectThrows: true });
  q.send(SCAN("rq-x"));
  assert.deepEqual(q.scans().map((x) => x.data.outcome), [OUTCOME.interrupted]);
});

test("🔴 (g) ext:hello vẫn như cũ: trả ext:status đúng dạng, không mở cổng quét", async () => {
  const p = loadHubPage("https://hub.urbanb.vn/extension");
  await p.flush();
  p.send({ source: "urbanb-hub", type: "ext:hello" });
  await p.flush();
  assert.equal(p.ports.length, 0);
  assert.equal(p.posted.length, 2, "một lần lúc nạp, một lần trả ext:hello");
  for (const x of p.posted) {
    assert.deepEqual(x.data, { source: "urbanb-ext", type: "ext:status", status: { version: "1.5.4" } });
    assert.equal(x.origin, "https://hub.urbanb.vn");
  }
});

test("Hằng trong hub-bridge.js khớp shift-scan.js (content script không nhập được module)", () => {
  const src = readFileSync(new URL("../extension/hub-bridge.js", import.meta.url), "utf8");
  assert.match(src, new RegExp(`const SCAN_PORT = "${SCAN_PORT}";`));
  assert.match(src, new RegExp(`\\{1,${REQUEST_ID_MAX}\\}\\$/;`));
  for (const t of Object.values(MSG).filter((x) => x !== MSG.scan)) assert.ok(src.includes(`"${t}"`), t);
});
