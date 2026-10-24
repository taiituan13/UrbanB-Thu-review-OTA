import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Chạy bridge.js (content script) trong một trang giả: document.title đổi được, chrome.runtime ghi tin,
// đồng hồ do test bấm (setInterval). Không nạp khung (import động hỏng trong vm, bridge tự bắt lỗi).
function loadBridge(href, title) {
  const sent = [];
  const intervals = [];
  const document = { title, readyState: "complete", addEventListener() {} };
  const chrome = {
    runtime: {
      lastError: undefined,
      sendMessage: (msg, cb) => {
        sent.push(msg);
        cb?.({});
      },
      getURL: (p) => "chrome-extension://x/" + p,
    },
  };
  const u = new URL(href);
  const ctx = {
    location: { href, hostname: u.hostname, origin: u.origin },
    document,
    chrome,
    window: { addEventListener() {} },
    setTimeout: () => 0,
    setInterval: (fn) => intervals.push(fn),
    console: { warn() {} },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../extension/bridge.js", import.meta.url), "utf8"), ctx);
  const tick = () => intervals.forEach((fn) => fn());
  return { bridge: ctx.__urbanbQuayBridge, document, sent, tick };
}

const pageHotels = (sent) => sent.filter((m) => m.type === "quay:pageHotel").map((m) => m.hotelId);

test("PMS không gửi Bearer: mã khách sạn đọc từ tiêu đề tab 'ezCloudHotel <mã> - …'", () => {
  const { bridge, sent } = loadBridge("https://pms.ezcloudhotel.com/#/room-map", "ezCloudHotel 15739 - 67 - le-tan");
  assert.equal(bridge.hotelId, "15739");
  assert.deepEqual(pageHotels(sent), ["15739"], "báo service worker một lần");
});

test("Tiêu đề có sau khi trang tải, rồi đổi cơ sở: khung được báo mỗi lần mã đổi, không báo lặp", () => {
  const { bridge, document, sent, tick } = loadBridge("https://pms.ezcloudhotel.com/", "ezCloudHotel");
  const seen = [];
  bridge.onHotel((id) => seen.push(id));
  assert.equal(bridge.hotelId, "");
  document.title = "ezCloudHotel 15739 - 67 - le-tan";
  tick();
  tick();
  document.title = "ezCloudHotel 16040 - 3 - le-tan";
  tick();
  assert.deepEqual(seen, ["15739", "16040"]);
  assert.deepEqual(pageHotels(sent), ["15739", "16040"]);
});

test("Đối chứng: tiêu đề không đúng dạng PMS thì không nhận mã nào", () => {
  for (const title of ["Sơ đồ phòng 15739 - 67", "ezCloudHotel - 15739", "ezCloudHotel 15739", "ezCloudHotel abc - 67", "ezCloudHotel 12 - 67"]) {
    const { bridge, sent } = loadBridge("https://pms.ezcloudhotel.com/", title);
    assert.equal(bridge.hotelId, "", title);
    assert.deepEqual(pageHotels(sent), [], title);
  }
});

test("HA Go2Joy: không đọc tiêu đề (không phải PMS)", () => {
  const { bridge, sent, tick } = loadBridge("https://ha.go2joy.vn/home", "ezCloudHotel 15739 - 67 - x");
  tick();
  assert.equal(bridge.hotelId, "");
  assert.deepEqual(pageHotels(sent), []);
});

const pageNames = (sent) => sent.filter((m) => m.type === "quay:pageHotel").map((m) => [m.hotelId, m.hotelName]);

test("🔴 YC-192: tiêu đề tab mang tên khách sạn trên ezCloud ⇒ báo service worker kèm tên", () => {
  const { sent } = loadBridge("https://pms.ezcloudhotel.com/", "ezCloudHotel 15739 - 67 - le-tan");
  assert.deepEqual(pageNames(sent), [["15739", "67"]]);
});

test("🔴 YC-192: tên có ' - ' bên trong giữ nguyên; chỉ đoạn cuối (tài khoản) bị bỏ", () => {
  const { sent } = loadBridge("https://pms.ezcloudhotel.com/", "ezCloudHotel 15298 - KS Thu - Quan 12 - le-tan");
  assert.deepEqual(pageNames(sent), [["15298", "KS Thu - Quan 12"]]);
});

test("YC-192: tiêu đề chỉ có mã và một đoạn ⇒ đoạn ấy là tên; đổi tên cùng mã thì báo lại", () => {
  const { document, sent, tick } = loadBridge("https://pms.ezcloudhotel.com/", "ezCloudHotel 15739 - 67");
  document.title = "ezCloudHotel 15739 - 68 - le-tan";
  tick();
  tick();
  assert.deepEqual(pageNames(sent), [["15739", "67"], ["15739", "68"]]);
});
