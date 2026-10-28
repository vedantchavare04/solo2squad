import { geocode, fetchNearby, distKm } from "./nearby.js";
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const TYPES = {
  hospital: ["Hospitals", "#ff7847"],
  pharmacy: ["Pharmacies", "#2f6f4f"],
  hotel: ["Hotels", "#16201d"],
  hidden: ["Hidden places", "#9a6a12"],
};
const DEFAULT_SUB =
  "Hospitals, pharmacies, hotels and lesser-known places around the destination.";
let started = false,
  map,
  layer,
  destC,
  me = null,
  mode = "dest",
  origin,
  items = [],
  active = "hospital",
  radius = 5000,
  dest = "",
  markers = new Map();

window.addEventListener("trip-ready", (e) => {
  if (!started && e.detail.trip) {
    started = true;
    init(e.detail.trip.destination);
  }
});

function init(destination) {
  dest = destination;
  $("nearTabs").innerHTML = Object.entries(TYPES)
    .map(
      ([k, [l]]) =>
        `<button role="tab" class="ntab" data-k="${k}" aria-selected="${k === active}">${l} <span id="cnt_${k}"></span></button>`,
    )
    .join("");
  $("nearTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]");
    if (b) setTab(b.dataset.k);
  });
  $("nearR").addEventListener("change", () => {
    radius = +$("nearR").value;
    load();
  });
  $("nearLoc").addEventListener("click", toggleLocation);
  map = L.map("nearMap", { scrollWheelZoom: false }).setView([20.6, 78.9], 4);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  layer = L.layerGroup().addTo(map);
  load();
}
function setTab(k) {
  active = k;
  document
    .querySelectorAll(".ntab")
    .forEach((t) => t.setAttribute("aria-selected", t.dataset.k === k));
  render();
}

/* ---------- Current location ---------- */
function status(t) {
  $("nearMode").textContent = t;
}
function toggleLocation() {
  if (mode === "me") {
    mode = "dest";
    me = null;
    $("nearLoc").textContent = "Use my location";
    $("nearSub").textContent = DEFAULT_SUB;
    status("");
    return load();
  }
  if (!navigator.geolocation)
    return status("Your browser does not support location.");
  status("Waiting for location permission.");
  navigator.geolocation.getCurrentPosition(
    (p) => {
      me = { lat: p.coords.latitude, lon: p.coords.longitude };
      mode = "me";
      $("nearLoc").textContent = "Back to destination";
      $("nearSub").textContent =
        "Showing places near your current location. Your position stays in your browser; only an approximate area is sent to fetch map data.";
      status("");
      load();
    },
    (err) =>
      status(
        err.code === 1
          ? "Location is blocked. Allow it in your browser's site settings, then try again."
          : err.code === 3
            ? "Finding your location timed out. Try again."
            : "Your location is unavailable right now.",
      ),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

async function load() {
  $("nearBest").innerHTML = "";
  $("nearList").innerHTML =
    '<div class="skel" style="margin-bottom:10px;height:58px"></div>'.repeat(4);
  try {
    if (mode === "dest") destC = destC || (await geocode(dest));
    origin = mode === "me" ? me : destC;
    if (!origin)
      return msg(
        "Destination not found on the map",
        `We could not locate "${esc(dest)}". Try editing the trip's destination to a city or town name.`,
      );
    /* Location mode rounds to ~1 km so nearby visitors share cached results; distances still use the exact point. */
    const fetchAt =
      mode === "me"
        ? { lat: +origin.lat.toFixed(2), lon: +origin.lon.toFixed(2) }
        : origin;
    items = (await fetchNearby(fetchAt, radius)).map((i) => ({
      ...i,
      km: distKm(origin, i),
    }));
    render();
  } catch (e) {
    console.error(e);
    msg(
      "Unable to load nearby places",
      "The map data service is busy or unreachable.",
      true,
    );
  }
}
function msg(h, p, retry) {
  $("nearList").innerHTML =
    `<div class="empty"><h3>${h}</h3><p class="sub">${p}</p>${retry ? '<button class="btn" id="nearRetry">Try again</button>' : ""}</div>`;
  $("nearRetry")?.addEventListener("click", load);
}

function render() {
  Object.keys(TYPES).forEach(
    (k) =>
      ($("cnt_" + k).textContent = items.filter((i) => i.type === k).length),
  );
  /* Closest to you: nearest result of each type */
  const label = mode === "me" ? "Closest to you" : "Closest to the destination";
  const best = Object.keys(TYPES)
    .map((k) => [
      k,
      items.filter((i) => i.type === k).sort((a, b) => a.km - b.km)[0],
    ])
    .filter(([, i]) => i);
  $("nearBest").innerHTML = best.length
    ? `<h3 class="nb-h">${label}</h3><div class="nb">${best.map(([k, i]) => `<button type="button" class="nb-card" data-k="${k}"><span class="demo">${TYPES[k][0].replace(/s$/, "")}</span><strong>${esc(i.name)}</strong><span>${i.km.toFixed(1)} km away</span></button>`).join("")}</div>`
    : "";
  $("nearBest")
    .querySelectorAll(".nb-card")
    .forEach((b) =>
      b.addEventListener("click", () => {
        setTab(b.dataset.k);
        focus($("nearList").querySelector(".nitem"));
      }),
    );

  const list = items
    .filter((i) => i.type === active)
    .sort((a, b) => a.km - b.km)
    .slice(0, 30);
  layer.clearLayers();
  markers.clear();
  L.circleMarker([origin.lat, origin.lon], {
    radius: 8,
    color: "#16201d",
    weight: 3,
    fillColor: "#fff",
    fillOpacity: 1,
  })
    .bindTooltip(mode === "me" ? "You are here" : dest)
    .addTo(layer);
  list.forEach((i, n) =>
    markers.set(
      n,
      L.circleMarker([i.lat, i.lon], {
        radius: 8,
        color: "#fff",
        weight: 2,
        fillColor: TYPES[active][1],
        fillOpacity: 1,
      })
        .bindPopup(
          `<strong>${esc(i.name)}</strong><br>${esc(i.kind)}, ${i.km.toFixed(1)} km`,
        )
        .addTo(layer),
    ),
  );
  if (list.length)
    map.fitBounds(
      L.latLngBounds([
        [origin.lat, origin.lon],
        ...list.map((i) => [i.lat, i.lon]),
      ]),
      { padding: [30, 30], maxZoom: 15 },
    );
  else map.setView([origin.lat, origin.lon], 12);
  if (!list.length)
    return msg(
      `No ${TYPES[active][0].toLowerCase()} found within ${radius / 1000} km`,
      "Try a larger radius. Coverage depends on how well this area is mapped.",
    );
  $("nearList").innerHTML = list
    .map(
      (i, n) =>
        `<div class="nitem" tabindex="0" data-n="${n}" role="button" aria-label="Show ${esc(i.name)} on map"><div><strong>${esc(i.name)}</strong><span class="demo">${esc(i.kind)}${i.phone ? ", " + esc(i.phone) : ""}</span></div><div class="nr"><b>${i.km.toFixed(1)} km</b><a href="https://www.google.com/maps/dir/?api=1&destination=${i.lat},${i.lon}" target="_blank" rel="noopener noreferrer">Directions</a></div></div>`,
    )
    .join("");
}
const focus = (el) => {
  const n = el?.dataset?.n;
  if (n == null) return;
  const m = markers.get(+n);
  if (!m) return;
  map.setView(m.getLatLng(), 16);
  m.openPopup();
};
$("nearList").addEventListener("click", (e) => {
  if (!e.target.closest("a")) focus(e.target.closest(".nitem"));
});
$("nearList").addEventListener("keydown", (e) => {
  if (e.key === "Enter") focus(e.target.closest(".nitem"));
});

