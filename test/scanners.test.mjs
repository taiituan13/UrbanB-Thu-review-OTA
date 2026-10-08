import test from "node:test";
import assert from "node:assert/strict";
import { pickPropertyId } from "../extension/scanners.js";
import { classifyError } from "../extension/report.js";

const fail = (ids) => {
  try {
    pickPropertyId("Expedia", ids);
  } catch (e) {
    return e.message;
  }
  assert.fail("phải báo lỗi");
};

test("Expedia: tài khoản một chỗ nghỉ ⇒ tự dùng mã đó", () => {
  assert.equal(pickPropertyId("Expedia", ["126951449"]), "126951449");
});

test("Expedia: nhiều chỗ nghỉ ⇒ lỗi loại MULTI, liệt kê mã", () => {
  const m = fail(["1", "2"]);
  assert.match(m, /1, 2/);
  assert.equal(classifyError("expedia", "quét", m).code, "EXP-MULTI");
});

test("Expedia: không thấy chỗ nghỉ nào ⇒ lỗi loại NOID", () => {
  assert.equal(classifyError("expedia", "quét", fail([])).code, "EXP-NOID");
});
