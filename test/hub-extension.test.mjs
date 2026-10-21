// YC-156: màn Cài extension trên Hub. Extension theo Hub của trang (H-1526 a) và trả trạng thái cho trang
// qua postMessage (hợp đồng ext:hello / ext:status với làn Hub).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as H from "../extension/quay/hub-quay.js";

// ---------- hub-bridge.js trong một trang Hub giả ----------

function loadHubPage(href, { reply = { ok: true, status: { version: "1.2.0" } } } = {}) {
  const u = new URL(href);
  const asked = [];
  const posted = [];
  const listeners = [];
  const window = {
    addEventListener: (type, fn) => type === "message" && listeners.push(fn),
    postMessage: (data, origin) => posted.push({ data, origin }),
  };
  const document = { documentElement: { dataset: {} } };
  const location = { href, origin: u.origin, pathname: u.pathname };
  const chrome = {
    runtime: {
      lastError: undefined,
      getManifest: () => ({ version: "1.2.0" }),
      sendMessage: (msg, cb) => {
        asked.push(JSON.parse(JSON.stringify(msg)));
        queueMicrotask(() => cb(reply));
      },
    },
  };
  const ctx = { window, document, location, chrome, queueMicrotask, Promise };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("../extension/hub-bridge.js", import.meta.url), "utf8"), ctx);
  const send = (event) => listeners.forEach((fn) => fn(event));
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return { window, document, location, asked, posted, send, flush };
}

test("Trang Hub: đặt dấu phiên bản ngay, tự trả ext:status lúc nạp, đúng origin của trang", async () => {
  const p = loadHubPage("https://urbanb.xyz/extension");
  assert.equal(p.document.documentElement.dataset.urbanbExt, "1.2.0");
  await p.flush();
  assert.deepEqual(p.asked, [{ type: "quay:extStatus", path: "/extension" }]);
  assert.equal(p.posted.length, 1);
  assert.equal(p.posted[0].origin, "https://urbanb.xyz");
  assert.deepEqual(JSON.parse(JSON.stringify(p.posted[0].data)), { source: "urbanb-ext", type: "ext:status", status: { version: "1.2.0" } });
});

test("ext:hello hợp lệ ⇒ trả thêm một ext:status; đường hiện tại đi kèm câu hỏi", async () => {
  const p = loadHubPage("https://hub.urbanb.vn/");
  await p.flush();
  p.location.pathname = "/extension"; // trang chuyển sang màn Cài extension (SPA, không tải lại)
  p.send({ source: p.window, origin: "https://hub.urbanb.vn", data: { source: "urbanb-hub", type: "ext:hello" } });
  await p.flush();
  assert.deepEqual(p.asked.map((m) => m.path), ["/", "/extension"]);
  assert.equal(p.posted.length, 2);
});

test("Đối chứng: tin từ khung khác, origin khác, nguồn khác, kiểu khác ⇒ không trả lời", async () => {
  const p = loadHubPage("https://hub.urbanb.vn/extension");
  await p.flush();
  const hello = { source: "urbanb-hub", type: "ext:hello" };
  p.send({ source: {}, origin: "https://hub.urbanb.vn", data: hello });
  p.send({ source: p.window, origin: "https://evil.example", data: hello });
  p.send({ source: p.window, origin: "https://hub.urbanb.vn", data: { source: "urbanb-ext", type: "ext:status" } });
  p.send({ source: p.window, origin: "https://hub.urbanb.vn", data: { source: "urbanb-hub", type: "ext:khac" } });
  p.send({ source: p.window, origin: "https://hub.urbanb.vn", data: null });
  await p.flush();
  assert.equal(p.asked.length, 1, "chỉ lượt tự trả lúc nạp");
  assert.equal(p.posted.length, 1);
});

test("Service worker không trả được (extension vừa nạp lại) ⇒ không gửi gì cho trang", async () => {
  const p = loadHubPage("https://hub.urbanb.vn/extension", { reply: null });
  await p.flush();
  assert.equal(p.posted.length, 0);
  assert.equal(p.document.documentElement.dataset.urbanbExt, "1.2.0");
});

test("Manifest: hub-bridge.js chạy trên đúng hai gốc Hub, thế giới ISOLATED, document_idle", () => {
  const m = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  const cs = m.content_scripts.find((c) => c.js.includes("hub-bridge.js"));
  assert.deepEqual(cs.matches, ["https://hub.urbanb.vn/*", "https://urbanb.xyz/*"]);
  assert.equal(cs.run_at, "document_idle");
  assert.equal(cs.world, undefined);
});

// ---------- Luật thuần (quay/hub-quay.js) ----------

test("H-1526 a: chỉ màn /extension làm máy theo Hub", () => {
  assert.equal(H.isExtensionPage("/extension"), true);
  assert.equal(H.isExtensionPage("/extension/"), true);
  assert.equal(H.isExtensionPage("/"), false);
  assert.equal(H.isExtensionPage("/extensions"), false);
  assert.equal(H.isExtensionPage("/admin/extension"), false);
  assert.equal(H.isExtensionPage(undefined), false);
});

test("H-1526 a: theo Hub của trang — cùng Hub không xoá gì, Hub khác thì đổi, gốc lạ thì bỏ", () => {
  assert.equal(H.followHub("https://hub.urbanb.vn", "https://hub.urbanb.vn"), "same");
  assert.equal(H.followHub(undefined, "https://hub.urbanb.vn"), "same", "chưa lưu gì = đang dùng Hub mặc định");
  assert.equal(H.followHub("https://hub.urbanb.vn", "https://urbanb.xyz"), "switch");
  assert.equal(H.followHub("https://urbanb.xyz", "https://hub.urbanb.vn"), "switch");
  assert.equal(H.followHub("https://hub.urbanb.vn", "https://evil.example"), "reject");
  assert.equal(H.followHub("https://hub.urbanb.vn", ""), "reject");
});

const branches = [
  { id: "br_col", name: "Colline", code: "COL", ezcloudHotelId: "15739", reviewIds: { booking: null, agoda: null, expedia: null } },
  { id: "br_pct", name: "Phạm Công Trứ", code: "PCT", ezcloudHotelId: "1234", reviewIds: { booking: null, agoda: null, expedia: null } },
];

test("ext:status: đủ trường hợp đồng, đúng kiểu", () => {
  const s = H.extStatusOf({
    version: "1.2.0",
    hub: "https://urbanb.xyz",
    pageOrigin: "https://urbanb.xyz",
    session: "ok",
    branches,
    chosenId: "br_col",
    pms: { at: Date.parse("2026-10-20T03:00:00Z"), hotelId: "15739" },
    snap: {},
    review: { configured: true, fromHub: true, channels: { booking: { at: "2026-10-20T01:00:00Z" }, agoda: { at: "2026-10-20T02:00:00Z" } } },
  });
  assert.deepEqual(s, {
    version: "1.2.0",
    hub: "https://urbanb.xyz",
    hubFollowed: true,
    signedIn: true,
    branch: { id: "br_col", name: "Colline" },
    pms: { lastSeenAt: "2026-10-20T03:00:00.000Z", hotelName: "Colline" },
    review: { configured: true, fromHub: true, lastScanAt: "2026-10-20T02:00:00.000Z" },
  });
});

test("ext:status: chưa biết gì ⇒ null đúng chỗ; Hub khác trang ⇒ hubFollowed false; nhiều cơ sở chưa chọn ⇒ branch null", () => {
  const s = H.extStatusOf({ version: "1.2.0", hub: "https://hub.urbanb.vn", pageOrigin: "https://urbanb.xyz", session: null, branches, chosenId: "" });
  assert.equal(s.hubFollowed, false);
  assert.equal(s.signedIn, null);
  assert.equal(s.branch, null);
  assert.deepEqual(s.pms, { lastSeenAt: null, hotelName: null });
  assert.deepEqual(s.review, { configured: false, fromHub: false, lastScanAt: null });
  assert.equal(H.extStatusOf({ session: "out" }).signedIn, false);
  assert.equal(H.extStatusOf({ session: "expired" }).signedIn, false);
  assert.equal(H.extStatusOf({ session: "nobranch" }).signedIn, true);
  assert.equal(H.extStatusOf({ session: "net" }).signedIn, null);
  // Mã KS PMS không có trong danh sách ⇒ tên khung đã nhận của đúng mã ấy; mã khác ⇒ không lấy.
  assert.equal(H.extStatusOf({ pms: { at: 1, hotelId: "9" }, snap: { hotelId: "9", branchName: "Cơ sở 9" } }).pms.hotelName, "Cơ sở 9");
  assert.equal(H.extStatusOf({ pms: { at: 1, hotelId: "9" }, snap: { hotelId: "8", branchName: "Cơ sở 8" } }).pms.hotelName, null);
});

test("🔴 ext:status không mang token, mã bí mật, URL Sheet, mã kết nối dù đầu vào có", () => {
  const leaky = { ...branches[0], otaSync: { webAppUrl: "https://script.google.com/macros/s/A/exec", pushKey: "PK", apiToken: "AT" } };
  const s = H.extStatusOf({
    version: "1.2.0",
    hub: "https://hub.urbanb.vn",
    pageOrigin: "https://hub.urbanb.vn",
    session: "ok",
    branches: [leaky],
    pms: { at: 1, hotelId: "15739", token: "TK" },
    snap: { hotelId: "15739", branchName: "Colline", secret: "SC" },
    review: { configured: true, fromHub: true, sheetUrl: "https://script.google.com/macros/s/S/exec", secret: "SC", channels: {} },
  });
  const text = JSON.stringify(s);
  for (const bad of ["PK", "AT", "TK", "SC", "script.google.com", "otaSync", "secret", "sheetUrl", "token"]) assert.ok(!text.includes(bad), bad);
  assert.deepEqual(Object.keys(s), ["version", "hub", "hubFollowed", "signedIn", "branch", "pms", "review"]);
});

test("Giờ quét gần nhất: kênh mới nhất; giờ hỏng bỏ qua; chưa quét ⇒ null", () => {
  assert.equal(H.lastScanAt({ a: { at: "2026-10-01T00:00:00Z" }, b: { at: "2026-10-03T00:00:00Z" }, c: { at: "rác" } }), "2026-10-03T00:00:00.000Z");
  assert.equal(H.lastScanAt({}), null);
  assert.equal(H.lastScanAt(undefined), null);
});

test("Service worker: gốc trang lấy từ người gửi (không từ tin); popup không còn ô chọn Hub", () => {
  const sw = readFileSync(new URL("../extension/quay/sw.js", import.meta.url), "utf8");
  assert.match(sw, /"quay:extStatus": \(m, sender\) => extStatus\(senderOrigin\(sender\), String\(m\.path/);
  const follow = sw.slice(sw.indexOf("export async function followHubPage("), sw.indexOf("\n}\n", sw.indexOf("export async function followHubPage(")));
  assert.match(follow, /if \(act === "switch"\) await setHubOrigin\(origin\)/);
  const html = readFileSync(new URL("../extension/popup.html", import.meta.url), "utf8");
  assert.ok(!/<select id="quayHub"/.test(html));
  assert.match(html, /id="hubNow"/);
});
