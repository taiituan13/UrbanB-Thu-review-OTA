// YC-246 (đổi 27/10/2026: Q1 a, Q2 b) — lượt ĐỌC số ezCloud lúc lễ tân bấm Quét trên trang Giao ca quầy của Hub.
//
// Lễ tân không phải bấm Bàn giao trên PMS nữa. Lúc trang Hub ra lệnh `ext:scan`, extension đọc ca ezCloud đang mở
// (`GET api/Shift/GetCurrentShift?shiftId=0`, cùng lệnh trang Bàn giao ca của PMS gọi) ngay trong một tab PMS của
// máy quầy: dùng phiên ezCloud của chính lễ tân, không đổi khách sạn mặc định, không gọi lệnh ghi nào. Máy không có
// tab PMS nào thì mở một tab PMS nền, đọc xong đóng. Đọc không được (chưa đăng nhập PMS, ca đã kết, mất mạng) thì
// không gửi gì; ô "Số sổ ezCloud" trên Hub ghi "Chưa lấy được số ezCloud" và lễ tân vẫn Chốt được.
//
// Extension chỉ chuyển nguyên các trường cần (như job `lay_tien_ket.py`). Hub chọn dòng VND và tính số "Bàn giao
// cho ca sau" = Đầu ca + Tổng thu − Tổng chi, để luật không sống ở hai repo. Hợp đồng:
// docs/hop-dong-ban-giao-ca-pms.md § Lượt đọc lúc Quét.

export const PMS_ORIGIN = "https://pms.ezcloudhotel.com";
/** Trang mở khi máy chưa có tab PMS nào (Q2 b). */
export const PMS_HOME_URL = PMS_ORIGIN + "/";
export const PMS_TAB_PATTERN = PMS_ORIGIN + "/*";
/** Trần chờ tab PMS nền tải xong. */
export const PMS_LOAD_TIMEOUT_MS = 20_000;
/** Trần cả lượt đọc: kết quả quét gửi trang Hub chờ lượt đọc tối đa ngần này. */
export const READING_TIMEOUT_MS = 30_000;
/** Trần số dòng loại tiền chuyển Hub (PMS thường chỉ có VND). */
export const READING_MONEY_MAX = 10;
/**
 * Chờ token trang tối đa ngần này trong tab PMS sẵn có (1.5.8). capture.js chỉ bắt được token khi trang gửi một
 * request API; trang đứng yên thì có thể chưa gửi lần nào.
 */
export const PAGE_TOKEN_WAIT_MS = 3_000;
/** Chờ token trang tối đa ngần này trong tab PMS máy vừa mở: trang mới tải thường gửi request API ngay. */
export const FRESH_TAB_TOKEN_WAIT_MS = 6_000;
/** Trần chờ token, phòng tham số lạ: không để một tab giữ lượt đọc quá lâu. */
export const TOKEN_WAIT_MAX_MS = 15_000;

/**
 * Chạy TRONG trang PMS (world MAIN, `chrome.scripting.executeScript`), nên phải tự đủ: không dùng gì ngoài thân
 * hàm. Gọi `GetCurrentShift?shiftId=0` lần lượt bằng:
 *   1. token Bearer chính trang vừa gửi (capture.js giữ ở `window.__urbanbCap.ezcloudToken`) — đo 27/10/2026 trên
 *      PMS 17200: chỉ cách này được 200, hai cách sau đều 401;
 *   2. phiên của trang (cookie);
 *   3. JWT trang giữ trong bộ nhớ (PMS từ 10/2026 không còn gửi Bearer ở mọi request, xem bridge.js).
 * Dừng ở lần đầu ezCloud báo `Code` 0. Chưa có token trang thì chờ tối đa `waitMs` để trang gửi một request (1.5.8).
 * Chỉ trả mã HTTP, `Code`, cách xác thực đã dùng (`auth`), có token trang hay không (`pageToken`) và các trường cần —
 * không trả token, tên người tạo ca hay người nhận.
 */
export async function readShiftInPage(waitMs = 0) {
  const PATH = "/api/Shift/GetCurrentShift?shiftId=0";
  const SHIFT_KEYS = ["ShiftId", "ShiftNumber", "CreateDate", "IsFinish", "HotelId"];
  const MONEY_KEYS = ["MoneyName", "MoneyBeginShift", "TotalRevenue", "TotalExpenditure"];
  const jwt = () => {
    for (const store of [window.localStorage, window.sessionStorage]) {
      try {
        for (let i = 0; i < store.length; i++) {
          const m = String(store.getItem(store.key(i)) ?? "").match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
          if (m) return m[0];
        }
      } catch {}
    }
    return null;
  };
  const call = async (headers) => {
    try {
      const res = await fetch(PATH, { credentials: "include", cache: "no-store", headers: { Accept: "application/json", ...headers } });
      let body = null;
      try {
        body = await res.json();
      } catch {}
      return { status: res.status, body };
    } catch {
      return { status: 0, body: null };
    }
  };
  const tokenNow = () => (typeof window.__urbanbCap?.ezcloudToken === "string" ? window.__urbanbCap.ezcloudToken : "");
  // 15000 = TOKEN_WAIT_MAX_MS: hàm chạy trong trang nên không dùng được hằng của mô-đun.
  const wait = Number.isFinite(waitMs) && waitMs > 0 ? Math.min(waitMs, 15000) : 0;
  const deadline = Date.now() + wait;
  while (!tokenNow() && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
  const pageToken = tokenNow();
  const tries = [
    ["page", () => (pageToken ? { Authorization: "Bearer " + pageToken } : null)],
    ["cookie", () => ({})],
    ["storage", () => {
      const token = jwt();
      return token && token !== pageToken ? { Authorization: "Bearer " + token } : null;
    }],
  ];
  let res = { status: 0, body: null };
  let auth = "none";
  for (const [name, headersOf] of tries) {
    const headers = headersOf();
    if (!headers) continue;
    res = await call(headers);
    auth = name;
    if (res.body?.Code === 0) break;
  }
  const data = res.body && typeof res.body.Data === "object" ? res.body.Data : null;
  let shift = null;
  if (data) {
    shift = Object.fromEntries(SHIFT_KEYS.map((k) => [k, data[k] ?? null]));
    const rows = Array.isArray(data.ListShiftDetailModels) ? data.ListShiftDetailModels : [];
    shift.ListShiftDetailModels = rows.filter((r) => r && typeof r === "object").map((r) => Object.fromEntries(MONEY_KEYS.map((k) => [k, r[k] ?? null])));
  }
  return { status: res.status, code: typeof res.body?.Code === "number" ? res.body.Code : null, auth, pageToken: pageToken !== "", shift };
}

/**
 * Mã lỗi máy quầy của một lượt đọc (gửi Hub trong `problems` của lượt báo sống), hay `null` khi số đã lên Hub.
 * Trước 27/10/2026 mọi lỗi của lượt đọc bị nuốt im: thẻ chỉ ghi "Chưa lấy được số ezCloud", không ai biết vì sao.
 *   · `PMS_READING_NO_PAGE` — không chạy được lệnh đọc trong tab PMS (tab chưa tải, bị đóng giữa chừng);
 *   · `PMS_READING_NO_TOKEN` — ezCloud từ chối (401/403) và trang chưa gửi token nào cho capture.js bắt: PMS chưa
 *     đăng nhập, hay tab mở từ trước khi extension nạp lại nên còn chạy capture.js cũ (1.5.8);
 *   · `PMS_READING_AUTH` — ezCloud từ chối (401/403) cả token trang;
 *   · `PMS_READING_PMS_ERROR` — ezCloud trả lời nhưng không báo thành công;
 *   · `PMS_READING_NO_SHIFT` — không có ca đang mở (ca đã kết, thiếu mã);
 *   · `PMS_READING_HUB_REJECTED` — Hub không nhận thân tin (mất mạng, hết phiên, mã khách sạn chưa ghép…).
 */
export function readingFaultCode({ page, report, hub }) {
  if (!isRecord(page)) return "PMS_READING_NO_PAGE";
  if (page.code !== 0) {
    if (page.status !== 401 && page.status !== 403) return "PMS_READING_PMS_ERROR";
    return page.pageToken === false ? "PMS_READING_NO_TOKEN" : "PMS_READING_AUTH";
  }
  if (!report) return "PMS_READING_NO_SHIFT";
  if (!isRecord(hub) || !(hub.status >= 200 && hub.status < 300)) return "PMS_READING_HUB_REJECTED";
  return null;
}

/** ezCloud từ chối phiên: mở một tab PMS mới (nạp capture.js từ đầu) còn có thể đọc được. */
export function isReadingAuthFault(code) {
  return code === "PMS_READING_AUTH" || code === "PMS_READING_NO_TOKEN";
}

const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const positiveInt = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Thân tin gửi Hub từ kết quả `readShiftInPage`, hoặc `null` khi không có gì để gửi: ezCloud không báo thành công
 * (`Code` khác 0, chưa đăng nhập), không có ca, hoặc ca đã kết (`IsFinish`, không phải ca đang mở). Dựng từng
 * trường một, không chép object của trang.
 */
export function readingReport({ page, scanCode, readAt, extensionVersion }) {
  if (!isRecord(page) || page.code !== 0 || !isRecord(page.shift)) return null;
  const s = page.shift;
  const hotelId = positiveInt(s.HotelId);
  const ezShiftId = positiveInt(s.ShiftId);
  if (hotelId === null || ezShiftId === null || s.IsFinish !== false) return null;
  const money = (Array.isArray(s.ListShiftDetailModels) ? s.ListShiftDetailModels : [])
    .filter(isRecord)
    .slice(0, READING_MONEY_MAX)
    .map((r) => ({
      name: typeof r.MoneyName === "string" ? r.MoneyName.trim().slice(0, 16) : "",
      begin: finite(r.MoneyBeginShift),
      revenue: finite(r.TotalRevenue),
      expenditure: finite(r.TotalExpenditure),
    }));
  return {
    kind: "reading",
    scanCode,
    ezcloudHotelId: String(hotelId),
    ezShiftId,
    ezShiftNumber: Number.isSafeInteger(s.ShiftNumber) && s.ShiftNumber >= 0 ? s.ShiftNumber : null,
    shiftOpenedAt: typeof s.CreateDate === "string" ? s.CreateDate.slice(0, 40) : null,
    money,
    readAt,
    extensionVersion,
  };
}
