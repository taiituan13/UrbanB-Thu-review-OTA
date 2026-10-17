// Đo P4 (YC-112): cookie phiên Hub có đi theo request của extension không. Chạy: node tools/do-p4-cookie/run.mjs
// (PLAYWRIGHT_MODULE=<đường dẫn playwright/index.mjs> nếu repo chưa cài node_modules). Kết quả in ra stdout.

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
import { start } from "./server.mjs";
import fs from "node:fs";
const S = new URL(".", import.meta.url).pathname;
const PORT = 47311;
const srv = await start(PORT);
const out = {};
async function variant(name, extDir, { block3p = false } = {}) {
  const dir = fs.mkdtempSync(S + "prof-");
  if (block3p) {
    fs.mkdirSync(dir + "/Default", { recursive: true });
    fs.writeFileSync(dir + "/Default/Preferences", JSON.stringify({ profile: { cookie_controls_mode: 1, block_third_party_cookies: true } }));
  }
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: "chromium", headless: true,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent("serviceworker");
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${PORT}/set`); // "đăng nhập Hub" ở tab thường
    const base = `http://localhost:${PORT}/echo`;
    const call = (init) => sw.evaluate(async ([u, i]) => {
      try { const r = await fetch(u, i); return { status: r.status, body: await r.json() }; }
      catch (e) { return { error: String(e) }; }
    }, [base, init]);
    const r = {
      getDefault: await call({}),
      getInclude: await call({ credentials: "include" }),
      postInclude: await call({ method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" }),
    };
    // Đối chứng: fetch từ content script trên một trang khác nguồn (giống trang PMS).
    await page.route("http://pms.localtest/**", (rt) => rt.fulfill({ contentType: "text/html", body: "<p>pms giả</p>" }));
    await page.goto("http://pms.localtest/");
    r.contentScriptInclude = await page.evaluate(async (u) => {
      try { const x = await fetch(u, { credentials: "include" }); return { status: x.status, body: await x.text() }; }
      catch (e) { return { error: String(e) }; }
    }, base);
    out[name] = r;
  } finally { await ctx.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}
try {
  await variant("coHostPermission", S + "ext-host");
  await variant("coHostPermission_chan3p", S + "ext-host", { block3p: true });
  await variant("khongHostPermission", S + "ext-nohost");
} finally { srv.close(); }
console.log(JSON.stringify(out, null, 1));
