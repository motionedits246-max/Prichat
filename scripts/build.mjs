import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
const root = new URL("../", import.meta.url),
  read = async (path) => readFile(new URL(path, root), "utf8");
const files = {
  "index.html": "text/html; charset=utf-8",
  "avatar.js": "text/javascript",
  "panels.js": "text/javascript",
  "app.js": "text/javascript",
  "activities.js": "text/javascript",
  "share.js": "text/javascript",
  "media.js": "text/javascript",
  "gifenc.js": "text/javascript",
  "crypto.js": "text/javascript",
  "style.css": "text/css",
  "avatars.webp": "image/webp",
  "lucide.svg": "image/svg+xml",
  "mark.svg": "image/svg+xml",
};
const assets = {};
for (const [name, type] of Object.entries(files)) {
  const image = name.endsWith(".webp");
  const data = await readFile(new URL("public/" + name, root));
  assets[name === "index.html" ? "/" : "/" + name] = [
    type,
    image ? "base64" : "text",
    data.toString(image ? "base64" : "utf8"),
  ];
}
const inline = async (file) =>
  (await read(file))
    .replace(/^import\s+\{[^}]*\}\s+from\s+"[^"]+";[ \t]*$/gm, "")
    .replace(/^export (?=(async |const |function ))/gm, "");
const script = [
  "const ASSETS=" + JSON.stringify(assets) + ";",
  await inline("public/crypto.js"),
  await inline("headers.js"),
  await inline("relay.js"),
  await inline("worker/index.js"),
].join("\n");
const dest = new URL("dist/", root);
await mkdir(new URL("server/", dest), { recursive: true });
await mkdir(new URL(".openai/", dest), { recursive: true });
await writeFile(new URL("server/index.js", dest), script);
await cp(
  new URL(".openai/hosting.json", root),
  new URL(".openai/hosting.json", dest),
);
await cp(new URL("drizzle", root), new URL(".openai/drizzle", dest), {
  recursive: true,
});
