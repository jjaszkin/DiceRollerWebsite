// Battle Tracker - Klątwa Strahda. Tracker inicjatywy: runda (edytowalna), kolejność uczestników
// (przesuwanie góra/dół), skrócony podgląd PW i warunków, wybór uczestnika do panelu akcji.

import { updateState } from "../store.js";
import { escapeHtml } from "../utils.js";

export function renderInitiativePanel(root, { battle, selectedId, onSelect }) {
    root.innerHTML = `
        <div class="card initiative-panel">
            <div class="initiative-round-row">
                <span class="initiative-round-label">Runda</span>
                <button type="button" class="btn btn-icon btn-sm" data-round-action="dec">-</button>
                <input type="number" class="initiative-round-input" value="${battle.round ?? 1}" min="1">
                <button type="button" class="btn btn-icon btn-sm" data-round-action="inc">+</button>
            </div>
            <div class="initiative-list">
                ${battle.participants.map((p, i) => renderParticipantRow(p, i, battle.participants.length, selectedId)).join("") || '<p class="placeholder">Brak uczestników.</p>'}
            </div>
        </div>
    `;

    root.querySelector('[data-round-action="dec"]').addEventListener("click", () => {
        updateState((s) => { const b = s.battles[battle.id]; b.round = Math.max(1, (b.round || 1) - 1); });
    });
    root.querySelector('[data-round-action="inc"]').addEventListener("click", () => {
        updateState((s) => { s.battles[battle.id].round = (s.battles[battle.id].round || 1) + 1; });
    });
    root.querySelector(".initiative-round-input").addEventListener("change", (e) => {
        const val = Math.max(1, Number(e.target.value) || 1);
        updateState((s) => { s.battles[battle.id].round = val; });
    });

    root.querySelectorAll("[data-select-instance]").forEach((el) => {
        el.addEventListener("click", () => onSelect(el.dataset.selectInstance));
    });
    root.querySelectorAll("[data-move-up]").forEach((el) => {
        el.addEventListener("click", (e) => { e.stopPropagation(); moveParticipant(battle.id, el.dataset.moveUp, -1); });
    });
    root.querySelectorAll("[data-move-down]").forEach((el) => {
        el.addEventListener("click", (e) => { e.stopPropagation(); moveParticipant(battle.id, el.dataset.moveDown, 1); });
    });
}

function moveParticipant(battleId, instanceId, dir) {
    updateState((s) => {
        const list = s.battles[battleId].participants;
        const idx = list.findIndex((p) => p.instanceId === instanceId);
        const newIdx = idx + dir;
        if (idx < 0 || newIdx < 0 || newIdx >= list.length) return;
        const [item] = list.splice(idx, 1);
        list.splice(newIdx, 0, item);
    });
}

function renderParticipantRow(p, index, total, selectedId) {
    const hpText = p.hp?.max != null ? `${p.hp.current ?? "-"} / ${p.hp.max}` : "-";
    const conditions = (p.conditions || []).map((c) => `<span class="condition-badge">${escapeHtml(c.label)}</span>`).join("");
    return `
        <div class="initiative-row ${p.instanceId === selectedId ? "initiative-row-active" : ""}" data-select-instance="${p.instanceId}">
            <div class="initiative-row-order">
                <button type="button" class="btn btn-icon btn-xs" data-move-up="${p.instanceId}" ${index === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="btn btn-icon btn-xs" data-move-down="${p.instanceId}" ${index === total - 1 ? "disabled" : ""}>↓</button>
            </div>
            <div class="initiative-row-body">
                <div class="initiative-row-name">${escapeHtml(p.name)}</div>
                <div class="initiative-row-hp">PW: ${hpText}</div>
                ${conditions ? `<div class="initiative-row-conditions">${conditions}</div>` : ""}
            </div>
        </div>
    `;
}
