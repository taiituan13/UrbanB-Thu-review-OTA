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

test("indicatorsModel: dòng chính và Việc cần làm chỉ hiện khi Hub trả (H-1345)", () => {
  const data = {
    ok: true,
    branch: { id: "b1", name: "UB1" },
    lastRunAt: "2026-10-16T02:30:00Z",
    stale: [{}],
    situations: [s({ no: "01", display: { mark: "warning", main: "Trống 12/20", chips: ["a", 3], todo: "  " } }), s({ no: "10", status: "thieu" }), s({ no: "03", status: "dat" })],
  };
  const m = I.indicatorsModel(data, "2026-10-16");
  assert.equal(m.branchName, "UB1");
  assert.equal(m.exceeded.length, 1);
  assert.equal(m.exceeded[0].main, "Trống 12/20");
  assert.deepEqual(m.exceeded[0].chips, ["a"]);
  assert.equal(m.exceeded[0].todo, null, "chuỗi trắng ⇒ khe ẩn");
  assert.equal(m.exceeded[0].markLabel, "Cảnh báo");
  assert.deepEqual(m.missing, ["10 Phòng giờ dưới mức tối thiểu"]);
  assert.equal(m.staleSources, 1);
  assert.equal(m.level, "cb");
  const bare = I.indicatorsModel({ situations: [s({})] }, "2026-10-16");
  assert.equal(bare.exceeded[0].main, "");
  assert.equal(bare.exceeded[0].todo, null);
  assert.equal(I.verdictText(bare).n, 1);
  assert.equal(I.missingText(bare), null);
  assert.equal(I.lastRunText(null), "Chưa có lượt chạy chỉ báo nào");
});
