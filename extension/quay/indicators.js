// Tab Chỉ báo: đọc lời đáp của GET /api/extension/indicators (repo UrbanB) thành mô hình để vẽ.
// Logic thuần.
//
// Ranh giới (luật repo UrbanB: không bịa luật nghiệp vụ, không dựng bảng mức thứ hai):
// - MỨC của một tình huống (Cảnh báo / Chú ý) là luật của Hub (`situationLevel` → `itemLevelOf`,
//   bảng NOTICE_POLICY). Hub ghi thẳng: "không dựng bảng mức thứ hai". Extension vì vậy CHỈ đọc mức
//   từ trường `display.mark` nếu route trả; route hiện tại chưa trả ⇒ mức để trống, chấm màu trung tính.
// - "Đặt vượt quỹ" đọc thẳng từ hai trường route đã trả (`status = vuot`, `reason = over-capacity`),
//   đúng phép thử `isOverCapacity` của Hub, không phải luật mới.
// - Dòng chính (số liệu) và dòng "Việc cần làm" chỉ hiện khi route trả `display.main` / `display.todo`
//   (H-1345 đang chờ: khe ẩn, không tự viết câu chữ nghiệp vụ).

/** Tên chỉ báo, chép từ src/i18n/messages/vi.json khoá capacity.indicators.name (repo UrbanB). */
export const INDICATOR_NAMES = {
  "01": "Hôm nay trống nhiều",
  "02": "Hôm nay đặt nhiều",
  "03": "Trống nhiều trong 7 ngày tới",
  "04": "Đặt nhiều trong 30 ngày tới",
  "05": "Không đủ phòng chừa",
  "07": "Biến động bất thường",
  "09": "Công suất đặt trước 3 tháng tới",
  "10": "Phòng giờ dưới mức tối thiểu",
};

/** Nhãn dấu, chép từ vi.json (capacity.results.level: warning · notice · overCapacity). */
export const MARK_LABEL = { "over-capacity": "Đặt vượt quỹ", warning: "Cảnh báo", notice: "Chú ý" };
const MARK_ORDER = { "over-capacity": 0, warning: 1, notice: 2 };
const OVER_CAPACITY_REASON = "over-capacity";

export function indicatorName(no) {
  return INDICATOR_NAMES[no] ?? `Chỉ báo ${no}`;
}

/** Đang vượt và chưa có dấu Đã xử lý (cùng phép đếm "Đang vượt" của màn Kết quả). */
export function isExceeded(s) {
  return s?.status === "vuot" && (s.handled === null || s.handled === undefined);
}

/** Dấu của tình huống: `display.mark` do Hub tính; không có thì chỉ nhận ra "Đặt vượt quỹ"; còn lại null. */
export function markOf(s) {
  const m = s?.display?.mark;
  if (m === "over-capacity" || m === "warning" || m === "notice") return m;
  if (s?.status === "vuot" && s?.reason === OVER_CAPACITY_REASON) return "over-capacity";
  return null;
}

/** Số ngày từ hôm nay tới ngày đích (YYYY-MM-DD); đích là tháng (09) ⇒ null. */
export function offsetOf(target, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(target ?? ""))) return null;
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+target.slice(0, 4), +target.slice(5, 7) - 1, +target.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Thứ tự danh sách đang vượt (vi.json capacity.results.list.leadExceeded): mức cao trước; cùng mức thì
 * ngày từ hôm nay trở đi đứng trước ngày đã qua; ngày gần hôm nay hơn đứng trước. Tình huống chưa
 * biết mức đứng sau mọi tình huống có mức.
 */
export function sortExceeded(list, today) {
  const rank = (s) => {
    const m = markOf(s);
    return m === null ? 3 : MARK_ORDER[m];
  };
  const dayKey = (s) => {
    const off = offsetOf(s.target, today);
    if (off === null) return [0, 0];
    return off >= 0 ? [0, off] : [1, -off];
  };
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    const [pa, da] = dayKey(a);
    const [pb, db] = dayKey(b);
    return pa - pb || da - db || String(a.no).localeCompare(String(b.no));
  });
}

/**
 * Màu chấm của nút gập và tab (H-1246 a): đỏ khi có Cảnh báo, vàng khi chỉ có Chú ý, xanh khi không
 * có tình huống đang vượt. Đang vượt mà Hub chưa trả mức ⇒ `lv` (màu trung tính "có tình huống").
 */
export function dotLevel(exceeded) {
  if (!exceeded.length) return "ok";
  const marks = exceeded.map(markOf);
  if (marks.includes("warning")) return "cb";
  if (marks.includes("notice")) return "cy";
  return "lv";
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** "Hôm nay · T6 16/10" · "Ngày +2 · CN 18/10" · "Hôm qua · T5 15/10" · "Tháng 11/2026". */
export function dayLabel(target, today) {
  const t = String(target ?? "");
  if (/^\d{4}-\d{2}$/.test(t)) return `Tháng ${t.slice(5, 7)}/${t.slice(0, 4)}`;
  const off = offsetOf(t, today);
  if (off === null) return t;
  const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)));
  const date = `${WD[d.getUTCDay()]} ${t.slice(8, 10)}/${t.slice(5, 7)}`;
  const rel = off === 0 ? "Hôm nay" : off === -1 ? "Hôm qua" : off === 1 ? "Ngày mai" : off > 0 ? `Ngày +${off}` : `${-off} ngày trước`;
  return `${rel} · ${date}`;
}

/**
 * Mô hình tab Chỉ báo từ lời đáp route. `today` = YYYY-MM-DD theo giờ máy quầy.
 * Trả `{ branchName, branchId, lastRunAt, exceeded: [case], level, missing: [tên], staleSources }`.
 */
export function indicatorsModel(data, today) {
  const situations = Array.isArray(data?.situations) ? data.situations : [];
  const exceeded = sortExceeded(situations.filter(isExceeded), today);
  const cases = exceeded.map((s) => {
    const mark = markOf(s);
    return {
      id: s.id,
      no: s.no,
      name: indicatorName(s.no),
      mark,
      markLabel: mark ? MARK_LABEL[mark] : "",
      day: dayLabel(s.target, today),
      main: typeof s.display?.main === "string" ? s.display.main : "",
      chips: Array.isArray(s.display?.chips) ? s.display.chips.filter((x) => typeof x === "string") : [],
      // H-1345 (chờ chốt): khe "Việc cần làm" chỉ hiện khi Hub trả câu chữ.
      todo: typeof s.display?.todo === "string" && s.display.todo.trim() ? s.display.todo : null,
    };
  });
  const missingNos = [...new Set(situations.filter((s) => s.status === "thieu").map((s) => s.no))].sort();
  return {
    branchName: data?.branch?.name ?? "",
    branchId: data?.branch?.id ?? "",
    lastRunAt: data?.lastRunAt ?? null,
    exceeded: cases,
    level: dotLevel(exceeded),
    missing: missingNos.map((no) => `${no} ${indicatorName(no)}`),
    staleSources: Array.isArray(data?.stale) ? data.stale.length : 0,
  };
}

/** Câu kết luận đầu tab. */
export function verdictText(model) {
  const who = model.branchName || "Cơ sở";
  return model.exceeded.length
    ? { lead: `${who} hôm nay: `, n: model.exceeded.length, tail: " tình huống đang vượt." }
    : { lead: `${who} hôm nay: không có tình huống đang vượt.`, n: null, tail: "" };
}

/** Dòng "Chưa đủ dữ liệu ở N chỉ báo: …". */
export function missingText(model) {
  if (!model.missing.length) return null;
  return { n: model.missing.length, list: model.missing.join(" · ") };
}

/** Chân tab: "Lượt chạy gần nhất 09:30 · T6 16/10/2026"; job chưa chạy ⇒ câu riêng. Giờ theo máy quầy. */
export function lastRunText(lastRunAt) {
  const d = lastRunAt ? new Date(lastRunAt) : null;
  if (!d || Number.isNaN(d.getTime())) return "Chưa có lượt chạy chỉ báo nào";
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const date = `${WD[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return `Lượt chạy gần nhất ${hm} · ${date}`;
}
