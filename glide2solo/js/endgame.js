// GLIDE: Part Two — Rozdroże (ekran decyzji końcowej), pokazywany na żądanie z przycisku
// "Zdecyduj co dalej →" w panelu Postać (patrz panels/character.js), odblokowywanego dopiero
// przy Sława >= mechanics.json#resources.fame.end_game_threshold. Dwie ścieżki, patrz
// data/endgame.json#_meta.notes:
//
//   Ścieżka A "Nowa Twarz" — ta postać kończy swoją historię (zapis zostaje w Firebase,
//   nienaruszony — gracz może do niego wrócić, wpisując ponownie to samo imię na ekranie
//   startowym). Gracz wybiera 1 z 4 legacy_traits jako spuściznę dla następcy. Ponieważ nowa
//   postać jeszcze nie istnieje (i store.js obsługuje tylko jeden podłączony zapis naraz),
//   wybór jest zapisywany do localStorage (PENDING_BRIDGE_KEY) jako "most" — dopiero
//   gate.js#goToRoleOrFinish, po podłączeniu NOWEGO zapisu, odczytuje i konsumuje ten most
//   (patrz consumePendingBridge tam), stosując efekt Cechy Spuścizny na świeżo utworzonej
//   postaci, ustawiając licznik Nowej Gry+ (character.generation, patrz panels/character.js —
//   odznaka pod kartą Postaci), dopisując pierwszy wpis Dziennika z Wynikiem Dziedzictwa i
//   statystykami końcowymi poprzednika (bridge.legacySummary, patrz computeLegacySummary niżej)
//   oraz umieszczając Pomnik poprzednika na mapie (panels/map.js#placeMemorialHex).
//
//   Ścieżka B "Kontynuacja" — ta sama postać gra dalej. W zamian Sława resetuje się do 0
//   (mechanics.json#end_game.path_b_trade_in.clean_slate), a gracz wybiera dokładnie 2 z 4
//   trade_in_rewards (data/endgame.json), których efekty stosujemy od razu na aktualnym
//   stanie. Brak mostu do gate.js — to czysto lokalna operacja na bieżącym zapisie.
import { getState, touch } from "./store.js";
import { escapeHtml } from "./utils.js";
import { logEvent } from "./eventLog.js";
import { showGate } from "./gate.js";
import { writePendingBridge } from "./endgameBridge.js";
import { bondLevelFromPoints } from "./state.js";

const overlayEl = document.getElementById("endgameOverlay");
const appEl = document.getElementById("app");

const STAT_ORDER = ["H", "K", "R", "C", "F"];

let currentData = null;
let step = null; // "choice" | "pathA" | "pathB" | null (null = ukryty)
let selectedTraitId = null;
let selectedSubChoice = null; // guildId (faction_patron) albo klucz statu (veterans_teachings)
let selectedRewardIds = []; // max 2, kolejność wyboru zachowana pod względem UX

function resetLocalState() {
    step = null;
    selectedTraitId = null;
    selectedSubChoice = null;
    selectedRewardIds = [];
}

function traitNeedsSubChoice(trait) {
    return !!trait?.choice;
}

function traitReady(trait) {
    if (!trait) return false;
    if (!traitNeedsSubChoice(trait)) return true;
    return !!selectedSubChoice;
}

// ── Render ────────────────────────────────────────────────────────────────

function renderChoiceStep(ch) {
    const fame = ch.resources.fame;
    return `
        <h1>ROZDROŻE</h1>
        <p class="gate-sub">Sława Poszukiwacza (${fame}) osiągnęła próg zakończenia — czas zdecydować, co dalej z historią „${escapeHtml(ch.name || "Poszukiwacz")}”.</p>
        <div class="endgame-choice-grid">
            <div class="card endgame-choice-card">
                <h3>Ścieżka A — Nowa Twarz</h3>
                <p>Historia tej postaci dobiega końca. Zaczynasz od nowa nową postacią, która dziedziczy jedną Cechę Spuścizny po poprzedniku. Ten zapis zostaje zachowany — możesz do niego wrócić, wpisując ponownie to samo imię na ekranie startowym.</p>
                <button class="btn btn-primary" data-action="endgame-goto-path-a">Wybierz Nową Twarz →</button>
            </div>
            <div class="card endgame-choice-card">
                <h3>Ścieżka B — Kontynuacja</h3>
                <p>Ta postać gra dalej. Twoja Sława resetuje się do 0, a w zamian wybierz dokładnie 2 z 4 nagród za wymianę.</p>
                <button class="btn btn-primary" data-action="endgame-goto-path-b">Wybierz Kontynuację →</button>
            </div>
        </div>
        <div class="gate-actions">
            <button class="btn btn-secondary" data-action="endgame-cancel">Anuluj</button>
        </div>
    `;
}

function renderTraitSubChoice(trait, data) {
    if (!traitNeedsSubChoice(trait)) return "";
    if (trait.choice.type === "guild") {
        const guilds = data.guilds?.guilds ?? [];
        return `
            <select data-action="endgame-select-subchoice">
                <option value="">— ${escapeHtml(trait.choice.prompt_pl)} —</option>
                ${guilds.map(g => `<option value="${g.id}" ${selectedSubChoice === g.id ? "selected" : ""}>${escapeHtml(g.name_pl)}</option>`).join("")}
            </select>
        `;
    }
    if (trait.choice.type === "stat") {
        return `
            <select data-action="endgame-select-subchoice">
                <option value="">— ${escapeHtml(trait.choice.prompt_pl)} —</option>
                ${STAT_ORDER.map(key => {
                    const statDef = data.mechanics.stats.find(s => s.key === key);
                    return `<option value="${key}" ${selectedSubChoice === key ? "selected" : ""}>${escapeHtml(statDef?.name || key)} (${key})</option>`;
                }).join("")}
            </select>
        `;
    }
    return "";
}

function renderPathAStep(data, ch) {
    const traits = data.endgame?.legacy_traits ?? [];
    const selectedTrait = traits.find(t => t.id === selectedTraitId);
    const canConfirm = traitReady(selectedTrait);
    return `
        <h1>NOWA TWARZ</h1>
        <p class="gate-sub">Wynik Spuścizny: ${ch.resources.fame} — wybierz Cechę, którą odziedziczy następca „${escapeHtml(ch.name || "Poszukiwacza")}”.</p>
        <div class="endgame-trait-list">
            ${traits.map(t => `
                <label class="endgame-trait-card ${selectedTraitId === t.id ? "selected" : ""}">
                    <input type="radio" name="legacy-trait" value="${t.id}" data-action="endgame-select-trait" ${selectedTraitId === t.id ? "checked" : ""}>
                    <div class="endgame-trait-body">
                        <strong>${escapeHtml(t.name_pl)}</strong>
                        <p>${escapeHtml(t.description_pl)}</p>
                        ${selectedTraitId === t.id ? renderTraitSubChoice(t, data) : ""}
                    </div>
                </label>
            `).join("")}
        </div>
        <div class="gate-actions">
            <button class="btn btn-secondary" data-action="endgame-back">Wstecz</button>
            <button class="btn btn-primary" data-action="endgame-confirm-a" ${canConfirm ? "" : "disabled"}>Zakończ historię →</button>
        </div>
    `;
}

function renderPathBStep(data, ch) {
    const rewards = data.endgame?.trade_in_rewards ?? [];
    const fame = ch.resources.fame;
    const canConfirm = selectedRewardIds.length === 2;
    return `
        <h1>KONTYNUACJA</h1>
        <p class="gate-sub">Wybierz dokładnie 2 z 4 nagród za wymianę — Twoja Sława (obecnie: ${fame}) resetuje się do 0.</p>
        <div class="endgame-trait-list">
            ${rewards.map(r => {
                const checked = selectedRewardIds.includes(r.id);
                const disabled = !checked && selectedRewardIds.length >= 2;
                return `
                    <label class="endgame-trait-card ${checked ? "selected" : ""} ${disabled ? "disabled" : ""}">
                        <input type="checkbox" value="${r.id}" data-action="endgame-toggle-reward" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
                        <div class="endgame-trait-body">
                            <strong>${escapeHtml(r.name_pl)}</strong>
                            <p>${escapeHtml(r.description_pl)}</p>
                        </div>
                    </label>
                `;
            }).join("")}
        </div>
        <p class="gate-sub" style="margin:10px 0 0;">Wybrano: ${selectedRewardIds.length} / 2</p>
        <div class="gate-actions">
            <button class="btn btn-secondary" data-action="endgame-back">Wstecz</button>
            <button class="btn btn-primary" data-action="endgame-confirm-b" ${canConfirm ? "" : "disabled"}>Potwierdź →</button>
        </div>
    `;
}

function renderOverlay() {
    if (!step) { overlayEl.innerHTML = ""; return; }
    const state = getState();
    const ch = state.character;
    let inner = "";
    if (step === "choice") inner = renderChoiceStep(ch);
    else if (step === "pathA") inner = renderPathAStep(currentData, ch);
    else if (step === "pathB") inner = renderPathBStep(currentData, ch);
    overlayEl.innerHTML = `<div class="gate-card endgame-card">${inner}</div>`;
}

// ── Efekt gwiazd (monochromatyczny flourish przy potwierdzeniu decyzji) ────

function spawnStarBurst() {
    const layer = document.createElement("div");
    layer.className = "endgame-star-layer";
    const STAR_COUNT = 18;
    for (let i = 0; i < STAR_COUNT; i++) {
        const star = document.createElement("span");
        star.className = "endgame-star";
        star.textContent = "✦";
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
        star.style.fontSize = `${10 + Math.random() * 14}px`;
        layer.appendChild(star);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1600);
}

// ── Ścieżka A: Nowa Twarz ────────────────────────────────────────────────

/** Wynik Dziedzictwa (własna treść, patrz mechanics.json#end_game.legacy_score_formula) = Sława
 *  na koniec gry + liczba Poziom Więzi 4 z gildiami + liczba Poziom Więzi 4 z towarzyszem (0 albo
 *  1 — w tej grze solo jest tylko jeden towarzysz naraz). Do tego kilka ciekawostkowych statystyk
 *  końcowych postaci — całość trafia do bridge.legacySummary i jest zapisywana jako pierwszy wpis
 *  Dziennika Nowej Twarzy (patrz gate.js#applyPendingBridgeIfAny). Liczone tu, PRZED przełączeniem
 *  na nowy zapis, bo to ostatni moment, w którym `state` wciąż wskazuje na kończącą historię postać. */
function computeLegacySummary(state) {
    const ch = state.character;
    const fame = ch.resources.fame;
    const guildBondsLevel4 = Object.values(state.guildBonds || {})
        .filter(b => bondLevelFromPoints(b.points) === 4).length;
    const companionLevel4 = (ch.companion?.key && bondLevelFromPoints(ch.companion.bondPoints) === 4) ? 1 : 0;

    let hexesDiscovered = 0;
    for (const seg of Object.values(state.map?.segments || {})) {
        hexesDiscovered += Object.values(seg.hexes || {}).filter(h => h.discovered).length;
    }
    const gearCount = Object.values(ch.gear || {}).filter(g => g.owned).length;
    const modsCount = Object.values(ch.glider?.mods || {}).filter(m => m.owned).length;

    return {
        legacyScore: fame + guildBondsLevel4 + companionLevel4,
        fame,
        guildBondsLevel4,
        companionLevel4,
        finalDay: state.day.current,
        hexesDiscovered,
        credits: ch.resources.credits,
        gearCount,
        modsCount
    };
}

function confirmPathA() {
    const state = getState();
    const ch = state.character;
    const traits = currentData.endgame?.legacy_traits ?? [];
    const trait = traits.find(t => t.id === selectedTraitId);
    if (!trait || !traitReady(trait)) return;

    if (!window.confirm(`Na pewno? Historia postaci „${ch.name || "Poszukiwacz"}” dobiega końca. Ten zapis zostaje zachowany (możesz do niego wrócić, wpisując to samo imię), ale dashboard przełączy się teraz na tworzenie Nowej Twarzy.`)) {
        return;
    }

    const bridge = {
        type: "new-face",
        previousName: ch.name,
        traitId: trait.id,
        traitName: trait.name_pl,
        subChoice: selectedSubChoice || null,
        generation: ch.generation || 1,
        legacySummary: computeLegacySummary(state),
        createdAt: Date.now()
    };
    try {
        writePendingBridge(bridge);
    } catch (err) {
        console.error("[GLIDE] Nie udało się zapisać mostu Nowej Twarzy do localStorage:", err);
        alert("Nie udało się zapisać decyzji lokalnie — spróbuj ponownie.");
        return;
    }

    logEvent(state, "endgame", `Historia „${ch.name || "Poszukiwacza"}” dobiega końca. Spuścizna dla następcy: ${trait.name_pl}.`);
    touch();

    spawnStarBurst();
    const data = currentData;
    hideOverlay();
    // Otwiera ekran startowy na krok imienia — bez Anuluj, bo most już zapisany do localStorage
    // (konsumowany dopiero przy podłączeniu nowego zapisu, patrz gate.js#consumePendingBridge).
    showGate(data, { allowCancel: false });
}

// ── Ścieżka B: Kontynuacja ───────────────────────────────────────────────

function applyTradeInReward(state, effect) {
    const ch = state.character;
    const glider = ch.glider;
    if (typeof effect.credits === "number") ch.resources.credits += effect.credits;
    if (typeof effect.intel === "number") ch.resources.intel.cur += effect.intel;
    if (typeof effect.scrap === "number") glider.scrap.cur += effect.scrap;
    if (typeof effect.relics === "number") glider.relics.cur += effect.relics;
    if (typeof effect.speedBonusPermanent === "number") {
        glider.speed.max += effect.speedBonusPermanent;
        glider.speed.cur += effect.speedBonusPermanent;
    }
}

function confirmPathB() {
    const state = getState();
    const ch = state.character;
    if (selectedRewardIds.length !== 2) return;

    const rewards = currentData.endgame?.trade_in_rewards ?? [];
    const chosen = selectedRewardIds.map(id => rewards.find(r => r.id === id)).filter(Boolean);
    if (chosen.length !== 2) return;

    const fameBefore = ch.resources.fame;
    if (!window.confirm(`Potwierdź: Twoja Sława (${fameBefore}) zresetuje się do 0 w zamian za „${chosen[0].name_pl}” i „${chosen[1].name_pl}”?`)) {
        return;
    }

    for (const r of chosen) applyTradeInReward(state, r.effect);
    ch.resources.fame = 0;
    logEvent(state, "endgame", `Kontynuacja: Sława zresetowana do 0 (było: ${fameBefore}) w zamian za „${chosen[0].name_pl}” i „${chosen[1].name_pl}”.`);
    touch();

    spawnStarBurst();
    hideOverlay();
}

// ── Sterowanie overlayem ─────────────────────────────────────────────────

function hideOverlay() {
    resetLocalState();
    overlayEl.classList.remove("active");
    appEl.classList.remove("hidden");
    overlayEl.innerHTML = "";
}

export function showEndgameDecision(data) {
    currentData = data;
    step = "choice";
    selectedTraitId = null;
    selectedSubChoice = null;
    selectedRewardIds = [];
    renderOverlay();
    overlayEl.classList.add("active");
    appEl.classList.add("hidden");
    wireOnce();
}

let wired = false;
function wireOnce() {
    if (wired) return;
    wired = true;

    overlayEl.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "endgame-cancel") {
            hideOverlay();
        } else if (action === "endgame-goto-path-a") {
            step = "pathA";
            renderOverlay();
        } else if (action === "endgame-goto-path-b") {
            step = "pathB";
            renderOverlay();
        } else if (action === "endgame-back") {
            step = "choice";
            selectedTraitId = null;
            selectedSubChoice = null;
            selectedRewardIds = [];
            renderOverlay();
        } else if (action === "endgame-confirm-a") {
            confirmPathA();
        } else if (action === "endgame-confirm-b") {
            confirmPathB();
        } else if (action === "endgame-toggle-reward") {
            const id = btn.value;
            const idx = selectedRewardIds.indexOf(id);
            if (idx >= 0) selectedRewardIds.splice(idx, 1);
            else if (selectedRewardIds.length < 2) selectedRewardIds.push(id);
            renderOverlay();
        }
        // endgame-select-trait (radio) obsługiwane w "change" niżej — klik na samym labelu/inpucie
        // radiowym też przechodzi przez ten listener (bo bąbelkuje), ale zmiana stanu i tak czeka
        // na "change", więc nic tu nie robimy.
    });

    overlayEl.addEventListener("change", (e) => {
        const el = e.target;
        const action = el.dataset.action;
        if (action === "endgame-select-trait") {
            selectedTraitId = el.value;
            selectedSubChoice = null;
            renderOverlay();
        } else if (action === "endgame-select-subchoice") {
            selectedSubChoice = el.value || null;
            renderOverlay();
        }
    });
}
