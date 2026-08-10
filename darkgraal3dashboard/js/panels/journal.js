// Dark Graal III - Dashboard Solo (MG). Panel "Dziennik" - połączony log kampanii: automatyczna
// historia testów (state.rollHistory, patrz rollLog.js), automatyczny log zdarzeń mechanicznych
// (state.events, patrz eventLog.js: zmiany Rozpaczy/Ran/Błogosławieństwa/Archetypów/Mocy/Kości
// Graala/Wiatru Camelotu/ekwipunku) oraz swobodne notatki (state.journal) - wszystko razem, jedna
// chronologia od najnowszego wpisu. W odróżnieniu od glide2solo#panels/journal.js NIE ma tu
// grupowania wg "dnia gry" (Dark Graal III nie śledzi dni/czasu w tym dashboardzie - poza zakresem
// obecnej wersji, patrz komentarz w main.js), więc wszystko leci jedną płaską, posortowaną listą.
//
// Dodawanie notatki jest dostępne dla każdej roli (MG i gracze mogą dopisać coś do kroniki sesji),
// ale usuwanie/czyszczenie historii jest zastrzeżone dla MG - żeby gracz przypadkiem nie skasował
// wspólnej historii kampanii.

import { updateState } from "../store.js";
import { EVENT_TYPE_LABELS } from "../eventLog.js";
import { escapeHtml, uid, formatTimestamp, preserveScroll } from "../utils.js";

function diceChipsHtml(dice) {
    return (dice || []).map(d => {
        const cls = d === 1 ? "die-removed" : d === 6 ? "die-full" : d >= 4 ? "die-success" : "die-complication";
        return `<span class="die-chip die-chip-sm ${cls}">${d}</span>`;
    }).join("");
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
                    <span>${escapeHtml(e.characterName)} - ${escapeHtml(e.archetypeLabel)}${e.graalDice ? ` (+${e.graalDice} Graala)` : ""}</span>
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

function buildHtml(ctx) {
    const { state, session } = ctx;
    const journalEntries = state.journal ?? [];
    const rollEntries = state.rollHistory ?? [];
    const eventEntries = state.events ?? [];
    const merged = mergeChronological(journalEntries, rollEntries, eventEntries);
    const canDelete = session.role === "mg";

    return `
        <div class="card">
            <h2>Nowy wpis</h2>
            <textarea data-field="new-entry" rows="3" placeholder="Notatka do kroniki sesji..."></textarea>
            <button class="btn btn-gold" data-action="add-entry">Dodaj notatkę</button>
            ${canDelete ? `
                <div class="journal-clear-row">
                    ${rollEntries.length ? `<button class="btn btn-sm" data-action="clear-history">Wyczyść historię testów</button>` : ""}
                    ${journalEntries.length ? `<button class="btn btn-sm" data-action="clear-journal">Wyczyść notatki</button>` : ""}
                    ${eventEntries.length ? `<button class="btn btn-sm" data-action="clear-events">Wyczyść historię zdarzeń</button>` : ""}
                </div>
            ` : ""}
        </div>
        <div class="card journal-list-card">
            ${merged.length ? `<ul class="entry-list">${merged.map(e => renderEntry(e, canDelete)).join("")}</ul>` : `
                <p class="placeholder">Dziennik jest pusty - dopisz notatkę powyżej albo wykonaj test w panelu "Test".</p>
            `}
        </div>
    `;
}

function rerender(root) {
    preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const { session } = root._ctx;

        if (action === "add-entry") {
            const textarea = root.querySelector('[data-field="new-entry"]');
            const text = textarea.value.trim();
            if (!text) return;
            updateState((state) => {
                if (!state.journal) state.journal = [];
                state.journal.push({ id: uid(), text, ts: formatTimestamp(), at: Date.now() });
            });
            rerender(root);
            return;
        }

        if (session.role !== "mg") return; // pozostałe akcje (usuwanie/czyszczenie) tylko dla MG

        if (action === "delete-entry") {
            const kind = btn.dataset.kind;
            const id = btn.dataset.id;
            if (kind === "roll") {
                if (!window.confirm("Usunąć ten wpis z historii testów?")) return;
                updateState((state) => { state.rollHistory = state.rollHistory.filter(r => r.id !== id); });
            } else if (kind === "event") {
                if (!window.confirm("Usunąć ten wpis z historii zdarzeń?")) return;
                updateState((state) => { state.events = (state.events ?? []).filter(ev => ev.id !== id); });
            } else {
                if (!window.confirm("Usunąć tę notatkę?")) return;
                updateState((state) => { state.journal = state.journal.filter(j => j.id !== id); });
            }
            rerender(root);
            return;
        }

        if (action === "clear-history") {
            if (!window.confirm("Na pewno wyczyścić całą historię testów? Tej operacji nie można cofnąć.")) return;
            updateState((state) => { state.rollHistory = []; });
            rerender(root);
            return;
        }

        if (action === "clear-journal") {
            if (!window.confirm("Na pewno wyczyścić wszystkie notatki? Tej operacji nie można cofnąć.")) return;
            updateState((state) => { state.journal = []; });
            rerender(root);
            return;
        }

        if (action === "clear-events") {
            if (!window.confirm("Na pewno wyczyścić całą historię zdarzeń? Tej operacji nie można cofnąć.")) return;
            updateState((state) => { state.events = []; });
            rerender(root);
            return;
        }
    });
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx);
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
