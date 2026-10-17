// Máy chủ giả: đặt cookie y thuộc tính mặc định Better Auth (httpOnly, SameSite=Lax, Path=/), rồi
// trả lại những header request mang tới để biết cookie có đi theo request của extension không.
import http from "node:http";
export function start(port) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, "http://localhost");
    if (u.pathname === "/set") {
      res.setHeader("set-cookie", [
        "better-auth.session_token=DEVTOKEN; Path=/; HttpOnly; SameSite=Lax; Max-Age=600",
        "__Secure-better-auth.session_token=PRODTOKEN; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600",
      ]);
      res.setHeader("content-type", "text/html");
      return res.end("<h1>đã đặt cookie</h1>");
    }
    if (u.pathname === "/echo") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({
          method: req.method,
          cookie: req.headers.cookie ?? null,
          origin: req.headers.origin ?? null,
          secFetchSite: req.headers["sec-fetch-site"] ?? null,
          secFetchMode: req.headers["sec-fetch-mode"] ?? null,
        }));
      });
      return;
    }
    res.statusCode = 404; res.end("{}");
  });
  return new Promise((r) => srv.listen(port, "127.0.0.1", () => r(srv)));
}
