// Máy ghi extranet — chạy trên máy của người quản trị để ĐO, chưa phải bộ đồng bộ.
//
// Mở Chrome thật với một hồ sơ riêng (.profile/, tách khỏi Chrome hằng ngày), mở sẵn
// trang đăng nhập các extranet. NGƯỜI tự đăng nhập (mật khẩu + mã hai lớp) và tự bấm
// vào trang review. Script không gõ, không bấm gì: nó chỉ ghi lại những phản hồi có
// dấu review mà trang tự tải, cộng chữ trên trang review, để biết bộ đồng bộ phải đọc
// ở đâu. Đóng cửa sổ trình duyệt là kết thúc.
//
// Hồ sơ giữ phiên đăng nhập cho lần sau. Dữ liệu ghi ra out/extranet/ chứa tên khách:
// chỉ nằm trên máy này (out/ và .profile/ đều gitignore).
import { chromium, type Page, type Response } from "playwright";
import { mkdir, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";

const EXTRANETS = [
  "https://admin.booking.com/",
  "https://ycs.agoda.com/",
  "https://www.expediapartnercentral.com/",
  "https://ebooking.trip.com/",
  "https://tera.traveloka.com/",
];
const OUT = "out/extranet";
const MARK = /review|comment|feedback|rating|danh-gia|evaluat/i;
const STATIC = /\.(js|css|png|jpe?g|webp|gif|svg|woff2?|ico|map)(\?|$)/i;

await mkdir(OUT, { recursive: true });
const ctx = await chromium.launchPersistentContext(".profile", {
  channel: "chrome",
  headless: false,
  locale: "vi-VN",
  viewport: null,
});
let n = 0;

async function onResponse(res: Response) {
  const url = res.url();
  if (!MARK.test(url) || STATIC.test(url)) return;
  const ct = res.headers()["content-type"] ?? "";
  if (!/json|html|text/.test(ct)) return;
  try {
    const body = await res.text();
    const host = new URL(url).hostname;
    const dir = join(OUT, host);
    await mkdir(dir, { recursive: true });
    const file = `${String(++n).padStart(4, "0")}.${ct.includes("json") ? "json" : "txt"}`;
    await writeFile(join(dir, file), body);
    await appendFile(join(OUT, "index.tsv"),
      [new Date().toISOString(), host, file, res.request().method(), res.status(), body.length, url.slice(0, 300)].join("\t") + "\n");
  } catch {}
}

async function onLoad(page: Page) {
  const url = page.url();
  if (!MARK.test(url)) return;
  await page.waitForTimeout(4000);
  try {
    const host = new URL(url).hostname;
    await mkdir(join(OUT, host), { recursive: true });
    const stamp = Date.now();
    await writeFile(join(OUT, host, `page-${stamp}.txt`), `${url}\n\n` + (await page.evaluate(() => document.body.innerText)));
    await writeFile(join(OUT, host, `page-${stamp}.html`), await page.content());
    console.log("đã chụp trang review:", url.slice(0, 120));
  } catch {}
}

function watch(page: Page) {
  page.on("response", onResponse);
  page.on("load", () => void onLoad(page));
}
ctx.pages().forEach(watch);
ctx.on("page", watch);

const first = ctx.pages()[0] ?? (await ctx.newPage());
await first.goto(EXTRANETS[0]!);
for (const url of EXTRANETS.slice(1)) await (await ctx.newPage()).goto(url).catch(() => {});

console.log("Đã mở các extranet. Hãy tự đăng nhập, rồi bấm vào trang review của từng kênh,");
console.log("lật thử sang trang 2. Xong thì đóng cửa sổ trình duyệt.");
await new Promise<void>((resolve) => ctx.on("close", () => resolve()));
console.log(`Kết thúc. Đã ghi ${n} phản hồi vào ${OUT}/index.tsv`);
