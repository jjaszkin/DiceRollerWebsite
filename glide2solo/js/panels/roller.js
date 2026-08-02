// Panel: Uniwersalny roller. Faza 3: Challenge Roll, Location Type/Level Table, Exhaustion Table.
// Kolejne tabele (Desert/Ruins/Green Space/Unique/Settlement/Travel/Carousing, Companions/Odd-Jobs/Oracles)
// dochodzą w Fazach 4-5.
import { getState, touch } from "../store.js";
import { rollDie, rollD2, rollD5, findInRangeTable, parseRange, clamp } from "../utils.js";
import { logRoll } from "../rollLog.js";

const STAT_ORDER = ["H", "K", "R", "C", "F"];
const STAT_NAMES = { H: "Hardy", K: "Knowledgeable", R: "Resourceful", C: "Connected", F: "Focused" };

// Stan lokalny UI rollera (nietrwały — nie zapisujemy do Firebase, tylko historia rzutów jest trwała).
const ui = {
    challenge: { statKey: "H", bonus: 0, difficulty: 1, result: null },
    locType: { result: null },
    locLevel: { result: null },
    exhaustion: { result: null }
};

let currentRoot = null;
let currentData = null;

function rerender() {
    if (currentRoot) render(currentRoot, { state: getState(), data: currentData });
}

function rollTiles(tilesNotation) {
    if (tilesNotation === "d2") return rollD2();
    if (tilesNotation === "d5") return rollD5();
    return null;
}

function needsTileRoll(tiles) {
    return typeof tiles === "string";
}

/** Location Level Table ma udokumentowaną lukę w druku dla rzutu 9 (level: null).
 *  Defensywnie: użyj najbliższego niższego wpisu z poprawnym poziomem. */
function resolveLocationLevel(table, roll) {
    const entry = findInRangeTable(table, roll, "roll");
    if (entry && entry.level !== null && entry.level !== undefined) {
        return { level: entry.level, gapFallback: false };
    }
    let best = null, bestMax = -Infinity;
    for (const e of table) {
        const range = parseRange(e.roll);
        if (range && e.level !== null && e.level !== undefined && range[1] < roll && range[1] > bestMax) {
            best = e; bestMax = range[1];
        }
    }
    return { level: best ? best.level : 0, gapFallback: true };
}

function brushWithDeathSub(roll) {
    if (roll >= 1 && roll <= 4) return "Tracisz 2 sztuki sprzętu i 3 Supply.";
    if (roll >= 5 && roll <= 8) return "-2 Bond Points x3 (dowolna kombinacja) i -2 Intel.";
    return "Zaznacz 1 Wear na całym sprzęcie i gliderze; tracisz wszystkie Relics i Scrap.";
}

function renderChallengeResult(r) {
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta">
                <span>Gracz: d10=${r.playerDie} + ${r.statKey}(${r.statVal}) + bonus(${r.bonus}) = ${r.playerTotal}</span>
                <span>Wyzwanie: d10=${r.challengeDie} + DL(${r.difficulty}) = ${r.challengeTotal}</span>
            </div>
            <div class="entry-result"><strong>${r.outcomeLabel}</strong></div>
        </div>
    `;
}

function renderExhaustionResult(r) {
    const e = r.entry;
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta"><span>d10 = ${r.roll}</span></div>
            <div class="entry-result"><strong>${e.name}</strong></div>
            <p>${e.effect}</p>
            <p class="placeholder">Odzyskaj Staminę: ${e.recover_stamina}</p>
            <button class="btn btn-sm" data-action="apply-exhaustion-recovery">Zastosuj odzyskanie Staminy postaci</button>
            ${r.roll === 10 ? `
                <div style="margin-top:8px;">
                    <button class="btn btn-sm" data-action="roll-exhaustion-sub">Rzuć subtabelę „Brush with Death” (d10)</button>
                    ${r.sub ? `<p class="placeholder">Subtabela d10=${r.sub.roll}: ${r.sub.text} (+1 Fame za przeżycie)</p>` : ""}
                </div>
            ` : ""}
        </div>
    `;
}

export function render(root, { state, data }) {
    currentRoot = root;
    currentData = data;

    const mechanics = data.mechanics;
    const ch = state.character;

    root.innerHTML = `
        <div class="grid grid-2">

            <div class="card">
                <h2>Challenge Roll</h2>
                <div class="counter-row">
                    <div class="counter-label">Statystyka</div>
                    <select data-action="challenge-stat">
                        ${STAT_ORDER.map(k => `<option value="${k}" ${ui.challenge.statKey === k ? "selected" : ""}>${STAT_NAMES[k]} (${ch.stats[k]})</option>`).join("")}
                    </select>
                </div>
                <div class="counter-row">
                    <div class="counter-label">Dodatkowe bonusy</div>
                    <input type="number" data-action="challenge-bonus" value="${ui.challenge.bonus}" style="width:70px;">
                </div>
                <div class="counter-row">
                    <div class="counter-label">Poziom trudności lokacji (DL)</div>
                    <input type="number" data-action="challenge-difficulty" value="${ui.challenge.difficulty}" min="0" style="width:70px;">
                </div>
                <button class="btn btn-primary" data-action="roll-challenge">Rzuć Challenge Roll</button>
                ${ui.challenge.result ? renderChallengeResult(ui.challenge.result) : ""}
            </div>

            <div class="card">
                <h2>Location Type (d10)</h2>
                <button class="btn" data-action="roll-loctype">Rzuć d10</button>
                ${ui.locType.result ? `
                    <div class="entry" style="margin-top:10px;">
                        <div class="entry-meta"><span>d10 = ${ui.locType.result.roll}</span></div>
                        <div class="entry-result"><strong>${ui.locType.result.entry.result}</strong> — pola: ${ui.locType.result.entry.tiles}</div>
                        ${needsTileRoll(ui.locType.result.entry.tiles) ? `
                            <button class="btn btn-sm" data-action="roll-loctype-tiles" style="margin-top:6px;">Rzuć liczbę pól (${ui.locType.result.entry.tiles})</button>
                        ` : ""}
                        ${ui.locType.result.tilesRolled !== undefined ? `<p class="placeholder">Wylosowana liczba pól: ${ui.locType.result.tilesRolled}</p>` : ""}
                    </div>
                ` : ""}
            </div>

            <div class="card">
                <h2>Location Level (d10)</h2>
                <p class="placeholder">Unique Location: zawsze Poziom 3 (nie rzucaj). Impassible Terrain: brak poziomu (traktuj jako 0).</p>
                <button class="btn" data-action="roll-loclevel">Rzuć d10</button>
                ${ui.locLevel.result ? `
                    <div class="entry" style="margin-top:10px;">
                        <div class="entry-meta"><span>d10 = ${ui.locLevel.result.roll}</span></div>
                        <div class="entry-result"><strong>Poziom ${ui.locLevel.result.level}</strong></div>
                        ${ui.locLevel.result.gapFallback ? `<p class="placeholder">Uwaga: luka w druku dla rzutu 9 — użyto najbliższego niższego wyniku.</p>` : ""}
                    </div>
                ` : ""}
            </div>

        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Exhaustion Table (d10)</h2>
            <p class="placeholder">Rzuć, gdy Stamina spadnie do 0.</p>
            <button class="btn btn-primary" data-action="roll-exhaustion">Rzuć d10</button>
            ${ui.exhaustion.result ? renderExhaustionResult(ui.exhaustion.result) : ""}
        </div>
    `;

    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}

function rollChallenge() {
    const state = getState();
    const statKey = ui.challenge.statKey;
    const statVal = state.character.stats[statKey] || 0;
    const bonus = ui.challenge.bonus || 0;
    const difficulty = ui.challenge.difficulty || 0;

    const playerDie = rollDie(10);
    const challengeDie = rollDie(10);
    const playerTotal = playerDie + statVal + bonus;
    const challengeTotal = challengeDie + difficulty;

    let outcomeLabel;
    if (playerTotal >= 2 * challengeTotal) outcomeLabel = "Major Success";
    else if (playerTotal >= challengeTotal) outcomeLabel = "Minor Success";
    else outcomeLabel = "Miss";

    ui.challenge.result = { statKey, statVal, bonus, difficulty, playerDie, challengeDie, playerTotal, challengeTotal, outcomeLabel };

    logRoll(
        "Challenge Roll",
        `Gracz: d10=${playerDie} + ${statKey}(${statVal}) + bonus(${bonus}) = ${playerTotal}  |  Wyzwanie: d10=${challengeDie} + DL(${difficulty}) = ${challengeTotal}`,
        outcomeLabel
    );
    rerender();
}

function rollLocationType(data) {
    const table = data.mechanics.location_type_table_d10;
    const roll = rollDie(10);
    const entry = findInRangeTable(table, roll, "roll");
    ui.locType.result = { roll, entry, tilesRolled: undefined };
    logRoll("Location Type (d10)", `d10=${roll}`, `${entry.result} (pola: ${entry.tiles})`);
    rerender();
}

function rollLocationTypeTiles() {
    const r = ui.locType.result;
    if (!r) return;
    const tiles = rollTiles(r.entry.tiles);
    r.tilesRolled = tiles;
    logRoll("Location Type — liczba pól", `${r.entry.tiles}`, `${tiles}`);
    rerender();
}

function rollLocationLevel(data) {
    const table = data.mechanics.location_level_table_d10;
    const roll = rollDie(10);
    const { level, gapFallback } = resolveLocationLevel(table, roll);
    ui.locLevel.result = { roll, level, gapFallback };
    logRoll("Location Level (d10)", `d10=${roll}`, `Poziom ${level}${gapFallback ? " (fallback za lukę w druku)" : ""}`);
    rerender();
}

function rollExhaustion(data) {
    const table = data.mechanics.exhaustion_table_d10;
    const roll = rollDie(10);
    const entry = findInRangeTable(table, roll, "roll");
    ui.exhaustion.result = { roll, entry, sub: null };
    logRoll("Exhaustion Table (d10)", `d10=${roll}`, `${entry.name} — ${entry.effect} (odzyskaj Staminę: ${entry.recover_stamina})`);
    rerender();
}

function rollExhaustionSub() {
    const r = ui.exhaustion.result;
    if (!r || r.roll !== 10) return;
    const subRoll = rollDie(10);
    const text = brushWithDeathSub(subRoll);
    r.sub = { roll: subRoll, text };
    logRoll("Exhaustion — Brush with Death (subtabela)", `d10=${subRoll}`, `${text} (+1 Fame za przeżycie)`);
    rerender();
}

function applyExhaustionRecovery() {
    const r = ui.exhaustion.result;
    if (!r) return;
    const state = getState();
    const stam = state.character.resources.stamina;
    if (r.entry.recover_stamina === "all") {
        stam.cur = stam.max;
    } else {
        stam.cur = clamp(stam.cur + (r.entry.recover_stamina || 0), 0, stam.max);
    }
    touch();
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        const el = e.target;
        const action = el.dataset.action;
        if (action === "challenge-stat") ui.challenge.statKey = el.value;
    });

    root.addEventListener("input", (e) => {
        const el = e.target;
        const action = el.dataset.action;
        if (action === "challenge-bonus") ui.challenge.bonus = parseFloat(el.value) || 0;
        else if (action === "challenge-difficulty") ui.challenge.difficulty = parseFloat(el.value) || 0;
    });

    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "roll-challenge") rollChallenge();
        else if (action === "roll-loctype") rollLocationType(currentData);
        else if (action === "roll-loctype-tiles") rollLocationTypeTiles();
        else if (action === "roll-loclevel") rollLocationLevel(currentData);
        else if (action === "roll-exhaustion") rollExhaustion(currentData);
        else if (action === "roll-exhaustion-sub") rollExhaustionSub();
        else if (action === "apply-exhaustion-recovery") applyExhaustionRecovery();
    });
}
