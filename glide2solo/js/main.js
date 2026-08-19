// GLIDE: Part Two — Dashboard Solo. Punkt wejścia.

import { loadGameData } from "./data.js";
import { initStore, getState, getData, subscribe, onSaveStatusChange, updateState } from "./store.js";
import { rollD100, findInRangeTable, clamp, preserveScroll } from "./utils.js";
import { logRoll } from "./rollLog.js";
import { logEvent, buildDaySummaryText } from "./eventLog.js";
import { showGate } from "./gate.js";
import { PORTABLE_TENT_SLUG } from "./gearData.js";

import * as characterPanel from "./panels/character.js";
import * as gearPanel from "./panels/gear.js";
import * as gliderPanel from "./panels/glider.js";
import * as rollerPanel from "./panels/roller.js";
import * as questsPanel from "./panels/quests.js";
import * as mapPanel from "./panels/map.js";
import * as journalPanel from "./panels/journal.js";
import * as contactsPanel from "./panels/contacts.js";
import * as backupPanel from "./panels/backup.js";

const PANELS = {
    character: characterPanel,
    gear: gearPanel,
    glider: gliderPanel,
    roller: rollerPanel,
    quests: questsPanel,
    map: mapPanel,
    journal: journalPanel,
    contacts: contactsPanel,
    backup: backupPanel
};

// Klucz pod którym w localStorage zapamiętujemy ostatnio używane imię postaci — czysta
// wygoda UX (wstępne wypełnienie pola imienia przy starcie), nie ma wpływu na to, który
// zapis faktycznie się wczyta (to zależy wyłącznie od tego, co użytkownik zatwierdzi).
const LAST_NAME_KEY = "glidePartTwoSolo.lastCharacterName";

const bootStatus = document.getElementById("bootStatus");
const saveIndicator = document.getElementById("saveIndicator");
const dayValue = document.getElementById("dayValue");
const campButton = document.getElementById("campButton");
const newDayButton = document.getElementById("newDayButton");
const campResultBox = document.getElementById("campResultBox");

let lastCampResult = null;
// Ustawiane tylko, gdy akcja Obóz ma aktywną Przewagę (założony Przenośny Namiot, patrz
// PORTABLE_TENT_SLUG) — dwa rzuty Wydarzenia Obozowego czekają na wybór gracza (renderCampResultBox),
// zanim finalizeCampDay zastosuje efekty WYBRANEGO wyniku i przejdzie do kolejnego dnia.
let pendingCampChoice = null;

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

/** Kompaktowa lista rzutów do karty wyboru Przewagi (patrz renderCampResultBox/pendingCampChoice). */
function renderCampAttemptCompact(rolls) {
    return rolls.map(({ roll, entry }) => `
        <div class="entry-meta"><span>d100 = ${roll}</span></div>
        <p>${entry ? entry.effect : "Brak dopasowania w tabeli."}</p>
    `).join("");
}

/** Pełny nagłówkowy zapis rzutów do finalnego podsumowania (jak przed rozbiciem na Przewagę). */
function renderCampAttemptFull(rolls) {
    return rolls.map(({ roll, entry }) => `
        <h2>Wydarzenie Obozowe (d100 = ${roll})</h2>
        <p>${entry ? entry.effect : "Brak dopasowania w tabeli."}</p>
    `).join("");
}

function renderCampResultBox() {
    if (pendingCampChoice) {
        campResultBox.style.display = "block";
        campResultBox.innerHTML = `
            <h2>Przewaga (Przenośny Namiot) — wybierz jeden z dwóch wyników Obozu</h2>
            <div class="grid grid-2">
                ${pendingCampChoice.attempts.map((rolls, idx) => `
                    <div class="entry">
                        ${renderCampAttemptCompact(rolls)}
                        <button class="btn btn-sm btn-primary" data-action="choose-camp-attempt" data-idx="${idx}">Wybierz ten wynik</button>
                    </div>
                `).join("")}
            </div>
        `;
        return;
    }
    if (!lastCampResult) {
        campResultBox.style.display = "none";
        campResultBox.innerHTML = "";
        return;
    }
    const { rolls, recoveryText } = lastCampResult;
    campResultBox.style.display = "block";
    campResultBox.innerHTML = `
        ${renderCampAttemptFull(rolls)}
        <p class="placeholder">${recoveryText}</p>
        <button class="btn btn-sm" data-action="dismiss-camp-result">Zamknij</button>
    `;
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

/** Finalizuje akcję Obóz dla JEDNEGO wybranego zestawu rzutów Wydarzenia Obozowego (`rolls` —
 *  patrz rollCampingEvents, może mieć 3 wpisy przy "Rzuć dwa razy"): nakłada jego strukturalny
 *  efekt (applyCampingEventEffects) NA WIERZCH bazowej regeneracji Staminy (Poszukiwaczowi i
 *  towarzyszowi, jeśli obecny) wg camping_base_recovery z mechanics.json, po czym przechodzi do
 *  kolejnego dnia. `discardedRolls` (tylko przy aktywnej Przewadze z Przenośnego Namiotu) to
 *  drugi, NIE wybrany zestaw rzutów — logowany osobno do historii, żeby zapis rzutów był pełny,
 *  ale jego efekty nigdy nie są nakładane na stan. */
function finalizeCampDay(rolls, discardedRolls) {
    const data = getData();
    const rec = data?.mechanics?.camping_base_recovery ?? { seeker_stamina: 0, companion_stamina: 0 };

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
    if (discardedRolls) {
        for (const { roll, entry } of discardedRolls) {
            logRoll("Wydarzenie Obozowe (d100) — odrzucone (Przewaga, Przenośny Namiot)", `d100=${roll}`, entry ? entry.effect : "brak dopasowania");
        }
    }

    updateState((state) => {
        // Inkrementacja PRZED zalogowaniem podsumowania, żeby wpis otagował się nowym
        // dniem (logEvent czyta state.day.current) — to właśnie ma być "stan na starcie dnia".
        state.day.current += 1;
        logEvent(state, "day-summary", buildDaySummaryText(state));
    });

    pendingCampChoice = null;
    lastCampResult = { rolls, recoveryText: recoveryParts.join(" · ") };
    renderAll();
}

function setupCampButton() {
    campButton.addEventListener("click", () => {
        const data = getData();
        const table = data?.mechanics?.camping_events_table_d100 ?? [];
        const state = getState();

        // Przewaga (Przenośny Namiot, patrz PORTABLE_TENT_SLUG): rzuć Wydarzenie Obozowe DWA
        // razy i daj graczowi wybrać, który wynik się liczy — "raz na Obóz", więc nie stosuje
        // się rekurencyjnie do ew. dodatkowych rzutów z "Rzuć dwa razy" w treści tabeli.
        const hasAdvantage = !!state.character.gear?.[PORTABLE_TENT_SLUG]?.equipped;
        if (hasAdvantage) {
            pendingCampChoice = { attempts: [rollCampingEvents(table), rollCampingEvents(table)] };
            lastCampResult = null;
            renderCampResultBox();
            return;
        }

        finalizeCampDay(rollCampingEvents(table));
    });

    // Delegacja na kontenerze (nie na konkretnych przyciskach) — campResultBox.innerHTML jest
    // przebudowywane przy każdym renderze (renderCampResultBox), więc pojedyncze przyciski by
    // znikały; sam kontener zostaje w DOM przez cały czas życia strony.
    campResultBox.addEventListener("click", (e) => {
        const chooseBtn = e.target.closest('[data-action="choose-camp-attempt"]');
        if (chooseBtn && pendingCampChoice) {
            const idx = Number(chooseBtn.dataset.idx);
            const chosen = pendingCampChoice.attempts[idx];
            const discarded = pendingCampChoice.attempts[1 - idx];
            finalizeCampDay(chosen, discarded);
            return;
        }
        if (e.target.closest('[data-action="dismiss-camp-result"]')) {
            lastCampResult = null;
            renderCampResultBox();
        }
    });
}

/** Akcja Nowy dzień: gdy gracz nocuje w Osadzie (albo z innego powodu nie rozbija Obozu wg
 *  zasad), przechodzi do kolejnego dnia z podsumowaniem w Dzienniku, ale BEZ Wydarzenia
 *  Obozowego i BEZ bazowej regeneracji Staminy z camping_base_recovery — obie są częścią
 *  akcji Obóz w podręczniku, więc bez rozbijania obozu żadna się nie należy. */
function setupNewDayButton() {
    newDayButton.addEventListener("click", () => {
        pendingCampChoice = null;
        lastCampResult = null;
        updateState((state) => {
            state.day.current += 1;
            logEvent(state, "day-summary", buildDaySummaryText(state));
        });
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
        setupNewDayButton();

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
