// Thông báo trên PMS: chip chưa đọc, thông báo nổi, nút Đã đọc, ghim.
//
// Hub CHƯA có route cho phần này (làn B dựng). Tệp này viết theo một HỢP ĐỒNG GIẢ, tách riêng để khi
// Hub có route thật thì chỉ thay nguồn (`hubSource`), không đụng khung vẽ.
//
// ── Hợp đồng đề xuất cho Hub (làn B) ───────────────────────────────────────────────────────────────
// GET  /api/extension/notifications            (phiên đăng nhập Hub; như hai route extension đã có)
//   200 { ok: true,
//         me: { name: string },                                   // tên người đang đăng nhập
//         unread: number,                                         // H-1262 a: đếm theo người đăng nhập
//         settings?: { toastSeconds?: number },                   // thời gian tự ẩn; vắng ⇒ 8 (giá trị tạm)
//         items: [{ id: string, title: string, body: string, from: string,
//                   createdAt: ISO, readAt: ISO | null, url: string | null,   // url: đường trên Hub
//                   kind: string,                                 // nhãn nguồn (bulletin, work, …) chỉ để vẽ biểu tượng
//                   sticky: boolean }] }                          // H-1344: phải bấm mới tắt / ghim
//   401 { ok:false, error:"NOT_SIGNED_IN" }
// POST /api/extension/notifications/read  body { ids: string[] }  (Origin chrome-extension://… qua extensionWriteAllowed)
//   200 { ok: true, unread: number }
// ───────────────────────────────────────────────────────────────────────────────────────────────────
//
// Luật đã chốt áp ở đây: H-1260 a (mọi thông báo của người đăng nhập đều là loại cần đọc) · H-1262 a
// (chip đếm theo người đăng nhập) · H-1263 b (phải bấm Đã đọc rõ ràng; mở hay đóng thông báo nổi KHÔNG
// tính là đã đọc) · H-1264 a (huy hiệu là số chưa đọc).
// Còn chờ, để thành khe/công tắc, không tự quyết:
//   H-1343 — nút Đã đọc ghi vào đâu (Bảng tin hay notifications.readAt): việc của Hub ở POST …/read.
//            Extension chỉ gửi danh sách id.
//   H-1344 — loại nào "phải bấm mới tắt / ghim": Hub đặt `sticky` cho từng dòng. Vắng ⇒ false.
//   Thời gian tự ẩn của thông báo nổi: `settings.toastSeconds`; vắng ⇒ TOAST_SECONDS_DEFAULT (giá trị
//   TẠM của mockup, chưa chốt).

export const NOTIFICATIONS_PATH = "/api/extension/notifications";
export const NOTIFICATIONS_READ_PATH = "/api/extension/notifications/read";

/** Giá trị TẠM của mockup (8 giây), chưa chốt. Hub trả `settings.toastSeconds` thì dùng số của Hub. */
export const TOAST_SECONDS_DEFAULT = 8;
/** Đọc lại danh sách mỗi 60 giây khi tab PMS đang mở (hằng kỹ thuật). */
export const NOTIFICATIONS_POLL_MS = 60_000;
/** Nhớ tối đa 200 id đã bắn nổi, để tải lại trang không bắn lại. */
export const SEEN_LIMIT = 200;

/**
 * Công tắc phía extension. Mặc định theo phần đã chốt; đổi ở đây khi user chốt câu đang chờ.
 * `readAll`: nút "Đánh dấu đã đọc hết" của mockup. Tắt sẵn: H-1263 b đòi bấm Đã đọc rõ ràng từng
 * thông báo, còn đọc-hết-một-lần có hợp nghĩa ấy không là câu chưa hỏi.
 */
export const SWITCHES = { readAll: false };

const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));

/** Một dòng thông báo theo hợp đồng; dòng hỏng (thiếu id hoặc tiêu đề) ⇒ null. */
export function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = str(raw.id);
  const title = str(raw.title).trim();
  if (!id || !title) return null;
  return {
    id,
    title,
    body: str(raw.body),
    from: str(raw.from),
    createdAt: str(raw.createdAt),
    readAt: raw.readAt ? str(raw.readAt) : null,
    url: raw.url ? str(raw.url) : null,
    kind: str(raw.kind),
    sticky: raw.sticky === true,
  };
}

/** Lời đáp GET ⇒ `{ me, items, unread, toastSeconds }`. Hỏng ⇒ null. */
export function parseNotifications(json) {
  if (!json || json.ok !== true || !Array.isArray(json.items)) return null;
  const items = json.items.map(normalizeItem).filter(Boolean);
  const counted = items.filter((n) => !n.readAt).length;
  const unread = Number.isInteger(json.unread) && json.unread >= 0 ? json.unread : counted;
  const ts = Number(json.settings?.toastSeconds);
  return {
    me: { name: str(json.me?.name) },
    items,
    unread,
    toastSeconds: Number.isFinite(ts) && ts > 0 ? ts : TOAST_SECONDS_DEFAULT,
  };
}

/** Thứ tự trong danh sách: chưa đọc có ghim trước, rồi chưa đọc, rồi đã đọc; mỗi nhóm mới trước. */
export function sortForList(items) {
  const group = (n) => (!n.readAt && n.sticky ? 0 : !n.readAt ? 1 : 2);
  return [...items].sort((a, b) => group(a) - group(b) || str(b.createdAt).localeCompare(str(a.createdAt)));
}

/** Chip hiện khi có chưa đọc, hoặc khi danh sách đang mở (để bấm lại mà đóng). */
export function chipModel(unread, listOpen) {
  if (!unread && !listOpen) return null;
  return { label: "Thông báo", n: unread || 0, aria: `${unread || 0} thông báo chưa đọc` };
}

/**
 * Thông báo nào bắn nổi lần này: chưa đọc, chưa từng bắn (`seen`), mới nhất trước. Lần đọc đầu tiên
 * của máy (`seen` rỗng và `firstRun`) chỉ ghi nhận, không bắn, để máy vừa cài không bắn dồn mọi thông
 * báo cũ. Danh sách đang mở ⇒ không bắn (người dùng đang nhìn danh sách rồi).
 */
export function toastQueue(items, seen, { firstRun, listOpen }) {
  const fresh = items.filter((n) => !n.readAt && !seen.has(n.id));
  if (firstRun || listOpen) return [];
  return [...fresh].sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)));
}

/** Cập nhật tập id đã thấy, giữ tối đa SEEN_LIMIT id mới nhất. */
export function rememberSeen(seenList, items) {
  const next = [...(seenList ?? [])];
  for (const n of items) if (!next.includes(n.id)) next.push(n.id);
  return next.slice(-SEEN_LIMIT);
}

/** Thông báo nổi tự ẩn sau bao lâu; `sticky` (H-1344) ⇒ không tự ẩn (null). */
export function toastTimeoutMs(item, toastSeconds) {
  return item.sticky ? null : Math.round((toastSeconds || TOAST_SECONDS_DEFAULT) * 1000);
}

/** Đánh dấu đã đọc tại chỗ (lạc quan) sau khi Hub nhận POST …/read. */
export function markRead(items, ids, at) {
  const set = new Set(ids);
  return items.map((n) => (set.has(n.id) && !n.readAt ? { ...n, readAt: at } : n));
}

/** Giờ ngắn trên dòng thông báo: "09:20" trong ngày, "Hôm qua 17:40", hoặc "16/10 08:00". */
export function whenText(iso, now) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  const day = (x) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (day(d) === day(now)) return hm;
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (day(d) === day(y)) return `Hôm qua ${hm}`;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hm}`;
}

/**
 * Chữ trên huy hiệu icon Chrome (H-1264 a: huy hiệu là số chưa đọc). Không có chưa đọc mà máy cần người
 * xem (thu review lỗi, chưa đăng nhập hay hết phiên Hub) ⇒ "!". Còn lại ⇒ rỗng.
 */
export function badgeText({ unread, problem }) {
  const n = Number(unread) || 0;
  if (n > 0) return n > 99 ? "99+" : String(n);
  return problem ? "!" : "";
}

// ---------- Nguồn ----------

/**
 * Nguồn Hub. 404 không phải JSON ⇒ `unavailable` (Hub này chưa dựng route) ⇒ ẩn cả tính năng.
 * `fetchJson(url, init)` do service worker cấp, trả `{ status, url, redirected, json }` hoặc `{ netError }`.
 */
export function hubSource(origin, fetchJson) {
  return {
    kind: "hub",
    async list() {
      const r = await fetchJson(origin + NOTIFICATIONS_PATH, { method: "GET" });
      return listReply(r);
    },
    async read(ids) {
      const r = await fetchJson(origin + NOTIFICATIONS_READ_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (r?.json?.ok === true) return { ok: true, unread: Number.isInteger(r.json.unread) ? r.json.unread : null };
      if (r?.status === 401) return { ok: false, state: "out" };
      return { ok: false, state: r?.netError ? "net" : "server" };
    },
  };
}

/** Lời đáp GET danh sách ⇒ trạng thái nguồn. */
export function listReply(r) {
  if (!r || r.netError) return { state: "net" };
  if (r.status === 401 || r.json?.error === "NOT_SIGNED_IN") return { state: "out" };
  if (r.status === 404 && !r.json) return { state: "unavailable" };
  const parsed = parseNotifications(r.json);
  if (!parsed) return { state: r.status === 404 ? "unavailable" : "server" };
  return { state: "ok", ...parsed };
}

/**
 * Nguồn GIẢ cho bản dựng đo (env.js DEV_FLAGS.fakeNotifications). Nội dung là minh hoạ, tên người
 * là tên giả. `push()` thêm một thông báo mới để thử thông báo nổi.
 */
export function fakeSource(now = () => new Date()) {
  const at = (minAgo) => new Date(now().getTime() - minAgo * 60_000).toISOString();
  let seq = 3;
  let items = [
    { id: "f1", title: "Tài liệu SOP mới cần đọc: Nhận phòng sau 22:00", body: "Đọc trước ca tối.", from: "Quản lý cơ sở · Trần Thị Mai", createdAt: at(20), readAt: null, url: "/notifications", kind: "bulletin", sticky: true },
    { id: "f2", title: "Công việc mới giao cho bạn: Kiểm tra máy lạnh phòng 304", body: "Hạn 15:00 hôm nay.", from: "Công việc", createdAt: at(45), readAt: null, url: "/notifications", kind: "work", sticky: false },
    { id: "f3", title: "Đề nghị bảo trì phòng 207 đã hoàn thành", body: "Thay vòi sen.", from: "Bảo trì", createdAt: at(60 * 20), readAt: at(60 * 18), url: "/notifications", kind: "maintenance", sticky: false },
  ];
  return {
    kind: "fake",
    async list() {
      return { state: "ok", me: { name: "Lễ tân (minh hoạ)" }, items: items.map((x) => ({ ...x })), unread: items.filter((n) => !n.readAt).length, toastSeconds: TOAST_SECONDS_DEFAULT };
    },
    async read(ids) {
      items = markRead(items, ids, now().toISOString());
      return { ok: true, unread: items.filter((n) => !n.readAt).length };
    },
    push(partial = {}) {
      seq += 1;
      const n = { id: "f" + seq, title: `Thông báo minh hoạ số ${seq}`, body: "Nội dung minh hoạ.", from: "Quản lý cụm · Đỗ Minh Châu", createdAt: now().toISOString(), readAt: null, url: "/notifications", kind: "bulletin", sticky: false, ...partial };
      items = [n, ...items];
      return n;
    },
  };
}
