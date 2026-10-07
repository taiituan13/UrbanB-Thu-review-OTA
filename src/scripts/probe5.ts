// Lượt đo thứ năm: Agoda sang trang review 2–3; Trip bấm "Hiển thị toàn bộ" bằng sự kiện DOM.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const OUT = "out/probe5"; await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

{ // Agoda
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const pages: unknown[] = [];
  p.on("response", async (r) => {
    if (!/review\/HotelReviews/.test(r.url())) return;
    try { const j = JSON.parse(await r.text()); const c = j.commentList?.comments ?? [];
      pages.push({ page: j.commentList?.currentPage, n: c.length, ids: c.map((x: any) => x.hotelReviewId), post: r.request().postData()?.slice(0, 300) });
      await writeFile(`${OUT}/agoda-p${j.commentList?.currentPage}.json`, JSON.stringify(j)); } catch {}
  });
  await p.goto("https://www.agoda.com/vi-vn/secret-garden-hotel-binh-th-nh/hotel/ho-chi-minh-city-vn.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(700); }
  for (let k = 0; k < 2; k++) {
    const next = p.locator('[data-element-name="review-paginator-next"]').first();
    await next.scrollIntoViewIfNeeded().catch(() => {});
    await next.click({ timeout: 8000 }).catch((e) => console.log("agoda click", e.message.split("\n")[0]));
    await p.waitForTimeout(4000);
  }
  console.log("agoda", JSON.stringify(pages));
  await ctx.close();
}
{ // Trip
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const p = await ctx.newPage();
  const hits: Array<{ url: string; n: number }> = [];
  p.on("response", async (r) => { if (/comment|review/i.test(r.url()) && !/\.(js|css|png|jpg|svg)/.test(r.url())) { try { const t = await r.text(); hits.push({ url: r.url(), n: t.length }); await writeFile(`${OUT}/trip-${hits.length}.json`, t); } catch {} } });
  await p.goto("https://vn.trip.com/hotels/ho-chi-minh-city-hotel-detail-131972816/secret-garden-hotel-binh-thanh/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(600); }
  await p.evaluate(() => (document.querySelector('[class*="moreReviewButtonA"]') as HTMLElement | null)?.click());
  await p.waitForTimeout(5000);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(1200); }
  const txt = await p.evaluate(() => document.body.innerText);
  await writeFile(`${OUT}/trip.txt`, txt);
  await p.screenshot({ path: `${OUT}/trip.png` });
  console.log("trip", { url: p.url(), posted: (txt.match(/Đăng vào ngày/g) ?? []).length, hits: hits.map((h) => `${h.n} ${h.url.slice(0, 110)}`) });
  await ctx.close();
}
await browser.close();
