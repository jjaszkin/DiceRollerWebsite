// Hysteria Highest - Dashboard. Silnik rzutów uwzględniający modyfikatory z Ran i Stabilności,
// współdzielony przez mandalę cech, Atuty/Komplikacje na karcie postaci i wolny rzut w Dzienniku.
//
// Rany: 1+ Poważna = -1 do WSZYSTKICH rzutów, Krytyczna = -1 do WSZYSTKICH rzutów, obie naraz = -2
// (nie sumuje się per sztuka Poważnej - liczy się tylko "czy w ogóle jakaś jest zaznaczona").
// Stabilność: modyfikatory ustrukturyzowane w data/characters.json#stabilityLevels[].modifiers
// (NIE parsowane z tekstu `effect` w locie - zbyt kruche), dwa rodzaje: `complications` (stosowany
// tylko przy rollType "complication") i `moves.<moveId>` (stosowany tylko gdy rzut ma dany moveId -
// obejmuje to zarówno rzuty z mandali cech, jak i Atuty/Komplikacje, które akurat odpowiadają
// konkretnemu Ruchowi z listy).

import { rollKultTest } from "./utils.js";

export function computeWoundPenalty(wounds) {
    const hasSerious = wounds.serious.some(w => w.checked);
    const hasCritical = wounds.critical.checked;
    if (hasSerious && hasCritical) return -2;
    if (hasSerious || hasCritical) return -1;
    return 0;
}

/**
 * @param {object} opts
 * @param {object} opts.gameData - pełne dane (potrzebne characters.stabilityLevels)
 * @param {object} opts.characterState - state.characters[key]
 * @param {number} opts.baseModifier - wartość cechy / +0 dla Atutu-Pasywny-nie-dotyczy / itd.
 * @param {string|null} [opts.moveId] - id Ruchu z data/moves.json, jeśli rzut mu odpowiada
 * @param {"attribute"|"ability"|"complication"|"free"} opts.rollType
 */
export function performRoll({ gameData, characterState, baseModifier, moveId = null, rollType }) {
    const notes = [];
    let modifier = baseModifier;

    const woundPenalty = computeWoundPenalty(characterState.wounds);
    if (woundPenalty) {
        modifier += woundPenalty;
        notes.push(`Rany ${woundPenalty}`);
    }

    const level = gameData.characters.stabilityLevels.find(l => l.value === characterState.stability);
    if (level?.modifiers) {
        if (rollType === "complication" && level.modifiers.complications) {
            modifier += level.modifiers.complications;
            notes.push(`Stabilność (${level.label}) ${level.modifiers.complications}`);
        }
        if (moveId && level.modifiers.moves?.[moveId] != null) {
            const amount = level.modifiers.moves[moveId];
            modifier += amount;
            notes.push(`Stabilność (${level.label}) ${amount > 0 ? "+" : ""}${amount}`);
        }
    }

    const result = rollKultTest({ modifier });
    return { ...result, baseModifier, modifierNotes: notes };
}
