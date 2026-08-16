// Dark Graal III - Dashboard Solo (MG). Zakładka Handouty (widok Gracza) - cienki wrapper wokół
// shared/handouts/viewer.js (czyste funkcje render/akcje, patrz komentarz na górze tego pliku),
// w tej samej konwencji montowania co panels/character.js i panels/roller.js. Strona MG ma
// odpowiednik w panels/mg.js (zakładka "Handouty" w widoku MG, siatka miniaturek + oko
// pokaż/ukryj + kolejność) - ten plik obsługuje wyłącznie stronę Gracza.

import { buildHandoutsViewerHtml, handleHandoutsViewerAction } from "../../../shared/handouts/viewer.js";
import { getZoomKey } from "../../../shared/handouts/zoom.js";

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
        if (handleHandoutsViewerAction(btn.dataset.action, btn, root._ctx)) {
            rerender(root);
        }
    });

    // Strzałki lewo/prawo przełączają powiększony handout - patrz analogiczny komentarz w
    // panels/mg.js. Na `document`, bo warstwa powiększenia nie musi mieć fokusu klawiatury.
    document.addEventListener("keydown", (e) => {
        if (!getZoomKey()) return;
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const action = e.key === "ArrowLeft" ? "ho-zoom-prev" : "ho-zoom-next";
        if (handleHandoutsViewerAction(action, { dataset: {} }, root._ctx)) rerender(root);
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
