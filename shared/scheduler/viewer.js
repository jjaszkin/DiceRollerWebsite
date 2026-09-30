// Terminy - wspólny moduł (DiceRollerWebsite/shared/scheduler/). Widok dla GRACZA: własny
// kalendarz jednego uczestnika, klikalny - pierwszy klik na zielono ("mogę"), drugi na żółto
// ("być może"), trzeci przywraca stan domyślny (patrz core.js#cycleAvailability). Gracz widzi
// WYŁĄCZNIE swój kalendarz, bez podglądu głosów innych - to ma dopiero MG (patrz
// control-panel.js), zgodnie z tym, o co poprosił user.
//
// Czyste funkcje - projekt (patrz darkgraal3dashboard/js/panels/terminy.js) wpina je we WŁASNY
// render i dispatch akcji, ten moduł nie zna Firebase ani konkretnego kształtu projektu poza tym,
// co dostaje jawnie w `ctx`/argumentach (ten sam kontrakt co control-panel.js).

import { renderMonthTableHtml, todayIso } from "./calendar.js";
import { statusFor, cycleAvailability } from "./core.js";

/** Buduje HTML całej zakładki Terminy widocznej dla gracza.
 *  @param {object} ctx - { state, ... } (patrz store.js#getState)
 *  @param {object} opts
 *  @param {{year:number, month:number}[]} opts.months - miesiące do pokazania (data/scheduler.json)
 *  @param {string} opts.participantKey - klucz TEGO gracza w state.scheduler.availability
 */
export function buildSchedulerViewerHtml(ctx, { months, participantKey }) {
    const { state } = ctx;
    const today = todayIso();
    const monthsHtml = months.map(({ year, month }) =>
        renderMonthTableHtml(year, month, (dateIso) => statusFor(state, participantKey, dateIso), {
            clickable: true,
            todayIsoStr: today
        })
    ).join("");

    return `
        <h2>Terminy</h2>
        <p class="placeholder">Zaznacz dni, w które możesz grać. Klik: 1x mogę (zielony), 2x być może
            (żółty), 3x wyczyść.</p>
        <div class="sched-legend">
            <span class="sched-legend-item"><span class="sched-swatch sched-yes"></span> Mogę</span>
            <span class="sched-legend-item"><span class="sched-swatch sched-maybe"></span> Być może</span>
        </div>
        <div class="sched-months">${monthsHtml}</div>
    `;
}

/** Obsługuje akcje zakładki Terminy po stronie gracza. Zwraca `true`, jeśli akcja została
 *  rozpoznana i obsłużona (wywołujący powinien wtedy przerwać dalsze przetwarzanie i wywołać swój
 *  rerender), inaczej `false`. */
export function handleSchedulerViewerAction(action, el, ctx, participantKey) {
    if (action === "sched-cycle") {
        cycleAvailability(ctx, participantKey, el.dataset.date);
        return true;
    }
    return false;
}
