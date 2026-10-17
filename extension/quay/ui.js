// Khung "UrbanB tại quầy" trên PMS ezCloud: một nút gập ở góc phải dưới, một khung 560px ba tab
// (Booking OTA · Khoá G2J · Chỉ báo). Chạy trong content script (thế giới ISOLATED), vẽ trong Shadow
// DOM. Không gọi mạng: mọi lượt gọi nhắn cho service worker (quay/sw.js).
//
// Bố cục theo mockup v2 (repo UrbanB: .design-sync/proto-extension-quay.html). Thẻ booking và bảng khoá
// giữ bố cục userscript 3.2.0, chỉ đổi màu sang lớp thương hiệu UrbanB.

import * as B from "./booking-ota.js";
import * as H from "./hub-quay.js";
import * as I from "./indicators.js";
import { QUAY_CSS } from "./ui-css.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const ICON_PATHS = {
  hourly: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  overnight: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  daily: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  avail: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  warn: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
};
export function icon(name) {
  return `<svg class="ota-i ota-i-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] ?? ICON_PATHS.lock}</svg>`;
}

const chip = (label, status) => `<span class="ota-chip ota-${B.chipClass(status)}">${label}: ${esc(status || "-")}</span>`;

const send = (msg) =>
  new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? { ok: false, error: chrome.runtime.lastError.message } : r));
    } catch (e) {
      resolve({ ok: false, error: String(e?.message ?? e) });
    }
  });

/**
 * Gắn khung vào trang. `bridge` = cầu do bridge.js dựng: `{ hotelId, onHotel(fn) }`.
 * `plugins` = phần cắm thêm (thông báo: quay/ui-notify.js), mỗi phần có thể có
 * `{ init(api), dockBefore(), headerButton(), body(), footer(), onState() }`.
 */
export function mount({ bridge, plugins = [] } = {}) {
  const host = document.createElement("div");
  host.id = "urbanb-quay";
  host.setAttribute("data-urbanb-quay", "");
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = QUAY_CSS;
  const wrap = document.createElement("div");
  wrap.className = "qz";
  root.append(style, wrap);
  (document.body || document.documentElement).appendChild(host);

  const S = {
    hotelId: bridge?.hotelId || "",
    view: null, // lời đáp quay:hello
    open: false,
    tab: "bookings",
    q: "",
    booking: null, // { ok, matches, at, error, codeState, cached, loading }
    board: null,
    ind: null, // lời đáp quay:indicators
    lockBan: null,
    note: null, // lời báo đẩy token
    hello: false,
  };

  const api = {
    S,
    root,
    wrap,
    send,
    render: () => render(),
    esc,
    session: () => S.view?.session ?? null,
    origin: () => S.view?.origin ?? "",
    openFrame(body) {
      S.open = true;
      S.overlay = body ?? null;
      render();
    },
  };
  for (const p of plugins) p.init?.(api);

  // ---------- tải dữ liệu ----------

  async function hello() {
    S.view = await send({ type: "quay:hello", hotelId: S.hotelId });
    S.hello = true;
    const c = S.view?.cache;
    if (c?.bookings && !S.booking) S.booking = { ok: true, matches: c.bookings.matches, at: c.bookings.at, cachedOnly: true };
    if (c?.board && !S.board) S.board = { ok: true, result: c.board.result, at: c.board.at, cachedOnly: true };
    if (c?.indicators && !S.ind) S.ind = { state: "ok", data: c.indicators.data, at: c.indicators.at, cachedOnly: true };
    render();
    for (const p of plugins) p.onState?.();
  }

  const canBook = () => {
    const v = S.view;
    if (!v || !S.hotelId) return false;
    if (v.session === "ok" || v.session === "expired") return true;
    return H.UNREACHABLE.has(v.session) && Boolean(v.branch);
  };
  const canIndicators = () => S.view && S.hotelId && S.view.session === "ok";

  async function loadBookings() {
    if (!canBook()) return;
    S.booking = { ...(S.booking ?? {}), loading: true };
    render();
    const r = await send({ type: "quay:bookings", hotelId: S.hotelId, q: S.q });
    S.booking = { ...r, q: S.q, loading: false };
    if (r.session && S.view && r.session !== S.view.session && (r.session === "expired" || r.session === "out")) S.view.session = r.session;
    render();
  }

  async function loadBoard() {
    if (!canBook()) return;
    S.board = { ...(S.board ?? {}), loading: true };
    render();
    S.board = { ...(await send({ type: "quay:board", hotelId: S.hotelId })), loading: false };
    render();
  }

  async function loadIndicators() {
    if (!canIndicators()) return;
    const r = await send({ type: "quay:indicators", hotelId: S.hotelId });
    if (r.state === "ok") S.ind = r;
    else {
      if (r.state === "out" || r.state === "expired") S.view.session = r.state;
      if (r.state === "nobranch") {
        S.view.session = "nobranch";
        S.view.why = r.why;
      }
      S.ind = { ...r, data: r.cached?.data ?? S.ind?.data ?? null, at: r.cached?.at ?? S.ind?.at ?? null };
    }
    render();
  }

  let bookTimer = null;
  let indTimer = null;
  function refreshAll() {
    loadBookings();
    loadBoard();
    loadIndicators();
    clearTimeout(bookTimer);
    bookTimer = setTimeout(() => S.open && refreshAll(), B.AUTO_REFRESH_MS);
  }
  function scheduleIndicators() {
    clearInterval(indTimer);
    indTimer = setInterval(() => document.visibilityState === "visible" && loadIndicators(), H.INDICATORS_REFRESH_MS);
  }

  async function start() {
    await hello();
    loadBookings(); // số trên nút gập lúc tải trang (userscript: loadRecent)
    loadIndicators();
    scheduleIndicators();
  }

  bridge?.onHotel?.((id) => {
    if (!id || id === S.hotelId) return;
    S.hotelId = id;
    S.booking = null;
    S.board = null;
    S.ind = null;
    start();
  });

  // Tin từ service worker: lời báo đẩy token (userscript: notify).
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== "quay:tokenNote") return;
    const label = B.TOKEN_KINDS[msg.kind]?.label ?? "";
    S.note = { tone: msg.tone, text: `Booking OTA · token ${label}: ${msg.text}${msg.hotel ? " (" + msg.hotel + ")" : ""}`, at: Date.now() };
    render();
    setTimeout(() => {
      if (S.note && Date.now() - S.note.at >= 4900) {
        S.note = null;
        render();
      }
    }, msg.tone === "ok" ? 5000 : 10000);
  });

  // Userscript 3.2.0 còn chạy trong Tampermonkey ⇒ popup hiện dải nhắc tắt (nút cam #ota-fab).
  setTimeout(() => send({ type: "quay:tm", present: Boolean(document.getElementById("ota-fab")) }), 4000);

  // ---------- vẽ ----------

  function blocked() {
    const v = S.view;
    if (!v) return null;
    // Chưa đọc được mã khách sạn từ PMS ⇒ chưa biết cơ sở, dù phiên Hub còn hay đã hết.
    const noHotel = !S.hotelId && v.session !== "out";
    return H.blockedNote({
      session: noHotel ? "nobranch" : v.session,
      why: noHotel ? "wait" : v.why,
      hotelId: S.hotelId,
      branchName: v.branch?.name,
      hasCache: Boolean(v.branch),
    });
  }

  function note(n) {
    if (!n) return "";
    const login = n.login ? `<div class="bt"><a class="cb-btn" href="${esc(S.view?.origin + H.LOGIN_PATH)}" target="_blank" rel="noopener" data-act="login">${esc(n.loginLabel ?? "Đăng nhập Hub")}</a></div><span class="mut2">Mở trang đăng nhập Hub trong tab mới.</span>` : "";
    const retry = n.retry ? `<div class="bt"><button class="cb-btn2" data-act="retry">Thử lại</button></div>` : "";
    return `<div class="cb-note ${n.tone ?? ""}"><span class="t">${esc(n.title)}</span><span>${esc(n.text)}</span>${login}${retry}</div>`;
  }

  function bookingCard(m) {
    const lock = B.canLock(m)
      ? `<div class="ota-row" style="margin:6px 0 0"><button class="ota-btn" data-act="lock" data-key="${esc(m.sourceKey)}">Khoá G2J</button><span class="ota-muted">Khoá cả loại phòng trên Go2Joy trong khung giờ này</span></div>`
      : "";
    return `<div class="ota-card" data-booking="${esc(m.sourceKey)}">
      <div class="ota-t"><span>${esc(m.source)} | ${esc(m.bookingNumber)} | ${esc(m.guestName)}${m.guestPhone ? " | " + esc(m.guestPhone) : ""}</span>
        <span style="white-space:nowrap">${chip("EZ", m.ezCloud?.status)}${chip("G2J", m.go2Joy?.lockStatus)}${m.roomAssigned?.confirmed ? chip("Phòng", "OK") : ""}</span></div>
      <div class="ota-m">${esc(m.roomType)} | ${esc(m.bookingType)} | ${esc(m.checkIn)} đến ${esc(m.checkOut)} | ${B.fmtVnd(m.paymentAmount)} ${esc(m.paymentStatus || "")}</div>
      ${m.ezCloud?.reservationRoomId ? `<div class="ota-m">EZCloud ReservationRoomId ${esc(m.ezCloud.reservationRoomId)} | ReservationId ${esc(m.ezCloud.reservationId)}</div>` : ""}
      ${m.go2Joy?.lockMessage ? `<div class="ota-m">${esc(m.go2Joy.lockMessage)}</div>` : ""}
      ${m.ezCloud?.status === "ERROR" ? `<div class="ota-m bad">${esc(m.ezCloud.message)}</div>` : ""}
      ${lock}</div>`;
  }

  function codeProblem(r) {
    const name = S.view?.branch?.name;
    if (r?.codeState === "none") return note(H.noCodeNote(name));
    if (r?.codeState === "rejected") return note(H.rejectedCodeNote(name, r.error));
    return "";
  }

  function bookingsTab() {
    const b = S.booking;
    const ban = S.lockBan ? `<div class="qban ${S.lockBan.ok ? "ok" : "bad"}" role="status">${esc(S.lockBan.text)}<button data-act="lockBanX">Ẩn</button></div>` : "";
    const tok = S.note && S.open ? `<div class="qban ${S.note.tone === "ok" ? "ok" : S.note.tone === "warn" ? "warn" : "bad"}" role="status">${esc(S.note.text)}<button data-act="noteX">Ẩn</button></div>` : "";
    const search = `<div class="qsearch"><input data-k="q" placeholder="Tìm theo số booking, tên khách, mã EZCloud..." value="${esc(S.q)}"><button class="ota-btn" data-act="search">Tìm</button></div>`;
    if (!b) return `${ban}${tok}${search}<div class="ota-muted">Đang tải...</div>`;
    const problem = b.ok === false ? codeProblem(b) || `<div class="ota-card err">${esc(b.error)}</div>` : "";
    const matches = b.ok === false ? b.cached?.matches ?? null : b.matches ?? [];
    let list = "";
    if (matches) {
      const sorted = B.sortForCounter(matches);
      const issues = B.countIssues(matches);
      const lead = b.q
        ? `<div class="ota-muted">${matches.length ? `${matches.length} booking khớp "${esc(b.q)}".` : `Không có booking khớp "${esc(b.q)}".`}</div>`
        : matches.length
          ? `<div class="ota-muted">Booking cần xử lý đứng đầu. ${issues} booking lỗi · ${matches.length} booking gần đây.${b.ok === false ? ` Danh sách của lượt ${H.hhmm(b.cached?.at)}.` : ""}</div>`
          : `<div class="ota-muted">Không có booking gần đây.</div>`;
      list = `${lead}<div class="${b.ok === false ? "cb-stale" : ""}" style="display:flex;flex-direction:column;gap:8px">${sorted.map(bookingCard).join("")}</div>`;
    }
    const loading = b.loading ? `<div class="ota-muted">Đang tải...</div>` : "";
    return `${ban}${tok}${problem}${search}${loading}${list}`;
  }

  function boardTab() {
    const b = S.board;
    const legend = `<div class="ota-legend"><span><i style="background:#E8F7F0"></i>còn 2+ phòng</span><span><i style="background:#FFFBEB"></i>còn 1</span><span><i style="background:#FDECEB"></i>hết phòng</span>
      <span>${icon("hourly")} khoá theo giờ</span><span>${icon("overnight")} khoá qua đêm</span><span>${icon("daily")} khoá theo ngày</span><span>${icon("avail")} booking OTA còn phòng, chưa khoá</span><span>${icon("warn")} khoá không khớp loại phòng</span></div>`;
    if (!b || (b.loading && !b.result)) return `${legend}<div class="ota-muted">Đang tải...</div>`;
    const res = b.ok === false ? b.cached?.result : b.result;
    const problem = b.ok === false ? codeProblem(b) || `<div class="ota-card err">${esc(b.error)}</div>` : "";
    if (!res) return `${problem}${legend}`;
    const m = B.boardModel(res.occupancy, res.locks, B.localDate(new Date()));
    if (m.error) return `${problem}${legend}<div class="ota-card err">${esc(m.error)}</div>`;
    const head = `<tr><th class="rt">Loại phòng</th>${m.days.map((d) => `<th class="${d.today ? "ota-today" : ""}">${d.label}<br><span style="font-weight:400">${d.weekday}</span></th>`).join("")}</tr>`;
    const rows = m.rows
      .map(
        (r) =>
          `<tr><td class="ota-rt" title="${esc(r.rooms)}">${esc(r.name)} <span class="ota-muted">(${esc(r.total)})</span></td>${r.cells
            .map((c) => `<td class="ota-${c.cls}" title="${esc(c.tip)}"><div class="ota-n">${esc(c.n)}</div><div class="ota-ic">${c.icons.map(icon).join("")}</div></td>`)
            .join("")}</tr>`,
      )
      .join("");
    const warn = m.warn ? `<div class="ota-card" style="color:#B45309">${icon("warn")} ${esc(m.warn)}</div>` : "";
    const stale = b.ok === false ? `<div class="ota-muted">Bảng của lượt ${H.hhmm(b.cached?.at)}.</div>` : "";
    return `${problem}${legend}<div class="ota-scroll ${b.ok === false ? "cb-stale" : ""}"><table class="ota-board">${head}${rows}</table></div>${warn}<div class="ota-muted">${esc(m.meta)}</div>${stale}`;
  }

  function indModel() {
    return S.ind?.data ? I.indicatorsModel(S.ind.data, B.localDate(new Date())) : null;
  }

  function caseHTML(c, origin) {
    const tint = c.mark === "warning" ? "cbf" : c.mark === "notice" ? "cyf" : "";
    const lvCls = c.mark === "warning" ? "cb" : c.mark === "notice" ? "cy" : "ov";
    return `<a class="cb-case ${tint}" href="${esc(H.caseUrl(origin, c.id))}" target="_blank" rel="noopener" title="Xem chi tiết ${esc(c.name)} trên Hub">
      <div class="id"><span class="nm"><span class="no">${esc(c.no)}</span>${esc(c.name)}</span>${c.markLabel ? `<span class="lv ${lvCls}">${esc(c.markLabel)}</span>` : ""}</div>
      ${c.main ? `<div class="main">${esc(c.main)}</div>` : ""}
      <div class="chips"><span class="tag ol">${esc(c.day)}</span>${c.chips.map((x) => `<span class="tag">${esc(x)}</span>`).join("")}</div>
      ${c.todo ? `<div class="todo"><span class="k">Việc cần làm:</span><span>${esc(c.todo)}</span></div>` : ""}</a>`;
  }

  function cbTab() {
    const v = S.view;
    if (v?.session === "expired") return note(H.expiredIndicatorsNote());
    const m = indModel();
    if (!m) return S.ind && S.ind.state !== "ok" ? `<div class="cb-note bad"><span class="t">Không gọi được Hub.</span><span>${esc(S.ind.message ?? "")} Khung tự thử lại.</span><div class="bt"><button class="cb-btn2" data-act="retryInd">Thử lại</button></div></div>` : `<div class="ota-muted">Đang tải...</div>`;
    const failed = S.ind.state !== "ok";
    const fail = failed
      ? `<div class="cb-note bad"><span class="t">Không gọi được Hub lúc ${H.hhmm(S.ind.failedAt)}.</span><span>Số dưới đây là của lượt ${H.hhmm(S.ind.at)}, có thể đã đổi. Khung tự thử lại.</span><div class="bt"><button class="cb-btn2" data-act="retryInd">Thử lại</button></div></div>`
      : "";
    const vt = I.verdictText(m);
    const verdict = `<div class="cb-verdict">${esc(vt.lead)}${vt.n !== null ? `<b>${vt.n}</b>${esc(vt.tail)}` : ""}</div>`;
    const mt = I.missingText(m);
    const thieu = mt ? `<div class="cb-thieu">Chưa đủ dữ liệu ở <b>${mt.n} chỉ báo</b>: ${esc(mt.list)}. Thiếu số không có nghĩa là ổn.</div>` : "";
    const origin = S.ind.origin || v?.origin || "";
    return `${fail}<div class="${failed ? "cb-stale" : ""}" style="display:flex;flex-direction:column;gap:8px">${verdict}${m.exceeded.map((c) => caseHTML(c, origin)).join("")}</div>${thieu}`;
  }

  function tabsHTML() {
    const b = S.booking;
    const matches = b?.ok === false ? b.cached?.matches : b?.matches;
    const iss = matches ? B.countIssues(matches) : 0;
    const bookCt = matches ? (iss ? `<span class="ct bad">${iss} lỗi</span>` : `<span class="ct">${matches.length}</span>`) : "";
    const m = S.view?.session === "ok" ? indModel() : null;
    const dot = m ? `<span class="dlv ${S.ind?.state !== "ok" ? "cy" : m.level}"></span>` : `<span class="dlv off"></span>`;
    const cbCt = m && m.exceeded.length ? `<span class="ct ${m.level === "cb" ? "bad" : ""}">${m.exceeded.length}</span>` : "";
    const on = (t) => (!S.overlay && S.tab === t ? "on" : "");
    return `<div class="qf-tabs" role="tablist">
      <button role="tab" aria-selected="${on("bookings") === "on"}" class="${on("bookings")}" data-act="tab" data-t="bookings">Booking OTA${bookCt}</button>
      <button role="tab" aria-selected="${on("board") === "on"}" class="${on("board")}" data-act="tab" data-t="board">Khoá G2J</button>
      <button role="tab" aria-selected="${on("cb") === "on"}" class="${on("cb")}" data-act="tab" data-t="cb">Chỉ báo${dot}${cbCt}</button></div>`;
  }

  function tokenLine() {
    const t = S.view?.tokens ?? {};
    const parts = ["Mã kết nối do Hub cấp"];
    if (t.ezcloud?.at) parts.push(`token PMS gửi ${H.hhmm(t.ezcloud.at)}`);
    if (t.go2joy?.at) parts.push(`token Go2Joy ${H.hhmm(t.go2joy.at)}`);
    return parts.join(" · ");
  }

  function frameHTML() {
    const v = S.view;
    const blk = blocked();
    const sub = H.frameSubtitle({ session: v?.session === "nobranch" ? "nobranch" : v?.session, branchName: v?.branch?.name, why: null });
    const pluginBody = S.overlay ? plugins.map((p) => p.body?.()).find(Boolean) : null;
    let body;
    let ft = "";
    if (!S.hello) body = `<div class="ota-muted">Đang đọc phiên Hub...</div>`;
    else if (blk) body = note(blk);
    else if (pluginBody) {
      body = pluginBody;
      ft = plugins.map((p) => p.footer?.()).find(Boolean) ?? "";
    } else if (S.tab === "bookings") {
      body = bookingsTab();
      ft = `<div class="qf-ft"><span class="sp">${esc(tokenLine())}</span><button class="lk" data-act="refresh">Làm mới</button></div>`;
    } else if (S.tab === "board") {
      body = boardTab();
      ft = `<div class="qf-ft"><span class="sp">Bảng khoá Go2Joy ${B.BOARD_DAYS} ngày tới</span><button class="lk" data-act="refresh">Làm mới</button></div>`;
    } else {
      body = cbTab();
      const m = indModel();
      if (v?.session !== "expired" && m) {
        const when = I.lastRunText(m.lastRunAt);
        ft = `<div class="qf-ft"><span class="sp">${esc(when)}</span><a href="${esc(H.resultsUrl(S.ind?.origin || v?.origin || "", m.branchId))}" target="_blank" rel="noopener">Mở trên Hub ↗</a></div>`;
      }
    }
    const headBtns = blk ? "" : plugins.map((p) => p.headerButton?.() ?? "").join("");
    return `<div class="qf" role="dialog" aria-label="UrbanB tại quầy">
      <div class="qf-hd"><div class="tt"><b>UrbanB tại quầy</b><span>${esc(sub)}</span></div>${headBtns}<button data-act="frame">Thu gọn</button></div>
      ${blk || !S.hello ? "" : tabsHTML()}<div class="qf-body">${body}</div>${ft}</div>`;
  }

  function dockHTML() {
    const v = S.view;
    let segs;
    if (!v) segs = [{ dot: "off", text: "…" }];
    else {
      const session = v.session === "nobranch" || (!S.hotelId && v.session === "ok") ? "nobranch" : v.session;
      const b = S.booking;
      const matches = b?.ok === false ? b.cached?.matches : b?.matches;
      const booking = matches ? { issues: B.countIssues(matches), count: matches.length } : null;
      const m = indModel();
      const indicators = m ? { level: m.level, exceeded: m.exceeded.length, at: S.ind.at, stale: S.ind.state !== "ok" } : null;
      segs = H.UNREACHABLE.has(session) && !v.branch ? [{ dot: "off", text: "không gọi được Hub" }] : H.dockModel({ session: H.UNREACHABLE.has(session) ? "ok" : session, booking, indicators }).segs;
    }
    const segHTML = segs.map((s) => `<span class="seg ${s.bad ? "bad" : ""}">${s.dot ? `<span class="dlv ${s.dot}"></span>` : ""}${esc(s.text)}</span>`).join("");
    const before = plugins.map((p) => p.dockBefore?.() ?? "").join("");
    return `<div class="qdock">${before}<button class="qfab" data-act="frame" aria-expanded="${S.open}"><span class="lg">U</span>UrbanB tại quầy${segHTML}</button></div>`;
  }

  function render() {
    const focusQ = root.activeElement?.dataset?.k === "q";
    const caret = focusQ ? root.activeElement.selectionStart : null;
    const bodyScroll = root.querySelector(".qf-body")?.scrollTop ?? 0;
    const extra = plugins.map((p) => p.overlayHTML?.() ?? "").join("");
    const tokNote = S.note && !S.open ? `<div class="qnote ${esc(S.note.tone)}" role="status">${esc(S.note.text)}</div>` : "";
    wrap.innerHTML = `${S.open ? frameHTML() : ""}${dockHTML()}${extra}${tokNote}`;
    const b = root.querySelector(".qf-body");
    if (b) b.scrollTop = bodyScroll;
    if (focusQ) {
      const input = root.querySelector('[data-k="q"]');
      input?.focus();
      if (input && caret !== null) input.setSelectionRange(caret, caret);
    }
    for (const p of plugins) p.afterRender?.();
  }

  // ---------- sự kiện ----------

  async function doLock(btn) {
    const key = btn.dataset.key;
    const m = (S.booking?.matches ?? []).find((x) => x.sourceKey === key);
    if (!m) return;
    const c = B.lockConfirm(m);
    if (!window.confirm(c.text)) return;
    btn.disabled = true;
    btn.textContent = "Đang khoá...";
    const r = await send({ type: "quay:lock", hotelId: S.hotelId, sourceKey: key, confirmPaid: c.confirmPaid });
    S.lockBan = { ok: Boolean(r.ok), text: r.text ?? r.error ?? "" };
    if (r.ok) refreshAll();
    else render();
  }

  root.addEventListener("click", (e) => {
    const t = e.target.closest("[data-act]");
    if (!t) return;
    const a = t.dataset.act;
    if (a === "frame") {
      S.open = !S.open;
      S.overlay = null;
      if (S.open) refreshAll();
      else clearTimeout(bookTimer);
    } else if (a === "tab") {
      S.tab = t.dataset.t;
      S.overlay = null;
    } else if (a === "refresh") return refreshAll();
    else if (a === "search") {
      S.q = root.querySelector('[data-k="q"]')?.value.trim() ?? "";
      return loadBookings();
    } else if (a === "lock") return doLock(t);
    else if (a === "lockBanX") S.lockBan = null;
    else if (a === "noteX") S.note = null;
    else if (a === "retry") return start();
    else if (a === "retryInd") return loadIndicators();
    else if (a === "login") {
      // Thẻ <a> tự mở trang đăng nhập Hub ở tab mới; quay lại tab PMS là đọc lại phiên (visibilitychange).
      return;
    } else {
      for (const p of plugins) if (p.onAction?.(a, t, e)) return;
      return;
    }
    render();
  });
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target?.dataset?.k === "q") {
      S.q = e.target.value.trim();
      loadBookings();
    }
  });
  // Lễ tân quay lại tab PMS sau khi đăng nhập Hub ở tab khác ⇒ đọc lại phiên.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.view && (S.view.session === "out" || S.view.session === "expired")) start();
  });

  render();
  start();
  return api;
}
