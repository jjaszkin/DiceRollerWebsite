// Panel: Dziennik — połączony log przygody: swobodne notatki narracyjne gracza (state.journal),
// automatyczny log rzutów kośćmi (state.rollHistory) oraz automatyczny log zdarzeń mechanicznych
// (state.events — patrz eventLog.js: questy, przedmioty, ulepszenia glidera, traity, zmiany
// statystyk, podsumowania nowego dnia), tagowane dniem gry i wyświetlane razem w jednej
// chronologicznej liście (najnowsze na górze).
import { getState, touch } from "../store.js";
import { uid, formatTimestamp } from "../utils.js";
import { EVENT_TYPE_LABELS } from "../eventLog.js";

function mergeAndGroupByDay(journalEntries, rollEntries, eventEntries) {
    const tagged = [
        ...journalEntries.map(e => ({ ...e, kind: "journal" })),
        ...rollEntries.map(e => ({ ...e, kind: "roll" })),
        ...eventEntries.map(e => ({ ...e, kind: "event" }))
    ];

    const groups = new Map();
    for (const e of tagged) {
        if (!groups.has(e.day)) groups.set(e.day, []);
        groups.get(e.day).push(e);
    }

    // Najnowszy dzień na górze; w obrębie dnia — najnowszy wpis/rzut na górze (wg `at`,
    // z zapasowym 0 dla starszych wpisów historii rzutów sprzed wprowadzenia tego pola).
    return Array.from(groups.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([day, list]) => [day, [...list].sort((a, b) => (b.at || 0) - (a.at || 0))]);
}

function renderEntry(e) {
    const rightMeta = `
        <span class="entry-meta-right">
            <span>${e.ts}</span>
            <button class="btn btn-sm btn-icon" data-action="delete-entry" data-kind="${e.kind}" data-id="${e.id}" title="Usuń wpis">×</button>
        </span>
    `;

    if (e.kind === "roll") {
        return `
            <li class="entry">
                <div class="entry-meta">
                    <span>${e.table}</span>
                    ${rightMeta}
                </div>
                <div class="entry-result">
                    <span class="placeholder">${e.rollText}</span> — <strong>${e.resultText}</strong>
                </div>
            </li>
        `;
    }
    if (e.kind === "event") {
        return `
            <li class="entry entry-event">
                <div class="entry-meta">
                    <span>${EVENT_TYPE_LABELS[e.type] || e.type}</span>
                    ${rightMeta}
                </div>
                <div class="entry-result">${e.text.replace(/\n/g, "<br>")}</div>
            </li>
        `;
    }
    return `
        <li class="entry">
            <div class="entry-meta">
                <span></span>
                ${rightMeta}
            </div>
            <div class="entry-result">${e.text.replace(/\n/g, "<br>")}</div>
        </li>
    `;
}

export function render(root, { state }) {
    const journalEntries = state.journal ?? [];
    const rollEntries = state.rollHistory ?? [];
    const eventEntries = state.events ?? [];
    const grouped = mergeAndGroupByDay(journalEntries, rollEntries, eventEntries);

    root.innerHTML = `
        <div class="card">
            <h2>Nowy wpis — Dzień ${state.day.current}</h2>
            <textarea data-field="new-entry" rows="4" placeholder="Co się wydarzyło…"></textarea>
            <button class="btn btn-primary" data-action="add-entry" style="margin-top:8px;">Dodaj wpis</button>
            ${rollEntries.length ? `<button class="btn btn-sm btn-secondary" data-action="clear-history" style="margin-top:8px; margin-left:8px;">Wyczyść historię rzutów</button>` : ``}
            ${journalEntries.length ? `<button class="btn btn-sm btn-secondary" data-action="clear-journal" style="margin-top:8px; margin-left:8px;">Wyczyść historię wpisów</button>` : ``}
            ${eventEntries.length ? `<button class="btn btn-sm btn-secondary" data-action="clear-events" style="margin-top:8px; margin-left:8px;">Wyczyść historię zdarzeń</button>` : ``}
        </div>
        ${grouped.length ? grouped.map(([day, list]) => `
            <div class="card" style="margin-top:12px;">
                <h3>Dzień ${day}</h3>
                <ul class="entry-list">
                    ${list.map(renderEntry).join("")}
                </ul>
            </div>
        `).join("") : `
            <div class="card" style="margin-top:12px;">
                <p class="placeholder">Dziennik jest pusty — dodaj pierwszy wpis powyżej, wykonaj rzut w Rollerze albo podejmij jakąś akcję w grze (fucha, przedmiot, upgrade, cecha…).</p>
            </div>
        `}
    `;

    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const state = getState();

        if (action === "add-entry") {
            const textarea = root.querySelector('[data-field="new-entry"]');
            const text = textarea.value.trim();
            if (!text) return;
            state.journal.push({ id: uid(), day: state.day.current, text, ts: formatTimestamp(), at: Date.now() });
            touch();
        } else if (action === "delete-entry") {
            const kind = btn.dataset.kind;
            if (kind === "roll") {
                if (!window.confirm("Usunąć ten wpis z historii rzutów?")) return;
                state.rollHistory = state.rollHistory.filter(r => r.id !== btn.dataset.id);
            } else if (kind === "event") {
                if (!window.confirm("Usunąć ten wpis z historii zdarzeń?")) return;
                state.events = (state.events ?? []).filter(ev => ev.id !== btn.dataset.id);
            } else {
                if (!window.confirm("Usunąć ten wpis dziennika?")) return;
                state.journal = state.journal.filter(j => j.id !== btn.dataset.id);
            }
            touch();
        } else if (action === "clear-history") {
            if (!window.confirm("Na pewno wyczyścić całą historię rzutów? Tej operacji nie można cofnąć.")) return;
            state.rollHistory = [];
            touch();
        } else if (action === "clear-journal") {
            if (!window.confirm("Na pewno wyczyścić całą historię wpisów dziennika? Tej operacji nie można cofnąć.")) return;
            state.journal = [];
            touch();
        } else if (action === "clear-events") {
            if (!window.confirm("Na pewno wyczyścić całą historię zdarzeń? Tej operacji nie można cofnąć.")) return;
            state.events = [];
            touch();
        }
    });
}
