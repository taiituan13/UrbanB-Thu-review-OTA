import { test } from "node:test";
import assert from "node:assert/strict";
import { QUAY_CSS } from "../extension/quay/ui-css.js";

// Lấy phần khai báo của đúng một bộ chọn (khớp nguyên văn bộ chọn đứng đầu dòng).
function rule(selector) {
  const at = QUAY_CSS.split("\n").find((line) => line.startsWith(selector + "{"));
  return at ? at.slice(selector.length + 1, at.indexOf("}")) : null;
}

test("nút Urban B có nền xanh đậm ở bộ chọn đủ mạnh để thắng `.qz button`", () => {
  assert.match(rule(".qz .qfab") ?? "", /background:var\(--fg\)/);
});

test("đối chứng: `.qz button` vẫn xoá nền nút, nên dòng `.qz .qfab` còn cần", () => {
  assert.match(rule(".qz button") ?? "", /background:none/);
});

test("dock và khung lùi vào `--dock-right`, chừa bong bóng chat ezCloud (60px + 20px mép)", () => {
  const right = Number(/--dock-right:(\d+)px/.exec(QUAY_CSS)?.[1]);
  assert.ok(right >= 20 + 60 + 8, `--dock-right = ${right}px`);
  assert.match(rule(".qdock") ?? "", /right:var\(--dock-right\)/);
  assert.match(rule(".qf") ?? "", /right:var\(--dock-right\)/);
});
