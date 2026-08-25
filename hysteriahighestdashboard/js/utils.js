// Hysteria Highest - Dashboard. Wspólne narzędzia: generyczne helpery (przeniesione 1:1 z
// darkgraal3dashboard/js/utils.js) + silnik testu KULT: Divinity Lost (2k10 + modyfikator).
//
// Test KULT: rzut 2k10 (jedna kość dziesiątek, jedna jedności - traktowane tu jako zwykła suma,
// zgodnie z istniejącym rollerem hysteriahighest/script-lite-moves.js) + ewentualne dodatkowe
// kości + modyfikator z atrybutu. Progi: 15+ pełny sukces, 10-14 częściowy sukces (MG/gracz
// wybiera komplikację), <=9 porażka (MG wykonuje Ruch).

export function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function rollDie(sides) {
    return Math.floor(Math.random() * sides) + 1;
}

export const TEST_TIERS = ["success", "partial", "failure"];

export const TEST_TIER_LABELS = {
    success: "15+ Sukces!",
    partial: "10–14 Częściowy sukces",
    failure: "≤9 Porażka"
};

/** Wyznacza tier na podstawie sumy 2k10 (+ dodatkowe kości) + modyfikator. */
export function resolveKultTier(total) {
    if (total >= 15) return "success";
    if (total >= 10) return "partial";
    return "failure";
}

/**
 * Rzuca test KULT: bazowe 2k10 + opcjonalne dodatkowe grupy kości ({qty, sides}) + modyfikator.
 * Zwraca { dice: number[], sum, modifier, total, tier }.
 */
export function rollKultTest({ extraDiceGroups = [], modifier = 0 } = {}) {
    const dice = [rollDie(10), rollDie(10)];
    for (const g of extraDiceGroups) {
        for (let i = 0; i < g.qty; i++) dice.push(rollDie(g.sides));
    }
    const sum = dice.reduce((a, b) => a + b, 0);
    const total = sum + modifier;
    return { dice, sum, modifier, total, tier: resolveKultTier(total) };
}

export function clamp(value, min, max) {
    if (typeof min === "number") value = Math.max(min, value);
    if (typeof max === "number") value = Math.min(max, value);
    return value;
}

export function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function setPath(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        if (o[keys[i]] == null || typeof o[keys[i]] !== "object") o[keys[i]] = {};
        o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
}

export function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

/** Renderuje tekst Ruchu/Atutu/Komplikacji (high/mid/low z data/*.json) na HTML: każda linia
 *  zaczynająca się od "◊" (opcja wyboru) dostaje własny wiersz zamiast lądować w jednym ciągu ze
 *  wszystkim innym - wzorzec z hysteriahighest/script-lite-moves.js#renderMoveText. */
export function renderMoveText(text) {
    if (!text) return "";
    return text.split("\n").map(line => {
        const t = line.trim();
        if (!t) return "";
        if (t.startsWith("◊")) return `<div class="move-diamond-item">${escapeHtml(t)}</div>`;
        return `<p class="move-result-line">${escapeHtml(t)}</p>`;
    }).filter(Boolean).join("");
}

export function sanitizeNameToKey(name) {
    return String(name)
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[.#$[\]/]/g, "")
        .replace(/\s+/g, "")
        .trim();
}

export function preserveScroll(fn) {
    const y = window.scrollY;
    fn();
    if (window.scrollY !== y) window.scrollTo(0, y);
}

export function formatTimestamp(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).slice(-2)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
