// GLIDE: Part Two — dopisywanie zdarzeń fabularnych/mechanicznych do dziennika (state.events):
// branie/kończenie questów (Misja Gildii + Fucha), zdobywanie przedmiotów (Sprzęt/Mody) i
// ulepszeń glidera, zdobywanie traitów (nagroda za cel) oraz zmiany statystyk postaci (H/K/R/C/F).
// Do tego dochodzi jednorazowe podsumowanie stanu postaci/glidera na początku nowego dnia
// (wołane przez main.js#setupCampButton). Odpowiednik rollLog.js, ale dla zdarzeń niebędących
// rzutem kością — panel journal.js łączy oba logi (i swobodne notatki) w jedną chronologię.
import { uid, formatTimestamp } from "./utils.js";

/** Etykiety kategorii zdarzeń używane przy renderowaniu w journal.js. */
export const EVENT_TYPE_LABELS = {
    "quest-start": "Fucha — rozpoczęto",
    "quest-complete": "Fucha — ukończono",
    "item-gained": "Zdobyto przedmiot",
    "glider-upgrade": "Ulepszenie glidera",
    "trait-gained": "Zdobyto Cechę",
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
        `Postać — Wytrzymałość ${r.stamina.cur}/${r.stamina.max}, Rozpęd ${r.momentum.cur}/${r.momentum.max}, Informacje ${r.intel.cur}/${r.intel.max}, Kredyty ${r.credits}, Sława ${r.fame}.`,
        `Glider — Zużycie ${g.wear.cur}/${g.wear.max}, Zasoby ${g.supply.cur}/${g.supply.max}, Prędkość ${g.speed.cur}/${g.speed.max}, Złom ${g.scrap.cur}/${g.scrap.max}, Relikty ${g.relics.cur}/${g.relics.max}.`
    ].join("\n");
}
