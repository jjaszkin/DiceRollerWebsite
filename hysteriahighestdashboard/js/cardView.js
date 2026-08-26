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
 * modalu), true u MG. Puste sloty (key === null) renderują placeholder. `removable`: true dodaje
 * mały "✕" w rogu (tylko panel MG - patrz panels/mg.js) z data-action="return-card" i atrybutami z
 * `removeData` - cofa kartę do talii (usuwa z bieżącego miejsca, NIE trafia do discardKeys).
 */
export function renderCard(cards, key, { size = "md", faceDown = false, showName = true, removable = false, removeData = {} } = {}) {
    if (!key) {
        return `<div class="tarot-card tarot-card-empty tarot-card-${size}"></div>`;
    }
    const card = findCard(cards, key);
    if (!card) {
        return `<div class="tarot-card tarot-card-empty tarot-card-${size}">?</div>`;
    }
    const cardEl = faceDown
        ? `<div class="tarot-card tarot-card-back tarot-card-${size}"></div>`
        : `
            <button type="button" class="tarot-card tarot-card-${size}" data-action="open-card" data-card-key="${key}">
                <div class="tarot-card-face">
                    <img class="tarot-card-img" src="${card.image}" alt="${escapeHtml(card.name)}" loading="lazy" onerror="this.parentElement.parentElement.classList.add('tarot-card-img-missing')">
                    ${showName ? `<span class="tarot-card-label">${escapeHtml(card.name)}</span>` : ""}
                </div>
            </button>
        `;
    if (!removable) return cardEl;
    const attrs = Object.entries(removeData).map(([k, v]) => `data-${k}="${escapeHtml(String(v))}"`).join(" ");
    return `
        <div class="tarot-card-slot">
            ${cardEl}
            <button type="button" class="tarot-card-remove-btn" data-action="return-card" ${attrs} title="Cofnij kartę do talii" aria-label="Cofnij kartę do talii">✕</button>
        </div>
    `;
}
