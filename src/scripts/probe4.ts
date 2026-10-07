// Lượt đo thứ tư: bấm đúng nút "xem tất cả" của từng kênh, rồi sang trang 2 trong khung review.
import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const OUT = "out/probe4"; await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });

async function run(name: string, url: string, act: (p: Page, log: (s: string) => void) => Promise<void>) {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const hits: Array<{ url: string; post: string | null; status: number; body: string }> = [];
  page.on("response", async (r) => {
    if (!/review|comment|graphql/i.test(r.url()) || /\.(js|css|png|jpg|svg|woff2?)(\?|$)/.test(r.url())) return;
    try { hits.push({ url: r.url(), post: r.request().postData(), status: r.status(), body: await r.text() }); } catch {}
  });
  const logs: string[] = []; const log = (s: string) => logs.push(s);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(5000);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(600); }
  const before = hits.length;
  await act(page, log).catch((e) => log("act lỗi: " + (e as Error).message.split("\n")[0]));
  await page.waitForTimeout(3000);
  await writeFile(`${OUT}/${name}-hits.json`, JSON.stringify(hits, null, 1));
  await writeFile(`${OUT}/${name}.txt`, await page.evaluate(() => document.body.innerText));
  await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  console.log(name, logs, hits.slice(before).map((h) => { let op = ""; try { op = JSON.parse(h.post ?? "{}").operationName ?? ""; } catch {} return `${h.status} ${h.body.length} ${op} ${h.url.slice(0, 100)}`; }));
  await ctx.close();
}

await run("booking", "https://www.booking.com/hotel/vn/secret-garden-binh-thanh.vi.html", async (p, log) => {
  const b = p.getByText("Đọc tất cả đánh giá", { exact: true }).first();
  log("nút: " + (await b.count()));
  await b.scrollIntoViewIfNeeded(); await b.click({ timeout: 8000 });
  await p.waitForTimeout(5000);
  const n1 = await p.locator('[data-testid="review-card"]').count(); log("thẻ review: " + n1);
  const next = p.locator('button[aria-label*="Trang tiếp"], button[aria-label*="Next page"], [data-testid="pagination-next"]').first();
  log("nút trang sau: " + (await next.count()));
  if (await next.count()) { await next.click({ timeout: 8000 }); await p.waitForTimeout(4000); log("thẻ sau khi sang trang: " + (await p.locator('[data-testid="review-card"]').count())); }
});

await run("trip", "https://vn.trip.com/hotels/ho-chi-minh-city-hotel-detail-131972816/secret-garden-hotel-binh-thanh/", async (p, log) => {
  const cands = await p.evaluate(() => [...document.querySelectorAll("button, a, div, span")]
    .filter((e) => /Hiển thị toàn bộ|Tất cả đánh giá|Xem tất cả/.test((e as HTMLElement).innerText ?? "") && (e as HTMLElement).innerText.length < 40)
    .slice(0, 8).map((e) => `${e.tagName}.${(e as HTMLElement).className}`.slice(0, 80) + " | " + (e as HTMLElement).innerText));
  log("ứng viên: " + JSON.stringify(cands));
  await p.locator("text=Hiển thị toàn bộ").last().click({ timeout: 8000, force: true });
  await p.waitForTimeout(5000);
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(1200); }
  log("số 'Đăng vào ngày': " + (await p.evaluate(() => (document.body.innerText.match(/Đăng vào ngày/g) ?? []).length)));
  log("url: " + p.url());
});

await run("agoda", "https://www.agoda.com/vi-vn/secret-garden-hotel-binh-th-nh/hotel/ho-chi-minh-city-vn.html", async (p, log) => {
  const cands = await p.evaluate(() => [...document.querySelectorAll("button, a")]
    .filter((e) => /tiếp|sau|next|tất cả đánh giá|›|»/i.test(((e as HTMLElement).innerText ?? "") + (e.getAttribute("aria-label") ?? "")))
    .slice(0, 12).map((e) => `${e.tagName} [${e.getAttribute("aria-label") ?? ""}] [${e.getAttribute("data-element-name") ?? ""}] ${(e as HTMLElement).innerText.slice(0, 30)}`));
  log("ứng viên: " + JSON.stringify(cands));
});
await browser.close();
