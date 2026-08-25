// Hysteria Highest - Dashboard. Logika puli talii tarota: raz dobrana karta NIE wraca (trwały stos
// odrzuconych - potwierdzone przez usera), więc "dobrana" = na krzyżu LUB w ręku którejś postaci
// LUB w state.deck.discardKeys (wydana na Torze Boskości). state.deck.activeStage steruje, które
// kategorie kart MG w ogóle może dobierać: 1 = same Małe Arkana (etap startowy sezonu), 2 = +
// Archonci/Anioły Śmierci, 3 = + Super Arkana - potwierdzone przez usera.

import { CROSS_POSITIONS } from "./state.js";
import { findCard } from "./cardView.js";

export function getDrawnKeySet(state) {
    const keys = new Set(state.deck.discardKeys);
    for (const pos of CROSS_POSITIONS) {
        if (state.cross[pos]) keys.add(state.cross[pos]);
    }
    for (const charState of Object.values(state.characters)) {
        for (const k of charState.cards) keys.add(k);
    }
    return keys;
}

export function getAvailableCards(state, gameData) {
    const drawn = getDrawnKeySet(state);
    return gameData.cards.filter(c => c.stage <= state.deck.activeStage && !drawn.has(c.key));
}

export function drawRandomCard(state, gameData) {
    const available = getAvailableCards(state, gameData);
    if (!available.length) return null;
    return available[Math.floor(Math.random() * available.length)];
}

/** Trzy karty dają x2 na Torze Boskości TYLKO jeśli wszystkie są Małymi Arkanami z tego samego
 *  domu (potwierdzone przez usera - Super Arkana/Archonci/Anioły Śmierci nigdy nie dają bonusu, i
 *  na obecnym etapie sezonu i tak nie ma ich jeszcze w talii). */
export function isHouseMatch(gameData, keys) {
    if (keys.length !== 3) return false;
    const cards = keys.map(k => findCard(gameData.cards, k));
    if (cards.some(c => !c || c.category !== "mala")) return false;
    const house = cards[0].house;
    return cards.every(c => c.house === house);
}
