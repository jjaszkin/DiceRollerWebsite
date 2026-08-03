// GLIDE: Part Two — dopisywanie rzutów do historii (używane przez roller, questy, exhaustion itd.)
import { updateState } from "./store.js";
import { uid, formatTimestamp } from "./utils.js";

/**
 * Dodaje wpis do historii rzutów, otagowany aktualnym dniem gry.
 * @param {string} table - nazwa tabeli/rzutu (np. "Challenge Roll", "Desert — Landmarks")
 * @param {string} rollText - opis samego rzutu kośćmi (np. "d100: 42")
 * @param {string} resultText - pełny tekst efektu/wyniku
 */
export function logRoll(table, rollText, resultText) {
    updateState((state) => {
        state.rollHistory.push({
            id: uid(),
            day: state.day.current,
            table,
            rollText,
            resultText,
            ts: formatTimestamp(),
            at: Date.now()
        });
    });
}
