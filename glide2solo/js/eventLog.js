// GLIDE: Part Two — dopisywanie zdarzeń fabularnych/mechanicznych do dziennika (state.events):
// branie/kończenie questów (Guild Mission + Odd-Job), zdobywanie przedmiotów (Gear/Mody) i
// ulepszeń glidera, zdobywanie traitów (nagroda za cel) oraz zmiany statystyk postaci (H/K/R/C/F).
// Do tego dochodzi jednorazowe podsumowanie stanu postaci/glidera na początku nowego dnia
// (wołane przez main.js#setupCampButton). Odpowiednik rollLog.js, ale dla zdarzeń niebędących
// rzutem kością — panel journal.js łączy oba logi (i swobodne notatki) w jedną chronologię.
import { uid, formatTimestamp } from "./utils.js";

/** Etykiety kategorii zdarzeń używane przy renderowaniu w journal.js. */
export const EVENT_TYPE_LABELS = {
    "quest-start": "Quest — rozpoczęto",
    "quest-complete": "Quest — ukończono",
    "item-gained": "Zdobyto przedmiot",
    "glider-upgrade": "Ulepszenie glidera",
    "trait-gained": "Zdobyto trait",
    "stat-change": "Zmiana statystyki",
    "day-summary": "Nowy dzień — podsumowanie"
};

/** Dopisuje zdarzenie do state.events (mutuje przekazany state — wywołujący odpowiada za
 *  wywołanie touch() po swojej stronie, tak samo jak przy bezpośrednich mutacjach stanu).
 *  `type` — jeden z kluczy EVENT_TYPE_LABELS; `text` — gotowy, czytelny opis po polsku
 *  (może zawierać \n dla wielolinijkowych podsumowań, patrz buildDaySummaryText). */
export function logEvent(state, type, text) {
    if (!state.events) state.events = [];
    state.events.push({
        id: uid(),
        day: state.day.current,
        type,
        text,
        ts: formatTimestamp(),
        at: Date.now()
    });
}

/** Buduje tekst podsumowania stanu postaci i glidera na początku nowego dnia — wołane z
 *  main.js#setupCampButton PO inkrementacji state.day.current, żeby wpis otagował się
 *  właściwym (nowym) dniem. */
export function buildDaySummaryText(state) {
    const r = state.character.resources;
    const g = state.character.glider;
    return [
        `Postać — Stamina ${r.stamina.cur}/${r.stamina.max}, Momentum ${r.momentum.cur}/${r.momentum.max}, Intel ${r.intel.cur}/${r.intel.max}, Credits ${r.credits}, Fame ${r.fame}.`,
        `Glider — Wear ${g.wear.cur}/${g.wear.max}, Supply ${g.supply.cur}/${g.supply.max}, Speed ${g.speed.cur}/${g.speed.max}, Scrap ${g.scrap.cur}/${g.scrap.max}, Relics ${g.relics.cur}/${g.relics.max}.`
    ].join("\n");
}
