// Dark Graal III - Dashboard Solo (MG). Dopisywanie zdarzeń fabularnych/mechanicznych do dziennika
// (state.events): zmiany Rozpaczy, Ran, Błogosławieństwa, modyfikatory Archetypów, użycia Mocy,
// zmiany Kości Graala/Wiatru Camelotu, notatki MG. Odpowiednik glide2solo#eventLog.js - panel
// journal.js łączy ten strumień z rollLog.js (i wolnymi notatkami) w jedną chronologię.
import { uid, formatTimestamp } from "./utils.js";

/** Etykiety kategorii zdarzeń używane przy renderowaniu w panels/journal.js. */
export const EVENT_TYPE_LABELS = {
    "despair-change": "Zmiana Rozpaczy",
    "wound-change": "Zmiana Ran",
    "blessing-change": "Błogosławieństwo Merlina",
    "modifier-added": "Dodano modyfikator",
    "modifier-removed": "Usunięto modyfikator",
    "modifier-toggled": "Modyfikator włączony/wyłączony",
    "power-used": "Użyto Mocy",
    "power-usage-reset": "Reset użyć Mocy",
    "item-power-used": "Użycie mocy przedmiotu",
    "graal-dice-change": "Kości Graala",
    "camp-wind-change": "Wiatr Camelotu",
    "equipment-change": "Zmiana ekwipunku",
    "equipment-used": "Użycie przedmiotu",
    "equipment-disabled": "Wygaszenie przedmiotu",
    "character-edited": "Edycja karty postaci",
    "journal-note": "Notatka MG"
};

/** Dopisuje zdarzenie do state.events (mutuje przekazany state - wywołujący MUSI sam wywołać
 *  touch() po swojej stronie, tak jak w glide2solo). `type` - jeden z kluczy EVENT_TYPE_LABELS. */
export function logEvent(state, type, text) {
    if (!state.events) state.events = [];
    state.events.push({
        id: uid(),
        type,
        text,
        ts: formatTimestamp(),
        at: Date.now()
    });
}
