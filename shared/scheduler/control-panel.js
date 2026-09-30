// Terminy - wspólny moduł (DiceRollerWebsite/shared/scheduler/). Panel sterowania dla MG: lista
// rankingowa dni posortowana wg liczby głosów "mogę" (potem "być może"), z imionami uczestników
// przy każdym dniu, pokazująca WYŁĄCZNIE dni z co najmniej jednym głosem (potwierdzone przez usera -
// unika listy zdominowanej samymi zerami). Pod listą - własny, klikalny kalendarz MG (ten sam
// komponent co viewer.js po stronie gracza, participantKey stały: "mg") - MG też głosuje, i jego
// głos liczy się do rankingu na równi z graczami (patrz aggregateForDate w core.js, wywoływane z
// pełną listą `participants` włącznie z MG).
//
// Czyste funkcje w konwencji shared/handouts/control-panel.js - projekt wpina je we WŁASNY render i
// dispatch akcji, ten moduł nie zna Firebase ani konkretnego kształtu projektu poza tym, co dostaje
// jawnie w `ctx`/argumentach:
//   ctx.state.scheduler.availability - patrz core.js
//   ctx.updateState(fn)              - mutator stanu danego projektu (patrz store.js#updateState)

import { renderMonthTableHtml, todayIso, datesInMonth, formatDateLong } from "./calendar.js";
import { statusFor, cycleAvailability, aggregateForDate } from "./core.js";

export const MG_PARTICIPANT_KEY = "mg";

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function namesHtml(list) {
    return list.map(p => escapeHtml(p.label)).join(", ");
}

/** Buduje listę { dateIso, yes, maybe } dla wszystkich dni z `months` (patrz core.js#aggregateForDate),
 *  odfiltrowaną do dni z co najmniej jednym głosem, posortowaną malejąco wg liczby "mogę", przy
 *  remisie wg liczby "być może", przy dalszym remisie chronologicznie. */
function buildRanking(state, months, participants) {
    const rows = [];
    for (const { year, month } of months) {
        for (const dateIso of datesInMonth(year, month)) {
            const { yes, maybe } = aggregateForDate(state, participants, dateIso);
            if (yes.length || maybe.length) rows.push({ dateIso, yes, maybe });
        }
    }
    rows.sort((a, b) =>
        b.yes.length - a.yes.length ||
        b.maybe.length - a.maybe.length ||
        a.dateIso.localeCompare(b.dateIso)
    );
    return rows;
}

function renderRankingRow(row) {
    return `
        <li class="sched-rank-row">
            <div class="sched-rank-date">${escapeHtml(formatDateLong(row.dateIso))}</div>
            <div class="sched-rank-counts">
                <span class="sched-rank-count sched-rank-yes">${row.yes.length} mogą${row.yes.length ? `: ${namesHtml(row.yes)}` : ""}</span>
                ${row.maybe.length ? `<span class="sched-rank-count sched-rank-maybe">${row.maybe.length} być może: ${namesHtml(row.maybe)}</span>` : ""}
            </div>
        </li>
    `;
}

/** Buduje HTML modułu "Terminy" do osadzenia w panelu MG (patrz darkgraal3dashboard/js/panels/mg.js).
 *  @param {object} ctx - { state, ... }
 *  @param {object} opts
 *  @param {{year:number, month:number}[]} opts.months - miesiące do pokazania (data/scheduler.json)
 *  @param {{key:string,label:string}[]} opts.participants - WSZYSCY głosujący (gracze + MG), do
 *      agregacji rankingu - patrz darkgraal3dashboard/js/panels/mg.js dla budowy tej listy.
 */
export function buildSchedulerControlHtml(ctx, { months, participants }) {
    const { state } = ctx;
    const ranking = buildRanking(state, months, participants);
    const today = todayIso();

    const rankingHtml = ranking.length
        ? `<ul class="sched-ranking">${ranking.map(renderRankingRow).join("")}</ul>`
        : `<p class="placeholder">Nikt jeszcze nie zaznaczył żadnego terminu.</p>`;

    const ownMonthsHtml = months.map(({ year, month }) =>
        renderMonthTableHtml(year, month, (dateIso) => statusFor(state, MG_PARTICIPANT_KEY, dateIso), {
            clickable: true,
            todayIsoStr: today
        })
    ).join("");

    return `
        <div class="card sched-module">
            <h3>Terminy - głosy graczy</h3>
            ${rankingHtml}
        </div>
        <div class="card sched-module">
            <h3>Terminy - Twoja dostępność (MG)</h3>
            <p class="placeholder">Zaznacz swoje dni tak samo jak gracze - liczą się do rankingu wyżej.</p>
            <div class="sched-legend">
                <span class="sched-legend-item"><span class="sched-swatch sched-yes"></span> Mogę</span>
                <span class="sched-legend-item"><span class="sched-swatch sched-maybe"></span> Być może</span>
            </div>
            <div class="sched-months">${ownMonthsHtml}</div>
        </div>
    `;
}

/** Obsługuje akcje modułu Terminy po stronie MG (własny kalendarz - patrz MG_PARTICIPANT_KEY).
 *  Zwraca `true`, jeśli akcja została rozpoznana i obsłużona. */
export function handleSchedulerControlAction(action, el, ctx) {
    if (action === "sched-cycle") {
        cycleAvailability(ctx, MG_PARTICIPANT_KEY, el.dataset.date);
        return true;
    }
    return false;
}
