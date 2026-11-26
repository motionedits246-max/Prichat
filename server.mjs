import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { openStore } from "./node-store.mjs";
import { makeRelay, sweep } from "./relay.js";
import { policy } from "./headers.js";
const db = openStore(
    process.env.PRICHAT_BADGE_DB ||
      resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH || "data", "badges.sqlite"),
  ),
  relay = makeRelay();
const assets = new Map([
  ["/", "index.html"],
  ["/avatar.js", "avatar.js"],
  ["/panels.js", "panels.js"],
  ["/vault.js", "vault.js"],
  ["/picker.js", "picker.js"],
  ["/picker-art.js", "picker-art.js"],
  ["/app.js", "app.js"],
  ["/activities.js", "activities.js"],
  ["/share.js", "share.js"],
  ["/media.js", "media.js"],
  ["/gifenc.js", "gifenc.js"],
  ["/crypto.js", "crypto.js"],
  ["/style.css", "style.css"],
  ["/avatars.webp", "avatars.webp"],
  ["/lucide.svg", "lucide.svg"],
  ["/mark.svg", "mark.svg"],
]);
const mime = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  webp: "image/webp",
  svg: "image/svg+xml",
};
function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i < 0 ? undefined : process.argv[i + 1];
}
const host =
    arg("--host") ||
    process.env.HOST ||
    (process.env.RAILWAY_ENVIRONMENT_ID ? "0.0.0.0" : "127.0.0.1"),
  port = Number(arg("--port") || process.env.PORT || 5173);
// Railway supplies the public DNS name while its edge terminates HTTPS.
const configured =
  process.env.PUBLIC_ORIGIN ||
  (process.env.RAILWAY_PUBLIC_DOMAIN &&
    "https://" + process.env.RAILWAY_PUBLIC_DOMAIN);
function canonicalOrigin(value) {
  if (!value) return "";
  const u = new URL(value);
  if (
    !["http:", "https:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== "/"
  )
    throw Error("Set PUBLIC_ORIGIN to the public origin, without a path.");
  return u.origin;
}
const publicOrigin = canonicalOrigin(configured);
const server = http.createServer(async (req, res) => {
  try {
    // The preview gateway terminates TLS. Self-hosters set their canonical HTTPS origin explicitly.
    const proto =
      process.env.SITES_MANAGED_LINUX_CONTAINER === "1" &&
      req.headers["x-forwarded-proto"] === "https"
        ? "https"
        : "http";
    const origin = publicOrigin || proto + "://" + req.headers.host;
    const url = new URL(req.url, origin);
    if (url.origin !== origin) throw Error("Origin mismatch");
    let response;
    if (url.pathname.startsWith("/api/")) {
      const init = { method: req.method, headers: req.headers };
      if (!["GET", "HEAD"].includes(req.method)) {
        init.body = Readable.toWeb(req);
        init.duplex = "half";
      }
      response = await relay(new Request(url, init), db, {
        storage: "memory",
        operatorToken: process.env.PRICHAT_OPERATOR_TOKEN,
      });
    } else if (
      assets.has(url.pathname) &&
      ["GET", "HEAD"].includes(req.method)
    ) {
      const name = assets.get(url.pathname),
        bytes = await readFile(resolve("public", name));
      response = new Response(req.method === "HEAD" ? null : bytes, {
        headers: { "Content-Type": mime[name.split(".").pop()] },
      });
    } else response = new Response("Not found", { status: 404 });
    res.writeHead(response.status, {
      ...policy,
      ...Object.fromEntries(response.headers),
    });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(400, policy);
    res.end("Invalid request.");
  }
});
setInterval(() => sweep(db).catch(() => {}), 5000).unref();
server.listen(port, host, () =>
  console.log(
    "PriChat listening at http://" + host + ":" + server.address().port,
  ),
);
