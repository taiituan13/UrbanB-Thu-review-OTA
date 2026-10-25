// YC-158 (H-1539 lối 2) — hạn giờ cho MỌI lượt gọi mạng của extension. Trước đây chỉ lượt chờ tải trang
// có hạn 45 giây; một lượt gọi Hub hay một fetch trong trang kênh bị treo thì cờ `running` kẹt
// mãi và mọi lượt quét hẹn giờ sau im lặng bỏ qua. Số dưới đây là hằng kỹ thuật, không phải số nghiệp vụ.

/** Một lượt gọi Hub. */
export const HUB_TIMEOUT_MS = 30_000;
/** Đọc số phiên bản mới trên GitHub. */
export const REMOTE_TIMEOUT_MS = 15_000;
/**
 * Một lượt chạy bộ quét trong trang kênh (gồm mọi fetch trong trang). Mỗi fetch trong `scanners.js` còn
 * tự có hạn 30 giây: hàm chạy trong trang không nhập được tệp này nên viết số ngay tại chỗ.
 */
export const PAGE_RUN_TIMEOUT_MS = 120_000;

/** Lỗi hết giờ của `AbortSignal.timeout` (Chrome đặt tên `TimeoutError`). */
export function isTimeout(e) {
  return e?.name === "TimeoutError" || e?.name === "AbortError" || /timed out|timeout/i.test(String(e?.message ?? ""));
}

/** Chạy một promise với hạn giờ; quá hạn ⇒ ném lỗi `message`. */
export function withTimeout(promise, ms, message, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimer(() => reject(Object.assign(new Error(message), { name: "TimeoutError" })), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimer(timer));
}
