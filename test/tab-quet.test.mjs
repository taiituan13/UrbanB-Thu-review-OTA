// YC-238 · H-1972 a, H-1973 a — tab nền mà máy tự mở để đọc review: nhóm tab có tên, dải chữ trên trang, lỡ
// đóng giữa chừng thì đọc lại một lần sau 2 phút. Chạy thật background.js với `chrome` và `fetch` giả.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BANNER_TEXT, SCAN_GROUP, channelOfRetryAlarm, closedOutcome, pickScanGroup, retryAlarmName, showScanBanner } from "../extension/tab-scan.js";

// Lời đáp scope=mine của Hub: một chi nhánh, bật Trip và Go2Joy.
const MINE = {
  ok: true,
  branches: [{ id: "br_pct", name: "Phạm Công Trứ", code: "PCT", ezcloudHotelId: 1234, otaSync: null, reviewIds: { booking: null, agoda: null, expedia: null } }],
  reviewCollect: { enabled: { booking: false, agoda: false, trip: true, expedia: false, traveloka: false, go2joy: true }, intervalHours: 6 },
  reviewSheetReason: null,
};

const machine = () => ({ config: { hotel: "Tên máy", enabled: { trip: true, go2joy: true } }, hubCollect: { at: 1 }, deviceId: "dev-test" });

const state = { store: {}, fetched: [], scripts: [], created: [], groups: [], closeOn: [], groupApi: "ok", bannerApi: "ok", tripResult: null };

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
const onAlarm = event();

globalThis.chrome = {
  storage: { local: area(() => state.store), session: area(() => session), onChanged: event() },
  alarms: {
    create: async (name, info) => void alarms.set(name, { name, ...info }),
    clear: async (name) => alarms.delete(name),
    get: async (name) => alarms.get(name),
    getAll: async () => [...alarms.values()],
    onAlarm,
  },
  runtime: {
    onInstalled: event(),
    onStartup: event(),
    onMessage: event(),
    onConnect: event(), // YC-239: cổng quét của trang Giao ca quầy (hub-bridge.js)
    lastError: undefined,
    getURL: (p) => `chrome-extension://urbanb/${p}`,
    getManifest: () => ({ version: "1.5.3" }),
    getPlatformInfo: (cb) => cb?.({}),
    reload: () => {},
    sendMessage: async () => {},
  },
  tabs: {
    create: async (props) => {
      const t = { id: nextTab++, url: props.url, status: "complete", windowId: 7, groupId: -1 };
      state.created.push({ ...props });
      tabs.set(t.id, t);
      return { ...t };
    },
    update: async (id, { url }) => {
      if (!tabs.has(id)) throw new Error(`No tab with id: ${id}.`);
      tabs.get(id).url = url;
      // Người ở quầy đóng tab lúc trang đang tải (ca BKG-TAB 26/10/2026).
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
    group: async ({ groupId, tabIds, createProperties }) => {
      if (state.groupApi === "throw") throw new Error("Tabs cannot be edited right now (user may be dragging a tab).");
      let g = state.groups.find((x) => x.id === groupId);
      if (groupId != null && !g) throw new Error(`No group with id: ${groupId}.`);
      if (!g) {
        g = { id: nextGroup++, title: "", color: "grey", windowId: createProperties?.windowId };
        state.groups.push(g);
      }
      for (const id of [].concat(tabIds)) tabs.get(id).groupId = g.id;
      return g.id;
    },
    query: async () => [],
    sendMessage: async () => {},
    onUpdated: tabUpdated,
    onRemoved: tabRemoved,
  },
  tabGroups: {
    query: async ({ title }) => {
      if (state.groupApi === "throw") throw new Error("Grouping is not supported by tabs in this window.");
      // Nhóm không còn tab nào thì Chrome tự bỏ nhóm.
      return state.groups.filter((g) => g.title === title && [...tabs.values()].some((t) => t.groupId === g.id)).map((g) => ({ ...g }));
    },
    update: async (id, props) => Object.assign(state.groups.find((g) => g.id === id), props),
  },
  scripting: {
    executeScript: async ({ target, func, args }) => {
      state.scripts.push({ tabId: target.tabId, func: func.name, args, url: tabs.get(target.tabId)?.url });
      if (func === showScanBanner) {
        if (state.bannerApi === "throw") throw new Error("Cannot access contents of the page. Extension manifest must request permission to access the respective host.");
        return [{ result: true }];
      }
      if (!tabs.has(target.tabId)) throw new Error(`No tab with id: ${target.tabId}.`);
      if (func.name === state.closeDuringScan) {
        // Tab bị đóng lúc bộ quét đang chạy trong trang: Chrome trả kết quả rỗng, không ném.
        state.closeDuringScan = null;
        tabs.delete(target.tabId);
        tabRemoved.fire(target.tabId, {});
        return [{ result: undefined }];
      }
      if (func.name === "scanTripInPage" && state.tripResult) return [{ result: state.tripResult }];
      return [{ result: { ok: true, reviews: [], total: 0, channelHotelId: "555", snapshots: [] } }];
    },
  },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  state.fetched.push({ url: u, method: init.method ?? "GET", body: typeof init.body === "string" ? init.body : "" });
  if (u.endsWith("/ma-cai-dat.txt")) return new Response("", { status: 404 });
  if (u.includes("/api/extension/connection")) return json(MINE);
  if (u.includes("/api/ingest/reviews")) return json({ ok: true, inserted: 0, updated: 0, unchanged: 0, unmatched: 0, errors: [], rejected: [] });
  return json({ ok: true });
};

// Lượt mở trang của background.js chờ 2,5 giây cho trang tự chuyển hướng; trong test thì khỏi chờ.
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
  Object.assign(state, { store: machine(), fetched: [], scripts: [], created: [], groups: [], closeOn: [], groupApi: "ok", bannerApi: "ok", tripResult: null, closeDuringScan: null, ...extra });
  tabs.clear();
  alarms.clear();
}

// ---------- ① Nhóm tab + dải chữ ----------

test("🔴 ① tab quét vào nhóm 'Urban B · đang đọc review'; hai kênh nối nhau dùng chung một nhóm", async () => {
  fresh();
  assert.deepEqual(await message({ type: "scanNow" }), { ok: true });
  assert.equal(state.created.length, 2, "Trip và Go2Joy, mỗi kênh một tab");
  assert.ok(state.created.every((c) => c.active === false), "tab vẫn mở nền, không giật tiêu điểm");
  assert.equal(state.groups.length, 1, "kênh thứ hai phải vào nhóm của kênh thứ nhất, không đẻ nhóm mới");
  assert.equal(state.groups[0].title, SCAN_GROUP.title);
  assert.equal(state.groups[0].color, SCAN_GROUP.color);
  assert.equal(state.groups[0].windowId, 7, "nhóm nằm trong cửa sổ của tab quét");
  assert.equal(tabs.size, 0, "xong lượt quét thì mọi tab quét đã đóng");
  assert.equal(state.store.status.trip.state, "ok");
  assert.equal(state.store.status.go2joy.state, "ok");
});

test("🔴 ① dải chữ được chèn vào mỗi trang vừa tải, trước khi bộ quét chạy", async () => {
  fresh();
  await message({ type: "scanChannel", channel: "trip" });
  const banners = state.scripts.filter((s) => s.func === "showScanBanner");
  assert.equal(banners.length, 1);
  assert.deepEqual(banners[0].args, [BANNER_TEXT]);
  assert.match(banners[0].url, /ebooking\.trip\.com/);
  const order = state.scripts.map((s) => s.func);
  assert.ok(order.indexOf("showScanBanner") < order.indexOf("scanTripInPage"), order.join(","));
});

test("🔴 (e) API nhóm tab lỗi và chèn dải chữ lỗi ⇒ lượt quét vẫn chạy, kênh ok", async () => {
  fresh({ groupApi: "throw", bannerApi: "throw" });
  assert.deepEqual(await message({ type: "scanNow" }), { ok: true });
  assert.equal(state.groups.length, 0);
  assert.equal(state.store.status.trip.state, "ok");
  assert.equal(state.store.status.go2joy.state, "ok");
  assert.ok(state.scripts.some((s) => s.func === "scanGo2joyInPage"));
  assert.equal(tabs.size, 0);
});

test("pickScanGroup: chỉ lấy nhóm cùng tên trong đúng cửa sổ", () => {
  const groups = [
    { id: 1, title: SCAN_GROUP.title, windowId: 3 },
    { id: 2, title: "Nhóm của lễ tân", windowId: 7 },
    { id: 4, title: SCAN_GROUP.title, windowId: 7 },
  ];
  assert.equal(pickScanGroup(groups, 7), 4);
  assert.equal(pickScanGroup(groups, 9), null);
  assert.equal(pickScanGroup(undefined, 7), null);
});

test("🔴 showScanBanner: cố định đầu trang, không bắt chuột, gọi lại không thêm dải thứ hai", () => {
  const nodes = [];
  globalThis.document = {
    getElementById: (id) => nodes.find((n) => n.id === id) ?? null,
    createElement: () => ({ style: {}, setAttribute() {} }),
    documentElement: { appendChild: (n) => nodes.push(n) },
  };
  try {
    assert.equal(showScanBanner(BANNER_TEXT), true);
    assert.equal(showScanBanner(BANNER_TEXT), true);
    assert.equal(nodes.length, 1);
    const css = nodes[0].style.cssText;
    assert.match(css, /position:fixed/);
    assert.match(css, /top:0/);
    assert.match(css, /pointer-events:none/);
    assert.equal(nodes[0].textContent, BANNER_TEXT);
  } finally {
    delete globalThis.document;
  }
});

test("manifest xin quyền tabGroups", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.permissions.includes("tabGroups"));
});

test("tên báo thức đọc lại đi hai chiều", () => {
  assert.equal(channelOfRetryAlarm(retryAlarmName("booking")), "booking");
  assert.equal(channelOfRetryAlarm("scan"), null);
  assert.equal(channelOfRetryAlarm("tabRetry:"), null);
});

test("closedOutcome: lần đóng đầu hẹn đọc lại sau 2 phút; đã là lần đọc lại hay lỗi khác thì không", () => {
  const now = Date.parse("2026-10-26T03:17:00.000Z");
  assert.deepEqual(closedOutcome({ closed: true, pending: null, now }), {
    retry: { closedAt: "2026-10-26T03:17:00.000Z", retryAt: "2026-10-26T03:19:00.000Z" },
  });
  assert.deepEqual(closedOutcome({ closed: true, pending: { retryAt: "x" }, now }), { retry: null });
  assert.deepEqual(closedOutcome({ closed: false, pending: null, now }), { retry: null });
});

// ---------- ② Bị đóng giữa chừng ⇒ đọc lại một lần sau 2 phút ----------

const OLD_OK = { at: "2026-10-26T01:00:00.000Z", okAt: "2026-10-26T01:00:00.000Z", state: "ok", count: 3, message: "", error: null, hub: { ok: true } };

/** Chờ việc chạy nền (báo thức không trả lời hứa) xong. */
async function until(pred, what) {
  for (let i = 0; i < 200; i++) {
    if (pred()) return;
    await new Promise((r) => realSetTimeout(r, 5));
  }
  assert.fail(`không xảy ra: ${what}`);
}

/** Báo thức đọc lại kêu; chờ lượt đọc lại xong (kênh hết chờ hoặc được hẹn lại). */
async function fireRetry(channel) {
  const before = JSON.stringify(state.store.tabRetry ?? {});
  onAlarm.fire({ name: retryAlarmName(channel) });
  await until(() => JSON.stringify(state.store.tabRetry ?? {}) !== before, "lượt đọc lại xong");
  await until(() => !state.fetched.length || state.fetched.at(-1).url.includes("/api/extension/connection"), "báo sống sau lượt");
}

const tabsOf = (host) => state.scripts.filter((s) => String(s.url).includes(host)).map((s) => s.tabId);

test("🔴 (a) tab bị đóng lần đầu ⇒ kênh không đỏ, ghi chờ đọc lại và hẹn báo thức sau đúng 2 phút", async () => {
  fresh({ closeOn: ["ebooking.trip.com"] });
  state.store.status = { trip: OLD_OK };
  const t0 = Date.now();
  assert.deepEqual(await message({ type: "scanNow" }), { ok: true });
  assert.deepEqual(state.store.status.trip, OLD_OK, "kênh giữ nguyên kết quả cũ, chưa đỏ");
  assert.equal(state.store.status.go2joy.state, "ok", "kênh khác vẫn đọc tiếp");
  assert.equal("lastError" in state.store, false, "chưa thành lỗi gần nhất");
  const pending = state.store.tabRetry.trip;
  assert.equal(Date.parse(pending.retryAt) - Date.parse(pending.closedAt), 2 * 60000);
  assert.ok(Date.parse(pending.closedAt) >= t0 - 5);
  const alarm = alarms.get(retryAlarmName("trip"));
  assert.equal(alarm.when, Date.parse(pending.retryAt));
  assert.equal(alarm.periodInMinutes, undefined, "báo thức một lần, không lặp");
});

test("🔴 (b)(d) lần đọc lại cũng bị đóng ⇒ đỏ TAB như cũ, không hẹn đọc lại lần nữa", async () => {
  fresh({ closeOn: ["ebooking.trip.com"] });
  state.store.status = { trip: OLD_OK };
  await message({ type: "scanChannel", channel: "trip" });
  assert.ok(state.store.tabRetry.trip);
  state.closeOn = ["ebooking.trip.com"];
  state.created = [];
  await fireRetry("trip");
  assert.equal(state.created.length, 1, "lần đọc lại chỉ mở một tab, cho riêng kênh ấy");
  assert.equal(tabsOf("go2joy").length, 0, "lần đọc lại chỉ quét kênh ấy");
  const trip = state.store.status.trip;
  assert.equal(trip.state, "error");
  assert.equal(trip.error.code, "TRP-TAB");
  assert.equal(trip.okAt, OLD_OK.okAt, "giữ giờ quét ổn cũ");
  assert.equal(state.store.lastError.code, "TRP-TAB");
  assert.deepEqual(state.store.tabRetry, {}, "hết chờ đọc lại");
  assert.equal(alarms.has(retryAlarmName("trip")), false, "không còn báo thức đọc lại: chỉ đọc lại một lần");
});

// Bài Trip giả (dạng trường như test/normalize.test.mjs), không phải review thật.
const TRIP_REVIEW = { commentId: 3001, userName: "C", addtime: "/Date(1791227994000+0800)/", content: "Nice", score: { avgScore: 9, maxScore: 10, subScores: [] } };

test("🔴 (c) đọc lại đạt ⇒ kênh ok, hết chờ đọc lại", async () => {
  fresh({ closeOn: ["ebooking.trip.com"], tripResult: { ok: true, reviews: [TRIP_REVIEW], total: 1, channelHotelId: "555", snapshots: [] } });
  await message({ type: "scanChannel", channel: "trip" });
  assert.equal(state.store.status?.trip, undefined);
  await fireRetry("trip");
  assert.equal(state.store.status.trip.state, "ok");
  assert.equal(state.store.status.trip.count, 1);
  assert.deepEqual(state.store.tabRetry, {});
  assert.equal(alarms.has(retryAlarmName("trip")), false);
  // Hợp đồng Hub không đổi: lượt đọc lại gửi như lượt hẹn giờ, không mang trường mới.
  const ingest = state.fetched.filter((f) => f.url.endsWith("/api/ingest/reviews") && f.body.includes('"ingest"'));
  assert.ok(ingest.length >= 1);
  assert.match(ingest.at(-1).body, /"trigger":"schedule"/);
  assert.ok(!state.fetched.some((f) => /tabRetry|retryAt|closedAt/.test(f.body)), "không gửi trạng thái chờ đọc lại lên Hub");
});

test("🔴 (d) lượt quét thường đọc được kênh trước giờ hẹn ⇒ báo thức tới nơi không đọc lại nữa", async () => {
  fresh({ closeOn: ["ebooking.trip.com"] });
  await message({ type: "scanChannel", channel: "trip" });
  // Lượt bấm tay trước giờ hẹn: chính là lần đọc lại.
  await message({ type: "scanChannel", channel: "trip" });
  assert.equal(state.store.status.trip.state, "ok");
  assert.deepEqual(state.store.tabRetry, {});
  assert.equal(alarms.has(retryAlarmName("trip")), false);
  state.created = [];
  onAlarm.fire({ name: retryAlarmName("trip") });
  await new Promise((r) => realSetTimeout(r, 30));
  assert.equal(state.created.length, 0, "báo thức cũ (nếu còn) không mở tab");
});

test("🔴 (d) lượt quét thường bị đóng tab lần nữa trong lúc chờ ⇒ đó là lần thứ hai, đỏ TAB", async () => {
  fresh({ closeOn: ["ebooking.trip.com", "ebooking.trip.com"] });
  await message({ type: "scanChannel", channel: "trip" });
  await message({ type: "scanChannel", channel: "trip" });
  assert.equal(state.store.status.trip.error.code, "TRP-TAB");
  assert.deepEqual(state.store.tabRetry, {});
  assert.equal(alarms.has(retryAlarmName("trip")), false);
});

test("🔴 (a) tab bị đóng lúc bộ quét đang chạy (câu lỗi ra 'chuyển sang trang khác') ⇒ vẫn là tab bị đóng, hẹn đọc lại", async () => {
  fresh({ closeDuringScan: "scanTripInPage" });
  await message({ type: "scanChannel", channel: "trip" });
  assert.equal(state.store.status?.trip, undefined, "chưa đỏ");
  assert.ok(state.store.tabRetry.trip);
  // Lần đọc lại cũng bị đóng như vậy ⇒ đỏ mã TAB, không phải PAGE.
  state.closeDuringScan = "scanTripInPage";
  await fireRetry("trip");
  assert.equal(state.store.status.trip.error.code, "TRP-TAB");
});

test("🔴 (f) lỗi không phải TAB ⇒ đỏ ngay, không hẹn đọc lại", async () => {
  fresh({ tripResult: { ok: false, error: "Trip báo lỗi HTTP 500" } });
  await message({ type: "scanChannel", channel: "trip" });
  assert.equal(state.store.status.trip.state, "error");
  assert.notEqual(state.store.status.trip.error.code, "TRP-TAB");
  assert.equal(state.store.tabRetry, undefined);
  assert.equal(alarms.has(retryAlarmName("trip")), false);
});

test("🔴 (f) cần đăng nhập lại ⇒ không hẹn đọc lại", async () => {
  fresh();
  const realUpdate = chrome.tabs.update;
  chrome.tabs.update = async (id, { url }) => realUpdate(id, { url: url.includes("trip.com") ? "https://ebooking.trip.com/login/index" : url });
  try {
    await message({ type: "scanChannel", channel: "trip" });
  } finally {
    chrome.tabs.update = realUpdate;
  }
  assert.equal(state.store.status.trip.state, "login");
  assert.equal(state.store.tabRetry, undefined);
});

test("tới giờ đọc lại mà đang có lượt quét khác chạy ⇒ lùi một phút, vẫn còn chờ đọc lại", async () => {
  fresh({ closeOn: ["ebooking.trip.com"] });
  await message({ type: "scanChannel", channel: "trip" });
  const first = state.store.tabRetry.trip;
  const busy = message({ type: "scanChannel", channel: "go2joy" });
  onAlarm.fire({ name: retryAlarmName("trip") });
  await until(() => state.store.tabRetry?.trip?.retryAt !== first.retryAt, "hẹn lại");
  await busy;
  const again = state.store.tabRetry.trip;
  assert.equal(again.closedAt, first.closedAt);
  assert.ok(Date.parse(again.retryAt) - Date.now() <= 60000 && Date.parse(again.retryAt) - Date.now() > 50000);
  assert.equal(alarms.get(retryAlarmName("trip")).when, Date.parse(again.retryAt));
});

test("nạp lại extension (báo thức mất) ⇒ kênh còn chờ được hẹn lại", async () => {
  fresh();
  state.store.tabRetry = { trip: { closedAt: "2026-10-26T03:17:00.000Z", retryAt: "2026-10-26T03:19:00.000Z" } };
  await Promise.all(chrome.runtime.onInstalled.fire({ reason: "update" }));
  const alarm = alarms.get(retryAlarmName("trip"));
  assert.ok(alarm, "có báo thức đọc lại");
  assert.ok(alarm.when > Date.now(), "giờ hẹn đã qua ⇒ đọc lại sớm, không hẹn vào quá khứ");
  assert.equal(state.store.tabRetry.trip.retryAt, new Date(alarm.when).toISOString());
});

// ---------- ③ Khung quầy trên PMS báo một dòng ----------

const { reviewStatusModel, hubChannels, tabRetryText, TAB_RETRY_KEY } = await import("../extension/quay/review-status.js");
const { reviewBlockHTML, reviewProblemCount } = await import("../extension/quay/review-ui.js");
const { classifyError } = await import("../extension/report.js");

const NOW = new Date("2026-10-26T03:17:30.000Z"); // 10:17:30 giờ Việt Nam
const RETRY = { trip: { closedAt: "2026-10-26T03:17:00.000Z", retryAt: "2026-10-26T03:19:00.000Z" } };
const base = { order: ["booking", "trip"], enabled: { booking: true, trip: true }, labels: { booking: "Booking", trip: "Trip" }, missing: null };

test("🔴 ③ tab quét bị đóng ⇒ khung quầy báo một dòng: kênh nào, đọc lại lúc mấy giờ; không tính là lỗi", () => {
  const m = reviewStatusModel({ ...base, status: { booking: OLD_OK, trip: OLD_OK }, retries: RETRY });
  assert.deepEqual(m.retries, [{ key: "trip", label: "Trip", closedAt: RETRY.trip.closedAt, retryAt: RETRY.trip.retryAt }]);
  assert.equal(m.state, "ok");
  assert.equal(m.bad, 0);
  assert.equal(reviewProblemCount(m), 0, "chờ đọc lại không phải việc lễ tân phải xử lý");
  assert.equal(tabRetryText(m.retries[0], NOW), "Bạn vừa đóng tab Trip lúc máy đang đọc review. Máy sẽ đọc lại lúc 10:19.");
  const html = reviewBlockHTML(m, { now: NOW });
  assert.match(html, /class="qban warn rv-retry"[^>]*>Bạn vừa đóng tab Trip lúc máy đang đọc review\. Máy sẽ đọc lại lúc 10:19\.</);
  // Kênh đang lỗi khác: dòng vẫn hiện trên đầu khối.
  const bad = reviewStatusModel({ ...base, status: { booking: { ...OLD_OK, state: "error", error: { code: "BKG-HTTP" } }, trip: OLD_OK }, retries: RETRY });
  assert.match(reviewBlockHTML(bad, { now: NOW }), /^<div class="qban warn rv-retry"/);
  // Đọc lại xong ⇒ `tabRetry` rỗng ⇒ dòng tự hết.
  assert.doesNotMatch(reviewBlockHTML(reviewStatusModel({ ...base, status: { trip: OLD_OK }, retries: {} }), { now: NOW }), /rv-retry/);
  // Kênh đã tắt thì không báo.
  assert.deepEqual(reviewStatusModel({ ...base, enabled: { booking: true }, status: {}, retries: RETRY }).retries, []);
});

test("tabRetryText: tới giờ mà chưa đọc xong ⇒ báo máy đang đọc lại", () => {
  assert.equal(
    tabRetryText({ label: "Booking", retryAt: "2026-10-26T03:19:00.000Z" }, new Date("2026-10-26T03:19:05.000Z")),
    "Bạn vừa đóng tab Booking lúc máy đang đọc review. Máy đang đọc lại kênh này.",
  );
});

test("🔴 hợp đồng Hub không đổi: chờ đọc lại không lọt vào kênh gửi Hub", () => {
  const withRetry = reviewStatusModel({ ...base, status: { trip: OLD_OK }, retries: RETRY });
  const without = reviewStatusModel({ ...base, status: { trip: OLD_OK } });
  assert.deepEqual(hubChannels(withRetry), hubChannels(without));
});

test("🔴 ③ quay:review trả kênh chờ đọc lại ngay sau khi tab bị đóng", async () => {
  fresh({ closeOn: ["ebooking.trip.com"] });
  await message({ type: "scanChannel", channel: "trip" });
  const r = await message({ type: "quay:review" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.model.retries.map((x) => x.key), ["trip"]);
  assert.equal(r.model.retries[0].retryAt, state.store[TAB_RETRY_KEY].trip.retryAt);
});

test("🔴 ③ khung quầy vẽ lại khi `tabRetry` đổi, và báo một dòng cả lúc khung đang gập", () => {
  const ui = readFileSync(new URL("../extension/quay/ui.js", import.meta.url), "utf8");
  assert.match(ui, /changes\.status \|\| changes\[TAB_RETRY_KEY\]/);
  assert.match(ui, /S\.note = \{ tone: "warn", text: fresh\.map\(\(x\) => tabRetryText\(x\)\)/);
});

test("🔴 ③ lời giải thích mã TAB khớp hành vi mới: đã tự đọc lại sau 2 phút, chỉ chỗ nhóm tab", () => {
  const { code, help } = classifyError("booking", "quét", "Tab bị đóng giữa lúc tải trang");
  assert.equal(code, "BKG-TAB");
  assert.match(help.why, /Máy đã tự đọc lại sau 2 phút nhưng tab lại bị đóng\./);
  assert.match(help.steps.join(" "), /nhóm tab màu xanh có chữ Urban B/);
  assert.match(help.steps.join(" "), /dải chữ xanh/);
  assert.equal(SCAN_GROUP.color, "blue", "lời giải thích nói nhóm màu xanh");
});
