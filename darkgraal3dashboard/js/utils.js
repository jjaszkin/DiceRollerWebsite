// Dark Graal III - Dashboard Solo (MG). Wspólne narzędzia: generyczne helpery (przeniesione 1:1
// z glide2solo) + silnik testu Dark Graala (pula k6).
//
// Silnik testu (potwierdzone przez usera po pierwszych testach na żywo): kości to k6, "6" to pełny
// sukces, "1" to zła kość - ale "1" NIE jest po prostu odrzucana. Każda "1" w puli anuluje SIEBIE
// ORAZ jedną najwyższą spośród pozostałych (nie-"1") kości, jedna para na jedną "1". Przykład
// potwierdzony przez usera: pula [1, 1, 4, 6, 6] → dwie "1" anulują dwie najwyższe kości (6 i 6),
// ocalałe: [4] → tier "sukces". Jeśli "1" jest więcej niż kości do anulowania, nadmiarowe "1" po
// prostu nie mają już czego anulować (ocalałe = []).

export function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
}

export function rollD6() { return rollDie(6); }

/** Poziomy sukcesu testu, w kolejności od najlepszego. */
export const TEST_TIERS = ["fullSuccess", "success", "complication", "failure"];

export const TEST_TIER_LABELS = {
    fullSuccess: "Pełny sukces",
    success: "Sukces",
    complication: "Komplikacja",
    failure: "Porażka"
};

/** Wyznacza tier testu na podstawie kości, które PRZETRWAŁY usunięcie „1” (patrz rollTestPool).
 *  Najwyższa ocalała kość: 6 → pełny sukces, 4-5 → sukces, 2-3 → komplikacja. Brak ocalałych
 *  kości (cała pula to same „1”) → porażka. */
export function resolveTier(survivingDice) {
    if (!survivingDice.length) return "failure";
    const highest = Math.max(...survivingDice);
    if (highest === 6) return "fullSuccess";
    if (highest >= 4) return "success";
    return "complication";
}

/**
 * Wyznacza, które kości z puli PRZETRWAŁY zasadę „1 anuluje siebie + najwyższą pozostałą” (patrz
 * komentarz na górze pliku). Zwraca indeksy (nie wartości), żeby dało się rozróżnić dwie kości o
 * tej samej wartości. Kolejność wewnątrz zwracanych tablic jest rosnąca po indeksie w `dice`.
 *   { survivingIndices: number[], cancelledIndices: number[], oneIndices: number[] }
 */
export function computeSurvivingIndices(dice) {
    const oneIndices = [];
    const nonOneEntries = []; // { index, value }
    dice.forEach((d, i) => {
        if (d === 1) oneIndices.push(i);
        else nonOneEntries.push({ index: i, value: d });
    });
    // Sortuj malejąco po wartości - Array#sort jest stabilny (spec ES2019+), więc przy remisach
    // anulowana zostaje ta kość, która pojawiła się wcześniej w puli (deterministyczne, bez znaczenia
    // mechanicznego, ale przewidywalne dla UI).
    const sortedDesc = [...nonOneEntries].sort((a, b) => b.value - a.value);
    const cancelCount = Math.min(oneIndices.length, sortedDesc.length);
    const cancelledIndices = sortedDesc.slice(0, cancelCount).map(e => e.index);
    const cancelledSet = new Set(cancelledIndices);
    const survivingIndices = nonOneEntries.filter(e => !cancelledSet.has(e.index)).map(e => e.index);
    return { survivingIndices, cancelledIndices, oneIndices };
}

/** Jak computeSurvivingIndices, ale od razu z wartościami kości + wyznaczonym tierem. Zwraca:
 *   { dice, survivingDice, survivingIndices, cancelledIndices, oneIndices, tier } */
export function resolveDicePool(dice) {
    const { survivingIndices, cancelledIndices, oneIndices } = computeSurvivingIndices(dice);
    const survivingDice = survivingIndices.map(i => dice[i]);
    return { dice, survivingDice, survivingIndices, cancelledIndices, oneIndices, tier: resolveTier(survivingDice) };
}

/** Per-kość adnotacja do renderowania chipów (roller.js/journal-w-roller.js): dla każdej kości w
 *  `dice` zwraca { value, state }, gdzie state ∈ 'one' (dosłowna "1") | 'cancelled' (anulowana
 *  przez "1") | 'full' (ocalała 6) | 'success' (ocalała 4-5) | 'complication' (ocalała 2-3). */
export function annotateDice(dice) {
    const { survivingIndices, cancelledIndices, oneIndices } = computeSurvivingIndices(dice);
    const survivingSet = new Set(survivingIndices);
    const cancelledSet = new Set(cancelledIndices);
    const oneSet = new Set(oneIndices);
    return dice.map((value, i) => {
        let state;
        if (oneSet.has(i)) state = "one";
        else if (cancelledSet.has(i)) state = "cancelled";
        else if (value === 6) state = "full";
        else if (value >= 4) state = "success";
        else state = "complication";
        return { value, state };
    });
}

/**
 * Rzuca testową pulę `count` kości k6 i stosuje zasadę anulowania (patrz resolveDicePool). Zwraca:
 *   { dice, survivingDice, survivingIndices, cancelledIndices, oneIndices, removedOnes, tier }
 * `count` jest przycinane do min. 1 (test z zerem/ujemną liczbą kości nie ma sensu - wywołujący
 * powinien zablokować taką akcję w UI zamiast polegać na tej funkcji). `removedOnes` (liczba
 * dosłownych "1" w puli) zostaje jako pole dla wstecznej zgodności z istniejącym UI.
 */
export function rollTestPool(count) {
    const n = Math.max(1, count);
    const dice = Array.from({ length: n }, () => rollD6());
    const resolved = resolveDicePool(dice);
    return { ...resolved, removedOnes: resolved.oneIndices.length };
}

/** Przerzuca do `amount` DOSŁOWNYCH kości o wartości 1 w PEŁNEJ tablicy kości (nie kości anulowanych
 *  przez "1", tylko literalne jedynki) - używane przez moce w rodzaju „Zew krwi”/„Szept otchłani”
 *  (reroll_ones). Zwraca nową tablicę kości (ta sama długość) + świeżo policzony wynik (surviving/
 *  cancelled/tier, zgodnie z nowym rozdaniem po przerzucie). */
export function applyRerollOnes(dice, amount) {
    let rerolled = 0;
    const next = dice.map((d) => {
        if (d === 1 && rerolled < amount) {
            rerolled++;
            return rollD6();
        }
        return d;
    });
    const resolved = resolveDicePool(next);
    return { ...resolved, removedOnes: resolved.oneIndices.length, rerolled };
}

/** Przerzuca WSZYSTKIE dosłowne "1" (reroll_all_ones, np. „Puste sakramenty”). */
export function applyRerollAllOnes(dice) {
    return applyRerollOnes(dice, dice.length);
}

/** Podnosi najniższą kość w tablicy o `amount` (przycięte do 6) - używane przez moce w rodzaju
 *  „Kościana siła”/„Głos Excalibura” (raise_lowest_die). Jeśli tablica jest pusta, nic nie robi. */
export function applyRaiseLowestDie(dice, amount) {
    if (!dice.length) return { dice: [...dice], survivingDice: [], survivingIndices: [], cancelledIndices: [], oneIndices: [], removedOnes: 0, tier: "failure" };
    let lowestIdx = 0;
    for (let i = 1; i < dice.length; i++) if (dice[i] < dice[lowestIdx]) lowestIdx = i;
    const next = [...dice];
    next[lowestIdx] = clamp(next[lowestIdx] + amount, 1, 6);
    const resolved = resolveDicePool(next);
    return { ...resolved, removedOnes: resolved.oneIndices.length };
}

/** Parsuje pole zakresu w tabelach ("1-5", "54-54", "9", 9, "1-2") na [min, max]. */
export function parseRange(rangeValue) {
    if (typeof rangeValue === "number") return [rangeValue, rangeValue];
    const str = String(rangeValue).trim();
    if (str.includes("-")) {
        const [a, b] = str.split("-").map(s => parseInt(s.trim(), 10));
        if (Number.isFinite(a) && Number.isFinite(b)) return [Math.min(a, b), Math.max(a, b)];
    }
    const n = parseInt(str, 10);
    return Number.isFinite(n) ? [n, n] : null;
}

/** Szuka wpisu w tabeli zakresowej dla danego wyniku rzutu (patrz glide2solo#utils.js dla
 *  pierwowzoru) - nieużywane na razie w danych Dark Graala (brak tabel zakresowych d100), ale
 *  zostawione jako gotowy generyczny helper na wypadek przyszłych tabel losowych. */
export function findInRangeTable(table, rollValue, field = "range") {
    if (!Array.isArray(table)) return null;
    for (const entry of table) {
        const range = parseRange(entry[field]);
        if (range && rollValue >= range[0] && rollValue <= range[1]) return entry;
    }
    let best = null;
    let bestMax = -Infinity;
    for (const entry of table) {
        const range = parseRange(entry[field]);
        if (range && range[1] < rollValue && range[1] > bestMax) { best = entry; bestMax = range[1]; }
    }
    return best;
}

export function clamp(value, min, max) {
    if (typeof min === "number") value = Math.max(min, value);
    if (typeof max === "number") value = Math.min(max, value);
    return value;
}

export function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** Ustawia wartość pod ścieżką kropkową, tworząc brakujące obiekty pośrednie zamiast rzucać wyjątek. */
export function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (o[keys[i]] == null || typeof o[keys[i]] !== "object") o[keys[i]] = {};
        o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
}

/** Ucieka znaki specjalne HTML - do bezpiecznego wstawiania tekstu wpisanego przez użytkownika
 *  (notatki MG, dziennik) do szablonów budowanych przez innerHTML. */
export function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

/** Zamienia dowolny tekst na bezpieczny klucz Firebase RTDB: usuwa znaki diakrytyczne, spacje
 *  oraz znaki niedozwolone w kluczach RTDB (. # $ [ ] /). */
export function sanitizeNameToKey(name) {
    return String(name)
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[.#$[\]/]/g, "")
        .replace(/\s+/g, "")
        .trim();
}

/** Wykonuje `fn` (zwykle pełne nadpisanie panelu przez innerHTML) z zachowaniem pozycji scrolla
 *  strony - patrz glide2solo#utils.js dla pełnego uzasadnienia. */
export function preserveScroll(fn) {
    const y = window.scrollY;
    fn();
    if (window.scrollY !== y) window.scrollTo(0, y);
}

export function formatTimestamp(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
