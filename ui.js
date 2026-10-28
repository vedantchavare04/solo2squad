import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, query, where, onSnapshot, updateDoc, doc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const EMOJI = /[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F\u200D]/gu;
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function toast(msg, err) {
  let box = document.getElementById("toasts");
  if (!box) { box = Object.assign(document.createElement("div"), { id: "toasts" }); box.setAttribute("role", "status"); document.body.append(box); }
  const t = Object.assign(document.createElement("div"), { className: "toast" + (err ? " err" : ""), textContent: String(msg).replace(EMOJI, "").trim() });
  box.append(t); setTimeout(() => t.remove(), 3500);
}
window.alert = (m) => toast(m, /unable|cannot|incorrect|full|denied|fill|must|please|only/i.test(m));

const page = location.pathname.split("/").pop() || "index.html";
const BELL = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" style="margin:0"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
let unsub = null, open = false;

function bell(user) {
  unsub?.(); const box = document.getElementById("bellBox"); if (!box || !user) return;
  unsub = onSnapshot(query(collection(db, "notifications"), where("userId", "==", user.uid)), (s) => {
    const items = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 15);
    const unread = items.filter((i) => !i.read);
    box.innerHTML = `<button class="bell" aria-label="Notifications, ${unread.length} unread" aria-expanded="${open}">${BELL}${unread.length ? `<i>${unread.length}</i>` : ""}</button>
      <div class="panel" ${open ? "" : "hidden"}>${items.length ? items.map((i) => `<a href="${esc(i.link || "#")}" class="${i.read ? "" : "un"}">${esc(i.text)}</a>`).join("") : "<p>No notifications yet.</p>"}</div>`;
    box.querySelector("button").onclick = () => { open = !open; box.querySelector(".panel").hidden = !open; if (open) unread.forEach((i) => updateDoc(doc(db, "notifications", i.id), { read: true }).catch(() => {})); };
  }, () => {});
}

function render(user) {
  const nav = document.getElementById("nav"); if (!nav) return;
  const link = (h, l) => `<a class="l" href="${h}" ${h === page ? 'aria-current="page"' : ""}>${l}</a>`;
  nav.innerHTML = `<a class="logo" href="index.html">Solo<b>2</b>Squad</a><span id="bellBox" class="bellbox"></span><button class="burger" aria-label="Menu" aria-expanded="false">Menu</button><nav aria-label="Main">${link("trips.html", "Discover")}${link("create-trip.html", "Plan trip")}` +
    (user ? `${link("requests.html", "My trips")}${link("profile.html", "Profile")}<button class="l" id="navOut">Log out</button>` : `${link("login.html", "Log in")}${link("register.html", "Register")}`) + `</nav>`;
  nav.querySelector(".burger").onclick = (e) => { const o = nav.classList.toggle("open"); e.target.setAttribute("aria-expanded", o); };
  document.getElementById("navOut")?.addEventListener("click", async () => { await signOut(auth); location.href = "index.html"; });
  bell(user);
}
render(null); onAuthStateChanged(auth, render);