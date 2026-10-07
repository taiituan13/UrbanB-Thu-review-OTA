// Lượt đo một lần: mở trang khách sạn trên từng kênh như một người xem, ghi lại
// mọi phản hồi JSON mà chính trang tự tải, để biết review nằm ở đâu.
// Không vượt captcha, không né chặn: gặp trang thử thách thì ghi lại và đi tiếp.
import { chromium, type Response } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const targets: Array<{ channel: string; url: string }> = JSON.parse(process.argv[2] ?? "[]");
const OUT = "out/probe";
const CHALLENGE = /captcha|verify you are (a )?human|access denied|are you a robot|unusual traffic|px-captcha|challenge-platform/i;

const browser = await chromium.launch({ headless: true });
for (const { channel, url } of targets) {
  const dir = join(OUT, channel);
  await mkdir(dir, { recursive: true });
  const ctx = await browser.newContext({ locale: "vi-VN", viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const captured: Array<{ url: string; status: number; size: number; file: string }> = [];
  let n = 0;
  page.on("response", async (res: Response) => {
    const ct = res.headers()["content-type"] ?? "";
    if (!ct.includes("json")) return;
    try {
      const body = await res.text();
      const file = `res-${String(++n).padStart(3, "0")}.json`;
      await writeFile(join(dir, file), body);
      captured.push({ url: res.url(), status: res.status(), size: body.length, file });
    } catch {}
  });
  let status = 0;
  try {
    const r = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    status = r?.status() ?? 0;
    await page.waitForTimeout(4000);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 1200); await page.waitForTimeout(800); }
  } catch (e) { console.log(channel, "lỗi tải:", (e as Error).message.split("\n")[0]); }
  const html = await page.content();
  await writeFile(join(dir, "page.html"), html);
  await page.screenshot({ path: join(dir, "page.png") }).catch(() => {});
  const text = await page.evaluate(() => document.body?.innerText ?? "");
  await writeFile(join(dir, "page.txt"), text);
  await writeFile(join(dir, "responses.json"), JSON.stringify(captured, null, 2));
  console.log(JSON.stringify({ channel, status, finalUrl: page.url(), title: await page.title(),
    challenge: CHALLENGE.test(html.slice(0, 200_000)), jsonResponses: captured.length, textLen: text.length }));
  await ctx.close();
}
await browser.close();
