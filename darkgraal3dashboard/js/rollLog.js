// Dark Graal III - Dashboard Solo (MG). Dopisywanie testów (rzutów pulą k6) do historii -
// odpowiednik glide2solo#rollLog.js, samowystarczalny (sam woła updateState, w przeciwieństwie do
// eventLog.js).
import { updateState } from "./store.js";
import { uid, formatTimestamp, TEST_TIER_LABELS } from "./utils.js";

/**
 * Dodaje wpis do wspólnej historii testów.
 * @param {object} entry
 * @param {string} entry.characterKey - klucz postaci (np. "cadwyn")
 * @param {string} entry.characterName - wyświetlana nazwa postaci w chwili rzutu (np. "Sir Cadwyn")
 * @param {string} entry.archetypeKey - klucz użytego Archetypu (np. "rycerz")
 * @param {string} entry.archetypeLabel - etykieta Archetypu (np. "Rycerz")
 * @param {number} entry.archetypeDice - liczba kości z Archetypu (przed dorzuceniem Kości Graala)
 * @param {number} entry.graalDice - liczba dorzuconych Kości Graala
 * @param {number[]} entry.dice - pełny wynik rzutu (wszystkie kości puli, po ew. przerzutach/mocach)
 * @param {string} entry.tier - jeden z TEST_TIERS ("fullSuccess"|"success"|"complication"|"failure")
 * @param {string} [entry.note] - dodatkowy opis (np. nazwa użytej Mocy, kontekst testu)
 */
export function logRoll(entry) {
    updateState((state) => {
        state.rollHistory.push({
            id: uid(),
            characterKey: entry.characterKey,
            characterName: entry.characterName,
            archetypeKey: entry.archetypeKey,
            archetypeLabel: entry.archetypeLabel,
            archetypeDice: entry.archetypeDice,
            graalDice: entry.graalDice || 0,
            dice: entry.dice,
            tier: entry.tier,
            tierLabel: TEST_TIER_LABELS[entry.tier] || entry.tier,
            note: entry.note || "",
            ts: formatTimestamp(),
            at: Date.now()
        });
    });
}
