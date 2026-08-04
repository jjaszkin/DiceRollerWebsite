// Panel: Mapa — siatka 12x10 heksów (offsetowe kolumny, plaster miodu), znacznik pozycji postaci,
// odkrywanie heksów (Typ Lokacji d10 + rzut na liczbę pól regionu), testy/eksploracja per typ
// lokacji (Pustynia/Ruiny/Zieleń — Punkt Orientacyjny + Wydarzenie; Osada — Nazwa/Profil/Cecha/
// Wydarzenie; Unikalna Lokacja — d100) i akcje na heksie (Przesuń postać / Przerzuć / Usuń).
// Referencyjny obrazek dostarczony przez gracza to wyłącznie styl/układ (kształt heksa, offset
// kolumn, konwencja etykiet współrzędnych) — żadne nazwane POI/ikony z obrazka nie są tu
// zaszyte na sztywno; cała treść lokacji pochodzi z istniejących tabel w data/mechanics.json,
// data/desert.json, data/ruins.json, data/green_space.json, data/economy.json i
// data/unique_locations.json (te same, z których korzysta panels/roller.js).
import { getState, touch } from "../store.js";
import { rollDie, uid, formatTimestamp, findInRangeTable, escapeHtml } from "../utils.js";
import { logRoll } from "../rollLog.js";
import {
    rollTiles, needsTileRoll, resolveLocationLevel, rollD100Table,
    renderGenericEntry, renderEventEntry, renderUniqueLocationResult
} from "./roller.js";

const COLS = 12;
const ROWS = 10;
const COL_LETTERS = "ABCDEFGHIJKL".split("");

// Rozmiar heksów jest wyliczany dynamicznie z szerokości kontenera (patrz computeLayout), tak
// żeby siatka zawsze wypełniała całą dostępną szerokość karty bez pustego marginesu z prawej
// strony i bez poziomego scrolla. Te zmienne to tylko bieżący (przeliczony) stan layoutu —
// wartości startowe to bezpieczny fallback, zanim panel zostanie choć raz zmierzony.
let HEX_SIZE = 36;
let HEX_WIDTH = HEX_SIZE * 2;
let HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;
let COL_PITCH = HEX_WIDTH * 0.75;
let GRID_WIDTH = (COLS - 1) * COL_PITCH + HEX_WIDTH;
let GRID_HEIGHT = ROWS * HEX_HEIGHT + HEX_HEIGHT / 2;

/** Przelicza rozmiar heksów tak, żeby COLS kolumn (z zachowaniem overlapu 0.75 szerokości na
 *  kolumnę, jak przy plastrze miodu) dokładnie wypełniało `containerWidth`. Wywoływane przy
 *  każdym renderze mapy, z realnie zmierzoną szerokością `.hex-grid-wrap`. Gdy panel jest
 *  aktualnie ukryty (display:none na nieaktywnej zakładce daje clientWidth=0), zachowujemy
 *  poprzednio wyliczoną szerokość zamiast zjeżdżać do zera. */
function computeLayout(containerWidth) {
    const w = containerWidth > 0 ? containerWidth : GRID_WIDTH;
    HEX_WIDTH = w / ((COLS - 1) * 0.75 + 1);
    HEX_SIZE = HEX_WIDTH / 2;
    HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;
    COL_PITCH = HEX_WIDTH * 0.75;
    GRID_WIDTH = w;
    GRID_HEIGHT = ROWS * HEX_HEIGHT + HEX_HEIGHT / 2;
}

/** Typ Lokacji (mechanics.json#location_type_table_d10) → klucz biomu w data/*.json
 *  (landmarks_table_d100 / events_table_d100), używany przy testach/eksploracji na heksie. */
const TYPE_BIOME_KEY = {
    "Pustynia": "desert",
    "Ruina": "ruins",
    "Zieleń": "green_space"
};

const TYPE_ABBR = {
    "Teren Nieprzejezdny": "TN",
    "Osada": "OS",
    "Pustynia": "PU",
    "Ruina": "RU",
    "Zieleń": "ZI",
    "Unikalna Lokacja": "★"
};

function coordId(col, row) {
    return `${COL_LETTERS[col]}${row + 1}`;
}

// Firebase RTDB usuwa klucze zapisane jako `null` (nie ma tam pojęcia "null" — zapis wartości
// null to w praktyce delete tej ścieżki), więc po zapisie+odczycie (albo po odświeżeniu z
// listenera) pole, które ustawiliśmy na null jako "jeszcze nie wylosowane", wraca jako
// `undefined`, a nie `null`. Wszystkie sprawdzenia "czy już wylosowane" muszą więc traktować
// null i undefined tak samo — stąd te dwie małe pomocnicze funkcje zamiast rozsianych po pliku
// `!== null` (por. ten sam wzorzec podwójnego sprawdzenia w panels/roller.js i character.js).
function isSet(v) {
    return v !== null && v !== undefined;
}
function isUnset(v) {
    return !isSet(v);
}

let currentRoot = null;
let currentData = null;
// Który heks jest aktualnie "otwarty" w panelu szczegółów — czysty stan UI, nietrwały
// (nie zapisujemy do Firebase), tak samo jak `ui` w panels/roller.js.
let selectedCoord = null;

// Wynik ostatniego sprawdzenia Wydarzenia Podróży po przesunięciu postaci (d10, próg 7+) —
// tak samo jak selectedCoord, to czysty, nietrwały stan UI (nie zapisujemy do Firebase); znika
// przy kolejnym przesunięciu (nadpisany) albo po ręcznym zamknięciu banera.
let lastTravelCheck = null;

function rerender() {
    if (currentRoot) render(currentRoot, { state: getState(), data: currentData });
}

/** Zwraca heks-roota dla podanych współrzędnych (samego siebie, jeśli to root/samodzielny heks,
 *  albo wskazywany przez regionRoot dla heksu-członka regionu), albo null jeśli heks nieodkryty. */
function getRootHex(state, coord) {
    const hex = state.map.hexes[coord];
    if (!hex) return null;
    return hex.regionRoot ? (state.map.hexes[hex.regionRoot] || null) : hex;
}

/** Buduje świeży wpis heksu-roota/samodzielnego na bazie rzutu d10 w Typ Lokacji.
 *  Ustawia od razu Poziom Lokacji dla specjalnych przypadków (Unikalna Lokacja = zawsze 3,
 *  Teren Nieprzejezdny = zawsze 0, patrz mechanics.json#location_level_special_cases) oraz
 *  tilesTotal, jeśli liczba pól jest stała (nie wymaga osobnego rzutu). */
function buildFreshHexEntry(data, roll) {
    const table = data.mechanics.location_type_table_d10;
    const entry = findInRangeTable(table, roll, "roll");
    const hex = {
        discovered: true,
        regionRoot: null,
        typeResult: entry.result,
        typeRoll: roll,
        tiles: entry.tiles,
        tilesTotal: needsTileRoll(entry.tiles) ? null : entry.tiles,
        tilesRoll: null,
        level: null,
        levelRoll: null,
        levelGapFallback: false,
        tests: []
    };
    if (entry.result === "Unikalna Lokacja") hex.level = 3;
    else if (entry.result === "Teren Nieprzejezdny") hex.level = 0;
    return hex;
}

function pushTest(hex, kind, label, roll, html, value = null) {
    // Firebase RTDB nie przechowuje pustych tablic/obiektów (zapis `[]` usuwa klucz, tak samo
    // jak przy `null` — patrz komentarz przy isSet/isUnset wyżej), więc `hex.tests` może po
    // zapisie+odczycie wrócić jako `undefined` zamiast `[]`. Odtwarzamy tablicę w razie potrzeby,
    // zamiast zakładać, że zawsze istnieje.
    if (!hex.tests) hex.tests = [];
    // `value` to opcjonalny "goły" tekst wyniku (np. nazwa osady/unikalnej lokacji), osobno od
    // `html` (gotowego do wstrzyknięcia markupu) — używany w tooltipie heksu na mapie (patrz
    // lastTestValue/renderHexCell), gdzie nie chcemy renderować całego bloku HTML z detali.
    hex.tests.push({ id: uid(), kind, label, roll, html, value, ts: formatTimestamp(), at: Date.now() });
}

/** Szuka ostatniego (najnowszego) wpisu testu danego rodzaju z niepustym `value` — używane do
 *  wyciągnięcia nazwy osady/unikalnej lokacji na potrzeby tooltipa heksu (patrz renderHexCell). */
function lastTestValue(hex, kind) {
    const tests = hex.tests || [];
    for (let i = tests.length - 1; i >= 0; i--) {
        if (tests[i].kind === kind && tests[i].value) return tests[i].value;
    }
    return null;
}

// ── Akcje mutujące stan ──────────────────────────────────────────────────

function handleHexClick(coord) {
    const state = getState();
    const pending = state.map.pendingRegion;
    const exists = !!state.map.hexes[coord];
    if (pending && coord !== pending.rootId && !exists) {
        state.map.hexes[coord] = { discovered: true, regionRoot: pending.rootId, tests: [] };
        pending.remaining -= 1;
        if (pending.remaining <= 0) state.map.pendingRegion = null;
        selectedCoord = coord;
        touch();
        rerender();
        return;
    }
    selectedCoord = coord;
    rerender();
}

function rollHexType(coord) {
    const state = getState();
    if (state.map.hexes[coord]) return;
    const roll = rollDie(10);
    const hex = buildFreshHexEntry(currentData, roll);
    state.map.hexes[coord] = hex;
    selectedCoord = coord;
    logRoll(`Mapa ${coord} — Typ Lokacji (d10)`, `d10=${roll}`, `${hex.typeResult} (pola: ${hex.tiles})`);
    rerender();
}

function rollHexTiles(coord) {
    const state = getState();
    const hex = state.map.hexes[coord];
    if (!hex || hex.regionRoot || isSet(hex.tilesTotal)) return;
    const rolled = rollTiles(hex.tiles);
    hex.tilesRoll = rolled;
    hex.tilesTotal = rolled;
    if (rolled > 1) state.map.pendingRegion = { rootId: coord, tilesTotal: rolled, remaining: rolled - 1 };
    logRoll(`Mapa ${coord} — liczba pól (${hex.tiles})`, `${hex.tiles}`, `${rolled}`);
    rerender();
}

function rollHexLevel(coord) {
    const state = getState();
    const hex = state.map.hexes[coord];
    if (!hex || hex.regionRoot || isSet(hex.level)) return;
    const table = currentData.mechanics.location_level_table_d10;
    const roll = rollDie(10);
    const { level, gapFallback } = resolveLocationLevel(table, roll);
    hex.level = level;
    hex.levelRoll = roll;
    hex.levelGapFallback = gapFallback;
    logRoll(`Mapa ${coord} — Poziom Lokacji (d10)`, `d10=${roll}`, `Poziom ${level}${gapFallback ? " (fallback za lukę w druku)" : ""}`);
    rerender();
}

function rollHexLandmark(coord) {
    const state = getState();
    const hex = state.map.hexes[coord];
    const root = getRootHex(state, coord);
    if (!hex || !root) return;
    const biomeKey = TYPE_BIOME_KEY[root.typeResult];
    if (!biomeKey) return;
    const table = currentData[biomeKey].landmarks_table_d100;
    const r = rollD100Table(table, { valueField: "text" });
    pushTest(hex, "landmark", "Punkt Orientacyjny", r.roll, renderGenericEntry(r, "d100"));
    logRoll(`Mapa ${coord} — Punkt Orientacyjny (d100)`, `d100=${r.roll}`, r.entry ? (r.entry.text || r.entry.name || "") : "brak dopasowania");
    rerender();
}

function rollHexEvent(coord) {
    const state = getState();
    const hex = state.map.hexes[coord];
    const root = getRootHex(state, coord);
    if (!hex || !root) return;
    const biomeKey = TYPE_BIOME_KEY[root.typeResult];
    if (!biomeKey) return;
    const table = currentData[biomeKey].events_table_d100;
    const r = rollD100Table(table);
    pushTest(hex, "event", "Wydarzenie", r.roll, renderEventEntry(r, "d100"));
    logRoll(`Mapa ${coord} — Wydarzenie (d100)`, `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    rerender();
}

const SETTLEMENT_FIELDS = {
    name: { label: "Osada — Nazwa", tableKey: "settlement_names_table_d100", render: renderGenericEntry },
    focus: { label: "Osada — Profil", tableKey: "settlement_focus_table_d100", render: renderGenericEntry },
    trait: { label: "Osada — Cecha", tableKey: "settlement_traits_table_d100", render: renderGenericEntry },
    event: { label: "Osada — Wydarzenie", tableKey: "settlement_events_table_d100", render: renderEventEntry }
};

function rollHexSettlement(coord, field) {
    const state = getState();
    const hex = state.map.hexes[coord];
    const root = getRootHex(state, coord);
    const cfg = SETTLEMENT_FIELDS[field];
    if (!hex || !root || root.typeResult !== "Osada" || !cfg) return;
    const table = currentData.economy[cfg.tableKey];
    const r = rollD100Table(table);
    const value = field === "name" && r.entry ? (r.entry.name || r.entry.text || null) : null;
    pushTest(hex, `settlement-${field}`, cfg.label, r.roll, cfg.render(r, "d100"), value);
    logRoll(`Mapa ${coord} — ${cfg.label} (d100)`, `d100=${r.roll}`, r.entry ? (r.entry.name || r.entry.text || "") : "brak dopasowania");
    rerender();
}

function rollHexUnique(coord) {
    const state = getState();
    const hex = state.map.hexes[coord];
    const root = getRootHex(state, coord);
    if (!hex || !root || root.typeResult !== "Unikalna Lokacja") return;
    const table = currentData.unique_locations.unique_locations_table_d100;
    const r = rollD100Table(table);
    const value = r.entry ? r.entry.name : null;
    pushTest(hex, "unique", "Unikalna Lokacja", r.roll, renderUniqueLocationResult(r), value);
    logRoll(`Mapa ${coord} — Unikalna Lokacja (d100)`, `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    rerender();
}

function deleteHexTest(coord, testId) {
    const state = getState();
    const hex = state.map.hexes[coord];
    if (!hex) return;
    hex.tests = (hex.tests || []).filter(t => t.id !== testId);
    touch();
    rerender();
}

function moveHere(coord) {
    const state = getState();
    state.map.position = coord;
    selectedCoord = coord;
    touch();

    // Automatyczne sprawdzenie Wydarzenia Podróży przy każdym przesunięciu postaci: d10, próg
    // 7+ (homebrew, nie ma osobnej tabeli triggera w mechanics.json — sam rzut Wydarzenia
    // Podróży d100 to ta sama tabela co na zakładce Roller, patrz roller.js#rollTravelEvent).
    const roll = rollDie(10);
    const triggered = roll >= 7;
    lastTravelCheck = { roll, triggered, eventResult: null };
    logRoll("Mapa — sprawdzenie Wydarzenia Podróży (d10)", `d10=${roll}`, triggered ? "Wydarzenie Podróży! (7+)" : "Brak wydarzenia");

    rerender();
}

/** Rzuca właściwe Wydarzenie Podróży (d100) po tym, jak sprawdzenie d10 w moveHere() je
 *  wywołało (roll 7+) — ta sama tabela i render co roll-travel-event w panels/roller.js. */
function rollMapTravelEvent() {
    if (!lastTravelCheck || !lastTravelCheck.triggered) return;
    const table = currentData.economy.travel_events_table_d100;
    const r = rollD100Table(table);
    lastTravelCheck.eventResult = r;
    // Wpisy travel_events_table_d100 mają tylko pole `text` (nie `name`) — tak samo jak
    // roller.js#rollTravelEvent, z którego ta tabela/logika jest przeniesiona 1:1.
    logRoll("Wydarzenie Podróży (d100)", `d100=${r.roll}`, r.entry ? r.entry.text : "brak dopasowania");
    rerender();
}

function dismissTravelCheck() {
    lastTravelCheck = null;
    rerender();
}

/** Kaskadowo usuwa z mapy wszystkie heksy-członków regionu zakorzenionego w `coord`
 *  (oraz czyści pendingRegion, jeśli akurat na niego wskazywał) — używane zarówno przy
 *  usuwaniu, jak i przy przerzucaniu heksu-roota (nowy rzut = nowa lokacja, stary region
 *  przestaje istnieć). */
function cascadeClearRegion(state, coord) {
    for (const [c, h] of Object.entries(state.map.hexes)) {
        if (h.regionRoot === coord) delete state.map.hexes[c];
    }
    if (state.map.pendingRegion && state.map.pendingRegion.rootId === coord) {
        state.map.pendingRegion = null;
    }
}

function rerollHex(coord) {
    const state = getState();
    const hex = state.map.hexes[coord];
    if (!hex) return;
    const wasMember = !!hex.regionRoot;
    if (!wasMember) cascadeClearRegion(state, coord);
    const roll = rollDie(10);
    const fresh = buildFreshHexEntry(currentData, roll);
    state.map.hexes[coord] = fresh;
    logRoll(`Mapa ${coord} — Przerzut heksu (d10)`, `d10=${roll}`, `${fresh.typeResult} (pola: ${fresh.tiles})${wasMember ? " — odłączono od regionu" : ""}`);
    rerender();
}

function removeHex(coord) {
    const state = getState();
    const hex = state.map.hexes[coord];
    if (!hex) return;
    if (!window.confirm(`Usunąć heks ${coord} z mapy? Tej operacji nie można cofnąć.`)) return;
    if (!hex.regionRoot) cascadeClearRegion(state, coord);
    delete state.map.hexes[coord];
    if (selectedCoord === coord) selectedCoord = null;
    touch();
    rerender();
}

function cancelPendingRegion() {
    const state = getState();
    state.map.pendingRegion = null;
    touch();
    rerender();
}

// ── Render ────────────────────────────────────────────────────────────────

function renderPendingBanner(pending) {
    return `
        <div class="map-banner">
            <span>Wybierz jeszcze <strong>${pending.remaining}</strong> ${pending.remaining === 1 ? "pole" : "pól"} na mapie, aby dodać je do regionu <strong>${pending.rootId}</strong> (łącznie ${pending.tilesTotal} pól).</span>
            <button class="btn btn-sm btn-secondary" data-action="cancel-pending-region">Anuluj wybór regionu</button>
        </div>
    `;
}

/** Baner sprawdzenia Wydarzenia Podróży po przesunięciu postaci (patrz moveHere) — pokazuje wynik
 *  d10 zawsze, a przy trafieniu 7+ dodatkowo przycisk do właściwego rzutu Wydarzenia Podróży
 *  (d100, ta sama tabela co na zakładce Roller) i jego wynik po rzuceniu. */
function renderTravelEventBanner(check) {
    if (!check) return "";
    const { roll, triggered, eventResult } = check;
    return `
        <div class="map-banner">
            <span>Sprawdzenie Wydarzenia Podróży (d10 = ${roll})${triggered ? " — <strong>wydarzenie!</strong>" : " — brak wydarzenia."}</span>
            <span style="display:flex; gap:8px;">
                ${triggered && !eventResult ? `<button class="btn btn-sm" data-action="roll-map-travel-event">Rzuć Wydarzenie Podróży (d100)</button>` : ""}
                <button class="btn btn-sm btn-secondary" data-action="dismiss-travel-check">Zamknij</button>
            </span>
        </div>
        ${eventResult ? renderGenericEntry(eventResult, "d100") : ""}
    `;
}

function renderHexCell(state, coord, col, row) {
    const hex = state.map.hexes[coord];
    const left = col * COL_PITCH;
    const top = row * HEX_HEIGHT + (col % 2 ? HEX_HEIGHT / 2 : 0);
    const isPosition = state.map.position === coord;
    const isSelected = selectedCoord === coord;

    let cls = "hex";
    let tip = coord;
    let loctypeAttr = "";

    if (!hex) {
        cls += " hex--empty";
        tip += " — nieodkryty";
    } else {
        const root = hex.regionRoot ? state.map.hexes[hex.regionRoot] : hex;
        const typeResult = root ? root.typeResult : "?";
        cls += " hex--filled";
        if (hex.regionRoot) cls += " hex--member";
        if (typeResult === "Unikalna Lokacja") cls += " hex--unique";
        loctypeAttr = ` data-loctype="${escapeHtml(typeResult)}"`;
        const levelText = root && isSet(root.level) ? ` · Poziom ${root.level}` : "";
        // Nazwa osady/unikalnej lokacji do tooltipa bierzemy z testów zapisanych na TYM
        // konkretnym heksie (nie na roocie regionu) — tak samo jak renderHexTests czyta
        // `hex.tests`, bo testy (w tym rzut Nazwy Osady / Unikalnej Lokacji) można wykonać
        // osobno na każdym polu regionu, nie tylko na roocie.
        let nameText = "";
        if (typeResult === "Osada") {
            const name = lastTestValue(hex, "settlement-name");
            if (name) nameText = ` · „${name}”`;
        } else if (typeResult === "Unikalna Lokacja") {
            const name = lastTestValue(hex, "unique");
            if (name) nameText = ` · „${name}”`;
        }
        tip = `${coord} — ${typeResult}${levelText}${nameText}${hex.regionRoot ? ` (część regionu ${hex.regionRoot})` : ""}`;
    }
    if (isPosition) cls += " hex--position";
    if (isSelected) cls += " hex--selected";

    // Struktura hex-fill/hex-content: `.hex` sam w sobie pełni rolę warstwy "obramowania"
    // (tło + clip-path heksagonu), a `.hex-fill` to druga, mniejsza (inset o grubość ramki)
    // kopia tego samego clip-path z tłem wypełnienia — dwie nałożone na siebie warstwy z tym
    // samym clip-path dają czysty heksagonalny kontur. Zwykły CSS `border` na elemencie z
    // clip-path NIE działa poprawnie (obrys rysuje się na oryginalnym prostokącie i po
    // przycięciu widać go tylko jako proste, "docięte" krawędzie, nie kontur heksagonu).
    return `
        <button type="button" class="${cls} tt" data-action="select-hex" data-coord="${coord}"${loctypeAttr}
                data-tip="${escapeHtml(tip)}" style="left:${left}px; top:${top}px; width:${HEX_WIDTH}px; height:${HEX_HEIGHT}px;">
            <span class="hex-fill"></span>
            <span class="hex-content">
                <span class="hex-coord">${coord}</span>
                ${hex ? `<span class="hex-abbr">${TYPE_ABBR[hex.regionRoot ? (state.map.hexes[hex.regionRoot]?.typeResult) : hex.typeResult] || "?"}</span>` : ""}
            </span>
        </button>
    `;
}

function renderGrid(state) {
    let html = "";
    for (let col = 0; col < COLS; col++) {
        for (let row = 0; row < ROWS; row++) {
            html += renderHexCell(state, coordId(col, row), col, row);
        }
    }
    return html;
}

function renderHexTests(data, root, hex, coord) {
    const type = root.typeResult;
    let buttons = "";
    if (TYPE_BIOME_KEY[type]) {
        buttons = `
            <button class="btn btn-sm" data-action="roll-hex-landmark" data-coord="${coord}">Rzuć Punkt Orientacyjny (d100)</button>
            <button class="btn btn-sm" data-action="roll-hex-event" data-coord="${coord}">Rzuć Wydarzenie (d100)</button>
        `;
    } else if (type === "Osada") {
        buttons = `
            <button class="btn btn-sm" data-action="roll-hex-settlement" data-field="name" data-coord="${coord}">Nazwa (d100)</button>
            <button class="btn btn-sm" data-action="roll-hex-settlement" data-field="focus" data-coord="${coord}">Profil (d100)</button>
            <button class="btn btn-sm" data-action="roll-hex-settlement" data-field="trait" data-coord="${coord}">Cecha (d100)</button>
            <button class="btn btn-sm btn-primary" data-action="roll-hex-settlement" data-field="event" data-coord="${coord}">Wydarzenie Osady (d100)</button>
        `;
    } else if (type === "Unikalna Lokacja") {
        buttons = `<button class="btn btn-sm btn-primary" data-action="roll-hex-unique" data-coord="${coord}">Rzuć Unikalną Lokację (d100)</button>`;
    } else if (type === "Teren Nieprzejezdny") {
        return `<p class="placeholder">${escapeHtml(data.mechanics.location_level_special_cases.impassible_terrain)}</p>`;
    }

    const tests = hex.tests || [];
    const history = tests.slice().reverse().map(t => `
        <li class="entry">
            <div class="entry-meta">
                <span>${escapeHtml(t.label)} — d100=${t.roll}</span>
                <span class="entry-meta-right">
                    <span>${t.ts}</span>
                    <button class="btn btn-sm btn-icon" data-action="delete-hex-test" data-coord="${coord}" data-id="${t.id}" title="Usuń wpis">×</button>
                </span>
            </div>
            <div class="entry-result">${t.html}</div>
        </li>
    `).join("");

    return `
        <div class="hex-tests">
            <h4>Testy / Eksploracja</h4>
            <div class="hex-test-buttons">${buttons}</div>
            ${history ? `<ul class="entry-list" style="margin-top:8px;">${history}</ul>` : `<p class="placeholder">Brak wykonanych testów na tym polu.</p>`}
        </div>
    `;
}

function renderHexActions(coord) {
    return `
        <div class="hex-actions">
            <button class="btn btn-sm btn-secondary" data-action="move-here" data-coord="${coord}">Przesuń postać</button>
            <button class="btn btn-sm btn-secondary" data-action="reroll-hex" data-coord="${coord}">Przerzuć hex</button>
            <button class="btn btn-sm btn-secondary" data-action="remove-hex" data-coord="${coord}">Usuń hex</button>
        </div>
    `;
}

function renderHexDetail(state, data, coord) {
    if (!coord) {
        return `<h3>Szczegóły heksu</h3><p class="placeholder">Kliknij heks na mapie, aby zobaczyć szczegóły.</p>`;
    }
    const hex = state.map.hexes[coord];
    const isPosition = state.map.position === coord;

    if (!hex) {
        return `
            <h3>Heks ${coord}${isPosition ? " · pozycja postaci" : ""}</h3>
            <p class="placeholder">Nieodkryty.</p>
            <div class="hex-actions">
                <button class="btn btn-sm btn-secondary" data-action="move-here" data-coord="${coord}">Przesuń postać</button>
                <button class="btn btn-primary btn-sm" data-action="roll-hex-type" data-coord="${coord}">Rzuć Typ Lokacji (d10)</button>
            </div>
        `;
    }

    const isMember = !!hex.regionRoot;
    const root = isMember ? state.map.hexes[hex.regionRoot] : hex;
    if (!root) {
        return `<h3>Heks ${coord}</h3><p class="placeholder">Błąd danych regionu (brak roota ${hex.regionRoot}) — usuń ten heks.</p>${renderHexActions(coord)}`;
    }

    const parts = [];
    parts.push(`<h3>Heks ${coord}${isPosition ? " · pozycja postaci" : ""}${isMember ? ` · część regionu ${hex.regionRoot}` : ""}</h3>`);
    parts.push(`<p><strong>${root.typeResult}</strong>${isSet(root.level) ? ` — Poziom ${root.level}` : ""}</p>`);

    if (!isMember) {
        if (needsTileRoll(root.tiles) && isUnset(root.tilesTotal)) {
            parts.push(`<button class="btn btn-sm" data-action="roll-hex-tiles" data-coord="${coord}">Rzuć liczbę pól (${root.tiles})</button>`);
        } else if (isSet(root.tilesTotal)) {
            parts.push(`<p class="placeholder">Region: ${root.tilesTotal} ${root.tilesTotal === 1 ? "pole" : "pól"} łącznie.</p>`);
        }
        if (isUnset(root.level)) {
            parts.push(`<button class="btn btn-sm" data-action="roll-hex-level" data-coord="${coord}">Rzuć Poziom Lokacji (d10)</button>`);
        } else if (root.levelGapFallback) {
            parts.push(`<p class="placeholder">Uwaga: luka w druku dla rzutu 9 — użyto najbliższego niższego wyniku.</p>`);
        } else if (root.typeResult === "Unikalna Lokacja") {
            parts.push(`<p class="placeholder">${escapeHtml(data.mechanics.location_level_special_cases.unique_location)}</p>`);
        }
    }

    parts.push(renderHexTests(data, root, hex, coord));
    parts.push(renderHexActions(coord));

    return parts.join("");
}

export function render(root, { state, data }) {
    currentRoot = root;
    currentData = data;
    if (!state.map) return;

    // Tekst instrukcji i wszelkie banery (wybór regionu, sprawdzenie Wydarzenia Podróży) siedzą
    // POD siatką, nie nad nią — dzięki temu ich pojawianie się/znikanie (albo zmiana treści) nie
    // przesuwa samej siatki heksów w pionie na stronie.
    root.innerHTML = `
        <div class="card">
            <h2>Mapa</h2>
            <div class="hex-grid-wrap">
                <div class="hex-grid"></div>
            </div>
            <div class="map-info-below">
                ${state.map.pendingRegion ? renderPendingBanner(state.map.pendingRegion) : ""}
                ${renderTravelEventBanner(lastTravelCheck)}
                <p class="placeholder">Kliknij nieodkryty heks, aby rzucić Typ Lokacji. Kliknij odkryty heks, aby zobaczyć szczegóły, wykonać testy/eksplorację, przesunąć postać, przerzucić albo usunąć heks. Dwuklik na heksie przesuwa tam postać.</p>
            </div>
        </div>
        <div class="card" style="margin-top:12px;">
            ${renderHexDetail(state, data, selectedCoord)}
        </div>
    `;

    // Siatka jest budowana w dwóch krokach: najpierw pusty `.hex-grid-wrap` (żeby dostać jego
    // realną, wynikającą z layoutu karty szerokość — jest 0, jeśli zakładka Mapa jest akurat
    // ukryta, patrz computeLayout), dopiero potem heksy w rozmiarze dopasowanym do tej
    // szerokości. Dzięki temu siatka zawsze wypełnia kartę na całą szerokość, bez pustego
    // marginesu i bez poziomego scrolla.
    const wrap = root.querySelector(".hex-grid-wrap");
    const gridEl = root.querySelector(".hex-grid");
    computeLayout(wrap.clientWidth);
    gridEl.style.width = `${GRID_WIDTH}px`;
    gridEl.style.height = `${GRID_HEIGHT}px`;
    gridEl.innerHTML = renderGrid(state);

    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const coord = btn.dataset.coord;

        if (action === "select-hex") handleHexClick(coord);
        else if (action === "roll-hex-type") rollHexType(coord);
        else if (action === "roll-hex-tiles") rollHexTiles(coord);
        else if (action === "roll-hex-level") rollHexLevel(coord);
        else if (action === "roll-hex-landmark") rollHexLandmark(coord);
        else if (action === "roll-hex-event") rollHexEvent(coord);
        else if (action === "roll-hex-settlement") rollHexSettlement(coord, btn.dataset.field);
        else if (action === "roll-hex-unique") rollHexUnique(coord);
        else if (action === "delete-hex-test") deleteHexTest(coord, btn.dataset.id);
        else if (action === "move-here") moveHere(coord);
        else if (action === "reroll-hex") rerollHex(coord);
        else if (action === "remove-hex") removeHex(coord);
        else if (action === "cancel-pending-region") cancelPendingRegion();
        else if (action === "roll-map-travel-event") rollMapTravelEvent();
        else if (action === "dismiss-travel-check") dismissTravelCheck();
    });

    // Dwuklik na heksie przesuwa tam postać od razu, bez konieczności najpierw zaznaczać heks
    // i szukać przycisku "Przesuń postać" w panelu szczegółów pod mapą — czysty skrót UX, sam
    // przycisk w panelu szczegółów zostaje (patrz renderHexActions/renderHexDetail).
    root.addEventListener("dblclick", (e) => {
        const hexBtn = e.target.closest(".hex[data-coord]");
        if (!hexBtn) return;
        moveHere(hexBtn.dataset.coord);
    });

    // Siatka heksów ma dynamiczny rozmiar (patrz computeLayout w render()) — trzeba ją
    // przeliczyć zarówno przy zmianie szerokości okna, jak i w momencie przełączenia na
    // zakładkę Mapa (wcześniej panel był `display:none`, więc `.hex-grid-wrap` miał szerokość
    // 0 i heksy wyrenderowały się z rozmiarem fallbackowym). Nasłuch na kliknięcie przycisku
    // zakładki jest dopięty PO nasłuchu z main.js#setupTabs (bo ten dopina się wcześniej, przy
    // starcie apki, a ten tutaj dopiero przy pierwszym renderze panelu Mapa) — więc w momencie
    // gdy odpalamy rerender(), klasa .active (i przez to display) jest już przełączona.
    window.addEventListener("resize", () => {
        if (root.offsetParent !== null) rerender();
    });
    const mapTabBtn = document.querySelector('.tab-btn[data-tab="map"]');
    if (mapTabBtn) mapTabBtn.addEventListener("click", () => rerender());
}
