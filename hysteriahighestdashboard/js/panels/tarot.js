// Hysteria Highest - Dashboard. Zakładka Tarot (widok Gracza) - krzyż w lewej kolumnie, karty
// 8 postaci w prawej (2 kolumny x 4 wiersze, sparowane per gracz: Strażnik po lewej, Absolwent po
// prawej - kolejność wierszy = data.characters.pairs, patrz buildPairedCharacterRows). Karty NIE
// pokazują nazwy (tylko w modalu po kliknięciu, patrz cardView.js#openCardModal) - dobieranie i
// przenoszenie kart robi MG w panels/mg.js.

import { CROSS_POSITIONS } from "../state.js";
import { renderCard, openCardModal } from "../cardView.js";
import { getAvailableCards } from "../deck.js";
import { escapeHtml } from "../utils.js";

/** Zwraca postacie w kolejności [Strażnik pary1, Absolwent pary1, Strażnik pary2, ...] - nałożone
 *  na grid 2-kolumnowy z auto-flow wierszami daje dokładnie układ "Strażnicy po lewej, Absolwenci
 *  po prawej, sparowani per gracz w tym samym wierszu" (patrz PR). */
function buildPairedCharacterRows(data) {
    const byKey = Object.fromEntries(data.characters.characters.map(c => [c.key, c]));
    const ordered = [];
    for (const pair of data.characters.pairs) {
        const chars = pair.characters.map(k => byKey[k]);
        const straznik = chars.find(c => c.role === "straznik");
        const absolwent = chars.find(c => c.role === "absolwent");
        ordered.push(straznik, absolwent);
    }
    return ordered;
}

function buildHtml({ state, data }) {
    const cards = data.cards;
    const cross = CROSS_POSITIONS.map(pos => `
        <div class="cross-slot cross-slot-${pos}">
            ${renderCard(cards, state.cross[pos], { size: "md", showName: false })}
        </div>
    `).join("");

    const remaining = getAvailableCards(state, data).length;

    const characters = buildPairedCharacterRows(data).map(charDef => {
        const charState = state.characters[charDef.key];
        const heldCards = charState.cards.length
            ? charState.cards.map(k => renderCard(cards, k, { size: "sm", showName: false })).join("")
            : `<span class="placeholder-inline">brak kart</span>`;
        return `
            <div class="char-card-row">
                <span class="char-card-row-name">${escapeHtml(charDef.name)}</span>
                <div class="char-card-row-cards">${heldCards}</div>
            </div>
        `;
    }).join("");

    return `
        <div class="tarot-layout">
            <div class="tarot-cross-area">
                <div class="mystic-cross">${cross}</div>
                <div class="deck-status">
                    <div class="deck-stack">${renderCard(cards, "back", { size: "md", faceDown: true })}</div>
                    <span class="deck-count">Talia: ${remaining} kart dostępnych do dobrania</span>
                </div>
            </div>
            <div class="tarot-characters-area">
                <h3 class="panel-subtitle">Ręka postaci</h3>
                <div class="tarot-pairs-grid">${characters}</div>
            </div>
        </div>
    `;
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const cardBtn = e.target.closest('[data-action="open-card"]');
        if (cardBtn) openCardModal(root._ctx.data.cards, cardBtn.dataset.cardKey);
    });
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx);
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
