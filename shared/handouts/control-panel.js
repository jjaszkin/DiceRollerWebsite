// Handouty - wspólny moduł (DiceRollerWebsite/shared/handouts/). Panel sterowania dla MG: siatka
// miniaturek (2 w wierszu, patrz generate-manifest.js dla budowania katalogu z folderu handouts/),
// zawsze posortowana malejąco po numerze w nazwie pliku (najwyższy numer na górze) - stała,
// przewidywalna kolejność dla MG niezależnie od tego, co aktualnie pokazuje graczom. Ikonka oka
// przełącza widoczność dla graczy (patrz viewer.js po ich stronie) - ostatnio pokazany handout
// dostaje świeży `lastShownAt`, dzięki czemu skacze na górę listy graczy (ale NIE miesza kolejności
// tutaj, w gridzie MG). Klik w miniaturkę powiększa (patrz zoom.js), tak samo jak u graczy.
//
// Czyste funkcje w konwencji panels/journal.js z darkgraal3dashboard (buildXHtml/handleXAction) -
// projekt wpina je we WŁASNY render i dispatch akcji, ten moduł nie zna Firebase ani konkretnego
// kształtu projektu poza tym, co dostaje jawnie w `ctx`:
//   ctx.state.handouts  - { visible: {[key]: true}, lastShownAt: {[key]: epoch ms} }
//   ctx.data.handouts   - katalog: [{ key, name, file, number }]
//   ctx.updateState(fn) - mutator stanu danego projektu (patrz store.js#updateState)

import { getZoomKey, openZoom, closeZoom, buildZoomOverlayHtml } from "./zoom.js";

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function ensureHandoutsState(state) {
    if (!state.handouts) state.handouts = { visible: {}, lastShownAt: {} };
    if (!state.handouts.visible) state.handouts.visible = {};
    if (!state.handouts.lastShownAt) state.handouts.lastShownAt = {};
    return state.handouts;
}

function renderHandoutCard(entry, state) {
    const visible = !!state?.handouts?.visible?.[entry.key];
    return `
        <div class="ho-card">
            <button type="button" class="ho-thumb-btn" data-action="ho-zoom" data-key="${entry.key}">
                <img class="ho-thumb" src="${escapeHtml(entry.file)}" alt="${escapeHtml(entry.name)}" loading="lazy">
            </button>
            <button type="button" class="ho-eye-btn ${visible ? "ho-eye-visible" : ""}"
                data-action="ho-toggle-visible" data-key="${entry.key}"
                title="${visible ? "Ukryj przed graczami" : "Pokaż graczom"}" aria-label="Przełącz widoczność">👁</button>
            <div class="ho-card-name">${escapeHtml(entry.name)}</div>
        </div>
    `;
}

/** Buduje HTML modułu "Handouty" do osadzenia w panelu MG (jedna karta `.card`, jak reszta
 *  modułów panels/mg.js) - patrz darkgraal3dashboard/js/panels/mg.js#buildHtml(). */
export function buildHandoutsControlHtml(ctx) {
    const catalog = ctx.data?.handouts || [];
    if (!catalog.length) {
        return `
            <div class="card ho-module">
                <h3>Handouty</h3>
                <p class="placeholder">Brak obrazków w handouts/ - wgraj pliki i odpal
                    <code>node shared/handouts/generate-manifest.js &lt;projekt&gt;</code>, żeby zbudować katalog.</p>
            </div>
        `;
    }
    const sorted = [...catalog].sort((a, b) => b.number - a.number);
    const zoomEntry = catalog.find(e => e.key === getZoomKey()) || null;
    return `
        <div class="card ho-module">
            <h3>Handouty</h3>
            <div class="ho-grid">${sorted.map(e => renderHandoutCard(e, ctx.state)).join("")}</div>
        </div>
        ${buildZoomOverlayHtml(zoomEntry)}
    `;
}

/** Obsługuje akcje modułu Handouty - do wywołania z jednego delegowanego handlera (klik) w panelu
 *  MG danego projektu. Zwraca `true`, jeśli akcja została rozpoznana i obsłużona (wywołujący
 *  powinien wtedy przerwać dalsze przetwarzanie i wywołać swój rerender), inaczej `false`. */
export function handleHandoutsAction(action, el, ctx) {
    const { updateState } = ctx;

    if (action === "ho-toggle-visible") {
        const key = el.dataset.key;
        updateState((state) => {
            const handouts = ensureHandoutsState(state);
            if (handouts.visible[key]) {
                delete handouts.visible[key];
            } else {
                handouts.visible[key] = true;
                handouts.lastShownAt[key] = Date.now();
            }
        });
        return true;
    }

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
