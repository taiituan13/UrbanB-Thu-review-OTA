// YC-240 · H-1980 a — máy lễ tân báo được khi phiên đăng nhập (token) gửi Google Sheet của khách sạn bị từ
// chối, đang chờ xác nhận, hoặc đã lưu rồi chết. Ca thật: Linh Đan Phú Nhuận 26/10/2026, 7 đơn Go2Joy không
// vào ezCloud mà quầy không biết, vì lời "bị từ chối" chỉ hiện 10 giây và chỉ lần đầu.
// Phần đầu thử mô hình chữ (hub-quay.js); phần sau chạy thật quay/sw.js với `chrome` và `fetch` giả.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as H from "../extension/quay/hub-quay.js";
import { counterProblems } from "../extension/quay/counter-problems.js";

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
const hubPosts = []; // thân POST tới Hub (lượt báo sống mang `problems`)

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
  if (init.method === "POST" && typeof init.body === "string") hubPosts.push(JSON.parse(init.body));
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

// ---------- ② tokenHealth: Sheet báo token đã lưu rồi chết, chờ xác nhận, chưa có ----------

const FAILED_AT = new Date(2026, 9, 25, 22, 40).toISOString(); // 22:40 ngày 25/10 giờ máy
const health = (ezcloud) => ({ matches: [], tokenHealth: { ezcloud } });

test("(b) auth-failed ⇒ dòng lỗi có giờ bị từ chối, số booking đang chờ, và việc lễ tân làm", () => {
  const h = H.readTokenHealth(health({ state: "auth-failed", savedAt: null, authFailedAt: FAILED_AT, waitingRows: 7, message: "Token hỏng" }), AT);
  const [a, ...rest] = H.tokenAlerts({ health: h, now: AT });
  assert.equal(rest.length, 0);
  assert.equal(a.tone, "err");
  assert.equal(a.text, "Booking OTA: ezCloud đã từ chối phiên đăng nhập PMS lúc 22:40 ngày 25/10, 7 booking đang chờ vào ezCloud. Mở lại hoặc đăng nhập lại PMS để máy gửi phiên mới.");
  // Cùng ngày ⇒ chỉ giờ. Không có booking chờ ⇒ không nói số.
  const same = H.readTokenHealth(health({ state: "auth-failed", authFailedAt: new Date(AT - 60 * SEC).toISOString(), waitingRows: 0 }), AT);
  assert.equal(H.tokenAlerts({ health: same, now: AT })[0].text, "Booking OTA: ezCloud đã từ chối phiên đăng nhập PMS lúc 09:04. Mở lại hoặc đăng nhập lại PMS để máy gửi phiên mới.");
});

test("② pending ⇒ Quản lý cơ sở xác nhận ở bước 2; missing ⇒ Quản trị dán mã lên Hub", () => {
  const p = H.tokenAlerts({ health: H.readTokenHealth(health({ state: "pending", waitingRows: 2 }), AT), now: AT })[0];
  assert.equal(p.tone, "warn");
  assert.match(p.text, /đang chờ Quản lý cơ sở xác nhận ở bước 2 trên Google Sheet của khách sạn, 2 booking đang chờ vào ezCloud\./);
  const m = H.tokenAlerts({ health: H.readTokenHealth(health({ state: "missing", waitingRows: 0 }), AT), now: AT })[0];
  assert.equal(m.tone, "err");
  assert.match(m.text, /chưa có phiên đăng nhập PMS\. Báo Quản trị hệ thống dán mã kết nối Booking OTA lên Hub\./);
  // Lượt đẩy cũng đang chờ xác nhận ⇒ chỉ một dòng, không nói hai lần.
  const both = H.tokenAlerts({ tokens: { ezcloud: { at: AT, outcome: "pending" } }, health: H.readTokenHealth(health({ state: "pending" }), AT), now: AT });
  assert.equal(both.length, 1);
});

test("(c) Bản Apps Script cũ không có tokenHealth, hay dạng lạ ⇒ không hiện, không lỗi", () => {
  for (const result of [undefined, null, {}, { matches: [] }, { tokenHealth: null }, { tokenHealth: {} }, health(null), health("ok"), health({ state: "het-han" }), health({})]) {
    assert.equal(H.readTokenHealth(result, AT), null);
  }
  assert.deepEqual(H.tokenAlerts({ health: null, now: AT }), []);
  assert.equal(H.latestHealth(null, undefined), null);
  // Số booking chờ sai dạng ⇒ 0, ngày sai dạng ⇒ không nói giờ.
  const h = H.readTokenHealth(health({ state: "auth-failed", authFailedAt: "không phải ngày", waitingRows: "abc" }), AT);
  assert.deepEqual(h, { state: "auth-failed", savedAt: null, authFailedAt: null, waitingRows: 0, at: AT });
  assert.match(H.tokenAlerts({ health: h, now: AT })[0].text, /^Booking OTA: ezCloud đã từ chối phiên đăng nhập PMS\. Mở lại/);
});

test("(d) ok ⇒ không hiện", () => {
  const h = H.readTokenHealth(health({ state: "ok", savedAt: FAILED_AT, authFailedAt: null, waitingRows: 0, message: "Token chạy tốt" }), AT);
  assert.equal(h.state, "ok");
  assert.deepEqual(H.tokenAlerts({ health: h, now: AT }), []);
});

test("② Máy vừa lưu được token mới sau lượt đọc ⇒ bản đọc auth-failed đã cũ, không hiện; lưu trước lượt đọc thì vẫn hiện", () => {
  const h = H.readTokenHealth(health({ state: "auth-failed", authFailedAt: FAILED_AT, waitingRows: 7 }), AT);
  assert.deepEqual(H.tokenAlerts({ tokens: { ezcloud: { at: AT + SEC, outcome: "saved" } }, health: h, now: AT + SEC }), []);
  assert.equal(H.tokenAlerts({ tokens: { ezcloud: { at: AT - SEC, outcome: "saved" } }, health: h, now: AT }).length, 1);
  // "unchanged" = gửi lại đúng token đã lưu (có thể chính token đã chết) ⇒ không xoá dòng.
  assert.equal(H.tokenAlerts({ tokens: { ezcloud: { at: AT + SEC, outcome: "unchanged" } }, health: h, now: AT + SEC }).length, 1);
  // Bản đọc mới nhất thắng: bảng khoá đọc sau nói ok ⇒ hết.
  const ok = H.readTokenHealth(health({ state: "ok" }), AT + 5 * SEC);
  assert.equal(H.latestHealth(h, ok), ok);
  assert.deepEqual(H.tokenAlerts({ health: H.latestHealth(h, ok), now: AT }), []);
});

test("(b)(c) sw.js: lượt đọc gần đây và bảng khoá mang tokenHealth lên popup; bản cũ không có trường thì im; token mới lưu ⇒ hết ở lượt đọc kế", async () => {
  const healthLines = async () => {
    const st = await SW.statusForPopup();
    return H.popupPmsRow(st, Date.now()).subs.filter((s) => /ezCloud đã từ chối|Google Sheet của khách sạn chưa có|chờ Quản lý cơ sở/.test(s.text));
  };
  // Bản Apps Script cũ.
  replies.get = { ok: true, result: { matches: [] } };
  let r = await SW.bookings(HOTEL, "");
  assert.equal(r.ok, true);
  assert.equal(r.tokenHealth, null);
  assert.deepEqual(await healthLines(), []);

  // Token đã lưu rồi chết: Sheet báo auth-failed ở lượt đọc gần đây.
  replies.get = { ok: true, result: health({ state: "auth-failed", savedAt: null, authFailedAt: FAILED_AT, waitingRows: 7, message: "x" }) };
  r = await SW.bookings(HOTEL, "");
  assert.equal(r.tokenHealth.state, "auth-failed");
  let lines = await healthLines();
  assert.equal(lines.length, 1);
  assert.equal(lines[0].tone, "err");
  assert.match(lines[0].text, /lúc 22:40 ngày 25\/10, 7 booking đang chờ vào ezCloud/);
  assert.equal(store[`quayBook:${HOTEL}`].tokenHealth.state, "auth-failed", "bản đệm cho khung lúc mở lại");

  // Lượt tìm (q) không đè sức khoẻ.
  replies.get = { ok: true, result: { matches: [] } };
  r = await SW.bookings(HOTEL, "abc");
  assert.equal((await healthLines()).length, 1);

  // Lễ tân đăng nhập lại, Sheet lưu token mới ⇒ lượt đọc bảng khoá kế nói ok ⇒ dòng hết.
  mock.timers.tick(SEC);
  replies.get = { ok: true, result: { occupancy: { ok: true, days: [], roomTypes: [] }, locks: {}, tokenHealth: { ezcloud: { state: "ok", savedAt: new Date().toISOString(), authFailedAt: null, waitingRows: 0, message: "" } } } };
  r = await SW.board(HOTEL);
  assert.equal(r.ok, true);
  assert.equal(r.tokenHealth.state, "ok");
  assert.deepEqual(await healthLines(), []);
});

test("Khung trên PMS lấy sức khoẻ token từ lượt đọc gần nhất (gần đây, bảng khoá, cả bản đệm)", () => {
  const ui = readFileSync(new URL("../extension/quay/ui.js", import.meta.url), "utf8");
  assert.match(ui, /H\.latestHealth\(S\.recent\?\.ok !== false \? S\.recent\?\.tokenHealth : null, S\.board\?\.ok !== false \? S\.board\?\.tokenHealth : null\)/);
  assert.match(ui, /tokenHealth: c\.bookings\.tokenHealth \?\? null/);
  assert.match(ui, /tokenHealth: H\.readTokenHealth\(c\.board\.result, c\.board\.at\)/);
});

// ---------- ③ Báo Hub: dùng lại TOKEN_REJECTED (điều phối duyệt lối a) ----------

const tokenProblem = (args) => counterProblems(args).find((p) => p.code === "TOKEN_REJECTED") ?? null;

test("③ auth-failed ⇒ TOKEN_REJECTED, detail đọc được thành câu, since = lúc ezCloud từ chối", () => {
  const h = H.readTokenHealth(health({ state: "auth-failed", authFailedAt: FAILED_AT, waitingRows: 7 }), AT);
  assert.deepEqual(tokenProblem({ snap: { tokenHealth: h } }), { code: "TOKEN_REJECTED", detail: "ezcloud, đã lưu rồi bị ezCloud từ chối, 7 đơn chờ", since: FAILED_AT });
  // Không có đơn chờ ⇒ không nói số.
  const h0 = H.readTokenHealth(health({ state: "auth-failed", authFailedAt: FAILED_AT, waitingRows: 0 }), AT);
  assert.equal(tokenProblem({ snap: { tokenHealth: h0 } }).detail, "ezcloud, đã lưu rồi bị ezCloud từ chối");
  // Cùng lúc Go2Joy bị từ chối lúc đẩy ⇒ một mã, hai phần, since sớm nhất.
  const both = tokenProblem({ snap: { tokenHealth: h }, tokenAt: { go2joy: { outcome: "rejected", at: AT } } });
  assert.equal(both.detail, "go2joy; ezcloud, đã lưu rồi bị ezCloud từ chối, 7 đơn chờ");
  assert.equal(both.since, FAILED_AT);
  assert.equal(counterProblems({ snap: { tokenHealth: h }, tokenAt: { go2joy: { outcome: "rejected", at: AT } } }).filter((p) => p.code === "TOKEN_REJECTED").length, 1);
});

test("③ ok, pending, missing, không có trường, hay đã lưu token mới sau lượt đọc ⇒ không có TOKEN_REJECTED", () => {
  for (const state of ["ok", "pending", "missing"]) {
    assert.equal(tokenProblem({ snap: { tokenHealth: H.readTokenHealth(health({ state, waitingRows: 3 }), AT) } }), null, state);
  }
  assert.equal(tokenProblem({ snap: { tokenHealth: null } }), null);
  assert.equal(tokenProblem({ snap: {} }), null);
  assert.equal(tokenProblem({}), null);
  const h = H.readTokenHealth(health({ state: "auth-failed", authFailedAt: FAILED_AT, waitingRows: 7 }), AT);
  assert.equal(tokenProblem({ snap: { tokenHealth: h }, tokenAt: { ezcloud: { outcome: "saved", at: AT + SEC } } }), null);
  // Lượt đẩy bị từ chối vẫn giữ dạng cũ (Hub đã đọc dạng này).
  assert.deepEqual(tokenProblem({ tokenAt: { ezcloud: { outcome: "rejected", at: AT } } }), { code: "TOKEN_REJECTED", detail: "ezcloud", since: new Date(AT).toISOString() });
});

test("③ sw.js: Sheet báo auth-failed ⇒ lượt báo sống lên Hub mang TOKEN_REJECTED; lượt đọc kế ok ⇒ hết", async () => {
  const lastProblems = () => [...hubPosts].reverse().find((b) => Array.isArray(b.problems))?.problems ?? null;
  replies.get = { ok: true, result: health({ state: "auth-failed", savedAt: null, authFailedAt: FAILED_AT, waitingRows: 7, message: "x" }) };
  await SW.bookings(HOTEL, "");
  await settle();
  const p = lastProblems()?.find((x) => x.code === "TOKEN_REJECTED");
  assert.ok(p, "Hub nhận TOKEN_REJECTED");
  assert.equal(p.detail, "ezcloud, đã lưu rồi bị ezCloud từ chối, 7 đơn chờ");
  for (const b of hubPosts) assert.ok(!JSON.stringify(b).includes(OTA.pushKey) && !JSON.stringify(b).includes(WEB_APP), "không gửi khoá, URL Web App");

  replies.get = { ok: true, result: health({ state: "ok", waitingRows: 0 }) };
  await SW.bookings(HOTEL, "");
  await settle();
  assert.ok(!lastProblems().some((x) => x.code === "TOKEN_REJECTED"));
});
