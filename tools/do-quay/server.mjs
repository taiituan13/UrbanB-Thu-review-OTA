// Hub giả + Apps Script giả cho bản dựng đo. MODE đổi qua /__mode?m=… (ok · out · unlinked · down).
import http from "node:http";
export const state = { mode: "ok", log: [] };
const json = (res, status, body) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); };
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const BRANCH = { id: "b-govap", name: "SGH Gò Vấp" };
function matches() {
  const base = { roomType: "Deluxe Double", bookingType: "Qua đêm", paymentAmount: 650000, paymentStatus: "Đã thanh toán", guestPhone: "" };
  return [
    { ...base, sourceKey: "k1", source: "Agoda", bookingNumber: "AG-1029384", guestName: "Nguyễn Văn An", checkIn: addDays(0) + " 14:00", checkOut: addDays(1) + " 12:00", ezCloud: { status: "CREATED", reservationRoomId: "88123", reservationId: "77001" }, go2Joy: { lockStatus: "LOCKED", lockMessage: "Đã khoá Deluxe Double" }, roomAssigned: { confirmed: true } },
    { ...base, sourceKey: "k2", source: "Booking.com", bookingNumber: "BK-55102", guestName: "Trần Thị Bình", checkIn: addDays(0) + " 14:00", checkOut: addDays(2) + " 12:00", ezCloud: { status: "ERROR", message: "Không tìm thấy loại phòng tương ứng trên EZCloud" }, go2Joy: { lockStatus: "" } },
    { ...base, sourceKey: "k3", source: "UrbanB", bookingNumber: "UB-3301", guestName: "Lê Minh Châu", paymentStatus: "Chưa thanh toán", checkIn: addDays(1) + " 14:00", checkOut: addDays(2) + " 12:00", ezCloud: { status: "CREATED", reservationRoomId: "88200", reservationId: "77050" }, go2Joy: { lockStatus: "SKIPPED", lockMessage: "Chưa khoá: chờ xác nhận thanh toán" } },
    { ...base, sourceKey: "k4", source: "Traveloka", bookingNumber: "TV-99812", guestName: "Phạm Quốc Dũng", checkIn: addDays(3) + " 14:00", checkOut: addDays(4) + " 12:00", ezCloud: { status: "CREATED" }, go2Joy: { lockStatus: "SYNCED" } },
  ];
}
function board() {
  const days = Array.from({ length: 14 }, (_, i) => addDays(i));
  const rt = (id, name, total, f) => ({ roomTypeId: id, name, total, rooms: Array.from({ length: total }, (_, i) => String(101 + i)), perDay: days.map((_, i) => ({ free: f(i), total, freeRooms: [] })) });
  return {
    occupancy: { ok: true, days, generatedAt: "09:30", roomTypes: [rt("R1", "Deluxe Double", 6, (i) => (i * 7) % 4), rt("R2", "Superior Twin", 4, (i) => (i % 3 === 0 ? 0 : 1)), rt("R3", "Family Suite", 2, (i) => (i === 5 ? null : 2))] },
    locks: { haOk: true, count: 4, haLocks: [{ ezRoomTypeId: "R1", lockCategory: "overnight", startDate: days[0], endDate: days[1], createTime: "08:00", createBy: "giả" }, { ezRoomTypeId: "R2", lockCategory: "hourly", startDate: days[2], startTime: "10:00", endTime: "13:00", createTime: "08:10", createBy: "giả" }], locks: [{ ezRoomTypeId: "R3", status: "AVAILABLE", lockCategory: "overnight", checkIn: days[3] + "T14:00", checkOut: days[4] + "T12:00", source: "Agoda", bookingNumber: "AG-1", guestName: "Khách giả" }] },
  };
}
function indicators() {
  const s = (o) => ({ branchId: BRANCH.id, verdict: null, handled: null, reason: null, ...o });
  return {
    ok: true, branch: BRANCH, lastRunAt: new Date(Date.now() - 25 * 60000).toISOString(), stale: [], lead: null,
    situations: [
      s({ id: "s1", no: "01", target: today(), status: "vuot" }),
      s({ id: "s2", no: "05", target: addDays(2), status: "vuot", reason: "over-capacity" }),
      s({ id: "s3", no: "03", target: addDays(1), status: "vuot" }),
      s({ id: "s4", no: "10", target: today(), status: "thieu" }),
      s({ id: "s5", no: "02", target: today(), status: "dat" }),
    ],
  };
}
export function start(port) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    state.log.push(req.method + " " + u.pathname + (u.search ? "?" + [...u.searchParams.keys()].join(",") : ""));
    if (u.pathname === "/__mode") { state.mode = u.searchParams.get("m"); return json(res, 200, { ok: true }); }
    if (u.pathname === "/login") { res.setHeader("content-type", "text/html; charset=utf-8"); return res.end("<h1>Đăng nhập Hub (giả)</h1>"); }
    if (u.pathname.startsWith("/api/extension/")) {
      if (state.mode === "down") { res.statusCode = 502; res.setHeader("content-type", "text/html"); return res.end("<h1>502</h1>"); }
      if (state.mode === "out") return json(res, 401, { ok: false, error: "NOT_SIGNED_IN" });
      const hotel = u.searchParams.get("ezcloudHotelId");
      if (!hotel) return json(res, 400, { ok: false, error: "MISSING_HOTEL" });
      if (state.mode === "unlinked") return json(res, 404, { ok: false, error: "HOTEL_NOT_LINKED" });
      if (u.pathname === "/api/extension/connection")
        return json(res, 200, { ok: true, branch: BRANCH, otaSync: { webAppUrl: `http://localhost:${port}/macros/s/FAKE_DEPLOY/exec`, pushKey: "pk-gia", apiToken: "api-gia", updatedAt: "2026-10-16T01:00:00Z" }, reviewSheet: null });
      if (u.pathname === "/api/extension/indicators") return json(res, 200, indicators());
      return json(res, 404, { ok: false, error: "X" });
    }
    if (u.pathname === "/macros/s/FAKE_DEPLOY/exec") {
      if (req.method === "POST") { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => json(res, 200, { ok: true, hotel: "SGH Gò Vấp", result: { status: "SAVED", message: "Đã lưu token" } })); return; }
      const a = u.searchParams.get("action");
      if (a === "board") return json(res, 200, { ok: true, hotel: "SGH Gò Vấp", result: board() });
      if (a === "lockG2J") return json(res, 200, { ok: true, hotel: "SGH Gò Vấp", result: { lockResult: { status: "LOCKED", message: "Đã khoá Deluxe Double 14:00 đến 12:00" } } });
      return json(res, 200, { ok: true, hotel: "SGH Gò Vấp", result: { matches: matches() } });
    }
    res.statusCode = 404; res.end("not found");
  });
  return new Promise((r) => srv.listen(port, "127.0.0.1", () => r(srv)));
}
