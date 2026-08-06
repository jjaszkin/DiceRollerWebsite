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
import { rollDie, uid, formatTimestamp, findInRangeTable, escapeHtml, clamp, preserveScroll } from "../utils.js";
import { logRoll } from "../rollLog.js";
import { logEvent } from "../eventLog.js";
import { applyTravelEventEffects, renderTravelEventEffects } from "../travelEvents.js";
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

// ── Sektory ──────────────────────────────────────────────────────────────
// Mapa jest podzielona na Sektory (osobne siatki 12x10 heksów) na wschód/zachód od startowego
// Sektora 0 — patrz state.js#createDefaultState (kształt state.map.segments) i navigateSegment
// niżej. `currentSegment` to czysto widokowy stan (który Sektor jest aktualnie wyświetlany),
// niezależny od `state.map.position` (gdzie faktycznie stoi postać) — przesunięcie postaci
// wymaga osobnej akcji (moveHere), patrząc na Sektor inny niż jej pozycja da baner "Wróć do
// pozycji postaci" (patrz renderGotoPositionBanner).

/** Zwraca obiekt aktualnie oglądanego Sektora ({ hexes, pendingRegion }), tworząc go leniwie
 *  (pusty), jeśli jeszcze nie istnieje — na wypadek gdyby currentSegment wskazywał na Sektor,
 *  który z jakiegoś powodu nie ma jeszcze wpisu w state.map.segments (nie powinno się zdarzyć
 *  w normalnym flow, bo navigateSegment sam tworzy segment przed przełączeniem, ale to bezpieczny
 *  fallback zamiast wywalać się na undefined). */
function currentSeg(state) {
    const id = String(state.map.currentSegment);
    if (!state.map.segments[id]) state.map.segments[id] = { hexes: {}, pendingRegion: null };
    return state.map.segments[id];
}

/** Etykieta Sektora do wyświetlenia: "Sektor 0" dla startowego, "Sektor W{n}" na wschód
 *  (id dodatnie), "Sektor Z{n}" na zachód (id ujemne). */
function segmentLabel(id) {
    const n = Number(id);
    if (n === 0) return "Sektor 0";
    return n > 0 ? `Sektor W${n}` : `Sektor Z${Math.abs(n)}`;
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

// Które pole nazwy/opisu heksu jest aktualnie edytowane inline (patrz renderHexCustomInfo) —
// { coord, field: "name" | "desc" } albo null. Zastępuje wcześniejsze window.prompt() (przeglądarki
// coraz częściej blokują wyskakujące okienka przy powtarzalnych akcjach) polem wpisywanym wprost
// w panelu szczegółów heksu. Czysty, nietrwały stan UI — jak selectedCoord/lastTravelCheck wyżej.
let editingHexField = null;

function rerender() {
    if (currentRoot) preserveScroll(() => render(currentRoot, { state: getState(), data: currentData }));
}

/** Zwraca heks-roota dla podanych współrzędnych (samego siebie, jeśli to root/samodzielny heks,
 *  albo wskazywany przez regionRoot dla heksu-członka regionu), albo null jeśli heks nieodkryty. */
function getRootHex(state, coord) {
    const hexes = currentSeg(state).hexes;
    const hex = hexes[coord];
    if (!hex) return null;
    return hex.regionRoot ? (hexes[hex.regionRoot] || null) : hex;
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
        tests: [],
        explorationCostPaid: false,
        customName: null,       // nazwa nadana ręcznie przez gracza (np. "Dolina Księżycowej Rosy"),
                                 // niezależna od ewentualnej losowanej nazwy Osady/Unikalnej Lokacji
                                 // (hex.tests[].kind "settlement-name"/"unique") — patrz renderHexCustomInfo.
        customDescription: null // krótki opis fabularny nadany ręcznie przez gracza — jw.
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

/** Zestaw rodzajów testów (hex.tests[].kind), których komplet stanowi "pełną Eksplorację" danego
 *  typu lokacji — Pustynia/Ruina/Zieleń: Punkt Orientacyjny + Wydarzenie; Osada: wszystkie 4 pola;
 *  Unikalna Lokacja: jedyny możliwy rzut. Teren Nieprzejezdny nie ma testów w ogóle (obsłużone
 *  osobno w renderHexTests) — stąd brak wpisu tutaj i explorationKindsForType() zwracające null. */
const EXPLORATION_REQUIRED_KINDS = {
    biome: ["landmark", "event"],
    settlement: ["settlement-name", "settlement-focus", "settlement-trait", "settlement-event"],
    unique: ["unique"]
};

function explorationKindsForType(type) {
    if (TYPE_BIOME_KEY[type]) return EXPLORATION_REQUIRED_KINDS.biome;
    if (type === "Osada") return EXPLORATION_REQUIRED_KINDS.settlement;
    if (type === "Unikalna Lokacja") return EXPLORATION_REQUIRED_KINDS.unique;
    return null;
}

/** Koszt akcji Testy/Eksploracja na heksie — naliczany RAZ na heks, dopiero gdy zostanie
 *  wykonany KOMPLET wymaganych testów dla jego typu lokacji (patrz EXPLORATION_REQUIRED_KINDS),
 *  a nie za każde pojedyncze losowanie (patrz mechanics.json#exploration_table_by_location_type.
 *  stamina_cost_per_exploration/stamina_cost_note). `hex.explorationCostPaid` pilnuje, żeby
 *  późniejsze przerzuty już ukończonych testów (np. gracz nie jest zadowolony z Wydarzenia i
 *  rzuca je ponownie) nie naliczały kosztu po raz drugi. Przycięte do [0, max] (jak reszta
 *  liczników zasobów — brak tu automatycznego rzutu na Tabelę Wyczerpania przy 0, to osobna,
 *  ręczna akcja gracza w panels/roller.js). */
function maybeChargeExplorationCompletion(state, hex, type) {
    if (hex.explorationCostPaid) return;
    const required = explorationKindsForType(type);
    if (!required) return;
    const doneKinds = new Set((hex.tests || []).map(t => t.kind));
    if (!required.every(k => doneKinds.has(k))) return;

    hex.explorationCostPaid = true;
    const cost = currentData?.mechanics?.exploration_table_by_location_type?.stamina_cost_per_exploration ?? 1;
    const stamina = state.character.resources.stamina;
    stamina.cur = clamp(stamina.cur - cost, 0, stamina.max);
}

// ── Akcje mutujące stan ──────────────────────────────────────────────────

function handleHexClick(coord) {
    const state = getState();
    const seg = currentSeg(state);
    const pending = seg.pendingRegion;
    const exists = !!seg.hexes[coord];
    if (pending && coord !== pending.rootId && !exists) {
        seg.hexes[coord] = { discovered: true, regionRoot: pending.rootId, tests: [], customName: null, customDescription: null };
        pending.remaining -= 1;
        if (pending.remaining <= 0) seg.pendingRegion = null;
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
    const seg = currentSeg(state);
    if (seg.hexes[coord]) return;
    const roll = rollDie(10);
    const hex = buildFreshHexEntry(currentData, roll);
    seg.hexes[coord] = hex;
    selectedCoord = coord;
    logRoll(`Mapa ${coord} — Typ Lokacji (d10)`, `d10=${roll}`, `${hex.typeResult} (pola: ${hex.tiles})`);
    rerender();
}

function rollHexTiles(coord) {
    const state = getState();
    const seg = currentSeg(state);
    const hex = seg.hexes[coord];
    if (!hex || hex.regionRoot || isSet(hex.tilesTotal)) return;
    const rolled = rollTiles(hex.tiles);
    hex.tilesRoll = rolled;
    hex.tilesTotal = rolled;
    if (rolled > 1) seg.pendingRegion = { rootId: coord, tilesTotal: rolled, remaining: rolled - 1 };
    logRoll(`Mapa ${coord} — liczba pól (${hex.tiles})`, `${hex.tiles}`, `${rolled}`);
    rerender();
}

function rollHexLevel(coord) {
    const state = getState();
    const hex = currentSeg(state).hexes[coord];
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
    const hex = currentSeg(state).hexes[coord];
    const root = getRootHex(state, coord);
    if (!hex || !root) return;
    const biomeKey = TYPE_BIOME_KEY[root.typeResult];
    if (!biomeKey) return;
    const table = currentData[biomeKey].landmarks_table_d100;
    const r = rollD100Table(table, { valueField: "text" });
    pushTest(hex, "landmark", "Punkt Orientacyjny", r.roll, renderGenericEntry(r, "d100"));
    maybeChargeExplorationCompletion(state, hex, root.typeResult);
    logRoll(`Mapa ${coord} — Punkt Orientacyjny (d100)`, `d100=${r.roll}`, r.entry ? (r.entry.text || r.entry.name || "") : "brak dopasowania");
    touch();
    rerender();
}

function rollHexEvent(coord) {
    const state = getState();
    const hex = currentSeg(state).hexes[coord];
    const root = getRootHex(state, coord);
    if (!hex || !root) return;
    const biomeKey = TYPE_BIOME_KEY[root.typeResult];
    if (!biomeKey) return;
    const table = currentData[biomeKey].events_table_d100;
    const r = rollD100Table(table);
    pushTest(hex, "event", "Wydarzenie", r.roll, renderEventEntry(r, "d100"));
    maybeChargeExplorationCompletion(state, hex, root.typeResult);
    logRoll(`Mapa ${coord} — Wydarzenie (d100)`, `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    touch();
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
    const hex = currentSeg(state).hexes[coord];
    const root = getRootHex(state, coord);
    const cfg = SETTLEMENT_FIELDS[field];
    if (!hex || !root || root.typeResult !== "Osada" || !cfg) return;
    const table = currentData.economy[cfg.tableKey];
    const r = rollD100Table(table);
    const value = field === "name" && r.entry ? (r.entry.name || r.entry.text || null) : null;
    pushTest(hex, `settlement-${field}`, cfg.label, r.roll, cfg.render(r, "d100"), value);
    maybeChargeExplorationCompletion(state, hex, root.typeResult);
    logRoll(`Mapa ${coord} — ${cfg.label} (d100)`, `d100=${r.roll}`, r.entry ? (r.entry.name || r.entry.text || "") : "brak dopasowania");
    touch();
    rerender();
}

function rollHexUnique(coord) {
    const state = getState();
    const hex = currentSeg(state).hexes[coord];
    const root = getRootHex(state, coord);
    if (!hex || !root || root.typeResult !== "Unikalna Lokacja") return;
    const table = currentData.unique_locations.unique_locations_table_d100;
    const r = rollD100Table(table);
    const value = r.entry ? r.entry.name : null;
    pushTest(hex, "unique", "Unikalna Lokacja", r.roll, renderUniqueLocationResult(r), value);
    maybeChargeExplorationCompletion(state, hex, root.typeResult);
    logRoll(`Mapa ${coord} — Unikalna Lokacja (d100)`, `d100=${r.roll}`, r.entry ? r.entry.name : "brak dopasowania");
    touch();
    rerender();
}

function deleteHexTest(coord, testId) {
    const state = getState();
    const hex = currentSeg(state).hexes[coord];
    if (!hex) return;
    hex.tests = (hex.tests || []).filter(t => t.id !== testId);
    touch();
    rerender();
}

function moveHere(coord) {
    const state = getState();
    // Postać przesuwa się na heks w AKTUALNIE OGLĄDANYM Sektorze (currentSegment) — nawigacja
    // między Sektorami jest czysto widokowa (patrz navigateSegment) i nie zmienia currentSegment
    // w oderwaniu od tej akcji, więc "gdzie patrzę" i "dokąd przesuwam postać" to zawsze ten sam
    // Sektor w momencie kliknięcia.
    state.map.position = { segment: state.map.currentSegment, coord };
    selectedCoord = coord;

    // Koszt Ruchu: 1 Zasoby na gliderze za każde przesunięcie (mechanics.json#glider.supply),
    // chyba że aktywna jest jednorazowa flaga nextMoveFreeSupply — ustawiana przez efekt
    // Wydarzenia Podróży "Następny Ruch kosztuje 0 Zasoby" (patrz travelEvents.js). Flaga jest
    // zawsze konsumowana (zresetowana) na tym ruchu, niezależnie od dalszej ścieżki. Gdy Zasoby
    // są już wyzerowane, zamiast kosztu Zasobów zaznacz 1 Zużycie na gliderze
    // (mechanics.json#glider.supply.on_empty: "zaznacz 1 Zużycie na gliderze zamiast wydawać Zasoby").
    const glider = state.character.glider;
    if (state.map.nextMoveFreeSupply) {
        state.map.nextMoveFreeSupply = false;
        logEvent(state, "travel-event", "Ruch za darmo (efekt Wydarzenia Podróży) — Zasoby nie zostały zużyte.");
    } else if (glider.supply.cur > 0) {
        const before = glider.supply.cur;
        glider.supply.cur = clamp(glider.supply.cur - 1, 0, glider.supply.max);
        logEvent(state, "travel-event", `Ruch — Zasoby: ${before} → ${glider.supply.cur}.`);
    } else {
        const before = glider.wear.cur;
        glider.wear.cur = clamp(glider.wear.cur + 1, 0, glider.wear.max);
        logEvent(state, "travel-event", `Ruch przy zerowych Zasobach — Zużycie na Gliderze: ${before} → ${glider.wear.cur}.`);
    }

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
    const state = getState();
    const table = currentData.economy.travel_events_table_d100;
    const r = rollD100Table(table);
    lastTravelCheck.eventResult = r;
    // Efekty mechaniczne Wydarzenia Podróży naliczają się automatycznie tam, gdzie da się je
    // jednoznacznie rozpoznać (patrz travelEvents.js) — reszta (Handel, wybór Gildii, konkretny
    // Sprzęt itp.) trafia do `manual` i jest pokazywana graczowi do ręcznego zastosowania.
    lastTravelCheck.effects = r.entry ? applyTravelEventEffects(state, r.entry.text) : { applied: [], manual: [] };
    // Wpisy travel_events_table_d100 mają tylko pole `text` (nie `name`) — tak samo jak
    // roller.js#rollTravelEvent, z którego ta tabela/logika jest przeniesiona 1:1.
    logRoll("Wydarzenie Podróży (d100)", `d100=${r.roll}`, r.entry ? r.entry.text : "brak dopasowania");
    touch();
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
function cascadeClearRegion(seg, coord) {
    for (const [c, h] of Object.entries(seg.hexes)) {
        if (h.regionRoot === coord) delete seg.hexes[c];
    }
    if (seg.pendingRegion && seg.pendingRegion.rootId === coord) {
        seg.pendingRegion = null;
    }
}

function rerollHex(coord) {
    const state = getState();
    const seg = currentSeg(state);
    const hex = seg.hexes[coord];
    if (!hex) return;
    const wasMember = !!hex.regionRoot;
    if (!wasMember) cascadeClearRegion(seg, coord);
    const roll = rollDie(10);
    const fresh = buildFreshHexEntry(currentData, roll);
    seg.hexes[coord] = fresh;
    logRoll(`Mapa ${coord} — Przerzut heksu (d10)`, `d10=${roll}`, `${fresh.typeResult} (pola: ${fresh.tiles})${wasMember ? " — odłączono od regionu" : ""}`);
    rerender();
}

function removeHex(coord) {
    const state = getState();
    const seg = currentSeg(state);
    const hex = seg.hexes[coord];
    if (!hex) return;
    if (!window.confirm(`Usunąć heks ${coord} z mapy? Tej operacji nie można cofnąć.`)) return;
    if (!hex.regionRoot) cascadeClearRegion(seg, coord);
    delete seg.hexes[coord];
    if (selectedCoord === coord) selectedCoord = null;
    touch();
    rerender();
}

function cancelPendingRegion() {
    const state = getState();
    currentSeg(state).pendingRegion = null;
    touch();
    rerender();
}

/** Przełącza aktualnie oglądany Sektor (dir = +1 na wschód, -1 na zachód). Jeśli docelowy Sektor
 *  jeszcze nie istnieje, prosi o potwierdzenie (window.confirm — ten sam wzorzec co przy usuwaniu
 *  heksu, patrz removeHex) i dopiero po zgodzie tworzy dla niego pusty wpis w state.map.segments.
 *  Nawigacja między Sektorami jest czysto widokowa — NIE rusza state.map.position (patrz moveHere)
 *  ani currentSegment innych heksów/regionów. */
function navigateSegment(dir) {
    const state = getState();
    const targetId = state.map.currentSegment + dir;
    const key = String(targetId);
    const exists = !!state.map.segments[key];
    if (!exists) {
        const label = segmentLabel(targetId);
        const dirText = dir > 0 ? "wschód" : "zachód";
        if (!window.confirm(`Utworzyć nowy ${label} na ${dirText} od obecnego Sektora? To doda nową, pustą siatkę 12x10 heksów.`)) return;
        state.map.segments[key] = { hexes: {}, pendingRegion: null };
        touch();
    }
    state.map.currentSegment = targetId;
    selectedCoord = null;
    touch();
    rerender();
}

/** Przełącza widok mapy z powrotem na Sektor, w którym faktycznie stoi postać (patrz
 *  state.map.position) — pokazywane w banerze, gdy oglądany Sektor różni się od pozycji. */
function gotoPositionSegment() {
    const state = getState();
    if (!state.map.position) return;
    state.map.currentSegment = state.map.position.segment;
    selectedCoord = state.map.position.coord;
    touch();
    rerender();
}

/** Wybiera losowe nieodkryte pole w Sektorze `segmentId` (tworząc go leniwie, jeśli jeszcze nie
 *  istnieje) i umieszcza tam Pomnik — specjalną, zawsze Poziom 0 Unikalną Lokację nazwaną
 *  imieniem Poszukiwacza. Używane przez js/endgame.js (Ścieżka A "Żyjąca Legenda"), żeby upamiętnić
 *  poprzednią postać na mapie kontynuowanej gry solo. W przeciwieństwie do zwykłych Unikalnych
 *  Lokacji (zawsze Poziom 3, patrz buildFreshHexEntry) Pomnik jest celowo Poziom 0 — to czysto
 *  fabularny znacznik, nie licznik dla żadnego Wyzwania. Zwraca umieszczony coordId, albo null,
 *  jeśli w Sektorze zabrakło wolnych pól (na siatce 12x10=120 pól w praktyce się nie zdarza —
 *  to tylko bezpieczny fallback zamiast nadpisania istniejącego heksu). Woła `touch()` sama —
 *  wywołujący nie musi robić tego osobno. */
export function placeMemorialHex(state, segmentId, seekerName) {
    const key = String(segmentId);
    if (!state.map.segments[key]) state.map.segments[key] = { hexes: {}, pendingRegion: null };
    const seg = state.map.segments[key];

    const free = [];
    for (let col = 0; col < COLS; col++) {
        for (let row = 0; row < ROWS; row++) {
            const c = coordId(col, row);
            if (!seg.hexes[c]) free.push(c);
        }
    }
    if (!free.length) return null;
    const coord = free[Math.floor(Math.random() * free.length)];

    const html = `<p><strong>Pomnik: ${escapeHtml(seekerName)}</strong></p><p>Miejsce pamięci poprzedniego Poszukiwacza, którego historia dobiegła końca.</p>`;
    seg.hexes[coord] = {
        discovered: true,
        regionRoot: null,
        typeResult: "Unikalna Lokacja",
        typeRoll: null,
        tiles: "1",
        tilesTotal: 1,
        tilesRoll: null,
        level: 0,
        levelRoll: null,
        levelGapFallback: false,
        tests: [{
            id: uid(), kind: "unique", label: "Unikalna Lokacja", roll: null,
            html, value: `Pomnik: ${seekerName}`, ts: formatTimestamp(), at: Date.now()
        }]
    };
    touch();
    return coord;
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
    const { roll, triggered, eventResult, effects } = check;
    return `
        <div class="map-banner">
            <span>Sprawdzenie Wydarzenia Podróży (d10 = ${roll})${triggered ? " — <strong>wydarzenie!</strong>" : " — brak wydarzenia."}</span>
            <span style="display:flex; gap:8px;">
                ${triggered && !eventResult ? `<button class="btn btn-sm" data-action="roll-map-travel-event">Rzuć Wydarzenie Podróży (d100)</button>` : ""}
                <button class="btn btn-sm btn-secondary" data-action="dismiss-travel-check">Zamknij</button>
            </span>
        </div>
        ${eventResult ? renderGenericEntry(eventResult, "d100") : ""}
        ${renderTravelEventEffects(effects)}
    `;
}

function renderHexCell(state, coord, col, row) {
    const seg = currentSeg(state);
    const hex = seg.hexes[coord];
    const left = col * COL_PITCH;
    const top = row * HEX_HEIGHT + (col % 2 ? HEX_HEIGHT / 2 : 0);
    const isPosition = !!state.map.position && state.map.position.segment === state.map.currentSegment && state.map.position.coord === coord;
    const isSelected = selectedCoord === coord;

    let cls = "hex";
    let tip = coord;
    let loctypeAttr = "";

    if (!hex) {
        cls += " hex--empty";
        tip += " — nieodkryty";
    } else {
        const root = hex.regionRoot ? seg.hexes[hex.regionRoot] : hex;
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
        // Ręcznie nadana nazwa (patrz renderHexCustomInfo) ma pierwszeństwo przed losowaną nazwą
        // Osady/Unikalnej Lokacji — to gracz decyduje, jak lokacja faktycznie się nazywa "na mapie".
        let nameText = "";
        if (hex.customName) {
            nameText = ` · „${hex.customName}”`;
        } else if (typeResult === "Osada") {
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
                ${hex ? `<span class="hex-abbr">${TYPE_ABBR[hex.regionRoot ? (seg.hexes[hex.regionRoot]?.typeResult) : hex.typeResult] || "?"}</span>` : ""}
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
                <span>${escapeHtml(t.label)}${t.roll != null ? ` — d100=${t.roll}` : ""}</span>
                <span class="entry-meta-right">
                    <span>${t.ts}</span>
                    <button class="btn btn-sm btn-icon" data-action="delete-hex-test" data-coord="${coord}" data-id="${t.id}" title="Usuń wpis">×</button>
                </span>
            </div>
            <div class="entry-result">${t.html}</div>
        </li>
    `).join("");

    const staminaCost = data?.mechanics?.exploration_table_by_location_type?.stamina_cost_per_exploration ?? 1;
    const costHint = renderExplorationCostHint(type, staminaCost, hex);
    return `
        <div class="hex-tests">
            <h4>Testy / Eksploracja</h4>
            ${costHint}
            <div class="hex-test-buttons">${buttons}</div>
            ${history ? `<ul class="entry-list" style="margin-top:8px;">${history}</ul>` : `<p class="placeholder">Brak wykonanych testów na tym polu.</p>`}
        </div>
    `;
}

/** Podpowiedź kosztu Eksploracji pod nagłówkiem "Testy / Eksploracja" — odzwierciedla, że koszt
 *  nalicza się RAZ za komplet testów (patrz maybeChargeExplorationCompletion), nie za pojedynczy
 *  rzut, i informuje, czy dla tego konkretnego heksu został już opłacony. */
function renderExplorationCostHint(type, cost, hex) {
    const required = explorationKindsForType(type);
    if (!required) return "";
    if (hex.explorationCostPaid) {
        return `<p class="placeholder" style="margin:0 0 4px;">Koszt Eksploracji tego heksu (${cost} Wytrzymałość) został już opłacony — dalsze testy/przerzuty nic nie kosztują.</p>`;
    }
    if (required.length > 1) {
        return `<p class="placeholder" style="margin:0 0 4px;">Komplet testów (wszystkie ${required.length}) kosztuje ${cost} Wytrzymałość — jednorazowo, dopiero po wykonaniu ich wszystkich.</p>`;
    }
    return `<p class="placeholder" style="margin:0 0 4px;">Ten rzut kosztuje ${cost} Wytrzymałość.</p>`;
}

/** Ręcznie nadana nazwa/opis heksu (hex.customName/hex.customDescription) — niezależne od
 *  ewentualnej losowanej nazwy Osady/Unikalnej Lokacji (hex.tests[]), którą tabela nadal
 *  zapisuje w historii testów. Pozwala graczowi np. ochrzcić Osadę własną nazwą ("Dolina
 *  Księżycowej Rosy") i dopisać krótką notatkę fabularną — edycja inline w miejscu, patrz
 *  editingHexField/startEditHexField/saveHexField niżej (bez window.prompt — przeglądarki
 *  potrafią blokować powtarzalne wyskakujące okienka). */
function renderHexCustomInfo(hex, coord) {
    const editing = editingHexField && editingHexField.coord === coord ? editingHexField.field : null;

    const nameDisplay = editing === "name"
        ? `
            <div class="hex-inline-edit">
                <input type="text" class="hex-inline-input" data-role="edit-input"
                       value="${escapeHtml(hex.customName || "")}" placeholder="np. Dolina Księżycowej Rosy" maxlength="60">
                <div class="hex-inline-edit-actions">
                    <button class="btn btn-sm btn-primary" data-action="save-hex-name" data-coord="${coord}">Zapisz</button>
                    <button class="btn btn-sm btn-secondary" data-action="cancel-hex-edit">Anuluj</button>
                </div>
            </div>
        `
        : `
            <div class="hex-custom-row">
                ${hex.customName ? `<p class="hex-custom-name">„${escapeHtml(hex.customName)}”</p>` : ""}
                <button class="btn btn-sm btn-secondary" data-action="edit-hex-name" data-coord="${coord}">${hex.customName ? "Zmień nazwę" : "Nadaj nazwę"}</button>
            </div>
        `;

    const descDisplay = editing === "desc"
        ? `
            <div class="hex-inline-edit">
                <textarea class="hex-inline-input" data-role="edit-input" rows="3" maxlength="280"
                          placeholder="Krótki opis lokacji…">${escapeHtml(hex.customDescription || "")}</textarea>
                <div class="hex-inline-edit-actions">
                    <button class="btn btn-sm btn-primary" data-action="save-hex-desc" data-coord="${coord}">Zapisz</button>
                    <button class="btn btn-sm btn-secondary" data-action="cancel-hex-edit">Anuluj</button>
                </div>
            </div>
        `
        : `
            <div class="hex-custom-row">
                ${hex.customDescription ? `<p class="hex-custom-desc">${escapeHtml(hex.customDescription)}</p>` : ""}
                <button class="btn btn-sm btn-secondary" data-action="edit-hex-desc" data-coord="${coord}">${hex.customDescription ? "Edytuj opis" : "Dodaj opis"}</button>
            </div>
        `;

    return `
        <div class="hex-custom-info">
            ${nameDisplay}
            ${descDisplay}
        </div>
    `;
}

/** Wchodzi w tryb edycji inline pola `field` ("name"/"desc") heksu `coord` — pokazuje
 *  <input>/<textarea> w miejscu tekstu zamiast window.prompt(). Czysta zmiana stanu UI
 *  (brak touch(), nic jeszcze nie zapisane), więc trzeba samemu zawołać rerender(). */
function startEditHexField(coord, field) {
    editingHexField = { coord, field };
    rerender();
    focusHexEditInput();
}

function focusHexEditInput() {
    if (!currentRoot) return;
    const input = currentRoot.querySelector('.hex-inline-edit [data-role="edit-input"]');
    if (!input) return;
    input.focus();
    const len = input.value.length;
    input.setSelectionRange(len, len);
}

/** Zapisuje wartość z widocznego pola inline (odczytaną wprost z DOM, na wzór
 *  journal.js#new-entry — pole jest "niekontrolowane", bez śledzenia każdego znaku w stanie UI)
 *  do hex.customName/hex.customDescription, zamyka tryb edycji i persystuje zmianę. */
function saveHexField(coord, field) {
    const state = getState();
    const hex = currentSeg(state).hexes[coord];
    editingHexField = null;
    if (!hex) { rerender(); return; }
    const input = currentRoot?.querySelector('.hex-inline-edit [data-role="edit-input"]');
    const value = input ? input.value.trim() : "";
    if (field === "name") hex.customName = value || null;
    else hex.customDescription = value || null;
    touch();
    rerender();
}

function cancelHexEdit() {
    editingHexField = null;
    rerender();
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
    const seg = currentSeg(state);
    const hex = seg.hexes[coord];
    const isPosition = !!state.map.position && state.map.position.segment === state.map.currentSegment && state.map.position.coord === coord;

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
    const root = isMember ? seg.hexes[hex.regionRoot] : hex;
    if (!root) {
        return `<h3>Heks ${coord}</h3><p class="placeholder">Błąd danych regionu (brak roota ${hex.regionRoot}) — usuń ten heks.</p>${renderHexActions(coord)}`;
    }

    const parts = [];
    parts.push(`<h3>Heks ${coord}${isPosition ? " · pozycja postaci" : ""}${isMember ? ` · część regionu ${hex.regionRoot}` : ""}</h3>`);
    parts.push(`<p><strong>${root.typeResult}</strong>${isSet(root.level) ? ` — Poziom ${root.level}` : ""}</p>`);
    parts.push(renderHexCustomInfo(hex, coord));

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

/** Baner ostrzegający, że Zasoby na gliderze są wyczerpane, a Zużycie osiągnęło maksimum —
 *  tekst efektu bierzemy wprost z mechanics.json#glider.wear.on_max (zamiast duplikować regułę
 *  na sztywno w kodzie). Trwały: nie ma tu żadnej flagi do odznaczenia — po prostu odzwierciedla
 *  aktualny stan glidera przy KAŻDYM renderze mapy, więc znika sam, gdy tylko warunek przestanie
 *  być spełniona (uzupełnienie Zasobów w osadzie, naprawa Zużycia na Obozie/w osadzie itp.), i
 *  wraca, gdyby warunek ponownie zaszedł. */
function renderGliderLimitBanner(state, data) {
    const glider = state.character.glider;
    if (glider.supply.cur > 0 || glider.wear.cur < glider.wear.max) return "";
    const effectText = data?.mechanics?.glider?.wear?.on_max || "maks. Prędkość staje się 1, Mody niedostępne";
    return `
        <div class="map-banner map-banner--warning">
            <span>Zasoby = 0 i Zużycie na Gliderze = maks. — <strong>${escapeHtml(effectText)}</strong></span>
        </div>
    `;
}

/** Baner "Wróć do pozycji postaci" — pokazywany, gdy oglądany Sektor (currentSegment) różni się
 *  od Sektora, w którym faktycznie stoi postać (state.map.position.segment). Nawigacja Sektorami
 *  jest czysto widokowa (patrz navigateSegment), więc bez tego byłoby łatwo "zgubić" pozycję
 *  postaci po przejrzeniu sąsiednich Sektorów. */
function renderGotoPositionBanner(state) {
    const pos = state.map.position;
    if (!pos || pos.segment === state.map.currentSegment) return "";
    return `
        <div class="map-banner">
            <span>Postać znajduje się w <strong>${segmentLabel(pos.segment)}</strong> (heks ${pos.coord}), nie w oglądanym Sektorze.</span>
            <button class="btn btn-sm btn-secondary" data-action="goto-position-segment">Wróć do pozycji postaci</button>
        </div>
    `;
}

export function render(root, { state, data }) {
    currentRoot = root;
    currentData = data;
    if (!state.map) return;

    const seg = currentSeg(state);
    const westId = state.map.currentSegment - 1;
    const eastId = state.map.currentSegment + 1;
    const westExists = !!state.map.segments[String(westId)];
    const eastExists = !!state.map.segments[String(eastId)];
    const westTip = westExists ? segmentLabel(westId) : `Utwórz ${segmentLabel(westId)}`;
    const eastTip = eastExists ? segmentLabel(eastId) : `Utwórz ${segmentLabel(eastId)}`;

    // Tekst instrukcji i wszelkie banery (wybór regionu, sprawdzenie Wydarzenia Podróży, powrót
    // do pozycji postaci) siedzą POD siatką, nie nad nią — dzięki temu ich pojawianie się/znikanie
    // (albo zmiana treści) nie przesuwa samej siatki heksów w pionie na stronie. Strzałki
    // nawigacji Sektorami stoją po bokach samej siatki (patrz .hex-grid-row w styles.css).
    root.innerHTML = `
        <div class="card">
            <h2>Mapa — ${segmentLabel(state.map.currentSegment)}</h2>
            <div class="hex-grid-row">
                <button type="button" class="hex-nav-btn tt" data-action="nav-segment" data-dir="-1" data-tip="${escapeHtml(westTip)}" aria-label="Na zachód">◀</button>
                <div class="hex-grid-wrap">
                    <div class="hex-grid"></div>
                </div>
                <button type="button" class="hex-nav-btn tt" data-action="nav-segment" data-dir="1" data-tip="${escapeHtml(eastTip)}" aria-label="Na wschód">▶</button>
            </div>
            <div class="map-info-below">
                ${renderGliderLimitBanner(state, data)}
                ${seg.pendingRegion ? renderPendingBanner(seg.pendingRegion) : ""}
                ${renderGotoPositionBanner(state)}
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
        else if (action === "edit-hex-name") startEditHexField(coord, "name");
        else if (action === "edit-hex-desc") startEditHexField(coord, "desc");
        else if (action === "save-hex-name") saveHexField(coord, "name");
        else if (action === "save-hex-desc") saveHexField(coord, "desc");
        else if (action === "cancel-hex-edit") cancelHexEdit();
        else if (action === "move-here") moveHere(coord);
        else if (action === "reroll-hex") rerollHex(coord);
        else if (action === "remove-hex") removeHex(coord);
        else if (action === "cancel-pending-region") cancelPendingRegion();
        else if (action === "roll-map-travel-event") rollMapTravelEvent();
        else if (action === "dismiss-travel-check") dismissTravelCheck();
        else if (action === "nav-segment") navigateSegment(Number(btn.dataset.dir));
        else if (action === "goto-position-segment") gotoPositionSegment();
    });

    // Skróty klawiszowe w polu edycji inline nazwy/opisu heksu (patrz renderHexCustomInfo):
    // Escape zawsze anuluje; Enter zapisuje TYLKO w polu nazwy (pojedynczy <input>) — w opisie
    // (<textarea>) Enter ma zostać zwykłym nowym wierszem, tam zapisuje wyłącznie przycisk.
    root.addEventListener("keydown", (e) => {
        const input = e.target.closest('.hex-inline-edit [data-role="edit-input"]');
        if (!input || !editingHexField) return;
        if (e.key === "Escape") {
            e.preventDefault();
            cancelHexEdit();
        } else if (e.key === "Enter" && input.tagName === "INPUT") {
            e.preventDefault();
            saveHexField(editingHexField.coord, editingHexField.field);
        }
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
