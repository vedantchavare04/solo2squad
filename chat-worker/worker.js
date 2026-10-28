/* Cloudflare Worker + Durable Object: one chat room per trip (room id = trip_{tripId}).
   Firebase stays the source of truth for identity and membership; this only relays messages. */
const PROJECT = "solo2squad-a498f";
const JWK_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const b64 = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
const part = (s) => JSON.parse(new TextDecoder().decode(b64(s)));

/* Verify a Firebase ID token (RS256) with Google's public keys. Returns uid or null. */
async function verifyToken(token) {
  try {
    const [h, p, sig] = token.split(".");
    const header = part(h),
      payload = part(p),
      now = Date.now() / 1000;
    if (
      payload.aud !== PROJECT ||
      payload.iss !== `https://securetoken.google.com/${PROJECT}` ||
      payload.exp < now ||
      !payload.sub
    )
      return null;
    const { keys } = await (
      await fetch(JWK_URL, { cf: { cacheTtl: 3600 } })
    ).json();
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64(sig),
      new TextEncoder().encode(`${h}.${p}`),
    );
    return ok
      ? { uid: payload.sub, name: payload.name || payload.email || "Traveler" }
      : null;
  } catch {
    return null;
  }
}

/* Membership check: reuse the user's own token so Firestore rules apply. Creator or member doc = allowed. */
async function isMember(tripId, uid, token) {
  const get = (path) =>
    fetch(`${FS}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const m = await get(`trips/${tripId}/members/${uid}`);
  if (m.ok) return true;
  const t = await get(`trips/${tripId}`);
  return t.ok && (await t.json()).fields?.createdBy?.stringValue === uid;
}

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const overpassQuery = (lat, lon, r) => {
  const a = `(around:${r},${lat},${lon})`,
    lo = '[!"wikipedia"][!"wikidata"]["name"]';
  return `[out:json][timeout:20];(
       nwr["amenity"~"^(hospital|clinic)$"]${a};
       nwr["amenity"="pharmacy"]${a};
       nwr["tourism"~"^(hotel|guest_house|hostel)$"]["name"]${a};
       nwr["tourism"="viewpoint"]${lo}${a};
       nwr["natural"~"^(waterfall|peak|hot_spring|cave_entrance)$"]${lo}${a};
       nwr["historic"]${lo}${a};
     );out center 150;`;
};

/* GET /nearby?lat=&lon=&r= : server-side Overpass call, cached at the edge for 6 hours.
      Tries each public server, then one more round after a short wait; reports what failed. */
async function nearby(url, ctx) {
  const lat = +url.searchParams.get("lat"),
    lon = +url.searchParams.get("lon"),
    r = Math.min(+url.searchParams.get("r") || 5000, 20000);
  if (!isFinite(lat) || !isFinite(lon))
    return new Response("Bad request", { status: 400, headers: CORS });
  const key = new Request(
      `https://cache.local/nearby/${lat.toFixed(3)}/${lon.toFixed(3)}/${r}`,
    ),
    cache = caches.default;
  const hit = await cache.match(key);
  if (hit) return hit;
  const body = "data=" + encodeURIComponent(overpassQuery(lat, lon, r)),
    tried = [];
  for (let round = 0; round < 2; round++) {
    if (round) await new Promise((s) => setTimeout(s, 1500));
    for (const m of MIRRORS) {
      try {
        const res = await fetch(m, {
          method: "POST",
          body,
          signal: AbortSignal.timeout(20000),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "Solo2Squad/1.0 (+https://solo2squad-phi.vercel.app)",
          },
        });
        if (!res.ok) {
          tried.push(`${new URL(m).host}:${res.status}`);
          continue;
        }
        const text = await res.text();
        try {
          JSON.parse(text);
        } catch {
          tried.push(`${new URL(m).host}:bad-json`);
          continue;
        } /* Overpass sends HTML/XML errors with status 200 */
        const out = new Response(text, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=21600",
            ...CORS,
          },
        });
        ctx.waitUntil(cache.put(key, out.clone()));
        return out;
      } catch (e) {
        tried.push(`${new URL(m).host}:${e.name}`);
      }
    }
  }
  return new Response(JSON.stringify({ error: "busy", tried }), {
    status: 503,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization,Content-Type",
};
export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === "/nearby") return nearby(url, ctx);
    const m = url.pathname.match(/^\/chat\/([A-Za-z0-9_-]+)(\/system)?$/);
    if (!m) return new Response("Not found", { status: 404 });
    const sys = !!m[2];
    const token = sys
      ? (req.headers.get("Authorization") || "").replace("Bearer ", "")
      : url.searchParams.get("token") || "";
    const user = await verifyToken(token);
    if (!user)
      return new Response("Unauthorized", { status: 401, headers: CORS });
    const stub = env.ROOMS.get(env.ROOMS.idFromName("trip_" + m[1]));
    if (sys) {
      /* "member joined" messages: organizer only */
      const t = await fetch(`${FS}/trips/${m[1]}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!t.ok || (await t.json()).fields?.createdBy?.stringValue !== user.uid)
        return new Response("Forbidden", { status: 403, headers: CORS });
      const text = String((await req.json()).text || "").slice(0, 200);
      await stub.fetch("https://room/system", {
        method: "POST",
        body: JSON.stringify({ text }),
        headers: { "x-system": "1" },
      });
      return new Response("ok", { headers: CORS });
    }
    if (req.headers.get("Upgrade") !== "websocket")
      return new Response("Expected websocket", { status: 426 });
    if (!(await isMember(m[1], user.uid, token)))
      return new Response("Forbidden", { status: 403 });
    return stub.fetch(
      new Request(req, {
        headers: new Headers({
          ...Object.fromEntries(req.headers),
          "x-uid": user.uid,
          "x-name": encodeURIComponent(user.name),
        }),
      }),
    );
  },
};

export class ChatRoom {
  constructor(state) {
    this.state = state;
  }
  online() {
    return new Set(
      this.state.getWebSockets().map((w) => w.deserializeAttachment()?.uid),
    ).size;
  }
  broadcast(obj) {
    const s = JSON.stringify(obj);
    this.state.getWebSockets().forEach((w) => {
      try {
        w.send(s);
      } catch {}
    });
  }
  async fetch(req) {
    if (req.headers.get("x-system")) {
      const { text } = await req.json(),
        msg = { type: "message", system: true, text, ts: Date.now() };
      await this.state.storage.put(
        "log",
        ((await this.state.storage.get("log")) || []).concat(msg).slice(-100),
      );
      this.broadcast(msg);
      return new Response("ok");
    }
    const pair = new WebSocketPair(),
      [client, server] = Object.values(pair);
    const user = {
      uid: req.headers.get("x-uid"),
      name: decodeURIComponent(req.headers.get("x-name")),
    };
    this.state.acceptWebSocket(server);
    server.serializeAttachment(user);
    server.send(
      JSON.stringify({
        type: "history",
        messages: (await this.state.storage.get("log")) || [],
      }),
    );
    this.broadcast({ type: "presence", online: this.online() });
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, data) {
    const user = ws.deserializeAttachment();
    let text;
    try {
      text = String(JSON.parse(data).text || "")
        .trim()
        .slice(0, 1000);
    } catch {
      return;
    }
    if (!text) return;
    const msg = {
      type: "message",
      uid: user.uid,
      name: user.name,
      text,
      ts: Date.now(),
    };
    const log = ((await this.state.storage.get("log")) || [])
      .concat(msg)
      .slice(-100);
    await this.state.storage.put("log", log);
    this.broadcast(msg);
  }
  async webSocketClose(ws) {
    ws.close();
    this.broadcast({
      type: "presence",
      online: Math.max(0, this.online() - 1),
    });
  }
}
