import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, getDocs, addDoc, collection, query, where, serverTimestamp, onSnapshot, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getPackages, baseCosts, MODES, recommend, imageFor } from "./providers.js";
import { notify } from "./notify.js";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "\u20B9" + Math.round(n).toLocaleString("en-IN");
const ICON = { pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4", cal: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", users: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8", user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8" };
const ic = (k) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;

function toast(msg, err) { const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg; $("toasts").append(t); setTimeout(() => t.remove(), 3500); }

const tripId = new URLSearchParams(location.search).get("id");
let trip = null, members = [], user = null, lastScore = 0;

async function load() {
  await auth.authStateReady(); user = auth.currentUser;
  if (!tripId) return fail("No trip selected.");
  try {
    const snap = await getDoc(doc(db, "trips", tripId));
    if (!snap.exists()) return fail("This trip no longer exists.");
    trip = { id: snap.id, ...snap.data() };
    await loadMembers();
    renderHero(); renderSquad(); initCompare(); initCalc(); announce();
  } catch (e) { console.error(e); fail("Unable to load trip."); }
}
function fail(msg) { toast(msg, true); $("hero").innerHTML = `<div><h1>${esc(msg)}</h1><p><a href="trips.html" style="color:#fff">Back to Discover</a></p></div>`; }

function loadMembers() {
  let first = true;
  const apply = (docs) => {
    members = docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.seatNumber || 0) - (b.seatNumber || 0));
    if (!members.some((m) => m.id === trip.createdBy)) members.unshift({ id: trip.createdBy, name: trip.createdByEmail || "Organizer", role: "creator", seatNumber: 1 });
  };
  return new Promise((res) => onSnapshot(collection(db, "trips", tripId, "members"),
    (s) => { apply(s.docs); if (first) { first = false; res(); } else { renderHero(); renderSquad(); announce(); } },
    () => { if (first) { first = false; apply([]); res(); } }));
}

const spots = () => Math.max(0, trip.maxMembers - members.length);
const state = () => (spots() === 0 ? ["Full", "full"] : spots() <= 2 ? ["Nearly full", "near"] : ["Open", "open"]);

function renderHero() {
  const [label, cls] = state();
  $("hero").style.backgroundImage = `url('${imageFor(trip, 1600)}')`;
  const org = user && user.uid === trip.createdBy;
  $("hero").innerHTML = `<div><span class="badge ${cls}">${label}</span><h1 style="margin-top:12px">${esc(trip.tripName)}</h1>
  <div class="meta"><span>${ic("pin")}${esc(trip.destination)}</span><span>${ic("cal")}${esc(trip.tripDate)}</span><span>${ic("users")}${members.length} of ${trip.maxMembers} travelers</span><span>${ic("user")}${esc(trip.createdByEmail)}</span></div>
  <p style="max-width:560px;margin:14px 0 18px;opacity:.9">${esc(trip.description)}</p><button class="btn" id="joinBtn" ${spots() === 0 ? "disabled" : ""}>${spots() === 0 ? "Squad full" : "Join squad"}</button>${org ? '<button class="btn ghost" id="editBtn" style="color:#fff;border-color:#fff;margin-left:8px">Edit</button><button class="btn ghost" id="delBtn" style="color:#fff;border-color:#fff;margin-left:8px">Delete</button>' : ""}</div><div class="ring" id="ring"></div>`;
  $("joinBtn").onclick = openJoin; setRing(lastScore);
  $("editBtn")?.addEventListener("click", () => { const f = $("editForm"); f.tripName.value = trip.tripName; f.tripDate.value = trip.tripDate; f.description.value = trip.description || ""; f.maxMembers.value = trip.maxMembers; $("editDlg").showModal(); });
  $("delBtn")?.addEventListener("click", () => $("confirmDlg").showModal());
}

function renderSquad() {
  const [label] = state();
  $("squadSub").textContent = `${members.length} of ${trip.maxMembers} filled, ${spots()} open. ${label}.`;
  const init = (n) => String(n || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  $("seats").innerHTML = Array.from({ length: trip.maxMembers }, (_, i) => {
    const m = members[i];
    if (!m) return `<div class="seat" role="listitem" aria-label="Open spot"></div>`;
    const cls = ["seat", "on", m.role === "creator" ? "host" : "", user && m.id === user.uid ? "me" : ""].join(" ");
    return `<button class="${cls}" role="listitem" data-i="${i}" aria-label="${esc(m.name)}">${esc(init(m.name))}</button>`;
  }).join("");
  document.querySelectorAll(".seat.on").forEach((b) => b.addEventListener("click", () => {
    const m = members[b.dataset.i];
    $("tip").textContent = `${m.name}${m.role === "creator" ? " (organizer)" : ""}${user && m.id === user.uid ? ", you" : ""}`;
  }));
}

function openJoin() {
  if (!user) { location.href = "login.html"; return; }
  if (user.uid === trip.createdBy) return toast("You organize this trip.");
  const share = baseCosts(trip.destination); const total = Object.values(share).reduce((a, c) => a + c, 0);
  $("joinBody").innerHTML = `<p><strong>${esc(trip.tripName)}</strong>, ${esc(trip.destination)}, ${esc(trip.tripDate)}</p>
  <p class="sub">${members.length} of ${trip.maxMembers} travelers. ${spots()} spots open.</p>
  <label for="jPlan">Planning style</label><select id="jPlan"><option value="diy">I plan everything</option><option value="help">Help me plan</option><option value="package">I prefer a package</option></select>
  <label for="jComfort">Comfort</label><select id="jComfort"><option value="cheapest">Budget</option><option value="balanced" selected>Balanced</option><option value="premium">Premium</option></select>
  <p>Estimated self-plan share: <strong>${inr(total)}</strong> <span class="demo">(estimate)</span></p>`;
  $("joinDlg").showModal();
  getDoc(doc(db, "users", user.uid)).then((s) => { const p = s.exists() ? s.data().prefs : null; if (p) { if (p.planning) $("jPlan").value = p.planning; if (p.comfort) $("jComfort").value = p.comfort; } }).catch(() => {});
}
$("jCancel").onclick = () => $("joinDlg").close();
$("jSend").onclick = async () => {
  $("jSend").disabled = true;
  try {
    if (spots() === 0) throw new Error("full");
    const dup = await getDocs(query(collection(db, "joinRequests"), where("tripId", "==", tripId), where("userId", "==", user.uid)));
    if (!dup.empty) { toast("You already sent a request."); return $("joinDlg").close(); }
    const profile = await getDoc(doc(db, "users", user.uid)); const p = profile.exists() ? profile.data() : {};
    await addDoc(collection(db, "joinRequests"), { tripId, tripName: trip.tripName, tripCreator: trip.createdBy, userId: user.uid, userEmail: user.email || "", userName: p.name || user.email || "Traveler", userCity: p.city || "", status: "Pending", estShare: Object.values(baseCosts(trip.destination)).reduce((a, c) => a + c, 0), prefs: { planning: $("jPlan").value, comfort: $("jComfort").value }, createdAt: serverTimestamp() });
    notify(trip.createdBy, `${p.name || user.email} requested to join ${trip.tripName}.`, "requests.html");
    toast("Join request sent."); $("joinDlg").close();
  } catch (e) { toast(e.message === "full" ? "Trip is already full." : "Unable to send request.", true); }
  finally { $("jSend").disabled = false; }
};

let packages = [];
async function initCompare() {
  packages = await getPackages(trip.destination, { days: 4 });
  ["pTravelers", "pBudget", "pPlanning", "pComfort"].forEach((id) => $(id).addEventListener("input", renderCompare));
  renderCompare();
}
function selfOption() {
  const mult = MODES[$("pComfort").value]; const t = Object.values(baseCosts(trip.destination)).reduce((a, c) => a + c, 0);
  return { provider: "Self plan", self: true, duration: 4, pricePerPerson: Math.round(t * mult), flexibilityScore: 95, planningEffortScore: 25, activitiesIncluded: 2, meals: "You choose", cancellation: "Your bookings", support: "None", transportIncluded: false, accommodationIncluded: false };
}
function renderCompare() {
  const prefs = { travelers: +$("pTravelers").value || 1, budget: +$("pBudget").value, planning: $("pPlanning").value, comfort: $("pComfort").value };
  const { scored, top, reasons } = recommend([selfOption(), ...packages], prefs);
  const self = scored.find((o) => o.self); lastScore = top.total; setRing(lastScore);
  $("cmp").innerHTML = scored.map((o) => `<article class="opt ${o === top ? "top" : ""}"><strong>${esc(o.provider)}</strong> ${o === top ? '<span class="badge">Recommended</span>' : ""}
  <div class="p">${inr(o.pricePerPerson)}</div><div class="sub" style="margin:0">per person, ${inr(o.pricePerPerson * prefs.travelers)} for ${prefs.travelers}</div>
  <dl><div><dt>Duration</dt><dd>${o.duration} days</dd></div><div><dt>Transport</dt><dd>${o.transportIncluded ? "Included" : "Custom"}</dd></div>
  <div><dt>Hotel</dt><dd>${o.accommodationIncluded ? "Included" : "Custom"}</dd></div><div><dt>Meals</dt><dd>${esc(o.meals)}</dd></div>
  <div><dt>Activities</dt><dd>${o.activitiesIncluded}</dd></div><div><dt>Flexibility</dt><dd>${o.flexibilityScore}/100</dd></div>
  <div><dt>Planning effort</dt><dd>${o.planningEffortScore >= 95 ? "Very low" : o.planningEffortScore > 60 ? "Low" : "High"}</dd></div>
  <div><dt>Cancellation</dt><dd>${esc(o.cancellation)}</dd></div><div><dt>Score</dt><dd>${o.total}/100</dd></div></dl></article>`).join("");
  const diff = top.self ? "" : `<p>For ${inr(top.pricePerPerson - self.pricePerPerson)} more per person than self-planning, ${esc(top.provider)} includes transport, hotel, ${esc(top.meals.toLowerCase())} and ${top.activitiesIncluded} activities.</p>`;
  $("why").hidden = false;
  $("why").innerHTML = `<strong>Why ${esc(top.provider)}?</strong><ul>${(reasons.length ? reasons : ["Best overall score for your preferences"]).map((r) => `<li>${esc(r)}</li>`).join("")}</ul>${diff}`;
}

const LINES = [["transport", "Transport", "#16201d"], ["hotel", "Accommodation", "#c9531a"], ["food", "Food", "#7a8a82"], ["local", "Local transport", "#b9bbb5"], ["activities", "Activities", "#d9a37f"]];
function initCalc() {
  const b = baseCosts(trip.destination);
  $("rows").innerHTML = `<div class="row" style="border:0;color:var(--ink2);font-size:12px"><span></span><span>Qty</span><span class="a">Unit (INR)</span></div>` +
    LINES.map(([k, l]) => `<div class="row"><label for="q_${k}">${l}</label><input id="q_${k}" type="number" min="0" value="1"><input id="u_${k}" type="number" min="0" value="${b[k]}" aria-label="${l} unit cost"></div>`).join("");
  $("rows").addEventListener("input", calc); $("pTravelers").addEventListener("input", calc);
  $("legendCost").innerHTML = LINES.map(([, l, c]) => `<span><i style="display:inline-block;width:9px;height:9px;background:${c};margin-right:6px"></i>${l}</span>`).join("");
  calc();
}
let shown = 0;
function calc() {
  const vals = LINES.map(([k]) => (+$("q_" + k).value || 0) * (+$("u_" + k).value || 0)), total = vals.reduce((a, c) => a + c, 0);
  $("bar").innerHTML = LINES.map(([, , c], i) => `<i style="width:${total ? vals[i] / total * 100 : 0}%;background:${c}"></i>`).join("");
  const n = +$("pTravelers").value || 1; $("totSub").textContent = `per person. ${inr(total * n)} for ${n} travelers. Estimate.`;
  const from = shown, t0 = performance.now(); /* count-up animation */
  (function step(t) { const p = Math.min(1, (t - t0) / 250); $("tot").textContent = inr(from + (total - from) * p); if (p < 1) requestAnimationFrame(step); else shown = total; })(t0);
}

const announce = () => window.dispatchEvent(new CustomEvent("trip-ready", { detail: { trip, members, user } }));
onAuthStateChanged(auth, (u) => { user = u; if (trip) { renderHero(); renderSquad(); announce(); } });
load();

function setRing(s) {
  const el = $("ring"); if (!el || !s) return; const c = 2 * Math.PI * 26;
  el.innerHTML = `<svg width="72" height="72" viewBox="0 0 64 64" role="img" aria-label="Trip score ${s} out of 100"><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="4"/><circle cx="32" cy="32" r="26" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c * s / 100} ${c}" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" fill="#fff" font-size="16" font-weight="600">${s}</text></svg><div>Trip score</div>`;
}

$("editCancel").onclick = () => $("editDlg").close();
$("confCancel").onclick = () => $("confirmDlg").close();
$("editForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target, max = +f.maxMembers.value;
  if (max < members.length || max > 20) return toast(`Group size must be between ${members.length} and 20.`, true);
  try {
    const patch = { tripName: f.tripName.value.trim(), tripDate: f.tripDate.value, description: f.description.value.trim(), maxMembers: max };
    await updateDoc(doc(db, "trips", tripId), patch); Object.assign(trip, patch);
    $("editDlg").close(); renderHero(); renderSquad(); toast("Trip updated.");
  } catch { toast("Unable to update trip.", true); }
});
$("confDelete").onclick = async () => {
  try {
    for (const sub of ["itinerary", "expenses", "members"]) { const s = await getDocs(collection(db, "trips", tripId, sub)); await Promise.all(s.docs.map((d) => deleteDoc(d.ref))); }
    const rq = await getDocs(query(collection(db, "joinRequests"), where("tripId", "==", tripId), where("tripCreator", "==", user.uid)));
    await Promise.all(rq.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "trips", tripId)); location.href = "trips.html";
  } catch { toast("Unable to delete trip.", true); }
};