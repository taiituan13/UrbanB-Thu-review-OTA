import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { counterProblems, problemsSignature, withFault } from "../extension/quay/counter-problems.js";

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

test("🔴 quét review: chưa cấu hình, lượt quét vỡ, lỗi gửi Sheet; lỗi giai đoạn khác thì không", () => {
  const r = counterProblems({ reviewMissing: true, scanCrash: { at: AT, code: "SHEET-REJECT" }, lastError: { stage: "gửi Sheet", code: "SHEET-NET", at: AT } });
  assert.deepEqual(r, [
    { code: "REVIEW_NOT_CONFIGURED" },
    { code: "REVIEW_SCAN_CRASH", since: AT },
    { code: "REVIEW_SHEET_FAILED", detail: "SHEET-NET", since: AT },
  ]);
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
  assert.match(src, /problems: await problemsNow\(version\)/);
  for (const kind of ["board", "lock", "indicators"]) {
    assert.match(src, new RegExp(`noteFault\\("${kind}", null\\)|noteFault\\("${kind}", outcome\\.ok \\? null`));
    assert.match(src, new RegExp(`noteFault\\("${kind}", \\{ at: now\\(\\)`));
  }
});
