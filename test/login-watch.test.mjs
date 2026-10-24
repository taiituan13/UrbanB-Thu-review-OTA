import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AUTO_RESCAN_COOLDOWN_MS, LOGIN_PAGE, autoRescanChannel, signedInChannelOf } from "../extension/login-watch.js";

const NOW = Date.parse("2026-10-24T03:00:00Z");
const base = {
  url: "https://ebooking.trip.com/comment/commentList",
  enabled: { trip: true, booking: true },
  status: { trip: { state: "login" }, booking: { state: "ok" } },
  running: false,
  lastTry: {},
  now: NOW,
};

test("signedInChannelOf: trang quản lý ⇒ kênh; trang đăng nhập hay trang lạ ⇒ null", () => {
  assert.equal(signedInChannelOf("https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/home.html"), "booking");
  assert.equal(signedInChannelOf("https://account.booking.com/sign-in"), null);
  assert.equal(signedInChannelOf("https://ycs.agoda.com/mldc/vi-vn/app/12345"), "agoda");
  assert.equal(signedInChannelOf("https://ycs.agoda.com/public/login"), null);
  assert.equal(signedInChannelOf("https://ebooking.trip.com/login/index"), null);
  assert.equal(signedInChannelOf("https://apps.expediapartnercentral.com/supply/inbox"), "expedia");
  assert.equal(signedInChannelOf("https://www.expediapartnercentral.com/Account/Logon"), null);
  assert.equal(signedInChannelOf("https://tera.traveloka.com/vi-vn/guest-review/"), "traveloka");
  assert.equal(signedInChannelOf("https://ha.go2joy.vn/review-detail"), "go2joy");
  assert.equal(signedInChannelOf("https://ha.go2joy.vn/login"), null);
  assert.equal(signedInChannelOf("https://pms.ezcloudhotel.com/"), null);
  assert.equal(signedInChannelOf("http://ebooking.trip.com/"), null);
  assert.equal(signedInChannelOf("không phải url"), null);
});

test("autoRescanChannel: đủ điều kiện ⇒ quét lại đúng kênh vừa đăng nhập", () => {
  assert.equal(autoRescanChannel(base), "trip");
});

test("autoRescanChannel: counter — không quét chồng khi đang có lượt quét chạy", () => {
  assert.equal(autoRescanChannel({ ...base, running: true }), null);
});

test("autoRescanChannel: counter — kênh không lỗi đăng nhập, kênh tắt, trang đăng nhập ⇒ không quét", () => {
  assert.equal(autoRescanChannel({ ...base, status: { trip: { state: "ok" } } }), null);
  assert.equal(autoRescanChannel({ ...base, status: { trip: { state: "error" } } }), null);
  assert.equal(autoRescanChannel({ ...base, enabled: { trip: false } }), null);
  assert.equal(autoRescanChannel({ ...base, url: "https://ebooking.trip.com/login" }), null);
  // Trang Booking đã đăng nhập không kích quét Trip đang lỗi.
  assert.equal(autoRescanChannel({ ...base, url: "https://admin.booking.com/" }), null);
});

test("autoRescanChannel: counter — trong khoảng nghỉ thì không quét lại lần nữa", () => {
  assert.equal(autoRescanChannel({ ...base, lastTry: { trip: NOW - AUTO_RESCAN_COOLDOWN_MS + 1 } }), null);
  assert.equal(autoRescanChannel({ ...base, lastTry: { trip: NOW - AUTO_RESCAN_COOLDOWN_MS } }), "trip");
  // Khoảng nghỉ tính riêng từng kênh.
  assert.equal(autoRescanChannel({ ...base, lastTry: { booking: NOW } }), "trip");
});

test("LOGIN_PAGE: mỗi kênh có trang mở, và trang ấy thuộc host_permissions của manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  for (const ch of ["booking", "agoda", "trip", "expedia", "traveloka", "go2joy"]) {
    const url = LOGIN_PAGE[ch];
    assert.ok(url, ch);
    assert.ok(manifest.host_permissions.includes(new URL(url).origin + "/*"), url);
  }
});

test("🔴 nguồn background.js: quét lại một kênh chỉ quét kênh ấy, tự quét đi qua autoRescanChannel", () => {
  const src = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  assert.match(src, /if \(only && !only\.includes\(channel\)\) continue;/);
  assert.match(src, /msg\?\.type === "scanChannel"[\s\S]*?runScan\("bấm tay", \[channel\]\)/);
  assert.match(src, /chrome\.tabs\.onUpdated\.addListener[\s\S]*?autoRescanChannel\([\s\S]*?runScan\("tự quét sau đăng nhập", \[channel\]\)/);
});

test("🔴 nguồn popup.js: dòng kênh cần đăng nhập có hai nút", () => {
  const src = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.match(src, /s\?\.state === "login"\) div\.querySelector\("\.body"\)\.appendChild\(loginActions\(ch\)\)/);
  assert.match(src, /"Mở trang đăng nhập"/);
  assert.match(src, /"Quét lại kênh này"/);
  assert.match(src, /type: "scanChannel", channel: ch/);
});
