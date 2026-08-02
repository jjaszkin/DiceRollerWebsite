// GLIDE: Part Two — wspólne narzędzia: kości, wyszukiwanie w tabelach zakresowych, historia rzutów.

export function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
}

export function rollD10() { return rollDie(10); }

/** d100 zgodnie z opisem w mechanics.json: 2d10, jedna = dziesiątki, druga = jedynki (0 i 0 = 100). */
export function rollD100() {
    const tensDie = rollD10();  // 1-10
    const onesDie = rollD10();  // 1-10
    const tens = tensDie === 10 ? 0 : tensDie;
    const ones = onesDie === 10 ? 0 : onesDie;
    let total = tens * 10 + ones;
    if (total === 0) total = 100;
    return { tensDie, onesDie, total };
}

/** d2 wg podręcznika: d10 1-5=1, 6-10=2 */
export function rollD2() {
    const r = rollD10();
    return r <= 5 ? 1 : 2;
}

/** d5 wg podręcznika: d10 1-2=1,3-4=2,5-6=3,7-8=4,9-10=5 */
export function rollD5() {
    const r = rollD10();
    return Math.ceil(r / 2);
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

/**
 * Szuka wpisu w tabeli zakresowej dla danego wyniku rzutu. Defensywnie obsługuje
 * znane błędy druku w źródle (zdublowane/brakujące zakresy) — zwraca pierwsze
 * dopasowanie, a jeśli brak dopasowania, najbliższy wpis poniżej wartości.
 * `field` to nazwa klucza z zakresem (domyślnie "range", w mechanics.json bywa "roll").
 */
export function findInRangeTable(table, rollValue, field = "range") {
    if (!Array.isArray(table)) return null;
    for (const entry of table) {
        const range = parseRange(entry[field]);
        if (range && rollValue >= range[0] && rollValue <= range[1]) return entry;
    }
    // Fallback defensywny: brak dopasowania (np. luka w druku) — weź najbliższy wpis, którego zakres kończy się poniżej wyniku.
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

/** Ustawia wartość pod ścieżką kropkową, tworząc brakujące obiekty pośrednie zamiast rzucać wyjątek
 *  (np. gdy zapis z Firebase ma niekompletny/starszy kształt niż aktualny schemat stanu). */
export function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (o[keys[i]] == null || typeof o[keys[i]] !== "object") o[keys[i]] = {};
        o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
}

export function formatTimestamp(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
