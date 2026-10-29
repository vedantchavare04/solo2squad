import { db } from "./firebase.js";
import { auth } from "./firebase.js";
import { collection, addDoc, getDocs, deleteDoc, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { CHAT_WS as CHAT_URL, CHAT_CONFIGURED } from "./config.js";

const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const inr = (n) => "\u20B9" + Math.round(n).toLocaleString("en-IN");
const toast = (m, e) => { const t = document.createElement("div"); t.className = "toast" + (e ? " err" : ""); t.textContent = m; $("toasts").append(t); setTimeout(() => t.remove(), 3500); };

let ctx = null, started = false, ws = null, lastN = 0;
let chatRetryTimer = null, chatRetryDelay = 2000, chatPageClosing = false;
window.addEventListener("trip-ready", (e) => {
  ctx = e.detail;
  const allowed = ctx.user && ctx.members.some((m) => m.id === ctx.user.uid);
  $("extras").hidden = !allowed;
  if (allowed && !started) { started = true; lastN = ctx.members.length; loadItinerary(); loadExpenses(); connectChat(); }
  else if (allowed && ctx.members.length !== lastN) { lastN = ctx.members.length; loadExpenses(); }
});
const isOrganizer = () => ctx.user.uid === ctx.trip.createdBy;
const base = () => ["trips", ctx.trip.id];

async function loadItinerary() {
  const s = await getDocs(collection(db, ...base(), "itinerary"));
  const days = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.day - b.day || String(a.time).localeCompare(String(b.time)));
  $("itinList").innerHTML = days.length ? days.map((d) => `<div class="row" style="grid-template-columns:60px 1fr auto auto"><strong>Day ${d.day}</strong><span>${esc(d.time)} ${esc(d.location)}: ${esc(d.activity)}${d.notes ? `<br><span class="demo">${esc(d.notes)}</span>` : ""}</span><span class="a">${d.cost ? inr(d.cost) : ""}</span>${isOrganizer() ? `<button class="btn ghost" data-del-it="${d.id}" aria-label="Remove">Remove</button>` : "<span></span>"}</div>`).join("") : `<p class="sub">No itinerary yet.${isOrganizer() ? " Add the first stop below." : " The organizer hasn't added stops."}</p>`;
  $("itinForm").hidden = !isOrganizer();
}
$("itinForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target;
  try {
    await addDoc(collection(db, ...base(), "itinerary"), { day: +f.day.value || 1, time: f.time.value, location: f.location.value.trim(), activity: f.activity.value.trim(), notes: f.notes.value.trim(), cost: +f.cost.value || 0, updatedAt: serverTimestamp() });
    f.reset(); toast("Itinerary stop added."); loadItinerary();
  } catch { toast("Unable to save stop.", true); }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-del-it]"); if (!b) return;
  try { await deleteDoc(doc(db, ...base(), "itinerary", b.dataset.delIt)); loadItinerary(); } catch { toast("Unable to remove stop.", true); }
});

async function loadExpenses() {
  const s = await getDocs(collection(db, ...base(), "expenses"));
  const items = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  const total = items.reduce((a, c) => a + c.amount, 0), n = ctx.members.length, share = total / n;
  const name = (uid) => ctx.members.find((m) => m.id === uid)?.name || "Member";
  const net = Object.fromEntries(ctx.members.map((m) => [m.id, -share]));
  items.forEach((i) => { net[i.paidBy] = (net[i.paidBy] ?? 0) + i.amount; });
  const debtors = Object.entries(net).filter(([, v]) => v < -1).map(([k, v]) => [k, -v]).sort((a, b) => b[1] - a[1]);
  const creditors = Object.entries(net).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
  const pay = [];
  for (const d of debtors) for (const c of creditors) { const x = Math.min(d[1], c[1]); if (x > 1) { pay.push(`${esc(name(d[0]))} owes ${esc(name(c[0]))} ${inr(x)}`); d[1] -= x; c[1] -= x; } }
  $("expSummary").innerHTML = `<div class="tot">${inr(total)}</div><div class="sub">${inr(share)} per person across ${n} members</div>` + (pay.length ? `<ul>${pay.map((p) => `<li>${p}</li>`).join("")}</ul>` : `<p class="sub">Everyone is settled.</p>`);
  $("expList").innerHTML = items.map((i) => `<div class="row" style="grid-template-columns:1fr auto auto"><span>${esc(i.label)} <span class="demo">paid by ${esc(name(i.paidBy))}</span></span><span class="a">${inr(i.amount)}</span>${i.paidBy === ctx.user.uid ? `<button class="btn ghost" data-del-ex="${i.id}">Remove</button>` : "<span></span>"}</div>`).join("");
}
$("expForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const f = e.target, amount = +f.amount.value;
  if (!(amount > 0)) return toast("Enter an amount above zero.", true);
  try { await addDoc(collection(db, ...base(), "expenses"), { label: f.label.value.trim(), amount, paidBy: ctx.user.uid, createdAt: serverTimestamp() }); f.reset(); toast("Expense recorded."); loadExpenses(); }
  catch { toast("Unable to record expense.", true); }
});
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-del-ex]"); if (!b) return;
  try { await deleteDoc(doc(db, ...base(), "expenses", b.dataset.delEx)); loadExpenses(); } catch { toast("Unable to remove expense.", true); }
});

/* ---------- Chat ---------- */
async function connectChat() {
  const log = $("chatLog"), line = (m) => {
    const mine = m.uid === ctx.user.uid, d = document.createElement("div");
    if (m.system) { d.className = "sys"; d.textContent = m.text; log.append(d); log.scrollTop = log.scrollHeight; return; }
    d.className = "msg" + (mine ? " mine" : "");
    const who = ctx.members.find((x) => x.id === m.uid)?.name || m.name;
    d.innerHTML = `<span class="demo">${mine ? "You" : esc(who)}, ${new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><div>${esc(m.text)}</div>`;
    log.append(d); log.scrollTop = log.scrollHeight;
  };
  if (!CHAT_CONFIGURED) { $("online").textContent = "Chat not set up"; log.innerHTML = '<div class="sys">Chat is not set up yet. Deploy the chat worker and set its address in config.js.</div>'; return; }
  if (!ctx?.user || !ctx?.trip?.id || chatPageClosing) return;
  if (ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(ws.readyState)) return;
  clearTimeout(chatRetryTimer);
  $("online").textContent = "Connecting…";
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("Sign in again to reconnect to chat.");
    const socket = new WebSocket(`${CHAT_URL}/chat/${encodeURIComponent(ctx.trip.id)}?token=${encodeURIComponent(token)}`);
    ws = socket;
    socket.onopen = () => { chatRetryDelay = 2000; };
    socket.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === "history") { log.innerHTML = ""; (m.messages || []).forEach(line); }
      else if (m.type === "message") line(m);
      else if (m.type === "presence") $("online").textContent = `${m.online} online`;
    };
    socket.onclose = (ev) => {
      if (ws === socket) ws = null;
      $("online").textContent = ev.code === 1000 ? "Disconnected" : "Reconnecting…";
      if (!chatPageClosing && ev.code !== 1000) scheduleChatReconnect();
    };
    socket.onerror = () => {
      $("online").textContent = "Connection issue";
      // Browsers conceal WebSocket HTTP error details; onclose schedules a retry.
    };
  } catch (error) {
    $("online").textContent = "Reconnecting…";
    log.innerHTML = `<div class="sys">${esc(error.message || "Chat connection failed.")} Retrying automatically.</div>`;
    scheduleChatReconnect();
  }
}

function scheduleChatReconnect() {
  if (chatPageClosing || chatRetryTimer) return;
  chatRetryTimer = setTimeout(() => {
    chatRetryTimer = null;
    connectChat();
  }, chatRetryDelay);
  chatRetryDelay = Math.min(chatRetryDelay * 2, 30000);
}

window.addEventListener("pagehide", () => {
  chatPageClosing = true;
  clearTimeout(chatRetryTimer);
  if (ws) ws.close(1000, "Page closed");
});
$("chatForm").addEventListener("submit", (e) => {
  e.preventDefault(); const t = $("chatInput").value.trim();
  if (!t) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    toast("Chat is reconnecting. Please try sending again in a moment.", true);
    return;
  }
  ws.send(JSON.stringify({ text: t })); $("chatInput").value = "";
});

$("memBtn").addEventListener("click", () => {
  $("memList").innerHTML = ctx.members.map((m) => `<div class="mem"><span>${esc(m.name)}${ctx.user && m.id === ctx.user.uid ? " (you)" : ""}</span><span class="demo">${m.role === "creator" ? "Organizer" : "Member"}</span></div>`).join("");
  $("memDlg").showModal();
});
