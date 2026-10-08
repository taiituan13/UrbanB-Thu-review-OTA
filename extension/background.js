// Tiến trình nền: hẹn giờ, mở tab extranet trong nền, quét, chuẩn hoá, gửi về Google Sheet.

import { CHANNELS, VERSION, loadConfig, saveChannelStatus, loadStatus } from "./config.js";
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
    runScan("bấm tay").then(() => reply({ ok: true }), (e) => reply({ ok: false, error: String(e) }));
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

async function postSheet(cfg, payload) {
  const res = await fetch(cfg.sheetUrl, {
    method: "POST",
    body: JSON.stringify({ ...payload, secret: cfg.secret }),
  });
  const body = await res.text();
  let j;
  try {
    j = JSON.parse(body);
  } catch {
    throw new Error(`Sheet trả về không phải JSON (HTTP ${res.status}). Kiểm lại URL Web App và quyền "Bất kỳ ai".`);
  }
  if (!j.ok) throw new Error(`Sheet từ chối: ${j.error ?? "không rõ"}`);
  return j;
}

async function pingSheet() {
  const cfg = await loadConfig();
  if (!cfg.sheetUrl || !cfg.secret) return { ok: false, error: "Chưa điền URL Sheet hoặc mã bí mật" };
  return postSheet(cfg, { action: "ping" });
}

// ---------- Một lượt quét ----------

let running = false;

async function runScan(trigger) {
  if (running) return;
  running = true;
  try {
    const cfg = await loadConfig();
    if (!cfg.sheetUrl || !cfg.secret || !cfg.hotel) {
      await setBadge("!");
      return;
    }
    for (const channel of CHANNELS) {
      if (!cfg.enabled[channel]) continue;
      await scanOne(channel, cfg, trigger);
    }
  } finally {
    running = false;
    await refreshBadge();
  }
}

async function scanOne(channel, cfg, trigger) {
  const startedAt = new Date().toISOString();
  const run = { at: startedAt, hotel: cfg.hotel, channel, trigger, version: VERSION, status: "", count: 0, note: "" };
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: "about:blank", active: false });
    const result = await SCANNERS[channel](tab.id, cfg);
    if (!result?.ok) throw new Error(result?.error ?? "Quét thất bại");

    const ctx = { hotel: cfg.hotel, channelHotelId: result.channelHotelId };
    const batch = normalizeBatch(channel, result.reviews, ctx);
    const snapshots = (result.snapshots ?? []).map((s) => ({ ...s, at: startedAt, hotel: cfg.hotel, channel }));
    run.status = batch.errors.length ? "một phần" : "ok";
    run.count = batch.reviews.length;
    run.note = `kênh báo ${result.total ?? "?"} bài` + (batch.errors.length ? ` · ${batch.errors.length} bài lỗi chuẩn hoá` : "");

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
    });
  } catch (e) {
    const login = e instanceof LoginRequired;
    run.status = login ? "cần đăng nhập" : "lỗi";
    run.note = String(e?.message ?? e);
    await saveChannelStatus(channel, { at: startedAt, state: login ? "login" : "error", count: 0, message: run.note });
    // Ghi lượt lỗi vào Sheet để người xem biết kênh nào đang im; lỗi khi ghi thì bỏ qua.
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
