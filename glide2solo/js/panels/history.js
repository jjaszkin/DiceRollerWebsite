// Panel: Historia rzutów — pełny log wszystkich rzutów kośćmi, tagowany dniem gry (state.rollHistory).
import { getState, touch } from "../store.js";

function groupByDay(entries) {
    const groups = new Map();
    for (const e of entries) {
        if (!groups.has(e.day)) groups.set(e.day, []);
        groups.get(e.day).push(e);
    }
    // Najnowszy dzień na górze; w obrębie dnia — najnowszy rzut na górze.
    return Array.from(groups.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([day, list]) => [day, [...list].reverse()]);
}

function renderEntry(e) {
    return `
        <li class="entry">
            <div class="entry-meta">
                <span>${e.table}</span>
                <span>${e.ts}</span>
            </div>
            <div class="entry-result">
                <span class="placeholder">${e.rollText}</span> — <strong>${e.resultText}</strong>
            </div>
        </li>
    `;
}

export function render(root, { state }) {
    const entries = state.rollHistory ?? [];
    const grouped = groupByDay(entries);

    root.innerHTML = `
        <div class="card">
            <h2>Historia rzutów (${entries.length})</h2>
            ${entries.length ? `<button class="btn btn-sm btn-secondary" data-action="clear-history">Wyczyść całą historię</button>` : `<p class="placeholder">Brak rzutów — historia zapełni się automatycznie w miarę korzystania z Rollera.</p>`}
        </div>
        ${grouped.map(([day, list]) => `
            <div class="card" style="margin-top:12px;">
                <h3>Dzień ${day}</h3>
                <ul class="entry-list">
                    ${list.map(renderEntry).join("")}
                </ul>
            </div>
        `).join("")}
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
        if (btn.dataset.action === "clear-history") {
            if (!window.confirm("Na pewno wyczyścić całą historię rzutów? Tej operacji nie można cofnąć.")) return;
            const state = getState();
            state.rollHistory = [];
            touch();
        }
    });
}
