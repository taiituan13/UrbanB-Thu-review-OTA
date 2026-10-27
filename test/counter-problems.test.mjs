import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HUB_GAPS_MAX,
  boardFaultIsCaused,
  counterProblems,
  dropSentGaps,
  indicatorsFaultIsCaused,
  problemsSignature,
  trackHubGap,
  withFault,
} from "../extension/quay/counter-problems.js";

const AT = "2026-10-24T03:00:00.000Z";
const codes = (list) => list.map((p) => p.code);

test("counterProblems: máy ổn ⇒ mảng rỗng (Hub xoá ảnh lỗi cũ)", () => {
  assert.deepEqual(counterProblems({ snap: { session: "ok", codeState: "ok", booking: { count: 2 } }, version: "1.5.0" }), []);
  assert.deepEqual(counterProblems(), []);
});

test("🔴 khung PMS chưa ghép ⇒ PMS_HOTEL_NOT_LINKED kèm mã KS; chờ đọc mã thì không phải lỗi", () => {
  assert.deepEqual(counterProblems({ snap: { session: "nobranch", why: "unmapped", hotelId: "12345", updatedAt: Date.parse(AT) } }), [
    { code: "PMS_HOTEL_NOT_LINKED", detail: "12345", since: AT },
  ]);
  assert.deepEqual(codes(counterProblems({ snap: { session: "nobranch", why: "scope" } })), ["PMS_OUT_OF_SCOPE"]);
  assert.deepEqual(codes(counterProblems({ snap: { session: "nobranch", why: "gone" } })), ["PMS_BRANCH_GONE"]);
  assert.deepEqual(counterProblems({ snap: { session: "nobranch", why: "wait" } }), []);
});

test("🔴 Booking OTA: chưa có mã · mã bị từ chối · Apps Script lỗi — mỗi lúc một mã", () => {
  assert.deepEqual(codes(counterProblems({ snap: { codeState: "none" } })), ["OTA_CODE_MISSING"]);
  assert.deepEqual(counterProblems({ snap: { codeState: "rejected", booking: { error: "Sai mã kết nối", at: Date.parse(AT) } } }), [
    { code: "OTA_CODE_REJECTED", detail: "Sai mã kết nối", since: AT },
  ]);
  assert.deepEqual(codes(counterProblems({ snap: { codeState: "ok", booking: { error: "Web App quá thời gian." } } })), ["OTA_SHEET_ERROR"]);
});

test("🔴 lỗi SW biết lúc gọi (bảng khoá, Khoá G2J, Chỉ báo) đi qua quayFaults", () => {
  const faults = withFault(withFault(withFault({}, "board", { at: AT, message: "x" }), "lock", { at: AT, message: "G2J ERROR" }), "indicators", { at: AT });
  assert.deepEqual(codes(counterProblems({ faults })), ["LOCK_BOARD_FAILED", "G2J_LOCK_FAILED", "INDICATORS_UNREACHABLE"]);
  // Lượt gọi ổn lại ⇒ xoá đúng lỗi ấy.
  assert.deepEqual(codes(counterProblems({ faults: withFault(faults, "lock", null) })), ["LOCK_BOARD_FAILED", "INDICATORS_UNREACHABLE"]);
  assert.deepEqual(withFault({}, "lạ", { at: AT }), {});
});

// YC-251 · H-2047 c — đo bãi thử 27/10 (máy 83ef4dc7, 1.5.5): chưa ghép mã ezCloud ⇒ máy báo thêm LOCK_BOARD_FAILED
// ("Hub chưa có mã kết nối…") và INDICATORS_UNREACHABLE. Ba lỗi cho một gốc.
test("🔴 Hub chưa biết chi nhánh ⇒ chỉ báo lỗi gốc PMS_*, không kèm bảng khoá và Chỉ báo", () => {
  const faults = withFault(withFault(withFault({}, "board", { at: AT, message: "Hub chưa có mã kết nối Booking OTA của chi nhánh này." }), "indicators", { at: AT }), "lock", { at: AT, message: "G2J ERROR" });
  for (const why of ["unmapped", "scope", "gone"]) {
    const r = codes(counterProblems({ snap: { session: "nobranch", why, hotelId: "17200", codeState: "unknown" }, faults }));
    assert.equal(r.includes("LOCK_BOARD_FAILED"), false, why);
    assert.equal(r.includes("INDICATORS_UNREACHABLE"), false, why);
    assert.equal(r.includes("G2J_LOCK_FAILED"), true, `${why}: Khoá G2J lễ tân bấm vẫn báo`);
  }
  // Đang chờ đọc mã (`wait`) không phải gốc nào ⇒ lỗi ghi được vẫn báo.
  assert.deepEqual(codes(counterProblems({ snap: { session: "nobranch", why: "wait" }, faults })), ["LOCK_BOARD_FAILED", "G2J_LOCK_FAILED", "INDICATORS_UNREACHABLE"]);
});

test("🔴 service worker: Hub chưa biết chi nhánh ⇒ xoá lỗi Chỉ báo, không ghi lỗi bảng khoá vì thiếu mã", () => {
  assert.equal(indicatorsFaultIsCaused("nobranch"), true);
  for (const s of ["net", "server", "forbidden", "out", "ok"]) assert.equal(indicatorsFaultIsCaused(s), false, s);
  assert.equal(boardFaultIsCaused("no-code", "nobranch"), true);
  assert.equal(boardFaultIsCaused("no-code", "ok"), false, "Hub biết chi nhánh mà chưa có mã ⇒ lỗi thật (OTA_CODE_MISSING kéo theo)");
  assert.equal(boardFaultIsCaused("timeout", "nobranch"), false, "Web App lỗi vẫn là lỗi");
  const src = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  assert.match(src, /if \(P\.indicatorsFaultIsCaused\(cls\.state\)\) await noteFault\("indicators", null\)/);
  assert.match(src, /if \(P\.boardFaultIsCaused\(e\.kind, e\.conn\?\.session\)\) await noteFault\("board", null\)/);
});

test("🔴 token bị từ chối, Go2Joy chờ chọn chi nhánh, thông báo không tải được, Tampermonkey cũ", () => {
  const r = counterProblems({
    tokenAt: { ezcloud: { outcome: "saved" }, go2joy: { outcome: "rejected", at: Date.parse(AT) } },
    g2jAsk: true,
    snap: { notifications: { state: "net" }, tampermonkey: true },
  });
  assert.deepEqual(r[0], { code: "TOKEN_REJECTED", detail: "go2joy", since: AT });
  assert.deepEqual(codes(r), ["TOKEN_REJECTED", "G2J_BRANCH_NOT_CHOSEN", "NOTIFICATIONS_UNREACHABLE", "TAMPERMONKEY_LEFT"]);
  // `unavailable` là tính năng ẩn, không phải lỗi.
  assert.deepEqual(counterProblems({ snap: { notifications: { state: "unavailable" } } }), []);
});

test("🔴 quét review: chưa cấu hình, lượt quét vỡ; lỗi gần nhất (kể cả dấu gửi Sheet của bản cũ) thì không", () => {
  const r = counterProblems({ reviewMissing: true, scanCrash: { at: AT, code: "SHEET-REJECT" }, lastError: { stage: "gửi Sheet", code: "SHEET-NET", at: AT } });
  assert.deepEqual(r, [{ code: "REVIEW_NOT_CONFIGURED" }, { code: "REVIEW_SCAN_CRASH", since: AT }]);
  // YC-228: 1.5.2 không ghi Sheet ⇒ máy còn mang dấu lỗi Sheet của 1.5.1 cũng không báo REVIEW_SHEET_FAILED.
  assert.deepEqual(counterProblems({ lastError: { stage: "gửi Sheet", code: "SHEET-URL", at: AT } }), []);
  assert.deepEqual(counterProblems({ lastError: { stage: "quét", code: "BKG-HTTP" } }), []);
});

test("🔴 kết nối Hub và bản cũ", () => {
  assert.deepEqual(codes(counterProblems({ snap: { session: "expired" } })), ["HUB_SESSION_EXPIRED"]);
  assert.deepEqual(codes(counterProblems({ snap: { session: "net" } })), ["HUB_UNREACHABLE"]);
  assert.deepEqual(counterProblems({ update: { latest: "1.6.0", at: AT }, version: "1.5.0" }), [
    { code: "UPDATE_AVAILABLE", detail: "1.6.0", since: AT },
  ]);
  assert.deepEqual(counterProblems({ update: { latest: "1.5.0" }, version: "1.5.0" }), []);
});

test("problemsSignature: chỉ theo mã, không theo thứ tự hay chi tiết", () => {
  assert.equal(problemsSignature([{ code: "B", detail: "1" }, { code: "A" }]), problemsSignature([{ code: "A" }, { code: "B", detail: "2" }]));
  assert.notEqual(problemsSignature([{ code: "A" }]), problemsSignature([]));
});

test("🔴 mọi mã gửi đi đều có trong danh mục của Hub (hợp đồng)", () => {
  const src = readFileSync(new URL("../extension/quay/counter-problems.js", import.meta.url), "utf8");
  const sent = new Set([...src.matchAll(/"([A-Z][A-Z0-9_]{3,})"/g)].map((m) => m[1]));
  const HUB = [
    "PMS_HOTEL_NOT_LINKED", "PMS_OUT_OF_SCOPE", "PMS_BRANCH_GONE", "OTA_CODE_MISSING", "OTA_CODE_REJECTED", "OTA_SHEET_ERROR",
    "LOCK_BOARD_FAILED", "G2J_LOCK_FAILED", "TOKEN_REJECTED", "G2J_BRANCH_NOT_CHOSEN", "INDICATORS_UNREACHABLE",
    "NOTIFICATIONS_UNREACHABLE", "TAMPERMONKEY_LEFT", "REVIEW_NOT_CONFIGURED", "REVIEW_SCAN_CRASH", "REVIEW_SHEET_FAILED",
    "HUB_SIGNED_OUT", "HUB_SESSION_EXPIRED", "HUB_UNREACHABLE", "UPDATE_AVAILABLE",
  ];
  for (const c of sent) assert.ok(HUB.includes(c), c);
});

test("🔴 nguồn sw.js: mọi lượt báo sống mang problems; ba lỗi lúc gọi được ghi và xoá", async () => {
  const { heartbeatBody } = await import("../extension/quay/counter-heartbeat.js");
  assert.deepEqual(heartbeatBody({ deviceId: "d", version: "1", problems: [] }).problems, []);
  assert.equal("problems" in heartbeatBody({ deviceId: "d", version: "1" }), false);
  const src = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  assert.match(src, /const problems = await problemsNow\(version\)/);
  assert.match(src, /^    problems,$/m);
  for (const kind of ["board", "lock", "indicators"]) {
    assert.match(src, new RegExp(`noteFault\\("${kind}", null\\)|noteFault\\("${kind}", outcome\\.ok \\? null`));
    assert.match(src, new RegExp(`noteFault\\("${kind}", \\{ at: now\\(\\)`));
  }
});

// ── YC-193 H-a b — lần mất kết nối Hub ───────────────────────────────────────────────────────────

const T0 = Date.parse("2026-10-24T01:00:00.000Z");
const T1 = Date.parse("2026-10-24T01:30:00.000Z");
const T2 = Date.parse("2026-10-24T02:00:00.000Z");
const isoOf = (t) => new Date(t).toISOString();

test("🔴 trackHubGap: hết phiên mở một lần; Hub trả lời lại ⇒ đóng, xếp hàng, báo `closed`", () => {
  const opened = trackHubGap(null, [], "expired", T0);
  assert.deepEqual(opened, { open: { code: "HUB_SESSION_EXPIRED", from: isoOf(T0) }, queue: [], closed: false });
  const still = trackHubGap(opened.open, opened.queue, "expired", T1);
  assert.deepEqual(still.open, opened.open, "cùng kiểu mất kết nối thì giữ lúc bắt đầu cũ");
  const back = trackHubGap(still.open, still.queue, "ok", T2);
  assert.deepEqual(back, {
    open: null,
    queue: [{ code: "HUB_SESSION_EXPIRED", from: isoOf(T0), to: isoOf(T2) }],
    closed: true,
  });
  assert.deepEqual(trackHubGap(null, [], "ok", T2), { open: null, queue: [], closed: false });
  assert.equal(trackHubGap(null, [], "nobranch", T2).closed, false);
});

test("🔴 trackHubGap: đổi kiểu mất kết nối ⇒ đóng lần cũ, mở lần mới; trạng thái lạ không đổi gì", () => {
  const net = trackHubGap(null, [], "net", T0);
  assert.equal(net.open.code, "HUB_UNREACHABLE");
  const out = trackHubGap(net.open, net.queue, "out", T1);
  assert.deepEqual(out.open, { code: "HUB_SIGNED_OUT", from: isoOf(T1) });
  assert.deepEqual(out.queue, [{ code: "HUB_UNREACHABLE", from: isoOf(T0), to: isoOf(T1) }]);
  assert.deepEqual(trackHubGap(out.open, out.queue, "missing", T2), { open: out.open, queue: out.queue, closed: false });
});

test("🔴 trackHubGap: hàng đợi giữ HUB_GAPS_MAX lần mới nhất", () => {
  let st = { open: null, queue: [] };
  for (let i = 0; i < HUB_GAPS_MAX + 2; i++) {
    st = trackHubGap(st.open, st.queue, "net", T0 + i * 60_000);
    st = trackHubGap(st.open, st.queue, "ok", T0 + i * 60_000 + 1000);
  }
  assert.equal(st.queue.length, HUB_GAPS_MAX);
  assert.equal(st.queue.at(-1).from, isoOf(T0 + (HUB_GAPS_MAX + 1) * 60_000));
});

test("🔴 dropSentGaps: bỏ đúng các lần Hub đã nhận, giữ lần xếp vào trong lúc gửi", () => {
  const a = { code: "HUB_UNREACHABLE", from: isoOf(T0), to: isoOf(T1) };
  const b = { code: "HUB_SIGNED_OUT", from: isoOf(T1), to: isoOf(T2) };
  assert.deepEqual(dropSentGaps([a, b], [a]), [b]);
  assert.deepEqual(dropSentGaps([a], []), [a]);
});

test("🔴 heartbeatBody mang hubGaps khi có; rỗng ⇒ vắng trường (lượt báo kiểu cũ)", async () => {
  const { heartbeatBody } = await import("../extension/quay/counter-heartbeat.js");
  const gap = { code: "HUB_UNREACHABLE", from: isoOf(T0), to: isoOf(T1) };
  assert.deepEqual(heartbeatBody({ deviceId: "d", version: "1.5.0", hubGaps: [gap] }).hubGaps, [gap]);
  assert.equal("hubGaps" in heartbeatBody({ deviceId: "d", version: "1.5.0" }), false);
});

test("🔴 nguồn sw.js: phiên đổi ⇒ ghi lần mất kết nối; tập lỗi đổi ⇒ báo Hub; chữ ký ghi trước khi gửi", () => {
  const src = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  assert.match(src, /async function noteSession\(cls\) \{\n  const gapState = [^\n]+\n  const gapClosed = await noteHubGap\(gapState\);/);
  assert.match(src, /hubGaps,\n  \}\);/);
  assert.match(src, /P\.dropSentGaps\(/);
  const sig = src.indexOf("await set(PROBLEMS_SIG_KEY");
  const send = src.indexOf("const reply = await hubFetch(url, init);");
  assert.ok(sig > 0 && send > sig, "chữ ký phải ghi trước lượt gửi");
  for (const fn of ["async function noteFault", "async function patchSnap"]) {
    const body = src.slice(src.indexOf(fn), src.indexOf("\n}\n", src.indexOf(fn)));
    assert.match(body, /void maybeReportProblems\(\)/, fn);
  }
});

// YC-246: lượt đọc số ezCloud lúc Quét hỏng không còn im.
// ĐỐI CHỨNG: bỏ dòng `readingFault` trong counterProblems ⇒ ĐỎ.
test("🔴 lượt đọc số ezCloud hỏng ⇒ mã PMS_READING_* kèm giờ; mã lạ bị bỏ", () => {
  assert.deepEqual(counterProblems({ readingFault: { code: "PMS_READING_AUTH", at: Date.parse(AT) } }), [{ code: "PMS_READING_AUTH", since: AT }]);
  assert.deepEqual(counterProblems({ readingFault: { code: "token=abc", at: Date.parse(AT) } }), []);
  assert.deepEqual(counterProblems({ readingFault: null }), []);
});
