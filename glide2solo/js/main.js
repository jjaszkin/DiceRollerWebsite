// GLIDE: Part Two — Dashboard Solo. Punkt wejścia.

import { loadGameData } from "./data.js";
import { initStore, getState, getData, subscribe, onSaveStatusChange, updateState } from "./store.js";

import * as characterPanel from "./panels/character.js";
import * as rollerPanel from "./panels/roller.js";
import * as questsPanel from "./panels/quests.js";
import * as historyPanel from "./panels/history.js";
import * as journalPanel from "./panels/journal.js";

const PANELS = {
    character: characterPanel,
    roller: rollerPanel,
    quests: questsPanel,
    history: historyPanel,
    journal: journalPanel
};

const bootStatus = document.getElementById("bootStatus");
const saveIndicator = document.getElementById("saveIndicator");
const dayValue = document.getElementById("dayValue");
const campButton = document.getElementById("campButton");

function setBootStatus(text) {
    if (bootStatus) bootStatus.textContent = text;
}

function renderAll() {
    const state = getState();
    const data = getData();
    if (!state) return;

    dayValue.textContent = state.day.current;

    for (const [tab, mod] of Object.entries(PANELS)) {
        const root = document.getElementById(`panel-${tab}`);
        if (root && mod.render) mod.render(root, { state, data });
    }
}

function setupTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach(btn => {
        btn.addEventListener("click", () => {
            buttons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
            document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
        });
    });
}

function setupSaveIndicator() {
    onSaveStatusChange((status) => {
        saveIndicator.classList.remove("saving", "saved", "error");
        if (status === "pending" || status === "saving") {
            saveIndicator.classList.add("saving");
            saveIndicator.title = "Zapisywanie…";
        } else if (status === "saved") {
            saveIndicator.classList.add("saved");
            saveIndicator.title = "Zapisano w Firebase";
        } else if (status === "error") {
            saveIndicator.classList.add("error");
            saveIndicator.title = "Błąd zapisu — sprawdź konsolę / regułyFirebase";
        }
    });
}

function setupCampButton() {
    // Pełna logika (Camping Event, regeneracja Staminy) dochodzi w Fazie 6.
    // Na razie: samo przejście do kolejnego dnia, żeby licznik dni działał od startu.
    campButton.addEventListener("click", () => {
        updateState((state) => {
            state.day.current += 1;
        });
        renderAll();
    });
}

async function bootstrap() {
    try {
        setBootStatus("Wczytywanie danych podręcznika…");
        const gameData = await loadGameData();

        setBootStatus("Łączenie z Firebase…");
        await initStore(gameData);

        subscribe(renderAll);
        setupTabs();
        setupSaveIndicator();
        setupCampButton();
        renderAll();

        setBootStatus(`Gotowe. Dane wczytane: ${Object.keys(gameData).length}/10 plików.`);
    } catch (err) {
        console.error("[GLIDE] Błąd inicjalizacji:", err);
        setBootStatus(`Błąd inicjalizacji: ${err.message}`);
    }
}

bootstrap();
