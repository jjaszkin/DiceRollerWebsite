// Hysteria Highest - Dashboard. Punkt wejścia: wczytuje dane systemowe, łączy się ze wspólnym
// stanem kampanii w Firebase, pokazuje gate. Gracze widzą zakładki (Tarot / Tor Boskości / dwie
// zakładki swoich postaci, nazwane po imieniu / Handouty) - MG widzi jeden nietabowy widok
// (#mgUnifiedRoot, patrz panels/mg.js), wzorzec 1:1 z darkgraal3dashboard/js/main.js.

import { loadGameData } from "./data.js";
import { initStore, connectCampaign, getState, getData, subscribe, updateState, onSaveStatusChange } from "./store.js";
import { showGate } from "./gate.js";
import { buildModalHtml, wireModalGlobalEvents, subscribeModal } from "./modal.js";
import { mountSoundboardPlayer } from "../../shared/soundboard/player-engine.js";
import { advancePlaylistTrack } from "../../shared/soundboard/control-panel.js";

import * as tarotPanel from "./panels/tarot.js";
import * as divinityPanel from "./panels/divinity.js";
import * as characterPanel from "./panels/character.js";
import * as handoutsPanel from "./panels/handouts.js";
import * as journalPanel from "./panels/journal.js";
import * as mgPanel from "./panels/mg.js";

const bootStatus = document.getElementById("bootStatus");
const saveIndicator = document.getElementById("saveIndicator");
const changeCharacterBtn = document.getElementById("changeCharacterBtn");

let session = null; // { role: "mg"|"player", pairKey: string|null, characterKeys: [string,string]|null }
let cachedGameData = null;
let soundboardMounted = false;

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

/** Montuje silnik Soundboardu (shared/soundboard/) RAZ, dla KAŻDEJ roli (patrz #soundboardRoot w
 *  index.html - stabilny węzeł POZA panelami, żeby <audio> przeżywało ich rerendery) - MG też ma
 *  dostać dźwięk i FAB głośności, żeby móc odsłuchać miksu, który sam puszcza.
 *  Tylko przeglądarka MG dostaje `onMusicEnded` - to ona jest "dyrygentem" playlist: gdy kończy się
 *  utwór odtwarzany jako część playlisty (nie zapętlony pojedynczo), przesuwa wspólny stan na
 *  kolejny utwór. Gdyby każda przeglądarka (gracze + MG) próbowała to robić niezależnie, urządzenia
 *  mogłyby się rozjechać na różne "następne" utwory - patrz shared/soundboard/control-panel.js#advancePlaylistTrack. */
function ensureSoundboardMounted() {
    if (soundboardMounted || !session) return;
    const root = document.getElementById("soundboardRoot");
    if (!root) return;
    const isMg = session.role === "mg";
    mountSoundboardPlayer(root, {
        manifest: getData()?.soundboard || [],
        subscribe,
        getState,
        onMusicEnded: isMg
            ? (playlistId, finishedKey) => advancePlaylistTrack({ state: getState(), updateState }, playlistId, finishedKey)
            : undefined
    });
    soundboardMounted = true;
}

/** Zatrzymuje wspólne odtwarzanie (muzyka/playlista w tle) dla WSZYSTKICH - wywoływane, gdy MG
 *  zamyka swój widok (patrz setupChangeCharacterButton). Bez tego muzyka/playlista zostałaby
 *  puszczona dalej bez nikogo, kto by nią sterował - a playlisty w ogóle przestałyby się
 *  automatycznie przesuwać, bo tylko przeglądarka MG jest "dyrygentem" (patrz
 *  ensureSoundboardMounted, control-panel.js#advancePlaylistTrack). Efekty jednorazowe (sfxFired)
 *  celowo zostają - to już i tak przebrzmiały, jednorazowy sygnał, nie ma czego zatrzymywać. */
function stopSharedPlayback() {
    const state = getState();
    if (!state?.soundboard?.music) return;
    updateState((s) => { if (s.soundboard) s.soundboard.music = null; });
}

function renderAll() {
    const state = getState();
    const data = getData();
    if (!state || !session) return;

    if (session.role === "mg") {
        const mgRoot = document.getElementById("mgUnifiedRoot");
        if (mgRoot && mgPanel.render) mgPanel.render(mgRoot, { state, data, session, updateState });
        renderModal();
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

    const journalRoot = document.getElementById("panel-journal");
    if (journalRoot) journalPanel.render(journalRoot, { state, data, session, updateState });

    renderModal();
}

function renderModal() {
    const modalRoot = document.getElementById("modalRoot");
    if (modalRoot) modalRoot.innerHTML = buildModalHtml();
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
        if (session?.role === "mg") stopSharedPlayback();
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
        setBootStatus("Wczytywanie danych systemowych...");
        const gameData = await loadGameData();
        cachedGameData = gameData;
        initStore(gameData);

        setBootStatus("Łączenie ze wspólną kampanią...");
        await connectCampaign();

        subscribe(renderAll);
        subscribeModal(renderModal);
        setupTabs();
        setupSaveIndicator();
        setupChangeCharacterButton();
        wireModalGlobalEvents(renderModal);

        setBootStatus("Wybierz, kto patrzy...");

        showGate(gameData, {
            onDone: (selection) => {
                session = selection;
                applyRoleVisibility();
                renderAll();
                ensureSoundboardMounted();
                setBootStatus(`Gotowe. Dane wczytane: ${Object.keys(gameData).length}/7 plików.`);
            }
        });
    } catch (err) {
        console.error("[HysteriaHighest] Błąd inicjalizacji:", err);
        setBootStatus(`Błąd inicjalizacji: ${err.message}`);
    }
}

bootstrap();
