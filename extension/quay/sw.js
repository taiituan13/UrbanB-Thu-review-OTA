// Service worker của "UrbanB tại quầy": mọi lượt gọi Hub và Apps Script đi từ đây.
// Đo P4 (BAO-CAO-LAN-yc112-extension-v2.md §1): fetch từ service worker mang cookie phiên Hub; fetch từ
// trang PMS bị CORS chặn. Khung trên PMS vì vậy chỉ nhắn tin cho tệp này.
//
// Tệp này không chứa luật: luật nằm ở booking-ota.js, hub-quay.js, indicators.js (có test).

import * as B from "./booking-ota.js";
import * as H from "./hub-quay.js";
import * as N from "./notifications.js";
import { DEV_FLAGS } from "../env.js";

const K = {
  hub: "quayHubOrigin",
  ever: "quayEverSignedIn",
  last: "quayLastSession",
  lastHotel: "quayLastHotel",
  memo: "quayPushMemo",
  snap: "quaySnap",
  conn: (h) => `quayConn:${h}`,
  report: (h) => `quayReport:${h}`,
  ind: (h) => `quayInd:${h}`,
  book: (h) => `quayBook:${h}`,
  board: (h) => `quayBoard:${h}`,
  tok: (k) => `quayTokenAt:${k}`,
};

const get = async (key) => (await chrome.storage.local.get(key))[key];
const set = (key, value) => chrome.storage.local.set({ [key]: value });
const now = () => Date.now();

/** Giữ service worker sống trong lượt gọi dài (Chrome dừng worker sau ~30 giây không có sự kiện). */
async function keepAlive(promise) {
  const t = setInterval(() => chrome.runtime.getPlatformInfo(() => {}), 20_000);
  try {
    return await promise;
  } finally {
    clearInterval(t);
  }
}

export async function hubOriginNow() {
  return H.hubOrigin(await get(K.hub));
}

/** fetch tới Hub kèm cookie phiên. Trả `{ status, url, redirected, json }` hoặc `{ netError }`. */
export async function hubFetch(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, credentials: "include", cache: "no-store" });
    let json = null;
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("json")) {
      try {
        json = await res.json();
      } catch {}
    }
    return { status: res.status, url: res.url, redirected: res.redirected, json };
  } catch (e) {
    return { netError: String(e?.message ?? e) };
  }
}

/** Ghi trạng thái phiên Hub của lượt gọi vừa xong. */
async function noteSession(cls) {
  if (cls.state === "ok" || cls.state === "nobranch") {
    await chrome.storage.local.set({ [K.ever]: true, [K.last]: "ok" });
  } else if (cls.state === "out") {
    await set(K.last, "out");
    // Huy hiệu và popup đọc phiên từ ảnh trạng thái: hết phiên phải hiện ngay, không chờ khung mở lại.
    await patchSnap({ session: H.sessionState("out", Boolean(await get(K.ever))) });
  }
}

/** Lượt gửi review (background.js) gặp NOT_SIGNED_IN: ghi phiên "out" như mọi route Hub khác. */
export async function noteSignedOut() {
  await noteSession({ state: "out" });
}

async function sessionNow(cls) {
  const ever = Boolean(await get(K.ever));
  if (cls.state === "out") return H.sessionState("out", ever);
  return cls.state;
}

async function patchSnap(patch) {
  const snap = (await get(K.snap)) ?? {};
  const next = { ...snap, ...patch, updatedAt: now() };
  await set(K.snap, next);
  return next;
}

// ---------- Mã kết nối theo cơ sở ----------

/**
 * Lấy mã kết nối của cơ sở đang mở trên PMS. Bản đệm còn mới ⇒ dùng luôn, không hỏi Hub
 * (mỗi lượt hỏi ghi "máy quầy gọi lần cuối" ở Hub). `force` ⇒ hỏi lại. `report` ⇒ báo kết quả dùng mã.
 * Trả `{ session, why?, branch, otaSync, cached }`.
 */
export async function connection(hotelId, { force = false, report = null } = {}) {
  const cached = hotelId ? await get(K.conn(hotelId)) : null;
  if (!force && !report && cached && H.isFresh(cached, now(), H.CONNECTION_MAX_AGE_MS)) {
    return { session: "ok", branch: cached.branch, otaSync: H.usableOtaSync(undefined, cached), cached: true };
  }
  const origin = await hubOriginNow();
  const reply = await hubFetch(H.connectionUrl(origin, hotelId, report));
  const cls = H.classifyHubReply(reply);
  await noteSession(cls);
  if (cls.state === "ok") {
    const entry = { branch: cls.data.branch ?? null, otaSync: cls.data.otaSync ?? null, at: now() };
    await set(K.conn(hotelId), entry);
    return { session: "ok", branch: entry.branch, otaSync: H.usableOtaSync(entry.otaSync), cached: false };
  }
  const session = await sessionNow(cls);
  // H-1245 a: hết phiên (hoặc mất mạng) ⇒ Booking OTA chạy bằng mã đã nhận lần trước.
  return { session, why: cls.why, branch: cached?.branch ?? null, otaSync: H.usableOtaSync(undefined, cached), cached: Boolean(cached), message: cls.message };
}

/** Báo Hub kết quả dùng mã (chỉ khi kết quả đổi). Không chặn luồng chính. */
async function reportCodeOutcome(hotelId, otaSync, outcome) {
  if (!hotelId || !otaSync) return;
  const last = await get(K.report(hotelId));
  const r = H.reportToSend(last, otaSync, outcome);
  if (!r) return;
  const res = await connection(hotelId, { report: r });
  if (res.session === "ok") await set(K.report(hotelId), r);
}

// ---------- Apps Script ----------

async function scriptGet(otaSync, params) {
  if (!otaSync) throw new B.ApiError("no-code", "Hub chưa có mã kết nối Booking OTA của cơ sở này.");
  if (!B.isAppsScriptUrl(otaSync.webAppUrl)) throw new B.ApiError("no-code", "Mã kết nối Hub trả về không phải URL Web App Apps Script.");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), B.GET_TIMEOUT_MS);
  try {
    const res = await keepAlive(fetch(B.apiUrl(otaSync.webAppUrl, params, otaSync.apiToken), { signal: ctl.signal, credentials: "omit", cache: "no-store" }));
    return B.parseApiReply(await res.text());
  } catch (e) {
    if (e instanceof B.ApiError) throw e;
    if (e?.name === "AbortError") throw new B.ApiError("timeout", "Web App quá thời gian.");
    throw new B.ApiError("net", "Không gọi được Web App.");
  } finally {
    clearTimeout(timer);
  }
}

/** Gọi Apps Script cho một cơ sở; mã bị từ chối ⇒ báo Hub rồi hỏi lại Hub một lần (có thể đã có mã mới). */
async function withCode(hotelId, params) {
  let conn = await connection(hotelId);
  try {
    const out = await scriptGet(conn.otaSync, params);
    reportCodeOutcome(hotelId, conn.otaSync, { kind: "accepted" }).catch(() => {});
    return { conn, ...out };
  } catch (e) {
    if (e.kind !== "rejected") throw Object.assign(e, { conn });
    await reportCodeOutcome(hotelId, conn.otaSync, { kind: "rejected", message: e.message });
    const again = await connection(hotelId, { force: true });
    if (!again.otaSync || again.otaSync.updatedAt === conn.otaSync?.updatedAt) throw Object.assign(e, { conn: again });
    conn = again;
    const out = await scriptGet(conn.otaSync, params);
    return { conn, ...out };
  }
}

function codeStateOf(conn, error) {
  // Không có mã mà Hub không trả lời được (chưa đăng nhập, chưa biết cơ sở, mất mạng) ⇒ chưa biết Hub có mã hay không.
  if (!conn?.otaSync) return conn?.session === "ok" ? "none" : "unknown";
  if (error?.kind === "rejected") return "rejected";
  return "ok";
}

export async function bookings(hotelId, q) {
  try {
    const { conn, result, hotel } = await withCode(hotelId, q ? B.searchParams(q) : B.recentParams());
    const matches = Array.isArray(result?.matches) ? result.matches : [];
    const at = now();
    if (!q) {
      await set(K.book(hotelId), { matches, hotel, at });
      await patchSnap({ booking: { count: matches.length, issues: B.countIssues(matches), at }, codeState: "ok", branchName: conn.branch?.name ?? "" });
    }
    return { ok: true, matches, hotel, at, codeState: "ok", session: conn.session };
  } catch (e) {
    const codeState = codeStateOf(e.conn, e);
    const cached = q ? null : await get(K.book(hotelId));
    await patchSnap({ booking: { ...(cached ? { count: cached.matches.length, issues: B.countIssues(cached.matches) } : {}), at: now(), error: e.message }, codeState });
    return { ok: false, error: e.message, kind: e.kind, codeState, cached, session: e.conn?.session };
  }
}

export async function board(hotelId) {
  try {
    const { result } = await withCode(hotelId, B.boardParams());
    const entry = { result, at: now() };
    await set(K.board(hotelId), entry);
    return { ok: true, ...entry };
  } catch (e) {
    return { ok: false, error: e.message, kind: e.kind, codeState: codeStateOf(e.conn, e), cached: await get(K.board(hotelId)) };
  }
}

export async function lock(hotelId, sourceKey, confirmPaid) {
  try {
    const { result } = await withCode(hotelId, B.lockParams(sourceKey, confirmPaid));
    return { ok: true, ...B.lockOutcome(result) };
  } catch (e) {
    return { ok: false, text: e.message };
  }
}

// ---------- Chỉ báo ----------

export async function indicators(hotelId) {
  const origin = await hubOriginNow();
  const cached = await get(K.ind(hotelId));
  const reply = await hubFetch(H.indicatorsUrl(origin, hotelId));
  const cls = H.classifyHubReply(reply);
  await noteSession(cls);
  if (cls.state === "ok") {
    const entry = { data: cls.data, at: now() };
    await set(K.ind(hotelId), entry);
    return { state: "ok", ...entry, origin };
  }
  const session = await sessionNow(cls);
  // Mất mạng / Hub lỗi ⇒ hiện số lượt trước, ghi rõ giờ (mockup trạng thái "net").
  return { state: session, why: cls.why, cached, failedAt: now(), message: cls.message, origin };
}

// ---------- Token ezCloud / Go2Joy ----------

const pending = {};

/**
 * Token trang PMS / HA Go2Joy gửi kèm request. Gom 3 giây, chờ hotelSn của Go2Joy tối đa 15 giây,
 * bỏ qua token đã gửi trong 10 phút, rồi POST về Apps Script của khách sạn (18_TokenPush.js).
 * Trả mã khách sạn ezCloud đọc được từ token PMS (để khung biết cơ sở).
 */
export async function onToken({ kind, token, hotelSn = 0, quiet = false }, tabId) {
  if (!B.TOKEN_KINDS[kind] || !token) return { hotelId: "" };
  let hotelId = "";
  if (kind === "ezcloud") {
    hotelId = B.ezcloudHotelIdOf(token);
    if (hotelId) {
      await set(K.lastHotel, hotelId);
      if (tabId != null) await chrome.storage.session.set({ [`quayTab:${tabId}`]: hotelId }).catch(() => {});
    }
  }
  const job = pending[kind];
  if (job && job.token === token) {
    job.hotelSn = job.hotelSn || hotelSn;
    job.quiet = job.quiet && quiet;
    return { hotelId };
  }
  // Go2Joy không mang mã khách sạn ezCloud ⇒ dùng mã kết nối của khách sạn PMS mở gần nhất (SUY).
  const forHotel = hotelId || (await get(K.lastHotel)) || "";
  if (!forHotel) return { hotelId };
  clearTimeout(job?.timer);
  pending[kind] = { token, hotelSn, quiet, since: now(), hotelId: forHotel };
  pending[kind].timer = setTimeout(() => flushToken(kind), B.PUSH_DEBOUNCE_MS);
  return { hotelId };
}

async function flushToken(kind) {
  const job = pending[kind];
  if (!job) return;
  if (kind === "go2joy" && !job.hotelSn && now() - job.since < B.GO2JOY_WAIT_FOR_HOTELSN_MS) {
    job.timer = setTimeout(() => flushToken(kind), B.PUSH_DEBOUNCE_MS);
    return;
  }
  delete pending[kind];
  const conn = await connection(job.hotelId);
  const code = conn.otaSync;
  if (!code?.pushKey || !B.isAppsScriptUrl(code.webAppUrl)) return;
  const key = B.memoKey(kind, code.webAppUrl, job.token);
  const memo = (await get(K.memo)) ?? {};
  if (B.isRemembered(memo, key, now())) return;
  const lastError = B.lastErrorOf(memo, key);
  let reply;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), B.POST_TIMEOUT_MS);
    const res = await keepAlive(
      fetch(code.webAppUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: B.pushTokenBody({ kind, token: job.token, hotelSn: job.hotelSn, pushKey: code.pushKey }),
        signal: ctl.signal,
        credentials: "omit",
      }),
    );
    clearTimeout(timer);
    reply = B.parsePushReply(await res.text());
  } catch {
    return; // không gọi được Web App: request sau của trang sẽ thử lại
  }
  if (reply.outcome === "bad-reply" || reply.outcome === "retry") return;
  const ok = reply.outcome !== "rejected";
  await set(K.memo, B.remember(memo, key, ok ? "ok" : "rejected", ok ? "" : reply.message, now()));
  await set(K.tok(kind), { at: now(), outcome: reply.outcome, message: reply.message, hotel: reply.hotel });
  if (kind === "ezcloud" && ok) await patchSnap({ tokenAt: now() });
  if (reply.codeRejected) await reportCodeOutcome(job.hotelId, code, { kind: "rejected", message: reply.message });
  else if (ok) reportCodeOutcome(job.hotelId, code, { kind: "accepted" }).catch(() => {});
  // Lời báo cho lễ tân (userscript: notify): lưu mới / chờ xác nhận / bị từ chối lần đầu.
  const repeated = lastError === reply.message;
  const say =
    reply.outcome === "saved" ? { tone: "ok", text: reply.message }
    : reply.outcome === "pending" ? { tone: "warn", text: reply.message }
    : reply.outcome === "rejected" && !job.quiet && !repeated ? { tone: "err", text: reply.message }
    : null;
  if (say) broadcast({ type: "quay:tokenNote", kind, ...say, hotel: reply.hotel });
}

async function broadcast(msg) {
  const tabs = await chrome.tabs.query({ url: ["https://pms.ezcloudhotel.com/*", "https://ha.go2joy.vn/*"] }).catch(() => []);
  for (const t of tabs) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
}

// ---------- Trạng thái cho khung và popup ----------

/** Khung trên PMS mở ra: phiên, cơ sở, mã, bản đệm để vẽ ngay. */
export async function hello(hotelId) {
  const origin = await hubOriginNow();
  const tokens = { ezcloud: await get(K.tok("ezcloud")), go2joy: await get(K.tok("go2joy")) };
  if (!hotelId) {
    // Chưa đọc được mã khách sạn từ PMS: hỏi Hub xem đã đăng nhập chưa (MISSING_HOTEL ⇔ đã đăng nhập).
    const cls = H.classifyHubReply(await hubFetch(H.connectionUrl(origin, "")));
    await noteSession(cls);
    const s = await sessionNow(cls);
    const session = s === "nobranch" ? "nobranch" : s;
    await patchSnap({ session, why: cls.why ?? "wait", branchName: "" });
    return { session, why: cls.why ?? "wait", origin, tokens };
  }
  const conn = await connection(hotelId);
  const view = {
    session: conn.session,
    why: conn.why,
    origin,
    hotelId,
    branch: conn.branch,
    codeState: conn.otaSync ? "ok" : conn.session === "ok" ? "none" : "unknown",
    tokens,
    cache: { bookings: await get(K.book(hotelId)), board: await get(K.board(hotelId)), indicators: await get(K.ind(hotelId)) },
  };
  await patchSnap({ session: view.session, why: conn.why ?? null, branchName: conn.branch?.name ?? "", hotelId, codeState: view.codeState });
  return view;
}

/** Popup hỏi trạng thái: dò phiên Hub (một GET không kèm mã khách sạn, không ghi gì ở Hub). */
export async function statusForPopup() {
  const origin = await hubOriginNow();
  const cls = H.classifyHubReply(await hubFetch(H.connectionUrl(origin, "")));
  await noteSession(cls);
  let session = await sessionNow(cls);
  const snap = (await get(K.snap)) ?? {};
  // Dò phiên không kèm mã ⇒ MISSING_HOTEL ⇔ đã đăng nhập; trạng thái cơ sở lấy theo lượt khung gần nhất.
  if (session === "nobranch") session = snap.session === "nobranch" ? "nobranch" : "ok";
  if (cls.state === "net") session = snap.session ?? "out";
  return { ...snap, session, origin, net: cls.state === "net" };
}

export async function setHubOrigin(origin) {
  const o = H.hubOrigin(origin);
  await chrome.storage.local.set({ [K.hub]: o, [K.ever]: false, [K.last]: null, [K.snap]: {} });
  return o;
}

export async function openHub(path) {
  const origin = await hubOriginNow();
  // Chỉ mở đường dẫn trên chính Hub đang dùng; không nhận URL tuyệt đối từ trang.
  const p = String(path ?? "");
  await chrome.tabs.create({ url: origin + (p.startsWith("/") && !p.startsWith("//") ? p : "/") });
  return { ok: true };
}

export async function tampermonkeySeen(present) {
  await patchSnap({ tampermonkey: Boolean(present) });
}

// ---------- Thông báo (hợp đồng đề xuất: notifications.js) ----------

let fake = null;
async function notiSource() {
  // Bản dựng đo bật nguồn giả; bản phát hành DEV_FLAGS.fakeNotifications = false.
  if (DEV_FLAGS.fakeNotifications) return (fake ??= N.fakeSource());
  return N.hubSource(await hubOriginNow(), hubFetch);
}

export async function notifications() {
  const r = await (await notiSource()).list();
  if (r.state === "out") {
    await noteSession({ state: "out" });
    r.session = await sessionNow({ state: "out" });
    r.state = r.session;
  }
  if (r.state === "ok") await set(K.ever, true);
  await patchSnap({ notifications: { state: r.state, unread: r.state === "ok" ? r.unread : 0, me: r.me?.name ?? "", at: now() } });
  return r;
}

export async function readNotifications(ids) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter(Boolean).slice(0, 100);
  if (!list.length) return { ok: false, state: "server" };
  const r = await (await notiSource()).read(list);
  if (r.ok && Number.isInteger(r.unread)) {
    const snap = (await get(K.snap)) ?? {};
    await patchSnap({ notifications: { ...(snap.notifications ?? {}), state: "ok", unread: r.unread, at: now() } });
  }
  return r;
}

// ---------- Tin nhắn ----------

const HANDLERS = {
  "quay:hello": (m) => hello(String(m.hotelId ?? "")),
  "quay:bookings": (m) => bookings(String(m.hotelId ?? ""), String(m.q ?? "").trim()),
  "quay:board": (m) => board(String(m.hotelId ?? "")),
  "quay:lock": (m) => lock(String(m.hotelId ?? ""), String(m.sourceKey ?? ""), Boolean(m.confirmPaid)),
  "quay:indicators": (m) => indicators(String(m.hotelId ?? "")),
  "quay:token": (m, sender) => onToken(m, sender?.tab?.id),
  "quay:tabHotel": async (_m, sender) => ({ hotelId: sender?.tab?.id != null ? (await chrome.storage.session.get(`quayTab:${sender.tab.id}`).catch(() => ({})))[`quayTab:${sender.tab.id}`] ?? "" : "" }),
  "quay:openHub": (m) => openHub(String(m.path ?? "/")),
  "quay:status": () => statusForPopup(),
  "quay:setHub": (m) => setHubOrigin(String(m.origin ?? "")),
  "quay:tm": (m) => tampermonkeySeen(m.present),
  "quay:notifications": () => notifications(),
  "quay:notiRead": (m) => readNotifications(m.ids),
  // Chỉ bản dựng đo: thêm một thông báo giả để thử thông báo nổi.
  "quay:notiFakePush": (m) => (DEV_FLAGS.fakeNotifications ? notiSource().then((src) => src.push(m.partial ?? {})) : { ok: false }),
};

export function installQuay(extraHandlers = {}) {
  const all = { ...HANDLERS, ...extraHandlers };
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    const fn = all[msg?.type];
    if (!fn) return false;
    Promise.resolve()
      .then(() => fn(msg, sender))
      .then(reply, (e) => reply({ ok: false, error: String(e?.message ?? e) }));
    return true;
  });
}
