/* Nearby places from OpenStreetMap: Nominatim (geocode) + Overpass (places). No API keys.
   Results are cached in localStorage to respect the public servers' usage limits. */
import { CHAT_HTTP } from "./config.js";
const cache = {
  get(k, maxAgeMs) {
    try {
      const v = JSON.parse(localStorage.getItem(k));
      return v && Date.now() - v.t < maxAgeMs ? v.d : null;
    } catch {
      return null;
    }
  },
  set(k, d) {
    try {
      localStorage.setItem(k, JSON.stringify({ t: Date.now(), d }));
    } catch {}
  },
};

export async function geocode(place) {
  const key = "s2s_geo_" + place.toLowerCase().trim(),
    hit = cache.get(key, 30 * 864e5);
  if (hit) return hit;
  const r = await fetch(
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(place),
  );
  if (!r.ok) throw new Error("geocode");
  const [h] = await r.json();
  if (!h) return null;
  const out = { lat: +h.lat, lon: +h.lon };
  cache.set(key, out);
  return out;
}

export const distKm = (a, b) => {
  const R = 6371,
    rad = (x) => (x * Math.PI) / 180,
    dLat = rad(b.lat - a.lat),
    dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/* "Hidden" is a heuristic: named viewpoints, waterfalls, peaks, hot springs, caves and historic sites
      that have no Wikipedia or Wikidata link in OSM, so they are usually the lesser-known ones. */
const query = (c, r) => {
  const a = `(around:${r},${c.lat},${c.lon})`,
    lo = '[!"wikipedia"][!"wikidata"]["name"]';
  return `[out:json][timeout:25];(
       nwr["amenity"~"^(hospital|clinic)$"]${a};
       nwr["amenity"="pharmacy"]${a};
       nwr["tourism"~"^(hotel|guest_house|hostel)$"]["name"]${a};
       nwr["tourism"="viewpoint"]${lo}${a};
       nwr["natural"~"^(waterfall|peak|hot_spring|cave_entrance)$"]${lo}${a};
       nwr["historic"]${lo}${a};
     );out center 250;`;
};

const classify = (t) =>
  t.amenity === "pharmacy"
    ? ["pharmacy", "Pharmacy"]
    : /^(hospital|clinic)$/.test(t.amenity || "")
      ? ["hospital", t.amenity === "clinic" ? "Clinic" : "Hospital"]
      : /^(hotel|guest_house|hostel)$/.test(t.tourism || "")
        ? [
            "hotel",
            { hotel: "Hotel", guest_house: "Guest house", hostel: "Hostel" }[
              t.tourism
            ],
          ]
        : [
            "hidden",
            (t.natural || t.tourism || t.historic || "place")
              .replace(/_/g, " ")
              .replace(/^yes$/, "historic site"),
          ];

export async function fetchNearby(center, radius) {
  const key = `s2s_near_${center.lat.toFixed(3)}_${center.lon.toFixed(3)}_${radius}`,
    hit = cache.get(key, 6 * 36e5);
  if (hit) return hit;
  const viaWorker = !CHAT_HTTP.includes("YOUR-SUBDOMAIN");
  const direct = () =>
    fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query(center, radius)),
    });
  let res;
  if (viaWorker) {
    /* Worker first (cached, retries); the visitor's own connection is the fallback */
    try {
      res = await fetch(
        `${CHAT_HTTP}/nearby?lat=${center.lat}&lon=${center.lon}&r=${radius}`,
      );
    } catch {}
    if (!res || !res.ok) {
      try {
        res = await direct();
      } catch {}
    }
  } else res = await direct();
  if (!res || !res.ok)
    throw new Error("nearby " + (res ? res.status : "network"));
  const { elements } = await res.json();
  const items = elements
    .map((e) => {
      const t = e.tags || {},
        lat = e.lat ?? e.center?.lat,
        lon = e.lon ?? e.center?.lon,
        [type, kind] = classify(t);
      return {
        name: t.name || kind + " (unnamed)",
        lat,
        lon,
        type,
        kind,
        phone: t.phone || t["contact:phone"] || "",
        km: distKm(center, { lat, lon }),
      };
    })
    .filter((i) => i.lat != null && i.lon != null);
  cache.set(key, items);
  return items;
}
