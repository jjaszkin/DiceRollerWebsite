// Dark Graal III - Dashboard Solo (MG). Panel "Test" - rzut pulą k6 dla aktywnej postaci: wybór
// Archetypu (pula = wartość efektywna, patrz state.js#archetypeCurrent), opcjonalne dorzucenie
// Kości Graala ze wspólnej puli, opcjonalne Moce zwiększające pulę PRZED rzutem, rzut, a następnie
// (jeśli dotyczy) Moce modyfikujące już rzucone kości (przerzut/podniesienie) - na końcu zatwierdzenie
// zapisuje wynik do wspólnej historii testów (rollLog.js) i dopiero wtedy trwale zużywa Kości
// Graala/oznacza Moce jako użyte. Do tego momentu rzut jest tylko lokalnym podglądem (nic nie jest
// zapisywane do Firebase) - dzięki temu "Cofnij/Przerzuć od nowa" nic nie psuje we wspólnym stanie.
//
// UWAGA (kontynuacja zastrzeżenia z utils.js): poniższa kategoryzacja Mocy na "przed rzutem"/"po
// rzucie"/"pasywna, autostosowana"/"nielimitowana narracyjna" jest rekonstrukcją opartą o pole
// `effect.usage` w data/transformations.json, wywiedzioną z tego, kiedy panels/character.js pokazuje
// przycisk "Oznacz jako użytą" (usage ∈ {session,scene,combat} → limitowana i śledzona; usage
// "narrative" → nielimitowana, nieśledzona; usage "passive" → zawsze aktywna, bez przycisku).
// Jeden przypadek szczególny: `party_bonus_dice` (np. "Cierniowa korona" Cadwyna) działa na PULĘ
// SOJUSZNIKÓW, nie własną - roller go nie automatyzuje w matematyce rzutu, tylko pokazuje jako
// informację (aktywację/zużycie tej Mocy nadal można ręcznie oznaczyć w panelu Postać). To wszystko,
// tak jak silnik testu w utils.js, wymaga potwierdzenia przez usera przy pierwszym realnym użyciu.

import { updateState } from "../store.js";
import { logRoll } from "../rollLog.js";
import { logEvent } from "../eventLog.js";
import { archetypeCurrent } from "../state.js";
import {
    escapeHtml, clamp, preserveScroll, TEST_TIER_LABELS,
    rollTestPool, applyRerollOnes, applyRerollAllOnes, applyRaiseLowestDie
} from "../utils.js";

const ARCHETYPE_ORDER = ["rycerz", "lowczy", "lotr", "kaplan", "czarownik"];

const ui = {
    selectedCharacterKey: null, // tylko dla MG, patrz resolveActiveKey()
    archetypeKey: "rycerz",
    graalDiceUsed: 0,
    selectedBonusPowerIds: new Set(), // Moce bonus_dice zaznaczone do dorzucenia PRZED rzutem
    pendingRoll: null // podgląd rzutu do zatwierdzenia, patrz buildPendingRoll()
};

function resolveActiveKey(state, session) {
    if (session.role === "player") return session.characterKey;
    if (ui.selectedCharacterKey && state.characters[ui.selectedCharacterKey]) return ui.selectedCharacterKey;
    const keys = Object.keys(state.characters);
    ui.selectedCharacterKey = keys[0] || null;
    return ui.selectedCharacterKey;
}

function archetypeLabel(data, key) {
    return data.archetypes.find(a => a.key === key)?.label || key;
}

function isPowerUsed(character, power) {
    return !!character.usedPowers?.[power.id];
}

function usageNote(usage) {
    if (usage === "session") return "raz na sesję";
    if (usage === "scene") return "raz na scenę";
    if (usage === "combat") return "raz na walkę";
    return "";
}

/** Moce bonus_dice (limitowane), które można dorzucić do puli PRZED rzutem. */
function preRollBonusPowers(character, transformation) {
    return (transformation?.powers || []).filter(p =>
        p.effect?.type === "bonus_dice" &&
        ["session", "scene", "combat"].includes(p.effect.usage) &&
        !isPowerUsed(character, p)
    );
}

/** Moce modyfikujące już rzucone kości, limitowane (zużywają się). */
function postRollTrackedPowers(character, transformation) {
    return (transformation?.powers || []).filter(p =>
        ["reroll_ones", "reroll_all_ones", "raise_lowest_die"].includes(p.effect?.type) &&
        ["session", "scene", "combat"].includes(p.effect?.usage) &&
        !isPowerUsed(character, p)
    );
}

/** Moce modyfikujące już rzucone kości, nielimitowane (usage "narrative" - do ręcznej oceny MG). */
function postRollNarrativePowers(transformation) {
    return (transformation?.powers || []).filter(p =>
        ["reroll_ones", "reroll_all_ones", "raise_lowest_die"].includes(p.effect?.type) &&
        p.effect?.usage === "narrative"
    );
}

/** Jedyna obecna w danych Moc pasywna z automatyzowalnym efektem: "Kościana siła" (raise_lowest_die,
 *  usage "passive", warunek: najniższa kość ≤2). Stosowana automatycznie przy każdym rzucie, bez
 *  śledzenia zużycia - patrz zastrzeżenie w nagłówku pliku. */
function applyPassivePowers(character, transformation, rollResult) {
    let result = rollResult;
    const applied = [];
    const passivePowers = (transformation?.powers || []).filter(p =>
        p.effect?.type === "raise_lowest_die" && p.effect?.usage === "passive"
    );
    for (const p of passivePowers) {
        if (!result.dice.length) continue;
        const lowest = Math.min(...result.dice);
        if (lowest <= 2) {
            result = applyRaiseLowestDie(result.dice, p.effect.amount || 0);
            applied.push(p.name);
        }
    }
    return { result, applied };
}

function diceChipsHtml(dice) {
    return dice.map(d => {
        const cls = d === 1 ? "die-removed" : d === 6 ? "die-full" : d >= 4 ? "die-success" : "die-complication";
        return `<span class="die-chip ${cls}">${d}</span>`;
    }).join("");
}

function buildSetupHtml(state, data, character, transformation, archetypeDice) {
    const graalPool = state.graalDice.current;
    const bonusPowers = preRollBonusPowers(character, transformation);
    const bonusHtml = bonusPowers.map(p => `
        <label class="power-check">
            <input type="checkbox" data-action="toggle-bonus-power" data-power-id="${p.id}"
                ${ui.selectedBonusPowerIds.has(p.id) ? "checked" : ""}>
            ${escapeHtml(p.name)} (+${p.effect.amount} kości, ${usageNote(p.effect.usage)})
            ${p.effect.conditionText ? `<span class="placeholder"> - ${escapeHtml(p.effect.conditionText)}</span>` : ""}
        </label>
    `).join("");

    const bonusDiceTotal = bonusPowers
        .filter(p => ui.selectedBonusPowerIds.has(p.id))
        .reduce((sum, p) => sum + (p.effect.amount || 0), 0);
    const poolTotal = archetypeDice + ui.graalDiceUsed + bonusDiceTotal;

    return `
        <div class="roller-setup">
            <h3>Archetyp</h3>
            <div class="archetype-picker">
                ${ARCHETYPE_ORDER.map(key => {
                    const current = archetypeCurrent(character.archetypes[key]);
                    return `
                        <button class="archetype-chip ${key === ui.archetypeKey ? "archetype-chip-active" : ""}"
                            data-action="select-archetype" data-key="${key}">
                            ${escapeHtml(archetypeLabel(data, key))} <span class="archetype-chip-value">${current}</span>
                        </button>
                    `;
                }).join("")}
            </div>

            <h3>Kości Graala</h3>
            <div class="stat-controls">
                <button class="btn btn-xs" data-action="graal-dec">−</button>
                <span>${ui.graalDiceUsed} <span class="placeholder">(dostępne: ${graalPool})</span></span>
                <button class="btn btn-xs" data-action="graal-inc">+</button>
            </div>

            ${bonusHtml ? `<h3>Moce (przed rzutem)</h3><div class="powers-checklist">${bonusHtml}</div>` : ""}

            <div class="roller-pool-summary">
                Pula testu: <strong>${poolTotal}</strong>
                <span class="placeholder">(${archetypeDice} z Archetypu + ${ui.graalDiceUsed} Graala${bonusDiceTotal ? ` + ${bonusDiceTotal} z Mocy` : ""})</span>
            </div>

            <button class="btn btn-gold" data-action="do-roll">Rzuć kośćmi</button>
        </div>
    `;
}

function buildPendingRollHtml(character, transformation) {
    const pr = ui.pendingRoll;
    if (!pr) return "";

    const trackedPowers = postRollTrackedPowers(character, transformation);
    const narrativePowers = postRollNarrativePowers(transformation);

    const powerButtonsHtml = (powers, tracked) => powers.map(p => `
        <button class="btn btn-xs" data-action="apply-post-power" data-power-id="${p.id}" data-tracked="${tracked ? "1" : "0"}">
            ${escapeHtml(p.name)}${tracked ? ` (${usageNote(p.effect.usage)})` : " (narracyjna)"}
        </button>
    `).join("");

    const appliedHtml = pr.appliedPowerNames.length
        ? `<p class="placeholder">Zastosowane Moce: ${pr.appliedPowerNames.map(escapeHtml).join(", ")}</p>`
        : "";

    return `
        <div class="roller-result">
            <h3>Wynik: ${escapeHtml(pr.tierLabel)}</h3>
            <div class="dice-row">${diceChipsHtml(pr.dice)}</div>
            <p class="placeholder">Usunięto po 1: ${pr.removedOnes}</p>
            ${appliedHtml}

            ${(trackedPowers.length || narrativePowers.length) ? `
                <h4>Moce (po rzucie)</h4>
                <div class="powers-checklist">
                    ${powerButtonsHtml(trackedPowers, true)}
                    ${powerButtonsHtml(narrativePowers, false)}
                </div>
            ` : ""}

            <label class="roll-note-label">
                Notatka (opcjonalnie)
                <textarea class="roll-note-input" data-action="roll-note-input" rows="2">${escapeHtml(pr.note)}</textarea>
            </label>

            <div class="roller-actions">
                <button class="btn btn-gold" data-action="finalize-roll">Zatwierdź i zapisz do dziennika</button>
                <button class="btn btn-sm" data-action="cancel-roll">Odrzuć rzut</button>
            </div>
        </div>
    `;
}

function buildHtml(ctx) {
    const { state, data, session } = ctx;
    const activeKey = resolveActiveKey(state, session);
    const character = activeKey ? state.characters[activeKey] : null;
    if (!character) return `<p class="placeholder">Brak wybranej postaci.</p>`;

    const transformation = data.transformations[activeKey];
    const archetypeDice = archetypeCurrent(character.archetypes[ui.archetypeKey]);

    const selectorHtml = session.role === "mg" ? `
        <select id="rollerCharacterPicker" class="char-picker">
            ${Object.values(state.characters).map(c => `
                <option value="${c.key}" ${c.key === activeKey ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(c.aliasName)})</option>
            `).join("")}
        </select>
    ` : "";

    return `
        ${selectorHtml}
        <div class="roller-panel">
            <h2>Test - ${escapeHtml(character.name)}</h2>
            ${ui.pendingRoll ? buildPendingRollHtml(character, transformation) : buildSetupHtml(state, data, character, transformation, archetypeDice)}
        </div>
    `;
}

function rerender(root) {
    preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        if (e.target.id === "rollerCharacterPicker") {
            ui.selectedCharacterKey = e.target.value;
            resetPendingSelection();
            rerender(root);
            return;
        }
        if (e.target.dataset.action === "toggle-bonus-power") {
            const id = e.target.dataset.powerId;
            if (e.target.checked) ui.selectedBonusPowerIds.add(id);
            else ui.selectedBonusPowerIds.delete(id);
            rerender(root);
        }
    });

    root.addEventListener("input", (e) => {
        if (e.target.dataset.action === "roll-note-input" && ui.pendingRoll) {
            ui.pendingRoll.note = e.target.value;
        }
    });

    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "select-archetype") {
            ui.archetypeKey = btn.dataset.key;
            rerender(root);
            return;
        }

        if (action === "graal-inc" || action === "graal-dec") {
            const { state, session } = root._ctx;
            const max = state.graalDice.current;
            ui.graalDiceUsed = clamp(ui.graalDiceUsed + (action === "graal-inc" ? 1 : -1), 0, max);
            rerender(root);
            return;
        }

        if (action === "do-roll") {
            doRoll(root);
            return;
        }

        if (action === "apply-post-power") {
            applyPostPower(root, btn.dataset.powerId, btn.dataset.tracked === "1");
            return;
        }

        if (action === "finalize-roll") {
            finalizeRoll(root);
            return;
        }

        if (action === "cancel-roll") {
            ui.pendingRoll = null;
            rerender(root);
            return;
        }
    });
}

function resetPendingSelection() {
    ui.archetypeKey = "rycerz";
    ui.graalDiceUsed = 0;
    ui.selectedBonusPowerIds.clear();
    ui.pendingRoll = null;
}

function doRoll(root) {
    const { state, data, session } = root._ctx;
    const activeKey = resolveActiveKey(state, session);
    const character = state.characters[activeKey];
    const transformation = data.transformations[activeKey];
    if (!character) return;

    const archetypeDice = archetypeCurrent(character.archetypes[ui.archetypeKey]);
    const bonusPowers = preRollBonusPowers(character, transformation)
        .filter(p => ui.selectedBonusPowerIds.has(p.id));
    const bonusDiceTotal = bonusPowers.reduce((sum, p) => sum + (p.effect.amount || 0), 0);
    const poolTotal = archetypeDice + ui.graalDiceUsed + bonusDiceTotal;

    let result = rollTestPool(poolTotal);
    const { result: afterPassive, applied: passiveApplied } = applyPassivePowers(character, transformation, result);
    result = afterPassive;

    ui.pendingRoll = {
        archetypeKey: ui.archetypeKey,
        archetypeLabel: archetypeLabel(data, ui.archetypeKey),
        archetypeDice,
        graalDice: ui.graalDiceUsed,
        preRollPowerIds: bonusPowers.map(p => p.id),
        postRollPowerIds: [], // uzupełniane przy apply-post-power
        appliedPowerNames: [...bonusPowers.map(p => p.name), ...passiveApplied],
        dice: result.dice,
        survivingDice: result.survivingDice,
        removedOnes: result.removedOnes,
        tier: result.tier,
        tierLabel: TEST_TIER_LABELS[result.tier] || result.tier,
        note: ""
    };
    rerender(root);
}

function applyPostPower(root, powerId, tracked) {
    const { state, data, session } = root._ctx;
    const activeKey = resolveActiveKey(state, session);
    const character = state.characters[activeKey];
    const transformation = data.transformations[activeKey];
    const pr = ui.pendingRoll;
    if (!character || !pr) return;

    const power = (transformation?.powers || []).find(p => p.id === powerId);
    if (!power) return;

    let result;
    if (power.effect.type === "reroll_ones") result = applyRerollOnes(pr.dice, power.effect.amount || 0);
    else if (power.effect.type === "reroll_all_ones") result = applyRerollAllOnes(pr.dice);
    else if (power.effect.type === "raise_lowest_die") result = applyRaiseLowestDie(pr.dice, power.effect.amount || 0);
    else return;

    pr.dice = result.dice;
    pr.survivingDice = result.survivingDice;
    pr.removedOnes = result.removedOnes;
    pr.tier = result.tier;
    pr.tierLabel = TEST_TIER_LABELS[result.tier] || result.tier;
    pr.appliedPowerNames.push(power.name);
    if (tracked) pr.postRollPowerIds.push(power.id);

    rerender(root);
}

function finalizeRoll(root) {
    const { state, data, session } = root._ctx;
    const activeKey = resolveActiveKey(state, session);
    const pr = ui.pendingRoll;
    if (!activeKey || !pr) return;

    const transformation = data.transformations[activeKey];
    const usedIds = [...pr.preRollPowerIds, ...pr.postRollPowerIds];
    let characterName = state.characters[activeKey]?.name || "";

    // Zużycie Kości Graala i oznaczenie Mocy jako użytych - jedna mutacja stanu, osobna od logRoll()
    // poniżej (który sam woła updateState - trzymamy te dwa wywołania rozłącznie, żeby nie zagnieżdżać
    // updateState w updateState, tak jak eventLog.js#logEvent + zewnętrzny updateState w character.js).
    updateState((s) => {
        const character = s.characters[activeKey];
        if (!character) return;
        characterName = character.name;

        if (pr.graalDice > 0) {
            s.graalDice.current = Math.max(0, s.graalDice.current - pr.graalDice);
            logEvent(s, "graal-dice-change", `${character.name}: użyto ${pr.graalDice} Kości Graala w teście (${pr.archetypeLabel}).`);
        }

        for (const id of usedIds) {
            character.usedPowers[id] = true;
            const power = (transformation?.powers || []).find(p => p.id === id);
            logEvent(s, "power-used", `${character.name}: moc „${power?.name || id}” użyta w teście (${pr.archetypeLabel}).`);
        }
    });

    logRoll({
        characterKey: activeKey,
        characterName,
        archetypeKey: pr.archetypeKey,
        archetypeLabel: pr.archetypeLabel,
        archetypeDice: pr.archetypeDice,
        graalDice: pr.graalDice,
        dice: pr.dice,
        tier: pr.tier,
        note: [pr.note, pr.appliedPowerNames.length ? `Moce: ${pr.appliedPowerNames.join(", ")}` : ""]
            .filter(Boolean).join(" - ")
    });

    resetPendingSelection();
    rerender(root);
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx);
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
