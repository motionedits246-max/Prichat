import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { once } from "node:events";
import { makeDevice, loginProof, signText } from "../public/crypto.js";

for (const customOrigin of ["", "https://rooms.example.test/"]) {
  test(
    "Railway HTTPS identity flow with " +
      (customOrigin ? "custom origin" : "generated domain"),
    { timeout: 15000 },
    async () => {
      const domain = "prichat.up.railway.app";
      const origin = new URL(customOrigin || "https://" + domain).origin;
      const server = spawn(
        process.execPath,
        ["server.mjs", "--host", "127.0.0.1", "--port", "0"],
        {
          cwd: new URL("../", import.meta.url),
          env: {
            ...process.env,
            RAILWAY_PUBLIC_DOMAIN: domain,
            PUBLIC_ORIGIN: customOrigin,
            PRICHAT_BADGE_DB: ":memory:",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      const done = once(server, "exit");
      try {
        const lines = createInterface({ input: server.stdout });
        const [line] = await once(lines, "line");
        const local = line.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
        const post = (path, body, site = origin) =>
          fetch(local + "/api/" + path, {
            method: "POST",
            headers: {
              Origin: site,
              "Content-Type": "application/json",
              "X-Forwarded-Proto": "https",
              "X-Forwarded-Host": "untrusted.example",
            },
            body: JSON.stringify(body),
          });
        assert.equal((await post("info", {})).status, 200);
        assert.equal(
          (await post("challenge", {}, "https://untrusted.example")).status,
          403,
        );
        const device = await makeDevice();
        const response = await post("challenge", {});
        assert.equal(response.status, 200);
        const { nonce } = await response.json();
        const proof = await signText(device.signKey, loginProof(origin, nonce));
        const session = await post("session", {
          nonce,
          proof,
          box: device.box,
          sign: device.sign,
        });
        assert.equal(session.status, 200);
        assert.equal((await session.json()).code, device.code);
      } finally {
        server.kill();
        await done;
      }
    },
  );
}
