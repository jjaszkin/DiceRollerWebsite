// Panel: Dziennik przygody — swobodne notatki narracyjne gracza, tagowane dniem gry (state.journal).
import { getState, touch } from "../store.js";
import { uid, formatTimestamp } from "../utils.js";

function groupByDay(entries) {
    const groups = new Map();
    for (const e of entries) {
        if (!groups.has(e.day)) groups.set(e.day, []);
        groups.get(e.day).push(e);
    }
    return Array.from(groups.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([day, list]) => [day, [...list].reverse()]);
}

function renderEntry(e) {
    return `
        <li class="entry">
            <div class="entry-meta">
                <span>${e.ts}</span>
                <button class="btn btn-sm btn-icon" data-action="delete-entry" data-id="${e.id}" title="Usuń wpis">×</button>
            </div>
            <div class="entry-result">${e.text.replace(/\n/g, "<br>")}</div>
        </li>
    `;
}

export function render(root, { state }) {
    const entries = state.journal ?? [];
    const grouped = groupByDay(entries);

    root.innerHTML = `
        <div class="card">
            <h2>Nowy wpis — Dzień ${state.day.current}</h2>
            <textarea data-field="new-entry" rows="4" placeholder="Co się wydarzyło…"></textarea>
            <button class="btn btn-primary" data-action="add-entry" style="margin-top:8px;">Dodaj wpis</button>
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
                <p class="placeholder">Dziennik jest pusty — dodaj pierwszy wpis powyżej.</p>
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
            state.journal.push({ id: uid(), day: state.day.current, text, ts: formatTimestamp() });
            touch();
        } else if (action === "delete-entry") {
            if (!window.confirm("Usunąć ten wpis dziennika?")) return;
            state.journal = state.journal.filter(j => j.id !== btn.dataset.id);
            touch();
        }
    });
}
