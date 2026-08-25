// Hysteria Highest - Dashboard. Zakładka Tor Boskości (widok Gracza) - podgląd postępu wszystkich
// 8 postaci. Absolwenci: 4 kroki do Oświecenia. Strażnicy: 7 kroków do Boskości. Ruch napędzany
// wydawaniem kart z krzyża tarota (patrz panels/mg.js) - tu tylko odczyt.

import { escapeHtml } from "../utils.js";

const ROLE_LABELS = { absolwent: "Absolwenci", straznik: "Strażnicy" };
const GOAL_LABELS = { absolwent: "Oświecenie", straznik: "Boskość" };

function renderTrack(charDef, charState) {
    const steps = charDef.divinitySteps;
    const progress = charState.divinityProgress;
    const pips = Array.from({ length: steps }, (_, i) =>
        `<span class="divinity-pip ${i < progress ? "filled" : ""}"></span>`
    ).join("");
    return `
        <div class="divinity-row">
            <span class="divinity-row-name">${escapeHtml(charDef.name)}</span>
            <div class="divinity-track">${pips}</div>
            <span class="divinity-row-progress">${progress}/${steps}</span>
        </div>
    `;
}

function buildHtml({ state, data }) {
    const groups = ["absolwent", "straznik"].map(role => {
        const chars = data.characters.characters.filter(c => c.role === role);
        return `
            <section class="divinity-group">
                <h3 class="panel-subtitle">${ROLE_LABELS[role]} <span class="divinity-goal">→ ${GOAL_LABELS[role]}</span></h3>
                ${chars.map(c => renderTrack(c, state.characters[c.key])).join("")}
            </section>
        `;
    }).join("");

    return `<div class="divinity-layout">${groups}</div>`;
}

export function render(root, ctx) {
    root.innerHTML = buildHtml(ctx);
}
