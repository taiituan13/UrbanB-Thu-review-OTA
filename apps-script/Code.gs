// Điểm nhận review cho Google Sheet — dán vào Extensions › Apps Script của Sheet.
//
// Cài: chạy setup() một lần (tạo các tab, sinh mã bí mật, in ra ở Nhật ký thực thi),
// rồi Deploy › New deployment › Web app · Execute as: Me · Who has access: Anyone.
// Extension của mỗi khách sạn POST JSON lên URL …/exec kèm mã bí mật.
// Mỗi lần liên lạc cập nhật tab "Máy cài"; lỗi của extension ghi vào tab "Nhật ký lỗi".

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
  // Mỗi bản cài (khoá = tên khách sạn đã chuẩn hoá) một dòng; ghi đè sau mỗi lần liên lạc.
  devices: {
    name: "Máy cài",
    key: "nameKey",
    columns: [
      ["nameKey", "Khoá (tên chuẩn hoá)", "text"],
      ["hotel", "Tên khai báo", "text"],
      ["lost", "Mất liên lạc", "formula"],
      ["warning", "Cảnh báo", "text"],
      ["statusText", "Trạng thái kênh", "text"],
      ["lastSeen", "Lần cuối liên lạc (UTC)", "text"],
      ["lastAction", "Việc lần cuối", "text"],
      ["lastError", "Lỗi gần nhất", "text"],
      ["lastErrorAt", "Lúc lỗi (UTC)", "text"],
      ["version", "Phiên bản", "text"],
      ["channels", "Kênh bật", "text"],
      ["intervalHours", "Chu kỳ quét (giờ)", "number"],
      ["devices", "Mã máy · lần cuối thấy", "text"],
      ["firstSeen", "Lần đầu liên lạc (UTC)", "text"],
      ["deadline", "Hạn liên lạc kế tiếp", "datetime"],
    ],
  },
  // Chỉ thêm dòng; giữ LOG_KEEP dòng mới nhất. Lọc theo cột Khách sạn để xem từng máy.
  logs: {
    name: "Nhật ký lỗi",
    columns: [
      ["at", "Thời điểm (UTC)", "text"],
      ["hotel", "Khách sạn", "text"],
      ["device", "Mã máy", "text"],
      ["version", "Phiên bản", "text"],
      ["channel", "Kênh", "text"],
      ["stage", "Giai đoạn", "text"],
      ["message", "Lỗi", "text"],
      ["url", "Trang lúc lỗi", "text"],
      ["detail", "Chi tiết", "text"],
      ["receivedAt", "Sheet nhận lúc (UTC)", "text"],
    ],
  },
};

/** Số dòng nhật ký lỗi giữ lại; vượt thì xoá dòng cũ nhất. */
var LOG_KEEP = 5000;

/** Một máy im quá LOST_FACTOR × chu kỳ quét thì bị đánh dấu mất liên lạc. */
var LOST_FACTOR = 2;

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

// ---------- Máy cài và nhật ký lỗi (hàm thuần) ----------

var HOUR_MS = 3600000;
var CHANNEL_NAMES = { booking: "Booking", agoda: "Agoda", trip: "Trip", expedia: "Expedia", traveloka: "Traveloka" };
var STATE_NAMES = { ok: "ổn", error: "lỗi", login: "cần đăng nhập" };

/** "  Linh  Đan " và "linh dan" là một khách sạn: bỏ dấu, đ → d, gộp khoảng trắng, chữ thường. */
function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** URL không bao giờ được mang query hay hash: `ses` của Booking nằm ở đó. */
function stripUrl(url) {
  return String(url || "").split(/[?#]/)[0].slice(0, 300);
}

function channelStatusText(status) {
  if (!status) return "";
  return Object.keys(CHANNEL_NAMES)
    .filter(function (ch) { return status[ch]; })
    .map(function (ch) {
      var st = status[ch];
      return CHANNEL_NAMES[ch] + ": " + (STATE_NAMES[st.state] || st.state);
    })
    .join(" · ");
}

/** "a1b2c3d4@2026-10-08T10:00:00Z; …" ⇔ [{ id, at }] */
function parseDeviceList(text) {
  return String(text || "")
    .split(";")
    .map(function (x) { return x.trim(); })
    .filter(Boolean)
    .map(function (x) {
      var i = x.indexOf("@");
      return i < 0 ? { id: x, at: "" } : { id: x.slice(0, i), at: x.slice(i + 1) };
    });
}

function formatDeviceList(list) {
  return list.map(function (d) { return d.id + "@" + d.at; }).join("; ");
}

/**
 * Cập nhật bảng Máy cài (mảng object theo SHEETS.devices) bằng một lần liên lạc.
 * device: { deviceId, hotel, version, channels, intervalHours, status }.
 * Trả mảng object mới; không đụng tới mảng vào.
 */
function mergeDevice(rows, device, info, nowIso) {
  rows = rows.map(function (r) { var o = {}; for (var k in r) o[k] = r[k]; return o; });
  var key = normalizeName(device.hotel) || "(chưa đặt tên)";
  var id = String(device.deviceId || "").slice(0, 8) || "?";
  var interval = Number(device.intervalHours) || 6;
  var now = Date.parse(nowIso);

  // Cùng mã máy mà khai tên khác ⇒ máy đã đổi tên: gỡ nó khỏi dòng cũ để dòng cũ không báo trùng mãi.
  rows.forEach(function (r) {
    if (r.nameKey === key) return;
    var list = parseDeviceList(r.devices);
    var kept = list.filter(function (d) { return d.id !== id; });
    if (kept.length === list.length) return;
    r.devices = formatDeviceList(kept);
    r.warning = "Máy " + id + " đã đổi tên sang “" + String(device.hotel || "").trim() + "”";
  });

  var row = null;
  for (var i = 0; i < rows.length; i++) if (rows[i].nameKey === key) row = rows[i];
  if (!row) {
    row = { nameKey: key, firstSeen: nowIso, lastError: "", lastErrorAt: "" };
    rows.push(row);
  }
  row.hotel = String(device.hotel || "").trim();
  row.version = device.version || "";
  row.channels = device.channels || "";
  row.intervalHours = interval;
  row.lastSeen = nowIso;
  row.lastAction = info.action || "";
  if (device.status) row.statusText = channelStatusText(device.status);
  if (info.error) {
    row.lastError = info.error;
    row.lastErrorAt = nowIso;
  }
  row.deadline = new Date(now + LOST_FACTOR * interval * HOUR_MS).toISOString();

  var monthAgo = new Date(now - 30 * 24 * HOUR_MS).toISOString();
  var list = parseDeviceList(row.devices).filter(function (d) { return d.id !== id && d.at >= monthAgo; });
  list.push({ id: id, at: nowIso });
  row.devices = formatDeviceList(list);
  // Chỉ đếm máy còn liên lạc trong cửa sổ mất liên lạc: cài lại extension (mã mới) không báo trùng mãi.
  var activeFrom = new Date(now - LOST_FACTOR * interval * HOUR_MS).toISOString();
  var active = list.filter(function (d) { return d.at >= activeFrom; });
  row.warning = active.length > 1 ? "Trùng tên: " + active.length + " máy cùng khai tên này" : "";
  return rows;
}

function cut(value, n) {
  var s = value === null || value === undefined ? "" : String(value);
  return s.length > n ? s.slice(0, n) + "…" : s;
}

/** Dòng nhật ký từ extension ⇒ dòng ghi Sheet: gắn máy, cắt độ dài, gỡ query khỏi URL, tối đa 50 dòng. */
function cleanLogs(logs, device, nowIso) {
  if (!Array.isArray(logs)) return [];
  device = device || {};
  return logs.slice(-50).map(function (l) {
    l = l || {};
    return {
      at: cut(l.at, 40),
      hotel: cut(String(device.hotel || "").trim(), 200),
      device: String(device.deviceId || "").slice(0, 8),
      version: cut(device.version, 20),
      channel: cut(l.channel, 20),
      stage: cut(l.stage, 40),
      message: cut(l.message, 500),
      url: stripUrl(l.url),
      detail: cut(l.detail, 2000),
      receivedAt: nowIso,
    };
  });
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
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, spec.columns.length).getValues().map(function (r) {
    return r.map(function (v) { return v instanceof Date ? v.toISOString() : v; });
  });
  return rowsToObjects(spec.columns, values);
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
    if (c[2] === "formula") return; // ép "@" thì công thức hiện thành chữ
    var format = c[2] === "text" ? "@" : c[2] === "datetime" ? "dd/MM/yyyy HH:mm" : "0.0#";
    sh.getRange(1, i + 1, sh.getMaxRows(), 1).setNumberFormat(format);
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
  if (["ping", "ingest", "heartbeat"].indexOf(body.action) < 0) return json({ ok: false, error: "Hành động lạ" });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return json({ ok: false, error: "Sheet đang bận, thử lại sau" });
  try {
    // Google đôi khi trả 404 ở chặng chuyển hướng SAU KHI doPost đã chạy (đo 08/10/2026: 7/60 lượt),
    // nên extension gửi lại cùng requestId. Lượt lặp nhận lại câu trả lời cũ, không ghi lần hai.
    var cache = CacheService.getScriptCache();
    var reqKey = body.requestId ? "req:" + String(body.requestId).slice(0, 64) : "";
    var hit = reqKey ? cache.get(reqKey) : null;
    if (hit) {
      var old = JSON.parse(hit);
      old.replayed = true;
      return json(old);
    }
    var result = handle(SpreadsheetApp.getActiveSpreadsheet(), body, new Date().toISOString());
    var text = JSON.stringify(result);
    if (reqKey && text.length < 90000) cache.put(reqKey, text, 600);
    return json(result);
  } finally {
    lock.releaseLock();
  }
}

function handle(ss, body, now) {
  var result = { ok: true };
  if (body.action === "ping") result.sheet = ss.getName();
  var action = { ping: "Thử Sheet", heartbeat: "Báo sống sau lượt quét" }[body.action] || "";
  if (body.action === "ingest") {
    var r = upsert(ss, SHEETS.review, body.reviews || [], now);
    upsert(ss, SHEETS.scores, body.scores || [], now);
    var run = body.run || {};
    run.inserted = r.inserted;
    run.updated = r.updated;
    append(ss, SHEETS.runs, [run]);
    append(ss, SHEETS.snapshots, body.snapshots || []);
    result.inserted = r.inserted;
    result.updated = r.updated;
    action = "Gửi " + (CHANNEL_NAMES[run.channel] || run.channel || "?") + " (" + (run.status || "?") + ")";
  }
  // Sổ máy và nhật ký hỏng không được làm hỏng lượt ghi review.
  try {
    var logs = cleanLogs(body.logs, body.device, now);
    if (logs.length) appendLogs(ss, logs);
    if (body.device) {
      var last = logs.length ? logs[logs.length - 1] : null;
      var error = last ? (last.channel ? CHANNEL_NAMES[last.channel] || last.channel : "") + " · " + last.stage + " · " + last.message : "";
      writeDevices(ss, mergeDevice(readObjects(ss, SHEETS.devices), body.device, { action: action, error: error }, now));
    }
  } catch (err) {
    result.deviceError = String(err);
  }
  if (body.action === "ingest") {
    // Thống kê hỏng cũng không được làm hỏng lượt ghi dữ liệu.
    result.statsError = "";
    try {
      refreshStats(ss);
    } catch (err) {
      result.statsError = String(err);
    }
  }
  return result;
}

function appendLogs(ss, logs) {
  append(ss, SHEETS.logs, logs);
  var sh = ss.getSheetByName(SHEETS.logs.name);
  var extra = sh.getLastRow() - 1 - LOG_KEEP;
  if (extra > 0) sh.deleteRows(2, extra);
}

/** Ghi lại cả bảng Máy cài; cột "Mất liên lạc" là công thức để tự đổi theo giờ, không cần lượt ghi mới. */
function writeDevices(ss, objs) {
  if (!objs.length) return;
  var spec = SHEETS.devices;
  var sh = ensureSheetLight(ss, spec);
  var fields = spec.columns.map(function (c) { return c[0]; });
  var rows = objs.map(function (o) {
    return fields.map(function (f) {
      if (f === "deadline") return o.deadline ? new Date(o.deadline) : "";
      if (f === "lost") return "";
      return sanitizeCell(o[f] === undefined || o[f] === null ? "" : o[f]);
    });
  });
  ensureRows(sh, spec, rows.length + 1);
  sh.getRange(2, 1, rows.length, fields.length).setValues(rows);
  var lostCol = fields.indexOf("lost") + 1;
  var offset = fields.indexOf("deadline") - fields.indexOf("lost");
  var formula = '=IF(RC[' + offset + ']="","",IF(NOW()>RC[' + offset + '],"MẤT LIÊN LẠC",""))';
  sh.getRange(2, lostCol, rows.length, 1).setFormulaR1C1(formula);
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
