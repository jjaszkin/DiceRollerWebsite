// Hysteria Highest - Dashboard. Renderowanie pojedynczej karty tarota (rewers/awers + tooltip po
// hover z pełnym opisem) - używane przez panels/tarot.js, panels/character.js i panels/mg.js, żeby
// nie duplikować znacznika w trzech miejscach. Tooltip jest czystym CSS-em (:hover), więc przeżywa
// pełny rebuild innerHTML panelu bez potrzeby ponownego podpinania listenerów.

import { escapeHtml } from "./utils.js";

const HOUSE_LABELS = {
    czaszki: "Czaszki — Dom Śmierci i Metropolis",
    roze: "Róże — Dom Namiętności i Gai",
    klepsydry: "Klepsydry — Dom Czasu i Przestrzeni",
    oczy: "Oczy — Dom Iluzji i Elizjum",
    polksiezyce: "Półksiężyce — Dom Snów i Limbo"
};

const CATEGORY_LABELS = {
    super: "Super Arkana",
    archont: "Archont",
    aniol: "Anioł Śmierci",
    mala: "Mały Arkan"
};

function detailRow(label, value) {
    if (!value) return "";
    return `<div class="card-tooltip-row"><b>${label}:</b> ${escapeHtml(value)}</div>`;
}

export function cardTooltipHtml(card) {
    const kicker = card.house ? HOUSE_LABELS[card.house] : CATEGORY_LABELS[card.category];
    return `
        <div class="card-tooltip-kicker">${escapeHtml(kicker || "")}</div>
        <div class="card-tooltip-name">${escapeHtml(card.name)}</div>
        ${card.subtitle ? `<div class="card-tooltip-subtitle">${escapeHtml(card.subtitle)}</div>` : ""}
        ${card.desc ? `<div class="card-tooltip-desc">${escapeHtml(card.desc)}</div>` : `
            ${detailRow("Postacie", card.postacie)}
            ${detailRow("Miejsca", card.miejsca)}
            ${detailRow("Organizacje", card.organizacje)}
            ${detailRow("Zdarzenia", card.zdarzenia)}
            ${detailRow("Stworzenia", card.stworzenia)}
            ${detailRow("Przedmioty", card.przedmioty)}
        `}
    `;
}

/** Znajduje kartę po kluczu w gameData.cards. */
export function findCard(cards, key) {
    return cards.find(c => c.key === key) || null;
}

/**
 * Buduje znacznik pojedynczej karty (awers, z tooltipem po hover). `size`: "sm" (chip w liście
 * postaci) | "md" (krzyż) | "lg" (podgląd MG). Puste sloty (key === null) renderują placeholder.
 */
export function renderCard(cards, key, { size = "md", faceDown = false } = {}) {
    if (!key) {
        return `<div class="tarot-card tarot-card-empty tarot-card-${size}"></div>`;
    }
    const card = findCard(cards, key);
    if (!card) {
        return `<div class="tarot-card tarot-card-empty tarot-card-${size}">?</div>`;
    }
    if (faceDown) {
        return `<div class="tarot-card tarot-card-back tarot-card-${size}"></div>`;
    }
    return `
        <div class="tarot-card tarot-card-${size}" data-card-key="${key}">
            <div class="tarot-card-face">
                <img class="tarot-card-img" src="${card.image}" alt="${escapeHtml(card.name)}" loading="lazy" onerror="this.parentElement.parentElement.classList.add('tarot-card-img-missing')">
                <span class="tarot-card-label">${escapeHtml(card.name)}</span>
            </div>
            <div class="card-tooltip">${cardTooltipHtml(card)}</div>
        </div>
    `;
}
