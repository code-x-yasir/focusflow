// --- 1. FIREBASE INITIALIZATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDoD4NqzERz2cTuxvwXxuf29N2uHAlr3vY",
    authDomain: "focusflow-b7f3e.firebaseapp.com",
    projectId: "focusflow-b7f3e",
    storageBucket: "focusflow-b7f3e.firebasestorage.app",
    messagingSenderId: "520484890886",
    appId: "1:520484890886:web:efbf99569278865b1d9687",
    measurementId: "G-DNRP7ZZZ5P"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// --- 2. GLOBAL VARIABLES ---
let categories = ["Work", "Study", "Sleep", "Exercise", "Leisure", "Chores", "Other"];
let map, markers = {}, chartInstance = null;
let currentRole = 'user';

// --- 3. NAVIGATION & ENTRY ---

function enterApp() {
    const welcome = document.getElementById('welcome-screen');
    welcome.classList.add('fade-out');
    setTimeout(() => {
        welcome.style.display = 'none';
        // This line is key! It forces the login box to appear
        document.getElementById('auth-overlay').style.display = 'flex';
        document.getElementById('signup-card').style.display = 'block';
        document.getElementById('login-card').style.display = 'none';
    }, 800);
}

function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    const target = document.getElementById(id);
    if (target) {
        target.style.display = 'block';
        if (id === 'location-map') { initMap(); shareMyLocation(); } // Map Trigger
        if (id === 'stats') updateChart();
        if (id === 'admin-dashboard') refreshAdminData();
    }
}

// --- 4. REAL-TIME LOCATION LOGIC ---

function initMap() {
    if (map) return;
    // Initialize map with a global view
    map = L.map('map').setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Listener for all user locations in Firestore
    db.collection("users").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            const id = change.doc.id;
            if (data.location) {
                const { lat, lng } = data.location;
                if (markers[id]) {
                    markers[id].setLatLng([lat, lng]); // Move marker
                } else {
                    markers[id] = L.marker([lat, lng]).addTo(map)
                        .bindPopup(data.email || "Anonymous User"); // Add new marker
                }
            }
        });
    });
}

function shareMyLocation() {
    if (navigator.geolocation) {
        // Continuous tracking
        navigator.geolocation.watchPosition((position) => {
            const loc = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (auth.currentUser) {
                db.collection("users").doc(auth.currentUser.uid).update({ location: loc })
                    .catch(() => db.collection("users").doc(auth.currentUser.uid).set({ location: loc }, {merge: true}));
            }
        }, (err) => console.error(err), { enableHighAccuracy: true });
    }
}

// --- 5. CATEGORY & DIARY LOGIC ---

async function addCustomCategory() {
    const input = document.getElementById('new-category-name');
    const newCat = input.value.trim();
    if (newCat && !categories.includes(newCat)) {
        categories.push(newCat);
        initDiary();
        input.value = '';
        if (auth.currentUser) {
            await db.collection("settings").doc(auth.currentUser.uid).set({ userCategories: categories }, { merge: true });
        }
    }
}

function initDiary() {
    const hourList = document.getElementById('hour-list');
    if (!hourList) return;
    const currentInputs = [];
    for (let i = 0; i < 24; i++) {
        const t = document.getElementById(`task-${i}`);
        const c = document.getElementById(`cat-${i}`);
        currentInputs.push({ task: t ? t.value : "", cat: c ? c.value : "Work" });
    }
    hourList.innerHTML = '';
    for (let i = 0; i < 24; i++) {
        const time = i < 12 ? `${i === 0 ? 12 : i} AM` : `${i === 12 ? 12 : i - 12} PM`;
        hourList.innerHTML += `
            <div class="hour-row">
                <div class="hour-label">${time}</div>
                <input type="text" placeholder="Activity..." id="task-${i}" value="${currentInputs[i].task}">
                <select id="cat-${i}">
                    ${categories.map(c => `<option value="${c}" ${currentInputs[i].cat === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
            </div>`;
    }
}

// --- 6. AUTHENTICATION & ROUTING ---

function setRole(role) {
    currentRole = role;
    document.getElementById('user-tab').classList.toggle('active-tab', role === 'user');
    document.getElementById('admin-tab').classList.toggle('active-tab', role === 'admin');
}

function handleLogin() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;

    auth.signInWithEmailAndPassword(email, pass).then((cred) => {
        // Force check the email against the role selected in the tabs
        if (currentRole === 'admin' && email !== "admin@focusflow.com") {
            alert("This email is not authorized as an administrator.");
            auth.signOut();
            return;
        }
        // If login is successful, the onAuthStateChanged listener below handles the redirect
    }).catch(err => alert(err.message));
}
// --- 7. ANALYTICS & SAVING ---

async function saveData() {
    if (!auth.currentUser) return alert("Please log in to save data.");

    const diaryData = [];
    for (let i = 0; i < 24; i++) {
        const task = document.getElementById(`task-${i}`).value;
        const cat = document.getElementById(`cat-${i}`).value;
        diaryData.push({ hour: i, task, cat });
    }

    try {
        await db.collection("diaries").doc(auth.currentUser.uid).set({
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            entries: diaryData
        });
        alert("Progress saved successfully!");
    } catch (error) {
        console.error("Save error:", error);
    }
}

function updateChart() {
    const ctx = document.getElementById('timeChart').getContext('2d');

    // 1. Aggregate data from the inputs
    const counts = {};
    categories.forEach(c => counts[c] = 0);

    for (let i = 0; i < 24; i++) {
        const cat = document.getElementById(`cat-${i}`).value;
        counts[cat] = (counts[cat] || 0) + 1;
    }

    const dataValues = Object.values(counts);
    const labels = Object.keys(counts);

    // 2. Create or Update Chart instance
    if (chartInstance) {
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = dataValues;
        chartInstance.update(); // Smoothly update the existing chart
    } else {
        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Hours Spent',
                    data: dataValues,
                    backgroundColor: [
                        '#8a2be2', '#4b0082', '#e0b0ff', '#6a5acd',
                        '#9370db', '#ba55d3', '#9932cc'
                    ],
                    borderWidth: 1
                }]
            },
            options: { responsive: true, plugins: { legend: { labels: { color: 'white' } } } }
        });
    }
}
// Toggle between Login and Signup view
function toggleAuthMode() {
    const loginCard = document.getElementById('login-card');
    const signupCard = document.getElementById('signup-card');

    if (loginCard.style.display === 'none') {
        loginCard.style.display = 'block';
        signupCard.style.display = 'none';
    } else {
        loginCard.style.display = 'none';
        signupCard.style.display = 'block';
    }
}
async function refreshAdminData() {
    const tableBody = document.getElementById('user-table-body');
    if (!tableBody) return;

    try {
        // FIRST: Fetch the users collection from Firestore
        const snapshot = await db.collection("users").get();

        // SECOND: Now that 'snapshot' exists, update the stat boxes
        const count = snapshot.size;
        document.getElementById('new-today').innerText = count;
        document.getElementById('new-week').innerText = count;
        document.getElementById('new-month').innerText = count;

        // THIRD: Clear the table and build the rows
        tableBody.innerHTML = '';

        if (snapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No users found.</td></tr>';
            return;
        }

        snapshot.forEach((doc) => {
            const data = doc.data();
            tableBody.innerHTML += `
                <tr>
                    <td>${data.email || 'Anonymous'}</td>
                    <td>${doc.id.substring(0, 8)}...</td>
                    <td>${data.location ? '📍 Active' : 'Offline'}</td>
                </tr>`;
        });
    } catch (error) {
        console.error("Error fetching users:", error);
    }
}

// Handle the actual Firebase Signup
function handleSignup() {
    const email = document.getElementById('signup-email').value;
    const pass = document.getElementById('signup-password').value;

    auth.createUserWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            // This part is CRITICAL: Save the user to the "users" collection
            return db.collection("users").doc(userCredential.user.uid).set({
                email: email,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                role: 'user'
            });
        })
        .then(() => {
            alert("Account created successfully!");
            location.reload();
        })
        .catch((error) => {
            alert(error.message);
        });
}

function logout() { auth.signOut().then(() => location.reload()); }

auth.onAuthStateChanged((user) => {
    if (user) {
        if (user.email === "admin@focusflow.com") {
            showAdminDashboard();
        } else {
            showApp();
        }
    } else if (document.getElementById('welcome-screen').style.display === 'none') {
        document.getElementById('auth-overlay').style.display = 'flex';
    }
});

function showAdminDashboard() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';

    // Hide all user-specific navigation buttons
    document.getElementById('nav-tracker').style.display = 'none';
    document.getElementById('nav-stats').style.display = 'none';

    // Show only the Admin button and Logout
    const adminBtn = document.getElementById('nav-admin');
    if (adminBtn) {
        adminBtn.style.display = 'inline-block';
    }

    showSection('admin-dashboard');
}

function showApp() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('user-display').innerText = auth.currentUser.email;
    db.collection("settings").doc(auth.currentUser.uid).get().then((doc) => {
        if (doc.exists) categories = doc.data().userCategories;
        initDiary();
        showSection('tracker');
    });
}
// --- CHATBOT LOGIC ---

function toggleChat() {
    const window = document.getElementById('chat-window');
    window.style.display = window.style.display === 'none' ? 'flex' : 'none';
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const msgArea = document.getElementById('chat-messages');
    const userText = input.value.trim();

    if (!userText) return;

    // Display user message
    msgArea.innerHTML += `<div style="text-align: right; margin-bottom: 10px;"><b>You:</b> ${userText}</div>`;
    input.value = '';

    // Generate Bot Response
    setTimeout(() => {
        const botResponse = getBotResponse(userText.toLowerCase());
        msgArea.innerHTML += `<div style="text-align: left; margin-bottom: 10px; color: var(--accent-purple);"><b>Bot:</b> ${botResponse}</div>`;
        msgArea.scrollTop = msgArea.scrollHeight;
    }, 500);
}

function getBotResponse(input) {
    if (input.includes("productivity") || input.includes("improve")) {
        return "Try the '1% Rule': improve your focus by just 1% every day. Also, look at your Analytics tab to see where you waste the most time!";
    }
    if (input.includes("routine")) {
        return "A solid routine starts with a consistent sleep schedule. Have you logged your 'Sleep' category for today yet?";
    }
    if (input.includes("work") || input.includes("study")) {
        return "I recommend the Pomodoro Technique: 25 minutes of deep focus followed by a 5-minute break.";
    }
    if (input.includes("map") || input.includes("location")) {
        return "You can see other users in their focus zones on the Live Map! It helps you feel less alone while working.";
    }
    return "I'm here to help you master your time. Ask me about your routine, productivity tips, or how to use the map!";
}

// (Include your existing refreshAdminData and updateChart functions here)