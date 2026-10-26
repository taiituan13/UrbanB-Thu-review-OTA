// Tiến trình nền: hẹn giờ, mở tab extranet trong nền, quét, chuẩn hoá, gửi lên Hub. Từ 1.5.2 không ghi
// Google Sheet nữa (YC-228, H-1924 a).
// Phần "UrbanB tại quầy" (khung trên PMS) nằm ở quay/sw.js.

import { CHANNELS, CHANNEL_LABEL, forgetSheet, getDeviceId, loadConfig, loadStatus, queueLog, saveChannelStatus, saveConfig } from "./config.js";
import { makeLogEntry, withRetry } from "./report.js";
import { normalizeBatch } from "./normalize.js";
import { hubBatches, hubRunMeta, hubSnapshots, hubSummaryText, ingestRequest, parseIngestReply, rejectedText, sumHubReplies } from "./hub.js";
import { REMOTE_MANIFEST_URL, isNewer, parseRemoteVersion } from "./update.js";
import { SETUP_FILE, applySetup, decodeSetupCode } from "./setup-code.js";
import { TAB_CLOSED_MESSAGE, blankTabMessage, explainInjectError, isBlankTab } from "./nav.js";
import { hubFetch, hubOriginNow, installQuay, noteSignedOut, refreshHubSettings, sendHeartbeat } from "./quay/sw.js";
import { alarmMinutes, loadEffectiveConfig, reviewMissingText, scanAlarmFor } from "./hub-config.js";
import { badgeText } from "./quay/notifications.js";
import { autoRescanChannel } from "./login-watch.js";
import { PAGE_RUN_TIMEOUT_MS, REMOTE_TIMEOUT_MS, isTimeout, withTimeout } from "./quay/net.js";
import {
  BANNER_TEXT,
  BANNER_TIMEOUT_MS,
  SCAN_GROUP,
  TAB_RETRY_BUSY_MINUTES,
  channelOfRetryAlarm,
  closedOutcome,
  pickScanGroup,
  retryAlarmName,
  showScanBanner,
} from "./tab-scan.js";
import { TAB_RETRY_KEY } from "./quay/review-status.js";
import {
  bookingSessionInPage,
  scanAgodaInPage,
  scanBookingInPage,
  scanExpediaInPage,
  expediaLanding,
  expediaPropertiesInPage,
  pickPropertyId,
  scanGo2joyInPage,
  scanTravelokaInPage,
  scanTripInPage,
} from "./scanners.js";

const ALARM = "scan";
const UPDATE_ALARM = "diskUpdate";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Hẹn giờ ----------

/** Đặt lại lịch (lúc nạp, áp mã cài đặt): lượt tự quét đầu tiên sau 5 phút. Chu kỳ theo cấu hình Hub. */
async function schedule() {
  const cfg = await loadEffectiveConfig();
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { delayInMinutes: 5, periodInMinutes: alarmMinutes(cfg.intervalHours) });
  await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 30 });
}

/**
 * Chu kỳ trên Hub đổi ⇒ đổi chu kỳ báo thức. Chu kỳ như cũ thì để nguyên. Giờ quét kế tiếp không bao
 * giờ bị lùi: lấy cái sớm hơn giữa giờ đã hẹn và lúc này cộng chu kỳ mới (`scanAlarmFor`).
 */
async function followHubInterval() {
  const minutes = alarmMinutes((await loadEffectiveConfig()).intervalHours);
  const next = scanAlarmFor(await chrome.alarms.get(ALARM), minutes, Date.now());
  if (next) await chrome.alarms.create(ALARM, next);
}

/** Hỏi Hub cấu hình chung (chỉ đọc). Không gọi được Hub thì giữ bản đã nhận; không chặn lượt quét. */
async function syncHubSettings() {
  try {
    await refreshHubSettings();
  } catch {}
  await followHubInterval().catch(() => {});
}

// Lên bản (chạy lại lệnh cài ⇒ extension tự nạp lại ⇒ onInstalled): dọn Sheet cũ trong bộ nhớ trước mọi việc.
const boot = () => forgetSheet().catch(() => {}).then(schedule).then(rearmTabRetries).then(importSetupFile);
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runScan("hẹn giờ").catch(scanCrashed);
  const retry = channelOfRetryAlarm(alarm.name);
  if (retry) retryClosedTab(retry).catch(scanCrashed);
  if (alarm.name === UPDATE_ALARM) {
    syncHubSettings().then(refreshBadge);
    reloadIfDiskNewer();
    checkRemoteVersion();
    importSetupFile();
  }
});

// ---------- Mã cài đặt (setup-code.js) ----------

let importing = null;

/**
 * Lệnh cài kèm mã ghi tệp ma-cai-dat.txt vào thư mục extension. Chỉ áp khi nội dung tệp khác lần
 * đọc trước (`setupFileSeen`), để chỉnh tay hay dán mã khác trong ô Cài đặt sau đó không bị tệp
 * cũ ghi đè. Tệp hỏng cũng chỉ báo một lần. Một lượt một lúc: lúc nạp, onInstalled và ô bật lên
 * có thể gọi cùng lúc.
 */
function importSetupFile() {
  importing ??= (async () => {
    let text;
    try {
      const res = await fetch(chrome.runtime.getURL(SETUP_FILE), { cache: "no-store" });
      text = res.ok ? (await res.text()).trim() : "";
    } catch {
      return null; // không có tệp: máy cài không kèm mã
    }
    const { setupFileSeen } = await chrome.storage.local.get("setupFileSeen");
    if (!text || text === setupFileSeen) return null;
    await chrome.storage.local.set({ setupFileSeen: text });
    return applySetupText(text, "tệp");
  })().finally(() => (importing = null));
  return importing;
}

/**
 * Áp mã vào cấu hình (phần Sheet trong mã cũ bỏ qua, setup-code.js), rồi thử Hub ngay để người cài biết
 * máy đã đăng nhập Hub chưa. Kết quả lưu ở `setupResult` để ô bật lên báo lại.
 */
async function applySetupText(text, from) {
  let result;
  try {
    const setup = decodeSetupCode(text);
    const cfg = applySetup(await loadConfig(), setup);
    await saveConfig(cfg);
    await Promise.all([schedule(), refreshBadge()]);
    const ping = await pingHub();
    result = { ok: true, hotel: cfg.hotel, ping };
  } catch (e) {
    result = { ok: false, error: String(e?.message ?? e) };
  }
  await chrome.storage.local.set({ setupResult: { ...result, from, at: new Date().toISOString() } });
  return result;
}

/**
 * Bản cài giải nén: chạy lại lệnh cài trên Windows là chép bản mới đè lên thư mục (xem update.js).
 * Trên đĩa mới hơn bản đang chạy ⇒ tự nạp lại. Không nạp giữa lượt quét.
 */
async function reloadIfDiskNewer() {
  if (running) return;
  try {
    const res = await fetch(chrome.runtime.getURL("manifest.json"), { cache: "no-store" });
    const disk = (await res.json()).version;
    if (isNewer(disk, chrome.runtime.getManifest().version)) chrome.runtime.reload();
  } catch {
    // Đang chép dở (JSON hỏng) ⇒ lượt sau thử lại.
  }
}

/**
 * Đọc số phiên bản mới nhất trên GitHub, lưu vào `update` để ô bật lên hiện dải "Có bản mới".
 * Không vào được GitHub thì giữ kết quả cũ: dải này chỉ là lời nhắc, không chặn việc gì.
 */
async function checkRemoteVersion() {
  try {
    const res = await fetch(REMOTE_MANIFEST_URL, { cache: "no-store", signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS) });
    const latest = res.ok ? parseRemoteVersion(await res.text()) : null;
    if (latest) await chrome.storage.local.set({ update: { latest, at: new Date().toISOString() } });
  } catch {}
}

// "UrbanB tại quầy": khung trên PMS (Booking OTA · Khoá G2J · Chỉ báo) — tin nhắn quay:* (quay/sw.js).
installQuay();
// Số chưa đọc và phiên Hub đổi (quay/sw.js ghi quaySnap) ⇒ vẽ lại huy hiệu.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.quaySnap || changes.hubCollect)) refreshBadge().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === "scanNow") {
    runScan("bấm tay").then(
      (problem) => reply(problem ? { ok: false, error: problem } : { ok: true }),
      (e) => scanCrashed(e).then(() => reply({ ok: false, error: String(e) })),
    );
    return true;
  }
  // YC-199: nút "Quét lại kênh này" trên dòng kênh cần đăng nhập — chỉ quét kênh ấy.
  if (msg?.type === "scanChannel") {
    const channel = String(msg.channel ?? "");
    if (!CHANNELS.includes(channel)) {
      reply({ ok: false, error: "Kênh không hợp lệ" });
      return false;
    }
    runScan("bấm tay", [channel]).then(
      (problem) => reply(problem ? { ok: false, error: problem } : { ok: true }),
      (e) => scanCrashed(e).then(() => reply({ ok: false, error: String(e) })),
    );
    return true;
  }
  if (msg?.type === "pingHub") {
    pingHub().then(reply, (e) => reply({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg?.type === "checkUpdate") {
    // Mở ô bật lên: người vừa chạy lệnh cập nhật thì nạp bản mới ngay (ô tự đóng), không chờ 30 phút.
    reloadIfDiskNewer();
    checkRemoteVersion().then(() => reply({ ok: true }));
    return true;
  }
  if (msg?.type === "applySetupCode") {
    applySetupText(String(msg.code ?? ""), "dán").then(reply);
    return true;
  }
  if (msg?.type === "importSetupFile") {
    importSetupFile().then(reply);
    return true;
  }
  if (msg?.type === "reschedule") {
    // Popup gửi lệnh này sau mỗi lần lưu cài đặt: bật/tắt kênh cũng đổi huy hiệu.
    Promise.all([schedule(), refreshBadge()]).then(() => reply({ ok: true }));
    return true;
  }
  return false;
});

// ---------- Tab ----------

/**
 * Chờ tab tải xong. Trả lời hứa kèm `arm()`: gọi SAU khi đã ra lệnh mở trang thì còn tự hỏi tab mỗi
 * 0,5 giây xem lượt mở có bị bỏ không. Cần vì lượt mở bị huỷ trên tab đã "tải xong" từ trước (lần
 * mở lại trong go()) thì Chrome không báo "complete" lần nữa: đo 09/10/2026, chờ đủ 45 giây rồi
 * báo nhầm "Hết giờ chờ trang tải".
 */
function waitForLoad(tabId, timeoutMs = 45000) {
  let arm;
  const done = new Promise((resolve, reject) => {
    let poll = null;
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
    // Đóng tab lúc đang tải ⇒ báo ngay, đừng chờ 45 giây rồi báo nhầm thành mạng chậm.
    function onRemoved(id) {
      if (id === tabId) {
        cleanup();
        reject(new Error(TAB_CLOSED_MESSAGE));
      }
    }
    function cleanup() {
      clearTimeout(timer);
      clearInterval(poll);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
    }
    arm = () => {
      poll = setInterval(async () => {
        try {
          const t = await chrome.tabs.get(tabId);
          if (t.status === "complete" && !t.pendingUrl && isBlankTab(t.url)) {
            cleanup();
            resolve();
          }
        } catch {} // tab mất: onRemoved lo
      }, 500);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
  done.catch(() => {}); // tabs.update ném trước ⇒ lời hứa này không được ai chờ nữa
  return Object.assign(done, { arm });
}

/**
 * Mở (hoặc chuyển) tab tới url, chờ tải xong và chờ thêm cho trang tự chuyển hướng; trả URL cuối.
 * Tab vẫn trống sau khi "tải xong" (lượt mở bị dừng hoặc bị huỷ, xem nav.js) ⇒ mở lại một lần.
 */
async function go(tabId, url) {
  for (let attempt = 1; ; attempt++) {
    const loaded = waitForLoad(tabId);
    await chrome.tabs.update(tabId, { url });
    loaded.arm();
    await loaded;
    await sleep(2500);
    const now = (await chrome.tabs.get(tabId)).url ?? "";
    if (!isBlankTab(now)) {
      await showBanner(tabId);
      return now;
    }
    if (attempt >= 2) throw new Error(blankTabMessage(url));
  }
}

/**
 * YC-238: dải chữ "Urban B đang đọc review…" trên đầu trang vừa tải. Chèn lại sau mỗi lượt mở trang vì
 * chuyển trang là mất. Chèn hỏng (trang chặn, hết giờ) thì bỏ qua: dải chữ là phụ, không làm kênh đỏ.
 */
async function showBanner(tabId) {
  try {
    const run = chrome.scripting.executeScript({ target: { tabId }, func: showScanBanner, args: [BANNER_TEXT] });
    await withTimeout(run, BANNER_TIMEOUT_MS, "Hết giờ chèn dải chữ");
  } catch {}
}

/**
 * YC-238: cho tab quét vào nhóm "Urban B · đang đọc review" trên thanh tab. Đã có nhóm ấy trong cửa sổ
 * (kênh trước của cùng lượt quét) thì vào nhóm ấy. API nhóm tab lỗi (cửa sổ không phải cửa sổ thường,
 * Chrome đang kéo tab) thì bỏ qua: nhóm là phụ, lượt đọc vẫn chạy.
 */
async function joinScanGroup(tab) {
  try {
    const found = pickScanGroup(await chrome.tabGroups.query({ title: SCAN_GROUP.title }), tab.windowId);
    if (found != null) {
      await chrome.tabs.group({ groupId: found, tabIds: tab.id });
      return;
    }
    const groupId = await chrome.tabs.group({ tabIds: tab.id, createProperties: { windowId: tab.windowId } });
    await chrome.tabGroups.update(groupId, { title: SCAN_GROUP.title, color: SCAN_GROUP.color });
  } catch {}
}

async function closeTab(tabId) {
  if (tabId == null) return;
  try {
    await chrome.tabs.remove(tabId);
  } catch {}
}

async function runInPage(tabId, func, args = []) {
  try {
    const run = chrome.scripting.executeScript({ target: { tabId }, world: "MAIN", func, args });
    const [first] = await withTimeout(run, PAGE_RUN_TIMEOUT_MS, "Hết giờ chờ trang trả kết quả");
    return first?.result;
  } catch (e) {
    if (isTimeout(e)) throw e;
    let tabUrl = "";
    try {
      tabUrl = (await chrome.tabs.get(tabId)).url ?? "";
    } catch {}
    throw new Error(explainInjectError(e?.message ?? e, tabUrl));
  }
}

const LOGIN_PATTERNS = {
  booking: (u) => u.hostname === "account.booking.com" || u.pathname.includes("sign-in"),
  agoda: (u) => u.pathname.includes("/public/login"),
  trip: (u) => u.pathname.startsWith("/login"),
  expedia: (u) => /\/account\/logon/i.test(u.pathname),
  // Chưa đo được trang đăng nhập Traveloka (lúc đo đã đăng nhập sẵn) ⇒ nhận diện rộng.
  traveloka: (u) => !u.hostname.startsWith("tera.") || /login|sign-?in/i.test(u.pathname),
  // Chưa đo được trang đăng nhập Go2Joy ⇒ rời trang đánh giá là coi như hết phiên.
  go2joy: (u) => u.hostname !== "ha.go2joy.vn" || !u.pathname.startsWith("/review-detail"),
};

function needsLogin(channel, url) {
  try {
    return LOGIN_PATTERNS[channel](new URL(url));
  } catch {
    return false;
  }
}

class LoginRequired extends Error {}

/** Đường dẫn (không query) mà tab đang đứng, để câu lỗi nói trang đã chuyển đi đâu. */
async function tabPath(tabId) {
  try {
    return new URL((await chrome.tabs.get(tabId)).url ?? "").pathname;
  } catch {
    return "trang khác";
  }
}

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
        `Tài khoản Booking thấy ${session.propertyIds.length} chỗ nghỉ (${session.propertyIds.join(", ")}). Báo Quản trị hệ thống điền mã Booking của chi nhánh trên Hub.`,
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
    if (!m) throw new Error("Không dò được mã khách sạn Agoda. Báo Quản trị hệ thống điền mã Agoda của chi nhánh trên Hub.");
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
  const reviews = "https://apps.expediapartnercentral.com/supply/reviews/post-stay-reviews";
  let pid = String(cfg.expediaPropertyId || "").trim();
  if (!pid) {
    // Chưa chọn chỗ nghỉ trong phiên thì Expedia đá sang trang khác, kể cả khi tài khoản chỉ có
    // một chỗ: /manageproperty/ (đo 08/10/2026) hoặc /supply/inbox (09/10/2026). Lấy mã từ URL
    // trang đích, không có thì từ các link htid= trên trang đó.
    const landed = await go(tabId, reviews);
    assertLoggedIn("expedia", landed);
    const at = expediaLanding(landed);
    if (at.onReviews) return runInPage(tabId, scanExpediaInPage);
    pid = at.htid ?? pickPropertyId("Expedia", (await runInPage(tabId, expediaPropertiesInPage)) ?? []);
  }
  const landed = await go(tabId, `${reviews}?htid=${encodeURIComponent(pid)}`);
  assertLoggedIn("expedia", landed);
  const at = expediaLanding(landed);
  if (!at.onReviews) {
    throw new Error(`Expedia chuyển sang ${at.path} thay vì trang review của chỗ nghỉ ${pid}. Kiểm lại mã Expedia của chi nhánh trên Hub.`);
  }
  return runInPage(tabId, scanExpediaInPage);
}

async function scanTraveloka(tabId) {
  assertLoggedIn("traveloka", await go(tabId, "https://tera.traveloka.com/vi-vn/guest-review/"));
  return runInPage(tabId, scanTravelokaInPage);
}

async function scanGo2joy(tabId) {
  assertLoggedIn("go2joy", await go(tabId, "https://ha.go2joy.vn/review-detail"));
  return runInPage(tabId, scanGo2joyInPage);
}

const SCANNERS = {
  booking: scanBooking,
  agoda: scanAgoda,
  trip: scanTrip,
  expedia: scanExpedia,
  traveloka: scanTraveloka,
  go2joy: scanGo2joy,
};

// ---------- Gửi lên Hub ----------

/**
 * Một request tới Hub theo phiên đăng nhập (H-1233 a): cookie phiên, không token. Hub là gốc đang chọn
 * trong ô "Hub để đăng nhập" (cùng Hub của khung trên PMS). Lỗi mạng và 5xx thì thử lại.
 */
async function postHub(body) {
  const { url, init } = ingestRequest(await hubOriginNow(), body);
  try {
    return await withRetry(async () => parseIngestReply(await hubFetch(url, init)), { sleep });
  } catch (e) {
    // Hết phiên ⇒ huy hiệu và popup đổi ngay, không chờ khung trên PMS mở lại.
    if (e?.session === "out") await noteSignedOut().catch(() => {});
    throw e;
  }
}

/** Lỗi Hub thành "lỗi gần nhất" có mã để lễ tân sao chép, như mọi lỗi khác. */
async function hubFailure(channel, error, detail) {
  const entry = makeLogEntry({ channel, stage: "gửi Hub", error, detail });
  await queueLog(entry);
  return entry;
}

/** Nút Thử Hub: thử đường lên Hub bằng action "ping" (Hub không ghi gì; kiểm phiên và quyền thêm review). */
async function pingHub() {
  try {
    await postHub({ action: "ping" });
    return { ok: true };
  } catch (e) {
    const entry = await hubFailure("", e);
    return { ok: false, error: entry.message, ref: entry.ref, code: entry.code };
  }
}

/**
 * Gửi các bài của một kênh lên Hub, chia lô. Không bao giờ ném: kết quả (hoặc lỗi) nằm trong
 * trạng thái kênh. Một lô hỏng thì dừng, các lô đã gửi vẫn giữ.
 */
async function sendHub(channel, reviews, at, run, snapshots = []) {
  const replies = [];
  try {
    const meta = hubRunMeta({ deviceId: await getDeviceId(), trigger: run.trigger, runId: run.id });
    for (const body of hubBatches(reviews, undefined, meta, snapshots)) replies.push(await postHub(body));
  } catch (e) {
    const sentNote = replies.length ? ` (đã gửi ${replies.length} lô trước đó)` : "";
    const entry = await hubFailure(channel, `${e?.message ?? e}${sentNote}`);
    return { at, ok: false, text: entry.message, error: errorBrief(entry), login: e?.session === "out" };
  }
  const total = sumHubReplies(replies);
  let error = null;
  if (total.rejected.length) {
    const detail = total.rejected.map((x) => `${x.channel} ${x.channelHotelId} ${x.error}`).join("\n");
    error = errorBrief(await hubFailure(channel, rejectedText(total.rejected), detail));
  }
  if (total.errors.length) {
    const detail = total.errors.slice(0, 5).map((x) => `#${x.index} ${x.key ?? ""} ${x.error ?? ""}`).join("\n");
    error = errorBrief(await hubFailure(channel, `${total.errors.length} bài Hub không nhận`, detail));
  }
  return { at, ok: !error, text: hubSummaryText(total), error };
}

/** Phần của dòng nhật ký mà ô bật lên và khung quầy cần: mã để sao chép và lời hướng dẫn ba phần. */
function errorBrief(entry) {
  const { ref, code, hint, help, at, channel, stage, message } = entry;
  return { ref, code, hint, help, at, channel, stage, message };
}

/**
 * YC-158 (H-1539): lượt quét ném ra ngoài (vd. đọc cấu hình hỏng) từng im hẳn ở lượt hẹn giờ. Nay ghi
 * nhật ký lỗi và giữ dấu `scanCrash` tới lượt quét chạy xong kế tiếp ⇒ huy hiệu hiện "!".
 */
async function scanCrashed(e) {
  const entry = makeLogEntry({ stage: "lượt quét", error: e });
  await queueLog(entry);
  await chrome.storage.local.set({ scanCrash: errorBrief(entry) });
  await refreshBadge().catch(() => {});
}

// ---------- Một lượt quét ----------

let running = false;

/**
 * Trả chuỗi mô tả nếu lượt quét không chạy được; undefined nếu đã chạy xong. `only` = danh sách kênh cần quét
 * (YC-199: quét lại một kênh); bỏ trống ⇒ mọi kênh đang bật.
 */
const BUSY_TEXT = "Đang có một lượt quét chạy, đợi nó xong.";

async function runScan(trigger, only = null) {
  if (running) return BUSY_TEXT;
  running = true;
  // Tab của kênh vừa đọc: đóng sau khi tab kênh kế tiếp đã vào nhóm, để nhóm tab không mất rồi hiện lại giữa hai kênh.
  let leftover = null;
  try {
    // Kênh và chu kỳ theo cấu hình đặt trên Hub (H-1348 a); hỏi lại trước mỗi lượt.
    await syncHubSettings();
    const cfg = await loadEffectiveConfig();
    // Tên khách sạn, mã chỗ nghỉ theo Hub (H-1527 a); chưa biết chi nhánh thì theo cấu hình cũ của máy.
    const missing = reviewMissingText(cfg.review);
    if (missing) return missing;
    // Một mã cho cả lượt (mọi kênh): Hub gom các lô của cùng một lần quét (YC-157).
    const runId = crypto.randomUUID();
    for (const channel of CHANNELS) {
      if (!cfg.enabled[channel]) continue;
      if (only && !only.includes(channel)) continue;
      leftover = await scanOne(channel, cfg, trigger, runId, leftover);
    }
    await chrome.storage.local.remove("scanCrash");
  } finally {
    await closeTab(leftover);
    running = false;
    // YC-157: báo Hub sau mọi lượt quét, kể cả lượt thiếu cấu hình hay hỏng giữa chừng — máy vẫn còn sống.
    await sendHeartbeat({ scan: true }).catch(() => {});
    await refreshBadge();
  }
}

// ---------- YC-199: tự quét lại kênh sau khi lễ tân đăng nhập ----------

/** Giờ tự quét lại gần nhất của từng kênh (chỉ trong phiên chạy nền này; mất khi Chrome dừng nó là không sao). */
const autoRescanTried = {};

/**
 * Một tab tải xong trang quản lý của kênh đang báo "cần đăng nhập lại" ⇒ lễ tân vừa đăng nhập xong: quét lại riêng
 * kênh ấy, không cần bấm. Tab do chính lượt quét mở thì `running` đang bật nên không kích.
 */
chrome.tabs.onUpdated.addListener((_tabId, info, tab) => {
  if (info.status !== "complete" || running) return;
  const url = tab?.url ?? "";
  if (!url.startsWith("https://")) return;
  (async () => {
    const [cfg, status] = await Promise.all([loadEffectiveConfig(), loadStatus()]);
    const channel = autoRescanChannel({ url, enabled: cfg.enabled, status, running, lastTry: autoRescanTried, now: Date.now() });
    if (!channel) return;
    autoRescanTried[channel] = Date.now();
    await runScan("tự quét sau đăng nhập", [channel]);
  })().catch(scanCrashed);
});

/**
 * Quét một kênh rồi gửi Hub. Kênh `ok` khi quét và chuẩn hoá xong (gửi Hub hỏng thì ghi ở `hub`, kênh vẫn
 * ổn nhưng giữ giờ ổn cũ); `error`/`login` chỉ khi chính lượt quét hỏng. Không còn bước ghi Sheet nào
 * làm kênh đỏ (YC-228). `leftover` = tab của kênh trước, đóng ngay sau khi tab mới đã vào nhóm. Trả mã tab
 * của kênh này để người gọi đóng.
 */
async function scanOne(channel, cfg, trigger, runId, leftover = null) {
  const startedAt = new Date().toISOString();
  // Kênh đang chờ đọc lại (tab lượt trước bị đóng) ⇒ lượt này là lần đọc lại, bị đóng nữa thì báo lỗi.
  const pending = (await loadTabRetries())[channel] ?? null;
  let tab = null;
  let hub = null;
  let stage = "mở tab";
  // Tab quét bị ai đó đóng (người gọi chỉ đóng tab sau khi scanOne xong, nên không lẫn với lượt máy tự đóng).
  let closed = false;
  const onRemoved = (id) => {
    if (id === tab?.id) closed = true;
  };
  chrome.tabs.onRemoved.addListener(onRemoved);
  try {
    tab = await chrome.tabs.create({ url: "about:blank", active: false });
    await joinScanGroup(tab);
    await closeTab(leftover);
    leftover = null;
    stage = "quét";
    const result = await SCANNERS[channel](tab.id, cfg);
    // Không có kết quả nào (kể cả câu lỗi) ⇒ trang tự chuyển đi giữa lúc bộ quét đang chạy.
    if (!result) throw new Error(`Trang ${CHANNEL_LABEL[channel]} chuyển sang ${await tabPath(tab.id)} giữa lượt quét, không lấy được kết quả`);
    if (!result.ok) throw new Error(result.error ?? "Quét thất bại");

    stage = "chuẩn hoá";
    const ctx = { hotel: cfg.hotel, channelHotelId: result.channelHotelId };
    const batch = normalizeBatch(channel, result.reviews, ctx);
    let partial = null;
    if (batch.errors.length) {
      partial = makeLogEntry({
        channel,
        stage,
        error: `${batch.errors.length} bài lỗi chuẩn hoá (vẫn gửi các bài còn lại)`,
        detail: batch.errors.slice(0, 5).join("\n"),
      });
      await queueLog(partial);
    }

    // sendHub không ném: lỗi Hub nằm trong `hub`, không làm kênh đỏ.
    hub = await sendHub(channel, batch.reviews, startedAt, { trigger, id: runId }, hubSnapshots(result.snapshots, channel, result.channelHotelId));
    await saveChannelStatus(channel, {
      at: startedAt,
      // Giờ quét ỔN gần nhất (YC-158): gửi Hub hỏng thì review chưa lên Hub ⇒ giữ giờ ổn cũ.
      okAt: hub?.ok === false ? await lastOkAt(channel) : startedAt,
      state: "ok",
      count: batch.reviews.length,
      message: "",
      error: partial && errorBrief(partial),
      hub,
    });
  } catch (e) {
    const login = e instanceof LoginRequired;
    let url = "";
    try {
      if (tab?.id != null) url = (await chrome.tabs.get(tab.id)).url ?? "";
    } catch {}
    let entry = makeLogEntry({ channel, stage: login ? "đăng nhập" : stage, error: e, url });
    // Tab bị đóng mà câu lỗi lại là câu khác (vd. bộ quét hỏng vì trang mất) ⇒ vẫn là lỗi TAB.
    if (!login && closed && !isTabCode(entry.code)) {
      entry = makeLogEntry({ channel, stage, error: TAB_CLOSED_MESSAGE, url, detail: entry.message });
    }
    // H-1973 a: lần đầu bị đóng thì chưa đỏ, hẹn đọc lại kênh ấy một lần.
    const { retry } = closedOutcome({ closed: !login && isTabCode(entry.code), pending, now: Date.now() });
    if (retry) {
      await scheduleTabRetry(channel, retry);
      return null;
    }
    await queueLog(entry);
    await saveChannelStatus(channel, {
      at: startedAt,
      okAt: await lastOkAt(channel),
      state: login ? "login" : "error",
      count: 0,
      message: String(e?.message ?? e),
      error: errorBrief(entry),
      hub,
    });
  } finally {
    chrome.tabs.onRemoved.removeListener(onRemoved);
    await closeTab(leftover);
    // Lần đọc lại đã chạy (đạt hay hỏng): không đọc lại nữa.
    if (pending) await clearTabRetry(channel);
  }
  return tab?.id ?? null;
}

const isTabCode = (code) => /-TAB$/.test(String(code ?? ""));

// ---------- YC-238: đọc lại kênh có tab quét bị đóng giữa chừng ----------

async function loadTabRetries() {
  return (await chrome.storage.local.get(TAB_RETRY_KEY))[TAB_RETRY_KEY] ?? {};
}

/** Ghi kênh chờ đọc lại (khung quầy đọc để báo một dòng) và hẹn báo thức tới giờ đọc lại. */
async function scheduleTabRetry(channel, retry) {
  await chrome.storage.local.set({ [TAB_RETRY_KEY]: { ...(await loadTabRetries()), [channel]: retry } });
  await chrome.alarms.create(retryAlarmName(channel), { when: Date.parse(retry.retryAt) });
}

async function clearTabRetry(channel) {
  const all = await loadTabRetries();
  if (channel in all) {
    delete all[channel];
    await chrome.storage.local.set({ [TAB_RETRY_KEY]: all });
  }
  await chrome.alarms.clear(retryAlarmName(channel));
}

/**
 * Tới giờ đọc lại một kênh. Lượt quét khác đã đọc kênh ấy trong lúc chờ thì thôi. Đang có lượt khác chạy
 * thì lùi một chút. Kênh không được quét (đã tắt, thiếu cấu hình) thì bỏ hẹn, để khung quầy khỏi báo mãi.
 */
async function retryClosedTab(channel) {
  const pending = (await loadTabRetries())[channel];
  if (!pending) return;
  const problem = await runScan("đọc lại sau khi tab bị đóng", [channel]);
  if (problem === BUSY_TEXT) {
    const retryAt = new Date(Date.now() + TAB_RETRY_BUSY_MINUTES * 60000).toISOString();
    await scheduleTabRetry(channel, { ...pending, retryAt });
    return;
  }
  if ((await loadTabRetries())[channel]) await clearTabRetry(channel);
}

/**
 * Chrome bỏ báo thức khi extension nạp lại (lên bản) và có khi cả lúc mở lại Chrome. Kênh còn chờ đọc lại
 * thì hẹn lại; giờ đọc lại đã qua thì đọc sau một phút.
 */
async function rearmTabRetries() {
  const now = Date.now();
  for (const [channel, pending] of Object.entries(await loadTabRetries())) {
    if (await chrome.alarms.get(retryAlarmName(channel))) continue;
    const when = Math.max(Date.parse(pending.retryAt) || 0, now + TAB_RETRY_BUSY_MINUTES * 60000);
    await scheduleTabRetry(channel, { ...pending, retryAt: new Date(when).toISOString() });
  }
}

/** Giờ quét ổn gần nhất đã lưu của kênh; bản cũ chưa ghi `okAt` thì lượt cuối ổn là giờ ổn. */
async function lastOkAt(channel) {
  const s = (await loadStatus())[channel];
  if (!s) return null;
  return s.okAt ?? (s.state === "ok" && s.hub?.ok !== false ? s.at ?? null : null);
}

// ---------- Huy hiệu trên biểu tượng ----------

async function setBadge(text) {
  await chrome.action.setBadgeText({ text });
  // Đỏ lỗi của bộ màu UrbanB; huy hiệu rỗng thì màu nền không hiện.
  await chrome.action.setBadgeBackgroundColor({ color: "#8c3226" });
}

/**
 * Số thông báo chưa đọc trên Hub (H-1264 a) kèm "!" (YC-158: số không còn che dấu) khi thu review chưa đủ
 * cấu hình, một kênh ĐANG BẬT không ổn hay gửi Hub hỏng (kênh đã tắt không tính), lượt quét hỏng giữa
 * chừng, hoặc chưa đăng nhập / hết phiên Hub. Lỗi ghi Sheet không còn (1.5.2).
 */
async function refreshBadge() {
  const [cfg, status, { quaySnap, scanCrash }] = await Promise.all([
    loadEffectiveConfig(),
    loadStatus(),
    chrome.storage.local.get(["quaySnap", "scanCrash"]),
  ]);
  const missing = Boolean(reviewMissingText(cfg.review));
  const bad = CHANNELS.some((ch) => {
    const s = status[ch];
    return cfg.enabled[ch] && s && (s.state !== "ok" || (s.hub && !s.hub.ok));
  });
  const session = quaySnap?.session;
  const hubProblem = session === "out" || session === "expired";
  const unread = session !== "expired" && quaySnap?.notifications?.state === "ok" ? quaySnap.notifications.unread : 0;
  await setBadge(badgeText({ unread, problem: missing || bad || hubProblem || Boolean(scanCrash) }));
}
