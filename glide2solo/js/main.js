// GLIDE: Part Two — Dashboard Solo. Punkt wejścia.

import { loadGameData } from "./data.js";
import { initStore, getState, getData, subscribe, onSaveStatusChange, updateState } from "./store.js";
import { rollD100, findInRangeTable, clamp } from "./utils.js";
import { logRoll } from "./rollLog.js";
import { showGate, hideGate } from "./gate.js";
import { applyRole } from "./state.js";

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
const campResultBox = document.getElementById("campResultBox");

let lastCampResult = null;

function setBootStatus(text) {
    if (bootStatus) bootStatus.textContent = text;
}

function renderAll() {
    const state = getState();
    const data = getData();
    if (!state) return;

    dayValue.textContent = state.day.current;
    renderCampResultBox();

    for (const [tab, mod] of Object.entries(PANELS)) {
        const root = document.getElementById(`panel-${tab}`);
        if (root && mod.render) mod.render(root, { state, data });
    }
}

function renderCampResultBox() {
    if (!lastCampResult) {
        campResultBox.style.display = "none";
        campResultBox.innerHTML = "";
        return;
    }
    const { roll, entry, recoveryText } = lastCampResult;
    campResultBox.style.display = "block";
    campResultBox.innerHTML = `
        <h2>Camping Event (d100 = ${roll})</h2>
        <p>${entry ? entry.effect : "Brak dopasowania w tabeli."}</p>
        <p class="placeholder">${recoveryText}</p>
        <button class="btn btn-sm" id="campResultDismiss">Zamknij</button>
    `;
    document.getElementById("campResultDismiss").addEventListener("click", () => {
        lastCampResult = null;
        renderCampResultBox();
    });
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
    // Akcja Camp: rzuca Camping Event (d100), przywraca bazową Staminę (Seekerowi i towarzyszowi,
    // jeśli obecny) wg camping_base_recovery z mechanics.json, po czym przechodzi do kolejnego dnia.
    campButton.addEventListener("click", () => {
        const data = getData();
        const table = data?.mechanics?.camping_events_table_d100 ?? [];
        const rec = data?.mechanics?.camping_base_recovery ?? { seeker_stamina: 0, companion_stamina: 0 };
        const { total: roll } = rollD100();
        const entry = findInRangeTable(table, roll, "roll");

        const recoveryParts = [];

        updateState((state) => {
            const stam = state.character.resources.stamina;
            const before = stam.cur;
            stam.cur = clamp(stam.cur + (rec.seeker_stamina || 0), 0, stam.max);
            recoveryParts.push(`Stamina Seekera: ${before} → ${stam.cur}`);

            if (state.character.companion.key) {
                const cstam = state.character.companion.stamina;
                const cBefore = cstam.cur;
                cstam.cur = clamp(cstam.cur + (rec.companion_stamina || 0), 0, cstam.max);
                recoveryParts.push(`Stamina towarzysza: ${cBefore} → ${cstam.cur}`);
            }
        });

        // Zaloguj rzut pod dniem, w którym nastąpił Camp, zanim przejdziemy do kolejnego dnia.
        logRoll("Camping Event (d100)", `d100=${roll}`, entry ? entry.effect : "brak dopasowania");

        updateState((state) => {
            state.day.current += 1;
        });

        lastCampResult = { roll, entry, recoveryText: recoveryParts.join(" · ") };
        renderAll();
    });
}

async function bootstrap() {
    try {
        setBootStatus("Wczytywanie danych podręcznika…");
        const gameData = await loadGameData();

        setBootStatus("Łączenie z Firebase…");
        const state = await initStore(gameData);

        subscribe(renderAll);
        setupTabs();
        setupSaveIndicator();
        setupCampButton();

        // Ekran startowy (kreator postaci) jest jedynym miejscem, w którym można ustawić/zmienić
        // imię i rolę Seekera. Jeśli którekolwiek z nich brakuje (nowa postać albo stary zapis
        // sprzed dodania pola „imię”), wymuś pełne przejście przez ten ekran od zera, zanim
        // dashboard się pokaże.
        if (!state.character.name || !state.character.role) {
            showGate(gameData, (name, role) => {
                updateState((s) => {
                    s.character.name = name;
                    applyRole(s.character, role);
                });
            });
        } else {
            hideGate();
            renderAll();
        }

        setBootStatus(`Gotowe. Dane wczytane: ${Object.keys(gameData).length}/10 plików.`);
    } catch (err) {
        console.error("[GLIDE] Błąd inicjalizacji:", err);
        setBootStatus(`Błąd inicjalizacji: ${err.message}`);
    }
}

bootstrap();
