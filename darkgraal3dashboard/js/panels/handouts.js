// Dark Graal III - Dashboard Solo (MG). Zakładka Handouty (widok Gracza) - cienki wrapper wokół
// shared/handouts/viewer.js (czyste funkcje render/akcje, patrz komentarz na górze tego pliku),
// w tej samej konwencji montowania co panels/character.js i panels/roller.js. Strona MG ma
// odpowiednik w panels/mg.js (zakładka "Handouty" w widoku MG, siatka miniaturek + oko
// pokaż/ukryj) - ten plik obsługuje wyłącznie stronę Gracza.

import { buildHandoutsViewerHtml, handleHandoutsViewerAction } from "../../../shared/handouts/viewer.js";

function buildHtml(ctx) {
    return buildHandoutsViewerHtml(ctx);
}

function rerender(root) {
    root.innerHTML = buildHtml(root._ctx);
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        if (handleHandoutsViewerAction(btn.dataset.action, btn)) {
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
