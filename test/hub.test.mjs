// Gửi review lên Hub UrbanB: dựng lô, đọc câu trả lời, cộng kết quả, xếp loại lỗi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HUB_BATCH, HUB_FIELDS, HUB_HOSTS, HUB_PATH, HubError, hubBatches, hubEndpoint, hubSummaryText, parseHubReply, sumHubReplies } from "../extension/hub.js";
import { classifyError } from "../extension/report.js";

const review = (i) => ({
  key: `go2joy|${i}`,
  hotel: "Secret Garden",
  channel: "go2joy",
  channelHotelId: "77",
  reviewId: String(i),
  bookingCode: "B" + i,
  reviewDate: "2026-10-01T03:00:00.000Z",
  roomType: "Phòng đôi",
  score: 4.5,
  scale: 5,
  title: "",
  positive: "",
  negative: "",
  comment: "ổn",
  reply: "",
  replyDate: "",
  hash: "h" + i,
  firstSeen: "x",
  raw: '{"userNickName":"lọt"}',
});

test("Thân gửi Hub chỉ mang trường trong danh sách trắng: không raw, không mã bí mật", () => {
  const [body] = hubBatches([{ ...review(1), secret: "s".repeat(64) }]);
  assert.equal(body.action, "ingest");
  const row = body.reviews[0];
  assert.deepEqual(Object.keys(row).sort(), [...HUB_FIELDS].sort());
  const text = JSON.stringify(body);
  assert.ok(!text.includes("lọt") && !text.includes("sss"), "raw hay secret lọt vào thân gửi Hub");
  assert.equal(row.reviewId, "1");
  assert.equal(row.score, 4.5);
});

test("Chia lô dưới trần 500 bài của Hub: 662 bài ⇒ 200 + 200 + 200 + 62", () => {
  assert.ok(HUB_BATCH <= 500);
  const batches = hubBatches(Array.from({ length: 662 }, (_, i) => review(i)));
  assert.deepEqual(batches.map((b) => b.reviews.length), [200, 200, 200, 62]);
  assert.equal(batches[3].reviews[61].reviewId, "661");
  assert.deepEqual(hubBatches([]), []);
});

test("URL Hub: nhận gốc trang hoặc cả đường dẫn, chỉ https và đúng tên miền có quyền", () => {
  assert.equal(hubEndpoint(" https://urbanb.xyz "), "https://urbanb.xyz" + HUB_PATH);
  assert.equal(hubEndpoint("https://hub.urbanb.vn/api/ingest/reviews?x=1"), "https://hub.urbanb.vn" + HUB_PATH);
  assert.throws(() => hubEndpoint("http://urbanb.xyz"), HubError);
  assert.throws(() => hubEndpoint("https://evil.example"), /URL Hub phải là/);
  assert.throws(() => hubEndpoint("urbanb.xyz"), /sai dạng/);
});

test("Mọi tên miền Hub đều có trong host_permissions của manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  for (const host of HUB_HOSTS) assert.ok(manifest.host_permissions.includes(`https://${host}/*`), host);
});

test("Đọc câu trả lời Hub theo mã HTTP; chỉ lỗi mạng/máy chủ mới gửi lại", () => {
  const ok = { ok: true, inserted: 2, updated: 0, unchanged: 1, unmatched: 3, errors: [] };
  assert.deepEqual(parseHubReply(200, JSON.stringify(ok)), ok);
  const fail = (status, body) => {
    try {
      parseHubReply(status, body);
    } catch (e) {
      return e;
    }
    assert.fail(`HTTP ${status} phải ném lỗi`);
  };
  assert.match(fail(401, '{"ok":false,"error":"unauthorized"}').message, /token/);
  assert.equal(fail(401, "").retryable, false);
  assert.match(fail(404, "").message, /chưa bật/);
  assert.match(fail(413, "").message, /quá lớn/);
  assert.match(fail(400, '{"ok":false,"error":"reviews phải là mảng"}').message, /reviews phải là mảng/);
  assert.equal(fail(400, '{"ok":false}').retryable, false);
  assert.equal(fail(502, "<html>").retryable, true);
  assert.equal(fail(200, "<html>").retryable, true);
});

test("Cộng kết quả các lô; vị trí bài lỗi tính trên cả lượt", () => {
  const t = sumHubReplies(
    [
      { inserted: 1, updated: 2, unchanged: 3, unmatched: 0, errors: [] },
      { inserted: 4, updated: 0, unchanged: 0, unmatched: 5, errors: [{ index: 7, key: "go2joy|x", error: "SCALE_MISMATCH" }] },
    ],
    200,
  );
  assert.deepEqual({ ...t, errors: t.errors.map((e) => e.index) }, { inserted: 5, updated: 2, unchanged: 3, unmatched: 5, errors: [207] });
  assert.equal(hubSummaryText(t), "5 mới · 2 đổi · 5 chưa ghép · 1 bài lỗi");
  assert.equal(hubSummaryText(sumHubReplies([{ inserted: 0, updated: 0 }])), "0 mới · 0 đổi");
});

test("Lỗi gửi Hub có loại HUB-… riêng, không lẫn với lỗi Sheet hay lỗi kênh", () => {
  const kind = (message) => classifyError("go2joy", "gửi Hub", message).code;
  assert.equal(kind("URL Hub sai dạng. Điền dạng https://hub.urbanb.vn"), "HUB-URL");
  assert.equal(kind("Hub từ chối token (401). Dán lại Token Hub."), "HUB-TOKEN");
  assert.equal(kind("Chưa điền Token Hub."), "HUB-TOKEN");
  assert.equal(kind("Hub chưa bật cửa nhận review (404)."), "HUB-OFF");
  assert.equal(kind("Không gọi được Hub: Failed to fetch"), "HUB-NET");
  assert.equal(kind("3 bài Hub không nhận"), "HUB-ROWS");
  assert.equal(kind("Hub lỗi máy chủ (HTTP 502)."), "HUB-REJECT");
  assert.equal(classifyError("", "gửi Hub", "Hub chưa bật cửa nhận review (404).").code, "HUB-OFF");
});
