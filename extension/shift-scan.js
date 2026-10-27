// YC-239 (H-1996 a, H-1976 c) — lượt quét do trang Giao ca quầy trên Hub ra lệnh. Phần thuần, test được ngoài Chrome.
//
// Trang Hub gửi `ext:scan` qua hub-bridge.js; hub-bridge.js mở một cổng (chrome.runtime.connect, tên SCAN_PORT)
// tới service worker; service worker chạy một lượt quét mọi kênh máy này đang quét (hoặc gắn vào lượt đang chạy)
// và gửi lại tiến độ từng kênh cùng đúng một kết quả. Hợp đồng đầy đủ: docs/hop-dong-hub-bridge.md.
//
// Mọi tin gửi trang dựng từ danh sách trường cố định dưới đây: không token, mã bí mật, URL Sheet, email, mã kết
// nối OTA, không câu lỗi thô (câu lỗi thô có thể mang đường dẫn trang). Lời hướng dẫn lấy từ danh mục mã lỗi.

import { hubChannels, reviewStatusModel } from "./quay/review-status.js";

/** Tên cổng giữa hub-bridge.js và service worker. */
export const SCAN_PORT = "urbanb-hub-scan";

/** Tên tin trên trang (window.postMessage). */
export const MSG = Object.freeze({
  scan: "ext:scan",
  accepted: "ext:scan-accepted",
  progress: "ext:scan-progress",
  result: "ext:scan-result",
});

/** `requestId` do trang sinh: chuỗi ngắn, chỉ chữ số, chữ Latin, gạch nối, gạch dưới. Sai ⇒ bỏ qua tin. */
export const REQUEST_ID_MAX = 64;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]+$/;

/** `requestId` hợp lệ thì trả lại chính nó, không thì `null`. */
export function parseRequestId(value) {
  if (typeof value !== "string" || !value.length || value.length > REQUEST_ID_MAX) return null;
  return REQUEST_ID_RE.test(value) ? value : null;
}

/**
 * Người gửi qua cổng là content script trên một trang Hub thật: có tab, khung chính, gốc nằm trong `origins`
 * (env.js HUB_ORIGINS, đúng các gốc manifest khai cho hub-bridge.js). Gốc lấy từ Chrome, không lấy từ tin.
 */
export function isHubSender(sender, origins) {
  if (!sender?.tab || (sender.frameId != null && sender.frameId !== 0)) return false;
  let origin = sender.origin;
  if (!origin) {
    try {
      origin = new URL(sender.url).origin;
    } catch {
      return false;
    }
  }
  return origins.includes(origin);
}

/**
 * Lượt quét giao ca gặp lượt đang chạy (H-1976 c, không mở lượt thứ hai):
 * - không có lượt nào ⇒ "started": mở lượt mới, mọi kênh đang bật;
 * - lượt đang chạy là lượt mọi kênh (hẹn giờ, Quét review ngay, lượt giao ca khác) ⇒ "joined": gắn trang vào lượt ấy;
 * - lượt đang chạy chỉ quét một số kênh (Quét lại kênh này, tự quét sau đăng nhập, đọc lại sau khi tab bị đóng)
 *   ⇒ "queued": chờ lượt ấy xong rồi mới mở lượt mọi kênh, không chạy chồng.
 */
export function joinMode(running, current) {
  if (!running) return "started";
  return current?.full ? "joined" : "queued";
}

/**
 * YC-252 (user chốt 27/10/2026, H-2053 a): trang Giao ca gửi kèm `reuseOkWithinMinutes` — kênh đã quét ĐẠT trong ngần ấy
 * phút thì dùng lại, không mở trang kênh. Số phút do Hub giữ (`HANDOVER_REUSE_OK_WITHIN_MINUTES`); ở đây chỉ kiểm
 * hình dạng. Trần kỹ thuật một ngày. Sai hay vắng ⇒ `null` (quét đủ mọi kênh như bản trước).
 */
export const REUSE_MINUTES_MAX = 24 * 60;

export function parseReuseMinutes(value) {
  return Number.isSafeInteger(value) && value > 0 && value <= REUSE_MINUTES_MAX ? value : null;
}

/**
 * Giờ ISO của lượt quét đạt dùng lại được cho kênh, hay `null` (phải quét lại). `status` là trạng thái kênh đã lưu
 * (config.js saveChannelStatus). Chỉ dùng lại khi lượt GẦN NHẤT của kênh là đạt và đã lên Hub (H-2053 a: kênh lỗi, cần
 * đăng nhập, hay gửi Hub hỏng thì luôn quét lại), và giờ đạt nằm trong `minutes` phút trước `nowMs`.
 */
export function reusableOkAt(status, minutes, nowMs) {
  if (!minutes || !status || status.state !== "ok" || status.hub?.ok === false) return null;
  const at = Date.parse(status.okAt ?? status.at ?? "");
  if (!Number.isFinite(at) || at > nowMs || nowMs - at > minutes * 60_000) return null;
  return new Date(at).toISOString();
}

/** Trạng thái kênh trong tin gửi trang. */
export const CHANNEL_STATE = Object.freeze({
  running: "running", // đang quét (chỉ có trong ext:scan-progress)
  ok: "ok", // đạt: đọc xong và đã lên Hub
  error: "error", // lỗi: xem `code`
  login: "login", // cần đăng nhập lại trang kênh
  notRun: "not-run", // lượt dừng trước khi tới kênh này (chỉ có khi outcome không phải "done")
});

/** Kết cục cả lượt trong ext:scan-result. */
export const OUTCOME = Object.freeze({
  done: "done", // đã đi hết các kênh; trạng thái thật của từng kênh nằm trong `channels`
  notConfigured: "not-configured", // máy chưa đủ cấu hình thu review, không quét kênh nào
  failed: "failed", // lượt quét hỏng giữa chừng
  interrupted: "interrupted", // mất kết nối với extension (extension nạp lại, lên bản); hub-bridge.js tự gửi
});

/**
 * Lời hướng dẫn khi tab của lượt giao ca bị đóng lần đầu. Lời của mã TAB trong report.js nói "máy đã tự đọc
 * lại nhưng tab lại bị đóng", không đúng với lần đầu này: lượt giao ca báo ngay, không chờ lần đọc lại.
 */
export function tabClosedHelp(label) {
  return {
    what: `Tab ${label} bị đóng khi máy đang đọc review.`,
    why: "Có người đóng tab mà máy tự mở để đọc review.",
    steps: [
      "Bấm Quét lại và để yên các tab trong nhóm tab màu xanh có chữ Urban B tới khi quét xong.",
      "Máy cũng tự đọc lại kênh này sau vài phút.",
    ],
  };
}

/**
 * Kết quả một kênh cho trang, từ kết cục `scanOne`:
 * - `{ status }`: trạng thái kênh vừa lưu (config.js saveChannelStatus) — dùng đúng phép đọc của tin
 *   `ext:status` (review-status.js), gửi Hub hỏng thì kênh là lỗi;
 * - `{ tabClosed: { code, retryAt } }`: tab bị đóng lần đầu, lượt đọc lại đã hẹn — với trang là lỗi ngay.
 */
export function channelResultOf(channel, outcome, { label, startedAt, finishedAt }) {
  const base = { channel, label, startedAt: startedAt ?? null, finishedAt: finishedAt ?? null };
  if (outcome?.tabClosed) {
    const help = tabClosedHelp(label);
    return {
      ...base,
      state: CHANNEL_STATE.error,
      count: null,
      code: String(outcome.tabClosed.code ?? ""),
      ref: null,
      retryAt: outcome.tabClosed.retryAt ?? null,
      ...help,
    };
  }
  const [row] = hubChannels(
    reviewStatusModel({ status: { [channel]: outcome?.status ?? null }, order: [channel], enabled: { [channel]: true }, labels: { [channel]: label }, missing: null }),
  );
  return {
    ...base,
    state: row.state ?? CHANNEL_STATE.error,
    count: row.count,
    code: row.code,
    ref: row.ref,
    retryAt: null,
    what: row.what,
    why: row.why,
    steps: row.steps,
  };
}

function pendingChannel(channel, label, state, startedAt = null) {
  return { channel, label, state, startedAt, finishedAt: null, count: null, code: null, ref: null, retryAt: null, what: null, why: null, steps: [] };
}

/**
 * Một lượt quét đang chạy, nhìn từ trang Hub. Service worker tạo khi lượt bắt đầu (mọi lượt, không riêng lượt giao
 * ca) để trang gắn vào lượt đang chạy vẫn nhận đủ kênh đã xong trước lúc gắn. Người nghe nhận tin dạng hợp đồng
 * (chưa có `source`, `requestId`): `{ type, ...trường }`.
 */
export function createScanRun({ full, version, labels = {}, now = () => new Date().toISOString() }) {
  const startedAt = now();
  const listeners = new Set();
  const channels = new Map();
  let order = [];
  let result = null;
  let resolveDone;
  const done = new Promise((r) => (resolveDone = r));
  const labelOf = (ch) => labels[ch] ?? ch;

  const progressOf = (row) => ({ type: MSG.progress, ...row });
  const emit = (msg) => {
    for (const fn of [...listeners]) {
      try {
        fn(msg);
      } catch {}
    }
  };

  return {
    full: Boolean(full),
    startedAt,
    done,
    /** Danh sách kênh lượt này sẽ quét (sau khi đọc cấu hình). */
    setChannels(list) {
      order = [...list];
      for (const ch of order) if (!channels.has(ch)) channels.set(ch, pendingChannel(ch, labelOf(ch), null));
    },
    channelStarted(ch) {
      const row = pendingChannel(ch, labelOf(ch), CHANNEL_STATE.running, now());
      channels.set(ch, row);
      emit(progressOf(row));
    },
    /** Kênh đạt nhờ dùng lại lượt quét đạt lúc `okAt` (YC-246): không mở tab, báo trang ngay. */
    channelReused(ch, okAt) {
      const row = { ...pendingChannel(ch, labelOf(ch), CHANNEL_STATE.ok, okAt), finishedAt: okAt, reused: true };
      channels.set(ch, row);
      emit(progressOf(row));
    },
    channelDone(ch, outcome) {
      const prev = channels.get(ch);
      const row = channelResultOf(ch, outcome, { label: labelOf(ch), startedAt: prev?.startedAt ?? null, finishedAt: now() });
      channels.set(ch, row);
      emit(progressOf(row));
    },
    /** Kết thúc lượt: gửi đúng một kết quả cho mọi người nghe. Gọi lần hai không làm gì. */
    finish({ outcome, missing = null }) {
      if (result) return result;
      const rows = order.map((ch) => {
        const row = channels.get(ch);
        return row && row.state !== CHANNEL_STATE.running && row.state !== null ? row : { ...pendingChannel(ch, labelOf(ch), CHANNEL_STATE.notRun), startedAt: row?.startedAt ?? null };
      });
      result = {
        type: MSG.result,
        outcome,
        startedAt,
        finishedAt: now(),
        version: String(version ?? ""),
        channels: outcome === OUTCOME.notConfigured ? [] : rows,
        what: missing?.what ?? null,
        why: missing?.why || null,
        steps: missing?.steps ?? [],
      };
      emit(result);
      listeners.clear();
      resolveDone(result);
      return result;
    },
    /** Gắn người nghe: gửi lại kênh đã có trạng thái trước lúc gắn, rồi nghe tiếp. Lượt đã xong ⇒ gửi kết quả ngay. */
    subscribe(fn) {
      if (result) {
        fn(result);
        return;
      }
      for (const ch of order) {
        const row = channels.get(ch);
        if (row?.state) fn(progressOf(row));
      }
      listeners.add(fn);
    },
    unsubscribe(fn) {
      listeners.delete(fn);
    },
  };
}
