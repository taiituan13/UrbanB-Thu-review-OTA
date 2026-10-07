// Lượt đo thứ bảy: tìm đúng tham số phân trang Agoda; xem khung review Trip tải thêm bằng gì.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const OUT = "out/probe7"; await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
{ // Agoda: thử ba biến thể thân yêu cầu cho trang 2
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  let req: { url: string; body: string } | null = null;
  p.on("request", (r) => { if (/review\/HotelReviews/.test(r.url()) && !req) req = { url: r.url(), body: r.postData() ?? "" }; });
  await p.goto("https://www.agoda.com/vi-vn/secret-garden-hotel-binh-th-nh/hotel/ho-chi-minh-city-vn.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 8 && !req; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(700); }
  await writeFile(`${OUT}/agoda-req.json`, req!.body);
  const call = (body: unknown) => p.evaluate(async ({ url, body }) => { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "include" }); const j = await r.json(); return (j.commentList?.comments ?? []).map((x: any) => `${x.providerId}:${x.hotelReviewId}`); }, { url: req!.url, body });
  const base = JSON.parse(req!.body);
  const variants: Record<string, unknown> = {
    goc_trang1: base,
    goc_trang2: { ...base, pageNo: 2 },
    agoda_rieng_trang2: { ...base, pageNo: 2, reviewProviderIds: [332] },
    booking_rieng_trang1: { ...base, pageNo: 1, reviewProviderIds: [3038], hotelProviderId: 3038 },
    booking_rieng_trang2: { ...base, pageNo: 2, reviewProviderIds: [3038], hotelProviderId: 3038 },
    trang_review_trang2: { ...base, pageNo: 2, isReviewPage: true },
  };
  for (const [k, v] of Object.entries(variants)) { const ids = await call(v); console.log("agoda", k, ids.length, ids.slice(0, 6).join(" ")); await p.waitForTimeout(2500); }
  await ctx.close();
}
{ // Trip: ghi MỌI request sau khi mở khung, rồi lăn chuột ngay trên khung
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const reqs: string[] = []; let on = false;
  p.on("request", (r) => { if (on && !/\.(js|css|png|jpe?g|webp|svg|woff2?|gif)(\?|$)/.test(r.url()) && !/collect|ubt|google|naver|facebook/.test(r.url())) reqs.push(`${r.method()} ${r.resourceType()} ${r.url().slice(0, 120)}`); });
  await p.goto("https://vn.trip.com/hotels/ho-chi-minh-city-hotel-detail-131972816/secret-garden-hotel-binh-thanh/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(600); }
  on = true;
  await p.evaluate(() => (document.querySelector('[class*="moreReviewButtonA"]') as HTMLElement | null)?.click());
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${OUT}/trip-open.png` });
  for (let i = 0; i < 15; i++) { await p.mouse.move(1000, 600); await p.mouse.wheel(0, 2000); await p.waitForTimeout(1500); }
  await p.screenshot({ path: `${OUT}/trip-end.png` });
  const pag = await p.evaluate(() => [...document.querySelectorAll('[class*="agination"], [class*="loadMore"], [class*="LoadMore"], [class*="pager"]')].map((e) => `${e.className}`.slice(0, 80) + " | " + (e as HTMLElement).innerText.slice(0, 60)));
  console.log("trip", { posted: await p.evaluate(() => (document.body.innerText.match(/Đăng vào ngày/g) ?? []).length), pag, reqs });
  await ctx.close();
}
await browser.close();
