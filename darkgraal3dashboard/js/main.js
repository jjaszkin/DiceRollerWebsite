// Dark Graal III - Dashboard Solo (MG). Punkt wejścia: wczytuje statyczne dane podręcznika, łączy
// się ze wspólnym stanem kampanii w Firebase (JEDEN węzeł dla wszystkich, patrz
// store.js#connectCampaign) - w odróżnieniu od glide2solo, gdzie połączenie czeka na wybór/utworzenie
// zapisu w gate'cie, tu łączymy się z kampanią OD RAZU, zanim gate w ogóle się pokaże. Gate pyta
// tylko "kto patrzy" (MG czy który Gracz), nie "który zapis wczytać" - patrz gate.js.

import { loadGameData } from "./data.js";
import { initStore, connectCampaign, getState, getData, subscribe, onSaveStatusChange } from "./store.js";
import { showGate } from "./gate.js";

import * as characterPanel from "./panels/character.js";
import * as rollerPanel from "./panels/roller.js";
import * as mgPanel from "./panels/mg.js";

const PANELS = {
    character: characterPanel,
    roller: rollerPanel,
    mg: mgPanel
};

// Zakładki widoczne WYŁĄCZNIE dla MG (chowane graczom) i wyłącznie dla Gracza (chowane MG) - MG ma
// tylko "MG" + "Rzuty", Gracz ma tylko "Postać" + "Rzuty" (panele MG mają dodatkowo własny
// defensywny guard na session.role, patrz panels/mg.js).
const MG_ONLY_TABS = new Set(["mg"]);
const PLAYER_ONLY_TABS = new Set(["character"]);

const bootStatus = document.getElementById("bootStatus");
const saveIndicator = document.getElementById("saveIndicator");
const changeCharacterBtn = document.getElementById("changeCharacterBtn");

let session = null; // { role: "mg"|"player", characterKey: string|null } - patrz gate.js
let cachedGameData = null;

function setBootStatus(text) {
    if (bootStatus) bootStatus.textContent = text;
}

function renderAll() {
    const state = getState();
    const data = getData();
    if (!state || !session) return;

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

function applyRoleVisibility() {
    document.querySelectorAll(".tab-btn").forEach(btn => {
        const tab = btn.dataset.tab;
        const hidden = (MG_ONLY_TABS.has(tab) && session.role !== "mg") ||
            (PLAYER_ONLY_TABS.has(tab) && session.role === "mg");
        btn.style.display = hidden ? "none" : "";
    });
    // Jeśli aktualnie aktywna zakładka właśnie zniknęła (np. zmiana roli przez "Zmień postać" w
    // trakcie sesji), przełącz na pierwszą widoczną zamiast zostawiać pusty panel.
    const buttons = Array.from(document.querySelectorAll(".tab-btn"));
    const activeBtn = buttons.find(b => b.classList.contains("active"));
    if (!activeBtn || activeBtn.style.display === "none") {
        const firstVisible = buttons.find(b => b.style.display !== "none");
        if (firstVisible) firstVisible.click();
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
                setBootStatus(`Gotowe. Dane wczytane: ${Object.keys(gameData).length}/4 plików.`);
            }
        });
    } catch (err) {
        console.error("[DarkGraal3] Błąd inicjalizacji:", err);
        setBootStatus(`Błąd inicjalizacji: ${err.message}`);
    }
}

bootstrap();
