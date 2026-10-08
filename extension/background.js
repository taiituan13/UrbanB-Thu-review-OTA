// Tiến trình nền: hẹn giờ, mở tab extranet trong nền, quét, chuẩn hoá, gửi về Google Sheet.

import {
  CHANNELS,
  VERSION,
  clearSheetError,
  dropLogs,
  getDeviceId,
  loadConfig,
  loadPendingLogs,
  loadStatus,
  queueLog,
  saveChannelStatus,
} from "./config.js";
import { SheetError, makeLogEntry, parseSheetReply, withRetry } from "./report.js";
import { normalizeBatch } from "./normalize.js";
import {
  bookingSessionInPage,
  scanAgodaInPage,
  scanBookingInPage,
  scanExpediaInPage,
  scanTravelokaInPage,
  scanTripInPage,
} from "./scanners.js";

const ALARM = "scan";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Hẹn giờ ----------

async function schedule() {
  const cfg = await loadConfig();
  const minutes = Math.max(30, Math.round(Number(cfg.intervalHours || 6) * 60));
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { delayInMinutes: 5, periodInMinutes: minutes });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runScan("hẹn giờ");
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "scanNow") {
    runScan("bấm tay").then(
      (problem) => reply(problem ? { ok: false, error: problem } : { ok: true }),
      (e) => reply({ ok: false, error: String(e) }),
    );
    return true;
  }
  if (msg?.type === "pingSheet") {
    pingSheet().then(reply, (e) => reply({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "reschedule") {
    schedule().then(() => reply({ ok: true }));
    return true;
  }
  return false;
});

// ---------- Tab ----------

function waitForLoad(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Hết giờ chờ trang tải"));
    }, timeoutMs);
    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") {
        cleanup();
        resolve();
      }
    }
    function cleanup() {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

/** Mở (hoặc chuyển) tab tới url, chờ tải xong và chờ thêm cho trang tự chuyển hướng; trả URL cuối. */
async function go(tabId, url) {
  const loaded = waitForLoad(tabId);
  await chrome.tabs.update(tabId, { url });
  await loaded;
  await sleep(2500);
  const tab = await chrome.tabs.get(tabId);
  return tab.url ?? "";
}

async function runInPage(tabId, func, args = []) {
  const [first] = await chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
  return first?.result;
}

const LOGIN_PATTERNS = {
  booking: (u) => u.hostname === "account.booking.com" || u.pathname.includes("sign-in"),
  agoda: (u) => u.pathname.includes("/public/login"),
  trip: (u) => u.pathname.startsWith("/login"),
  expedia: (u) => /\/account\/logon/i.test(u.pathname),
  // Chưa đo được trang đăng nhập Traveloka (lúc đo đã đăng nhập sẵn) ⇒ nhận diện rộng.
  traveloka: (u) => !u.hostname.startsWith("tera.") || /login|sign-?in/i.test(u.pathname),
};

function needsLogin(channel, url) {
  try {
    return LOGIN_PATTERNS[channel](new URL(url));
  } catch {
    return false;
  }
}

class LoginRequired extends Error {}

function assertLoggedIn(channel, url) {
  if (needsLogin(channel, url)) throw new LoginRequired("Cần đăng nhập lại");
}

// ---------- Quét từng kênh ----------

async function scanBooking(tabId, cfg) {
  assertLoggedIn("booking", await go(tabId, "https://admin.booking.com/"));
  let session = null;
  for (let i = 0; i < 10; i++) {
    session = await runInPage(tabId, bookingSessionInPage);
    if (session?.ses && (cfg.bookingHotelId || session.propertyIds.length)) break;
    await sleep(1000);
  }
  if (!session?.ses) throw new Error("Không đọc được phiên Booking (ses)");
  let hotelId = String(cfg.bookingHotelId || "").trim();
  if (!hotelId) {
    if (session.propertyIds.length !== 1) {
      throw new Error(
        `Tài khoản Booking thấy ${session.propertyIds.length} chỗ nghỉ (${session.propertyIds.join(", ")}). Điền mã Booking trong cài đặt.`,
      );
    }
    hotelId = session.propertyIds[0];
  }
  const url = `https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/reviews.html?hotel_id=${encodeURIComponent(hotelId)}&lang=vi&ses=${encodeURIComponent(session.ses)}`;
  assertLoggedIn("booking", await go(tabId, url));
  return runInPage(tabId, scanBookingInPage);
}

async function scanAgoda(tabId, cfg) {
  let pid = String(cfg.agodaPropertyId || "").trim();
  if (!pid) {
    const landed = await go(tabId, "https://ycs.agoda.com/");
    assertLoggedIn("agoda", landed);
    const m = new URL(landed).pathname.match(/\/(\d{5,})(?:\/|$)/);
    if (!m) throw new Error("Không dò được mã khách sạn Agoda. Điền mã Agoda trong cài đặt.");
    pid = m[1];
  }
  assertLoggedIn("agoda", await go(tabId, `https://portal.agoda.com/mldc/vi-vn/app/setting/review/${pid}`));
  return runInPage(tabId, scanAgodaInPage, [pid]);
}

async function scanTrip(tabId) {
  assertLoggedIn("trip", await go(tabId, "https://ebooking.trip.com/comment/commentList"));
  return runInPage(tabId, scanTripInPage);
}

async function scanExpedia(tabId, cfg) {
  const pid = String(cfg.expediaPropertyId || "").trim();
  const url = "https://apps.expediapartnercentral.com/supply/reviews/post-stay-reviews" + (pid ? `?htid=${encodeURIComponent(pid)}` : "");
  assertLoggedIn("expedia", await go(tabId, url));
  return runInPage(tabId, scanExpediaInPage);
}

async function scanTraveloka(tabId) {
  assertLoggedIn("traveloka", await go(tabId, "https://tera.traveloka.com/vi-vn/guest-review/"));
  return runInPage(tabId, scanTravelokaInPage);
}

const SCANNERS = { booking: scanBooking, agoda: scanAgoda, trip: scanTrip, expedia: scanExpedia, traveloka: scanTraveloka };

// ---------- Gửi về Google Sheet ----------

/** Thông tin máy gửi kèm mọi lượt, để Sheet cập nhật tab "Máy cài". */
async function deviceInfo(cfg) {
  return {
    deviceId: await getDeviceId(),
    hotel: cfg.hotel,
    version: VERSION,
    channels: CHANNELS.filter((ch) => cfg.enabled[ch]).join(", "),
    intervalHours: Number(cfg.intervalHours) || 6,
    status: await loadStatus(),
  };
}

/**
 * Gửi một lượt về Sheet, kèm thông tin máy và các lỗi đang chờ.
 * Cùng một requestId cho mọi lần gửi lại ⇒ Apps Script không ghi hai lần.
 */
async function postSheet(cfg, payload) {
  const logs = await loadPendingLogs();
  const body = JSON.stringify({
    ...payload,
    requestId: crypto.randomUUID(),
    device: await deviceInfo(cfg),
    logs,
    secret: cfg.secret,
  });
  try {
    const reply = await withRetry(
      async () => {
        let res;
        try {
          res = await fetch(cfg.sheetUrl, { method: "POST", body });
        } catch (e) {
          throw new SheetError(`Không gọi được Sheet: ${e?.message ?? e}`, true);
        }
        return parseSheetReply(res.status, await res.text());
      },
      { sleep },
    );
    if (logs.length) await dropLogs(logs.map((l) => l.id));
    await clearSheetError();
    return reply;
  } catch (e) {
    // Lỗi gửi Sheet thì chưa ghi được vào Sheet ⇒ xếp hàng, gửi kèm lượt sau.
    const entry = makeLogEntry({ channel: payload.run?.channel ?? "", stage: "gửi Sheet", error: e });
    await queueLog(entry);
    e.logEntry = entry;
    throw e;
  }
}

async function pingSheet() {
  const cfg = await loadConfig();
  if (!cfg.sheetUrl || !cfg.secret) {
    const entry = makeLogEntry({ stage: "gửi Sheet", error: "Chưa điền URL Sheet hoặc mã bí mật" });
    await queueLog(entry);
    return { ok: false, error: entry.message, ref: entry.ref, code: entry.code };
  }
  try {
    return await postSheet(cfg, { action: "ping" });
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e), ref: e.logEntry?.ref, code: e.logEntry?.code };
  }
}

/** Phần của dòng nhật ký mà ô bật lên cần: mã để sao chép và cách xử lý. */
function errorBrief(entry) {
  const { ref, code, hint, at, channel, stage, message } = entry;
  return { ref, code, hint, at, channel, stage, message };
}

// ---------- Một lượt quét ----------

let running = false;

/** Trả chuỗi mô tả nếu lượt quét không chạy được; undefined nếu đã chạy xong. */
async function runScan(trigger) {
  if (running) return "Đang có một lượt quét chạy, đợi nó xong.";
  running = true;
  try {
    const cfg = await loadConfig();
    if (!cfg.sheetUrl || !cfg.secret || !cfg.hotel) {
      await setBadge("!");
      return "Chưa điền đủ tên khách sạn, URL Web App và mã bí mật.";
    }
    for (const channel of CHANNELS) {
      if (!cfg.enabled[channel]) continue;
      await scanOne(channel, cfg, trigger);
    }
    // Báo sống kèm trạng thái cuối của mọi kênh; chạy cả khi không bật kênh nào.
    try {
      await postSheet(cfg, { action: "heartbeat" });
    } catch {}
  } finally {
    running = false;
    await refreshBadge();
  }
}

async function scanOne(channel, cfg, trigger) {
  const startedAt = new Date().toISOString();
  const run = { at: startedAt, hotel: cfg.hotel, channel, trigger, version: VERSION, status: "", count: 0, note: "" };
  let tab = null;
  let stage = "mở tab";
  try {
    tab = await chrome.tabs.create({ url: "about:blank", active: false });
    stage = "quét";
    const result = await SCANNERS[channel](tab.id, cfg);
    if (!result?.ok) throw new Error(result?.error ?? "Quét thất bại");

    stage = "chuẩn hoá";
    const ctx = { hotel: cfg.hotel, channelHotelId: result.channelHotelId };
    const batch = normalizeBatch(channel, result.reviews, ctx);
    const snapshots = (result.snapshots ?? []).map((s) => ({ ...s, at: startedAt, hotel: cfg.hotel, channel }));
    run.status = batch.errors.length ? "một phần" : "ok";
    run.count = batch.reviews.length;
    run.note = `kênh báo ${result.total ?? "?"} bài` + (batch.errors.length ? ` · ${batch.errors.length} bài lỗi chuẩn hoá` : "");
    let partial = null;
    if (batch.errors.length) {
      partial = makeLogEntry({
        channel,
        stage,
        error: `${batch.errors.length} bài lỗi chuẩn hoá (vẫn gửi các bài còn lại)`,
        detail: batch.errors.slice(0, 5).join("\n"),
      });
      await queueLog(partial);
      run.note += ` · ${partial.ref}`;
    }

    stage = "gửi Sheet";

    const sent = await postSheet(cfg, {
      action: "ingest",
      run,
      reviews: batch.reviews,
      scores: batch.scores,
      snapshots,
    });
    await saveChannelStatus(channel, {
      at: startedAt,
      state: "ok",
      count: batch.reviews.length,
      message: `${sent.inserted} mới · ${sent.updated} đổi`,
      error: partial && errorBrief(partial),
    });
  } catch (e) {
    const login = e instanceof LoginRequired;
    run.status = login ? "cần đăng nhập" : "lỗi";
    run.note = String(e?.message ?? e);
    // Lỗi lúc gửi Sheet thì postSheet đã tự xếp hàng; các giai đoạn khác ghi ở đây.
    let entry = e?.logEntry ?? null;
    if (!entry) {
      let url = "";
      try {
        if (tab?.id != null) url = (await chrome.tabs.get(tab.id)).url ?? "";
      } catch {}
      entry = makeLogEntry({ channel, stage: login ? "đăng nhập" : stage, error: e, url });
      await queueLog(entry);
    }
    // Mã tham chiếu nằm cả ở tab "Lượt quét" ⇒ Ctrl+F trong Sheet thấy cả hai nơi.
    run.note = `${entry.ref} · ${entry.code} · ${run.note}`;
    await saveChannelStatus(channel, {
      at: startedAt,
      state: login ? "login" : "error",
      count: 0,
      message: String(e?.message ?? e),
      error: errorBrief(entry),
    });
    // Ghi lượt lỗi (kèm nhật ký lỗi) vào Sheet; gửi hỏng thì lỗi nằm lại hàng đợi cho lượt sau.
    try {
      await postSheet(cfg, { action: "ingest", run, reviews: [], scores: [], snapshots: [] });
    } catch {}
  } finally {
    if (tab?.id != null) {
      try {
        await chrome.tabs.remove(tab.id);
      } catch {}
    }
  }
}

// ---------- Huy hiệu trên biểu tượng ----------

async function setBadge(text) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color: text ? "#dc2626" : "#16a34a" });
}

async function refreshBadge() {
  const status = await loadStatus();
  const bad = Object.values(status).some((s) => s && s.state !== "ok");
  await setBadge(bad ? "!" : "");
}
