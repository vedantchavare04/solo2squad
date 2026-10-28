import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyA1ksG8jpIxi7YEOTfGRB6RZ9gGGe2bmKg",
  authDomain: "solo2squad-b1c6c.firebaseapp.com",
  projectId: "solo2squad-b1c6c",
  storageBucket: "solo2squad-b1c6c.firebasestorage.app",
  messagingSenderId: "869888757416",
  appId: "1:869888757416:web:f9b6d86fb323d025a77c9d"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };
