// YC-240 · H-1980 a — máy lễ tân báo được khi phiên đăng nhập (token) gửi Google Sheet của khách sạn bị từ
// chối, đang chờ xác nhận, hoặc đã lưu rồi chết. Ca thật: Linh Đan Phú Nhuận 26/10/2026, 7 đơn Go2Joy không
// vào ezCloud mà quầy không biết, vì lời "bị từ chối" chỉ hiện 10 giây và chỉ lần đầu.
// Phần đầu thử mô hình chữ (hub-quay.js); phần sau chạy thật quay/sw.js với `chrome` và `fetch` giả.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as H from "../extension/quay/hub-quay.js";

const AT = new Date(2026, 9, 26, 9, 5).getTime(); // 09:05 giờ máy
const SEC = 1000;

// ---------- ① Lượt đẩy bị từ chối / chờ xác nhận: mô hình chữ ----------

test("① Lượt đẩy bị từ chối ⇒ dòng lỗi bền: còn sau 10 giây, sau một ngày, nói lễ tân phải làm gì", () => {
  const tokens = { ezcloud: { at: AT, outcome: "rejected", message: "Token không gọi được ezCloud" } };
  for (const now of [AT + 11 * SEC, AT + 3 * 3600 * SEC]) {
    const [a, ...rest] = H.tokenAlerts({ tokens, now });
    assert.equal(rest.length, 0);
    assert.equal(a.tone, "err");
    assert.equal(a.kind, "ezcloud");
    assert.match(a.text, /không nhận phiên đăng nhập PMS máy gửi lúc 09:05\./);
    assert.match(a.text, /Mở lại hoặc đăng nhập lại PMS để máy gửi phiên mới/);
    assert.match(a.text, /Chi tiết: Token không gọi được ezCloud/);
  }
  // Qua ngày ⇒ nói cả ngày, kẻo ca sau đọc "09:05" thành giờ hôm nay.
  assert.match(H.tokenAlerts({ tokens, now: AT + 24 * 3600 * SEC })[0].text, /lúc 09:05 ngày 26\/10/);
});

test("① Mã kết nối bị từ chối ⇒ dòng nói mã, không bảo lễ tân đăng nhập lại PMS", () => {
  const [a] = H.tokenAlerts({ tokens: { ezcloud: { at: AT, outcome: "rejected", message: "Sai mã kết nối.", codeRejected: true } }, now: AT });
  assert.equal(a.tone, "err");
  assert.match(a.text, /không nhận mã kết nối/);
  assert.match(a.text, /báo Quản trị hệ thống nhập lại mã/);
  assert.doesNotMatch(a.text, /đăng nhập lại PMS/);
});

test("① Chờ xác nhận (pending) ⇒ dòng vàng bền, nói ai làm: Quản lý cơ sở xác nhận ở bước 2", () => {
  const [a] = H.tokenAlerts({ tokens: { ezcloud: { at: AT, outcome: "pending", message: "x" } }, now: AT + 60 * SEC });
  assert.equal(a.tone, "warn");
  assert.match(a.text, /Phiên đăng nhập PMS máy gửi lúc 09:05 đang chờ Quản lý cơ sở xác nhận ở bước 2/);
});

test("① Lượt đẩy được lưu (saved / unchanged) ⇒ không còn dòng nào", () => {
  for (const outcome of ["saved", "unchanged"]) {
    assert.deepEqual(H.tokenAlerts({ tokens: { ezcloud: { at: AT, outcome, message: "Đã lưu" } }, now: AT }), []);
  }
  assert.deepEqual(H.tokenAlerts({ tokens: {}, now: AT }), []);
  assert.deepEqual(H.tokenAlerts({}), []);
});

test("① Go2Joy bị từ chối ⇒ dòng riêng, bảo mở lại trang HA Go2Joy; lỗi đứng trước dòng vàng", () => {
  const list = H.tokenAlerts({
    tokens: { ezcloud: { at: AT, outcome: "pending" }, go2joy: { at: AT, outcome: "rejected", message: "Token Go2Joy hết hạn" } },
    now: AT,
  });
  assert.deepEqual(list.map((a) => [a.kind, a.tone]), [["go2joy", "err"], ["ezcloud", "warn"]]);
  assert.match(list[0].text, /phiên đăng nhập Go2Joy/);
  assert.match(list[0].text, /trang HA Go2Joy/);
});

test("① Nút gập và popup nói luôn lời báo phiên đăng nhập", () => {
  const token = H.tokenAlerts({ tokens: { ezcloud: { at: AT, outcome: "rejected", message: "x" } }, now: AT })[0];
  const segs = H.dockModel({ session: "ok", booking: { issues: 0, count: 3 }, indicators: { exceeded: 0 }, token }).segs;
  assert.deepEqual(segs[1], { text: "Phiên PMS bị từ chối", bad: true });
  assert.ok(!H.dockModel({ session: "ok", booking: { issues: 0, count: 3 } }).segs.some((x) => /Phiên/.test(x.text)));

  const row = H.popupPmsRow({ session: "ok", branchName: "UB1", booking: { count: 3, issues: 0, at: AT }, tokens: { ezcloud: { at: AT, outcome: "rejected", message: "x" } } }, AT);
  assert.equal(row.tone, "err");
  assert.ok(row.subs.some((s) => s.tone === "err" && /không nhận phiên đăng nhập PMS/.test(s.text)));
});

test("(e) Chữ hiện cho lễ tân không mang token, URL, email dù câu lỗi Apps Script có", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJIb3RlbElkIjoiNDEyMyJ9.c2lnbmF0dXJlLWdpYS1sYXAtdGh1LW5naGllbQ";
  const message = `Token ${jwt} hỏng; xem https://script.google.com/macros/s/AKfyc-gia/exec hoặc gửi quantri@example.com, khoá ${"k".repeat(40)}`;
  const texts = H.tokenAlerts({ tokens: { ezcloud: { at: AT, outcome: "rejected", message }, go2joy: { at: AT, outcome: "rejected", message } }, now: AT }).map((a) => a.text);
  assert.equal(texts.length, 2);
  for (const t of texts) {
    assert.doesNotMatch(t, /eyJ/);
    assert.doesNotMatch(t, /script\.google\.com|https?:/);
    assert.doesNotMatch(t, /@/);
    assert.doesNotMatch(t, /k{32}/);
  }
});

// ---------- ① Chạy thật sw.js: từ chối lặp lại, 10 giây, lưu được ----------

const WEB_APP = "https://script.google.com/macros/s/AKfycbGIA-yc240/exec";
const OTA = { webAppUrl: WEB_APP, pushKey: "khoa-day-gia", apiToken: "ma-api-gia", updatedAt: "2026-10-20T00:00:00Z" };
const HOTEL = "4123";

function event() {
  const fns = [];
  return { addListener: (f) => fns.push(f), removeListener() {}, fire: (...a) => fns.map((f) => f(...a)) };
}
const store = {};
const local = {
  get: async (keys) => {
    const ks = keys == null ? Object.keys(store) : [].concat(keys);
    return Object.fromEntries(ks.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
  },
  set: async (obj) => void Object.assign(store, structuredClone(obj)),
  remove: async (keys) => void [].concat(keys).forEach((k) => delete store[k]),
};
const sent = []; // tin service worker gửi các tab PMS
const posts = []; // thân POST tới Web App
const replies = { push: [], get: null };

globalThis.chrome = {
  storage: { local, session: { get: async () => ({}), set: async () => {} }, onChanged: event() },
  runtime: { getManifest: () => ({ version: "1.5.4" }), getPlatformInfo: (cb) => cb?.({}), onMessage: event(), lastError: undefined },
  tabs: { query: async () => [{ id: 1 }], sendMessage: async (id, msg) => void sent.push(msg) },
};

const json = (body, status = 200) => ({
  ok: status < 400,
  status,
  url: "",
  redirected: false,
  headers: { get: () => "application/json" },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith(WEB_APP)) {
    if (init.method === "POST") {
      posts.push(JSON.parse(init.body));
      return json(replies.push.shift() ?? { ok: true, result: { status: "UNCHANGED" } });
    }
    return json(replies.get);
  }
  // Mọi route Hub: phiên còn, cơ sở UB1 có mã kết nối.
  return json({ ok: true, branch: { id: "br_ub1", name: "UB1" }, otaSync: OTA, branches: [] });
};

mock.timers.enable({ apis: ["setTimeout", "Date"], now: AT });
const SW = await import("../extension/quay/sw.js");

const settle = async () => {
  for (let i = 0; i < 60; i += 1) await new Promise((r) => setImmediate(r));
};

/** JWT giả mang mã khách sạn (PMS gửi kèm request). `n` đổi chữ ký ⇒ token khác. */
function fakeJwt(n) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64({ HotelId: HOTEL, n })}.chu-ky-gia-${n}`;
}

async function push(n, reply) {
  replies.push.push(reply);
  await SW.onToken({ kind: "ezcloud", token: fakeJwt(n) }, 1);
  mock.timers.tick(3 * SEC);
  await settle();
}

const popupAlerts = async () => {
  const st = await SW.statusForPopup();
  return H.popupPmsRow(st, Date.now()).subs.filter((s) => /phiên đăng nhập PMS|Phiên đăng nhập PMS/.test(s.text));
};

store[`quayConn:${HOTEL}`] = { branch: { id: "br_ub1", name: "UB1" }, otaSync: OTA, at: AT };
store.quayHubOrigin = "https://hub.urbanb.vn";

test("(a) sw.js: từ chối ⇒ dòng bền còn sau 10 giây và sau lượt từ chối lặp lại; lời 10 giây chỉ hiện lần đầu; lưu được ⇒ hết", async () => {
  const REJECT = { ok: false, error: "Token không gọi được ezCloud" };
  await push(1, REJECT);
  assert.equal(posts.length, 1, "đã POST pushToken");
  assert.equal(store["quayTokenAt:ezcloud"].outcome, "rejected");
  assert.equal(sent.filter((m) => m.type === "quay:tokenNote").length, 1, "lời 10 giây lần đầu giữ nguyên");

  mock.timers.tick(11 * SEC);
  let lines = await popupAlerts();
  assert.equal(lines.length, 1, "sau 10 giây dòng vẫn còn");
  assert.equal(lines[0].tone, "err");

  // 10 phút sau PMS vẫn gửi token ấy, Sheet từ chối cùng câu ⇒ không hiện lại lời 10 giây, dòng bền vẫn còn.
  mock.timers.tick(10 * 60 * SEC);
  await push(1, REJECT);
  assert.equal(posts.length, 2);
  assert.equal(sent.filter((m) => m.type === "quay:tokenNote").length, 1, "từ chối lặp lại thì lời 10 giây im");
  mock.timers.tick(11 * SEC);
  lines = await popupAlerts();
  assert.equal(lines.length, 1, "sau lượt từ chối lặp lại dòng vẫn còn");

  // Token mới được lưu ⇒ dòng hết.
  await push(3, { ok: true, result: { status: "SAVED", message: "Đã lưu token" } });
  assert.equal(store["quayTokenAt:ezcloud"].outcome, "saved");
  assert.deepEqual(await popupAlerts(), []);

  // (e) Chữ hiện không mang token đã gửi.
  for (const n of [1, 3]) {
    for (const m of sent) assert.ok(!JSON.stringify(m).includes(fakeJwt(n)));
  }
});

test("(a) sw.js: chờ xác nhận giữ bền tới lượt đẩy unchanged", async () => {
  await push(4, { ok: true, result: { status: "PENDING", message: "Chờ xác nhận" } });
  mock.timers.tick(11 * SEC);
  const lines = await popupAlerts();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tone, "warn");
  mock.timers.tick(10 * 60 * SEC);
  await push(5, { ok: true, result: { status: "UNCHANGED", message: "Token không đổi" } });
  assert.deepEqual(await popupAlerts(), []);
});

test("Khung trên PMS vẽ dòng bền ở mọi tab và vẽ lại khi lượt đẩy ghi quayTokenAt", () => {
  const ui = readFileSync(new URL("../extension/quay/ui.js", import.meta.url), "utf8");
  for (const fn of ["bookingsTab", "boardTab", "todoTab"]) assert.ok(ui.includes(`body = tokenAlertsHTML() + ${fn}()`), fn);
  assert.match(ui, /changes\[`quayTokenAt:\$\{kind\}`\]/);
});
