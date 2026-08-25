// Hysteria Highest - Dashboard. Zakładka Tarot (widok Gracza) - krzyż, stos talii, lista 8
// postaci z kartami, które posiadają. Czysto do podglądu (hover = opis karty) - dobieranie i
// przenoszenie kart robi MG w panels/mg.js.

import { CROSS_POSITIONS } from "../state.js";
import { renderCard } from "../cardView.js";
import { getAvailableCards } from "../deck.js";
import { escapeHtml } from "../utils.js";

const POSITION_LABELS = { gorna: "Górna", dolna: "Dolna", lewa: "Lewa", prawa: "Prawa", srodkowa: "Środkowa" };

function buildHtml({ state, data }) {
    const cards = data.cards;
    const cross = CROSS_POSITIONS.map(pos => `
        <div class="cross-slot cross-slot-${pos}">
            <span class="cross-slot-label">${POSITION_LABELS[pos]}</span>
            ${renderCard(cards, state.cross[pos], { size: "md" })}
        </div>
    `).join("");

    const remaining = getAvailableCards(state, data).length;

    const characters = data.characters.characters.map(charDef => {
        const charState = state.characters[charDef.key];
        const heldCards = charState.cards.length
            ? charState.cards.map(k => renderCard(cards, k, { size: "sm" })).join("")
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
                <h3 class="panel-subtitle">Karty postaci</h3>
                ${characters}
            </div>
        </div>
    `;
}

export function render(root, ctx) {
    root.innerHTML = buildHtml(ctx);
}
