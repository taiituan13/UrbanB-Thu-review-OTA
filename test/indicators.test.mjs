import { test } from "node:test";
import assert from "node:assert/strict";
import * as I from "../extension/quay/indicators.js";

const s = (o) => ({ id: "s" + o.no, no: "01", branchId: "b", target: "2026-10-16", status: "vuot", reason: null, verdict: null, handled: null, ...o });

test("isExceeded: vượt và chưa xử lý", () => {
  assert.equal(I.isExceeded(s({})), true);
  assert.equal(I.isExceeded(s({ handled: { at: "x" } })), false);
  assert.equal(I.isExceeded(s({ status: "dat" })), false);
});

test("markOf: chỉ đọc mức Hub trả, không tự suy mức (luật Hub)", () => {
  assert.equal(I.markOf(s({ display: { mark: "warning" } })), "warning");
  assert.equal(I.markOf(s({ reason: "over-capacity" })), "over-capacity");
  // Đối chứng: không có display.mark ⇒ extension KHÔNG đoán Cảnh báo/Chú ý theo số chỉ báo.
  assert.equal(I.markOf(s({ no: "05" })), null);
  assert.equal(I.markOf(s({ display: { mark: "bịa" } })), null);
});

test("dotLevel: Cảnh báo đỏ · Chú ý vàng · không mức trung tính · rỗng xanh", () => {
  assert.equal(I.dotLevel([]), "ok");
  assert.equal(I.dotLevel([s({ display: { mark: "notice" } }), s({ display: { mark: "warning" } })]), "cb");
  assert.equal(I.dotLevel([s({ display: { mark: "notice" } })]), "cy");
  assert.equal(I.dotLevel([s({})]), "lv");
});

test("sortExceeded: mức cao trước, rồi ngày từ hôm nay, gần trước, ngày đã qua sau", () => {
  const today = "2026-10-16";
  const list = [
    s({ no: "02", target: "2026-10-15", display: { mark: "warning" } }),
    s({ no: "03", target: "2026-10-18", display: { mark: "warning" } }),
    s({ no: "04", target: "2026-10-16", display: { mark: "warning" } }),
    s({ no: "01", target: "2026-10-16", display: { mark: "notice" } }),
    s({ no: "05", target: "2026-10-16" }),
    s({ no: "07", target: "2026-10-16", reason: "over-capacity" }),
  ];
  assert.deepEqual(I.sortExceeded(list, today).map((x) => x.no), ["07", "04", "03", "02", "01", "05"]);
});

test("dayLabel", () => {
  assert.equal(I.dayLabel("2026-10-16", "2026-10-16"), "Hôm nay · T6 16/10");
  assert.equal(I.dayLabel("2026-10-18", "2026-10-16"), "Ngày +2 · CN 18/10");
  assert.equal(I.dayLabel("2026-10-15", "2026-10-16"), "Hôm qua · T5 15/10");
  assert.equal(I.dayLabel("2026-11", "2026-10-16"), "Tháng 11/2026");
});

test("indicatorsModel: số chính và Việc cần làm chỉ hiện khi Hub trả (H-1545 b)", () => {
  const data = {
    ok: true,
    branch: { id: "b1", name: "UB1" },
    lastRunAt: "2026-10-16T02:30:00Z",
    stale: [{}],
    situations: [
      s({ no: "01", display: { mark: "warning", title: "01 · Hôm nay trống nhiều", main: "Trống 12/20", todo: "  " } }),
      s({ no: "10", status: "thieu", display: { title: "08 · Phòng giờ dưới mức tối thiểu" } }),
      s({ no: "03", status: "dat" }),
    ],
  };
  const m = I.indicatorsModel(data, "2026-10-16");
  assert.equal(m.branchName, "UB1");
  assert.equal(m.exceeded.length, 1);
  assert.equal(m.exceeded[0].main, "Trống 12/20");
  assert.equal(m.exceeded[0].todo, null, "chuỗi trắng ⇒ khe ẩn");
  assert.equal(m.exceeded[0].markLabel, "Cảnh báo");
  assert.deepEqual(m.missing, ["08 · Phòng giờ dưới mức tối thiểu"]);
  assert.equal(m.staleSources, 1);
  assert.equal(m.level, "cb");
  const bare = I.indicatorsModel({ situations: [s({})] }, "2026-10-16");
  assert.equal(bare.exceeded[0].main, "");
  assert.equal(bare.exceeded[0].todo, null);
  assert.equal(I.verdictText(bare).n, 1);
  assert.equal(I.missingText(bare), null);
  assert.equal(I.lastRunText(null), "Chưa có lượt chạy chỉ báo nào");
});

test("YC-159 — tên và số hiển thị đọc từ Hub; Hub cũ ⇒ 'Chỉ báo <id>', không bảng tên chép tay", () => {
  assert.equal(I.titleOf(s({ no: "07", display: { title: "06 · Biến động bất thường" } })), "06 · Biến động bất thường");
  assert.equal(I.titleOf(s({ no: "11", display: { title: "09 · Doanh thu dự kiến tháng dưới mốc" } })), "09 · Doanh thu dự kiến tháng dưới mốc");
  // Đối chứng: Hub cũ chưa trả title ⇒ không tự đặt tên (bảng tên thứ hai đã bỏ).
  assert.equal(I.titleOf(s({ no: "07" })), "Chỉ báo 07");
  assert.equal(I.titleOf(s({ no: "07", display: { title: " " } })), "Chỉ báo 07");
  assert.equal("INDICATOR_NAMES" in I, false);
});

test("YC-159 — gom theo chỉ báo (khuôn groupByIndicator H-1429): năm ngày 04 thành một nhóm", () => {
  const today = "2026-10-16";
  const d = (no, target, mark, extra = {}) => s({ id: `${no}-${target}`, no, target, display: { mark, title: `T${no}`, ...extra } });
  const data = {
    situations: [
      d("04", "2026-10-20", "notice"),
      d("05", "2026-10-17", "warning", { todo: "Khoá 2" }),
      d("04", "2026-10-18", "notice"),
      d("05", "2026-10-16", "warning", { todo: "Khoá 1" }),
      d("01", "2026-10-16", "warning", { todo: "Gán phòng" }),
      d("04", "2026-10-25", "notice"),
      s({ id: "ov", no: "02", target: "2026-10-19", reason: "over-capacity", display: { mark: "over-capacity", title: "T02" } }),
    ],
  };
  const m = I.indicatorsModel(data, today);
  // Nhóm đứng theo dòng nặng nhất của nó; trong nhóm giữ thứ tự đã xếp.
  assert.deepEqual(m.groups.map((g) => g.no), ["02", "01", "05", "04"]);
  const g04 = m.groups.find((g) => g.no === "04");
  assert.deepEqual(g04.rows.map((c) => c.id), ["04-2026-10-18", "04-2026-10-20", "04-2026-10-25"]);
  assert.deepEqual(g04.levels, [{ mark: "notice", n: 3, label: "3 Chú ý" }]);
  assert.equal(g04.title, "T04");
  // Câu giống nhau ⇒ một lần dưới nhóm; khác nhau theo ngày ⇒ dưới từng dòng; không có câu ⇒ ẩn.
  assert.equal(m.groups.find((g) => g.no === "01").todo, "Gán phòng");
  const g05 = m.groups.find((g) => g.no === "05");
  assert.equal(g05.todo, null);
  assert.equal(g05.rowTodo, true);
  assert.equal(g04.todo, null);
  assert.equal(g04.rowTodo, false);
  // Số ca trên tab vẫn đếm theo ca, không theo nhóm.
  assert.equal(m.exceeded.length, 7);
});
