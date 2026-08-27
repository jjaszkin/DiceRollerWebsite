// Hysteria Highest - Dashboard. Renderowanie treści modala z opisem/mechaniką - wspólne dla widoku
// Gracza (panels/character.js) i MG (panels/mg.js), żeby nie duplikować tego samego HTML-a w dwóch
// miejscach (jak było wcześniej, z komentarzem "1:1 z panels/character.js").

import { escapeHtml, renderMoveText } from "./utils.js";

/** Atut/Komplikacja/Ruch - attr (jeśli jest) + intro + tiery 15+/10-14/-9 (jeśli są). */
export function mechanicsBodyHtml(item) {
    return `
        ${item.attr ? `<div class="card-tooltip-kicker">${escapeHtml(item.attr)}</div>` : ""}
        <div class="card-tooltip-desc">${escapeHtml(item.intro || "")}</div>
        ${item.high ? `<div class="card-tooltip-row"><b>15+:</b></div>${renderMoveText(item.high)}` : ""}
        ${item.mid ? `<div class="card-tooltip-row"><b>10-14:</b></div>${renderMoveText(item.mid)}` : ""}
        ${item.low ? `<div class="card-tooltip-row"><b>≤9:</b></div>${renderMoveText(item.low)}` : ""}
    `;
}

/** Mroczny Sekret - intro + "Proponowane motywacje" (bez tierów, bo Sekrety nie mają Ruchu/rzutu). */
export function darkSecretBodyHtml(item) {
    const motywacje = (item.motywacje || []).map(m => `<div class="card-tooltip-row">◊ ${escapeHtml(m)}</div>`).join("");
    return `
        <div class="card-tooltip-desc">${escapeHtml(item.intro || "")}</div>
        ${motywacje ? `<div class="card-tooltip-row"><b>Proponowane motywacje:</b></div>${motywacje}` : ""}
    `;
}
