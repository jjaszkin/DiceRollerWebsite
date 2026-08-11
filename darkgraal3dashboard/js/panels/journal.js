// Dark Graal III - Dashboard Solo (MG). Dziennik kampanii - NIE jest już osobną zakładką (patrz
// index.html/main.js: "Dziennik" zostało zniesione jako top-level tab), tylko pomocniczy moduł bez
// własnego DOM-owego root'a, wpinany bezpośrednio w dolną część zakładki "Rzuty" (panels/roller.js).
// Łączy automatyczną historię testów (state.rollHistory, patrz rollLog.js) i automatyczny log
// zdarzeń mechanicznych (state.events, patrz eventLog.js) w jedną chronologię od najnowszego wpisu.
// Dodawanie wolnych notatek zostało usunięte (nikt - ani MG, ani gracze - go nie potrzebuje), ale
// usuwanie pojedynczych wpisów i zbiorcze czyszczenie historii zostaje, zastrzeżone dla MG - żeby
// gracz przypadkiem nie skasował wspólnej historii kampanii. Stare wolne notatki (state.journal),
// jeśli jakieś już istnieją z wcześniejszych testów, nadal są pokazywane i usuwalne.

import { updateState } from "../store.js";
import { EVENT_TYPE_LABELS } from "../eventLog.js";
import { escapeHtml, annotateDice } from "../utils.js";

const DIE_STATE_CLASS = {
    one: "die-removed",
    cancelled: "die-cancelled",
    full: "die-full",
    success: "die-success",
    complication: "die-complication"
};

function diceChipsHtml(dice) {
    return annotateDice(dice || []).map(({ value, state }) =>
        `<span class="die-chip die-chip-sm ${DIE_STATE_CLASS[state] || ""}">${value}</span>`
    ).join("");
}

function mergeChronological(journalEntries, rollEntries, eventEntries) {
    const tagged = [
        ...journalEntries.map(e => ({ ...e, kind: "journal" })),
        ...rollEntries.map(e => ({ ...e, kind: "roll" })),
        ...eventEntries.map(e => ({ ...e, kind: "event" }))
    ];
    return tagged.sort((a, b) => (b.at || 0) - (a.at || 0));
}

function renderEntry(e, canDelete) {
    const rightMeta = `
        <span class="entry-meta-right">
            <span>${escapeHtml(e.ts || "")}</span>
            ${canDelete ? `<button class="btn btn-sm btn-icon" data-action="delete-entry" data-kind="${e.kind}" data-id="${e.id}" title="Usuń wpis">×</button>` : ""}
        </span>
    `;

    if (e.kind === "roll") {
        return `
            <li class="entry entry-roll">
                <div class="entry-meta">
                    <span>${escapeHtml(e.characterName)}${e.archetypeLabel ? ` - ${escapeHtml(e.archetypeLabel)}` : ""}${e.graalDice ? ` (+${e.graalDice} Graala)` : ""}</span>
                    ${rightMeta}
                </div>
                <div class="entry-result">
                    <div class="dice-row">${diceChipsHtml(e.dice)}</div>
                    <strong>${escapeHtml(e.tierLabel || e.tier)}</strong>
                    ${e.note ? `<p class="placeholder">${escapeHtml(e.note)}</p>` : ""}
                </div>
            </li>
        `;
    }
    if (e.kind === "event") {
        return `
            <li class="entry entry-event">
                <div class="entry-meta">
                    <span>${escapeHtml(EVENT_TYPE_LABELS[e.type] || e.type)}</span>
                    ${rightMeta}
                </div>
                <div class="entry-result">${escapeHtml(e.text).replace(/\n/g, "<br>")}</div>
            </li>
        `;
    }
    return `
        <li class="entry">
            <div class="entry-meta">
                <span>Notatka</span>
                ${rightMeta}
            </div>
            <div class="entry-result">${escapeHtml(e.text).replace(/\n/g, "<br>")}</div>
        </li>
    `;
}

/** Buduje HTML dziennika (przyciski czyszczenia dla MG + posortowana lista wpisów) do osadzenia
 *  wewnątrz panelu Rzuty (panels/roller.js) - patrz wireJournalActions() dla obsługi kliknięć. */
export function buildJournalHtml(ctx) {
    const { state, session } = ctx;
    const journalEntries = state.journal ?? [];
    const rollEntries = state.rollHistory ?? [];
    const eventEntries = state.events ?? [];
    const merged = mergeChronological(journalEntries, rollEntries, eventEntries);
    const canDelete = session.role === "mg";

    return `
        <h2>Dziennik kampanii</h2>
        ${canDelete && (rollEntries.length || journalEntries.length || eventEntries.length) ? `
            <div class="journal-clear-row">
                ${rollEntries.length ? `<button class="btn btn-sm" data-action="clear-history">Wyczyść historię testów</button>` : ""}
                ${journalEntries.length ? `<button class="btn btn-sm" data-action="clear-journal">Wyczyść notatki</button>` : ""}
                ${eventEntries.length ? `<button class="btn btn-sm" data-action="clear-events">Wyczyść historię zdarzeń</button>` : ""}
            </div>
        ` : ""}
        <div class="journal-list-card">
            ${merged.length ? `<ul class="entry-list">${merged.map(e => renderEntry(e, canDelete)).join("")}</ul>` : `
                <p class="placeholder">Dziennik jest pusty - wykonaj test powyżej, żeby zaczęła się zapełniać historia.</p>
            `}
        </div>
    `;
}

/** Zestaw akcji dziennika obsługiwanych przez data-action - do wywołania z jednego delegowanego
 *  click-handlera w panels/roller.js (obok jego własnych akcji rzutu). Zwraca `true`, jeśli akcja
 *  została rozpoznana i obsłużona (wywołujący powinien wtedy przerwać dalsze przetwarzanie kliknięcia
 *  i wywołać swój rerender), inaczej `false`. */
export function handleJournalAction(action, btn, ctx) {
    const { session } = ctx;

    if (action === "delete-entry") {
        if (session.role !== "mg") return true;
        const kind = btn.dataset.kind;
        const id = btn.dataset.id;
        if (kind === "roll") {
            if (!window.confirm("Usunąć ten wpis z historii testów?")) return true;
            updateState((state) => { state.rollHistory = state.rollHistory.filter(r => r.id !== id); });
        } else if (kind === "event") {
            if (!window.confirm("Usunąć ten wpis z historii zdarzeń?")) return true;
            updateState((state) => { state.events = (state.events ?? []).filter(ev => ev.id !== id); });
        } else {
            if (!window.confirm("Usunąć tę notatkę?")) return true;
            updateState((state) => { state.journal = state.journal.filter(j => j.id !== id); });
        }
        return true;
    }

    if (action === "clear-history") {
        if (session.role !== "mg") return true;
        if (!window.confirm("Na pewno wyczyścić całą historię testów? Tej operacji nie można cofnąć.")) return true;
        updateState((state) => { state.rollHistory = []; });
        return true;
    }

    if (action === "clear-journal") {
        if (session.role !== "mg") return true;
        if (!window.confirm("Na pewno wyczyścić wszystkie notatki? Tej operacji nie można cofnąć.")) return true;
        updateState((state) => { state.journal = []; });
        return true;
    }

    if (action === "clear-events") {
        if (session.role !== "mg") return true;
        if (!window.confirm("Na pewno wyczyścić całą historię zdarzeń? Tej operacji nie można cofnąć.")) return true;
        updateState((state) => { state.events = []; });
        return true;
    }

    return false;
}
