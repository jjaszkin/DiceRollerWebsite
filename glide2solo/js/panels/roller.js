// Panel: Uniwersalny roller. Faza 3: Challenge Roll, Location Type/Level Table, Exhaustion Table.
// Faza 4: Desert/Ruins/Green Space (landmarks+events), Unique Locations, Settlement tables, Travel/Carousing Events.
// Faza 5: Companions Table, Odd-Jobs Table, Oracle Tools (Glide + 4 biomowe).
import { getState, touch } from "../store.js";
import { rollDie, rollD2, rollD5, rollD100, findInRangeTable, parseRange, clamp, uid } from "../utils.js";
import { logRoll } from "../rollLog.js";

const STAT_ORDER = ["H", "K", "R", "C", "F"];
const STAT_NAMES = { H: "Hardy", K: "Knowledgeable", R: "Resourceful", C: "Connected", F: "Focused" };

const BIOME_TABLES = {
    desert: { label: "Desert", key: "desert" },
    ruins: { label: "Ruins", key: "ruins" },
    green_space: { label: "Green Space", key: "green_space" }
};

const ORACLE_WORD_TABLES = {
    desert: { label: "Desert", key: "desert_oracle" },
    ruins: { label: "Ruins", key: "ruins_oracle" },
    green_space: { label: "Green Space", key: "green_space_oracle" },
    settlement: { label: "Settlement", key: "settlement_oracle" }
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
    carousing: { result: null },
    companions: { candidates: null, seek: null, hiredKey: null },
    oddJobs: { candidates: null, blockedMsg: null },
    oracle: { yesNo: null, wordBiome: "desert", word: null }
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

/** Render kandydata z Companions Table — z przyciskiem naboru (chyba że to już aktualny towarzysz). */
function renderCompanionCandidate(r, idx, currentKey) {
    const e = r.entry;
    if (!e) return `<p class="placeholder">Brak dopasowania w tabeli.</p>`;
    const isCurrent = currentKey && currentKey === e.name;
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta"><span>d100 = ${r.roll}</span></div>
            <div class="entry-result"><strong>${e.name}</strong></div>
            <p>${e.description}</p>
            ${Array.isArray(e.key_stats) ? `<p class="placeholder">Kluczowe statystyki: ${e.key_stats.join(", ")}</p>` : ""}
            ${e.passive_name ? `<p><strong>${e.passive_name}:</strong> ${e.passive_text || ""}</p>` : ""}
            <p class="placeholder">Stamina: ${e.stamina} · Koszt naboru: ${e.hire_cost}</p>
            ${r.gapFallback ? `<p class="placeholder">Uwaga: luka w druku — użyto najbliższego niższego wyniku.</p>` : ""}
            <button class="btn btn-sm" data-action="hire-companion" data-idx="${idx}" ${isCurrent ? "disabled" : ""}>
                ${isCurrent ? "Już zwerbowany" : "Zwerbuj tego towarzysza"}
            </button>
        </div>
    `;
}

/** Render kandydata z Odd-Jobs Table — z przyciskiem przyjęcia (limit 2 aktywnych naraz). */
function renderOddJobCandidate(r, idx) {
    const e = r.entry;
    if (!e) return `<p class="placeholder">Brak dopasowania w tabeli.</p>`;
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta"><span>d100 = ${r.roll}</span></div>
            <div class="entry-result"><strong>${e.name}</strong></div>
            <p class="placeholder">${e.location_type || ""}</p>
            <p>${e.description || ""}</p>
            ${e.task ? `<p><strong>Zadanie:</strong> ${e.task}</p>` : ""}
            ${e.test ? `<p class="placeholder"><strong>Test:</strong> ${e.test}</p>` : ""}
            ${e.reward ? `<p><strong>Nagroda:</strong> ${e.reward}</p>` : ""}
            ${e.fail ? `<p><strong>Porażka:</strong> ${e.fail}</p>` : ""}
            ${r.gapFallback ? `<p class="placeholder">Uwaga: luka w druku — użyto najbliższego niższego wyniku.</p>` : ""}
            <button class="btn btn-sm" data-action="accept-odd-job" data-idx="${idx}">Przyjmij zlecenie</button>
        </div>
    `;
}

function renderOracleYesNoResult(r) {
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta"><span>d10 = ${r.baseRoll}</span></div>
            <div class="entry-result"><strong>${r.base.result_pl || r.base.result}</strong></div>
            <div class="entry-meta" style="margin-top:6px;"><span>Subtabela „${r.sub.name}” — d10 = ${r.subRoll}</span></div>
            <p>${r.subEntry ? r.subEntry.text : "brak dopasowania"}</p>
        </div>
    `;
}

function renderOracleWordResult(r) {
    const e = r.entry;
    if (!e) return `<p class="placeholder">Brak dopasowania w tabeli.</p>`;
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta"><span>d100 = ${r.roll}</span></div>
            <div class="entry-result"><strong>${e.word_pl || e.word}</strong> <span class="placeholder">(${e.word})</span></div>
            ${r.gapFallback ? `<p class="placeholder">Uwaga: luka w druku — użyto najbliższego niższego wyniku.</p>` : ""}
        </div>
    `;
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

        <div class="card" style="margin-top:12px;">
            <h2>Companions Table (d100)</h2>
            <p class="placeholder">${data.companions.rules.finding_companions}</p>
            <div class="counter-controls" style="gap:8px;">
                <button class="btn btn-primary" data-action="roll-companions">Rzuć 2x d100 (nowi kandydaci)</button>
                <button class="btn" data-action="seek-known-companion">Szukaj wcześniej poznanego (d10)</button>
            </div>
            ${ui.companions.seek ? `
                <p class="placeholder" style="margin-top:8px;">Szukanie znanego towarzysza: d10=${ui.companions.seek.roll} — ${ui.companions.seek.success ? "sukces, towarzysz jest dostępny." : "porażka, nie udało się go odnaleźć."}</p>
            ` : ""}
            ${ui.companions.candidates ? `
                <div class="grid grid-2">
                    ${ui.companions.candidates.map((r, i) => renderCompanionCandidate(r, i, ch.companion.key)).join("")}
                </div>
            ` : ""}
        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Odd-Jobs Table (d100)</h2>
            <p class="placeholder">Max. 2 aktywne zlecenia naraz. Aktualnie aktywne: ${state.quests.oddJobs.filter(j => j.status === "active").length}/2.</p>
            <button class="btn btn-primary" data-action="roll-odd-jobs">Rzuć 2x d100 (przerzuca duplikaty)</button>
            ${ui.oddJobs.blockedMsg ? `<p class="placeholder">${ui.oddJobs.blockedMsg}</p>` : ""}
            ${ui.oddJobs.candidates ? `
                <div class="grid grid-2">
                    ${ui.oddJobs.candidates.map((r, i) => renderOddJobCandidate(r, i)).join("")}
                </div>
            ` : ""}
        </div>

        <div class="grid grid-2" style="margin-top:12px;">
            <div class="card">
                <h2>Glide Oracle — Yes/No (d10)</h2>
                <p class="placeholder">${data.oracles.glide_oracle.yes_no_questions.rule}</p>
                <button class="btn btn-primary" data-action="roll-oracle-yesno">Rzuć d10</button>
                ${ui.oracle.yesNo ? renderOracleYesNoResult(ui.oracle.yesNo) : ""}
            </div>
            <div class="card">
                <h2>Word Oracle (d100)</h2>
                <p class="placeholder">${data.oracles.glide_oracle.open_ended_questions.rule}</p>
                <div class="counter-row">
                    <div class="counter-label">Biom</div>
                    <select data-action="oracle-biome-select">
                        ${Object.entries(ORACLE_WORD_TABLES).map(([k, v]) => `<option value="${k}" ${ui.oracle.wordBiome === k ? "selected" : ""}>${v.label}</option>`).join("")}
                    </select>
                </div>
                <button class="btn" data-action="roll-oracle-word" style="margin-top:8px;">Rzuć d100</button>
                ${ui.oracle.word ? renderOracleWordResult(ui.oracle.word) : ""}
            </div>
        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Interpretacja wyroczni — Referencja</h2>
            <p>${data.oracles.glide_oracle.interpreting_results.rule}</p>
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

function rollCompanions(data) {
    const table = data.companions.companions_table_d100;
    const r1 = rollD100Table(table);
    const r2 = rollD100Table(table);
    ui.companions.candidates = [r1, r2];
    logRoll(
        "Companions Table (d100 x2)",
        `d100=${r1.roll}, d100=${r2.roll}`,
        `${r1.entry ? r1.entry.name : "?"} / ${r2.entry ? r2.entry.name : "?"}`
    );
    rerender();
}

function seekKnownCompanion() {
    const roll = rollDie(10);
    const success = roll >= 7;
    ui.companions.seek = { roll, success };
    logRoll("Szukanie znanego towarzysza (d10)", `d10=${roll}`, success ? "Sukces — towarzysz jest dostępny." : "Porażka.");
    rerender();
}

function hireCompanion(idx) {
    const cand = ui.companions.candidates ? ui.companions.candidates[idx] : null;
    if (!cand || !cand.entry) return;
    const c = cand.entry;
    const state = getState();
    state.character.companion = {
        key: c.name,
        stamina: { cur: c.stamina, max: c.stamina },
        bondPoints: 0
    };
    touch();
    rerender();
}

function rollOddJobs(data) {
    const table = data.guilds.odd_jobs_table_d100;
    const results = [];
    const seenNames = new Set();
    for (let i = 0; i < 2; i++) {
        let r = rollD100Table(table);
        let guard = 0;
        while (r.entry && seenNames.has(r.entry.name) && guard < 20) {
            r = rollD100Table(table);
            guard++;
        }
        if (r.entry) seenNames.add(r.entry.name);
        results.push(r);
    }
    ui.oddJobs.candidates = results;
    ui.oddJobs.blockedMsg = null;
    logRoll(
        "Odd-Jobs Table (d100 x2)",
        `d100=${results[0].roll}, d100=${results[1].roll}`,
        `${results[0].entry ? results[0].entry.name : "?"} / ${results[1].entry ? results[1].entry.name : "?"}`
    );
    rerender();
}

function acceptOddJob(idx) {
    const cand = ui.oddJobs.candidates ? ui.oddJobs.candidates[idx] : null;
    if (!cand || !cand.entry) return;
    const state = getState();
    const activeCount = state.quests.oddJobs.filter(j => j.status === "active").length;
    if (activeCount >= 2) {
        ui.oddJobs.blockedMsg = "Nie można przyjąć — już 2 aktywne zlecenia (limit).";
        rerender();
        return;
    }
    state.quests.oddJobs.push({
        id: uid(),
        range: cand.entry.range,
        name: cand.entry.name,
        status: "active"
    });
    ui.oddJobs.blockedMsg = null;
    touch();
    rerender();
}

function rollOracleYesNo(data) {
    const oracle = data.oracles.glide_oracle.yes_no_questions;
    const baseRoll = rollDie(10);
    const base = findInRangeTable(oracle.table_d10, baseRoll, "range");
    if (!base) return;
    const baseIdx = oracle.table_d10.indexOf(base);
    const subKey = Object.keys(oracle.sub_tables)[baseIdx];
    const sub = oracle.sub_tables[subKey];
    const subRoll = rollDie(10);
    const subEntry = findInRangeTable(sub.table_d10, subRoll, "range");
    ui.oracle.yesNo = { baseRoll, base, sub, subRoll, subEntry };
    logRoll(
        "Glide Oracle — Yes/No (d10+d10)",
        `d10=${baseRoll} (${base.result_pl || base.result}), subtabela d10=${subRoll}`,
        subEntry ? subEntry.text : "brak dopasowania"
    );
    rerender();
}

function rollOracleWord(data) {
    const cfg = ORACLE_WORD_TABLES[ui.oracle.wordBiome];
    const table = data.oracles[cfg.key];
    const r = rollD100Table(table, { valueField: "word" });
    ui.oracle.word = r;
    logRoll(`Word Oracle — ${cfg.label} (d100)`, `d100=${r.roll}`, r.entry ? (r.entry.word_pl || r.entry.word) : "brak dopasowania");
    rerender();
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        const el = e.target;
        const action = el.dataset.action;
        if (action === "challenge-stat") ui.challenge.statKey = el.value;
        else if (action === "biome-select") { ui.biome.key = el.value; rerender(); }
        else if (action === "oracle-biome-select") { ui.oracle.wordBiome = el.value; rerender(); }
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
        else if (action === "roll-companions") rollCompanions(currentData);
        else if (action === "seek-known-companion") seekKnownCompanion();
        else if (action === "hire-companion") hireCompanion(parseInt(btn.dataset.idx, 10));
        else if (action === "roll-odd-jobs") rollOddJobs(currentData);
        else if (action === "accept-odd-job") acceptOddJob(parseInt(btn.dataset.idx, 10));
        else if (action === "roll-oracle-yesno") rollOracleYesNo(currentData);
        else if (action === "roll-oracle-word") rollOracleWord(currentData);
    });
}
