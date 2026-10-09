// Tiến trình nền: hẹn giờ, mở tab extranet trong nền, quét, chuẩn hoá, gửi về Google Sheet và Hub.

import {
  CHANNELS,
  CHANNEL_LABEL,
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
import { HubError, hubBatches, hubEndpoint, hubSummaryText, parseHubReply, sumHubReplies } from "./hub.js";
import { REMOTE_MANIFEST_URL, isNewer, parseRemoteVersion } from "./update.js";
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

async function schedule() {
  const cfg = await loadConfig();
  const minutes = Math.max(30, Math.round(Number(cfg.intervalHours || 6) * 60));
  await chrome.alarms.clear(ALARM);
  await chrome.alarms.create(ALARM, { delayInMinutes: 5, periodInMinutes: minutes });
  await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 30 });
}

chrome.runtime.onInstalled.addListener(schedule);
chrome.runtime.onStartup.addListener(schedule);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) runScan("hẹn giờ");
  if (alarm.name === UPDATE_ALARM) {
    reloadIfDiskNewer();
    checkRemoteVersion();
  }
});

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
    const res = await fetch(REMOTE_MANIFEST_URL, { cache: "no-store" });
    const latest = res.ok ? parseRemoteVersion(await res.text()) : null;
    if (latest) await chrome.storage.local.set({ update: { latest, at: new Date().toISOString() } });
  } catch {}
}

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
  if (msg?.type === "checkUpdate") {
    // Mở ô bật lên: người vừa chạy lệnh cập nhật thì nạp bản mới ngay (ô tự đóng), không chờ 30 phút.
    reloadIfDiskNewer();
    checkRemoteVersion().then(() => reply({ ok: true }));
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
    throw new Error(`Expedia chuyển sang ${at.path} thay vì trang review của chỗ nghỉ ${pid}. Kiểm lại mã Expedia trong cài đặt.`);
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
  const hub = await pingHub(cfg);
  if (!cfg.sheetUrl || !cfg.secret) {
    const entry = makeLogEntry({ stage: "gửi Sheet", error: "Chưa điền URL Sheet hoặc mã bí mật" });
    await queueLog(entry);
    return { ok: false, error: entry.message, ref: entry.ref, code: entry.code, hub };
  }
  try {
    return { ...(await postSheet(cfg, { action: "ping" })), hub };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e), ref: e.logEntry?.ref, code: e.logEntry?.code, hub };
  }
}

// ---------- Gửi lên Hub ----------

/** Một request tới Hub; lỗi mạng và 5xx thì thử lại như gửi Sheet. Token chỉ nằm trong header. */
async function postHub(cfg, body) {
  const url = hubEndpoint(cfg.hubUrl);
  return withRetry(
    async () => {
      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg.hubToken}` },
          body: JSON.stringify(body),
        });
      } catch (e) {
        throw new HubError(`Không gọi được Hub: ${e?.message ?? e}`, true);
      }
      return parseHubReply(res.status, await res.text());
    },
    { sleep },
  );
}

/** Chưa điền URL Hub ⇒ máy này không gửi Hub. Có URL mà thiếu token ⇒ báo lỗi để người cài thấy. */
function hubConfigured(cfg) {
  return !!String(cfg.hubUrl ?? "").trim();
}

/** Lỗi Hub thành dòng nhật ký (lên tab "Nhật ký lỗi" của Sheet như mọi lỗi khác). */
async function hubFailure(channel, error, detail) {
  const entry = makeLogEntry({ channel, stage: "gửi Hub", error, detail });
  await queueLog(entry);
  return entry;
}

/** Thử đường lên Hub bằng action "ping" (Hub không ghi gì). Không điền URL Hub ⇒ null. */
async function pingHub(cfg) {
  if (!hubConfigured(cfg)) return null;
  try {
    if (!cfg.hubToken) throw new HubError("Chưa điền Token Hub.", false);
    await postHub(cfg, { action: "ping" });
    return { ok: true };
  } catch (e) {
    const entry = await hubFailure("", e);
    return { ok: false, error: entry.message, ref: entry.ref, code: entry.code };
  }
}

/**
 * Gửi các bài của một kênh lên Hub, chia lô. Không bao giờ ném: kết quả (hoặc lỗi) nằm trong
 * trạng thái kênh, còn lượt gửi Sheet đi tiếp như cũ. Một lô hỏng thì dừng, các lô đã gửi vẫn giữ.
 */
async function sendHub(cfg, channel, reviews, at) {
  if (!hubConfigured(cfg)) return null;
  const replies = [];
  try {
    if (!cfg.hubToken) throw new HubError("Chưa điền Token Hub.", false);
    for (const body of hubBatches(reviews)) replies.push(await postHub(cfg, body));
  } catch (e) {
    const sentNote = replies.length ? ` (đã gửi ${replies.length} lô trước đó)` : "";
    const entry = await hubFailure(channel, `${e?.message ?? e}${sentNote}`);
    return { at, ok: false, text: entry.message, error: errorBrief(entry) };
  }
  const total = sumHubReplies(replies);
  let error = null;
  if (total.errors.length) {
    const detail = total.errors.slice(0, 5).map((x) => `#${x.index} ${x.key ?? ""} ${x.error ?? ""}`).join("\n");
    error = errorBrief(await hubFailure(channel, `${total.errors.length} bài Hub không nhận`, detail));
  }
  return { at, ok: !error, text: hubSummaryText(total), error };
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
  let hub = null;
  let stage = "mở tab";
  try {
    tab = await chrome.tabs.create({ url: "about:blank", active: false });
    stage = "quét";
    const result = await SCANNERS[channel](tab.id, cfg);
    // Không có kết quả nào (kể cả câu lỗi) ⇒ trang tự chuyển đi giữa lúc bộ quét đang chạy.
    if (!result) throw new Error(`Trang ${CHANNEL_LABEL[channel]} chuyển sang ${await tabPath(tab.id)} giữa lượt quét, không lấy được kết quả`);
    if (!result.ok) throw new Error(result.error ?? "Quét thất bại");

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

    // Hub trước Sheet: sendHub không ném, nên lỗi Hub không chặn Sheet và ngược lại.
    hub = await sendHub(cfg, channel, batch.reviews, startedAt);

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
      hub,
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
      hub,
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
  // Đỏ lỗi của bộ màu UrbanB; huy hiệu rỗng thì màu nền không hiện.
  await chrome.action.setBadgeBackgroundColor({ color: "#8c3226" });
}

/** "!" khi chưa điền đủ cài đặt, hoặc một kênh ĐANG BẬT không ổn hay gửi Hub hỏng. Kênh đã tắt không tính. */
async function refreshBadge() {
  const [cfg, status] = await Promise.all([loadConfig(), loadStatus()]);
  const missing = !cfg.sheetUrl || !cfg.secret || !cfg.hotel;
  const bad = CHANNELS.some((ch) => {
    const s = status[ch];
    return cfg.enabled[ch] && s && (s.state !== "ok" || (hubConfigured(cfg) && s.hub && !s.hub.ok));
  });
  await setBadge(missing || bad ? "!" : "");
}
