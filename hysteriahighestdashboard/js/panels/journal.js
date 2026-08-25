// Hysteria Highest - Dashboard. Zakładka Dziennik - wolny rzut 2k10+modyfikator oraz wspólna lista
// zapisanych rzutów/zdarzeń (state.log), analogicznie do dzienników w Glide Solo / Dark Graal III.

import { escapeHtml, formatTimestamp, rollKultTest } from "../utils.js";
import { logRoll } from "../eventLog.js";

const TIER_LABELS = { success: "15+ Sukces!", partial: "10–14 Częściowy sukces", failure: "≤9 Porażka" };

function getUi(root) {
    if (!root._ui) root._ui = { modifier: 0 };
    return root._ui;
}

function logEntryHtml(entry) {
    const time = formatTimestamp(new Date(entry.timestamp));
    if (entry.kind === "event") {
        return `
            <div class="log-entry log-entry-event">
                <span class="log-entry-time">${time}</span>
                <span class="log-entry-text">${escapeHtml(entry.text)}</span>
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
            </div>
            <div class="log-entry-dice">${r.dice.join(" + ")} ${modStr} = <b>${r.total}</b> — ${TIER_LABELS[r.tier]}</div>
            ${entry.resultText ? `<div class="log-entry-result">${escapeHtml(entry.resultText)}</div>` : ""}
        </div>
    `;
}

function buildHtml(ctx, ui) {
    const { state } = ctx;
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
            ${log.length ? `<div class="log-list">${log.map(logEntryHtml).join("")}</div>` : `<p class="placeholder">Brak zapisanych rzutów i zdarzeń.</p>`}
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
        const btn = e.target.closest('[data-action="journal-roll"]');
        if (!btn) return;
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
