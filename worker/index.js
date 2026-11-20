// Reusable source entry; scripts/build.mjs inlines modules and local assets for deployment.
import { makeRelay } from "../relay.js";
import { policy } from "../headers.js";
const relay = makeRelay();
export default {
  async fetch(request, env) {
    const route = new URL(request.url).pathname;
    if (route.startsWith("/api/")) {
      const response = await relay(request, env.DB, {
        storage: "hosted",
        operatorToken: env.PRICHAT_OPERATOR_TOKEN,
      });
      return new Response(response.body, {
        status: response.status,
        headers: { ...policy, ...Object.fromEntries(response.headers) },
      });
    }
    const asset = ASSETS[route];
    if (!asset || !["GET", "HEAD"].includes(request.method))
      return new Response("Not found", { status: 404, headers: policy });
    const bytes =
      asset[1] === "base64"
        ? Uint8Array.from(atob(asset[2]), (c) => c.charCodeAt(0))
        : asset[2];
    return new Response(request.method === "HEAD" ? null : bytes, {
      headers: { ...policy, "Content-Type": asset[0] },
    });
  },
};
