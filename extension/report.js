// Phần thuần của việc gửi về Sheet và ghi nhật ký lỗi — tách ra để test được ngoài Chrome.

/** Lỗi khi gửi Sheet; `retryable` = gửi lại có thể thành công. */
export class SheetError extends Error {
  constructor(message, retryable) {
    super(message);
    this.retryable = retryable;
  }
}

/**
 * Đọc câu trả lời của Web App.
 * Google đôi khi trả trang lỗi HTML 404 ở chặng chuyển hướng (đo 08/10/2026: 7/60 lượt) ⇒ gửi lại được,
 * vì Apps Script nhận ra requestId đã thấy và trả lại câu trả lời cũ.
 */
export function parseSheetReply(status, body) {
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    throw new SheetError(`Sheet trả về không phải JSON (HTTP ${status}). Kiểm lại URL Web App và quyền "Bất kỳ ai".`, true);
  }
  if (!j.ok) {
    const error = String(j.error ?? "không rõ");
    throw new SheetError(`Sheet từ chối: ${error}`, /bận/i.test(error));
  }
  return j;
}

/** Chạy fn; lỗi `retryable` thì chờ rồi thử lại, mỗi lần chờ lâu hơn. Mặc định tối đa 3 lần. */
export async function withRetry(fn, { delays = [2000, 6000], sleep }) {
  for (let i = 0; ; i++) {
    try {
      return await fn(i + 1);
    } catch (e) {
      if (!e?.retryable || i >= delays.length) throw e;
      await sleep(delays[i]);
    }
  }
}

/** URL không bao giờ được mang query hay hash: `ses` của Booking nằm ở đó. */
export function stripUrl(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return "";
  }
}

/** Một dòng nhật ký lỗi. `id` để xoá đúng dòng đã gửi khỏi hàng đợi. */
export function makeLogEntry({ at, channel = "", stage, error, url = "", detail }) {
  return {
    id: crypto.randomUUID(),
    at: at ?? new Date().toISOString(),
    channel,
    stage,
    message: String(error?.message ?? error ?? "").slice(0, 500),
    url: stripUrl(url),
    detail: String(detail ?? error?.stack ?? "").slice(0, 2000),
  };
}

/** Hàng đợi lỗi giữ tối đa `limit` dòng mới nhất. */
export function pushLimited(list, entry, limit = 50) {
  return [...list, entry].slice(-limit);
}
