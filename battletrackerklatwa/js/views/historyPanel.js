// Battle Tracker - Klątwa Strahda. Historia rzutów i akcji tej walki (z płaskiego state.rollHistory,
// patrz rollLog.js) - usuwanie wpisu małym "×" wymaga potwierdzenia na modalu.

import { updateState } from "../store.js";
import { formatTimestamp } from "../utils.js";
import { entriesForBattle, removeEntry } from "../rollLog.js";
import { openConfirm } from "../components/confirmModal.js";

const KIND_LABELS = { roll: "Rzut", damage: "Obrażenia", condition: "Warunek", event: "Zdarzenie" };

export function renderHistoryPanel(root, { state, battle }) {
    const entries = entriesForBattle(state, battle.id).sort((a, b) => (b.at || 0) - (a.at || 0));

    root.innerHTML = `
        <div class="card history-panel">
            <h3>Historia</h3>
            <ul class="entry-list">
                ${entries.map(renderEntry).join("") || '<li class="placeholder">Brak wpisów.</li>'}
            </ul>
        </div>
    `;

    root.querySelectorAll("[data-delete-entry]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const entryId = btn.dataset.deleteEntry;
            openConfirm({
                title: "Usunąć wpis?",
                message: "Ta czynność jest nieodwracalna.",
                onConfirm: () => updateState((s) => removeEntry(s, entryId))
            });
        });
    });
}

function renderEntry(entry) {
    return `
        <li class="entry entry-${entry.kind}">
            <div class="entry-meta">
                <span>${KIND_LABELS[entry.kind] || entry.kind} - ${formatTimestamp(entry.at)}</span>
                <span class="entry-meta-right">
                    <button type="button" class="btn btn-icon btn-sm" data-delete-entry="${entry.id}" title="Usuń">×</button>
                </span>
            </div>
            <div class="entry-result">${entry.text}</div>
        </li>
    `;
}
