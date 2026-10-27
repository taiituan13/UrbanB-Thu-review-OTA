// Content script (thế giới ISOLATED) trên Hub UrbanB (hub.urbanb.vn, urbanb.xyz) — YC-156, YC-239.
//
// Hợp đồng với trang Hub (làn Hub dựng theo đúng như này; đổi gì phải báo điều phối trước). Bản đủ, có ví dụ:
// docs/hop-dong-hub-bridge.md.
//
// Chung:
// - Chạy là đặt `document.documentElement.dataset.urbanbExt = "<phiên bản>"`: trang biết máy đã cài.
// - Chỉ nhận tin có `event.source === window` và `event.origin === location.origin`, `data.source === "urbanb-hub"`.
//   Tin gửi trang đều qua `window.postMessage(…, location.origin)` và mang `source: "urbanb-ext"`.
// - Tệp này chỉ được nạp trên các gốc Hub manifest khai (content_scripts.matches); service worker kiểm lại gốc
//   của người gửi (env.js HUB_ORIGINS) trước khi quét.
// - Không tin nào có token, mã bí mật, URL Sheet, email, mã kết nối OTA, câu lỗi thô.
//
// Trạng thái máy (YC-156):
// - Trang gửi `{ source: "urbanb-hub", type: "ext:hello" }`. Tệp này trả (cả lúc vừa nạp, không chờ hỏi)
//   `{ source: "urbanb-ext", type: "ext:status", status }`, `status` theo quay/hub-quay.js extStatusOf.
// - H-1526 a: trang ở màn Cài extension (`/extension`) ⇒ service worker theo Hub của trang này và đồng bộ
//   ngay (quay/sw.js extStatus). Gốc trang service worker tự lấy từ người gửi, không lấy từ tin.
//
// Quét trước khi giao ca (YC-239, H-1996 a, H-1976 c):
// - Trang gửi `{ source: "urbanb-hub", type: "ext:scan", requestId, reuseOkWithinMinutes? }`. `requestId`: chuỗi
//   1–64 ký tự [A-Za-z0-9_-] do trang sinh; sai kiểu, quá dài, hay trùng một requestId đang chạy ⇒ bỏ qua, không trả
//   gì. `reuseOkWithinMinutes` (1.5.7, YC-246): kênh đã quét đạt trong ngần ấy phút thì dùng lại, không mở trang kênh;
//   số phút do Hub giữ, tệp này chỉ chuyển tiếp, service worker kiểm (shift-scan.js parseReuseMinutes).
// - `ext:scan-accepted` { requestId, mode, startedAt }: mode "started" (mở lượt mới) · "joined" (gắn vào lượt
//   mọi kênh đang chạy, không mở lượt thứ hai) · "queued" (lượt đang chạy chỉ quét vài kênh; chờ nó xong rồi mới
//   chạy, sau đó có thêm một ext:scan-accepted "started" hoặc "joined").
// - `ext:scan-progress` { requestId, channel, label, state, startedAt, finishedAt, count, code, ref, retryAt,
//   what, why, steps, reused? }: mỗi lần một kênh đổi trạng thái. state "running" | "ok" | "error" | "login".
//   `reused: true` ⇒ kênh đạt nhờ dùng lại lượt quét đạt lúc `finishedAt`, không quét lại.
// - `ext:scan-result` { requestId, outcome, startedAt, finishedAt, version, channels[], what, why, steps }: ĐÚNG
//   MỘT tin cho mỗi requestId đã nhận. outcome "done" | "not-configured" | "failed" | "interrupted". Mỗi phần tử
//   `channels` cùng dạng ext:scan-progress, state "ok" | "error" | "login" | "not-run". Chỉ "ok" là đạt.
// - Tab quét bị đóng ⇒ kênh ấy "error", code "<KÊNH>-TAB" ngay, kèm `retryAt` (lần đọc lại máy vẫn tự hẹn).
// - Trang đóng hay tải lại giữa chừng ⇒ lượt quét vẫn chạy hết và vẫn báo Hub như lượt quét thường.
(() => {
  if (globalThis.__urbanbHubBridge) return;
  globalThis.__urbanbHubBridge = true;
  const version = chrome.runtime.getManifest().version;
  document.documentElement.dataset.urbanbExt = version;

  const ask = () =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: "quay:extStatus", path: location.pathname }, (r) => {
          void chrome.runtime.lastError;
          resolve(r?.ok ? r.status : null);
        });
      } catch {
        resolve(null); // extension vừa nạp lại: trang cũ mất kết nối với service worker
      }
    });

  // Một lượt hỏi một lúc. Trang hỏi trong lúc đang hỏi (ví dụ vừa chuyển sang /extension) ⇒ hỏi thêm một lượt.
  let busy = false;
  let again = false;
  async function answer() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        const status = await ask();
        if (status) window.postMessage({ source: "urbanb-ext", type: "ext:status", status }, location.origin);
      } while (again);
    } finally {
      busy = false;
    }
  }

  // ---------- ext:scan (YC-239) ----------

  // Cùng giá trị với shift-scan.js (SCAN_PORT, REQUEST_ID_MAX): content script không nhập được module.
  const SCAN_PORT = "urbanb-hub-scan";
  const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
  const FROM_WORKER = new Set(["ext:scan-accepted", "ext:scan-progress", "ext:scan-result"]);
  /** requestId đang chờ kết quả. */
  const active = new Set();

  const post = (msg) => window.postMessage({ ...msg, source: "urbanb-ext" }, location.origin);

  function scan(requestId, reuseOkWithinMinutes) {
    active.add(requestId);
    let finished = false;
    const finish = (msg) => {
      if (finished) return;
      finished = true;
      active.delete(requestId);
      post(msg);
    };
    // Mất kết nối trước khi có kết quả (extension nạp lại, lên bản) ⇒ vẫn trả đúng một kết quả để trang khỏi chờ mãi.
    const lost = () =>
      finish({
        type: "ext:scan-result",
        requestId,
        outcome: "interrupted",
        startedAt: null,
        finishedAt: new Date().toISOString(),
        version,
        channels: [],
        what: null,
        why: null,
        steps: [],
      });
    let port;
    try {
      port = chrome.runtime.connect({ name: SCAN_PORT });
    } catch {
      lost();
      return;
    }
    port.onMessage.addListener((m) => {
      if (finished || !m || m.requestId !== requestId || !FROM_WORKER.has(m.type)) return;
      if (m.type !== "ext:scan-result") {
        post(m);
        return;
      }
      finish(m);
      try {
        port.disconnect();
      } catch {}
    });
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      lost();
    });
    try {
      port.postMessage({ type: "ext:scan", requestId, reuseOkWithinMinutes });
    } catch {
      lost();
    }
  }

  window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const d = e.data;
    if (!d || d.source !== "urbanb-hub") return;
    if (d.type === "ext:hello") {
      answer();
      return;
    }
    if (d.type === "ext:scan") {
      const id = d.requestId;
      if (typeof id !== "string" || !REQUEST_ID_RE.test(id) || active.has(id)) return;
      scan(id, d.reuseOkWithinMinutes);
    }
  });
  answer();
})();
