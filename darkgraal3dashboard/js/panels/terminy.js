// Dark Graal III - Dashboard Solo (MG). Zakładka Terminy (widok Gracza) - cienki wrapper wokół
// shared/scheduler/viewer.js (czyste funkcje render/akcje), w tej samej konwencji montowania co
// panels/handouts.js. Uczestnik = postać aktualnie wybrana w gate'cie (session.characterKey) - każda
// z 4 postaci ma własną, niezależną dostępność. Strona MG ma odpowiednik w panels/mg.js (zakładka
// "Terminy" w widoku MG - ranking głosów + własny kalendarz MG) - ten plik obsługuje wyłącznie
// stronę Gracza.

import { updateState } from "../store.js";
import { buildSchedulerViewerHtml, handleSchedulerViewerAction } from "../../../shared/scheduler/viewer.js";

function buildHtml(ctx) {
    return buildSchedulerViewerHtml(ctx, { months: ctx.data.scheduler.months, participantKey: ctx.session.characterKey });
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
