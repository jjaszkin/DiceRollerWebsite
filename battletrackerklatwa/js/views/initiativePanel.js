// Battle Tracker - Klątwa Strahda. Tracker inicjatywy: runda (edytowalna), kolejność uczestników
// (przesuwanie góra/dół albo sortowanie po wartości inicjatywy), skrócony podgląd PW i stanów.
//
// Klik w wiersz oznacza "kto jest na ruchu" (battle.currentTurnInstanceId, zapisywane do Firebase)
// - CELOWO niezależnie od tego, kogo GM ogląda w panelu akcji (osobny wybór przez taby uczestników
// na górze panelu akcji, patrz actionPanel.js). Dzięki temu można trackować inicjatywę jednego
// uczestnika, patrząc jednocześnie na kartę innego.

import { updateState } from "../store.js";
import { escapeHtml } from "../utils.js";
import { participantDisplayName, participantPortrait } from "../components/participantDisplay.js";
import { rollD20 } from "../diceEngine.js";
import { abilityMod, fmtMod } from "../components/statblock.js";
import { logEntry } from "../rollLog.js";

export function renderInitiativePanel(root, { state, battle }) {
    root.innerHTML = `
        <div class="card initiative-panel">
            <div class="initiative-round-row">
                <span class="initiative-round-label">Runda</span>
                <button type="button" class="btn btn-icon btn-sm" data-round-action="dec">-</button>
                <input type="number" class="initiative-round-input" value="${battle.round ?? 1}" min="1">
                <button type="button" class="btn btn-icon btn-sm" data-round-action="inc">+</button>
            </div>
            <button type="button" class="btn btn-sm initiative-action-btn" id="sortByInitiativeBtn">Sortuj według inicjatywy</button>
            <button type="button" class="btn btn-sm initiative-action-btn" id="rollEnemyInitiativeBtn">Rzuć za inicjatywę wrogów</button>
            <div class="initiative-list">
                ${battle.participants.map((p, i) => renderParticipantRow(state, p, i, battle.participants.length, battle.currentTurnInstanceId)).join("") || '<p class="placeholder">Brak uczestników.</p>'}
            </div>
        </div>
    `;

    root.querySelector('[data-round-action="dec"]').addEventListener("click", () => {
        setRound(battle.id, Math.max(1, (battle.round || 1) - 1));
    });
    root.querySelector('[data-round-action="inc"]').addEventListener("click", () => {
        setRound(battle.id, (battle.round || 1) + 1);
    });
    root.querySelector(".initiative-round-input").addEventListener("change", (e) => {
        setRound(battle.id, Math.max(1, Number(e.target.value) || 1));
    });
    root.querySelector("#sortByInitiativeBtn").addEventListener("click", () => {
        updateState((s) => {
            s.battles[battle.id].participants.sort((a, b) => (b.initiative || 0) - (a.initiative || 0));
        });
    });
    root.querySelector("#rollEnemyInitiativeBtn").addEventListener("click", () => {
        updateState((s) => {
            const b = s.battles[battle.id];
            const lines = [];
            for (const p of b.participants) {
                if (p.sourceType !== "monster") continue;
                const monster = s.library.monsters[p.sourceId];
                const form = monster?.forms.find((f) => f.formId === p.formId);
                const mod = abilityMod(form?.abilities?.dex);
                const roll = rollD20();
                p.initiative = roll + mod;
                lines.push(`${escapeHtml(p.name)} ${p.initiative} (${roll}${fmtMod(mod)})`);
            }
            if (lines.length) logEntry(s, battle.id, "event", `Rzut inicjatywy wrogów: ${lines.join(", ")}.`);
        });
    });

    root.querySelectorAll("[data-select-instance]").forEach((el) => {
        el.addEventListener("click", () => {
            updateState((s) => { s.battles[battle.id].currentTurnInstanceId = el.dataset.selectInstance; });
        });
    });
    root.querySelectorAll("[data-move-up]").forEach((el) => {
        el.addEventListener("click", (e) => { e.stopPropagation(); moveParticipant(battle.id, el.dataset.moveUp, -1); });
    });
    root.querySelectorAll("[data-move-down]").forEach((el) => {
        el.addEventListener("click", (e) => { e.stopPropagation(); moveParticipant(battle.id, el.dataset.moveDown, 1); });
    });
    root.querySelectorAll("[data-initiative-input]").forEach((el) => {
        el.addEventListener("click", (e) => e.stopPropagation());
        el.addEventListener("change", (e) => {
            const val = e.target.value === "" ? 0 : Number(e.target.value) || 0;
            updateState((s) => {
                s.battles[battle.id].participants.find((p) => p.instanceId === el.dataset.initiativeInput).initiative = val;
            });
        });
    });
}

/** Zmienia rundę i zeruje pulę zużytych reakcji WSZYSTKICH uczestników (nowa runda = świeży
 *  limit reakcji, patrz actionPanel.js#reactionLimit). */
function setRound(battleId, newRound) {
    updateState((s) => {
        const b = s.battles[battleId];
        b.round = newRound;
        for (const p of b.participants) p.reactionsUsedThisRound = 0;
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

function renderParticipantRow(state, p, index, total, currentTurnId) {
    const hpText = p.hp?.max != null ? `${p.hp.current ?? "-"} / ${p.hp.max}` : "-";
    const conditions = (p.conditions || []).map((c) => `<span class="condition-badge">${escapeHtml(c.label)}</span>`).join("");
    const portrait = participantPortrait(state, p);
    return `
        <div class="initiative-row ${p.instanceId === currentTurnId ? "initiative-row-active" : ""}" data-select-instance="${p.instanceId}" title="Kliknij, by oznaczyć jako uczestnika na ruchu">
            <div class="initiative-row-order">
                <button type="button" class="btn btn-icon btn-xs" data-move-up="${p.instanceId}" ${index === 0 ? "disabled" : ""}>↑</button>
                <button type="button" class="btn btn-icon btn-xs" data-move-down="${p.instanceId}" ${index === total - 1 ? "disabled" : ""}>↓</button>
            </div>
            <input type="number" class="initiative-value-input" data-initiative-input="${p.instanceId}" value="${p.initiative ?? 0}" title="Wartość inicjatywy">
            ${portrait ? `<img class="initiative-row-portrait" src="${escapeHtml(portrait)}" alt="">` : '<div class="initiative-row-portrait initiative-row-portrait-empty"></div>'}
            <div class="initiative-row-body">
                <div class="initiative-row-name">${escapeHtml(participantDisplayName(state, p))}</div>
                <div class="initiative-row-hp">PW: ${hpText}</div>
                ${conditions ? `<div class="initiative-row-conditions">${conditions}</div>` : ""}
            </div>
        </div>
    `;
}
