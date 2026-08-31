// Battle Tracker - Klątwa Strahda. Punkt wejścia: wczytuje statyczne dane (BG + bestiariusz),
// łączy się ze wspólnym stanem w Firebase, i uruchamia mikro-router obsługujący dwa taby
// (Bitwy/Uczestnicy) plus drill-down widok pojedynczej walki.

import { loadGameData } from "./data.js";
import { initStore, connectCampaign, subscribe, onSaveStatusChange } from "./store.js";
import { onRoute, navigate, renderCurrentRoute, startRouter, currentHash } from "./router.js";
import { renderBattleList } from "./views/battleList.js";
import { renderParticipantsLibrary } from "./views/participantsLibrary.js";
import { renderBattleView } from "./views/battleView.js";

const bootStatus = document.getElementById("bootStatus");
const saveIndicator = document.getElementById("saveIndicator");
const viewRoot = document.getElementById("view");
const navTabs = document.getElementById("navTabs");

function setBootStatus(text) {
    if (bootStatus) bootStatus.textContent = text;
}

function updateNavActive() {
    if (!navTabs) return;
    const hash = currentHash();
    const isBattleDetail = /^\/battles\/[^/]+$/.test(hash);
    navTabs.classList.toggle("hidden", isBattleDetail);
    navTabs.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.route === hash);
    });
}

function setupNav() {
    navTabs?.querySelectorAll(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => navigate(btn.dataset.route));
    });
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

async function bootstrap() {
    try {
        setBootStatus("Wczytywanie statystyk...");
        const gameData = await loadGameData();
        initStore(gameData);

        setBootStatus("Łączenie z Firebase...");
        await connectCampaign();

        // Każdy handler trasy woła updateNavActive() sam - to jedyne miejsce wywoływane zarówno
        // przy zmianie hasha (klik w tab, przycisk "wstecz") jak i przy zmianie stanu z Firebase
        // (subscribe niżej), więc podświetlenie aktywnego taba w nawigacji jest zawsze aktualne
        // niezależnie od tego, co konkretnie wywołało render.
        onRoute(/^\/battles$/, () => { renderBattleList(viewRoot); updateNavActive(); });
        onRoute(/^\/battles\/(?<id>[^/]+)$/, (params) => { renderBattleView(viewRoot, params.id); updateNavActive(); });
        onRoute(/^\/participants$/, () => { renderParticipantsLibrary(viewRoot); updateNavActive(); });

        subscribe(() => renderCurrentRoute());
        setupNav();
        setupSaveIndicator();
        startRouter();
        updateNavActive();

        setBootStatus("Gotowe.");
    } catch (err) {
        console.error("[BattleTrackerKlatwa] Błąd inicjalizacji:", err);
        setBootStatus(`Błąd inicjalizacji: ${err.message}`);
    }
}

bootstrap();
