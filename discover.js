import { db } from "./firebase.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { baseCosts, imageFor } from "./providers.js";
const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const inr = (n) => "\u20B9" + Math.round(n).toLocaleString("en-IN");
let trips = [];
const price = (t) =>
  Object.values(baseCosts(t.destination)).reduce((a, c) => a + c, 0);
const taken = (t) => (Number.isInteger(t.memberCount) ? t.memberCount : 1);
const left = (t) => Math.max(0, t.maxMembers - taken(t));

async function load() {
  $("tripList").innerHTML = '<div class="skel"></div>'.repeat(3);
  try {
    trips = (await getDocs(collection(db, "trips"))).docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));
    render();
  } catch (e) {
    console.error(e);
    $("tripList").innerHTML =
      `<div class="empty"><h3>Unable to load trips</h3><p class="sub">Check your connection and try again.</p><button class="btn" id="retry">Retry</button></div>`;
    $("retry").onclick = load;
  }
}
function render() {
  const q = $("fSearch").value.toLowerCase().trim(),
    type = $("fType").value,
    from = $("fDate").value,
    max = +$("fBudget").value,
    spots = +$("fSpots").value,
    today = new Date().toISOString().slice(0, 10);
  let list = trips.filter(
    (t) =>
      ((t.destination || "") + " " + (t.tripName || ""))
        .toLowerCase()
        .includes(q) &&
      (!type || t.tripType === type) &&
      (!from || t.tripDate >= from) &&
      (!max || price(t) <= max) &&
      left(t) >= spots &&
      t.tripDate >= today,
  );
  const sort = $("fSort").value;
  const by = {
    value: (a, b) => price(a) / (1 + left(a)) - price(b) / (1 + left(b)),
    cost: (a, b) => price(a) - price(b),
    spots: (a, b) => left(b) - left(a),
    soon: (a, b) => a.tripDate.localeCompare(b.tripDate),
  };
  list.sort(by[sort] || by.soon);
  if (!list.length) {
    if (!trips.length) {
      $("tripList").innerHTML =
        `<div class="empty"><h3>No trips have been created yet</h3><p class="sub">Be the first. Create a trip and others can request to join.</p><a class="btn" href="create-trip.html">Plan a trip</a></div>`;
      return;
    }
    const active = [
      ["fSearch", q && `Destination: ${q}`, ""],
      ["fType", type && `Type: ${type}`, ""],
      ["fDate", from && `From: ${from}`, ""],
      ["fBudget", max && `Under \u20B9${max}`, ""],
      ["fSpots", spots && `${spots}+ open spots`, "0"],
    ].filter((a) => a[1]);
    $("tripList").innerHTML =
      `<div class="empty"><h3>No trips match these filters</h3><p class="sub">${trips.length} trip${trips.length === 1 ? "" : "s"} exist in total. Remove a filter to widen the search.</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:14px 0">${active.map((a) => `<button class="btn ghost" data-reset="${a[0]}" data-to="${a[2]}" style="padding:6px 12px">${esc(a[1])} &times;</button>`).join("")}</div>
      <button class="btn" id="clr">Clear all filters</button></div>`;
    $("clr").onclick = clear;
    document.querySelectorAll("[data-reset]").forEach(
      (b) =>
        (b.onclick = () => {
          $(b.dataset.reset).value = b.dataset.to;
          render();
        }),
    );
    return;
  }
  $("tripList").innerHTML = list
    .map((t) => {
      const l = left(t),
        s =
          l === 0
            ? ["Full", "full"]
            : l <= 2
              ? [`${l} left`, "near"]
              : [`${l} open`, "open"];
      return `<article class="card"><img src="${esc(imageFor(t, 600))}" alt="${esc(t.destination)}" loading="lazy"><div class="b">
    <span><span class="badge ${s[1]}">${s[0]}</span> <span class="badge">${esc(t.tripType)}</span></span><h3>${esc(t.tripName)}</h3>
    <div class="m">${esc(t.destination)}, ${esc(t.tripDate)}</div><div class="m">${taken(t)} of ${t.maxMembers} travelers</div>
    <div><strong>From ${inr(price(t))}</strong> <span class="m">per person, estimate</span></div></div>
    <div style="padding:0 16px 16px"><a class="btn" style="display:block;text-align:center" href="trip.html?id=${esc(t.id)}">View trip</a></div></article>`;
    })
    .join("");
}
function clear() {
  ["fSearch", "fType", "fDate", "fBudget", "fSpots"].forEach(
    (i) => ($(i).value = i === "fSpots" ? "0" : ""),
  );
  render();
}
document
  .querySelectorAll(".filters input,.filters select")
  .forEach((el) => el.addEventListener("input", render));
const q0 = new URLSearchParams(location.search).get("q");
if (q0) $("fSearch").value = q0;
const P = new URLSearchParams(location.search),
  dt = P.get("date"),
  n0 = +P.get("n");
if (dt) $("fDate").value = dt;
if (n0) $("fSpots").value = String([4, 2, 1].find((v) => v <= n0) || 0);
load();
