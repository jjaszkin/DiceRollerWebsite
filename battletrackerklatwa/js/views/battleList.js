// Battle Tracker - Klątwa Strahda. Tab "Walki": siatka kart + kreator nowej walki.

import { getState, updateState } from "../store.js";
import { navigate } from "../router.js";
import { escapeHtml } from "../utils.js";
import { openBattleCreator } from "./battleCreator.js";
import { openConfirm } from "../components/confirmModal.js";

export function renderBattleList(root) {
    const state = getState();
    const battles = Object.values(state.battles || {}).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    root.innerHTML = `
        <div class="view-head">
            <h2>Walki</h2>
            <button type="button" class="btn btn-primary" id="newBattleBtn">+ Nowa walka</button>
        </div>
        ${battles.length
            ? `<div class="card-grid battle-card-grid">${battles.map(renderBattleCard).join("")}</div>`
            : `<p class="placeholder">Brak walk. Utwórz pierwszą przyciskiem powyżej.</p>`}
    `;

    root.querySelector("#newBattleBtn").addEventListener("click", () => {
        openBattleCreator({
            state,
            onCreate: (battle) => {
                updateState((s) => { s.battles[battle.id] = battle; });
                navigate(`/battles/${battle.id}`);
            }
        });
    });

    root.querySelectorAll("[data-open-battle]").forEach((el) => {
        el.addEventListener("click", () => navigate(`/battles/${el.dataset.openBattle}`));
    });

    root.querySelectorAll("[data-delete-battle]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.dataset.deleteBattle;
            const name = state.battles[id]?.name || "";
            openConfirm({
                title: "Usunąć walkę?",
                message: `Usunąć "${name}" wraz z całą jej historią? Ta czynność jest nieodwracalna.`,
                onConfirm: () => updateState((s) => { delete s.battles[id]; })
            });
        });
    });
}

function renderBattleCard(battle) {
    const count = battle.participants?.length || 0;
    const place = battle.arena?.location ? escapeHtml(battle.arena.location) : "Brak miejsca";
    return `
        <div class="service-card battle-card">
            <button type="button" class="battle-card-open" data-open-battle="${battle.id}">
                <div class="card-text">
                    <div class="card-name">${escapeHtml(battle.name)}</div>
                    <div class="card-date">${place} - ${count} uczestników</div>
                </div>
            </button>
            <button type="button" class="btn btn-icon btn-sm battle-card-delete" data-delete-battle="${battle.id}" title="Usuń walkę">×</button>
        </div>
    `;
}
