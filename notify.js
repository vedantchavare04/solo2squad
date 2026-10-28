import { auth, db } from "./firebase.js";
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

export async function notify(userId, text, link = "") {
  try {
    const me = auth.currentUser;
    if (!me || !userId) return;
    await addDoc(collection(db, "notifications"), {
      userId, text, link, read: false, fromUid: me.uid, createdAt: serverTimestamp()
    });
  } catch (e) { console.warn("Notification not sent:", e); }
}
