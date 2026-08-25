// Hysteria Highest - Dashboard. Zakładka Handouty (widok Gracza) - cienki wrapper wokół
// shared/handouts/viewer.js, ta sama konwencja co darkgraal3dashboard/js/panels/handouts.js.
// Manifest (data/handouts.json) budowany node shared/handouts/generate-manifest.js
// hysteriahighestdashboard przed pushem - nigdy z panelu.

import { buildHandoutsViewerHtml, handleHandoutsViewerAction } from "../../../shared/handouts/viewer.js";
import { getZoomKey, wireZoomPan } from "../../../shared/handouts/zoom.js";

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

    document.addEventListener("keydown", (e) => {
        if (!getZoomKey()) return;
        if (e.key === "Escape") {
            e.preventDefault();
            if (handleHandoutsViewerAction("ho-close-zoom", { dataset: {} }, root._ctx)) rerender(root);
            return;
        }
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const action = e.key === "ArrowLeft" ? "ho-zoom-prev" : "ho-zoom-next";
        if (handleHandoutsViewerAction(action, { dataset: {} }, root._ctx)) rerender(root);
    });

    wireZoomPan(root);
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx);
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
