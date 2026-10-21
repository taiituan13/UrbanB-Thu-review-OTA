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
    throw new SheetError(`Sheet trả về không phải JSON (HTTP ${status})`, true);
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
 * Danh mục loại lỗi; luật đầu tiên khớp thắng. Mỗi loại mang lời hướng dẫn ba phần cho người đứng quầy
 * (YC-158, user 21/10/2026: "hướng dẫn chi tiết hơn cho Lễ tân… văn phong giống người"):
 * - `what`: chuyện gì đang xảy ra; `why`: vì sao; `steps`: làm gì tiếp, mỗi bước một câu.
 * Câu viết như nói với đồng nghiệp: không tên kỹ thuật, không ký hiệu. Nút thật tên "Quét review ngay"
 * (popup.html). Cập nhật docs/ma-loi.md khi thêm hay sửa loại.
 */
const RESCAN = "Bấm biểu tượng Urban B trên thanh Chrome, rồi bấm Quét review ngay.";
const SEND_REF = "Vẫn lỗi thì bấm Sao chép cạnh mã lỗi và gửi cho người quản lý.";

const SHEET_KINDS = [
  ["SHEET-CONFIG", /Chưa điền|cấu hình thu review/i, {
    what: "Máy này chưa biết gửi review về bảng tính nào.",
    why: "Máy chưa nhận cấu hình thu review từ Hub.",
    steps: ["Mở Hub trong Chrome này và đăng nhập.", "Mở màn Cài extension trên Hub, máy sẽ tự nhận cấu hình.", "Màn ấy báo thu review chưa cấu hình thì nhắn Quản trị hệ thống."],
  }],
  ["SHEET-SECRET", /Sai mã bí mật/i, {
    what: "Bảng tính review không nhận bài từ máy này.",
    why: "Mã khoá của bảng tính vừa được đổi mà máy chưa nhận mã mới.",
    steps: ["Mở màn Cài extension trên Hub để máy nhận cấu hình mới.", RESCAN, "Vẫn lỗi thì bấm Sao chép cạnh mã lỗi và gửi cho Quản trị hệ thống."],
  }],
  ["SHEET-NET", /Không gọi được Sheet|Hết giờ chờ Sheet/i, {
    what: "Máy không gửi được review về bảng tính.",
    why: "Mạng của máy đang chập chờn hoặc bị ngắt.",
    steps: ["Kiểm tra máy còn vào được mạng.", "Bạn không cần gửi lại, lượt quét sau máy tự gửi."],
  }],
  ["SHEET-URL", /không phải JSON/i, {
    what: "Bảng tính review không trả lời đúng.",
    why: "Địa chỉ bảng tính trên Hub đã cũ, hoặc bảng tính đang bị khoá quyền.",
    steps: ["Bấm Sao chép cạnh mã lỗi và gửi cho Quản trị hệ thống để kiểm bảng tính thu review trên Hub."],
  }],
  ["SHEET-BUSY", /bận/i, {
    what: "Bảng tính review đang bận nên chưa nhận bài.",
    why: "Nhiều máy đang gửi cùng lúc.",
    steps: ["Bạn không cần làm gì, lượt quét sau máy tự gửi lại.", "Lỗi lặp lại suốt cả ngày thì bấm Sao chép cạnh mã lỗi và gửi cho người quản lý."],
  }],
  ["SHEET-OLD", /Hành động lạ/i, {
    what: "Bảng tính review không hiểu bài máy này gửi.",
    why: "Bảng tính đang chạy bản cũ hơn extension.",
    steps: ["Bấm Sao chép cạnh mã lỗi và gửi cho người quản lý để cập nhật bảng tính."],
  }],
  ["SHEET-REJECT", /./, {
    what: "Bảng tính review từ chối bài từ máy này.",
    why: "Chưa rõ nguyên nhân.",
    steps: ["Bấm Sao chép cạnh mã lỗi và gửi cho người quản lý."],
  }],
];

// Gửi Hub (hub.js) hỏng không làm hỏng lượt gửi Sheet; lỗi vẫn vào nhật ký như mọi lỗi khác.
const HUB_KINDS = [
  ["HUB-ORIGIN", /FORBIDDEN_ORIGIN/, {
    what: "Hub không nhận review từ extension trên máy này.",
    why: "Extension trên máy đã cũ.",
    steps: ["Mở màn Cài extension trên Hub.", "Làm lại bước chạy lệnh cài ở mục 1 để lên bản mới.", SEND_REF],
  }],
  ["HUB-SCOPE", /quyền thêm review|ngoài phạm vi/i, {
    what: "Hub không nhận review vì tài khoản đang đăng nhập không thuộc chi nhánh này.",
    why: "Chrome này đang đăng nhập Hub bằng tài khoản của người khác hoặc của chi nhánh khác.",
    steps: ["Mở Hub, đăng xuất, rồi đăng nhập bằng tài khoản Lễ tân của chi nhánh này.", RESCAN, "Đúng tài khoản mà vẫn lỗi thì bấm Sao chép cạnh mã lỗi và gửi cho người quản lý."],
  }],
  ["HUB-LOGIN", /Chưa đăng nhập Hub/i, {
    what: "Review chưa lên Hub vì Chrome này chưa đăng nhập Hub.",
    why: "Phiên đăng nhập Hub đã hết hạn, hoặc có người vừa đăng xuất.",
    steps: ["Bấm biểu tượng Urban B trên thanh Chrome, rồi bấm Đăng nhập Hub.", "Đăng nhập bằng tài khoản của bạn.", "Quay lại biểu tượng Urban B và bấm Quét review ngay."],
  }],
  ["HUB-OFF", /chưa bật/i, {
    what: "Hub chưa mở chỗ nhận review từ máy quầy.",
    why: "Phần nhận review trên Hub đang tắt.",
    steps: ["Bấm Sao chép cạnh mã lỗi và gửi cho người quản lý."],
  }],
  ["HUB-NET", /Không gọi được Hub|Hết giờ chờ Hub/i, {
    what: "Máy không gửi được review lên Hub.",
    why: "Mạng của máy đang chập chờn hoặc bị ngắt.",
    steps: ["Kiểm tra máy còn vào được mạng.", "Bạn không cần gửi lại, lượt quét sau máy tự gửi."],
  }],
  ["HUB-ROWS", /bài Hub không nhận/i, {
    what: "Hub không nhận vài bài review trong lượt này.",
    why: "Các bài ấy thiếu thông tin Hub cần.",
    steps: ["Bạn không cần làm gì, các bài khác đã lên Hub.", "Bấm Sao chép cạnh mã lỗi và gửi cho người quản lý để kiểm."],
  }],
  ["HUB-REJECT", /./, {
    what: "Hub từ chối review từ máy này.",
    why: "Chưa rõ nguyên nhân.",
    steps: ["Chờ lượt quét sau, máy tự thử lại.", SEND_REF],
  }],
];

const CHANNEL_KINDS = [
  ["LOGIN", (stage) => stage === "đăng nhập", {
    what: "Máy không vào được trang {kênh} vì tài khoản {kênh} trên Chrome này đã bị đăng xuất.",
    why: "Trang {kênh} tự đăng xuất sau một thời gian, hoặc có người vừa đăng xuất.",
    steps: ["Mở trang quản lý khách sạn của {kênh} trong Chrome này.", "Đăng nhập bằng tài khoản {kênh} của chi nhánh.", RESCAN],
  }],
  ["MULTI", /thấy \d+ chỗ nghỉ/i, {
    what: "Máy chưa biết lấy review của chỗ nghỉ nào trên {kênh}.",
    why: "Tài khoản {kênh} này quản lý nhiều chỗ nghỉ, mà Hub chưa ghi mã {kênh} của chi nhánh.",
    steps: ["Nhắn Quản trị hệ thống điền mã {kênh} của chi nhánh trên Hub.", "Khi Quản trị hệ thống báo đã điền xong, bấm biểu tượng Urban B rồi bấm Quét review ngay."],
  }],
  ["NOID", /Không dò được mã/i, {
    what: "Máy không tìm ra mã chỗ nghỉ của chi nhánh trên {kênh}.",
    why: "Trang {kênh} không cho biết mã, và Hub cũng chưa ghi mã ấy.",
    steps: ["Nhắn Quản trị hệ thống điền mã {kênh} của chi nhánh trên Hub.", "Khi Quản trị hệ thống báo đã điền xong, bấm biểu tượng Urban B rồi bấm Quét review ngay."],
  }],
  ["PAGE", /chuyển sang .* (thay vì trang review|giữa lượt quét)/i, {
    what: "Trang {kênh} tự chuyển sang trang khác khi máy đang đọc review.",
    why: "Thường là mã chỗ nghỉ ghi trên Hub bị sai, hoặc {kênh} vừa đổi trang.",
    steps: ["Mở trang review của {kênh} trong Chrome này, xem có vào được không.", "Vào được thì bấm biểu tượng Urban B rồi bấm Quét review ngay.", "Vẫn lỗi thì bấm Sao chép cạnh mã lỗi và gửi cho người quản lý để kiểm mã chỗ nghỉ trên Hub."],
  }],
  ["OPEN", /Chưa mở được|không tải được/i, {
    what: "Máy không mở được trang {kênh}.",
    why: "Máy đang mất mạng, hoặc tab máy tự mở để đọc review bị dừng hay bị chặn.",
    steps: ["Kiểm tra máy còn vào được mạng.", "Lần sau thấy tab {kênh} tự mở thì cứ để nó, tab tự đóng khi đọc xong.", RESCAN],
  }],
  ["TIMEOUT", /Hết giờ chờ|timed out|timeout/i, {
    what: "Trang {kênh} tải quá lâu nên máy dừng lượt đọc này.",
    why: "Mạng của máy chậm, hoặc trang {kênh} đang chậm.",
    steps: ["Kiểm tra mạng của máy.", RESCAN, "Lỗi lặp lại nhiều lần thì bấm Sao chép cạnh mã lỗi và gửi cho người quản lý."],
  }],
  ["TAB", (stage, m) => stage === "mở tab" || /No tab with id|Tab bị đóng/i.test(m), {
    what: "Tab {kênh} bị đóng khi máy đang đọc review.",
    why: "Có người đóng tab mà máy tự mở để đọc review.",
    steps: ["Lần sau thấy tab {kênh} tự mở thì cứ để nó, tab tự đóng khi đọc xong.", RESCAN],
  }],
  ["CAPTURE", /Không bắt được request|Không thấy request|Không đọc được phiên|không có SupplyReviewsQuery/i, {
    what: "Máy mở được trang {kênh} nhưng không đọc được danh sách review.",
    why: "Trang chưa tải hết, hoặc {kênh} vừa đổi giao diện.",
    steps: ["Mở trang review của {kênh} trong Chrome này, xem danh sách review có hiện không.", RESCAN, SEND_REF],
  }],
  ["HTTP", /HTTP \d+/i, {
    what: "Trang {kênh} báo lỗi khi máy hỏi danh sách review.",
    why: "Phía {kênh} đang trục trặc, hoặc mã chỗ nghỉ ghi trên Hub không đúng.",
    steps: ["Bạn chờ lượt quét sau, máy tự thử lại.", "Lỗi còn sau vài giờ thì bấm Sao chép cạnh mã lỗi và gửi cho người quản lý."],
  }],
  ["API", /báo lỗi/i, {
    what: "{kênh} từ chối trả danh sách review.",
    why: "Tài khoản đang đăng nhập có thể không được xem review, hoặc phía {kênh} đang lỗi.",
    steps: ["Mở trang review của {kênh} trong Chrome này, xem bạn có xem được review không.", "Không xem được thì đăng nhập lại bằng tài khoản {kênh} của chi nhánh.", SEND_REF],
  }],
  ["NORM", (stage) => stage === "chuẩn hoá", {
    what: "Có vài bài review {kênh} máy đọc không trọn.",
    why: "Các bài ấy có dạng lạ mà extension chưa đọc được.",
    steps: ["Bạn không cần làm gì, các bài khác vẫn lên Hub.", "Bấm Sao chép cạnh mã lỗi và gửi cho người quản lý để sửa extension."],
  }],
  ["SCAN", () => true, {
    what: "Máy gặp lỗi lạ khi đọc review {kênh}.",
    why: "Chưa rõ nguyên nhân.",
    steps: [RESCAN, SEND_REF],
  }],
];

function matches(rule, stage, message) {
  return typeof rule === "function" ? rule(stage, message) : rule.test(message);
}

function fill(help, label) {
  const f = (t) => t.replaceAll("{kênh}", label);
  return { what: f(help.what), why: f(help.why), steps: help.steps.map(f) };
}

/** Một dòng chữ gọn của lời hướng dẫn, cho Sheet và cho chỗ chỉ có một dòng. */
export function helpText(help) {
  return [help.what, help.why, ...help.steps].filter(Boolean).join(" ");
}

/** Mọi loại lỗi với lời hướng dẫn đã điền tên kênh — cho test soi chữ. */
export function errorHelpCatalog(label = CHANNEL_LABEL.agoda) {
  return [
    ...SHEET_KINDS.map(([code, , help]) => ({ code, help })),
    ...HUB_KINDS.map(([code, , help]) => ({ code, help })),
    ...CHANNEL_KINDS.map(([code, , help]) => ({ code, help: fill(help, label) })),
  ];
}

/** Loại lỗi + lời hướng dẫn, suy từ kênh, giai đoạn và thông điệp. `hint` = bản một dòng của `help`. */
export function classifyError(channel, stage, message) {
  const m = String(message ?? "");
  let code;
  let help;
  if (stage === "gửi Hub") {
    [code, , help] = HUB_KINDS.find(([, re]) => re.test(m));
  } else if (stage === "gửi Sheet" || !CHANNEL_PREFIX[channel]) {
    [code, , help] = SHEET_KINDS.find(([, re]) => re.test(m)) ?? SHEET_KINDS[SHEET_KINDS.length - 1];
  } else {
    const [kind, , h] = CHANNEL_KINDS.find(([, rule]) => matches(rule, stage, m));
    code = `${CHANNEL_PREFIX[channel]}-${kind}`;
    help = fill(h, CHANNEL_LABEL[channel]);
  }
  return { code, hint: helpText(help), help };
}

/** Một dòng nhật ký lỗi. `id` để xoá đúng dòng đã gửi khỏi hàng đợi; `ref` để người dùng báo lại. */
export function makeLogEntry({ at, channel = "", stage, error, url = "", detail }) {
  const message = String(error?.message ?? error ?? "").slice(0, 500);
  const { code, hint, help } = classifyError(channel, stage, message);
  return {
    id: crypto.randomUUID(),
    ref: makeErrorRef(),
    code,
    hint,
    help,
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
