import { getStore } from "@netlify/blobs";
import { customAlphabet } from "nanoid";

// short, URL-safe IDs (no lookalikes)
const makeId = customAlphabet(
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
  8
);

// 👇 Set this to your live Squarespace CAD-Lite page URL (no trailing slash)
const APP_URL = "https://YOUR-SQUARESPACE-DOMAIN.com/cad-lite";

const CORS = {
  "content-type": "application/json; charset=utf-8",
  // In production, replace '*' with your Squarespace origin to lock it down.
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type"
};

export default async (req, ctx) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: CORS });
  }

  const store = getStore("cadlite-shares"); // creates/uses a site-wide store

  try {
    if (req.method === "POST") {
      const { snapshot, ttlDays = 90 } = await req.json();
      if (!snapshot) {
        return new Response(JSON.stringify({ error: "Missing snapshot" }), {
          status: 400,
          headers: CORS
        });
      }

      const id = makeId();
      const envelope = {
        v: 1,
        createdAt: Date.now(),
        expiresAt: ttlDays ? Date.now() + ttlDays * 86400_000 : null,
        snapshot
      };

      await store.set(id, JSON.stringify(envelope));

      // Short link lives on this Netlify site as /s/:id
      const url = `${new URL(req.url).origin}/s/${id}`;
      return new Response(JSON.stringify({ id, url }), {
        status: 201,
        headers: CORS
      });
    }

    if (req.method === "GET") {
      const id = new URL(req.url).searchParams.get("id");
      if (!id) {
        return new Response(JSON.stringify({ error: "Missing id" }), {
          status: 400,
          headers: CORS
        });
      }

      const raw = await store.get(id);
      if (!raw) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: CORS
        });
      }

      const data = JSON.parse(raw);
      if (data.expiresAt && Date.now() > data.expiresAt) {
        return new Response(JSON.stringify({ error: "Expired" }), {
          status: 410,
          headers: CORS
        });
      }

      return new Response(JSON.stringify({ id, snapshot: data.snapshot }), {
        status: 200,
        headers: CORS
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: CORS
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 500,
      headers: CORS
    });
  }
};

