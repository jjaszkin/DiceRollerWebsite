// Battle Tracker - Klątwa Strahda. Widok jednej walki (drill-down z listy): siatka 12 kolumn -
// panel akcji (8) + tracker inicjatywy i historia (4). Wybór aktywnego uczestnika to lokalny stan
// widoku (nie zapisywany do Firebase), pamiętany per walka na czas sesji przeglądarki.

import { getState } from "../store.js";
import { navigate } from "../router.js";
import { escapeHtml } from "../utils.js";
import { renderInitiativePanel } from "./initiativePanel.js";
import { renderHistoryPanel } from "./historyPanel.js";
import { renderActionPanel } from "./actionPanel.js";

const selectedParticipantByBattle = {};

export function renderBattleView(root, battleId) {
    const state = getState();
    const battle = state.battles?.[battleId];

    if (!battle) {
        root.innerHTML = `<p class="placeholder">Nie znaleziono walki. <a href="#/battles">Wróć do listy.</a></p>`;
        return;
    }

    if (!selectedParticipantByBattle[battleId] && battle.participants.length) {
        selectedParticipantByBattle[battleId] = battle.participants[0].instanceId;
    }
    const selectedId = selectedParticipantByBattle[battleId];

    root.innerHTML = `
        <div class="battle-view-head">
            <button type="button" class="btn btn-sm" id="backToListBtn">← Powrót do listy</button>
            <h2>${escapeHtml(battle.name)}</h2>
        </div>
        <div class="battle-arena-summary card">
            ${battle.arena?.location ? `<div class="arena-line"><strong>Miejsce</strong> ${escapeHtml(battle.arena.location)}</div>` : ""}
            ${battle.arena?.environmentalModifiers?.length ? `<div class="arena-line"><strong>Modyfikatory środowiskowe</strong> ${battle.arena.environmentalModifiers.map(escapeHtml).join(" - ")}</div>` : ""}
            ${battle.arena?.specialFeatures?.length ? `<div class="arena-line"><strong>Specjalne cechy</strong> ${battle.arena.specialFeatures.map(escapeHtml).join(" - ")}</div>` : ""}
        </div>

        <div class="battle-grid-12">
            <div class="battle-action-col" id="actionPanelRoot"></div>
            <div class="battle-side-col">
                <div id="initiativePanelRoot"></div>
                <div id="historyPanelRoot"></div>
            </div>
        </div>
    `;

    root.querySelector("#backToListBtn").addEventListener("click", () => navigate("/battles"));

    const onSelect = (instanceId) => {
        selectedParticipantByBattle[battleId] = instanceId;
        renderBattleView(root, battleId);
    };

    renderInitiativePanel(root.querySelector("#initiativePanelRoot"), { state, battle, selectedId, onSelect });
    renderHistoryPanel(root.querySelector("#historyPanelRoot"), { state, battle });
    renderActionPanel(root.querySelector("#actionPanelRoot"), { state, battle, selectedId });
}
