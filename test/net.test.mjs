// YC-158 (H-1539 lối 2): mọi lượt gọi mạng có hạn giờ — một lượt treo không được làm kẹt lượt quét sau.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isTimeout, withTimeout } from "../extension/quay/net.js";

const src = (p) => readFileSync(new URL(`../extension/${p}`, import.meta.url), "utf8");

test("withTimeout: quá hạn ⇒ ném lỗi hết giờ; xong trước hạn ⇒ trả kết quả và gỡ hẹn giờ", async () => {
  let cleared = 0;
  const timers = { setTimer: (fn) => (fn(), 1), clearTimer: () => cleared++ };
  await assert.rejects(withTimeout(new Promise(() => {}), 10, "Hết giờ chờ trang", timers), (e) => isTimeout(e) && /Hết giờ/.test(e.message));
  assert.equal(await withTimeout(Promise.resolve(7), 10_000, "x"), 7);
  assert.ok(cleared >= 1);
});

test("isTimeout nhận lỗi của AbortSignal.timeout, không nhận lỗi mạng thường", () => {
  assert.ok(isTimeout({ name: "TimeoutError", message: "signal timed out" }));
  assert.ok(isTimeout({ name: "AbortError" }));
  assert.ok(!isTimeout(new TypeError("Failed to fetch")));
});

test("🔴 mỗi fetch trong bộ quét kênh có hạn giờ riêng", () => {
  const s = src("scanners.js");
  const calls = s.match(/await fetch\(/g)?.length ?? 0;
  assert.ok(calls >= 7);
  assert.equal(s.match(/signal: AbortSignal\.timeout\(/g)?.length ?? 0, calls);
});

test("🔴 lượt gọi ra ngoài của service worker có hạn giờ: Sheet, GitHub, Hub, lượt chạy trong trang", () => {
  const bg = src("background.js");
  for (const line of bg.split("\n").filter((l) => /[^.\w]fetch\(/.test(l) && !/getURL\(/.test(l))) {
    assert.match(line, /signal: AbortSignal\.timeout\(/, line.trim());
  }
  assert.match(bg, /withTimeout\(run, PAGE_RUN_TIMEOUT_MS/);
  assert.match(src("quay/sw.js"), /init\.signal \?\? AbortSignal\.timeout\(HUB_TIMEOUT_MS\)/);
});
