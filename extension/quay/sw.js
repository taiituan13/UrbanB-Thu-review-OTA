// Service worker của "UrbanB tại quầy": mọi lượt gọi Hub và Apps Script đi từ đây.
// Đo P4 (BAO-CAO-LAN-yc112-extension-v2.md §1): fetch từ service worker mang cookie phiên Hub; fetch từ
// trang PMS bị CORS chặn. Khung trên PMS vì vậy chỉ nhắn tin cho tệp này.
//
// Tệp này không chứa luật: luật nằm ở booking-ota.js, hub-quay.js, indicators.js (có test).

import * as B from "./booking-ota.js";
import * as H from "./hub-quay.js";
import * as N from "./notifications.js";
import * as W from "./web-orders.js";
import * as C from "./counter-heartbeat.js";
import * as P from "./counter-problems.js";
import * as S from "./shift-handover.js";
import { DEV_FLAGS } from "../env.js";
import { BRANCH_KEY, HUB_COLLECT_KEY, MINE_KEY, loadEffectiveConfig, parseHubSettings, reviewMissingHelp, reviewMissingText } from "../hub-config.js";
import { CHANNELS, getDeviceId, loadStatus } from "../config.js";
import { CHANNEL_LABEL } from "../report.js";
import { TAB_RETRY_KEY, reviewStatusModel } from "./review-status.js";
import { HUB_TIMEOUT_MS, isTimeout } from "./net.js";

const K = {
  hub: "quayHubOrigin",
  ever: "quayEverSignedIn",
  last: "quayLastSession",
  lastHotel: "quayLastHotel",
  memo: "quayPushMemo",
  snap: "quaySnap",
  mine: MINE_KEY,
  branch: BRANCH_KEY,
  pmsSeen: "quayPmsSeen",
  conn: (h) => `quayConn:${h}`,
  hotelName: (h) => `quayHotelName:${h}`,
  report: (h) => `quayReport:${h}`,
  ind: (h) => `quayInd:${h}`,
  book: (h) => `quayBook:${h}`,
  board: (h) => `quayBoard:${h}`,
  tok: (k) => `quayTokenAt:${k}`,
  faults: P.FAULTS_KEY,
};

const get = async (key) => (await chrome.storage.local.get(key))[key];
const set = (key, value) => chrome.storage.local.set({ [key]: value });
const now = () => Date.now();

/** YC-193 — ghi (hoặc xoá, khi `fault` null) một lỗi SW biết lúc gọi, để lượt báo sống mang lên Hub. */
async function noteFault(kind, fault) {
  await set(K.faults, P.withFault(await get(K.faults), kind, fault));
  void maybeReportProblems();
}

/**
 * YC-193 H-a b — ghi lần mất kết nối Hub theo lượt gọi vừa xong (counter-problems.js trackHubGap). Chỉ ghi khi
 * có đổi. Trả `true` khi vừa đóng một lần (Hub trả lời lại) ⇒ nên báo Hub ngay để gửi bù.
 */
async function noteHubGap(state) {
  const got = await chrome.storage.local.get([P.HUB_GAP_KEY, P.HUB_GAPS_KEY]);
  const open = got[P.HUB_GAP_KEY] ?? null;
  const queue = got[P.HUB_GAPS_KEY] ?? [];
  const next = P.trackHubGap(open, queue, state, now());
  if (JSON.stringify([next.open, next.queue]) !== JSON.stringify([open, queue])) {
    await chrome.storage.local.set({ [P.HUB_GAP_KEY]: next.open, [P.HUB_GAPS_KEY]: next.queue });
  }
  return next.closed;
}

const PROBLEMS_SIG_KEY = "quayProblemsSig";
let reportingProblems = false;

/**
 * YC-193 H-b b — tập lỗi đang hiện khác lần báo gần nhất ⇒ báo Hub thêm một lượt, không chờ lượt quét. Đang mất
 * kết nối Hub thì thôi (gửi cũng hỏng); lúc có lại phiên, `force` gửi bù ngay. Một lượt một lúc. Không ném.
 */
async function maybeReportProblems({ force = false } = {}) {
  if (reportingProblems) return;
  reportingProblems = true;
  try {
    if (!force && (await get(P.HUB_GAP_KEY))) return;
    const sig = P.problemsSignature(await problemsNow(chrome.runtime.getManifest().version));
    if (force || sig !== (await get(PROBLEMS_SIG_KEY))) await sendHeartbeat();
  } catch {
    // Lượt báo hỏng thì lượt quét kế tiếp vẫn mang ảnh lỗi.
  } finally {
    reportingProblems = false;
  }
}

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
    // Lượt gọi tự có hạn (Booking OTA truyền `signal` riêng, dài hơn) ⇒ không lượt nào treo mãi (YC-158).
    const signal = init.signal ?? AbortSignal.timeout(HUB_TIMEOUT_MS);
    const res = await fetch(url, { ...init, signal, credentials: "include", cache: "no-store" });
    let json = null;
    const type = res.headers.get("content-type") ?? "";
    if (type.includes("json")) {
      try {
        json = await res.json();
      } catch {}
    }
    return { status: res.status, url: res.url, redirected: res.redirected, json };
  } catch (e) {
    return { netError: isTimeout(e) ? "Hết giờ chờ Hub trả lời" : String(e?.message ?? e) };
  }
}

/** Ghi trạng thái phiên Hub của lượt gọi vừa xong. */
async function noteSession(cls) {
  const gapState = cls.state === "out" ? H.sessionState("out", Boolean(await get(K.ever))) : cls.state;
  const gapClosed = await noteHubGap(gapState);
  if (gapClosed) void maybeReportProblems({ force: true });
  if (cls.state === "ok" || cls.state === "nobranch") {
    await chrome.storage.local.set({ [K.ever]: true, [K.last]: "ok" });
  } else if (cls.state === "out") {
    await set(K.last, "out");
    // Huy hiệu và popup đọc phiên từ ảnh trạng thái: hết phiên phải hiện ngay, không chờ khung mở lại.
    // Chỉ ghi khi phiên đổi: popup vẽ lại mỗi lần ảnh đổi và lại hỏi Hub, ghi mãi thành vòng lặp.
    const patch = H.outSessionPatch(await get(K.snap), Boolean(await get(K.ever)));
    if (patch) await patchSnap(patch);
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
  void maybeReportProblems();
  return next;
}

// ---------- Cấu hình chung đặt trên Hub (H-1348 a) ----------

/**
 * Mọi lời đáp 200 của route `connection` mang cấu hình chung (hoặc vắng nếu Hub chưa có dòng cấu hình).
 * Thay hẳn bản trước: trường nào Hub thôi gửi thì máy về mặc định (hub-config.js effectiveCollect).
 */
async function rememberSettings(json) {
  await set(HUB_COLLECT_KEY, { ...parseHubSettings(json), at: now() });
}

/**
 * Lượt liệt kê `scope=mine` (chỉ đọc, H-1351 c): cấu hình chung + danh sách cơ sở của người đăng nhập.
 * Thu review gọi trước mỗi lượt quét và mỗi 30 phút; popup gọi khi mở. Không gọi được Hub ⇒ giữ bản
 * đã nhận lần trước. Danh sách lưu không kèm mã kết nối (H.parseMine). Trả `{ state }`.
 */
export async function refreshHubSettings() {
  const cls = H.classifyHubReply(await hubFetch(H.mineUrl(await hubOriginNow())));
  await noteSession(cls);
  if (cls.state !== "ok") return { state: await sessionNow(cls) };
  await rememberSettings(cls.data);
  const branches = H.parseMine(cls.data);
  if (branches) await set(K.mine, { branches, at: now() });
  return { state: "ok" };
}

/** Popup: danh sách cơ sở (đọc lại từ Hub) và cơ sở máy đang dùng cho token Go2Joy. */
export async function myBranches() {
  const r = await refreshHubSettings();
  const mine = await get(K.mine);
  const chosenId = (await get(K.branch)) ?? "";
  return { state: r.state, branches: mine?.branches ?? null, chosenId, pick: H.pickBranch(mine?.branches ?? null, chosenId) };
}

/** Người dùng chọn cơ sở trong popup. Chỉ nhận cơ sở có trong danh sách; "" ⇒ bỏ chọn. */
export async function setBranch(branchId) {
  const id = String(branchId ?? "");
  if (!id) {
    await chrome.storage.local.remove(K.branch);
    return { ok: true };
  }
  const mine = await get(K.mine);
  if (!mine?.branches?.some((b) => b.id === id)) return { ok: false, error: "Cơ sở không có trong danh sách của tài khoản đang đăng nhập." };
  await set(K.branch, id);
  return { ok: true };
}

// ---------- Mã kết nối theo cơ sở ----------

/** Khoá bản đệm của một đích: mã khách sạn ezCloud (như 1.0.0) hoặc `b:<id cơ sở>` (H-1351 c). */
const targetKey = (t) => (t?.branchId ? `b:${t.branchId}` : String(t?.hotelId ?? ""));

/**
 * Lấy mã kết nối của cơ sở đang mở trên PMS. Bản đệm còn mới ⇒ dùng luôn, không hỏi Hub
 * (mỗi lượt hỏi ghi "máy quầy gọi lần cuối" ở Hub). `force` ⇒ hỏi lại. `report` ⇒ báo kết quả dùng mã.
 * Trả `{ session, why?, branch, otaSync, cached }`.
 */
export async function connection(hotelId, opts = {}) {
  return connectionFor({ hotelId }, opts);
}

/** Như `connection`, cho một đích `{ hotelId }` hoặc `{ branchId }` (cơ sở đã chọn từ danh sách). */
async function connectionFor(target, { force = false, report = null } = {}) {
  const key = targetKey(target);
  const cached = key ? await get(K.conn(key)) : null;
  if (!force && !report && cached && H.isFresh(cached, now(), H.CONNECTION_MAX_AGE_MS)) {
    return { session: "ok", branch: cached.branch, otaSync: H.usableOtaSync(undefined, cached), cached: true };
  }
  const origin = await hubOriginNow();
  const seen = target.hotelId ? { hotelName: (await get(K.hotelName(target.hotelId))) ?? "", deviceId: await getDeviceId() } : null;
  const url = target.branchId ? H.branchConnectionUrl(origin, target.branchId, report) : H.connectionUrl(origin, target.hotelId, report, seen);
  const reply = await hubFetch(url);
  const cls = H.classifyHubReply(reply);
  await noteSession(cls);
  if (cls.state === "ok") {
    await rememberSettings(cls.data);
    const entry = { branch: cls.data.branch ?? null, otaSync: cls.data.otaSync ?? null, at: now() };
    await set(K.conn(key), entry);
    return { session: "ok", branch: entry.branch, otaSync: H.usableOtaSync(entry.otaSync), cached: false };
  }
  const session = await sessionNow(cls);
  // H-1245 a: hết phiên (hoặc mất mạng) ⇒ Booking OTA chạy bằng mã đã nhận lần trước.
  return { session, why: cls.why, branch: cached?.branch ?? null, otaSync: H.usableOtaSync(undefined, cached), cached: Boolean(cached), message: cls.message };
}

/** Báo Hub kết quả dùng mã (chỉ khi kết quả đổi). Không chặn luồng chính. `target` như connectionFor. */
async function reportCodeOutcome(target, otaSync, outcome) {
  const key = targetKey(target);
  if (!key || !otaSync) return;
  const last = await get(K.report(key));
  const r = H.reportToSend(last, otaSync, outcome);
  if (!r) return;
  const res = await connectionFor(target, { report: r });
  if (res.session === "ok") await set(K.report(key), r);
}

// ---------- Apps Script ----------

async function scriptGet(otaSync, params) {
  if (!otaSync) throw new B.ApiError("no-code", "Hub chưa có mã kết nối Booking OTA của chi nhánh này.");
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
    reportCodeOutcome({ hotelId }, conn.otaSync, { kind: "accepted" }).catch(() => {});
    return { conn, ...out };
  } catch (e) {
    if (e.kind !== "rejected") throw Object.assign(e, { conn });
    await reportCodeOutcome({ hotelId }, conn.otaSync, { kind: "rejected", message: e.message });
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
    // YC-240 ②: Sheet báo kèm sức khoẻ token ezCloud ở lượt đọc gần đây (bản Apps Script cũ: null).
    const tokenHealth = q ? null : H.readTokenHealth(result, at);
    if (!q) {
      await set(K.book(hotelId), { matches, hotel, at, tokenHealth });
      await patchSnap({ booking: { count: matches.length, issues: B.countIssues(matches), at }, codeState: "ok", branchName: conn.branch?.name ?? "", tokenHealth });
    }
    return { ok: true, matches, hotel, at, codeState: "ok", session: conn.session, tokenHealth };
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
    await noteFault("board", null);
    const tokenHealth = H.readTokenHealth(result, entry.at);
    await patchSnap({ tokenHealth });
    return { ok: true, ...entry, tokenHealth };
  } catch (e) {
    // YC-251 · H-2047 c: Hub chưa biết chi nhánh ⇒ không có mã là hệ quả, lỗi gốc đã báo là PMS_* (counter-problems.js).
    if (P.boardFaultIsCaused(e.kind, e.conn?.session)) await noteFault("board", null);
    else await noteFault("board", { at: now(), message: e.message });
    return { ok: false, error: e.message, kind: e.kind, codeState: codeStateOf(e.conn, e), cached: await get(K.board(hotelId)) };
  }
}

export async function lock(hotelId, sourceKey, confirmPaid) {
  try {
    const { result } = await withCode(hotelId, B.lockParams(sourceKey, confirmPaid));
    const outcome = B.lockOutcome(result);
    // YC-157 · H-1535 a: Hub hiện lần Khoá G2J thành công gần nhất (và ai đang đăng nhập lúc ấy).
    await noteFault("lock", outcome.ok ? null : { at: now(), message: outcome.text });
    if (outcome.ok) sendHeartbeat({ g2jLock: { at: new Date(now()).toISOString() } }).catch(() => {});
    return { ok: true, ...outcome };
  } catch (e) {
    await noteFault("lock", { at: now(), message: e.message });
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
    await noteFault("indicators", null);
    return { state: "ok", ...entry, origin };
  }
  const session = await sessionNow(cls);
  // Hết phiên đã có mã riêng (HUB_*); Hub chưa biết chi nhánh đã có mã riêng (PMS_*, YC-251 · H-2047 c) ⇒ xoá lỗi
  // Chỉ báo cũ. Còn lại là Hub không trả lời được ⇒ ghi.
  if (P.indicatorsFaultIsCaused(cls.state)) await noteFault("indicators", null);
  else if (cls.state !== "out") await noteFault("indicators", { at: now(), message: cls.message });
  // Mất mạng / Hub lỗi ⇒ hiện số lượt trước, ghi rõ giờ (mockup trạng thái "net").
  return { state: session, why: cls.why, cached, failedAt: now(), message: cls.message, origin };
}

// ---------- Đơn web urbanb.vn lệch số booking (YC-171) ----------

/** Cần phiên Hub còn sống: hết phiên thì khung báo đăng nhập, không có bản lưu (đơn đổi theo lễ tân bấm). */
export async function webOrders(hotelId) {
  const origin = await hubOriginNow();
  const cls = H.classifyHubReply(await hubFetch(W.webOrdersUrl(origin, hotelId)));
  await noteSession(cls);
  const r = W.listState(cls);
  if (r.state === "out") r.state = await sessionNow(cls);
  return { ...r, at: now() };
}

export async function resolveWebOrder(hotelId, id) {
  if (!hotelId || !id) return { ok: false, text: "Thiếu mã đơn." };
  const origin = await hubOriginNow();
  const r = W.resolveState(await hubFetch(origin + W.WEB_ORDERS_PATH, W.resolveInit(hotelId, id)));
  if (r.state === "out") await noteSession({ state: "out" });
  return r;
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
    if (hotelId) await rememberHotel(hotelId, tabId);
  }
  // quiet = token đọc từ bộ nhớ trang (bridge.js), không phải token trang gửi kèm request.
  if (quiet && !B.storageTokenPushable(kind, token)) return { hotelId };
  const job = pending[kind];
  if (job && job.token === token) {
    job.hotelSn = job.hotelSn || hotelSn;
    job.quiet = job.quiet && quiet;
    return { hotelId };
  }
  // Go2Joy không mang mã khách sạn ezCloud ⇒ cơ sở chốt lúc gửi (go2joyTarget, H-1351 c).
  const forHotel = hotelId || (kind === "go2joy" ? "" : (await get(K.lastHotel)) || "");
  if (!forHotel && kind !== "go2joy") return { hotelId };
  clearTimeout(job?.timer);
  pending[kind] = { token, hotelSn, quiet, since: now(), hotelId: forHotel };
  pending[kind].timer = setTimeout(() => flushToken(kind), B.PUSH_DEBOUNCE_MS);
  return { hotelId };
}

/** Cơ sở PMS đang mở: nhớ làm "khách sạn PMS mở gần nhất" (đích token) và cho tab này (quay:tabHotel). */
async function rememberHotel(hotelId, tabId) {
  await set(K.lastHotel, hotelId);
  if (tabId != null) await chrome.storage.session.set({ [`quayTab:${tabId}`]: hotelId }).catch(() => {});
}

/** Mã khách sạn bridge.js đọc từ tiêu đề tab PMS (PMS 10/2026 không còn gửi token kèm request, làn yc152-ma-ks). */
export async function onPageHotel(hotelId, tabId, hotelName = "") {
  const id = String(hotelId ?? "");
  if (!/^\d+$/.test(id)) return { ok: false };
  await rememberHotel(id, tabId);
  // YC-192: tên khách sạn trên ezCloud (tiêu đề tab) đi kèm lượt hỏi mã kết nối, để Hub liệt kê mã chưa ghép.
  const name = String(hotelName ?? "").trim().slice(0, 200);
  if (name) await set(K.hotelName(id), name);
  await set(K.pmsSeen, { at: now(), hotelId: id });
  return { ok: true };
}

async function flushToken(kind) {
  const job = pending[kind];
  if (!job) return;
  if (kind === "go2joy" && !job.hotelSn && now() - job.since < B.GO2JOY_WAIT_FOR_HOTELSN_MS) {
    job.timer = setTimeout(() => flushToken(kind), B.PUSH_DEBOUNCE_MS);
    return;
  }
  delete pending[kind];
  const target = kind === "go2joy" ? await go2joyTarget(job.quiet) : { hotelId: job.hotelId };
  if (!target) return;
  const conn = await connectionFor(target);
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
  // Lượt đẩy gần nhất: khung và popup giữ dòng "bị từ chối / chờ xác nhận" theo bản ghi này tới lượt lưu được (YC-240 ①).
  await set(K.tok(kind), { at: now(), outcome: reply.outcome, message: reply.message, hotel: reply.hotel, codeRejected: Boolean(reply.codeRejected) });
  // YC-157 · H-1535 a: Hub hiện lần đẩy phiên PMS gần nhất của máy. Không chặn luồng chính.
  sendHeartbeat({ tokenPush: C.tokenPushOf(kind, reply.outcome, now()) }).catch(() => {});
  if (kind === "ezcloud" && ok) await patchSnap({ tokenAt: now() });
  if (reply.codeRejected) await reportCodeOutcome(target, code, { kind: "rejected", message: reply.message });
  else if (ok) reportCodeOutcome(target, code, { kind: "accepted" }).catch(() => {});
  // Lời báo cho lễ tân (userscript: notify): lưu mới / chờ xác nhận / bị từ chối lần đầu.
  const repeated = lastError === reply.message;
  const say =
    reply.outcome === "saved" ? { tone: "ok", text: reply.message }
    : reply.outcome === "pending" ? { tone: "warn", text: reply.message }
    : reply.outcome === "rejected" && !job.quiet && !repeated ? { tone: "err", text: reply.message }
    : null;
  if (say) broadcast({ type: "quay:tokenNote", kind, ...say, hotel: reply.hotel });
}

/** Nhắc chọn cơ sở trên PMS / HA Go2Joy tối đa mỗi 10 phút một lần (hằng kỹ thuật). */
const ASK_AGAIN_MS = 10 * 60 * 1000;
let askedAt = 0;

/**
 * Đích của token Go2Joy (H.go2joyTarget). Danh sách cơ sở cũ hơn 30 phút ⇒ đọc lại (lượt chỉ đọc).
 * Nhiều cơ sở mà chưa chọn ⇒ không gửi, nhắc lễ tân chọn trong popup (tối đa 10 phút một lần).
 */
async function go2joyTarget(quiet) {
  let mine = await get(K.mine);
  if (!H.isFresh(mine, now(), H.CONNECTION_MAX_AGE_MS)) {
    await refreshHubSettings().catch(() => {});
    mine = await get(K.mine);
  }
  const t = H.go2joyTarget({ branches: mine?.branches ?? null, chosenId: (await get(K.branch)) ?? "", lastHotel: (await get(K.lastHotel)) ?? "" });
  if (!t?.ask) return t;
  if (!quiet && now() - askedAt > ASK_AGAIN_MS) {
    askedAt = now();
    broadcast({ type: "quay:tokenNote", kind: "go2joy", tone: "warn", text: `Chưa gửi token Go2Joy: tài khoản Hub có ${t.count} chi nhánh. Bấm icon UrbanB trên thanh Chrome, chọn chi nhánh của máy này.` });
  }
  return null;
}

async function broadcast(msg) {
  const tabs = await chrome.tabs.query({ url: ["https://pms.ezcloudhotel.com/*", "https://ha.go2joy.vn/*"] }).catch(() => []);
  for (const t of tabs) chrome.tabs.sendMessage(t.id, msg).catch(() => {});
}

// ---------- Trạng thái cho khung và popup ----------

/** Khung trên PMS mở ra: phiên, cơ sở, mã, bản đệm để vẽ ngay. */
export async function hello(hotelId) {
  await set(K.pmsSeen, { at: now(), hotelId });
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
  const tokens = { ezcloud: (await get(K.tok("ezcloud"))) ?? null, go2joy: (await get(K.tok("go2joy"))) ?? null };
  return { ...snap, session, origin, net: cls.state === "net", tokens };
}

/**
 * Màn Cài extension trên Hub (YC-156 · H-1526 a): extension theo Hub của trang. Cùng Hub ⇒ không xoá gì;
 * Hub khác trong danh sách cho phép ⇒ đổi như ô chọn Hub cũ (setHubOrigin); ngoài danh sách ⇒ bỏ qua.
 */
export async function followHubPage(origin) {
  const act = H.followHub(await get(K.hub), origin);
  if (act === "reject") return { ok: false };
  if (act === "switch") await setHubOrigin(origin);
  return { ok: true, switched: act === "switch" };
}

/** Hỏi Hub scope=mine khi trang Cài extension hỏi trạng thái: không dày hơn 15 giây một lần (hằng kỹ thuật). */
const EXT_REFRESH_MIN_MS = 15_000;
let extRefreshedAt = 0;

/**
 * Trạng thái cho trang Hub (tin `ext:status`, H.extStatusOf). Trang ở màn Cài extension ⇒ theo Hub của
 * trang rồi đồng bộ ngay (scope=mine, chỉ đọc): đăng nhập Hub một lần là máy nhận cơ sở và cấu hình.
 * Trang Hub khác ⇒ chỉ đọc bộ nhớ, không gọi Hub.
 */
export async function extStatus(pageOrigin, path) {
  let session = null;
  if (H.isExtensionPage(path) && (await followHubPage(pageOrigin)).ok && now() - extRefreshedAt > EXT_REFRESH_MIN_MS) {
    extRefreshedAt = now();
    session = (await refreshHubSettings().catch(() => null))?.state ?? null;
  }
  if (session == null) {
    const last = await get(K.last);
    session = last === "ok" ? "ok" : last === "out" ? await sessionNow({ state: "out" }) : null;
  }
  const [cfg, status, mine, chosenId, pms, snap] = await Promise.all([loadEffectiveConfig(), loadStatus(), get(K.mine), get(K.branch), get(K.pmsSeen), get(K.snap)]);
  const view = H.extStatusOf({
    version: chrome.runtime.getManifest().version,
    hub: await hubOriginNow(),
    pageOrigin,
    session,
    branches: mine?.branches ?? null,
    chosenId: chosenId ?? "",
    pms,
    snap,
    // `fromHub` (hợp đồng màn Cài extension): tới 1.5.1 là "Sheet theo Hub"; từ 1.5.2 không còn Sheet nên là
    // "chi nhánh của máy theo Hub". false ⇒ màn ấy ghi máy đang chạy bằng cấu hình cũ trong bộ nhớ.
    review: { configured: !reviewMissingText(cfg.review), fromHub: cfg.review.fromHub.hotel, model: reviewModelOf(cfg, status) },
  });
  return { ok: true, status: view };
}

/**
 * Mô hình thu review của máy này (quay/review-status.js), chỉ tính kênh đang bật. `retries` = kênh chờ đọc lại
 * vì tab quét bị đóng (YC-238), chỉ khung quầy cần.
 */
function reviewModelOf(cfg, status, retries = null) {
  return reviewStatusModel({ status, order: CHANNELS, enabled: cfg.enabled, labels: CHANNEL_LABEL, missing: reviewMissingHelp(cfg.review), retries });
}

// ---------- Máy quầy báo Hub (YC-157) ----------

/** Chi nhánh của máy: chi nhánh duy nhất hoặc đã chọn (scope=mine), không có thì chi nhánh của PMS mở gần nhất. */
async function heartbeatBranchId() {
  const [mine, chosenId, lastHotel] = await Promise.all([get(K.mine), get(K.branch), get(K.lastHotel)]);
  const pick = H.pickBranch(mine?.branches ?? null, chosenId ?? "");
  if (pick.branch?.id) return pick.branch.id;
  const id = lastHotel ? (await get(K.conn(lastHotel)))?.branch?.id : null;
  return typeof id === "string" ? id : "";
}

/** YC-193 — ảnh mọi lỗi đang hiện cho lễ tân, đọc từ bộ nhớ (counter-problems.js). */
async function problemsNow(version) {
  const keys = [K.snap, K.faults, K.tok("ezcloud"), K.tok("go2joy"), K.mine, K.branch, "scanCrash", "lastError", "update"];
  const got = await chrome.storage.local.get(keys);
  const cfg = await loadEffectiveConfig();
  return P.counterProblems({
    snap: got[K.snap] ?? null,
    faults: got[K.faults] ?? null,
    tokenAt: { ezcloud: got[K.tok("ezcloud")], go2joy: got[K.tok("go2joy")] },
    scanCrash: got.scanCrash ?? null,
    lastError: got.lastError ?? null,
    update: got.update ?? null,
    version,
    reviewMissing: Boolean(reviewMissingText(cfg.review)),
    g2jAsk: H.pickBranch(got[K.mine]?.branches ?? null, got[K.branch] ?? "").state === "ask",
  });
}

/**
 * Một lượt báo Hub. `scan` ⇒ kèm ảnh kênh và lượt lỗi của lần quét vừa xong; không ⇒ Hub giữ ảnh kênh
 * cũ. Lượt lỗi chưa báo được (mất mạng, hết phiên) nằm lại hàng đợi, gửi kèm lượt sau. Không ném.
 */
export async function sendHeartbeat({ scan = false, tokenPush = null, g2jLock = null } = {}) {
  let model = null;
  let failures = (await get(C.HEARTBEAT_QUEUE_KEY)) ?? [];
  if (scan) {
    const [cfg, status] = await Promise.all([loadEffectiveConfig(), loadStatus()]);
    model = reviewModelOf(cfg, status);
    failures = C.mergeFailures(failures, C.failuresOf(model));
  }
  const version = chrome.runtime.getManifest().version;
  const problems = await problemsNow(version);
  const hubGaps = (await get(P.HUB_GAPS_KEY)) ?? [];
  // Ghi chữ ký TRƯỚC khi gửi: lượt hỏng (401) không làm maybeReportProblems gửi lại mãi cùng một ảnh.
  await set(PROBLEMS_SIG_KEY, P.problemsSignature(problems));
  const body = C.heartbeatBody({
    deviceId: await getDeviceId(),
    version,
    branchId: await heartbeatBranchId(),
    model,
    failures,
    tokenPush,
    g2jLock,
    problems,
    hubGaps,
  });
  const { url, init } = C.heartbeatRequest(await hubOriginNow(), body);
  const reply = await hubFetch(url, init);
  const ok = reply.status === 200 && reply.json?.ok === true;
  if (reply.status === 401) await noteSession({ state: "out" });
  await set(C.HEARTBEAT_QUEUE_KEY, ok ? [] : failures);
  if (ok && hubGaps.length) await set(P.HUB_GAPS_KEY, P.dropSentGaps((await get(P.HUB_GAPS_KEY)) ?? [], hubGaps));
  // Hub vừa nhận lượt báo ⇒ phiên có lại: đóng lần mất kết nối đang mở và gửi bù ngay.
  if (ok && (await noteHubGap("ok"))) void maybeReportProblems({ force: true });
  return { ok };
}

/** YC-158 — dòng Thu review của khung quầy: đọc bộ nhớ, không gọi mạng. */
export async function reviewStatus() {
  const [cfg, status, retries] = await Promise.all([loadEffectiveConfig(), loadStatus(), get(TAB_RETRY_KEY)]);
  return { ok: true, model: reviewModelOf(cfg, status, retries) };
}


export async function setHubOrigin(origin) {
  const o = H.hubOrigin(origin);
  await chrome.storage.local.set({ [K.hub]: o, [K.ever]: false, [K.last]: null, [K.snap]: {} });
  // Cấu hình chung, danh sách cơ sở và cơ sở đã chọn là của Hub cũ ⇒ bỏ, lượt gọi sau nhận của Hub mới.
  await chrome.storage.local.remove([HUB_COLLECT_KEY, K.mine, K.branch]);
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
  if (r.state === "ok") {
    await set(K.ever, true);
    // Route thông báo không kèm thời gian tự ẩn ⇒ dùng số route `connection` gửi (H-1348 a).
    if (!r.toastFromHub) {
      const hub = await get(HUB_COLLECT_KEY);
      if (hub?.toastSeconds) r.toastSeconds = hub.toastSeconds;
    }
  }
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

// ---------- Bàn giao ca PMS (YC-246, H-2034 b) ----------

let flushingHandovers = null;

/**
 * Gửi Hub mọi lượt Bàn giao ca đang chờ (quay/shift-handover.js). Một lượt một lúc. Hub lỗi tạm ⇒ lượt ở lại
 * hàng; Hub cũ chưa có route ⇒ ở lại hàng, không báo gì lên khung quầy. Không ném.
 */
export function flushShiftHandovers() {
  flushingHandovers ??= (async () => {
    try {
      const queue = S.pruneQueue(await get(S.QUEUE_KEY), now());
      const origin = await hubOriginNow();
      const done = new Map();
      for (const entry of queue) {
        const { url, init } = S.shiftHandoverRequest(origin, entry.report);
        const verdict = S.settle(await hubFetch(url, init));
        if (verdict.out) await noteSession({ state: "out" });
        if (verdict.action !== "keep") done.set(entry.key, verdict.action);
      }
      // Đọc lại hàng: lượt mới xếp vào trong lúc đang gửi không bị ghi đè.
      const [latest, sent] = await Promise.all([get(S.QUEUE_KEY), get(S.SENT_KEY)]);
      let nextSent = sent ?? [];
      for (const [key, action] of done) if (action === "sent") nextSent = S.markSent(nextSent, key);
      const nextQueue = S.pruneQueue(latest, now()).filter((e) => !done.has(e.key));
      await chrome.storage.local.set({ [S.QUEUE_KEY]: nextQueue, [S.SENT_KEY]: nextSent });
    } catch {
      // Hàng chờ vẫn nằm trong bộ nhớ; lượt sau gửi lại.
    } finally {
      flushingHandovers = null;
    }
  })();
  return flushingHandovers;
}

/** bridge.js báo một lượt Bàn giao thành công trên PMS: xếp hàng (chống trùng theo ca) rồi gửi. */
export async function onShiftHandover(report) {
  const clean = S.cleanReport(report);
  if (!clean) return { ok: false };
  await flushingHandovers;
  const [queue, sent] = await Promise.all([get(S.QUEUE_KEY), get(S.SENT_KEY)]);
  await set(S.QUEUE_KEY, S.enqueue(S.pruneQueue(queue, now()), sent, clean, now()));
  await flushShiftHandovers();
  return { ok: true };
}

// ---------- Tin nhắn ----------

const HANDLERS = {
  "quay:hello": (m) => hello(String(m.hotelId ?? "")),
  "quay:bookings": (m) => bookings(String(m.hotelId ?? ""), String(m.q ?? "").trim()),
  "quay:board": (m) => board(String(m.hotelId ?? "")),
  "quay:lock": (m) => lock(String(m.hotelId ?? ""), String(m.sourceKey ?? ""), Boolean(m.confirmPaid)),
  "quay:indicators": (m) => indicators(String(m.hotelId ?? "")),
  "quay:webOrders": (m) => webOrders(String(m.hotelId ?? "")),
  "quay:review": () => reviewStatus(),
  "quay:webOrderResolve": (m) => resolveWebOrder(String(m.hotelId ?? ""), String(m.id ?? "")),
  "quay:token": (m, sender) => onToken(m, sender?.tab?.id),
  "quay:shiftHandover": (m) => onShiftHandover(m.report),
  "quay:pageHotel": (m, sender) => onPageHotel(m.hotelId, sender?.tab?.id, m.hotelName),
  "quay:tabHotel": async (_m, sender) => ({ hotelId: sender?.tab?.id != null ? (await chrome.storage.session.get(`quayTab:${sender.tab.id}`).catch(() => ({})))[`quayTab:${sender.tab.id}`] ?? "" : "" }),
  "quay:openHub": (m) => openHub(String(m.path ?? "/")),
  "quay:status": () => statusForPopup(),
  "quay:mine": () => myBranches(),
  "quay:setBranch": (m) => setBranch(m.branchId),
  "quay:setHub": (m) => setHubOrigin(String(m.origin ?? "")),
  // Trang Hub (hub-bridge.js): gốc lấy từ người gửi, không lấy từ tin.
  "quay:extStatus": (m, sender) => extStatus(senderOrigin(sender), String(m.path ?? "")),
  "quay:tm": (m) => tampermonkeySeen(m.present),
  "quay:notifications": () => notifications(),
  "quay:notiRead": (m) => readNotifications(m.ids),
  // Chỉ bản dựng đo: thêm một thông báo giả để thử thông báo nổi.
  "quay:notiFakePush": (m) => (DEV_FLAGS.fakeNotifications ? notiSource().then((src) => src.push(m.partial ?? {})) : { ok: false }),
};

/** Gốc trang của content script gửi tin; không phải tab (popup, trang extension) ⇒ "". */
function senderOrigin(sender) {
  if (!sender?.tab) return "";
  try {
    return sender.origin ?? new URL(sender.url).origin;
  } catch {
    return "";
  }
}

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
