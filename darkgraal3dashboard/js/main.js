// Dark Graal III - Dashboard Solo (MG). Punkt wejścia: wczytuje statyczne dane podręcznika, łączy
// się ze wspólnym stanem kampanii w Firebase (JEDEN węzeł dla wszystkich, patrz
// store.js#connectCampaign) - w odróżnieniu od glide2solo, gdzie połączenie czeka na wybór/utworzenie
// zapisu w gate'cie, tu łączymy się z kampanią OD RAZU, zanim gate w ogóle się pokaże. Gate pyta
// tylko "kto patrzy" (MG czy który Gracz), nie "który zapis wczytać" - patrz gate.js.

import { loadGameData } from "./data.js";
import { initStore, connectCampaign, getState, getData, subscribe, onSaveStatusChange } from "./store.js";
import { showGate } from "./gate.js";
import { mountSoundboardPlayer } from "../../shared/soundboard/player-engine.js";

import * as characterPanel from "./panels/character.js";
import * as rollerPanel from "./panels/roller.js";
import * as mgPanel from "./panels/mg.js";

// Zakładki ("Postać"/"Rzuty") istnieją WYŁĄCZNIE dla Graczy - MG w ogóle ich nie widzi (patrz
// applyRoleVisibility()) i ma zamiast nich jeden własny, nietabowy widok #mgUnifiedRoot
// (panels/mg.js - siatka 12 kolumn: nawigacja po postaciach + karty postaci + panel rzutów MG).
const PANELS = {
    character: characterPanel,
    roller: rollerPanel
};

const bootStatus = document.getElementById("bootStatus");
const saveIndicator = document.getElementById("saveIndicator");
const changeCharacterBtn = document.getElementById("changeCharacterBtn");

let session = null; // { role: "mg"|"player", characterKey: string|null } - patrz gate.js
let cachedGameData = null;
let soundboardMounted = false;

function setBootStatus(text) {
    if (bootStatus) bootStatus.textContent = text;
}

/** Montuje silnik Soundboardu (shared/soundboard/) RAZ, wyłącznie dla Graczy - MG steruje
 *  odtwarzaniem z panelu MG, ale audio u siebie nie odtwarza (patrz #soundboardRoot w index.html
 *  - stabilny węzeł POZA panelami, żeby <audio> przeżywało ich rerendery). */
function ensureSoundboardMounted() {
    if (soundboardMounted || !session || session.role === "mg") return;
    const root = document.getElementById("soundboardRoot");
    if (!root) return;
    mountSoundboardPlayer(root, { manifest: getData()?.soundboard || [], subscribe, getState });
    soundboardMounted = true;
}

function renderAll() {
    const state = getState();
    const data = getData();
    if (!state || !session) return;

    if (session.role === "mg") {
        const mgRoot = document.getElementById("mgUnifiedRoot");
        if (mgRoot && mgPanel.render) mgPanel.render(mgRoot, { state, data, session });
        return;
    }

    for (const [tab, mod] of Object.entries(PANELS)) {
        const root = document.getElementById(`panel-${tab}`);
        if (root && mod.render) mod.render(root, { state, data, session });
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

/** MG i Gracz mają teraz całkowicie odrębne "powłoki" UI: Gracz widzi zakładki "Postać"/"Rzuty"
 *  (#mainTabs + #panel-*), MG widzi jeden nietabowy widok (#mgUnifiedRoot, patrz panels/mg.js) -
 *  ta funkcja przełącza między nimi całymi sekcjami zamiast pojedynczymi zakładkami. */
function applyRoleVisibility() {
    const isMg = session.role === "mg";
    const tabsEl = document.getElementById("mainTabs");
    const tabPanelsEl = document.querySelector(".tab-panels");
    const mgRoot = document.getElementById("mgUnifiedRoot");

    if (tabsEl) tabsEl.classList.toggle("hidden", isMg);
    if (tabPanelsEl) tabPanelsEl.classList.toggle("hidden", isMg);
    if (mgRoot) mgRoot.classList.toggle("hidden", !isMg);

    if (!isMg) {
        // Jeśli żadna zakładka Gracza nie jest aktywna (np. świeże wejście albo powrót z roli MG),
        // upewnij się, że coś jest wybrane zamiast zostawiać pusty panel.
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
                ensureSoundboardMounted();
            }
        });
    });
}

async function bootstrap() {
    try {
        setBootStatus("Wczytywanie danych podręcznika...");
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
                ensureSoundboardMounted();
                setBootStatus(`Gotowe. Dane wczytane: ${Object.keys(gameData).length}/5 plików.`);
            }
        });
    } catch (err) {
        console.error("[DarkGraal3] Błąd inicjalizacji:", err);
        setBootStatus(`Błąd inicjalizacji: ${err.message}`);
    }
}

bootstrap();
