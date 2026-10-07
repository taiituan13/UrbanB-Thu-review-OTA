// Lượt đo thứ ba: bấm mở khung review, ghi MỌI phản hồi (không chỉ JSON) có dấu review/comment.
import { chromium, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const OUT = "out/probe3"; await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const RX = /review|comment|graphql/i;

async function run(name: string, url: string, act: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const hits: Array<{ url: string; method: string; post: string | null; status: number; ct: string; size: number; body: string }> = [];
  page.on("response", async (r) => {
    if (!RX.test(r.url()) || /\.(js|css|png|jpg|svg|woff2?)(\?|$)/.test(r.url())) return;
    try { const body = await r.text(); hits.push({ url: r.url(), method: r.request().method(), post: r.request().postData(), status: r.status(), ct: r.headers()["content-type"] ?? "", size: body.length, body }); } catch {}
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch((e) => console.log(name, "goto", e.message.split("\n")[0]));
  await page.waitForTimeout(5000);
  const before = hits.length;
  await act(page).catch((e) => console.log(name, "act", (e as Error).message.split("\n")[0]));
  await page.waitForTimeout(3000);
  await writeFile(`${OUT}/${name}-hits.json`, JSON.stringify(hits, null, 1));
  await writeFile(`${OUT}/${name}.html`, await page.content());
  await writeFile(`${OUT}/${name}.txt`, await page.evaluate(() => document.body.innerText));
  await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
  console.log(name, { before, after: hits.length, list: hits.slice(before).map((h) => `${h.method} ${h.status} ${h.size} ${h.url.slice(0, 120)}`) });
  await ctx.close();
}

await run("booking", "https://www.booking.com/hotel/vn/secret-garden-binh-thanh.vi.html", async (p) => {
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(600); }
  await p.getByRole("button", { name: /Đọc tất cả đánh giá|Xem tất cả đánh giá|đánh giá của khách/i }).first().click({ timeout: 8000 })
    .catch(() => p.getByText(/Đánh giá của khách \(\d+\)/).first().click({ timeout: 8000 }));
  await p.waitForTimeout(4000);
  for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(1000); }
});

await run("trip", "https://vn.trip.com/hotels/ho-chi-minh-city-hotel-detail-131972816/secret-garden-hotel-binh-thanh/", async (p) => {
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(600); }
  await p.getByText("Hiển thị toàn bộ").first().click({ timeout: 8000 })
    .catch(() => p.getByText(/Tất cả đánh giá \(\d+\)/).first().click({ timeout: 8000 }));
  await p.waitForTimeout(4000);
  for (let i = 0; i < 5; i++) { await p.mouse.wheel(0, 1500); await p.waitForTimeout(1000); }
});

await run("agoda", "https://www.agoda.com/vi-vn/secret-garden-hotel-binh-th-nh/hotel/ho-chi-minh-city-vn.html", async (p) => {
  for (let i = 0; i < 8; i++) { await p.mouse.wheel(0, 1200); await p.waitForTimeout(700); }
  // nút sang trang review kế tiếp trong khung review của trang khách sạn
  await p.locator('[data-element-name="review-paginator-next"], [aria-label*="Trang tiếp"], [aria-label*="Next"]').first().click({ timeout: 8000 });
  await p.waitForTimeout(4000);
});
await browser.close();
