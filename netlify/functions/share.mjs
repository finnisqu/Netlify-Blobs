import { getStore } from "@netlify/blobs";
import { customAlphabet } from "nanoid";

// Short, URL-safe IDs (no lookalikes). 8 chars ≈ 47 bits.
const makeId = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", 8);

// Allow your Squarespace origins
const ALLOWED_ORIGINS = new Set([
  "https://www.worldstoneonline.com",
  "https://worldstoneonline.com",
  // add any preview/staging origins if you use them:
  // "https://worldstoneonline.squarespace.com"
]);

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.worldstoneonline.com";
  return {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    // optional: if you ever send cookies, also add:
    // "access-control-allow-credentials": "true"
  };
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  const CORS = corsHeaders(origin);
  const store = getStore({ name: "cadlite-shares" });

  // Preflight: MUST return the CORS headers
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: CORS });
  }

  try {
    if (req.method === "POST") {
      const { snapshot, ttlDays = 90 } = await req.json();
      if (!snapshot) {
        return new Response(JSON.stringify({ error: "Missing snapshot" }), { status: 400, headers: CORS });
      }

      const id = makeId();
      const envelope = {
        v: 1,
        createdAt: Date.now(),
        expiresAt: ttlDays ? Date.now() + ttlDays * 86400_000 : null,
        snapshot,
      };

      await store.set(id, JSON.stringify(envelope));
      const originUrl = new URL(req.url).origin;
      return new Response(JSON.stringify({ id, url: `${originUrl}/s/${id}` }), { status: 201, headers: CORS });
    }

    if (req.method === "GET") {
      const id = new URL(req.url).searchParams.get("id");
      if (!id) return new Response(JSON.stringify({ error: "Missing id" }), { status: 400, headers: CORS });

      const raw = await store.get(id);
      if (!raw) return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: CORS });

      const data = JSON.parse(raw);
      if (data.expiresAt && Date.now() > data.expiresAt) {
        return new Response(JSON.stringify({ error: "Expired" }), { status: 410, headers: CORS });
      }

      return new Response(JSON.stringify({ id, snapshot: data.snapshot }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS });
  } catch (e) {
    // IMPORTANT: include CORS even on errors
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: CORS });
  }
};
