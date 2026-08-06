// GLIDE: Part Two — Dashboard Solo. Punkt wejścia.

import { loadGameData } from "./data.js";
import { initStore, getState, getData, subscribe, onSaveStatusChange, updateState } from "./store.js";
import { rollD100, findInRangeTable, clamp, preserveScroll } from "./utils.js";
import { logRoll } from "./rollLog.js";
import { logEvent, buildDaySummaryText } from "./eventLog.js";
import { showGate } from "./gate.js";

import * as characterPanel from "./panels/character.js";
import * as gearPanel from "./panels/gear.js";
import * as gliderPanel from "./panels/glider.js";
import * as rollerPanel from "./panels/roller.js";
import * as questsPanel from "./panels/quests.js";
import * as mapPanel from "./panels/map.js";
import * as journalPanel from "./panels/journal.js";
import * as contactsPanel from "./panels/contacts.js";

const PANELS = {
    character: characterPanel,
    gear: gearPanel,
    glider: gliderPanel,
    roller: rollerPanel,
    quests: questsPanel,
    map: mapPanel,
    journal: journalPanel,
    contacts: contactsPanel
};

// Klucz pod którym w localStorage zapamiętujemy ostatnio używane imię postaci — czysta
// wygoda UX (wstępne wypełnienie pola imienia przy starcie), nie ma wpływu na to, który
// zapis faktycznie się wczyta (to zależy wyłącznie od tego, co użytkownik zatwierdzi).
const LAST_NAME_KEY = "glidePartTwoSolo.lastCharacterName";

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

    // preserveScroll: renderAll przebudowuje WSZYSTKIE panele (nie tylko aktywną zakładkę) przy
    // każdej zmianie stanu — bez tego zmiana wysokości aktywnego panelu (nowy baner, dłuższa
    // lista wpisów…) potrafi przyciąć scroll do nowej, krótszej strony i wyglądać jak losowy
    // "skok" po kliknięciu byle przycisku. Patrz utils.js#preserveScroll.
    preserveScroll(() => {
        dayValue.textContent = state.day.current;
        renderCampResultBox();

        for (const [tab, mod] of Object.entries(PANELS)) {
            const root = document.getElementById(`panel-${tab}`);
            if (root && mod.render) mod.render(root, { state, data });
        }
    });
}

function renderCampResultBox() {
    if (!lastCampResult) {
        campResultBox.style.display = "none";
        campResultBox.innerHTML = "";
        return;
    }
    const { rolls, recoveryText } = lastCampResult;
    campResultBox.style.display = "block";
    const rollsHtml = rolls.map(({ roll, entry }) => `
        <h2>Wydarzenie Obozowe (d100 = ${roll})</h2>
        <p>${entry ? entry.effect : "Brak dopasowania w tabeli."}</p>
    `).join("");
    campResultBox.innerHTML = `
        ${rollsHtml}
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

/** Rzuca Wydarzenie Obozowe (d100). Wpis "97-100" (Rzuć dwa razy) rozwiązuje się od razu na
 *  DWA dodatkowe rzuty (effects.rollTwice), ale nie rekurencyjnie — "maks. raz na akcję Obóz"
 *  z treści wpisu, więc kolejne trafienie 97-100 na jednym z tych dwóch dorzutów już się nie
 *  powiela. Zwraca tablicę { roll, entry } (1 wpis normalnie, 3 przy Rzuć dwa razy). */
function rollCampingEvents(table) {
    const { total: roll } = rollD100();
    const entry = findInRangeTable(table, roll, "roll");
    const results = [{ roll, entry }];
    if (entry?.effects?.rollTwice) {
        for (let i = 0; i < 2; i++) {
            const { total: extraRoll } = rollD100();
            results.push({ roll: extraRoll, entry: findInRangeTable(table, extraRoll, "roll") });
        }
    }
    return results;
}

/** Nakłada strukturalny efekt jednego wpisu Wydarzenia Obozowego (mechanics.json#
 *  camping_events_table_d100[].effects) na stan postaci. Wytrzymałość jest CELOWO nieprzycięta
 *  do zwykłego max przy dodatnim bonusie ("+1 Wytrzymałość ponad limit na następny dzień") —
 *  ale wciąż nie może spaść poniżej 0. Pozostałe zasoby (Rozpęd/Zasoby/Relikty) trzymają się
 *  zwykłego przycięcia [0, max], tak jak reszta stanu (patrz travelEvents.js). Zwraca listę
 *  opisowych fragmentów "Pole: przed → po" do wyświetlenia graczowi. */
function applyCampingEventEffects(state, effects) {
    if (!effects) return [];
    const ch = state.character;
    const parts = [];
    if (typeof effects.stamina === "number") {
        const stam = ch.resources.stamina;
        const before = stam.cur;
        stam.cur = Math.max(0, stam.cur + effects.stamina);
        parts.push(`Wytrzymałość: ${before} → ${stam.cur}`);
    }
    if (typeof effects.momentum === "number") {
        const mm = ch.resources.momentum;
        const before = mm.cur;
        mm.cur = clamp(mm.cur + effects.momentum, 0, mm.max);
        parts.push(`Rozpęd: ${before} → ${mm.cur}`);
    }
    if (typeof effects.supply === "number") {
        const sup = ch.glider.supply;
        const before = sup.cur;
        sup.cur = clamp(sup.cur + effects.supply, 0, sup.max);
        parts.push(`Zasoby: ${before} → ${sup.cur}`);
    }
    if (typeof effects.relics === "number") {
        const rel = ch.glider.relics;
        const before = rel.cur;
        rel.cur = clamp(rel.cur + effects.relics, 0, rel.max);
        parts.push(`Relikty: ${before} → ${rel.cur}`);
    }
    return parts;
}

function setupCampButton() {
    // Akcja Obóz: rzuca Wydarzenie Obozowe (d100, patrz rollCampingEvents — może dać 3 wyniki
    // przy "Rzuć dwa razy"), nakłada jego strukturalny efekt (applyCampingEventEffects) NA
    // WIERZCH bazowej regeneracji Staminy (Poszukiwaczowi i towarzyszowi, jeśli obecny) wg
    // camping_base_recovery z mechanics.json, po czym przechodzi do kolejnego dnia.
    campButton.addEventListener("click", () => {
        const data = getData();
        const table = data?.mechanics?.camping_events_table_d100 ?? [];
        const rec = data?.mechanics?.camping_base_recovery ?? { seeker_stamina: 0, companion_stamina: 0 };
        const rolls = rollCampingEvents(table);

        const recoveryParts = [];

        updateState((state) => {
            const stam = state.character.resources.stamina;
            const before = stam.cur;
            stam.cur = clamp(stam.cur + (rec.seeker_stamina || 0), 0, stam.max);
            recoveryParts.push(`Wytrzymałość Poszukiwacza: ${before} → ${stam.cur}`);

            if (state.character.companion.key) {
                const cstam = state.character.companion.stamina;
                const cBefore = cstam.cur;
                cstam.cur = clamp(cstam.cur + (rec.companion_stamina || 0), 0, cstam.max);
                recoveryParts.push(`Wytrzymałość towarzysza: ${cBefore} → ${cstam.cur}`);
            }

            for (const { entry } of rolls) {
                recoveryParts.push(...applyCampingEventEffects(state, entry?.effects));
            }
        });

        // Zaloguj rzut(y) pod dniem, w którym nastąpił Obóz, zanim przejdziemy do kolejnego dnia.
        for (const { roll, entry } of rolls) {
            logRoll("Wydarzenie Obozowe (d100)", `d100=${roll}`, entry ? entry.effect : "brak dopasowania");
        }

        updateState((state) => {
            // Inkrementacja PRZED zalogowaniem podsumowania, żeby wpis otagował się nowym
            // dniem (logEvent czyta state.day.current) — to właśnie ma być "stan na starcie dnia".
            state.day.current += 1;
            logEvent(state, "day-summary", buildDaySummaryText(state));
        });

        lastCampResult = { rolls, recoveryText: recoveryParts.join(" · ") };
        renderAll();
    });
}

async function bootstrap() {
    try {
        setBootStatus("Wczytywanie danych podręcznika…");
        const gameData = await loadGameData();

        // initStore jest teraz synchroniczne — samo w sobie NIE łączy się z Firebase.
        // Połączenie z konkretnym zapisem (wybranym/utworzonym na ekranie startowym)
        // nawiązuje dopiero gate.js, przez store.js#connectSave.
        initStore(gameData);

        subscribe(renderAll);
        setupTabs();
        setupSaveIndicator();
        setupCampButton();

        setBootStatus("Wybierz postać, żeby połączyć się z zapisem…");

        const lastName = localStorage.getItem(LAST_NAME_KEY) || "";
        showGate(gameData, {
            initialName: lastName,
            allowCancel: false,
            onDone: () => {
                const name = getState()?.character?.name;
                if (name) localStorage.setItem(LAST_NAME_KEY, name);
                setBootStatus(`Gotowe. Dane wczytane: ${Object.keys(gameData).length}/11 plików.`);
            }
        });
    } catch (err) {
        console.error("[GLIDE] Błąd inicjalizacji:", err);
        setBootStatus(`Błąd inicjalizacji: ${err.message}`);
    }
}

bootstrap();
