// Panel: Uniwersalny roller. Faza 3: Challenge Roll, Location Type/Level Table, Exhaustion Table.
// Faza 4: Desert/Ruins/Green Space (landmarks+events), Unique Locations, Settlement tables, Travel/Carousing Events.
// Faza 5 (Companions/Odd-Jobs/Oracles) dochodzi później.
import { getState, touch } from "../store.js";
import { rollDie, rollD2, rollD5, rollD100, findInRangeTable, parseRange, clamp } from "../utils.js";
import { logRoll } from "../rollLog.js";

const STAT_ORDER = ["H", "K", "R", "C", "F"];
const STAT_NAMES = { H: "Hardy", K: "Knowledgeable", R: "Resourceful", C: "Connected", F: "Focused" };

const BIOME_TABLES = {
    desert: { label: "Desert", key: "desert" },
    ruins: { label: "Ruins", key: "ruins" },
    green_space: { label: "Green Space", key: "green_space" }
};

// Klucze wspólne dla tabel eventów, obsługiwane w renderEventOutcomes() nazwami własnymi —
// wszystkie inne pola encji są renderowane generycznie (patrz humanizeKey), bo tabele w economy.json
// (zwł. settlement_events_table_d100) mają wiele niestandardowych pól wynikowych (give_5, sell_1, bet, free, ...).
const CORE_EVENT_KEYS = new Set(["range", "name", "description", "test", "major", "minor", "miss", "spend", "note"]);

// Stan lokalny UI rollera (nietrwały — nie zapisujemy do Firebase, tylko historia rzutów jest trwała).
const ui = {
    challenge: { statKey: "H", bonus: 0, difficulty: 1, result: null },
    locType: { result: null },
    locLevel: { result: null },
    exhaustion: { result: null },
    biome: { key: "desert", landmark: null, event: null },
    uniqueLoc: { result: null },
    settlement: { name: null, focus: null, trait: null, event: null },
    travel: { result: null },
    carousing: { result: null }
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

/** Generyczny resolver zakresowy z obsługą luk w druku: albo brak dopasowania zakresu w ogóle
 *  (np. green_space.json landmarks — zakres "54-54" zamiast "53-54", roll=53 nie trafia w nic),
 *  albo dopasowanie zakresu z wartością null we wskazanym polu (np. desert.json landmarks 45-46
 *  ma text: null). W obu przypadkach: użyj najbliższego niższego wpisu z poprawną wartością. */
function resolveRangeEntry(table, roll, { rangeField = "range", valueField = null } = {}) {
    let entry = null;
    for (const e of table) {
        const range = parseRange(e[rangeField]);
        if (range && roll >= range[0] && roll <= range[1]) { entry = e; break; }
    }
    let gapFallback = false;
    if (!entry || (valueField && (entry[valueField] === null || entry[valueField] === undefined))) {
        gapFallback = true;
        let best = null, bestMax = -Infinity;
        for (const e of table) {
            const range = parseRange(e[rangeField]);
            if (!range) continue;
            if (valueField && (e[valueField] === null || e[valueField] === undefined)) continue;
            if (range[1] < roll && range[1] > bestMax) { best = e; bestMax = range[1]; }
        }
        if (best) entry = best;
    }
    return { entry, gapFallback };
}

/** Rzuca d100 (2d10 wg mechaniki podręcznika) i rozwiązuje wynik w tabeli zakresowej. */
function rollD100Table(table, opts) {
    const { total } = rollD100();
    const { entry, gapFallback } = resolveRangeEntry(table, total, opts);
    return { roll: total, entry, gapFallback };
}

function humanizeKey(key) {
    return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/** Renderuje pola wynikowe encji eventu: test/major/minor/miss/spend/options/extra po nazwie,
 *  a wszelkie inne, niestandardowe pola (np. give_5, sell_1, bet, free, join_the_crowd) generycznie. */
function renderEventOutcomes(entry) {
    const parts = [];
    if (entry.test) parts.push(`<p><strong>Test:</strong> ${entry.test}</p>`);
    if (entry.major) parts.push(`<p><strong>Major:</strong> ${entry.major}</p>`);
    if (entry.minor) parts.push(`<p><strong>Minor:</strong> ${entry.minor}</p>`);
    if (entry.miss) parts.push(`<p><strong>Miss:</strong> ${entry.miss}</p>`);
    if (entry.spend) parts.push(`<p class="placeholder"><strong>Spend:</strong> ${entry.spend}</p>`);
    if (Array.isArray(entry.options)) {
        parts.push(`<p><strong>Opcje:</strong></p><ul>${entry.options.map(o => `<li>${o}</li>`).join("")}</ul>`);
    }
    if (entry.extra) parts.push(`<p class="placeholder"><strong>Dodatkowo:</strong> ${entry.extra}</p>`);
    for (const key of Object.keys(entry)) {
        if (CORE_EVENT_KEYS.has(key) || key === "options" || key === "extra") continue;
        const val = entry[key];
        if (val === null || val === undefined) continue;
        parts.push(`<p><strong>${humanizeKey(key)}:</strong> ${val}</p>`);
    }
    return parts.join("");
}

/** Generyczny render dla prostych tabel zakresowych (name i/lub description i/lub text). */
function renderGenericEntry(r, rangeLabel = "d100") {
    const e = r.entry;
    if (!e) return `<p class="placeholder">Brak dopasowania w tabeli.</p>`;
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta"><span>${rangeLabel} = ${r.roll}</span></div>
            ${e.name ? `<div class="entry-result"><strong>${e.name}</strong></div>` : ""}
            ${e.description ? `<p>${e.description}</p>` : ""}
            ${e.text ? `<div class="entry-result">${e.text}</div>` : ""}
            ${r.gapFallback ? `<p class="placeholder">Uwaga: luka w druku — użyto najbliższego niższego wyniku.</p>` : ""}
        </div>
    `;
}

/** Render dla tabel eventów (Desert/Ruins/Green Space events + Settlement Events). */
function renderEventEntry(r, rangeLabel = "d100") {
    const e = r.entry;
    if (!e) return `<p class="placeholder">Brak dopasowania w tabeli.</p>`;
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta"><span>${rangeLabel} = ${r.roll}</span></div>
            <div class="entry-result"><strong>${e.name || ""}</strong></div>
            ${e.description ? `<p>${e.description}</p>` : ""}
            ${renderEventOutcomes(e)}
            ${r.gapFallback ? `<p class="placeholder">Uwaga: luka w druku — użyto najbliższego niższego wyniku.</p>` : ""}
        </div>
    `;
}

function renderUniqueAction(a) {
    const parts = [`<div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--line);"><strong>${a.name}</strong></div>`];
    if (a.test) parts.push(`<p class="placeholder">${a.test}</p>`);
    if (a.major) parts.push(`<p><strong>Major:</strong> ${a.major}</p>`);
    if (a.minor) parts.push(`<p><strong>Minor:</strong> ${a.minor}</p>`);
    if (a.miss) parts.push(`<p><strong>Miss:</strong> ${a.miss}</p>`);
    if (a.effect) parts.push(`<p>${a.effect}</p>`);
    if (Array.isArray(a.options)) parts.push(`<ul>${a.options.map(o => `<li>${o}</li>`).join("")}</ul>`);
    return parts.join("");
}

function renderUniqueLocationResult(r) {
    const e = r.entry;
    if (!e) return `<p class="placeholder">Brak dopasowania w tabeli.</p>`;
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta"><span>d100 = ${r.roll}</span></div>
            <div class="entry-result"><strong>${e.name}</strong></div>
            <p>${e.description}</p>
            ${e.notes ? `<p class="placeholder">${e.notes}</p>` : ""}
            ${(e.actions || []).map(a => renderUniqueAction(a)).join("")}
        </div>
    `;
}

function renderSettlementActionsReference(actions) {
    return Object.entries(actions).map(([catKey, cat]) => `
        <div style="margin-bottom:10px;">
            <div class="entry-meta"><span>${humanizeKey(catKey)}</span></div>
            ${Object.entries(cat).map(([k, v]) => `<p><strong>${humanizeKey(k)}:</strong> ${v}</p>`).join("")}
        </div>
    `).join("");
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

        <div class="card" style="margin-top:12px;">
            <h2>Desert / Ruins / Green Space</h2>
            <div class="counter-row">
                <div class="counter-label">Biom</div>
                <select data-action="biome-select">
                    ${Object.entries(BIOME_TABLES).map(([k, v]) => `<option value="${k}" ${ui.biome.key === k ? "selected" : ""}>${v.label}</option>`).join("")}
                </select>
            </div>
            <div class="counter-controls" style="gap:8px; margin-top:8px;">
                <button class="btn" data-action="roll-biome-landmark">Rzuć Landmark (d100)</button>
                <button class="btn" data-action="roll-biome-event">Rzuć Event (d100)</button>
            </div>
            ${ui.biome.landmark ? renderGenericEntry(ui.biome.landmark, "Landmark d100") : ""}
            ${ui.biome.event ? renderEventEntry(ui.biome.event, "Event d100") : ""}
        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Unique Location (d100)</h2>
            <p class="placeholder">${data.unique_locations.rules.reveal}</p>
            <button class="btn btn-primary" data-action="roll-unique-location">Rzuć d100</button>
            ${ui.uniqueLoc.result ? renderUniqueLocationResult(ui.uniqueLoc.result) : ""}
        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Settlement — Nazwa / Focus / Cecha (d100)</h2>
            <div class="grid grid-3">
                <div>
                    <button class="btn btn-sm" data-action="roll-settlement-name">Nazwa</button>
                    ${ui.settlement.name ? renderGenericEntry(ui.settlement.name, "d100") : ""}
                </div>
                <div>
                    <button class="btn btn-sm" data-action="roll-settlement-focus">Focus</button>
                    ${ui.settlement.focus ? renderGenericEntry(ui.settlement.focus, "d100") : ""}
                </div>
                <div>
                    <button class="btn btn-sm" data-action="roll-settlement-trait">Cecha</button>
                    ${ui.settlement.trait ? renderGenericEntry(ui.settlement.trait, "d100") : ""}
                </div>
            </div>
        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Settlement Event (d100)</h2>
            <button class="btn btn-primary" data-action="roll-settlement-event">Rzuć d100</button>
            ${ui.settlement.event ? renderEventEntry(ui.settlement.event, "d100") : ""}
        </div>

        <div class="grid grid-2" style="margin-top:12px;">
            <div class="card">
                <h2>Travel Event (d100)</h2>
                <button class="btn" data-action="roll-travel-event">Rzuć d100</button>
                ${ui.travel.result ? renderGenericEntry(ui.travel.result, "d100") : ""}
            </div>
            <div class="card">
                <h2>Carousing Event (d100)</h2>
                <p class="placeholder">Koszt: ${data.economy.settlement_actions.carousing.cost}</p>
                <button class="btn" data-action="roll-carousing-event">Rzuć d100</button>
                ${ui.carousing.result ? renderGenericEntry(ui.carousing.result, "d100") : ""}
            </div>
        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Settlement Actions — Referencja</h2>
            ${renderSettlementActionsReference(data.economy.settlement_actions)}
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

function rollBiomeLandmark(data) {
    const biome = BIOME_TABLES[ui.biome.key];
    const table = data[biome.key].landmarks_table_d100;
    const r = rollD100Table(table, { valueField: "text" });
    ui.biome.landmark = r;
    logRoll(`${biome.label} — Landmark (d100)`, `d100=${r.roll}`, r.entry ? r.entry.text : "brak dopasowania");
    rerender();
}

function rollBiomeEvent(data) {
    const biome = BIOME_TABLES[ui.biome.key];
    const table = data[biome.key].events_table_d100;
    const r = rollD100Table(table);
    ui.biome.event = r;
    logRoll(`${biome.label} — Event (d100)`, `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    rerender();
}

function rollUniqueLocation(data) {
    const table = data.unique_locations.unique_locations_table_d100;
    const r = rollD100Table(table);
    ui.uniqueLoc.result = r;
    logRoll("Unique Location (d100)", `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    rerender();
}

function rollSettlementName(data) {
    const table = data.economy.settlement_names_table_d100;
    const r = rollD100Table(table);
    ui.settlement.name = r;
    logRoll("Settlement — Nazwa (d100)", `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    rerender();
}

function rollSettlementFocus(data) {
    const table = data.economy.settlement_focus_table_d100;
    const r = rollD100Table(table);
    ui.settlement.focus = r;
    logRoll("Settlement — Focus (d100)", `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    rerender();
}

function rollSettlementTrait(data) {
    const table = data.economy.settlement_traits_table_d100;
    const r = rollD100Table(table);
    ui.settlement.trait = r;
    logRoll("Settlement — Cecha (d100)", `d100=${r.roll}`, r.entry ? r.entry.text : "brak dopasowania");
    rerender();
}

function rollSettlementEvent(data) {
    const table = data.economy.settlement_events_table_d100;
    const r = rollD100Table(table);
    ui.settlement.event = r;
    logRoll("Settlement Event (d100)", `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    rerender();
}

function rollTravelEvent(data) {
    const table = data.economy.travel_events_table_d100;
    const r = rollD100Table(table);
    ui.travel.result = r;
    logRoll("Travel Event (d100)", `d100=${r.roll}`, r.entry ? r.entry.text : "brak dopasowania");
    rerender();
}

function rollCarousingEvent(data) {
    const table = data.economy.carousing_events_table_d100;
    const r = rollD100Table(table);
    ui.carousing.result = r;
    logRoll("Carousing Event (d100)", `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    rerender();
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        const el = e.target;
        const action = el.dataset.action;
        if (action === "challenge-stat") ui.challenge.statKey = el.value;
        else if (action === "biome-select") { ui.biome.key = el.value; rerender(); }
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
        else if (action === "roll-biome-landmark") rollBiomeLandmark(currentData);
        else if (action === "roll-biome-event") rollBiomeEvent(currentData);
        else if (action === "roll-unique-location") rollUniqueLocation(currentData);
        else if (action === "roll-settlement-name") rollSettlementName(currentData);
        else if (action === "roll-settlement-focus") rollSettlementFocus(currentData);
        else if (action === "roll-settlement-trait") rollSettlementTrait(currentData);
        else if (action === "roll-settlement-event") rollSettlementEvent(currentData);
        else if (action === "roll-travel-event") rollTravelEvent(currentData);
        else if (action === "roll-carousing-event") rollCarousingEvent(currentData);
    });
}
