import { getStore } from "@netlify/blobs";
import { customAlphabet } from "nanoid";

const makeId = customAlphabet("23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", 8);

// allow both www and apex; add any preview/staging origin if needed
const ALLOWED_ORIGINS = new Set([
  "https://www.worldstoneonline.com",
  "https://worldstoneonline.com",
  // "https://worldstoneonline.squarespace.com"
]);

function cors(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://www.worldstoneonline.com";
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin"
  };
}

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  const CORS = cors(origin);
  const store = getStore({ name: "cadlite-shares" });

  // **Preflight**
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: CORS });
  }

  try {
    if (req.method === "POST") {
      // Accept both JSON and text/plain bodies
      let payload;
      const ct = (req.headers.get("content-type") || "").toLowerCase();
      payload = ct.includes("application/json") ? await req.json() : JSON.parse(await req.text());
      const { snapshot, ttlDays = 90 } = payload;
      if (!snapshot) return new Response(JSON.stringify({ error: "Missing snapshot" }), { status: 400, headers: CORS });

      const id = makeId();
      await store.set(id, JSON.stringify({
        v: 1,
        createdAt: Date.now(),
        expiresAt: ttlDays ? Date.now() + ttlDays * 86400_000 : null,
        snapshot
      }));

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
    return new Response(JSON.stringify({ error: String(e.message || e) }), { status: 500, headers: CORS });
  }
};
