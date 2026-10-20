import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TAB, FRAME_TABS, todoModel } from "../extension/quay/todo.js";

// YC-159 — tab chính "Cần xử lý": booking OTA lỗi + chỉ báo đang vượt trên một màn.

const ok = (lock = "LOCKED") => ({ sourceKey: "k" + Math.random(), ezCloud: { status: "CREATED" }, go2Joy: { lockStatus: lock } });
const ezErr = () => ({ sourceKey: "e", ezCloud: { status: "ERROR", message: "x" }, go2Joy: {} });
const ind = (n) => ({ exceeded: Array.from({ length: n }, (_, i) => ({ id: "s" + i })) });

test("tab chính đứng đầu và là tab mở mặc định; Chỉ báo không còn là tab riêng", () => {
  assert.equal(FRAME_TABS[0].id, "todo");
  assert.equal(DEFAULT_TAB, "todo");
  assert.deepEqual(
    FRAME_TABS.map((t) => t.id),
    ["todo", "bookings", "board"],
  );
});

test("🔴 chỉ booking lỗi vào tab chính, booking ổn thì không", () => {
  const m = todoModel({ recent: { ok: true, matches: [ok(), ezErr(), ok("SKIPPED"), ok("SYNCED")] }, ind: null });
  assert.equal(m.issues.length, 2);
  assert.deepEqual(
    m.issues.map((x) => x.ezCloud.status + "/" + (x.go2Joy.lockStatus ?? "")),
    ["ERROR/", "CREATED/SKIPPED"],
  );
});

test("🔴 số trên tab chính = booking lỗi + tình huống chỉ báo đang vượt", () => {
  assert.equal(todoModel({ recent: { ok: true, matches: [ezErr()] }, ind: ind(3) }).count, 4);
  assert.equal(todoModel({ recent: { ok: true, matches: [ok()] }, ind: ind(0) }).count, 0);
  assert.equal(todoModel({ recent: null, ind: ind(2) }).count, 2);
});

test("đọc booking hỏng: dùng bản lưu nếu có, không có thì chưa biết (không nói là không có booking lỗi)", () => {
  const cached = todoModel({ recent: { ok: false, error: "x", cached: { matches: [ezErr()] } }, ind: null });
  assert.equal(cached.bookingsKnown, true);
  assert.equal(cached.issues.length, 1);
  const none = todoModel({ recent: { ok: false, error: "x" }, ind: null });
  assert.equal(none.bookingsKnown, false);
  assert.equal(none.issues.length, 0);
  assert.equal(todoModel({ recent: null, ind: null }).bookingsKnown, false);
});
