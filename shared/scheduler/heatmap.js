// Terminy - wspólny moduł (DiceRollerWebsite/shared/scheduler/). Widget "mapa dostępności":
// NIEKLIKALNY (w sensie: nie zmienia dostępności) kalendarz widoczny dla WSZYSTKICH (gracze i MG) -
// natężenie zielonego tła dnia rośnie z liczbą osób, które mogą/być może mogą tego dnia. Kto
// konkretnie zagłosował pokazuje WŁASNY dymek (patrz wireHeatmapTooltip niżej) - CELOWO nie natywny
// atrybut `title`: ten nie działa w ogóle na dotyku (telefon/tablet - a stąd prawdopodobnie
// sprawdzana jest dostępność najczęściej), więc dymek pokazuje się i na hover (mysz), i na
// klik/tap (dotyk), żeby działało identycznie wszędzie.
//
// W odróżnieniu od viewer.js/control-panel.js ten widget nie zapisuje niczego do stanu - to czysty
// odczyt, więc brak funkcji handle*Action (dymek to czysto lokalny stan UI przeglądarki, jak
// zoom.js w shared/handouts/).
//
// Natężenie = (liczba "mogę" * 1 + liczba "być może" * 0.5) / liczba wszystkich uczestników,
// przycięte do [0,1] - skala BEZWZGLĘDNA (100% zieleni = wszyscy uczestnicy zagłosowali "mogę" tego
// dnia), nie względna do najlepszego dnia w okresie - dzięki temu kolor jednego dnia nie zmienia się
// w zależności od tego, co dzieje się w inne dni, i "3 z 5 osób mogą" zawsze wygląda tak samo
// niezależnie od reszty kalendarza.
//
// Czyste funkcje - projekt (patrz darkgraal3dashboard/js/panels/terminy.js i panels/mg.js) wpina je
// we WŁASNY render, ten moduł nie zna Firebase ani konkretnego kształtu projektu poza tym, co dostaje
// jawnie w `ctx`/argumentach (ten sam kontrakt co viewer.js/control-panel.js). `wireHeatmapTooltip(root)`
// wołane RAZ na stały `root` (przeżywa rerendery), jak shared/handouts/zoom.js#wireZoomPan.

import { buildMonthWeeks, monthLabel, formatDateLong, todayIso, WEEKDAY_LABELS_PL } from "./calendar.js";
import { aggregateForDate } from "./core.js";

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function clamp01(n) {
    return Math.max(0, Math.min(1, n));
}

/** Tekst dymka (patrz wireHeatmapTooltip - renderowany z `white-space: pre-line`, więc "\n" daje
 *  złamanie linii) - jedna linia z datą, potem (jeśli są) linie "Mogą: ..." / "Być może: ...". */
function buildTooltipText(dateIso, yes, maybe) {
    const lines = [formatDateLong(dateIso)];
    if (yes.length) lines.push(`Mogą: ${yes.map(p => p.label).join(", ")}`);
    if (maybe.length) lines.push(`Być może: ${maybe.map(p => p.label).join(", ")}`);
    if (!yes.length && !maybe.length) lines.push("Nikt jeszcze nie zagłosował.");
    return lines.join("\n");
}

function renderHeatmapCell(cell, state, participants, todayIsoStr) {
    if (!cell) return `<td class="sched-cell sched-cell-empty"></td>`;

    const { yes, maybe } = aggregateForDate(state, participants, cell.date);
    const score = yes.length + maybe.length * 0.5;
    const intensity = participants.length ? clamp01(score / participants.length) : 0;
    const isToday = todayIsoStr && cell.date === todayIsoStr;
    const tooltip = buildTooltipText(cell.date, yes, maybe);
    const style = intensity > 0 ? ` style="background-color: rgba(47, 125, 79, ${intensity.toFixed(2)});"` : "";

    return `
        <td class="sched-cell ${isToday ? "sched-today" : ""}">
            <div class="sched-day sched-heat-day" data-tooltip="${escapeHtml(tooltip)}"${style}>${cell.day}</div>
        </td>
    `;
}

function renderHeatmapMonthTableHtml(year, month, state, participants, todayIsoStr) {
    const weeks = buildMonthWeeks(year, month);
    const rowsHtml = weeks.map(week => `
        <tr>${week.map(cell => renderHeatmapCell(cell, state, participants, todayIsoStr)).join("")}</tr>
    `).join("");

    return `
        <table class="sched-month">
            <caption>${monthLabel(year, month)}</caption>
            <thead>
                <tr>${WEEKDAY_LABELS_PL.map(w => `<th>${w}</th>`).join("")}</tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

/** Buduje HTML widgetu "mapa dostępności" - sekcja do osadzenia na dole zakładki Terminy, identyczna
 *  dla graczy i MG (patrz darkgraal3dashboard/js/panels/terminy.js i panels/mg.js).
 *  @param {object} ctx - { state, ... }
 *  @param {object} opts
 *  @param {{year:number, month:number}[]} opts.months - miesiące do pokazania (data/scheduler.json)
 *  @param {{key:string,label:string}[]} opts.participants - WSZYSCY głosujący (gracze + MG)
 */
export function buildSchedulerHeatmapHtml(ctx, { months, participants }) {
    const { state } = ctx;
    const today = todayIso();
    const monthsHtml = months.map(({ year, month }) =>
        renderHeatmapMonthTableHtml(year, month, state, participants, today)
    ).join("");

    return `
        <div class="card sched-module">
            <h3>Terminy - mapa dostępności</h3>
            <p class="placeholder">Im intensywniejsza zieleń, tym więcej osób może dany dzień. Najedź na
                dzień (albo stuknij na telefonie), żeby zobaczyć kto konkretnie zagłosował.</p>
            <div class="sched-months">${monthsHtml}</div>
        </div>
    `;
}

let tooltipEl = null;
let tooltipOwnerCell = null;

function ensureTooltipEl() {
    if (tooltipEl) return tooltipEl;
    tooltipEl = document.createElement("div");
    tooltipEl.className = "sched-heat-tooltip";
    document.body.appendChild(tooltipEl);
    return tooltipEl;
}

/** Pozycjonuje dymek NAD komórką, wyśrodkowany poziomo - potem dociska go z powrotem w okno
 *  (lewa/prawa krawędź), gdyby wystawał poza viewport przy komórkach blisko brzegu (np. niedziela w
 *  wąskim układzie na telefonie). `position: fixed`, więc liczymy względem viewportu, nie strony. */
function positionTooltip(el, cellRect) {
    el.style.left = "0px";
    el.style.top = "0px";
    el.style.transform = "translate(0, 0)";
    const elRect = el.getBoundingClientRect();

    let left = cellRect.left + cellRect.width / 2 - elRect.width / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - elRect.width - 6));
    let top = cellRect.top - elRect.height - 8;
    if (top < 6) top = cellRect.bottom + 8; // za mało miejsca nad komórką (np. pierwszy wiersz) - pokaż pod spodem

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
}

function showTooltip(cell) {
    const el = ensureTooltipEl();
    el.textContent = cell.dataset.tooltip || "";
    el.classList.add("visible");
    positionTooltip(el, cell.getBoundingClientRect());
    tooltipOwnerCell = cell;
}

function hideTooltip() {
    if (tooltipEl) tooltipEl.classList.remove("visible");
    tooltipOwnerCell = null;
}

/** Podpina dymek mapy dostępności - hover (mysz) ORAZ klik/tap (dotyk, gdzie hover nie istnieje -
 *  patrz komentarz na górze pliku). Wywołaj RAZ na stały `root` (przeżywa rerendery, patrz
 *  darkgraal3dashboard/js/panels/terminy.js i panels/mg.js - ten sam wzorzec co wireZoomPan w
 *  shared/handouts/zoom.js). Działa przez delegację na `root`, bo komórki (`.sched-heat-day`) są
 *  niszczone i tworzone od nowa przy każdym rerenderze. */
export function wireHeatmapTooltip(root) {
    root.addEventListener("mouseover", (e) => {
        const cell = e.target.closest(".sched-heat-day");
        if (cell) showTooltip(cell);
    });

    root.addEventListener("mouseout", (e) => {
        const cell = e.target.closest(".sched-heat-day");
        if (cell && !cell.contains(e.relatedTarget)) hideTooltip();
    });

    root.addEventListener("click", (e) => {
        const cell = e.target.closest(".sched-heat-day");
        if (!cell) return;
        if (tooltipOwnerCell === cell) hideTooltip();
        else showTooltip(cell);
    });

    // Tap gdziekolwiek indziej na stronie zamyka dymek (na dotyku nie ma "mouseout" po zdjęciu palca).
    document.addEventListener("click", (e) => {
        if (tooltipOwnerCell && !e.target.closest(".sched-heat-day")) hideTooltip();
    });
}
