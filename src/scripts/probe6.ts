// Lượt đo thứ sáu: đi hết phân trang.
// Agoda: gọi lại đúng yêu cầu mà trang vừa gửi, chỉ đổi pageNo, cách nhau 3 giây.
// Trip: cuộn trong khung review đã mở để nó tự tải thêm.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const OUT = "out/probe6"; await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

{ // Agoda
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  let req = null as { url: string; body: string; headers: Record<string, string> } | null;
  p.on("request", (r) => { if (/review\/HotelReviews/.test(r.url()) && !req) req = { url: r.url(), body: r.postData() ?? "", headers: r.headers() }; });
  await p.goto("https://www.agoda.com/vi-vn/secret-garden-hotel-binh-th-nh/hotel/ho-chi-minh-city-vn.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 8 && !req; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(700); }
  if (!req) { console.log("agoda: không bắt được yêu cầu review"); }
  else {
    const all: any[] = []; const perPage: number[] = [];
    for (let n = 1; n <= 40; n++) {
      const body = JSON.parse(req!.body); body.pageNo = n; body.pageSize = 20; body.paginationSize = 20;
      const res = await p.evaluate(async ({ url, body }) => {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
        return { status: r.status, text: await r.text() };
      }, { url: req!.url, body });
      if (res.status !== 200) { console.log("agoda trang", n, "status", res.status); break; }
      const c = JSON.parse(res.text).commentList?.comments ?? [];
      perPage.push(c.length); all.push(...c);
      if (!c.length) break;
      await p.waitForTimeout(3000);
    }
    await writeFile(`${OUT}/agoda-all.json`, JSON.stringify(all));
    const by: Record<string, number> = {}; for (const x of all) by[x.reviewProviderText] = (by[x.reviewProviderText] ?? 0) + 1;
    const ids = new Set(all.map((x) => x.hotelReviewId));
    const withText = all.filter((x) => (x.reviewComments || x.reviewPositives || x.reviewNegatives || "").trim()).length;
    const dates = all.map((x) => x.reviewDate).sort();
    console.log("agoda", { perPage, total: all.length, distinct: ids.size, byProvider: by, withText, oldest: dates[0], newest: dates.at(-1) });
  }
  await ctx.close();
}
{ // Trip
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const hits: string[] = [];
  p.on("response", async (r) => { const u = r.url(); if (/restapi/.test(u) && !/collect|Config|Header|Usp|Personal|userRecognize|getTripUserType|GetBizCity/.test(u)) { try { const t = await r.text(); hits.push(`${t.length} ${u.slice(0, 120)}`); if (t.length > 2000) await writeFile(`${OUT}/trip-${hits.length}.json`, t); } catch {} } });
  await p.goto("https://vn.trip.com/hotels/ho-chi-minh-city-hotel-detail-131972816/secret-garden-hotel-binh-thanh/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(600); }
  const mark = hits.length;
  await p.evaluate(() => (document.querySelector('[class*="moreReviewButtonA"]') as HTMLElement | null)?.click());
  await p.waitForTimeout(5000);
  const counts: number[] = [];
  for (let i = 0; i < 25; i++) {
    await p.evaluate(() => {
      const els = [...document.querySelectorAll("div")].filter((d) => d.scrollHeight > d.clientHeight + 50 && /overflow|auto|scroll/.test(getComputedStyle(d).overflowY) && d.innerText.includes("Đăng vào ngày"));
      const el = els.sort((a, b) => b.scrollHeight - a.scrollHeight)[0]; if (el) el.scrollTop = el.scrollHeight;
    });
    await p.waitForTimeout(2000);
    counts.push(await p.evaluate(() => (document.body.innerText.match(/Đăng vào ngày/g) ?? []).length));
    if (counts.length > 3 && counts.at(-1) === counts.at(-4)) break;
  }
  await writeFile(`${OUT}/trip.txt`, await p.evaluate(() => document.body.innerText));
  console.log("trip", { counts, newCalls: hits.slice(mark) });
  await ctx.close();
}
await browser.close();
