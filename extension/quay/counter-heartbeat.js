// Máy quầy báo Hub (YC-157 · H-1530 a · H-1535 a · H-1714 a): sau mỗi lượt quét (kể cả lượt lỗi), sau mỗi
// lần đẩy phiên PMS và sau mỗi lần Khoá G2J thành công, máy gửi một lượt báo để Hub biết máy còn sống,
// kênh nào đang lỗi, lần đẩy phiên và lần khoá gần nhất. Logic thuần: không gọi mạng, không đọc chrome.*.
//
// Hợp đồng (repo UrbanB, chỉ đọc: src/modules/reviews/counter-extension/counter-device.rules.ts):
//   POST /api/extension/connection
//   { deviceId, version, branchId?, channels?, failures?, tokenPush?, g2jLock? }
// - `channels` vắng ⇒ Hub giữ ảnh kênh cũ (lượt báo sau lần đẩy phiên hay lần khoá không mang ảnh kênh).
// - `failures`: từng lượt lỗi `{ channel, kind: error|login, code?, ref, at }`; Hub chỉ ghi thêm, lượt trùng
//   `ref` không ghi lại ⇒ gửi lại an toàn.
// - `tokenPush`: `{ at, kind: ezcloud|go2joy, result: saved|waiting|rejected }` · `g2jLock`: `{ at }`.
// Lời đáp: 200 `{ ok, failuresAdded }` · 400 INVALID_BODY · 401 NOT_SIGNED_IN · 403 OUT_OF_SCOPE / FORBIDDEN_ORIGIN ·
//          404 BRANCH_NOT_FOUND.
// Không gửi lời hướng dẫn, URL hay mã bí mật: lời hướng dẫn sống trong extension, đổi theo bản.

import { CONNECTION_PATH } from "./hub-quay.js";

/** Trần số lượt lỗi một lần báo, khớp `HEARTBEAT_FAILURES_MAX` của Hub. */
export const HEARTBEAT_FAILURES_MAX = 20;

/** Khoá hàng đợi lượt lỗi chưa báo được Hub (mất mạng, hết phiên): gửi kèm lượt báo sau. */
export const HEARTBEAT_QUEUE_KEY = "quayHbFailures";

/** Kết quả đẩy phiên của `flushToken` ⇒ chữ Hub hiểu. `bad-reply` và `retry` không báo. */
const TOKEN_RESULT = { saved: "saved", pending: "waiting", rejected: "rejected" };

const iso = (v) => {
  const d = new Date(v ?? "");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Ảnh kênh gửi Hub từ mô hình thu review (review-status.js): chỉ các trường không lộ gì. */
export function heartbeatChannels(model) {
  return (model?.rows ?? []).map((r) => ({ channel: r.key, state: r.state, at: r.at, okAt: r.okAt, code: r.code, ref: r.ref }));
}

/** Kênh đang lỗi ở mô hình ⇒ lượt lỗi gửi Hub. Kênh lỗi mà chưa có mã tham chiếu thì không gửi (Hub cần `ref`). */
export function failuresOf(model) {
  return (model?.rows ?? [])
    .filter((r) => (r.state === "error" || r.state === "login") && r.ref && iso(r.at))
    .map((r) => ({ channel: r.key, kind: r.state, code: r.code ?? null, ref: r.ref, at: iso(r.at) }));
}

/** Gộp hàng đợi cũ với lượt lỗi mới: trùng `ref` giữ một, giữ tối đa `HEARTBEAT_FAILURES_MAX` lượt mới nhất. */
export function mergeFailures(queue, fresh) {
  const byRef = new Map();
  for (const f of [...(Array.isArray(queue) ? queue : []), ...(Array.isArray(fresh) ? fresh : [])]) {
    if (f?.ref && !byRef.has(f.ref)) byRef.set(f.ref, f);
  }
  return [...byRef.values()].slice(-HEARTBEAT_FAILURES_MAX);
}

/** Lần đẩy phiên PMS ⇒ `tokenPush`; kết quả Hub không biết ⇒ null (không báo). */
export function tokenPushOf(kind, outcome, at) {
  const result = TOKEN_RESULT[outcome];
  const when = iso(at);
  if (!result || !when || (kind !== "ezcloud" && kind !== "go2joy")) return null;
  return { at: when, kind, result };
}

/**
 * Thân lượt báo. `model` null ⇒ không mang ảnh kênh (Hub giữ ảnh cũ). `branchId` rỗng ⇒ vắng: Hub giữ
 * chi nhánh cũ của máy (máy nhiều chi nhánh chưa chọn chi nhánh vẫn báo được là còn sống).
 */
export function heartbeatBody({ deviceId, version, branchId = "", model = null, failures = [], tokenPush = null, g2jLock = null }) {
  const body = { deviceId: String(deviceId ?? ""), version: String(version ?? "") };
  if (branchId) body.branchId = String(branchId);
  if (model) body.channels = heartbeatChannels(model);
  if (failures?.length) body.failures = failures.slice(0, HEARTBEAT_FAILURES_MAX);
  if (tokenPush) body.tokenPush = tokenPush;
  if (g2jLock) body.g2jLock = g2jLock;
  return body;
}

export function heartbeatRequest(origin, body) {
  return {
    url: origin + CONNECTION_PATH,
    init: { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  };
}
