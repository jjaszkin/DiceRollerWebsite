// Hysteria Highest - Dashboard. Renderowanie pojedynczej karty tarota (rewers/awers, klik = modal
// z pełnym opisem na środku ekranu) - używane przez panels/tarot.js i panels/mg.js. Widok Gracza
// NIE pokazuje nazwy na samej karcie (tylko w modalu, patrz opcja `showName`) - widok MG pokazuje
// nazwę zawsze, żeby MG orientował się bez klikania każdej karty.

import { escapeHtml } from "./utils.js";
import { openModal } from "./modal.js";

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

export function cardModalBodyHtml(card) {
    const kicker = card.house ? HOUSE_LABELS[card.house] : CATEGORY_LABELS[card.category];
    return `
        <img class="modal-body-img" src="${card.image}" alt="${escapeHtml(card.name)}">
        <div class="card-tooltip-kicker">${escapeHtml(kicker || "")}</div>
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

export function openCardModal(cards, key) {
    const card = findCard(cards, key);
    if (!card) return;
    openModal({ title: card.name, bodyHtml: cardModalBodyHtml(card) });
}

/**
 * Buduje znacznik pojedynczej karty (awers, klikalny -> modal z opisem). `size`: "sm" (chip w
 * liście postaci) | "md" (krzyż) | "lg" (podgląd MG). `showName`: false u Graczy (nazwa tylko w
 * modalu), true u MG. Puste sloty (key === null) renderują placeholder.
 */
export function renderCard(cards, key, { size = "md", faceDown = false, showName = true } = {}) {
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
        <button type="button" class="tarot-card tarot-card-${size}" data-action="open-card" data-card-key="${key}">
            <div class="tarot-card-face">
                <img class="tarot-card-img" src="${card.image}" alt="${escapeHtml(card.name)}" loading="lazy" onerror="this.parentElement.parentElement.classList.add('tarot-card-img-missing')">
                ${showName ? `<span class="tarot-card-label">${escapeHtml(card.name)}</span>` : ""}
            </div>
        </button>
    `;
}
