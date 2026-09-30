// Terminy - wspólny moduł (DiceRollerWebsite/shared/scheduler/). Czysta matematyka
// dat/siatki kalendarza, bez żadnej wiedzy o Firebase, projekcie czy kształcie stanu gry - patrz
// core.js dla logiki dostępności (to jest odpowiednik oddzielenia zoom.js od
// control-panel.js/viewer.js w shared/handouts/).
//
// Tydzień zaczyna się od poniedziałku (potwierdzone przez usera - "pierwszy poniedziałek").

const WEEKDAY_LABELS_PL = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"];

const MONTH_LABELS_PL = [
    "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
    "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
];

// Dopełniacz (do formatDateLong, "5 października") - inny od mianownika użytego w monthLabel().
const MONTH_LABELS_GENITIVE_PL = [
    "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
    "lipca", "sierpnia", "września", "października", "listopada", "grudnia"
];

function pad2(n) {
    return String(n).padStart(2, "0");
}

/** Data w formacie ISO "YYYY-MM-DD" (`month` 1-12, tak jak wszędzie indziej w tym module). */
export function isoDate(year, month, day) {
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Dzisiejsza data lokalna jako ISO "YYYY-MM-DD" (do podświetlenia komórki "dziś" w siatce). */
export function todayIso() {
    const d = new Date();
    return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function monthLabel(year, month) {
    return `${MONTH_LABELS_PL[month - 1]} ${year}`;
}

/** Format czytelny dla listy rankingowej w control-panel.js, np. "pon, 5 października 2026" -
 *  parsuje ręcznie komponenty daty ISO zamiast `new Date(dateIso)`, żeby uniknąć przesunięcia dnia
 *  przez interpretację jako UTC-północ w strefach czasowych na zachód od UTC. */
export function formatDateLong(dateIso) {
    const [year, month, day] = dateIso.split("-").map(Number);
    const weekdaySunday0 = new Date(year, month - 1, day).getDay();
    const weekdayLabel = WEEKDAY_LABELS_PL[(weekdaySunday0 + 6) % 7];
    return `${weekdayLabel}, ${day} ${MONTH_LABELS_GENITIVE_PL[month - 1]} ${year}`;
}

/** Buduje siatkę tygodni dla danego miesiąca (`month` 1-12) - tablicę tablic po 7 komórek
 *  (poniedziałek -> niedziela), gdzie dni spoza miesiąca (dopełnienie pierwszego/ostatniego
 *  tygodnia) to `null`. Każda rzeczywista komórka to { day, date } (date = ISO string). */
export function buildMonthWeeks(year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstWeekdaySunday0 = new Date(year, month - 1, 1).getDay(); // 0=niedziela .. 6=sobota
    const firstWeekdayMonday0 = (firstWeekdaySunday0 + 6) % 7; // 0=poniedziałek .. 6=niedziela

    const cells = [];
    for (let i = 0; i < firstWeekdayMonday0; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push({ day, date: isoDate(year, month, day) });
    while (cells.length % 7 !== 0) cells.push(null);

    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

/** Buduje HTML jednej tabeli miesiąca. `statusForDate(dateIso) -> "yes"|"maybe"|null` decyduje o
 *  kolorze komórki, `clickable` dodaje `data-action="sched-cycle"` (obsługiwane przez
 *  core.js#cycleAvailability przez projekt wpinający ten moduł - patrz viewer.js/control-panel.js),
 *  `todayIsoStr` (opcjonalnie) podświetla "dziś", jeśli wypada w tym miesiącu. */
export function renderMonthTableHtml(year, month, statusForDate, { clickable = true, todayIsoStr = null } = {}) {
    const weeks = buildMonthWeeks(year, month);
    const rowsHtml = weeks.map(week => `
        <tr>
            ${week.map(cell => {
                if (!cell) return `<td class="sched-cell sched-cell-empty"></td>`;
                const status = statusForDate(cell.date);
                const statusClass = status === "yes" ? "sched-yes" : status === "maybe" ? "sched-maybe" : "";
                const isToday = todayIsoStr && cell.date === todayIsoStr;
                const tag = clickable ? "button" : "div";
                const attrs = clickable ? `type="button" data-action="sched-cycle" data-date="${cell.date}"` : "";
                return `
                    <td class="sched-cell ${statusClass} ${isToday ? "sched-today" : ""}">
                        <${tag} class="sched-day" ${attrs}>${cell.day}</${tag}>
                    </td>
                `;
            }).join("")}
        </tr>
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

/** Wszystkie daty ISO danego miesiąca, w kolejności rosnącej (do agregacji głosów w
 *  control-panel.js - bez dziur/dopełnienia z buildMonthWeeks). */
export function datesInMonth(year, month) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const out = [];
    for (let day = 1; day <= daysInMonth; day++) out.push(isoDate(year, month, day));
    return out;
}
