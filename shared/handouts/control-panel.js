// Handouty - wspólny moduł (DiceRollerWebsite/shared/handouts/). Panel sterowania dla MG: siatka
// miniaturek (2 w wierszu, patrz generate-manifest.js dla budowania katalogu z folderu handouts/),
// w kolejności, którą MG sam ustawia (uchwyt/strzałki/drag&drop - patrz state.handouts.order) -
// TA SAMA kolejność (od góry w dół) jest tym, co widzą gracze (patrz viewer.js), więc przestawienie
// karty tutaj przestawia ją też u nich. Ikonka oka przełącza widoczność dla graczy, niezależnie od
// kolejności. Klik w miniaturkę powiększa (patrz zoom.js), ze strzałkami poprzedni/następny po
// całym (uporządkowanym) katalogu MG - niezależnie od tego, co akurat jest widoczne dla graczy.
//
// Czyste funkcje w konwencji panels/journal.js z darkgraal3dashboard (buildXHtml/handleXAction) -
// projekt wpina je we WŁASNY render i dispatch akcji (klik + drag&drop), ten moduł nie zna Firebase
// ani konkretnego kształtu projektu poza tym, co dostaje jawnie w `ctx`:
//   ctx.state.handouts  - { visible: {[key]: true}, order: string[] }
//   ctx.data.handouts   - katalog: [{ key, name, file, number }]
//   ctx.updateState(fn) - mutator stanu danego projektu (patrz store.js#updateState)

import { getZoomKey, openZoom, closeZoom, buildZoomOverlayHtml } from "./zoom.js";

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function ensureHandoutsState(state) {
    if (!state.handouts) state.handouts = { visible: {}, order: [] };
    if (!state.handouts.visible) state.handouts.visible = {};
    if (!state.handouts.order) state.handouts.order = [];
    return state.handouts;
}

/** Sortuje `catalog` wg state.handouts.order (od góry w dół) - wpisy spoza `order` (np. świeżo
 *  wgrany plik, zanim MG choć raz go przesunie) lądują na końcu, posortowane malejąco po numerze
 *  z nazwy pliku jako rozsądny domyślny porządek. */
function applyOrder(catalog, order) {
    const orderIndex = new Map((order || []).map((k, i) => [k, i]));
    return [...catalog].sort((a, b) => {
        const ai = orderIndex.has(a.key) ? orderIndex.get(a.key) : Infinity;
        const bi = orderIndex.has(b.key) ? orderIndex.get(b.key) : Infinity;
        if (ai !== bi) return ai - bi;
        return b.number - a.number;
    });
}

/** Otwarte oko (widoczny dla graczy) / oko przekreślone (ukryty) - jako inline SVG (nie emoji),
 *  żeby przekreślenie renderowało się identycznie na każdej platformie i dało się pomalować na
 *  kolor motywu przez `currentColor`. */
function eyeIconSvg(visible) {
    return `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/>
            <circle cx="12" cy="12" r="3"/>
            ${visible ? "" : `<line x1="2" y1="2" x2="22" y2="22"/>`}
        </svg>
    `;
}

function renderHandoutCard(entry, state) {
    const visible = !!state?.handouts?.visible?.[entry.key];
    return `
        <div class="ho-card" draggable="true" data-key="${entry.key}" data-reorder-scope="ho-main">
            <div class="ho-card-head">
                <span class="ho-card-handle" title="Przeciągnij, żeby zmienić kolejność">☰</span>
                <span class="ho-card-order-buttons">
                    <button type="button" class="btn btn-xs" data-action="ho-move-entry" data-key="${entry.key}" data-dir="up">↑</button>
                    <button type="button" class="btn btn-xs" data-action="ho-move-entry" data-key="${entry.key}" data-dir="down">↓</button>
                </span>
            </div>
            <button type="button" class="ho-thumb-btn" data-action="ho-zoom" data-key="${entry.key}">
                <img class="ho-thumb" src="${escapeHtml(entry.file)}" alt="${escapeHtml(entry.name)}" loading="lazy">
            </button>
            <button type="button" class="ho-eye-btn ${visible ? "ho-eye-visible" : ""}"
                data-action="ho-toggle-visible" data-key="${entry.key}"
                title="${visible ? "Ukryj przed graczami" : "Pokaż graczom"}" aria-label="Przełącz widoczność">${eyeIconSvg(visible)}</button>
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
    const sorted = applyOrder(catalog, ctx.state?.handouts?.order);
    const zoomIdx = sorted.findIndex(e => e.key === getZoomKey());
    const zoomEntry = zoomIdx === -1 ? null : sorted[zoomIdx];
    return `
        <div class="card ho-module">
            <h3>Handouty</h3>
            <div class="ho-grid">${sorted.map(e => renderHandoutCard(e, ctx.state)).join("")}</div>
        </div>
        ${buildZoomOverlayHtml(zoomEntry, zoomIdx > 0, zoomIdx !== -1 && zoomIdx < sorted.length - 1)}
    `;
}

/** Kolejność "od zera" (żaden wpis jeszcze nie przesunięty) - TA SAMA, którą widać na ekranie
 *  dzięki tiebreakowi w applyOrder (numer malejąco). Używana do DOPEŁNIANIA state.handouts.order o
 *  nowe/nieuporządkowane klucze - gdyby zamiast tego dopełniać surową kolejnością z katalogu
 *  (kolejność plików z generate-manifest.js, czyli alfabetyczna), pierwsze przesunięcie
 *  "przeskakiwałoby" wpis w zupełnie inne miejsce niż to, które MG właśnie widział na ekranie. */
function seedOrder(catalog) {
    return applyOrder(catalog, []).map(e => e.key);
}

/** Jak reorderPlaylistEditorTrack w shared/soundboard/, ale dla state.handouts.order - w
 *  odróżnieniu od tamtego (lokalny szkic edytora), to od razu pisze do stanu (kolejność Handoutów
 *  nie ma kroku "Zapisz"). Wywołuj z obsługi natywnego "drop" w projekcie. */
export function reorderHandoutsOrder(ctx, fromKey, toKey) {
    if (fromKey === toKey) return;
    const { updateState } = ctx;
    const seed = seedOrder(ctx.data?.handouts || []);
    updateState((state) => {
        const handouts = ensureHandoutsState(state);
        const order = handouts.order.length ? [...handouts.order] : [];
        for (const k of seed) if (!order.includes(k)) order.push(k);
        const fromIdx = order.indexOf(fromKey);
        const toIdx = order.indexOf(toKey);
        if (fromIdx === -1 || toIdx === -1) return;
        order.splice(fromIdx, 1);
        order.splice(order.indexOf(toKey), 0, fromKey);
        handouts.order = order;
    });
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
            if (handouts.visible[key]) delete handouts.visible[key];
            else handouts.visible[key] = true;
        });
        return true;
    }

    if (action === "ho-move-entry") {
        const key = el.dataset.key;
        const dir = el.dataset.dir;
        const seed = seedOrder(ctx.data?.handouts || []);
        updateState((state) => {
            const handouts = ensureHandoutsState(state);
            const order = handouts.order.length ? [...handouts.order] : [];
            for (const k of seed) if (!order.includes(k)) order.push(k);
            const idx = order.indexOf(key);
            const swapWith = dir === "up" ? idx - 1 : idx + 1;
            if (swapWith < 0 || swapWith >= order.length) return;
            [order[idx], order[swapWith]] = [order[swapWith], order[idx]];
            handouts.order = order;
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

    if (action === "ho-zoom-prev" || action === "ho-zoom-next") {
        const catalog = ctx.data?.handouts || [];
        const sorted = applyOrder(catalog, ctx.state?.handouts?.order);
        const idx = sorted.findIndex(e => e.key === getZoomKey());
        if (idx === -1) return true;
        const nextIdx = action === "ho-zoom-prev" ? idx - 1 : idx + 1;
        if (nextIdx < 0 || nextIdx >= sorted.length) return true;
        openZoom(sorted[nextIdx].key);
        return true;
    }

    return false;
}
