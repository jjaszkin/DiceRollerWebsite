// Dark Graal III - Dashboard Solo (MG). Wspólne narzędzia: generyczne helpery (przeniesione 1:1
// z glide2solo) + silnik testu Dark Graala (pula k6).
//
// UWAGA co do silnika testu (rollTestPool/applyReroll.../resolveTier): dokładny algorytm nie był
// jeszcze wprost potwierdzony 1:1 przez usera w tej sesji (kontekst z wcześniejszej, długiej
// wymiany o mechanice ["Rzuca się jako jedna pula", "usuwanie po 1"...] uległ częściowej utracie
// przy kompaktowaniu historii rozmowy). Zaimplementowany tu kształt to możliwie wierna rekonstrukcja
// z dostępnych, potwierdzonych źródeł:
//   - Moce postaci (data/transformations.json) konsekwentnie traktują „6” jako sukces („jeśli w
//     rzucie wypadnie przynajmniej jedna 6”) i „1” jako coś złego, co da się przerzucić
//     (reroll_ones) - więc kości to k6, 6 = dobrze, 1 = źle.
//   - Przedmiot „Zioła Merlina” (data/items.json) nazywa wprost trzy poziomy sukcesu przy leczeniu:
//     „pełen sukces” / „zwykły [sukces]” / „komplikacja” - to nazewnictwo przenosimy 1 : 1 jako
//     ogólne tiery testu (+ dodajemy czwarty, `failure`, dla przypadku bez ani jednej sensownej
//     kości).
//   - Zadanie z listy TODO tej sesji opisywało silnik jako „pula kości, usuwanie po 1, tier
//     sukcesu, reroll/raise” - stąd reguła: kości pokazujące „1” są usuwane z puli PRZED
//     wyznaczeniem tieru (nie liczą się, ale zostają pokazane w logu), z zabezpieczeniem na
//     brzegowy przypadek (cała pula to same „1” → tier `failure`, a nie wyjątek/pusta tablica).
// To wszystko wymaga szybkiego potwierdzenia/korekty przez usera przy pierwszym realnym użyciu
// panelu Rollera - patrz komentarz w panels/roller.js.

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
 * Rzuca testową pulę `count` kości k6 i stosuje zasadę „usuwanie po 1”: kości pokazujące 1 nie
 * liczą się przy wyznaczaniu tieru (ale zostają w `dice` do wyświetlenia w logu). Zwraca:
 *   { dice: number[], survivingDice: number[], removedOnes: number, tier: string }
 * `count` jest przycinane do min. 1 (test z zerem/ujemną liczbą kości nie ma sensu - wywołujący
 * powinien zablokować taką akcję w UI zamiast polegać na tej funkcji).
 */
export function rollTestPool(count) {
    const n = Math.max(1, count);
    const dice = Array.from({ length: n }, () => rollD6());
    const survivingDice = dice.filter(d => d !== 1);
    const removedOnes = n - survivingDice.length;
    return { dice, survivingDice, removedOnes, tier: resolveTier(survivingDice) };
}

/** Przerzuca do `amount` kości o wartości 1 w PEŁNEJ tablicy kości z rollTestPool().dice (nie tylko
 *  survivingDice) - używane przez moce w rodzaju „Zew krwi”/„Szept otchłani” (reroll_ones). Zwraca
 *  nową tablicę kości (ta sama długość) + policzone survivingDice/tier po przerzucie. */
export function applyRerollOnes(dice, amount) {
    let rerolled = 0;
    const next = dice.map((d) => {
        if (d === 1 && rerolled < amount) {
            rerolled++;
            return rollD6();
        }
        return d;
    });
    const survivingDice = next.filter(d => d !== 1);
    return { dice: next, survivingDice, removedOnes: next.length - survivingDice.length, tier: resolveTier(survivingDice), rerolled };
}

/** Przerzuca WSZYSTKIE kości o wartości 1 (reroll_all_ones, np. „Puste sakramenty”). */
export function applyRerollAllOnes(dice) {
    return applyRerollOnes(dice, dice.length);
}

/** Podnosi najniższą kość w tablicy o `amount` (przycięte do 6) - używane przez moce w rodzaju
 *  „Kościana siła”/„Głos Excalibura” (raise_lowest_die). Jeśli tablica jest pusta, nic nie robi. */
export function applyRaiseLowestDie(dice, amount) {
    if (!dice.length) return { dice: [...dice], survivingDice: [], removedOnes: 0, tier: "failure" };
    let lowestIdx = 0;
    for (let i = 1; i < dice.length; i++) if (dice[i] < dice[lowestIdx]) lowestIdx = i;
    const next = [...dice];
    next[lowestIdx] = clamp(next[lowestIdx] + amount, 1, 6);
    const survivingDice = next.filter(d => d !== 1);
    return { dice: next, survivingDice, removedOnes: next.length - survivingDice.length, tier: resolveTier(survivingDice) };
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
