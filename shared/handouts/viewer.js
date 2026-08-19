// Handouty - wspólny moduł (DiceRollerWebsite/shared/handouts/). Widok dla graczy: pokazuje
// WYŁĄCZNIE handouty aktualnie oznaczone jako widoczne przez MG (patrz control-panel.js), w TEJ
// SAMEJ kolejności co siatka MG (state.handouts.order, ustawiana tam uchwytem/strzałkami/
// drag&drop) - kolejność MG od góry w dół definiuje kolejność u graczy wprost, jeden do jednego.
// Klik w miniaturkę powiększa (patrz zoom.js), ze strzałkami poprzedni/następny po liście
// widocznych handoutów (nie po całym katalogu - gracz nie wie o tych, których MG nie pokazał).
//
// Czyste funkcje - projekt (patrz darkgraal3dashboard/js/panels/handouts.js) wpina je we WŁASNY
// render i dispatch akcji, ten moduł nie zna Firebase ani konkretnego kształtu projektu poza tym,
// co dostaje jawnie w `ctx` (ten sam kontrakt co control-panel.js - state.handouts/data.handouts).

import { getZoomKey, getZoomedIn, openZoom, closeZoom, toggleZoomLevel, buildZoomOverlayHtml } from "./zoom.js";

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

/** Katalog filtrowany do widocznych, posortowany wg state.handouts.order (tak samo jak
 *  control-panel.js#applyOrder, ale bez potrzeby dorzucania nieposortowanych na koniec - wpisy
 *  spoza `order` i tak nie powinny się zdarzyć w praktyce, bo MG zawsze je widzi/przestawia w
 *  swojej siatce zanim cokolwiek udostępni, ale na wszelki wypadek też lądują na końcu). */
function visibleAndOrdered(catalog, handoutsState) {
    const visible = handoutsState?.visible || {};
    const order = handoutsState?.order || [];
    const orderIndex = new Map(order.map((k, i) => [k, i]));
    return catalog
        .filter(e => visible[e.key])
        .sort((a, b) => {
            const ai = orderIndex.has(a.key) ? orderIndex.get(a.key) : Infinity;
            const bi = orderIndex.has(b.key) ? orderIndex.get(b.key) : Infinity;
            return ai - bi;
        });
}

/** Buduje HTML całej zakładki Handouty widocznej dla gracza. */
export function buildHandoutsViewerHtml(ctx) {
    const catalog = ctx.data?.handouts || [];
    const shown = visibleAndOrdered(catalog, ctx.state?.handouts);

    const zoomIdx = shown.findIndex(e => e.key === getZoomKey());
    const zoomEntry = zoomIdx === -1 ? null : shown[zoomIdx];

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
        ${buildZoomOverlayHtml(zoomEntry, zoomIdx > 0, zoomIdx !== -1 && zoomIdx < shown.length - 1, getZoomedIn())}
    `;
}

/** Obsługuje akcje zakładki Handouty po stronie gracza - patrz handleHandoutsAction() w
 *  control-panel.js dla analogicznej funkcji po stronie MG (te same nazwy akcji celowo, bo to
 *  ten sam mechanizm powiększania - zoom.js). */
export function handleHandoutsViewerAction(action, el, ctx) {
    if (action === "ho-zoom") {
        openZoom(el.dataset.key);
        return true;
    }
    if (action === "ho-close-zoom") {
        closeZoom();
        return true;
    }
    if (action === "ho-zoom-toggle") {
        toggleZoomLevel();
        return true;
    }
    if (action === "ho-zoom-prev" || action === "ho-zoom-next") {
        const catalog = ctx.data?.handouts || [];
        const shown = visibleAndOrdered(catalog, ctx.state?.handouts);
        const idx = shown.findIndex(e => e.key === getZoomKey());
        if (idx === -1) return true;
        const nextIdx = action === "ho-zoom-prev" ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= shown.length) return true;
        openZoom(shown[nextIdx].key);
        return true;
    }
    return false;
}
