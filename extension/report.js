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

export const CHANNEL_LABEL = {
  booking: "Booking",
  agoda: "Agoda",
  trip: "Trip",
  expedia: "Expedia",
  traveloka: "Traveloka",
  go2joy: "Go2Joy",
};

// ---------- Mã lỗi ----------
//
// Mỗi lỗi mang hai mã:
// - mã tham chiếu `E-XXXXXX`: duy nhất cho từng lần lỗi. Khách sạn gửi mã này; người sửa tìm nó
//   bằng Ctrl+F trong tab "Nhật ký lỗi" để ra đủ chi tiết kỹ thuật.
// - loại lỗi `BKG-LOGIN`, `SHEET-SECRET`…: cố định theo nguyên nhân, tra cách xử lý ở docs/ma-loi.md.

const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // bỏ 0 O 1 I L: đọc qua điện thoại không nhầm

/** Mã tham chiếu cho một lần lỗi, ví dụ E-7K3QX2. */
export function makeErrorRef(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const bytes = random(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return "E-" + s;
}

const CHANNEL_PREFIX = { booking: "BKG", agoda: "AGD", trip: "TRP", expedia: "EXP", traveloka: "TVL", go2joy: "G2J" };

/**
 * Danh mục loại lỗi; luật đầu tiên khớp thắng. `hint` là việc nhân viên khách sạn tự làm được,
 * hiện ngay trong ô bật lên. Cập nhật docs/ma-loi.md khi thêm loại.
 */
const SHEET_KINDS = [
  ["SHEET-CONFIG", /Chưa điền/i, "Điền đủ tên khách sạn, URL Web App và mã bí mật, rồi bấm Thử Sheet."],
  ["SHEET-SECRET", /Sai mã bí mật/i, "Dán lại mã bí mật (lấy từ người quản lý), rồi bấm Thử Sheet."],
  ["SHEET-NET", /Không gọi được Sheet/i, "Kiểm tra mạng của máy, rồi bấm Thử Sheet."],
  ["SHEET-URL", /không phải JSON/i, "Kiểm tra URL Web App (phải kết thúc bằng /exec). Đúng mà vẫn lỗi thì gửi mã lỗi."],
  ["SHEET-BUSY", /bận/i, "Sheet đang bận; lượt sau sẽ tự gửi lại. Lặp lại nhiều lần thì gửi mã lỗi."],
  ["SHEET-OLD", /Hành động lạ/i, "Gửi mã lỗi cho người quản lý (Sheet đang chạy mã cũ)."],
  ["SHEET-REJECT", /./, "Gửi mã lỗi cho người quản lý."],
];

const CHANNEL_KINDS = [
  ["LOGIN", (stage) => stage === "đăng nhập", "Mở {kênh} trong Chrome này, đăng nhập lại, rồi bấm Quét ngay."],
  ["MULTI", /thấy \d+ chỗ nghỉ/i, "Điền mã khách sạn của {kênh} trong ô cài đặt, rồi bấm Quét ngay."],
  ["NOID", /Không dò được mã/i, "Điền mã khách sạn của {kênh} trong ô cài đặt, rồi bấm Quét ngay."],
  ["TIMEOUT", /Hết giờ chờ trang tải/i, "Trang {kênh} tải quá chậm. Kiểm tra mạng, bấm Quét ngay; lặp lại thì gửi mã lỗi."],
  ["TAB", (stage, m) => stage === "mở tab" || /No tab with id/i.test(m), "Đừng đóng tab mà extension tự mở. Bấm Quét ngay; lặp lại thì gửi mã lỗi."],
  ["CAPTURE", /Không bắt được request|Không thấy request|Không đọc được phiên|không có SupplyReviewsQuery/i, "Mở trang review của {kênh} xem có tải được không, rồi bấm Quét ngay; vẫn lỗi thì gửi mã lỗi."],
  ["HTTP", /HTTP \d+/i, "Gửi mã lỗi cho người quản lý."],
  ["API", /báo lỗi/i, "Gửi mã lỗi cho người quản lý."],
  ["NORM", (stage) => stage === "chuẩn hoá", "Không cần làm gì: các bài khác vẫn được gửi. Gửi mã lỗi để người quản lý sửa."],
  ["SCAN", () => true, "Gửi mã lỗi cho người quản lý."],
];

function matches(rule, stage, message) {
  return typeof rule === "function" ? rule(stage, message) : rule.test(message);
}

/** Loại lỗi + cách xử lý, suy từ kênh, giai đoạn và thông điệp. */
export function classifyError(channel, stage, message) {
  const m = String(message ?? "");
  if (stage === "gửi Sheet" || !CHANNEL_PREFIX[channel]) {
    const [code, , hint] = SHEET_KINDS.find(([, re]) => re.test(m)) ?? SHEET_KINDS[SHEET_KINDS.length - 1];
    return { code, hint };
  }
  const [kind, , hint] = CHANNEL_KINDS.find(([, rule]) => matches(rule, stage, m));
  return { code: `${CHANNEL_PREFIX[channel]}-${kind}`, hint: hint.replaceAll("{kênh}", CHANNEL_LABEL[channel]) };
}

/** Một dòng nhật ký lỗi. `id` để xoá đúng dòng đã gửi khỏi hàng đợi; `ref` để người dùng báo lại. */
export function makeLogEntry({ at, channel = "", stage, error, url = "", detail }) {
  const message = String(error?.message ?? error ?? "").slice(0, 500);
  const { code, hint } = classifyError(channel, stage, message);
  return {
    id: crypto.randomUUID(),
    ref: makeErrorRef(),
    code,
    hint,
    at: at ?? new Date().toISOString(),
    channel,
    stage,
    message,
    url: stripUrl(url),
    detail: String(detail ?? error?.stack ?? "").slice(0, 2000),
  };
}

/**
 * Đoạn chữ nhân viên khách sạn dán gửi người quản lý. Chỉ chứa thứ đã có trong nhật ký lỗi:
 * không URL, không mã bí mật.
 */
export function formatErrorReport(entry, { hotel = "", deviceId = "", version = "" } = {}) {
  const when = new Date(entry.at);
  const at = Number.isNaN(when.getTime())
    ? String(entry.at ?? "")
    : when.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
  return [
    `Mã lỗi: ${entry.ref} (${entry.code})`,
    `Khách sạn: ${hotel} · máy ${String(deviceId).slice(0, 8)} · bản ${version}`,
    `Lúc: ${at}`,
    `Kênh: ${CHANNEL_LABEL[entry.channel] ?? (entry.channel || "—")} · giai đoạn: ${entry.stage}`,
    `Lỗi: ${entry.message}`,
  ].join("\n");
}

/** Hàng đợi lỗi giữ tối đa `limit` dòng mới nhất. */
export function pushLimited(list, entry, limit = 50) {
  return [...list, entry].slice(-limit);
}
