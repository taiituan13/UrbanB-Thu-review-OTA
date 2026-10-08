import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Chạy capture.js trong một "trang" giả: có fetch và XMLHttpRequest tối giản.
function loadPage() {
  const sent = [];
  class FakeXHR {
    open(method, url) { this.req = { method, url }; }
    setRequestHeader() {}
    send(body) { sent.push({ ...this.req, body }); }
  }
  const window = { fetch: async () => ({ ok: true }) };
  const ctx = { window, location: { href: "https://ha.go2joy.vn/review-detail" }, XMLHttpRequest: FakeXHR, URL };
  window.window = window;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../extension/capture.js", import.meta.url), "utf8"), ctx);
  return { window, XHR: FakeXHR, sent };
}

test("Go2Joy: bắt request XHR của trang, đủ header đăng nhập, request vẫn đi bình thường", () => {
  const { window, XHR, sent } = loadPage();
  const x = new XHR();
  x.open("GET", "https://api-ha.go2joy.vn/api/v1/hotel/getUserReviewList?limit=20&page=1&hotelSn=10715&tab=1&sortBy=1");
  x.setRequestHeader("Authorization", "Bearer giả");
  x.setRequestHeader("Version", "23.4.0");
  x.send();
  const cap = window.__urbanbCap.go2joy;
  assert.ok(cap, "phải bắt được");
  assert.match(cap.url, /hotelSn=10715/);
  assert.equal(cap.init.method, "GET");
  assert.deepEqual(JSON.parse(JSON.stringify(cap.init.headers)), { Authorization: "Bearer giả", Version: "23.4.0" });
  assert.equal(sent.length, 1, "request gốc vẫn được gửi");
});

test("XHR không phải danh sách review thì không bị ghi", () => {
  const { window, XHR } = loadPage();
  const x = new XHR();
  x.open("GET", "https://api-ha.go2joy.vn/api/v1/staff/getPopupNotification");
  x.send();
  assert.equal(Object.keys(window.__urbanbCap).length, 0);
});

test("Đường fetch của Traveloka vẫn bắt như cũ", async () => {
  const { window } = loadPage();
  await window.fetch("https://tera.traveloka.com/api/v2/review/getHotelReviews", { method: "POST", body: "{}" });
  assert.equal(window.__urbanbCap.traveloka.init.body, "{}");
});
