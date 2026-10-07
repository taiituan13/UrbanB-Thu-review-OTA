// Điểm nhận review cho Google Sheet — dán vào Extensions › Apps Script của Sheet.
//
// Cài: chạy setup() một lần (tạo các tab, sinh mã bí mật, in ra ở Nhật ký thực thi),
// rồi Deploy › New deployment › Web app · Execute as: Me · Who has access: Anyone.
// Extension của mỗi khách sạn POST JSON lên URL …/exec kèm mã bí mật.

var SHEETS = {
  review: {
    name: "Review",
    key: "key",
    columns: [
      ["key", "Khoá", "text"],
      ["hotel", "Khách sạn", "text"],
      ["channel", "Kênh", "text"],
      ["channelHotelId", "Mã KS trên kênh", "text"],
      ["reviewId", "Mã review", "text"],
      ["bookingCode", "Mã đặt phòng", "text"],
      ["reviewDate", "Ngày review", "text"],
      ["checkIn", "Nhận phòng", "text"],
      ["checkOut", "Trả phòng", "text"],
      ["roomType", "Loại phòng", "text"],
      ["guestType", "Loại khách", "text"],
      ["country", "Quốc gia", "text"],
      ["language", "Ngôn ngữ", "text"],
      ["score", "Điểm", "number"],
      ["scale", "Thang", "number"],
      ["title", "Tiêu đề", "text"],
      ["positive", "Điểm khen", "text"],
      ["negative", "Điểm chê", "text"],
      ["comment", "Nhận xét", "text"],
      ["reply", "Phản hồi của KS", "text"],
      ["replyDate", "Ngày phản hồi", "text"],
      ["hash", "Mã nội dung", "text"],
      ["firstSeen", "Lần đầu thấy", "text"],
      ["lastSeen", "Lần cuối thấy", "text"],
      ["raw", "JSON gốc (đã gỡ tên khách)", "text"],
    ],
  },
  scores: {
    name: "Điểm hạng mục",
    key: "key",
    columns: [
      ["key", "Khoá", "text"],
      ["reviewKey", "Khoá review", "text"],
      ["hotel", "Khách sạn", "text"],
      ["channel", "Kênh", "text"],
      ["category", "Hạng mục (tên gốc)", "text"],
      ["categoryCode", "Mã hạng mục", "text"],
      ["score", "Điểm", "number"],
      ["scale", "Thang", "number"],
      ["firstSeen", "Lần đầu thấy", "text"],
      ["lastSeen", "Lần cuối thấy", "text"],
    ],
  },
  runs: {
    name: "Lượt quét",
    columns: [
      ["at", "Thời điểm (UTC)", "text"],
      ["hotel", "Khách sạn", "text"],
      ["channel", "Kênh", "text"],
      ["trigger", "Kích hoạt", "text"],
      ["status", "Kết quả", "text"],
      ["count", "Số bài gửi", "number"],
      ["inserted", "Mới", "number"],
      ["updated", "Đổi", "number"],
      ["note", "Ghi chú", "text"],
      ["version", "Phiên bản extension", "text"],
    ],
  },
  snapshots: {
    name: "Điểm tổng hợp",
    columns: [
      ["at", "Thời điểm (UTC)", "text"],
      ["hotel", "Khách sạn", "text"],
      ["channel", "Kênh", "text"],
      ["category", "Hạng mục (tên gốc)", "text"],
      ["categoryCode", "Mã hạng mục", "text"],
      ["score", "Điểm", "number"],
      ["scale", "Thang", "number"],
      ["reviewCount", "Số review", "number"],
    ],
  },
};

var SEEN_FIELDS = { firstSeen: true, lastSeen: true };

// ---------- Hàm thuần (có test ở test/apps-script.test.mjs) ----------

/** Ô bắt đầu bằng = + - @ bị Sheets hiểu là công thức ⇒ thêm dấu nháy đơn (ẩn khi hiển thị). */
function sanitizeCell(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" && /^[=+\-@]/.test(value)) return "'" + value;
  return value;
}

function sameValue(a, b) {
  var x = a === null || a === undefined ? "" : String(a);
  var y = b === null || b === undefined ? "" : String(b);
  return x === y;
}

/**
 * Gộp dòng mới vào bảng có sẵn theo khoá.
 * existing: mảng 2 chiều (không gồm dòng tiêu đề), cột theo `columns`.
 * Dòng cũ không có trong lô mới được giữ nguyên (lô của khách sạn khác, hoặc bài kênh đã ẩn).
 * Trả { rows, inserted, updated }.
 */
function mergeRows(columns, keyField, existing, incoming, now) {
  var fields = columns.map(function (c) { return c[0]; });
  var keyIdx = fields.indexOf(keyField);
  var firstIdx = fields.indexOf("firstSeen");
  var lastIdx = fields.indexOf("lastSeen");
  var rows = existing.map(function (r) { return r.slice(); });
  var index = {};
  for (var i = 0; i < rows.length; i++) index[String(rows[i][keyIdx])] = i;

  var inserted = 0;
  var updated = 0;
  for (var j = 0; j < incoming.length; j++) {
    var obj = incoming[j];
    var key = String(obj[keyField]);
    var at = index[key];
    if (at === undefined) {
      var fresh = fields.map(function (f) {
        if (SEEN_FIELDS[f]) return now;
        var v = obj[f];
        return v === null || v === undefined ? "" : v;
      });
      index[key] = rows.length;
      rows.push(fresh);
      inserted++;
      continue;
    }
    var row = rows[at];
    var changed = false;
    for (var k = 0; k < fields.length; k++) {
      var f = fields[k];
      if (SEEN_FIELDS[f]) continue;
      var v = obj[f];
      if (v === undefined) continue;
      if (!sameValue(row[k], v)) {
        row[k] = v === null ? "" : v;
        changed = true;
      }
    }
    if (lastIdx >= 0) row[lastIdx] = now;
    if (firstIdx >= 0 && (row[firstIdx] === "" || row[firstIdx] === null)) row[firstIdx] = now;
    if (changed) updated++;
  }
  return { rows: rows, inserted: inserted, updated: updated };
}

function toRow(columns, obj) {
  return columns.map(function (c) {
    var v = obj[c[0]];
    return v === null || v === undefined ? "" : v;
  });
}

// ---------- Thống kê (hàm thuần) ----------

/** Cửa sổ thời gian của trang Thống kê — đổi ở đây là đổi toàn bộ trang. */
var STATS = { name: "Thống kê", recentDays: 30, categoryDays: 90 };

var DAY_MS = 86400000;

function rowsToObjects(columns, rows) {
  return rows.map(function (r) {
    var o = {};
    columns.forEach(function (c, i) { o[c[0]] = r[i]; });
    return o;
  });
}

function daysAgo(nowIso, days) {
  return new Date(Date.parse(nowIso) - days * DAY_MS).toISOString().slice(0, 10);
}

/** Điểm quy về thang 10; ô trống hoặc lỗi ⇒ null. */
function score10(score, scale) {
  var s = Number(score);
  var k = Number(scale) || 10;
  if (score === "" || score === null || score === undefined || !isFinite(s)) return null;
  return (s / k) * 10;
}

function round2(x) {
  return x === null ? "" : Math.round(x * 100) / 100;
}

function average(list) {
  var xs = list.filter(function (x) { return x !== null; });
  if (!xs.length) return null;
  return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
}

/** Một nhóm review ⇒ các cột chỉ số dùng chung cho mọi bảng. */
function summarize(list, nowIso) {
  var recentFrom = daysAgo(nowIso, STATS.recentDays);
  var prevFrom = daysAgo(nowIso, STATS.recentDays * 2);
  var day = function (r) { return String(r.reviewDate || "").slice(0, 10); };
  var recent = list.filter(function (r) { return day(r) >= recentFrom; });
  var prev = list.filter(function (r) { return day(r) >= prevFrom && day(r) < recentFrom; });
  var avgOf = function (xs) { return average(xs.map(function (r) { return score10(r.score, r.scale); })); };
  var all = avgOf(list);
  var a30 = avgOf(recent);
  var aPrev = avgOf(prev);
  var replied = list.filter(function (r) { return String(r.reply || "").trim() !== ""; }).length;
  return [
    list.length,
    round2(all),
    recent.length,
    round2(a30),
    round2(aPrev),
    a30 !== null && aPrev !== null ? round2(a30 - aPrev) : "",
    list.length ? Math.round((replied / list.length) * 100) + "%" : "",
    list.length - replied,
  ];
}

var SUMMARY_HEADER = [
  "Số review",
  "Điểm TB",
  "Review 30 ngày",
  "Điểm TB 30 ngày",
  "Điểm TB 30 ngày trước đó",
  "Chênh lệch",
  "Đã phản hồi",
  "Chưa phản hồi",
];

function groupBy(list, keyFn) {
  var out = {};
  list.forEach(function (x) {
    var k = keyFn(x);
    (out[k] = out[k] || []).push(x);
  });
  return out;
}

/**
 * Dựng các bảng của trang Thống kê. Trả mảng { title, header, rows }.
 * reviews/runs/scores/snapshots: mảng object theo khoá cột của SHEETS.
 */
function buildStats(reviews, runs, scores, snapshots, nowIso) {
  var blocks = [];
  reviews = reviews.filter(function (r) { return r.key; });

  var byHotel = groupBy(reviews, function (r) { return r.hotel; });
  var all = summarize(reviews, nowIso);
  blocks.push({
    title: "Theo khách sạn",
    header: ["Khách sạn"].concat(SUMMARY_HEADER),
    rows: Object.keys(byHotel).sort().map(function (h) {
      return [h].concat(summarize(byHotel[h], nowIso));
    }).concat(reviews.length ? [["TOÀN CHUỖI"].concat(all)] : []),
  });

  var lastRun = {};
  runs.forEach(function (r) {
    var k = r.hotel + "|" + r.channel;
    if (!lastRun[k] || String(r.at) > String(lastRun[k].at)) lastRun[k] = r;
  });
  var lastOverall = {};
  snapshots.forEach(function (s) {
    if (s.categoryCode !== "overall") return;
    var k = s.hotel + "|" + s.channel;
    if (!lastOverall[k] || String(s.at) > String(lastOverall[k].at)) lastOverall[k] = s;
  });
  var byPair = groupBy(reviews, function (r) { return r.hotel + "|" + r.channel; });
  Object.keys(lastRun).forEach(function (k) { byPair[k] = byPair[k] || []; });
  blocks.push({
    title: "Theo khách sạn × kênh",
    header: ["Khách sạn", "Kênh"].concat(SUMMARY_HEADER, ["Điểm kênh công bố", "Quét gần nhất", "Kết quả quét"]),
    rows: Object.keys(byPair).sort().map(function (k) {
      var parts = k.split("|");
      var run = lastRun[k];
      var ov = lastOverall[k];
      return [parts[0], parts[1]].concat(summarize(byPair[k], nowIso), [
        ov ? round2(score10(ov.score, ov.scale)) : "",
        run ? String(run.at).slice(0, 16).replace("T", " ") + " UTC" : "",
        run ? run.status + (run.status === "ok" ? "" : " — " + run.note) : "",
      ]);
    }),
  });

  var catFrom = daysAgo(nowIso, STATS.categoryDays);
  var reviewDay = {};
  reviews.forEach(function (r) { reviewDay[r.key] = String(r.reviewDate || "").slice(0, 10); });
  var recentScores = scores.filter(function (s) { return s.key && reviewDay[s.reviewKey] >= catFrom; });
  var byCat = groupBy(recentScores, function (s) { return s.hotel + "|" + s.channel + "|" + s.category; });
  blocks.push({
    title: "Điểm hạng mục " + STATS.categoryDays + " ngày (tên gốc của kênh)",
    header: ["Khách sạn", "Kênh", "Hạng mục", "Số bài chấm", "Điểm TB"],
    rows: Object.keys(byCat).sort().map(function (k) {
      var parts = k.split("|");
      var xs = byCat[k].map(function (s) { return score10(s.score, s.scale); });
      return [parts[0], parts[1], parts[2], xs.length, round2(average(xs))];
    }),
  });
  return blocks;
}

// ---------- Phần chạy trên Google ----------

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Review OTA").addItem("Cập nhật thống kê", "refreshStatsMenu").addToUi();
}

function refreshStatsMenu() {
  refreshStats(SpreadsheetApp.getActiveSpreadsheet());
}

function readObjects(ss, spec) {
  var sh = ss.getSheetByName(spec.name);
  if (!sh || sh.getLastRow() < 2) return [];
  return rowsToObjects(spec.columns, sh.getRange(2, 1, sh.getLastRow() - 1, spec.columns.length).getValues());
}

function refreshStats(ss) {
  var now = new Date();
  var blocks = buildStats(
    readObjects(ss, SHEETS.review),
    readObjects(ss, SHEETS.runs),
    readObjects(ss, SHEETS.scores),
    readObjects(ss, SHEETS.snapshots),
    now.toISOString(),
  );
  var sh = ss.getSheetByName(STATS.name) || ss.insertSheet(STATS.name, 0);
  sh.clear();
  sh.getRange(1, 1).setValue("Thống kê review OTA").setFontSize(14).setFontWeight("bold");
  sh.getRange(2, 1).setValue(
    "Cập nhật " + Utilities.formatDate(now, "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm") +
      " · điểm quy về thang 10 · \"30 ngày\" tính theo ngày khách viết review · tự tính lại sau mỗi lượt quét",
  ).setFontColor("#555555");
  var row = 4;
  blocks.forEach(function (b) {
    sh.getRange(row, 1).setValue(b.title).setFontWeight("bold").setFontSize(12);
    sh.getRange(row + 1, 1, 1, b.header.length).setValues([b.header]).setFontWeight("bold").setBackground("#e5e7eb");
    if (b.rows.length) {
      sh.getRange(row + 2, 1, b.rows.length, b.header.length).setValues(b.rows.map(function (r) { return r.map(sanitizeCell); }));
    } else {
      sh.getRange(row + 2, 1).setValue("Chưa có dữ liệu").setFontColor("#888888");
    }
    row += b.rows.length + 4;
  });
  sh.autoResizeColumns(1, 13);
  ss.setActiveSheet(sh);
  ss.moveActiveSheet(1);
}

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (id) { ensureSheet(ss, SHEETS[id]); });
  refreshStats(ss);
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty("SECRET");
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
    props.setProperty("SECRET", secret);
  }
  Logger.log("Mã bí mật (dán vào extension): " + secret);
}

function ensureSheet(ss, spec) {
  var sh = ss.getSheetByName(spec.name) || ss.insertSheet(spec.name);
  var header = spec.columns.map(function (c) { return c[1]; });
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight("bold");
  sh.setFrozenRows(1);
  applyFormats(sh, spec);
  return sh;
}

/** Cột chữ đặt dạng văn bản để Sheets không tự đổi "2026-09-19T13:21:04" hay mã số dài. */
function applyFormats(sh, spec) {
  spec.columns.forEach(function (c, i) {
    sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat(c[2] === "text" ? "@" : "0.0#");
  });
}

/** getRange vượt số dòng của tab thì lỗi ⇒ thêm dòng trước, rồi đặt lại định dạng. */
function ensureRows(sh, spec, lastRowNeeded) {
  var max = sh.getMaxRows();
  if (lastRowNeeded <= max) return;
  sh.insertRowsAfter(max, lastRowNeeded - max + 500);
  applyFormats(sh, spec);
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json({ ok: true, service: "urbanb-reviews", hint: "Dùng POST" });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: "Thân yêu cầu không phải JSON" });
  }
  var secret = PropertiesService.getScriptProperties().getProperty("SECRET");
  if (!secret || body.secret !== secret) return json({ ok: false, error: "Sai mã bí mật" });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (body.action === "ping") return json({ ok: true, sheet: ss.getName() });
  if (body.action !== "ingest") return json({ ok: false, error: "Hành động lạ" });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return json({ ok: false, error: "Sheet đang bận, thử lại sau" });
  try {
    var now = new Date().toISOString();
    var r = upsert(ss, SHEETS.review, body.reviews || [], now);
    upsert(ss, SHEETS.scores, body.scores || [], now);
    var run = body.run || {};
    run.inserted = r.inserted;
    run.updated = r.updated;
    append(ss, SHEETS.runs, [run]);
    append(ss, SHEETS.snapshots, body.snapshots || []);
    // Thống kê hỏng không được làm hỏng lượt ghi dữ liệu.
    var statsError = "";
    try {
      refreshStats(ss);
    } catch (err) {
      statsError = String(err);
    }
    return json({ ok: true, inserted: r.inserted, updated: r.updated, statsError: statsError });
  } finally {
    lock.releaseLock();
  }
}

function upsert(ss, spec, incoming, now) {
  if (!incoming.length) return { inserted: 0, updated: 0 };
  var sh = ensureSheetLight(ss, spec);
  var width = spec.columns.length;
  var last = sh.getLastRow();
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, width).getValues() : [];
  var merged = mergeRows(spec.columns, spec.key, existing, incoming, now);
  var out = merged.rows.map(function (row) { return row.map(sanitizeCell); });
  if (!out.length) return merged;
  ensureRows(sh, spec, out.length + 1);
  sh.getRange(2, 1, out.length, width).setValues(out);
  return merged;
}

function append(ss, spec, objs) {
  if (!objs.length) return;
  var sh = ensureSheetLight(ss, spec);
  var rows = objs.map(function (o) { return toRow(spec.columns, o).map(sanitizeCell); });
  ensureRows(sh, spec, sh.getLastRow() + rows.length);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, spec.columns.length).setValues(rows);
}

/** Tab bị xoá tay ⇒ dựng lại; còn thì để nguyên (không ghi lại tiêu đề mỗi lượt). */
function ensureSheetLight(ss, spec) {
  return ss.getSheetByName(spec.name) || ensureSheet(ss, spec);
}
