// Tab Chỉ báo: đọc lời đáp của GET /api/extension/indicators (repo UrbanB) thành mô hình để vẽ.
// Logic thuần.
//
// Ranh giới (luật repo UrbanB: không bịa luật nghiệp vụ, không dựng bảng thứ hai):
// - MỨC của một tình huống (Cảnh báo / Chú ý) là luật của Hub. Extension CHỈ đọc `display.mark`.
// - TÊN và SỐ HIỂN THỊ của chỉ báo cũng của Hub (H-950 b: id gốc 07 in là 06, 11 in là 09…). Extension đọc
//   `display.title`; Hub cũ chưa trả thì lùi về "Chỉ báo <id>", không giữ bảng tên chép tay (YC-159).
// - "Đặt vượt quỹ" đọc thẳng từ hai trường route đã trả (`status = vuot`, `reason = over-capacity`),
//   đúng phép thử `isOverCapacity` của Hub, không phải luật mới.
// - Số chính (`display.main`) và câu "Việc cần làm" của lễ tân (`display.todo`, H-1545 b) chỉ hiện khi
//   Hub trả; extension không tự viết câu chữ nghiệp vụ.
// - Bố cục gom theo chỉ báo như thẻ chỉ báo trang chủ app (H-1429, `groupByIndicator`): giữ thứ tự đã xếp,
//   nhóm đứng theo dòng nặng nhất của nó.

/** Tiêu đề chỉ báo do Hub trả ("06 · Biến động bất thường"); Hub cũ ⇒ "Chỉ báo <id>". */
export function titleOf(s) {
  const t = s?.display?.title;
  return typeof t === "string" && t.trim() ? t : `Chỉ báo ${s?.no ?? ""}`.trim();
}

/** Nhãn dấu, chép từ vi.json (capacity.results.level: warning · notice · overCapacity). */
export const MARK_LABEL = { "over-capacity": "Đặt vượt quỹ", warning: "Cảnh báo", notice: "Chú ý" };
const MARK_ORDER = { "over-capacity": 0, warning: 1, notice: 2 };
const OVER_CAPACITY_REASON = "over-capacity";

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

const str = (x) => (typeof x === "string" && x.trim() ? x : null);

/**
 * Gom các ca đã xếp theo chỉ báo (khuôn `groupByIndicator` của Hub): trong nhóm giữ thứ tự, giữa các nhóm
 * nhóm có ca đứng trước thì đứng trước. Câu "Việc cần làm" giống nhau ở mọi dòng ⇒ hiện một lần dưới nhóm
 * (`todo`); khác nhau theo ngày (số trong câu khác) ⇒ hiện dưới từng dòng (`rowTodo = true`).
 */
export function groupCases(cases) {
  const groups = new Map();
  for (const c of cases) {
    const g = groups.get(c.no);
    if (g) g.rows.push(c);
    else groups.set(c.no, { no: c.no, title: c.title, rows: [c] });
  }
  return [...groups.values()].map((g) => {
    const levels = Object.keys(MARK_ORDER)
      .map((mark) => ({ mark, n: g.rows.filter((c) => c.mark === mark).length }))
      .filter((l) => l.n > 0)
      .map((l) => ({ ...l, label: `${l.n} ${MARK_LABEL[l.mark]}` }));
    const todos = [...new Set(g.rows.map((c) => c.todo))];
    const shared = todos.length === 1 ? todos[0] : null;
    return { ...g, levels, todo: shared, rowTodo: todos.length > 1 };
  });
}

/**
 * Mô hình tab Chỉ báo từ lời đáp route. `today` = YYYY-MM-DD theo giờ máy quầy.
 * Trả `{ branchName, branchId, lastRunAt, exceeded: [case], groups, level, missing: [tên], staleSources }`.
 */
export function indicatorsModel(data, today) {
  const situations = Array.isArray(data?.situations) ? data.situations : [];
  const exceeded = sortExceeded(situations.filter(isExceeded), today);
  const cases = exceeded.map((s) => {
    const mark = markOf(s);
    return {
      id: s.id,
      no: s.no,
      title: titleOf(s),
      mark,
      markLabel: mark ? MARK_LABEL[mark] : "",
      day: dayLabel(s.target, today),
      main: str(s.display?.main) ?? "",
      todo: str(s.display?.todo),
    };
  });
  const missing = new Map();
  for (const s of situations) if (s.status === "thieu" && !missing.has(s.no)) missing.set(s.no, titleOf(s));
  return {
    branchName: data?.branch?.name ?? "",
    branchId: data?.branch?.id ?? "",
    lastRunAt: data?.lastRunAt ?? null,
    exceeded: cases,
    groups: groupCases(cases),
    level: dotLevel(exceeded),
    missing: [...missing.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, t]) => t),
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
  return { n: model.missing.length, list: model.missing.join("; ") };
}

/** Chân tab: "Lượt chạy gần nhất 09:30 · T6 16/10/2026"; job chưa chạy ⇒ câu riêng. Giờ theo máy quầy. */
export function lastRunText(lastRunAt) {
  const d = lastRunAt ? new Date(lastRunAt) : null;
  if (!d || Number.isNaN(d.getTime())) return "Chưa có lượt chạy chỉ báo nào";
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const date = `${WD[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  return `Lượt chạy gần nhất ${hm} · ${date}`;
}
