// Cơ sở của người đăng nhập (YC-152 mục 3 · H-1351 c): liệt kê bằng scope=mine (chỉ đọc), nhiều cơ sở thì
// hỏi chọn, rồi lấy mã kết nối bằng ?branchId=. Dùng để token Go2Joy đi đúng Apps Script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as H from "../extension/quay/hub-quay.js";

const O = "https://hub.urbanb.vn";
// Đúng hình dạng Hub trả (repo UrbanB: connection/route.ts, listCounterConnections).
const mineReply = {
  ok: true,
  branches: [
    { id: "br_pct", name: "Phạm Công Trứ", code: "PCT", ezcloudHotelId: 1234, otaSync: { webAppUrl: "https://script.google.com/macros/s/A/exec", pushKey: "k", apiToken: "t", updatedAt: "x" } },
    { id: "br_mtt", name: "Mạc Thị Bưởi", code: "MTT", ezcloudHotelId: null, otaSync: null },
  ],
  reviewSheet: null,
};

test("URL: scope=mine không kèm tham số nào khác; branchId nhận report như đường ezcloudHotelId", () => {
  assert.equal(H.mineUrl(O), O + "/api/extension/connection?scope=mine");
  assert.equal(H.branchConnectionUrl(O, "br_pct"), O + "/api/extension/connection?branchId=br_pct");
  const u = new URL(H.branchConnectionUrl(O, "br_pct", { kind: "rejected", message: "sai mã" }));
  assert.deepEqual([...u.searchParams.keys()], ["branchId", "report", "message"]);
  assert.ok(!u.searchParams.has("ezcloudHotelId"), "branchId kèm ezcloudHotelId ⇒ Hub trả INVALID_QUERY");
});

test("Danh sách cơ sở: giữ id, tên, mã, mã ezCloud; KHÔNG giữ mã kết nối", () => {
  const list = H.parseMine(mineReply);
  assert.deepEqual(list, [
    { id: "br_pct", name: "Phạm Công Trứ", code: "PCT", ezcloudHotelId: "1234" },
    { id: "br_mtt", name: "Mạc Thị Bưởi", code: "MTT", ezcloudHotelId: "" },
  ]);
  assert.ok(!JSON.stringify(list).includes("pushKey"));
  assert.deepEqual(H.parseMine({ ok: true, branches: [] }), []);
  assert.equal(H.parseMine({ ok: false, error: "NOT_SIGNED_IN" }), null);
  assert.deepEqual(H.parseMine({ ok: true, branches: [{ name: "thiếu id" }, null] }), []);
});

const list = H.parseMine(mineReply);
const one = list.slice(0, 1);

test("Chọn cơ sở: một cơ sở dùng luôn; nhiều cơ sở chưa chọn ⇒ hỏi; đã chọn ⇒ dùng; chọn cơ sở không còn ⇒ hỏi lại", () => {
  assert.equal(H.pickBranch(null, "").state, "unknown");
  assert.equal(H.pickBranch([], "").state, "none");
  assert.deepEqual(H.pickBranch(one, ""), { state: "one", branch: one[0] });
  assert.deepEqual(H.pickBranch(list, ""), { state: "ask" });
  assert.equal(H.pickBranch(list, "br_mtt").branch.id, "br_mtt");
  assert.equal(H.pickBranch(list, "br_mtt").state, "chosen");
  assert.deepEqual(H.pickBranch(list, "br_da_xoa"), { state: "ask" });
});

test("🔴 Token Go2Joy: nhiều cơ sở chưa chọn ⇒ KHÔNG đoán theo khách sạn PMS mở gần nhất", () => {
  assert.deepEqual(H.go2joyTarget({ branches: list, chosenId: "", lastHotel: "1234" }), { ask: true, count: 2 });
  assert.deepEqual(H.go2joyTarget({ branches: list, chosenId: "br_mtt", lastHotel: "1234" }), { branchId: "br_mtt" });
  assert.deepEqual(H.go2joyTarget({ branches: one, chosenId: "", lastHotel: "9999" }), { branchId: "br_pct" });
  assert.equal(H.go2joyTarget({ branches: [], chosenId: "", lastHotel: "1234" }), null);
});

test("Token Go2Joy khi chưa có danh sách (chưa đăng nhập, Hub cũ): cơ sở đã chọn trước, không có thì như 1.0.0", () => {
  assert.deepEqual(H.go2joyTarget({ branches: null, chosenId: "br_mtt", lastHotel: "1234" }), { branchId: "br_mtt" });
  assert.deepEqual(H.go2joyTarget({ branches: null, chosenId: "", lastHotel: "1234" }), { hotelId: "1234" });
  assert.equal(H.go2joyTarget({ branches: null, chosenId: "", lastHotel: "" }), null);
});

test("Ô chọn cơ sở trong popup chỉ hiện khi có từ hai cơ sở; chưa chọn ⇒ nhắc", () => {
  assert.equal(H.branchPicker(null, ""), null);
  assert.equal(H.branchPicker(one, ""), null);
  const ask = H.branchPicker(list, "");
  assert.equal(ask.ask, true);
  assert.equal(ask.value, "");
  assert.deepEqual(ask.options.map((o) => o.label), ["Chọn cơ sở…", "PCT · Phạm Công Trứ", "MTT · Mạc Thị Bưởi"]);
  assert.match(ask.text, /2 cơ sở/);
  const chosen = H.branchPicker(list, "br_pct");
  assert.equal(chosen.ask, false);
  assert.equal(chosen.value, "br_pct");
});

test("Cơ sở đã xoá (BRANCH_NOT_FOUND) ⇒ chưa xác định cơ sở, không phải lỗi máy chủ", () => {
  assert.deepEqual(H.classifyHubReply({ status: 404, url: O + "/api/extension/connection", json: { ok: false, error: "BRANCH_NOT_FOUND" } }), {
    state: "nobranch",
    why: "gone",
    code: "BRANCH_NOT_FOUND",
  });
});

test("Service worker: token Go2Joy chốt đích qua go2joyTarget; danh sách cơ sở không lưu mã kết nối", () => {
  const sw = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  const flush = sw.slice(sw.indexOf("async function flushToken("), sw.indexOf("\n}\n", sw.indexOf("async function flushToken(")));
  assert.match(flush, /kind === "go2joy" \? await go2joyTarget\(/);
  assert.match(sw, /set\(K\.mine, \{ branches, at: now\(\) \}\)/);
  assert.match(sw, /const branches = H\.parseMine\(cls\.data\)/);
});
