// Dark Graal III - Dashboard Solo (MG). Zakładka Terminy (widok Gracza) - cienki wrapper wokół
// shared/scheduler/viewer.js (czyste funkcje render/akcje), w tej samej konwencji montowania co
// panels/handouts.js. Uczestnik = postać aktualnie wybrana w gate'cie (session.characterKey) - każda
// z 4 postaci ma własną, niezależną dostępność. Pod własnym kalendarzem - widget "mapa dostępności"
// (shared/scheduler/heatmap.js), IDENTYCZNY jak w panels/mg.js (ta sama lista uczestników z
// state.js#schedulerParticipants) - widoczny dla wszystkich, nieklikalny, pokazuje natężeniem
// zieleni które dni są najlepsze z tooltipem kto zagłosował. Strona MG ma odpowiednik w panels/mg.js
// (zakładka "Terminy" w widoku MG - ranking głosów + własny kalendarz MG + ten sam widget) - ten plik
// obsługuje wyłącznie stronę Gracza.

import { updateState } from "../store.js";
import { schedulerParticipants } from "../state.js";
import { buildSchedulerViewerHtml, handleSchedulerViewerAction } from "../../../shared/scheduler/viewer.js";
import { buildSchedulerHeatmapHtml } from "../../../shared/scheduler/heatmap.js";

function buildHtml(ctx) {
    const months = ctx.data.scheduler.months;
    return `
        ${buildSchedulerViewerHtml(ctx, { months, participantKey: ctx.session.characterKey })}
        ${buildSchedulerHeatmapHtml(ctx, { months, participants: schedulerParticipants(ctx.state) })}
    `;
}

function rerender(root) {
    root.innerHTML = buildHtml(root._ctx);
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        if (handleSchedulerViewerAction(btn.dataset.action, btn, { ...root._ctx, updateState }, root._ctx.session.characterKey)) {
            rerender(root);
        }
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
