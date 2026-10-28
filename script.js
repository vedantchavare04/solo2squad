import { auth, db } from "./firebase.js";

import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    collection,
    addDoc,
    getDocs,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    updateDoc,
    query,
    where,
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { notify } from "./notify.js";
import { CHAT_HTTP } from "./config.js";



const byId = (id) => document.getElementById(id);

function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    }[c]));
}

function todayString() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${month}-${day}`;
}

function friendlyError(error, fallback) {
    const code = error && error.code ? error.code : "";

    if (code === "permission-denied") {
        return fallback + " (Permission denied - check your Firestore security rules.)";
    }

    if (code === "unavailable" || code === "auth/network-request-failed") {
        return fallback + " (Network problem - check your connection.)";
    }

    if (code === "not-found") {
        return fallback + " (Firestore database not found - create it in the Firebase console.)";
    }

    return fallback;
}




function renderNav(user) {

    const links = document.querySelector(".nav-links");

    if (!links) {
        return;
    }

    const page = window.location.pathname.split("/").pop() || "index.html";

    const items = [
        ["index.html", "Home"],
        ["trips.html", "Find Trips"],
        ["create-trip.html", "Create Trip"]
    ];

    if (user) {
        items.push(["requests.html", "Requests"]);
        items.push(["profile.html", "Profile"]);
    } else {
        items.push(["login.html", "Login"]);
        items.push(["register.html", "Register"]);
    }

    links.innerHTML = items.map(([href, label]) => `
        <a href="${href}" ${href === page ? 'style="color:#ff6b35"' : ""}>${label}</a>
    `).join("") + (user
        ? `<a href="#" data-action="logout">Logout</a>`
        : "");

}

renderNav(null);


let currentUser = null;
let authBusy = false;     
let tripsLoaded = false;

onAuthStateChanged(auth, (user) => {

    currentUser = user;

    renderNav(user);

    const needsLogin =
        byId("profileName") ||
        byId("requestsList") ||
        byId("createTripBtn");

    if (needsLogin && !user) {
        window.location.href = "login.html";
        return;
    }

    if (user && byId("profileName")) {
        loadProfile(user);
    }

    if (user && byId("requestsList")) {
        loadRequests(user);
        loadMyRequests(user);
    }
    if (tripsLoaded) {
        displayTrips(getFilteredTrips());
    }

    if (user && !authBusy && (byId("loginBtn") || byId("registerBtn"))) {
        window.location.href = "index.html";
    }

});



const registerBtn = byId("registerBtn");

if (registerBtn) {
    registerBtn.addEventListener("click", registerUser);
}

async function registerUser() {

    const name = byId("name").value.trim();
    const email = byId("email").value.trim();
    const password = byId("password").value;
    const city = byId("city").value.trim();

    if (name === "" || email === "" || password === "" || city === "") {
        alert("Please fill all fields.");
        return;
    }

    if (password.length < 6) {
        alert("Password must contain at least 6 characters.");
        return;
    }

    registerBtn.disabled = true;
    authBusy = true;

    try {

        const userCredential = await createUserWithEmailAndPassword(
            auth,
            email,
            password
        );

        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
            name: name,
            email: email,
            city: city,
            createdAt: serverTimestamp()
        });

        alert("🎉 Account created successfully!");

        window.location.href = "index.html";

    } catch (error) {

        console.error(error);

        authBusy = false;
        registerBtn.disabled = false;

        if (error.code === "auth/email-already-in-use") {
            alert("This email is already registered. Please login.");
        } else if (error.code === "auth/invalid-email") {
            alert("Please enter a valid email address.");
        } else if (error.code === "auth/weak-password") {
            alert("Password is too weak. Use at least 6 characters.");
        } else {
            alert(friendlyError(error, "Unable to create account."));
        }

    }

}


const loginBtn = byId("loginBtn");

if (loginBtn) {
    loginBtn.addEventListener("click", loginUser);
}

async function loginUser() {

    const email = byId("loginEmail").value.trim();
    const password = byId("loginPassword").value;

    if (email === "" || password === "") {
        alert("Please enter email and password.");
        return;
    }

    loginBtn.disabled = true;
    authBusy = true;

    try {

        await signInWithEmailAndPassword(auth, email, password);

        alert("🎉 Login successful!");

        window.location.href = "index.html";

    } catch (error) {

        console.error(error);

        authBusy = false;
        loginBtn.disabled = false;

        if (error.code === "auth/network-request-failed") {
            alert("Network problem - check your connection.");
        } else if (error.code === "auth/too-many-requests") {
            alert("Too many attempts. Please try again later.");
        } else {
            alert("Incorrect email or password.");
        }

    }

}



const createTripBtn = byId("createTripBtn");

if (createTripBtn) {

    createTripBtn.addEventListener("click", createTrip);

    /* Do not allow past dates */
    const dateInput = byId("tripDate");

    if (dateInput) {
        dateInput.min = todayString();
    }

}

async function createTrip() {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) {
        alert("Please login before creating a trip.");
        window.location.href = "login.html";
        return;
    }

    const tripName = byId("tripName").value.trim();
    const destination = byId("destination").value.trim();
    const tripDate = byId("tripDate").value;
    const tripType = byId("tripType").value;
    const members = byId("members").value;
    const description = byId("description").value.trim();

    if (
        tripName === "" ||
        destination === "" ||
        tripDate === "" ||
        tripType === "" ||
        members === ""
    ) {
        alert("Please fill all required fields.");
        return;
    }

    if (tripDate < todayString()) {
        alert("Trip date cannot be in the past.");
        return;
    }

    const maxMembers = Number(members);

    if (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 20) {
        alert("Maximum members must be a whole number between 2 and 20.");
        return;
    }

    createTripBtn.disabled = true;

    try {

        const tripRef = await addDoc(collection(db, "trips"), {
            tripName: tripName,
            destination: destination,
            tripDate: tripDate,
            tripType: tripType,
            maxMembers: maxMembers,
            imageUrl: (byId("imageUrl") ? byId("imageUrl").value.trim() : ""),
            description: description,
            createdBy: user.uid,
            createdByEmail: user.email || "",
            memberCount: 1,
            createdAt: serverTimestamp()
        });

        /* The creator is always the first member (seat 1) */
        const me = await getDoc(doc(db, "users", user.uid));
        await setDoc(doc(db, "trips", tripRef.id, "members", user.uid), {
            userId: user.uid,
            name: me.exists() ? me.data().name : (user.email || "Organizer"),
            email: user.email || "",
            role: "creator",
            seatNumber: 1,
            status: "active",
            joinedAt: serverTimestamp()
        });

        alert("🎉 Trip created successfully!");

        window.location.href = "trips.html";

    } catch (error) {

        console.error(error);

        createTripBtn.disabled = false;

        alert(friendlyError(error, "Unable to create trip."));

    }

}



const tripList = byId("tripList");
const searchInput = byId("searchInput");
const typeFilter = byId("typeFilter");

let allTrips = [];

if (tripList) {
    loadTrips();
}

async function loadTrips() {

    try {

        const snapshot = await getDocs(collection(db, "trips"));

        allTrips = [];

        snapshot.forEach((docSnap) => {
            allTrips.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        allTrips.sort((a, b) =>
            String(a.tripDate || "").localeCompare(String(b.tripDate || ""))
        );

        tripsLoaded = true;

        displayTrips(getFilteredTrips());

    } catch (error) {

        console.error(error);

        tripList.innerHTML = `
            <p class="no-trips">
                ${esc(friendlyError(error, "Unable to load trips."))}
            </p>
        `;

    }

}

function getFilteredTrips() {

    const search = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const type = typeFilter ? typeFilter.value : "all";

    return allTrips.filter((trip) => {

        const destination = (trip.destination || "").toLowerCase();

        const matchesSearch = destination.includes(search);
        const matchesType = type === "all" || trip.tripType === type;

        return matchesSearch && matchesType;

    });

}

function displayTrips(trips) {

    if (!tripList) {
        return;
    }

    if (trips.length === 0) {

        tripList.innerHTML = `
            <p class="no-trips">
                No trips found.
                <br><br>
                Be the first to create a trip!
            </p>
        `;

        return;

    }

    const html = trips.map((trip) => {

        const isOwner =
            currentUser !== null &&
            trip.createdBy === currentUser.uid;

        const actionArea = isOwner
            ? `
                <p>👑 You created this trip</p>
                <a class="btn" style="display:block;text-align:center" href="trip.html?id=${esc(trip.id)}">View trip</a>

                <button
                    class="delete-trip-btn"
                    data-action="delete-trip"
                    data-id="${esc(trip.id)}"
                >
                    🗑️ Delete Trip
                </button>
            `
            : `
                <a class="btn" style="display:block;text-align:center;margin-top:10px" href="trip.html?id=${esc(trip.id)}">View trip</a>
                <button
                    data-action="join-trip"
                    data-id="${esc(trip.id)}"
                >
                    Join Squad 🤝
                </button>
            `;

        return `
            <div class="trip-card">

                <img
                    src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=600&q=70"
                    alt="Travel destination"
                >

                <div class="trip-content">

                    <span class="trip-type">${esc(trip.tripType)}</span>

                    <h3>${esc(trip.tripName)}</h3>

                    <p>📍 ${esc(trip.destination)}</p>

                    <p>📅 ${esc(trip.tripDate)}</p>

                    <p>👥 Maximum ${esc(trip.maxMembers)} people</p>

                    <p>${esc(trip.description)}</p>

                    ${actionArea}

                </div>

            </div>
        `;

    }).join("");

    tripList.innerHTML = html;

}

if (searchInput) {
    searchInput.addEventListener("input", () => displayTrips(getFilteredTrips()));
}

if (typeFilter) {
    typeFilter.addEventListener("change", () => displayTrips(getFilteredTrips()));
}


async function joinTrip(tripId, button) {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) {
        alert("Please login first.");
        window.location.href = "login.html";
        return;
    }

    if (button) {
        button.disabled = true;
    }

    try {

        const tripSnapshot = await getDoc(doc(db, "trips", tripId));

        if (!tripSnapshot.exists()) {
            alert("Trip does not exist.");
            loadTrips();
            return;
        }

        const trip = tripSnapshot.data();

        if (trip.createdBy === user.uid) {
            alert("You cannot join your own trip.");
            return;
        }

        const existingQuery = query(
            collection(db, "joinRequests"),
            where("tripId", "==", tripId),
            where("userId", "==", user.uid)
        );

        const existing = await getDocs(existingQuery);

        if (!existing.empty) {
            alert("You have already requested to join this trip.");
            return;
        }

        const profileSnap = await getDoc(doc(db, "users", user.uid));
        const profile = profileSnap.exists() ? profileSnap.data() : {};

        await addDoc(collection(db, "joinRequests"), {
            userName: profile.name || user.email || "Traveler",
            userCity: profile.city || "",
            tripId: tripId,
            tripName: trip.tripName,
            tripCreator: trip.createdBy,
            userId: user.uid,
            userEmail: user.email || "",
            status: "Pending",
            createdAt: serverTimestamp()
        });

        alert("🎉 Join request sent!");

    } catch (error) {

        console.error(error);

        alert(friendlyError(error, "Unable to send join request."));

    } finally {

        if (button) {
            button.disabled = false;
        }

    }

}



async function deleteTrip(tripId) {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) {
        alert("Please login first.");
        window.location.href = "login.html";
        return;
    }

    if (!confirm("Are you sure you want to delete this trip?")) {
        return;
    }

    try {

        const tripRef = doc(db, "trips", tripId);
        const tripSnapshot = await getDoc(tripRef);

        if (!tripSnapshot.exists()) {
            alert("Trip does not exist.");
            loadTrips();
            return;
        }

        if (tripSnapshot.data().createdBy !== user.uid) {
            alert("You can only delete trips created by you.");
            return;
        }

        const requestsQuery = query(
            collection(db, "joinRequests"),
            where("tripCreator", "==", user.uid),
            where("tripId", "==", tripId)
        );

        const requestsSnapshot = await getDocs(requestsQuery);

        await Promise.all(
            requestsSnapshot.docs.map((requestDoc) => deleteDoc(requestDoc.ref))
        );

        await deleteDoc(tripRef);

        alert("🗑️ Trip deleted successfully!");

        loadTrips();

    } catch (error) {

        console.error("Delete trip error:", error);

        alert(friendlyError(error, "Unable to delete trip."));

    }

}



async function loadProfile(user) {

    const nameElement = byId("profileName");
    const emailElement = byId("profileEmail");
    const cityElement = byId("profileCity");
    const tripCount = byId("tripCount");

    try {

        const userSnapshot = await getDoc(doc(db, "users", user.uid));

        if (userSnapshot.exists()) {

            const userData = userSnapshot.data();

            nameElement.textContent = userData.name || "Traveler";
            emailElement.textContent = userData.email || user.email;
            cityElement.textContent = userData.city || "Not added";

        } else {

            nameElement.textContent = "Traveler";
            emailElement.textContent = user.email;
            cityElement.textContent = "Not added";

        }

    } catch (error) {

        console.error("Profile error:", error);

        nameElement.textContent = "Traveler";
        emailElement.textContent = user.email;
        cityElement.textContent = "Not available";

    }

    try {

        const tripsQuery = query(
            collection(db, "trips"),
            where("createdBy", "==", user.uid)
        );

        const trips = await getDocs(tripsQuery);

        if (tripCount) {
            tripCount.textContent = trips.size;
        }

    } catch (error) {

        console.error("Trip count error:", error);

    }

}



const logoutBtn = byId("logoutBtn");

if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutUser);
}

async function logoutUser() {

    try {

        await signOut(auth);

        alert("Logged out successfully.");

        window.location.href = "index.html";

    } catch (error) {

        console.error(error);

        alert("Unable to logout.");

    }

}



function statusClass(status) {

    if (status === "Accepted") {
        return "status-accepted";
    }

    if (status === "Rejected") {
        return "status-rejected";
    }

    return "status-pending";

}

async function loadRequests(user) {

    const requestsList = byId("requestsList");

    if (!requestsList) {
        return;
    }

    try {

        const requestsQuery = query(
            collection(db, "joinRequests"),
            where("tripCreator", "==", user.uid)
        );

        const snapshot = await getDocs(requestsQuery);

        if (snapshot.empty) {

            requestsList.innerHTML = `
                <p class="no-trips">
                    No join requests yet.
                    <br><br>
                    Create a trip and invite travelers!
                </p>
            `;

            return;

        }

        requestsList.innerHTML = snapshot.docs.map((requestDoc) => {

            const request = requestDoc.data();
            const requestId = requestDoc.id;

            const buttons = request.status === "Pending"
                ? `
                    <div class="request-buttons">

                        <button
                            class="accept-btn"
                            data-action="accept-request"
                            data-id="${esc(requestId)}"
                        >
                            Accept ✓
                        </button>

                        <button
                            class="reject-btn"
                            data-action="reject-request"
                            data-id="${esc(requestId)}"
                        >
                            Reject ✕
                        </button>

                    </div>
                `
                : "";

            return `
                <div class="request-card">

                    <span class="request-status ${statusClass(request.status)}">
                        ${esc(request.status)}
                    </span>

                    <h3>${esc(request.tripName)}</h3>

                    <p>${esc(request.userName || request.userEmail)}${request.userCity ? ", " + esc(request.userCity) : ""}</p>
                    <p>Estimated share: ${request.estShare ? "\u20B9" + Number(request.estShare).toLocaleString("en-IN") : "n/a"}. Requested ${request.createdAt && request.createdAt.toDate ? request.createdAt.toDate().toLocaleDateString() : ""}</p>
                    <p>Preferences: ${request.prefs ? esc(request.prefs.planning) + " planning, " + esc(request.prefs.comfort) + " comfort" : "not provided"}</p>

                    ${buttons}

                </div>
            `;

        }).join("");

    } catch (error) {

        console.error("Request error:", error);

        requestsList.innerHTML = `
            <p class="no-trips">
                ${esc(friendlyError(error, "Unable to load requests."))}
            </p>
        `;

    }

}



async function loadMyRequests(user) {

    const myRequestsList = byId("myRequestsList");

    if (!myRequestsList) {
        return;
    }

    try {

        const myQuery = query(
            collection(db, "joinRequests"),
            where("userId", "==", user.uid)
        );

        const snapshot = await getDocs(myQuery);

        if (snapshot.empty) {

            myRequestsList.innerHTML = `
                <p class="no-trips">
                    You have not requested to join any trip yet.
                </p>
            `;

            return;

        }

        myRequestsList.innerHTML = snapshot.docs.map((requestDoc) => {

            const request = requestDoc.data();

            return `
                <div class="request-card">

                    <span class="request-status ${statusClass(request.status)}">
                        ${esc(request.status)}
                    </span>

                    <h3>${esc(request.tripName)}</h3>

                </div>
            `;

        }).join("");

    } catch (error) {

        console.error("My requests error:", error);

        myRequestsList.innerHTML = `
            <p class="no-trips">
                ${esc(friendlyError(error, "Unable to load your requests."))}
            </p>
        `;

    }

}



async function updateRequest(requestId, newStatus) {

    await auth.authStateReady();

    const user = auth.currentUser;

    if (!user) {
        alert("Please login first.");
        window.location.href = "login.html";
        return;
    }

    try {

        const requestRef = doc(db, "joinRequests", requestId);
        const requestSnapshot = await getDoc(requestRef);

        if (!requestSnapshot.exists()) {
            alert("Request no longer exists.");
            loadRequests(user);
            return;
        }

        const request = requestSnapshot.data();

        if (request.tripCreator !== user.uid) {
            alert("Only the trip creator can manage this request.");
            return;
        }

        if (newStatus === "Accepted") {

            const tripRef = doc(db, "trips", request.tripId);

            await runTransaction(db, async (tx) => {

                const tripSnap = await tx.get(tripRef);
                const reqSnap = await tx.get(requestRef);

                if (!tripSnap.exists()) { throw new Error("TRIP_GONE"); }
                if (reqSnap.data().status !== "Pending") { throw new Error("NOT_PENDING"); }

                const t = tripSnap.data();
                const count = Number.isInteger(t.memberCount) ? t.memberCount : 1;

                if (count >= (Number(t.maxMembers) || 0)) { throw new Error("TRIP_FULL"); }

                if (!Number.isInteger(t.memberCount)) {   /* legacy trip: add creator seat */
                    tx.set(doc(db, "trips", request.tripId, "members", t.createdBy), {
                        userId: t.createdBy, name: t.createdByEmail || "Organizer", email: t.createdByEmail || "",
                        role: "creator", seatNumber: 1, status: "active", joinedAt: serverTimestamp()
                    });
                }

                tx.set(doc(db, "trips", request.tripId, "members", request.userId), {
                    userId: request.userId,
                    name: request.userName || request.userEmail,
                    email: request.userEmail,
                    role: "member",
                    seatNumber: count + 1,
                    status: "active",
                    joinedAt: serverTimestamp()
                });
                tx.update(tripRef, { memberCount: count + 1 });
                tx.update(requestRef, { status: "Accepted" });
                const nref = () => doc(collection(db, "notifications"));
                tx.set(nref(), { userId: request.userId, text: `Your request for ${request.tripName} was accepted.`, link: `trip.html?id=${request.tripId}`, read: false, fromUid: auth.currentUser.uid, createdAt: serverTimestamp() });
                if (count + 1 >= Number(t.maxMembers)) {
                    tx.set(nref(), { userId: t.createdBy, text: `${request.tripName} is now full.`, link: `trip.html?id=${request.tripId}`, read: false, fromUid: auth.currentUser.uid, createdAt: serverTimestamp() });
                }
            });

            auth.currentUser.getIdToken().then((tk) => fetch(`${CHAT_HTTP}/chat/${request.tripId}/system`, { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify({ text: `${request.userName || request.userEmail} joined the squad.` }) })).catch(() => {});
            alert("Traveler accepted.");
            loadRequests(user);
            return;
        }

        await updateDoc(requestRef, { status: newStatus });
        notify(request.userId, `Your request for ${request.tripName} was ${newStatus.toLowerCase()}.`, "requests.html");

        alert(
            newStatus === "Accepted"
                ? "✅ Traveler accepted!"
                : "❌ Request rejected."
        );

        loadRequests(user);

    } catch (error) {

        console.error(error);

        if (error.message === "TRIP_FULL") { alert("This trip is already full."); return; }
        if (error.message === "NOT_PENDING") { alert("This request was already handled."); loadRequests(user); return; }

        alert(friendlyError(error, "Unable to update request."));

    }

}


document.addEventListener("click", (event) => {

    const button = event.target.closest("[data-action]");

    if (!button) {
        return;
    }

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === "join-trip") {
        joinTrip(id, button);
    } else if (action === "delete-trip") {
        deleteTrip(id);
    } else if (action === "accept-request") {
        updateRequest(id, "Accepted");
    } else if (action === "reject-request") {
        updateRequest(id, "Rejected");
    } else if (action === "logout") {
        event.preventDefault();
        logoutUser();
    }

});