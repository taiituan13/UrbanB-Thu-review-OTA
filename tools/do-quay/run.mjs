// Đo khung "UrbanB tại quầy" trên trang PMS giả lập 1440×900 (Hub giả + Apps Script giả + nguồn thông báo giả).
// Chạy sau tools/do-quay/build.sh. Kết quả: tools/do-quay/ket-qua.json.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
import { start, state } from "./server.mjs";
import fs from "node:fs";
const S = new URL(".", import.meta.url).pathname;
const PORT = 47821;
const HUB = `http://localhost:${PORT}`;
const EXT = S + "ext";
const PMS = fs.readFileSync(S + "pms.html", "utf8");
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mode = (m) => fetch(`${HUB}/__mode?m=${m}`);
const srv = await start(PORT);

async function open(name, m) {
  await mode(m);
  const dir = fs.mkdtempSync(S + "prof-");
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium", headless: true, viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const extId = new URL(sw.url()).host;
  const errors = [];
  const watch = (p, tag) => {
    p.on("console", (msg) => { if (msg.type() === "error") errors.push(`${tag} console: ${msg.text()}`); });
    p.on("pageerror", (e) => errors.push(`${tag} pageerror: ${e.message}`));
    p.on("dialog", (d) => d.accept());
  };
  await ctx.route("https://pms.ezcloudhotel.com/**", (rt) => {
    const u = new URL(rt.request().url());
    if (u.pathname.startsWith("/api/")) return rt.fulfill({ contentType: "application/json", body: '{"ok":true}' });
    return rt.fulfill({ contentType: "text/html; charset=utf-8", body: PMS });
  });
  const page = await ctx.newPage();
  watch(page, "pms");
  const res = { errors };
  out[name] = res;
  return { ctx, sw, page, extId, res, errors, watch, dir };
}
async function close(o) { await o.ctx.close(); fs.rmSync(o.dir, { recursive: true, force: true }); }

const q = (page, sel) => page.locator(`#urbanb-quay >> ${sel}`);
async function box(page, sel) {
  const l = q(page, sel).first();
  if (!(await l.count())) return null;
  const b = await l.boundingBox();
  return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
}
async function txt(page, sel) { const l = q(page, sel).first(); return (await l.count()) ? (await l.innerText()).replace(/\s+/g, " ").trim() : null; }
async function overflow(page) {
  return page.evaluate(() => {
    const root = document.getElementById("urbanb-quay")?.shadowRoot;
    const b = root?.querySelector(".qf-body");
    return { docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth, bodyScrollW: b?.scrollWidth ?? null, bodyClientW: b?.clientWidth ?? null };
  });
}
async function waitText(page, sel, re, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const t = await txt(page, sel); if (t && re.test(t)) return t; await sleep(250); }
  return await txt(page, sel);
}
async function overlap(page) {
  return page.evaluate(() => {
    const host = document.getElementById("urbanb-quay");
    const t = host.shadowRoot.querySelector(".qtoast");
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const hits = new Set();
    host.style.pointerEvents = "none";
    for (let x = r.left + 2; x < r.right; x += 8) for (let y = r.top + 2; y < r.bottom; y += 4) {
      for (const el of document.elementsFromPoint(x, y)) {
        if (el === host || el === document.body || el === document.documentElement) continue;
        if (el.children.length && el.classList.contains("top")) continue; // dải đầu PMS (nền), không phải một nút
        hits.add(el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (el.className ? "." + el.className : "") + ":" + (el.textContent || "").trim().slice(0, 20));
      }
    }
    host.style.pointerEvents = "";
    return { box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom) }, hits: [...hits] };
  });
}
async function popup(o, tag) {
  const p = await o.ctx.newPage();
  o.watch(p, "popup-" + tag);
  await p.setViewportSize({ width: 360, height: 700 });
  await p.goto(`chrome-extension://${o.extId}/popup.html`);
  await sleep(1500);
  const r = await p.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return e && !e.hidden && getComputedStyle(e).display !== "none"; };
    const t = (id) => document.getElementById(id)?.innerText.replace(/\s+/g, " ").trim();
    return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, who: t("who"), pms: t("pmsRow"), review: t("rvRow"), outBox: vis("outBox"), expired: vis("expired"), tm: vis("tm"), openHub: vis("openHub") };
  });
  r.badge = await o.sw.evaluate(() => chrome.action.getBadgeText({}));
  await p.close();
  return r;
}

try {
  // ---------- A: đăng nhập, đủ dữ liệu ----------
  const A = await open("A_ok", "ok");
  const { page } = A;
  await page.goto("https://pms.ezcloudhotel.com/#/room-map");
  A.res.dockText = await waitText(page, ".qfab", /Chỉ báo \d+ đang vượt/);
  await sleep(1500);
  A.res.dock = await box(page, ".qfab");
  A.res.chip = await box(page, ".qchip");
  A.res.chipText = await txt(page, ".qchip");
  A.res.firstRunToast = await q(page, ".qtoast").count();
  A.res.overflowCollapsed = await overflow(page);
  await q(page, ".qfab").click();
  await sleep(1500);
  A.res.frame = await box(page, ".qf");
  A.res.header = await txt(page, ".qf-hd");
  A.res.tabs = await txt(page, ".qf-tabs");
  A.res.tabBookings = { overflow: await overflow(page), text: (await txt(page, ".qf-body"))?.slice(0, 260), footer: await txt(page, ".qf-ft") };
  await q(page, '[data-act="lock"]').first().click();
  A.res.lockBan = await waitText(page, ".qban", /G2J/);
  await q(page, '[data-t="board"]').click();
  await waitText(page, ".qf-body", /Loại phòng/);
  A.res.tabBoard = { overflow: await overflow(page), scroll: await page.evaluate(() => { const s = document.getElementById("urbanb-quay").shadowRoot.querySelector(".ota-scroll"); return s && { scrollW: s.scrollWidth, clientW: s.clientWidth }; }), footer: await txt(page, ".qf-ft") };
  await q(page, '[data-t="cb"]').click();
  await sleep(500);
  A.res.tabCb = { overflow: await overflow(page), text: await txt(page, ".qf-body"), footer: await txt(page, ".qf-ft") };
  // danh sách thông báo
  await q(page, '[data-act="notiToggle"]').click();
  await sleep(800);
  A.res.notiList = { overflow: await overflow(page), text: (await txt(page, ".qf-body"))?.slice(0, 400), footer: await txt(page, ".qf-ft"), chip: await txt(page, ".qchip"), chipExpanded: await q(page, ".qchip").getAttribute("aria-expanded") };
  await q(page, '[data-act="notiRead"]').first().click();
  await sleep(800);
  A.res.afterRead = { chip: await txt(page, ".qchip"), head: await txt(page, ".qn-head") };
  // đóng khung, bắn thông báo mới
  await q(page, '.qf-hd [data-act="frame"]').click();
  await page.mouse.move(700, 600);
  await A.sw.evaluate(async () => (await self.__doNoti()).push({ title: "Thông báo minh hoạ: đổi giờ giao ca từ 20/10", body: "Ca sáng 06:00–14:00.", from: "Quản lý cụm (minh hoạ)" }));
  const t0 = Date.now();
  while (!(await q(page, ".qtoast").count()) && Date.now() - t0 < 8000) await sleep(200);
  await sleep(600);
  A.res.toast = await overlap(page);
  A.res.toastText = await txt(page, ".qtoast");
  A.res.chipWithToast = await txt(page, ".qchip");
  await q(page, ".qtoast").hover();
  await sleep(10000);
  A.res.toastAfter10sHover = await q(page, ".qtoast").count();
  await page.mouse.move(700, 600);
  await sleep(9500);
  A.res.toastAfterLeave = await q(page, ".qtoast").count();
  A.res.chipAfterAutoHide = await txt(page, ".qchip");
  // ghim
  await A.sw.evaluate(async () => (await self.__doNoti()).push({ title: "Thông báo minh hoạ có ghim", sticky: true }));
  const t1 = Date.now();
  while (!(await q(page, ".qtoast").count()) && Date.now() - t1 < 8000) await sleep(200);
  await sleep(10000);
  A.res.stickyAfter10s = { count: await q(page, ".qtoast").count(), bar: await q(page, ".qtoast .bar").count() };
  await q(page, ".qtoast .x").click();
  await sleep(600);
  A.res.stickyAfterClose = { count: await q(page, ".qtoast").count(), chip: await txt(page, ".qchip") };
  A.res.overflowEnd = await overflow(page);
  A.res.popup = await popup(A, "ok");
  // hết phiên (H-1245 a)
  await mode("out");
  await page.reload();
  await sleep(5000);
  A.res.expired = { dock: await txt(page, ".qfab"), chip: await txt(page, ".qchip") };
  await q(page, ".qfab").click();
  await sleep(2500);
  A.res.expired.header = await txt(page, ".qf-hd");
  A.res.expired.bookings = (await txt(page, ".qf-body"))?.slice(0, 200);
  await q(page, '[data-t="cb"]').click();
  await sleep(500);
  A.res.expired.cb = await txt(page, ".qf-body");
  A.res.expired.popup = await popup(A, "expired");
  A.res.hubLog = state.log.slice(-6);
  await close(A);

  for (const [name, m] of [["B_out", "out"], ["C_unlinked", "unlinked"], ["D_down", "down"]]) {
    const o = await open(name, m);
    await o.page.goto("https://pms.ezcloudhotel.com/");
    await sleep(4000);
    o.res.dock = await txt(o.page, ".qfab");
    o.res.chip = await q(o.page, ".qchip").count();
    await q(o.page, ".qfab").click();
    await sleep(1200);
    o.res.frame = await txt(o.page, ".qf");
    o.res.overflow = await overflow(o.page);
    o.res.popup = await popup(o, m);
    await close(o);
  }
} finally {
  srv.close();
}
fs.writeFileSync(S + "ket-qua.json", JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
