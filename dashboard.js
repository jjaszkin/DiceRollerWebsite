import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, get, set } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyD7PRIk5KhfY-sMda_-w1V5XW2n0yexpMo",
    authDomain: "dicerollerwebsite.firebaseapp.com",
    projectId: "dicerollerwebsite",
    databaseURL: "https://dicerollerwebsite-default-rtdb.europe-west1.firebasedatabase.app/",
    storageBucket: "dicerollerwebsite.appspot.com",
    messagingSenderId: "117039589628",
    appId: "1:117039589628:web:1fc0ffa255db93a878cf79"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const PIN_PATH = "settings/pin";
const DEFAULT_PIN = "0000";
const UNLOCK_KEY = "dashboardUnlocked";
const DATES_CACHE_KEY = "serviceDatesCache";

const REPO = "jjaszkin/DiceRollerWebsite";
const BRANCH = "master";
const SITE_BASE = "https://dicerollerwebsite.netlify.app/";

const FOLDERS = [
    "darkgraal2",
    "darkgraal2-MG",
    "darkgraal3",
    "darkgraal3dashboard",
    "echoesofhysteria",
    "glide2solo",
    "hysteriahigher",
    "hysteriahigher-MG",
    "hysteriahighest",
    "hysteriahighestdashboard",
    "klatwastrahda",
    "KULTnajdluzszanoc",
    "originalroller"
];

const lockScreen = document.getElementById("lockScreen");
const dashboard = document.getElementById("dashboard");
const pinForm = document.getElementById("pinForm");
const pinInput = document.getElementById("pinInput");
const pinSubmit = document.getElementById("pinSubmit");
const pinError = document.getElementById("pinError");
const changePinToggle = document.getElementById("changePinToggle");
const changePinForm = document.getElementById("changePinForm");
const newPinInput = document.getElementById("newPin");
const confirmPinInput = document.getElementById("confirmPin");
const changePinMessage = document.getElementById("changePinMessage");
const listStatus = document.getElementById("listStatus");
const cardGrid = document.getElementById("cardGrid");

let currentPin = null;

async function loadCurrentPin() {
    try {
        const snapshot = await get(ref(database, PIN_PATH));
        currentPin = snapshot.exists() ? String(snapshot.val()) : DEFAULT_PIN;
    } catch (err) {
        console.error("Nie udało się wczytać PIN-u z Firebase, używam domyślnego.", err);
        currentPin = DEFAULT_PIN;
    }
    pinSubmit.disabled = false;
}

function unlockDashboard() {
    sessionStorage.setItem(UNLOCK_KEY, "1");
    lockScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
    renderCards();
}

pinSubmit.disabled = true;
pinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (currentPin === null) {
        pinError.textContent = "Trwa sprawdzanie PIN-u, spróbuj za chwilę.";
        return;
    }
    if (pinInput.value.trim() === currentPin) {
        pinError.textContent = "";
        unlockDashboard();
    } else {
        pinError.textContent = "Błędny PIN.";
        pinInput.value = "";
        pinInput.focus();
    }
});

changePinToggle.addEventListener("click", () => {
    changePinForm.classList.toggle("hidden");
    changePinMessage.textContent = "";
});

changePinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newPin = newPinInput.value.trim();
    const confirmPin = confirmPinInput.value.trim();

    if (!newPin) {
        changePinMessage.textContent = "Podaj nowy PIN.";
        return;
    }
    if (newPin !== confirmPin) {
        changePinMessage.textContent = "PIN-y się nie zgadzają.";
        return;
    }

    try {
        await set(ref(database, PIN_PATH), newPin);
        currentPin = newPin;
        changePinMessage.textContent = "Zapisano nowy PIN.";
        newPinInput.value = "";
        confirmPinInput.value = "";
    } catch (err) {
        console.error("Nie udało się zapisać nowego PIN-u.", err);
        changePinMessage.textContent = "Błąd zapisu PIN-u do Firebase.";
    }
});

async function fetchLastPublishedDate(folder) {
    const url = `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(folder)}&sha=${BRANCH}&per_page=1`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return data[0]?.commit?.committer?.date ?? null;
    } catch (err) {
        console.error(`Nie udało się pobrać daty publikacji dla ${folder}.`, err);
        return null;
    }
}

async function getServiceDates() {
    const cached = sessionStorage.getItem(DATES_CACHE_KEY);
    if (cached) {
        try {
            return JSON.parse(cached);
        } catch {
            // ignore corrupt cache and refetch
        }
    }

    const entries = await Promise.all(
        FOLDERS.map(async (folder) => [folder, await fetchLastPublishedDate(folder)])
    );
    const dates = Object.fromEntries(entries);
    sessionStorage.setItem(DATES_CACHE_KEY, JSON.stringify(dates));
    return dates;
}

function formatDate(iso) {
    if (!iso) return "Brak danych o publikacji";
    return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function buildCard(folder, iso) {
    const card = document.createElement("a");
    card.className = "service-card";
    card.href = `${SITE_BASE}${folder}/`;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const icon = document.createElement("img");
    icon.src = `${folder}/images/favicon.ico`;
    icon.alt = "";
    icon.onerror = () => { icon.style.visibility = "hidden"; };

    const text = document.createElement("div");
    text.className = "card-text";

    const name = document.createElement("div");
    name.className = "card-name";
    name.textContent = folder;

    const date = document.createElement("div");
    date.className = "card-date";
    date.textContent = formatDate(iso);

    text.append(name, date);
    card.append(icon, text);
    return card;
}

async function renderCards() {
    listStatus.textContent = "Ładowanie listy...";
    cardGrid.innerHTML = "";

    const dates = await getServiceDates();
    const sorted = [...FOLDERS].sort((a, b) => {
        const dateA = dates[a] ? new Date(dates[a]).getTime() : -Infinity;
        const dateB = dates[b] ? new Date(dates[b]).getTime() : -Infinity;
        return dateB - dateA;
    });

    sorted.forEach((folder) => cardGrid.appendChild(buildCard(folder, dates[folder])));
    listStatus.textContent = "";
}

if (sessionStorage.getItem(UNLOCK_KEY) === "1") {
    lockScreen.classList.add("hidden");
    dashboard.classList.remove("hidden");
    renderCards();
} else {
    loadCurrentPin();
}
