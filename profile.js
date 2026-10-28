import { auth, db } from "./firebase.js";
import { collection, getDocs, getDoc, doc, setDoc, query, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { toast } from "./ui.js";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

const card = (t, role) => `<div class="request-card"><span class="request-status">${role}</span>
  <h3>${esc(t.tripName)}</h3><p>${esc(t.destination)}, ${esc(t.tripDate)}</p>
  <p><a href="trip.html?id=${esc(t.id)}" style="color:var(--accent);font-weight:600">View trip</a></p></div>`;

async function loadTrips(user) {
  try {
    const [mine, accepted] = await Promise.all([
      getDocs(query(collection(db, "trips"), where("createdBy", "==", user.uid))),
      getDocs(query(collection(db, "joinRequests"), where("userId", "==", user.uid), where("status", "==", "Accepted")))
    ]);
    const trips = new Map();
    mine.docs.forEach((d) => trips.set(d.id, { id: d.id, ...d.data(), role: "Organizer" }));
    const ids = [...new Set(accepted.docs.map((d) => d.data().tripId))].filter((id) => !trips.has(id));
    const joined = await Promise.all(ids.map((id) => getDoc(doc(db, "trips", id)).catch(() => null)));
    joined.forEach((s) => { if (s && s.exists()) trips.set(s.id, { id: s.id, ...s.data(), role: "Member" }); });

    const all = [...trips.values()], t0 = today();
    const up = all.filter((t) => (t.tripDate || "") >= t0).sort((a, b) => a.tripDate.localeCompare(b.tripDate));
    const done = all.filter((t) => (t.tripDate || "") < t0).sort((a, b) => b.tripDate.localeCompare(a.tripDate));
    $("upTrips").className = ""; $("doneTrips").className = "";
    $("upTrips").innerHTML = up.length ? up.map((t) => card(t, t.role)).join("") : `<p class="no-trips">No upcoming trips. <a href="trips.html" style="color:var(--accent)">Find one</a>.</p>`;
    $("doneTrips").innerHTML = done.length ? done.map((t) => card(t, t.role)).join("") : `<p class="no-trips">No completed trips yet.</p>`;
  } catch (e) {
    console.error(e);
    $("upTrips").innerHTML = $("doneTrips").innerHTML = `<p class="no-trips">Unable to load trips.</p>`;
  }
}

async function loadPrefs(user) {
  try {
    const s = await getDoc(doc(db, "users", user.uid)), p = s.exists() ? s.data().prefs || {} : {};
    if (p.planning) $("prefPlan").value = p.planning;
    if (p.comfort) $("prefComfort").value = p.comfort;
    if (p.transport) $("prefTransport").value = p.transport;
  } catch (e) { console.error(e); }
}

$("savePrefs").addEventListener("click", async () => {
  const user = auth.currentUser; if (!user) return;
  try {
    await setDoc(doc(db, "users", user.uid), { prefs: { planning: $("prefPlan").value, comfort: $("prefComfort").value, transport: $("prefTransport").value } }, { merge: true });
    toast("Preferences saved.");
  } catch (e) { console.error(e); toast("Unable to save preferences.", true); }
});

(async () => {
  await auth.authStateReady();
  const user = auth.currentUser; if (!user) return; /* script.js redirects to login */
  loadTrips(user); loadPrefs(user);
})();
