// Hysteria Highest - Dashboard. Zakładka Dziennik - wolny rzut 2k10+modyfikator oraz wspólna lista
// zapisanych rzutów/zdarzeń (state.log), analogicznie do dzienników w Glide Solo / Dark Graal III.
// Usuwanie wpisów (z potwierdzeniem) tylko w panelu MG - patrz isMg.

import { escapeHtml, formatTimestamp, rollKultTest, renderMoveText } from "../utils.js";
import { logRoll, deleteLogEntry } from "../eventLog.js";

const TIER_LABELS = { success: "15+ Sukces!", partial: "10–14 Częściowy sukces", failure: "≤9 Porażka" };

function getUi(root) {
    if (!root._ui) root._ui = { modifier: 0 };
    return root._ui;
}

function logEntryHtml(entry, isMg) {
    const time = formatTimestamp(new Date(entry.timestamp));
    const deleteBtn = isMg ? `<button type="button" class="log-delete-btn" data-action="delete-log-entry" data-id="${entry.id}" title="Usuń wpis" aria-label="Usuń wpis">✕</button>` : "";
    if (entry.kind === "event") {
        return `
            <div class="log-entry log-entry-event">
                <span class="log-entry-time">${time}</span>
                <span class="log-entry-text">${escapeHtml(entry.text)}</span>
                ${deleteBtn}
            </div>
        `;
    }
    const r = entry.result;
    const modStr = `${r.modifier >= 0 ? "+" : ""}${r.modifier}`;
    return `
        <div class="log-entry log-entry-roll tier-${r.tier}">
            <div class="log-entry-head">
                <span class="log-entry-time">${time}</span>
                <span class="log-entry-who">${entry.characterName ? escapeHtml(entry.characterName) + " — " : ""}${escapeHtml(entry.label)}</span>
                ${deleteBtn}
            </div>
            <div class="log-entry-dice">${r.dice.join(" + ")} ${modStr} = <b>${r.total}</b> — ${TIER_LABELS[r.tier]}</div>
            ${entry.resultText ? `<div class="log-entry-result">${renderMoveText(entry.resultText)}</div>` : ""}
        </div>
    `;
}

function buildHtml(ctx, ui) {
    const { state, session } = ctx;
    const isMg = session?.role === "mg";
    const log = state.log || [];

    return `
        <div class="card journal-roller">
            <h3>Wolny rzut</h3>
            <div class="journal-roller-row">
                <span class="journal-roller-formula">2k10</span>
                <label class="journal-mod-label">Modyfikator
                    <input type="number" id="journalModifier" value="${ui.modifier}" step="1">
                </label>
                <button class="btn btn-primary" data-action="journal-roll">Rzuć</button>
            </div>
        </div>
        <div class="card">
            <h3>Dziennik</h3>
            ${log.length ? `<div class="log-list">${log.map(e => logEntryHtml(e, isMg)).join("")}</div>` : `<p class="placeholder">Brak zapisanych rzutów i zdarzeń.</p>`}
        </div>
    `;
}

function rerender(root) {
    root.innerHTML = buildHtml(root._ctx, getUi(root));
}

function wireEvents(root) {
    root.addEventListener("input", (e) => {
        if (e.target.id === "journalModifier") getUi(root).modifier = Number(e.target.value) || 0;
    });
    root.addEventListener("click", (e) => {
        const rollBtn = e.target.closest('[data-action="journal-roll"]');
        if (rollBtn) {
            const { updateState } = root._ctx;
            const ui = getUi(root);
            const result = rollKultTest({ modifier: ui.modifier });
            logRoll(updateState, {
                characterName: null,
                source: "free",
                label: "Wolny rzut",
                result,
                resultText: null
            });
            rerender(root);
            return;
        }
        const deleteBtn = e.target.closest('[data-action="delete-log-entry"]');
        if (deleteBtn) {
            if (!confirm("Usunąć ten wpis z Dziennika?")) return;
            deleteLogEntry(root._ctx.updateState, deleteBtn.dataset.id);
            rerender(root);
        }
    });
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx, getUi(root));
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
