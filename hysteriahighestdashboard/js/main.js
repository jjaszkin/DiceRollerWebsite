// Hysteria Highest - Dashboard. Punkt wejścia: wczytuje dane systemowe, łączy się ze wspólnym
// stanem kampanii w Firebase, pokazuje gate. Gracze widzą zakładki (Tarot / Tor Boskości / dwie
// zakładki swoich postaci, nazwane po imieniu / Handouty) - MG widzi jeden nietabowy widok
// (#mgUnifiedRoot, patrz panels/mg.js), wzorzec 1:1 z darkgraal3dashboard/js/main.js.

import { loadGameData } from "./data.js";
import { initStore, connectCampaign, getState, getData, subscribe, updateState, onSaveStatusChange } from "./store.js";
import { showGate } from "./gate.js";

import * as tarotPanel from "./panels/tarot.js";
import * as divinityPanel from "./panels/divinity.js";
import * as characterPanel from "./panels/character.js";
import * as handoutsPanel from "./panels/handouts.js";
import * as mgPanel from "./panels/mg.js";

const bootStatus = document.getElementById("bootStatus");
const saveIndicator = document.getElementById("saveIndicator");
const changeCharacterBtn = document.getElementById("changeCharacterBtn");

let session = null; // { role: "mg"|"player", pairKey: string|null, characterKeys: [string,string]|null }
let cachedGameData = null;

function setBootStatus(text) {
    if (bootStatus) bootStatus.textContent = text;
}

function characterName(key) {
    return cachedGameData?.characters?.characters?.find(c => c.key === key)?.name || key;
}

/** Etykiety zakładek "charA"/"charB" muszą pokazywać imię konkretnej postaci danego gracza -
 *  aktualizowane przy każdym wejściu do gry (gate może być otwarty ponownie z inną parą). */
function updateCharacterTabLabels() {
    if (!session || session.role !== "player") return;
    const [keyA, keyB] = session.characterKeys || [];
    const btnA = document.querySelector('.tab-btn[data-tab="charA"]');
    const btnB = document.querySelector('.tab-btn[data-tab="charB"]');
    if (btnA) btnA.textContent = characterName(keyA);
    if (btnB) btnB.textContent = characterName(keyB);
}

function renderAll() {
    const state = getState();
    const data = getData();
    if (!state || !session) return;

    if (session.role === "mg") {
        const mgRoot = document.getElementById("mgUnifiedRoot");
        if (mgRoot && mgPanel.render) mgPanel.render(mgRoot, { state, data, session, updateState });
        return;
    }

    const [keyA, keyB] = session.characterKeys || [];
    const tarotRoot = document.getElementById("panel-tarot");
    if (tarotRoot) tarotPanel.render(tarotRoot, { state, data, session, updateState });

    const divinityRoot = document.getElementById("panel-divinity");
    if (divinityRoot) divinityPanel.render(divinityRoot, { state, data, session, updateState });

    const charARoot = document.getElementById("panel-charA");
    if (charARoot) characterPanel.render(charARoot, { state, data, session, updateState, characterKey: keyA });

    const charBRoot = document.getElementById("panel-charB");
    if (charBRoot) characterPanel.render(charBRoot, { state, data, session, updateState, characterKey: keyB });

    const handoutsRoot = document.getElementById("panel-handouts");
    if (handoutsRoot) handoutsPanel.render(handoutsRoot, { state, data, session, updateState });
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

function applyRoleVisibility() {
    const isMg = session.role === "mg";
    const tabsEl = document.getElementById("mainTabs");
    const tabPanelsEl = document.querySelector(".tab-panels");
    const mgRoot = document.getElementById("mgUnifiedRoot");

    if (tabsEl) tabsEl.classList.toggle("hidden", isMg);
    if (tabPanelsEl) tabPanelsEl.classList.toggle("hidden", isMg);
    if (mgRoot) mgRoot.classList.toggle("hidden", !isMg);

    if (!isMg) {
        updateCharacterTabLabels();
        const buttons = Array.from(document.querySelectorAll(".tab-btn"));
        const activeBtn = buttons.find(b => b.classList.contains("active"));
        if (!activeBtn && buttons[0]) buttons[0].click();
    }
}

function setupSaveIndicator() {
    onSaveStatusChange((status) => {
        if (!saveIndicator) return;
        saveIndicator.classList.remove("saving", "saved", "error");
        if (status === "pending" || status === "saving") {
            saveIndicator.classList.add("saving");
            saveIndicator.title = "Zapisywanie...";
        } else if (status === "saved") {
            saveIndicator.classList.add("saved");
            saveIndicator.title = "Zapisano w Firebase";
        } else if (status === "error") {
            saveIndicator.classList.add("error");
            saveIndicator.title = "Błąd zapisu - sprawdź konsolę / reguły Firebase";
        }
    });
}

function setupChangeCharacterButton() {
    if (!changeCharacterBtn) return;
    changeCharacterBtn.addEventListener("click", () => {
        showGate(cachedGameData, {
            allowCancel: true,
            onDone: (selection) => {
                session = selection;
                applyRoleVisibility();
                renderAll();
            }
        });
    });
}

async function bootstrap() {
    try {
        setBootStatus("Wczytywanie danych systemowych...");
        const gameData = await loadGameData();
        cachedGameData = gameData;
        initStore(gameData);

        setBootStatus("Łączenie ze wspólną kampanią...");
        await connectCampaign();

        subscribe(renderAll);
        setupTabs();
        setupSaveIndicator();
        setupChangeCharacterButton();

        setBootStatus("Wybierz, kto patrzy...");

        showGate(gameData, {
            onDone: (selection) => {
                session = selection;
                applyRoleVisibility();
                renderAll();
                setBootStatus(`Gotowe. Dane wczytane: ${Object.keys(gameData).length}/6 plików.`);
            }
        });
    } catch (err) {
        console.error("[HysteriaHighest] Błąd inicjalizacji:", err);
        setBootStatus(`Błąd inicjalizacji: ${err.message}`);
    }
}

bootstrap();
