// Handouty - wspólny moduł (DiceRollerWebsite/shared/handouts/). Widok dla graczy: pokazuje
// WYŁĄCZNIE handouty aktualnie oznaczone jako widoczne przez MG (patrz control-panel.js), w
// kolejności "ostatnio pokazany na górze" (sortowanie po state.handouts.lastShownAt, malejąco) -
// świadomie INNE niż stała kolejność numeryczna w gridzie MG, bo tu chodzi o to, żeby to, co MG
// właśnie odsłonił, było natychmiast widoczne bez przewijania. Klik w miniaturkę powiększa (patrz
// zoom.js), tak samo jak w panelu MG.
//
// Czyste funkcje - projekt (patrz darkgraal3dashboard/js/panels/handouts.js) wpina je we WŁASNY
// render i dispatch akcji, ten moduł nie zna Firebase ani konkretnego kształtu projektu poza tym,
// co dostaje jawnie w `ctx` (ten sam kontrakt co control-panel.js - state.handouts/data.handouts).

import { getZoomKey, openZoom, closeZoom, buildZoomOverlayHtml } from "./zoom.js";

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

/** Buduje HTML całej zakładki Handouty widocznej dla gracza. */
export function buildHandoutsViewerHtml(ctx) {
    const catalog = ctx.data?.handouts || [];
    const visible = ctx.state?.handouts?.visible || {};
    const lastShownAt = ctx.state?.handouts?.lastShownAt || {};

    const shown = catalog
        .filter(e => visible[e.key])
        .sort((a, b) => (lastShownAt[b.key] || 0) - (lastShownAt[a.key] || 0));

    const zoomEntry = shown.find(e => e.key === getZoomKey()) || null;

    return `
        <h2>Handouty</h2>
        ${shown.length ? `
            <div class="ho-viewer-list">
                ${shown.map(e => `
                    <button type="button" class="ho-viewer-item" data-action="ho-zoom" data-key="${e.key}">
                        <img class="ho-viewer-thumb" src="${escapeHtml(e.file)}" alt="${escapeHtml(e.name)}" loading="lazy">
                    </button>
                `).join("")}
            </div>
        ` : `<p class="placeholder">Mistrz Gry nie udostępnił jeszcze żadnych handoutów.</p>`}
        ${buildZoomOverlayHtml(zoomEntry)}
    `;
}

/** Obsługuje akcje zakładki Handouty po stronie gracza - patrz buildHandoutsControlHtml() w
 *  control-panel.js dla analogicznej funkcji po stronie MG (te same nazwy akcji celowo, bo to
 *  ten sam mechanizm powiększania - zoom.js). */
export function handleHandoutsViewerAction(action, el) {
    if (action === "ho-zoom") {
        openZoom(el.dataset.key);
        return true;
    }
    if (action === "ho-close-zoom") {
        closeZoom();
        return true;
    }
    return false;
}
