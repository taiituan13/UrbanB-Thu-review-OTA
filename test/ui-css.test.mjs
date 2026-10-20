import { test } from "node:test";
import assert from "node:assert/strict";
import { QUAY_CSS } from "../extension/quay/ui-css.js";
import { NOTIFY_CSS } from "../extension/quay/ui-notify.js";

// Lấy phần khai báo của đúng một bộ chọn (khớp nguyên văn bộ chọn đứng đầu dòng).
function rule(selector, css = QUAY_CSS) {
  const at = css.split("\n").find((line) => line.startsWith(selector + "{"));
  return at ? at.slice(selector.length + 1, at.indexOf("}")) : null;
}

test("nút Urban B có nền xanh đậm", () => {
  assert.match(rule(".qz .qfab") ?? "", /background:var\(--fg\)/);
});

test("dòng xoá mặc định có độ mạnh 0, nên padding của từng khối thắng dù CSS thông báo chèn trước", () => {
  assert.match(rule(":where(.qz *)") ?? "", /padding:0/);
  assert.match(rule(":where(.qz button)") ?? "", /background:none/);
  // Đối chứng: không còn dòng xoá nào mang độ mạnh của một lớp (`.qz *`, `.qz button`…).
  for (const line of QUAY_CSS.split("\n")) {
    assert.doesNotMatch(line, /^\.qz (\*|button|a|svg)\{/, line);
  }
});

test("thẻ tin, toast và chip thông báo khai padding riêng (thứ dòng xoá mặc định từng nuốt)", () => {
  assert.match(rule(".qn", NOTIFY_CSS) ?? "", /padding:10px 11px/);
  assert.match(NOTIFY_CSS, /\n\.qtoast\{[^}]*padding:/); // khai trên nhiều dòng
  assert.match(rule(".qchip", NOTIFY_CSS) ?? "", /padding:/);
});

test("dock và khung lùi vào `--dock-right`, chừa bong bóng chat ezCloud (60px + 20px mép)", () => {
  const right = Number(/--dock-right:(\d+)px/.exec(QUAY_CSS)?.[1]);
  assert.ok(right >= 20 + 60 + 8, `--dock-right = ${right}px`);
  assert.match(rule(".qdock") ?? "", /right:var\(--dock-right\)/);
  assert.match(rule(".qf") ?? "", /right:var\(--dock-right\)/);
});
