// Lượt đo thứ hai: thử lấy TOÀN BỘ review (phân trang / nút "xem tất cả").
// Vẫn chỉ đọc trang công khai, chậm, gặp chặn thì ghi lại rồi dừng kênh đó.
import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const OUT = "out/probe2";
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function open(name: string, fn: (p: Page, json: Array<{ url: string; body: string }>) => Promise<unknown>) {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const json: Array<{ url: string; body: string }> = [];
  page.on("response", async (r) => {
    if (!(r.headers()["content-type"] ?? "").includes("json")) return;
    try { json.push({ url: r.url(), body: await r.text() }); } catch {}
  });
  try { console.log(name, JSON.stringify(await fn(page, json))); }
  catch (e) { console.log(name, "LỖI", (e as Error).message.split("\n")[0]); }
  await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  await ctx.close();
}

// Agoda: trang review công khai có phân trang.
await open("agoda", async (page, json) => {
  const seen = new Set<number>(); const pages: unknown[] = [];
  for (const n of [1, 2, 3]) {
    json.length = 0;
    await page.goto(`https://www.agoda.com/vi-vn/secret-garden-hotel-binh-th-nh/reviews/ho-chi-minh-city-vn.html?page=${n}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(5000);
    const hit = json.find((j) => /review\/HotelReviews/.test(j.url));
    const c = hit ? JSON.parse(hit.body).commentList?.comments ?? [] : [];
    for (const x of c) seen.add(x.hotelReviewId);
    await writeFile(`${OUT}/agoda-p${n}.json`, hit?.body ?? "");
    const text = await page.evaluate(() => document.body.innerText);
    pages.push({ n, apiComments: c.length, totalAgg: hit ? JSON.parse(hit.body).score?.reviewCount ?? null : null, textHasReview: /Đánh giá/.test(text) });
    await page.waitForTimeout(3000);
  }
  return { pages, distinct: seen.size };
});

// Trip: bấm "Tất cả đánh giá" / "Hiển thị toàn bộ", cuộn trong khung review.
await open("trip", async (page, json) => {
  await page.goto("https://vn.trip.com/hotels/ho-chi-minh-city-hotel-detail-131972816/secret-garden-hotel-binh-thanh/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(600); }
  const btn = page.getByText(/Tất cả đánh giá \(\d+\)/).first();
  await btn.click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(4000);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 1500); await page.waitForTimeout(1200); }
  const hits = json.filter((j) => /comment|review/i.test(j.url));
  await writeFile(`${OUT}/trip-hits.json`, JSON.stringify(hits.map((h) => ({ url: h.url, body: h.body.slice(0, 300000) }))));
  const text = await page.evaluate(() => document.body.innerText);
  await writeFile(`${OUT}/trip.txt`, text);
  return { hits: hits.map((h) => [h.url.slice(0, 110), h.body.length]), postedCount: (text.match(/Đăng vào ngày/g) ?? []).length, url: page.url() };
});

// Booking: danh sách review công khai.
await open("booking", async (page) => {
  const out: unknown[] = [];
  for (const offset of [0, 25]) {
    const r = await page.goto(`https://www.booking.com/reviewlist.vi.html?cc1=vn&pagename=secret-garden-binh-thanh&rows=25&offset=${offset}&sort=f_recent_desc`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const html = await page.content();
    await writeFile(`${OUT}/booking-${offset}.html`, html);
    const text = await page.evaluate(() => document.body.innerText);
    out.push({ offset, status: r?.status(), title: await page.title(), items: (html.match(/review_list_new_item_block|data-testid="review-card"|c-review-block/g) ?? []).length, textLen: text.length });
    await page.waitForTimeout(3000);
  }
  return out;
});
await browser.close();
