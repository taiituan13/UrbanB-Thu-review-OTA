// Gửi review lên Hub UrbanB: dựng lô, đọc câu trả lời, cộng kết quả, xếp loại lỗi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HUB_BATCH,
  HUB_FIELDS,
  HUB_PATH,
  NOT_SIGNED_IN_TEXT,
  hubBatches,
  hubSnapshots,
  hubRunMeta,
  HUB_TRIGGER,
  hubSummaryText,
  ingestRequest,
  ingestUrl,
  parseIngestReply,
  rejectedText,
  sumHubReplies,
} from "../extension/hub.js";
import { HUB_ORIGINS } from "../extension/env.js";
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
  const [body] = hubBatches([{ ...review(1), guestName: "Khách A", secret: "s".repeat(64) }]);
  assert.equal(body.action, "ingest");
  const row = body.reviews[0];
  assert.deepEqual(Object.keys(row).sort(), [...HUB_FIELDS].sort());
  const text = JSON.stringify(body);
  assert.ok(!text.includes("lọt") && !text.includes("sss"), "raw hay secret lọt vào thân gửi Hub");
  assert.equal(row.reviewId, "1");
  assert.equal(row.score, 4.5);
});

test("Tên khách (YC-188): có thì gửi Hub; bài kênh chưa đo đường tên thì không có khoá", () => {
  assert.ok(HUB_FIELDS.includes("guestName"));
  const [body] = hubBatches([{ ...review(1), guestName: "Khách A" }, review(2)]);
  assert.equal(body.reviews[0].guestName, "Khách A");
  assert.ok(!("guestName" in body.reviews[1]));
});

test("Chia lô dưới trần 500 bài của Hub: 662 bài ⇒ 200 + 200 + 200 + 62", () => {
  assert.ok(HUB_BATCH <= 500);
  const batches = hubBatches(Array.from({ length: 662 }, (_, i) => review(i)));
  assert.deepEqual(batches.map((b) => b.reviews.length), [200, 200, 200, 62]);
  assert.equal(batches[3].reviews[61].reviewId, "661");
  assert.deepEqual(hubBatches([]), []);
});

test("YC-157: mọi lô của một lượt mang mã máy, kiểu lượt và mã lượt theo hợp đồng Hub", () => {
  const meta = hubRunMeta({ deviceId: "may-1", trigger: "hẹn giờ", runId: "luot-1" });
  assert.deepEqual(meta, { device: { deviceId: "may-1" }, run: { trigger: "schedule", id: "luot-1" } });
  const batches = hubBatches(Array.from({ length: 250 }, (_, i) => review(i)), undefined, meta);
  assert.equal(batches.length, 2);
  for (const b of batches) {
    assert.deepEqual(b.device, { deviceId: "may-1" });
    assert.deepEqual(b.run, { trigger: "schedule", id: "luot-1" });
  }
  assert.equal(hubRunMeta({ trigger: "bấm tay" }).run.trigger, "manual");
});

test("🔴 YC-157: kiểu lượt lạ không gửi; thiếu hết thông tin thì thân không có khoá device/run", () => {
  assert.deepEqual(hubRunMeta({ trigger: "ai đó" }), {});
  assert.deepEqual(hubRunMeta(), {});
  const [body] = hubBatches([review(1)]);
  assert.ok(!("device" in body) && !("run" in body));
  assert.deepEqual(Object.keys(HUB_TRIGGER).sort(), ["bấm tay", "hẹn giờ", "tự quét sau đăng nhập"]);
  // YC-199: Hub chỉ biết hai mã; lượt tự quét lại sau đăng nhập là lượt máy tự chạy.
  assert.deepEqual([...new Set(Object.values(HUB_TRIGGER))].sort(), ["manual", "schedule"]);
  assert.equal(hubRunMeta({ trigger: "tự quét sau đăng nhập" }).run.trigger, "schedule");
});

test("🔴 H-1233 a: request gửi Hub KHÔNG có header Authorization (Hub chọn đường phiên theo đúng header này)", () => {
  const { url, init } = ingestRequest("https://hub.urbanb.vn", { action: "ping" });
  assert.equal(url, "https://hub.urbanb.vn" + HUB_PATH);
  assert.equal(init.method, "POST");
  const names = Object.keys(init.headers).map((h) => h.toLowerCase());
  assert.ok(!names.includes("authorization"), "có Authorization ⇒ Hub đi đường token máy, production trả 404");
  assert.deepEqual(names, ["content-type"]);
  assert.deepEqual(JSON.parse(init.body), { action: "ping" });
  assert.equal(ingestUrl("https://urbanb.xyz/"), "https://urbanb.xyz" + HUB_PATH);
});

test("Máy không còn giữ token Hub: không tệp nào của extension gửi Bearer", () => {
  for (const f of ["background.js", "hub.js", "quay/sw.js", "popup.js", "popup.html", "config.js", "setup-code.js"]) {
    const text = readFileSync(new URL(`../extension/${f}`, import.meta.url), "utf8");
    assert.ok(!/Bearer/.test(text), `${f} còn gửi Bearer`);
    // config.js và setup-code.js nhắc tên ô cũ chỉ để bỏ nó đi (DROPPED_KEYS).
    if (f !== "config.js" && f !== "setup-code.js") assert.ok(!/hubToken/.test(text), `${f} còn ô Token Hub`);
  }
  const bg = readFileSync(new URL("../extension/background.js", import.meta.url), "utf8");
  assert.ok(!/authorization/i.test(bg), "background.js còn đặt header Authorization");
});

test("Mọi gốc Hub đều có trong host_permissions của manifest", () => {
  const manifest = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  for (const o of HUB_ORIGINS) assert.ok(manifest.host_permissions.includes(`${o}/*`), o);
});

const reply = (status, json, extra = {}) => ({ status, url: "https://hub.urbanb.vn" + HUB_PATH, redirected: false, json, ...extra });
const fail = (r) => {
  try {
    parseIngestReply(r);
  } catch (e) {
    return e;
  }
  assert.fail(`HTTP ${r?.status} phải ném lỗi`);
};

test("Đọc lời đáp Hub (đường phiên): 200 ok trả nguyên kết quả, kể cả nhóm rejected", () => {
  const ok = { ok: true, inserted: 2, updated: 0, unchanged: 1, unmatched: 3, errors: [], rejected: [{ channel: "AGODA", channelHotelId: "9", error: "OUT_OF_SCOPE" }] };
  assert.deepEqual(parseIngestReply(reply(200, ok)), ok);
});

test("Chưa đăng nhập (401 NOT_SIGNED_IN, hoặc bị chuyển về /login) ⇒ câu tiếng Việt bảo mở Hub đăng nhập, không gửi lại", () => {
  for (const r of [
    reply(401, { ok: false, error: "NOT_SIGNED_IN" }),
    reply(401, null),
    reply(200, null, { redirected: true, url: "https://hub.urbanb.vn/login?next=%2Fapi" }),
  ]) {
    const e = fail(r);
    assert.equal(e.message, NOT_SIGNED_IN_TEXT);
    assert.match(e.message, /đăng nhập/);
    assert.equal(e.retryable, false);
    assert.equal(e.session, "out");
  }
});

test("403: FORBIDDEN_ORIGIN và thiếu quyền thêm review là hai câu khác nhau", () => {
  const origin = fail(reply(403, { ok: false, error: "FORBIDDEN_ORIGIN" }));
  assert.match(origin.message, /FORBIDDEN_ORIGIN/);
  assert.equal(origin.session, undefined);
  const scope = fail(reply(403, { ok: false, error: "FORBIDDEN" }));
  assert.match(scope.message, /quyền thêm review/);
  assert.equal(scope.retryable, false);
});

test("Còn lại: 404 không JSON, 413, 400 từ chối; lỗi mạng và 5xx thì gửi lại", () => {
  assert.match(fail(reply(404, null)).message, /chưa bật/);
  assert.match(fail(reply(413, { ok: false, error: "thân request quá lớn" })).message, /quá lớn/);
  const bad = fail(reply(400, { ok: false, error: "reviews phải là mảng" }));
  assert.match(bad.message, /reviews phải là mảng/);
  assert.equal(bad.retryable, false);
  assert.equal(fail(reply(502, null)).retryable, true);
  assert.equal(fail(reply(200, null)).retryable, true);
  const net = fail({ netError: "Failed to fetch" });
  assert.match(net.message, /Không gọi được Hub: Failed to fetch/);
  assert.equal(net.retryable, true);
});

test("Cộng kết quả các lô; vị trí bài lỗi tính trên cả lượt", () => {
  const t = sumHubReplies(
    [
      { inserted: 1, updated: 2, unchanged: 3, unmatched: 0, errors: [] },
      { inserted: 4, updated: 0, unchanged: 0, unmatched: 5, errors: [{ index: 7, key: "go2joy|x", error: "SCALE_MISMATCH" }] },
    ],
    200,
  );
  assert.deepEqual({ ...t, errors: t.errors.map((e) => e.index) }, { inserted: 5, updated: 2, unchanged: 3, unmatched: 5, errors: [207], rejected: [] });
  assert.equal(hubSummaryText(t), "5 mới · 2 đổi · 5 chờ ghép · 1 bài lỗi");
  assert.equal(hubSummaryText(sumHubReplies([{ inserted: 0, updated: 0 }])), "0 mới · 0 đổi");
});

test("Nhóm rejected (mã ngoài phạm vi): cộng một lần mỗi mã dù nằm ở nhiều lô, hiện trong dòng tóm tắt", () => {
  const out = { channel: "AGODA", channelHotelId: "9", error: "OUT_OF_SCOPE" };
  const t = sumHubReplies([
    { inserted: 1, updated: 0, rejected: [out] },
    { inserted: 0, updated: 0, rejected: [out, { channel: "TRIP", channelHotelId: "5", error: "OUT_OF_SCOPE" }] },
  ]);
  assert.deepEqual(t.rejected.map((x) => x.channelHotelId), ["9", "5"]);
  assert.equal(hubSummaryText(t), "1 mới · 0 đổi · 2 mã ngoài phạm vi");
  assert.match(rejectedText(t.rejected), /2 mã khách sạn ngoài phạm vi \(9, 5\)/);
});

test("Lỗi gửi Hub có loại HUB-… riêng, không lẫn với lỗi Sheet hay lỗi kênh", () => {
  const kind = (message) => classifyError("go2joy", "gửi Hub", message).code;
  assert.equal(kind(NOT_SIGNED_IN_TEXT), "HUB-LOGIN");
  assert.equal(kind(fail(reply(403, { ok: false, error: "FORBIDDEN" })).message), "HUB-SCOPE");
  assert.equal(kind(fail(reply(403, { ok: false, error: "FORBIDDEN_ORIGIN" })).message), "HUB-ORIGIN");
  assert.equal(kind(rejectedText([{ channel: "AGODA", channelHotelId: "9" }])), "HUB-SCOPE");
  assert.equal(kind("Hub chưa bật cửa nhận review (404)."), "HUB-OFF");
  assert.equal(kind("Không gọi được Hub: Failed to fetch"), "HUB-NET");
  assert.equal(kind("3 bài Hub không nhận"), "HUB-ROWS");
  assert.equal(kind("Hub lỗi máy chủ (HTTP 502)."), "HUB-REJECT");
  assert.equal(classifyError("", "gửi Hub", "Hub chưa bật cửa nhận review (404).").code, "HUB-OFF");
});

test("YC-152: hubSnapshots chỉ giữ điểm tổng, kèm kênh và mã khách sạn", () => {
  const snaps = [
    { category: "Tổng", categoryCode: "overall", score: 8.6, scale: 10, reviewCount: 120 },
    { category: "Sạch sẽ", categoryCode: "cleanliness", score: 9, scale: 10 },
    { categoryCode: "overall", score: undefined, scale: 10 },
  ];
  assert.deepEqual(hubSnapshots(snaps, "agoda", 12345), [
    { channel: "agoda", channelHotelId: "12345", categoryCode: "overall", score: 8.6, scale: 10 },
  ]);
  assert.deepEqual(hubSnapshots(snaps, "agoda", ""), [], "không mã khách sạn thì Hub không biết của chi nhánh nào");
  assert.deepEqual(hubSnapshots(undefined, "agoda", "1"), []);
});

test("YC-152: điểm tổng đi ở lô đầu; lượt 0 bài vẫn gửi một lô để Hub nhận điểm", () => {
  const snap = [{ channel: "agoda", channelHotelId: "1", categoryCode: "overall", score: 8.6, scale: 10 }];
  const two = hubBatches(Array.from({ length: 250 }, (_, i) => review(i)), undefined, {}, snap);
  assert.deepEqual(two[0].snapshots, snap);
  assert.equal("snapshots" in two[1], false);
  assert.deepEqual(hubBatches([], undefined, { run: { id: "r" } }, snap), [{ action: "ingest", reviews: [], snapshots: snap, run: { id: "r" } }]);
  assert.deepEqual(hubBatches([], undefined, {}, []), [], "không bài, không điểm ⇒ không gửi gì");
});
