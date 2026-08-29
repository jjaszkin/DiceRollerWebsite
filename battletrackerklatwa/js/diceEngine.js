// Battle Tracker - Klątwa Strahda. Silnik rzutów: atak (d20 + bonus vs KP), obrażenia
// (parsowanie formuł "NkM+K", krytyk podwaja liczbę kości, nie modyfikator), odporności/
// immunitety/podatności, rzuty obronne.

const DICE_RE = /^\s*(\d+)\s*k\s*(\d+)\s*([+-]\s*\d+)?\s*$/i;
// akceptuje też zapis z "d" (np. gdy dane wejściowe są po angielsku)
const DICE_RE_ALT = /^\s*(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?\s*$/i;

export function rollDie(sides) {
    return 1 + Math.floor(Math.random() * sides);
}

export function rollD20() {
    return rollDie(20);
}

export function parseFormula(formula) {
    const str = String(formula || "");
    const m = DICE_RE.exec(str) || DICE_RE_ALT.exec(str);
    if (!m) return null;
    const count = Number(m[1]);
    const sides = Number(m[2]);
    const mod = m[3] ? Number(m[3].replace(/\s+/g, "")) : 0;
    return { count, sides, mod };
}

export function rollFormula(formula, { crit = false } = {}) {
    const parsed = parseFormula(formula);
    if (!parsed) return { formula, rolls: [], mod: 0, total: 0, valid: false };
    const count = crit ? parsed.count * 2 : parsed.count;
    const rolls = Array.from({ length: count }, () => rollDie(parsed.sides));
    const total = rolls.reduce((a, b) => a + b, 0) + parsed.mod;
    return { formula, rolls, mod: parsed.mod, total, valid: true };
}

/** Rzut na trafienie. `targetAc` może być null/0 (nieustawione) - wtedy `hit` wraca jako null
 *  i GM sam decyduje, patrząc na surowy wynik. */
export function resolveAttack({ attackBonus = 0, targetAc = null }) {
    const roll = rollD20();
    const total = roll + Number(attackBonus || 0);
    const isCrit = roll === 20;
    const isFumble = roll === 1;
    let hit = null;
    if (isFumble) {
        hit = false;
    } else if (typeof targetAc === "number" && targetAc > 0) {
        hit = isCrit ? true : total >= targetAc;
    }
    return { roll, attackBonus, total, isCrit, isFumble, hit };
}

/** Rzut obronny celu (auto dla potworów/NPC z zapisanym bonusem). */
export function resolveSave({ dc, bonus = 0 }) {
    const roll = rollD20();
    const total = roll + Number(bonus || 0);
    return { roll, bonus, total, dc, success: total >= dc };
}

function normalizeType(t) {
    return String(t || "").trim().toLowerCase();
}

export function applyDamageMitigation(amount, damageType, target) {
    const type = normalizeType(damageType);
    const has = (list) => (list || []).some((t) => normalizeType(t) === type);
    if (type && has(target?.immunities)) return { adjusted: 0, note: "immunitet" };
    if (type && has(target?.resistances)) return { adjusted: Math.floor(amount / 2), note: "odporność (połowa)" };
    if (type && has(target?.vulnerabilities)) return { adjusted: amount * 2, note: "podatność (podwójne)" };
    return { adjusted: amount, note: null };
}

/** Rzuca i sumuje wszystkie wpisy obrażeń danej akcji (np. sieczące + trujące osobno), stosując
 *  odporności/immunitety/podatności celu do KAŻDEGO wpisu z osobna (różne typy mogą być traktowane
 *  różnie), zwracając zarówno surowy jak i skorygowany wynik. */
export function resolveDamage({ damageEntries = [], target = null, crit = false, halved = false }) {
    const parts = damageEntries.map((entry) => {
        const rolled = rollFormula(entry.formula, { crit });
        let raw = rolled.total;
        if (halved) raw = Math.floor(raw / 2);
        const { adjusted, note } = applyDamageMitigation(raw, entry.type, target);
        return { type: entry.type, formula: entry.formula, rolls: rolled.rolls, mod: rolled.mod, raw, adjusted, note };
    });
    const rawTotal = parts.reduce((sum, p) => sum + p.raw, 0);
    const adjustedTotal = parts.reduce((sum, p) => sum + p.adjusted, 0);
    return { parts, rawTotal, adjustedTotal };
}
