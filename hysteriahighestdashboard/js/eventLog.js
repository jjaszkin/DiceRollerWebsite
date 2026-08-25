// Hysteria Highest - Dashboard. Wspólny dziennik (rzuty + zdarzenia), jeden strumień pod
// state.log[] (najnowsze na początku, przycięte do 150 wpisów) - wzorzec z BRIEFING.md Dark Graala
// (rollLog.js + eventLog.js połączone w jednym widoku), tu uproszczone do jednego pliku/strumienia.

import { uid } from "./utils.js";

/** Loguje rzut (atrybut/Atut/Komplikacja/wolny). `entry`:
 *  { characterName: string|null, source: "attribute"|"ability"|"complication"|"free",
 *    label: string, result: {dice, modifier, total, tier}, tierLabel: string, resultText: string } */
export function logRoll(updateState, entry) {
    updateState(s => {
        if (!s.log) s.log = [];
        s.log.unshift({ id: uid(), timestamp: Date.now(), kind: "roll", ...entry });
        if (s.log.length > 150) s.log.length = 150;
    });
}

/** Loguje zdarzenie bez rzutu (dobranie/przeniesienie karty, zmiana postępu na Torze itp). */
export function logEvent(updateState, text) {
    updateState(s => {
        if (!s.log) s.log = [];
        s.log.unshift({ id: uid(), timestamp: Date.now(), kind: "event", text });
        if (s.log.length > 150) s.log.length = 150;
    });
}
