import test from "node:test";
import assert from "node:assert/strict";
import { expediaLanding, pickPropertyId } from "../extension/scanners.js";
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

test("Expedia: đọc trang đích sau khi mở trang review — đúng trang chưa, URL có sẵn htid không", () => {
  const base = "https://apps.expediapartnercentral.com";
  assert.deepEqual(expediaLanding(`${base}/supply/reviews/post-stay-reviews?htid=126951449`), {
    onReviews: true,
    htid: "126951449",
    path: "/supply/reviews/post-stay-reviews",
  });
  // Máy Maison Trường Thịnh 09/10/2026 (E-ZNH39T): bị đá sang hộp thư, không phải trang review.
  assert.equal(expediaLanding(`${base}/supply/inbox`).onReviews, false);
  assert.equal(expediaLanding(`${base}/supply/inbox`).htid, null);
  assert.equal(expediaLanding(`${base}/supply/inbox?htid=777&tpid=1`).htid, "777");
  assert.equal(expediaLanding(`${base}/lodging/manageproperty/x`).onReviews, false);
  assert.equal(expediaLanding(`${base}/supply/inbox?htid=abc`).htid, null, "htid không phải số thì không dùng");
  assert.equal(expediaLanding("").onReviews, false);
});

test("Trang tự chuyển đi khỏi trang review ⇒ lỗi loại PAGE, không còn là SCAN chung chung", () => {
  const kind = (m) => classifyError("expedia", "quét", m).code;
  assert.equal(kind("Expedia chuyển sang /supply/inbox thay vì trang review"), "EXP-PAGE");
  assert.equal(kind("Expedia chuyển sang /supply/inbox thay vì trang review của chỗ nghỉ 1. Kiểm lại mã Expedia trong cài đặt."), "EXP-PAGE");
  assert.equal(classifyError("trip", "quét", "Trang Trip chuyển sang /home giữa lượt quét, không lấy được kết quả").code, "TRP-PAGE");
  // Đối chứng: câu chưa biết vẫn rơi về SCAN, chữ "chuyển" lẻ không đủ để thành PAGE.
  assert.equal(kind("Quét thất bại"), "EXP-SCAN");
  assert.equal(kind("chuyển khoản lỗi"), "EXP-SCAN");
});
