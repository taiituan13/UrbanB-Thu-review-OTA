// Lượt đo thứ tám: Agoda đi hết trang ở chế độ "trang review", tách theo nguồn;
// Trip: tìm link "Tất cả N đánh giá" xem có trang review riêng có phân trang không.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const OUT = "out/probe8"; await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
{
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  let req: { url: string; body: string } | null = null;
  p.on("request", (r) => { if (/review\/HotelReviews/.test(r.url()) && !req) req = { url: r.url(), body: r.postData() ?? "" }; });
  await p.goto("https://www.agoda.com/vi-vn/secret-garden-hotel-binh-th-nh/hotel/ho-chi-minh-city-vn.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 8 && !req; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(700); }
  const base = JSON.parse(req!.body);
  for (const [label, prov] of [["agoda", [332]], ["booking", [3038]]] as const) {
    const all = new Map<number, any>(); const per: number[] = [];
    for (let n = 1; n <= 30; n++) {
      const body = { ...base, isReviewPage: true, pageNo: n, reviewProviderIds: prov, hotelProviderId: prov[0] };
      const r = await p.evaluate(async ({ url, body }) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "include" }); return { s: r.status, t: await r.text() }; }, { url: req!.url, body });
      if (r.s !== 200) { per.push(-r.s); break; }
      const c = JSON.parse(r.t).commentList?.comments ?? []; const before = all.size;
      for (const x of c) all.set(x.hotelReviewId, x);
      per.push(c.length);
      if (!c.length || all.size === before) break;
      await p.waitForTimeout(3000);
    }
    const v = [...all.values()]; const d = v.map((x) => x.reviewDate).sort();
    await writeFile(`${OUT}/agoda-${label}.json`, JSON.stringify(v));
    console.log("agoda nguồn", label, { per, distinct: all.size, providers: [...new Set(v.map((x) => x.reviewProviderText))], withText: v.filter((x) => `${x.reviewComments}${x.reviewPositives}${x.reviewNegatives}`.trim()).length, oldest: d[0], newest: d.at(-1) });
  }
  await ctx.close();
}
{
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  await p.goto("https://vn.trip.com/hotels/ho-chi-minh-city-hotel-detail-131972816/secret-garden-hotel-binh-thanh/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(600); }
  const links = await p.evaluate(() => [...document.querySelectorAll("a")].filter((a) => /đánh giá/i.test(a.innerText)).map((a) => `${a.innerText.slice(0, 40)} -> ${a.href}`));
  console.log("trip links", links.slice(0, 10));
  await ctx.close();
}
await browser.close();
