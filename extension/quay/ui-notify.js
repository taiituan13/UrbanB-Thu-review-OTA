// Phần cắm "Thông báo" của khung UrbanB tại quầy: chip chưa đọc cạnh nút gập, danh sách trong khung
// (thay chỗ nội dung tab), thông báo nổi trượt từ mép trên xuống, nút Đã đọc từng dòng.
//
// Luật nằm ở notifications.js (có test). Tệp này chỉ vẽ và nối sự kiện. Bố cục theo mockup v2
// (repo UrbanB: .design-sync/proto-extension-quay.html, khối .qchip · .qn · .qtoast).

import * as H from "./hub-quay.js";
import * as N from "./notifications.js";

const SEEN_KEY = "quayNotiSeen";

const BELL =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
const PIN =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/></svg>';

export const NOTIFY_CSS = `
.qchip{height:38px;display:inline-flex;align-items:center;gap:7px;padding:0 6px 0 12px;border-radius:20px;background:var(--surface);border:1px solid var(--border);
  color:var(--fg);font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.18);white-space:nowrap}
.qz .qchip{color:var(--fg)}
.qchip .n{min-width:24px;height:24px;border-radius:12px;background:var(--destructive);color:#fff;font-size:12.5px;line-height:24px;text-align:center;padding:0 7px;font-variant-numeric:tabular-nums}
.qz .qchip[aria-expanded="true"]{background:var(--fg);color:var(--fg-on);border-color:var(--fg)}
.qchip[aria-expanded="true"] .n{background:var(--fg-on);color:var(--fg)}
.qchip.bump{animation:qbump .5s ease-out}
@keyframes qbump{0%{transform:scale(1)}35%{transform:scale(1.12)}100%{transform:scale(1)}}
.qn-head{display:flex;align-items:center;gap:8px}
.qn-head .h{font:600 16px/1.3 var(--font-display);flex:1}
.qn-head button{font-size:12.5px;text-decoration:underline;color:var(--fg)}
.qn{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 11px;display:flex;gap:10px;align-items:flex-start;width:100%}
.qn.unread{border-left:4px solid var(--destructive);padding-left:8px}
.qn.read{background:var(--surface-soft);color:var(--muted-fg)}
.qn .ic{width:28px;height:28px;border-radius:7px;background:var(--surface-soft);display:flex;align-items:center;justify-content:center;flex:none;color:var(--fg)}
.qn .tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;text-decoration:none;color:inherit}
.qn a.tx:hover .t{text-decoration:underline}
.qn .t{font-weight:600;font-size:13.5px;line-height:1.35;overflow-wrap:anywhere}
.qn.read .t{font-weight:500}
.qn .b{font-size:12.5px;overflow-wrap:anywhere}
.qn .m{font-size:12px;color:var(--muted-fg);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.qn .new{font-size:11px;font-weight:700;color:var(--destructive);text-transform:uppercase;letter-spacing:.03em}
.qn .pin{display:inline-flex;align-items:center;gap:3px;font-weight:600;color:var(--fg)}
.qn .rd{flex:none;height:32px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);font-size:12.5px;font-weight:600;white-space:nowrap}
.qn .rd:hover{border-color:var(--accent)}
.qn .rd[disabled]{opacity:.6;cursor:default}
.qtoast{position:fixed;left:50%;top:6px;width:460px;max-width:calc(100vw - 32px);z-index:2147483002;transform:translate(-50%,0);transition:transform .28s cubic-bezier(.2,.8,.2,1),opacity .28s;
  background:var(--surface);color:var(--fg);border:1px solid var(--border);border-left:4px solid var(--destructive);border-radius:12px;
  box-shadow:0 12px 30px -10px rgba(0,0,0,.5);display:flex;gap:10px;align-items:center;padding:7px 6px 9px 10px;overflow:hidden;font-family:var(--font-body)}
.qtoast.off{transform:translate(-50%,-150%);opacity:0}
.qtoast .ic{width:28px;height:28px;border-radius:7px;background:var(--surface-soft);display:flex;align-items:center;justify-content:center;flex:none}
.qtoast .tx{flex:1;min-width:0;display:flex;flex-direction:column}
.qtoast .t{font-size:13px;font-weight:600;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qtoast .b{font-size:12.5px;line-height:1.35;color:var(--muted-fg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.qz .qtoast .v{height:32px;padding:0 12px;border-radius:8px;background:var(--fg);color:var(--fg-on);font-weight:600;font-size:12.5px;flex:none}
.qtoast .x{width:32px;height:32px;border-radius:8px;font-size:18px;line-height:32px;text-align:center;color:var(--muted-fg);flex:none}
.qtoast .x:hover{background:var(--surface-soft)}
.qtoast .bar{position:absolute;left:0;bottom:0;height:3px;background:var(--destructive);opacity:.55}
`;

/** Dựng phần cắm. Trả đối tượng plugin theo giao ước của ui.js `mount({ plugins })`. */
export function notifyPlugin() {
  let api = null;
  const T = {
    state: "unknown", // unknown · ok · out · unavailable · net · server
    items: [],
    unread: 0,
    me: "",
    toastSeconds: N.TOAST_SECONDS_DEFAULT,
    seen: null, // Set id đã bắn nổi; null = chưa đọc từ bộ nhớ
    firstRun: false,
    toast: null, // { id, more, left, total }
    hover: false,
    bump: false,
    busy: new Set(),
    error: "",
  };
  let toastTimer = null;
  let pollTimer = null;

  const listOpen = () => Boolean(api?.S.open && api.S.overlay === "noti");
  const session = () => api?.session();
  // Hub chưa dựng route ⇒ ẩn cả tính năng. Chưa đăng nhập ⇒ ẩn (khung đã nhắc đăng nhập).
  const enabled = () => T.state !== "unavailable" && T.state !== "unknown" && session() !== "out";
  const hubHref = (path) => {
    const p = String(path ?? "");
    return (api?.origin() ?? "") + (p.startsWith("/") && !p.startsWith("//") ? p : "/notifications");
  };

  async function loadSeen() {
    try {
      const got = await chrome.storage.local.get(SEEN_KEY);
      T.firstRun = !Array.isArray(got[SEEN_KEY]);
      T.seen = new Set(got[SEEN_KEY] ?? []);
    } catch {
      T.firstRun = true;
      T.seen = new Set();
    }
  }

  async function saveSeen(items) {
    const next = N.rememberSeen([...T.seen], items);
    T.seen = new Set(next);
    T.firstRun = false;
    try {
      await chrome.storage.local.set({ [SEEN_KEY]: next });
    } catch {}
  }

  async function poll() {
    const s = session();
    // Hết phiên (H-1245 a): thông báo dừng. Chưa đăng nhập: không hỏi.
    if (s === "out" || s === "expired" || !s) return;
    const r = await api.send({ type: "quay:notifications" });
    if (!r || !r.state) return;
    T.state = r.state;
    if (r.state === "out" || r.state === "expired") {
      if (api.S.view) api.S.view.session = r.session ?? r.state;
      api.render();
      return;
    }
    if (r.state !== "ok") return api.render();
    const before = T.unread;
    T.items = r.items;
    T.unread = r.unread;
    T.me = r.me?.name ?? "";
    T.toastSeconds = r.toastSeconds;
    if (!T.seen) await loadSeen();
    const queue = N.toastQueue(T.items, T.seen, { firstRun: T.firstRun, listOpen: listOpen() });
    await saveSeen(T.items.filter((n) => !n.readAt));
    if (T.unread > before) T.bump = true;
    if (queue.length) showToast(queue[0], queue.length - 1);
    else api.render();
  }

  function schedule() {
    clearInterval(pollTimer);
    pollTimer = setInterval(() => document.visibilityState === "visible" && poll(), N.NOTIFICATIONS_POLL_MS);
  }

  // ---------- thông báo nổi ----------

  function showToast(item, more) {
    clearInterval(toastTimer);
    const total = N.toastTimeoutMs(item, T.toastSeconds);
    T.toast = { id: item.id, more, left: total, total, phase: "in" };
    api.render();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!T.toast) return;
        T.toast.phase = "shown";
        api.root.querySelector(".qtoast")?.classList.remove("off");
      }),
    );
    if (total === null) return; // H-1344: ghim ⇒ không tự ẩn, phải bấm × hoặc Xem.
    toastTimer = setInterval(() => {
      if (!T.toast || T.hover) return;
      T.toast.left -= 100;
      const bar = api.root.querySelector(".qtoast .bar");
      if (bar) bar.style.width = Math.max(0, (100 * T.toast.left) / T.toast.total) + "%";
      if (T.toast.left <= 0) hideToast();
    }, 100);
  }

  function hideToast() {
    clearInterval(toastTimer);
    if (!T.toast) return;
    T.toast.phase = "out";
    api.root.querySelector(".qtoast")?.classList.add("off");
    setTimeout(() => {
      T.toast = null;
      T.hover = false;
      api.render();
    }, 320);
  }

  // ---------- Đã đọc ----------

  async function read(ids) {
    for (const id of ids) T.busy.add(id);
    T.error = "";
    api.render();
    const r = await api.send({ type: "quay:notiRead", ids });
    for (const id of ids) T.busy.delete(id);
    if (r?.ok) {
      T.items = N.markRead(T.items, ids, new Date().toISOString());
      T.unread = Number.isInteger(r.unread) ? r.unread : T.items.filter((n) => !n.readAt).length;
    } else if (r?.state === "out") {
      T.error = "Phiên đăng nhập Hub đã hết, chưa ghi được Đã đọc. Đăng nhập lại rồi bấm lại.";
    } else {
      T.error = "Không ghi được Đã đọc lên Hub. Kiểm tra mạng rồi bấm lại.";
    }
    api.render();
  }

  // ---------- vẽ ----------

  function rowHTML(n) {
    const esc = api.esc;
    const pin = n.sticky && !n.readAt ? `<span class="pin">${PIN}Ghim</span>` : "";
    const state = n.readAt ? "<span>Đã đọc</span>" : `<span class="new">Chưa đọc</span>`;
    const text = `<span class="t">${esc(n.title)}</span>${n.body ? `<span class="b">${esc(n.body)}</span>` : ""}
      <span class="m">${pin}${n.from ? `<span>${esc(n.from)}</span>` : ""}<span>${esc(N.whenText(n.createdAt, new Date()))}</span>${state}</span>`;
    // Bấm tiêu đề mở trên Hub; mở KHÔNG tính là đã đọc (H-1263 b): phải bấm nút Đã đọc.
    const tx = n.url ? `<a class="tx" href="${esc(hubHref(n.url))}" target="_blank" rel="noopener" title="Mở trên Hub">${text}</a>` : `<span class="tx">${text}</span>`;
    const btn = n.readAt ? "" : `<button class="rd" data-act="notiRead" data-id="${esc(n.id)}"${T.busy.has(n.id) ? " disabled" : ""}>${T.busy.has(n.id) ? "Đang ghi…" : "Đã đọc"}</button>`;
    return `<div class="qn ${n.readAt ? "read" : "unread"}" data-noti="${esc(n.id)}"><span class="ic">${BELL}</span>${tx}${btn}</div>`;
  }

  function listHTML() {
    if (session() === "expired") return api.note(H.expiredNotificationsNote());
    if (T.state === "net" || T.state === "server")
      return `<div class="cb-note bad"><span class="t">Không gọi được Hub.</span><span>Danh sách thông báo chưa tải được. Khung tự thử lại mỗi phút.</span><div class="bt"><button class="cb-btn2" data-act="notiRetry">Thử lại</button></div></div>`;
    const esc = api.esc;
    const u = T.unread;
    const all = N.SWITCHES.readAll && u ? `<button data-act="notiReadAll">Đánh dấu đã đọc hết</button>` : "";
    const err = T.error ? `<div class="qban bad" role="status">${esc(T.error)}<button data-act="notiErrX">Ẩn</button></div>` : "";
    const rows = N.sortForList(T.items);
    const empty = rows.length ? "" : `<div class="ota-muted">Chưa có thông báo nào.</div>`;
    return `<div class="qn-head"><span class="h">Thông báo${u ? ` · ${u} chưa đọc` : ""}</span>${all}</div>
      <div class="ota-muted">Bấm tiêu đề để mở trên Hub. Đọc xong, bấm Đã đọc để bỏ khỏi số chưa đọc.</div>
      ${err}${empty}${rows.map(rowHTML).join("")}`;
  }

  return {
    init(a) {
      api = a;
      const style = document.createElement("style");
      style.textContent = NOTIFY_CSS;
      api.root.prepend(style);
      api.root.addEventListener("mouseover", (e) => {
        T.hover = Boolean(e.target.closest?.(".qtoast"));
      });
      api.root.addEventListener("mouseout", (e) => {
        if (e.target.closest?.(".qtoast") && !e.relatedTarget?.closest?.(".qtoast")) T.hover = false;
      });
    },
    onState() {
      poll();
      schedule();
    },
    dockBefore() {
      if (!enabled()) return "";
      const open = listOpen();
      const c = N.chipModel(T.unread, open);
      if (!c) return "";
      const html = `<button class="qchip${T.bump ? " bump" : ""}" data-act="notiChip" aria-expanded="${open}" aria-label="${api.esc(c.aria)}">${BELL}<span>${c.label}</span>${c.n ? `<span class="n">${c.n}</span>` : ""}</button>`;
      T.bump = false;
      return html;
    },
    headerButton() {
      if (!enabled()) return "";
      return `<button data-act="notiToggle">${listOpen() ? "Đóng thông báo" : "Tất cả thông báo"}</button>`;
    },
    body() {
      return api.S.overlay === "noti" ? listHTML() : null;
    },
    footer() {
      if (api.S.overlay !== "noti" || session() === "expired") return null;
      const who = T.me ? `Thông báo của ${api.esc(T.me)} trên Hub` : "Thông báo của bạn trên Hub";
      return `<div class="qf-ft"><span class="sp">${who}</span><a href="${api.esc(hubHref("/notifications"))}" target="_blank" rel="noopener">Mọi thông báo trên Hub ↗</a></div>`;
    },
    overlayHTML() {
      if (!T.toast || !enabled()) return "";
      const n = T.items.find((x) => x.id === T.toast.id);
      if (!n) return "";
      const esc = api.esc;
      const pct = T.toast.total === null ? 0 : Math.max(0, (100 * T.toast.left) / T.toast.total);
      const more = T.toast.more ? ` · và ${T.toast.more} thông báo mới khác` : "";
      const sub = [n.from, n.body].filter(Boolean).join(" · ") + more;
      return `<div class="qtoast${T.toast.phase === "shown" ? "" : " off"}" role="status" aria-live="polite">
        <span class="ic">${n.sticky ? PIN : BELL}</span><span class="tx"><span class="t">${esc(n.title)}</span><span class="b">${esc(sub)}</span></span>
        <button class="v" data-act="notiToastView">Xem</button><button class="x" data-act="notiToastClose" aria-label="Đóng thông báo">×</button>
        ${T.toast.total === null ? "" : `<span class="bar" style="width:${pct}%"></span>`}</div>`;
    },
    onAction(a, el) {
      if (a === "notiChip" || a === "notiToggle") {
        if (listOpen()) {
          api.S.overlay = null;
          api.render();
        } else {
          if (T.toast) hideToast();
          api.openFrame("noti");
          poll();
        }
        return true;
      }
      if (a === "notiRead") {
        read([el.dataset.id]);
        return true;
      }
      if (a === "notiReadAll") {
        if (N.SWITCHES.readAll) read(T.items.filter((n) => !n.readAt).map((n) => n.id));
        return true;
      }
      if (a === "notiToastClose") {
        // Đóng thông báo nổi KHÔNG tính là đã đọc (H-1263 b): số trên chip giữ nguyên.
        hideToast();
        return true;
      }
      if (a === "notiToastView") {
        clearInterval(toastTimer);
        T.toast = null;
        api.openFrame("noti");
        return true;
      }
      if (a === "notiRetry") {
        poll();
        return true;
      }
      if (a === "notiErrX") {
        T.error = "";
        api.render();
        return true;
      }
      return false;
    },
    /** Cho bản dựng đo đọc trạng thái; không dùng trong sản phẩm. */
    _state: T,
  };
}

