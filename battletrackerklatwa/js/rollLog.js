// Battle Tracker - Klątwa Strahda. Historia rzutów/zdarzeń WSZYSTKICH walk jako płaska kolekcja
// na najwyższym poziomie stanu (state.rollHistory, każdy wpis otagowany battleId) - analogicznie
// do darkgraal3dashboard/js/rollLog.js + eventLog.js.
//
// Celowo NIE zagnieżdżona per-walka (battle.history): Firebase Realtime Database usuwa puste
// tablice/obiekty przy zapisie, więc `battle.history: []` znikało z bazy i po każdym
// przeładowaniu/echu zamieniało się w `undefined` - kolejne `battle.history.push(...)` rzucało
// wyjątkiem, przez co CAŁA aktualizacja stanu (wliczając już naniesione zmiany PW/formy w tej
// samej mutacji) nigdy nie docierała do zapisu. Płaski `state.rollHistory` na najwyższym poziomie
// jest chroniony przez uzupełnianie brakujących kluczy w state.js#mergeWithDefaults nawet gdy
// pusty - patrz też sanitizeForFirebase() w store.js jako dodatkowa siatka bezpieczeństwa.

import { uid } from "./utils.js";

export function logEntry(state, battleId, kind, text) {
    state.rollHistory ??= [];
    state.rollHistory.push({ id: uid(), battleId, at: Date.now(), kind, text });
}

export function entriesForBattle(state, battleId) {
    return (state.rollHistory || []).filter((e) => e.battleId === battleId);
}

export function removeEntry(state, entryId) {
    state.rollHistory = (state.rollHistory || []).filter((e) => e.id !== entryId);
}

/** Wołane przy usuwaniu całej walki - inaczej jej wpisy zostają w rollHistory na zawsze jako
 *  osierocone (nic ich już nie wyświetla, ale zaśmiecają bazę bez końca). */
export function removeAllForBattle(state, battleId) {
    state.rollHistory = (state.rollHistory || []).filter((e) => e.battleId !== battleId);
}
