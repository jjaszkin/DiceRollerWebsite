// Dark Graal III - Dashboard Solo (MG). Zakładka "Rzuty" - rzut pulą k6 dla aktywnej postaci: wybór
// Archetypu (pula = wartość efektywna, patrz state.js#archetypeCurrent), opcjonalne dorzucenie
// Kości Graala (deklarowane każdorazowo do TEGO rzutu, maks. tyle, ile wynosi aktualna wartość
// wybranego Archetypu - bez żadnej współdzielonej/persystentnej puli), opcjonalne Moce zwiększające
// pulę PRZED rzutem, rzut, a następnie (jeśli dotyczy) Moce modyfikujące już rzucone kości
// (przerzut/podniesienie).
//
// UWAGA (zmiana zachowania - gracze NIE zatwierdzają już rzutu ręcznie): wynik trafia do wspólnej
// historii testów (rollLog.js) OD RAZU po rzuceniu kośćmi (patrz doRoll()), bez pośredniego kroku
// "Zatwierdź i zapisz do dziennika" - dawniej wymaganego, uznanego za zbędne tarcie przy stole.
// Jeśli gracz zastosuje potem Moc modyfikującą już rzucone kości (przerzut/podniesienie, patrz
// applyPostPower()), TEN SAM wpis w dzienniku jest aktualizowany w miejscu (po id zwróconym przez
// logRoll()), a nie dopisywany jako nowy - dziennik zawsze pokazuje ostateczny, po-Mocowy wynik.
// Moce (zarówno przed-, jak i po-rzutowe) są też oznaczane jako użyte NATYCHMIAST w chwili użycia,
// zamiast dopiero przy dawnym "zatwierdzeniu". Przycisk "Nowy rzut" tylko czyści lokalny podgląd
// (ui.pendingRoll) - nic już nie zapisuje, bo zapis nastąpił wcześniej.
//
// Ta zakładka zawiera też, poniżej rzutu, cały Dziennik kampanii (patrz panels/journal.js - moduł
// pomocniczy bez własnego DOM-owego root'a, wpięty tu bezpośrednio) - osobna zakładka "Dziennik"
// została zniesiona, a swobodne notatki nie są już nigdzie dodawane (tylko usuwalne przez MG, jeśli
// jakieś zostały z wcześniejszych testów).
//
// UWAGA (kontynuacja zastrzeżenia z utils.js): poniższa kategoryzacja Mocy na "przed rzutem"/"po
// rzucie"/"pasywna, autostosowana"/"nielimitowana narracyjna" jest rekonstrukcją opartą o pole
// `effect.usage` w data/transformations.json, wywiedzioną z tego, kiedy panels/character.js pokazuje
// przycisk "Oznacz jako użytą" (usage ∈ {session,scene,combat} → limitowana i śledzona; usage
// "narrative" → nielimitowana, nieśledzona; usage "passive" → zawsze aktywna, bez przycisku).
// Jeden przypadek szczególny: `party_bonus_dice` (np. "Cierniowa korona" Cadwyna) działa na PULĘ
// SOJUSZNIKÓW, nie własną - roller go nie automatyzuje w matematyce rzutu, tylko pokazuje jako
// informację (aktywację/zużycie tej Mocy nadal można ręcznie oznaczyć w panelu Postać).

import { updateState } from "../store.js";
import { logRoll } from "../rollLog.js";
import { logEvent } from "../eventLog.js";
import { archetypeCurrent } from "../state.js";
import { showToast } from "../toast.js";
import {
    escapeHtml, clamp, preserveScroll, TEST_TIER_LABELS, annotateDice,
    rollTestPool, applyRerollOnes, applyRerollAllOnes, applyRaiseLowestDie
} from "../utils.js";
import { buildJournalHtml, handleJournalAction } from "./journal.js";

const ARCHETYPE_ORDER = ["rycerz", "lowczy", "lotr", "kaplan", "czarownik"];

// Tryb "Bez Archetypu" - czasem gracz musi rzucić inną liczbą kości niż to, co ma w Archetypach
// (np. na polecenie MG) - zamiast wartości Archetypu pula bierze się z ręcznie wpisanej liczby
// (ui.freeDiceCount). Kości Graala nadal można dorzucić - ich limit to po prostu aktualna wielkość
// puli, którą by ona nie była (patrz currentPoolDice/graalMax w buildSetupHtml).
const FREE_ARCHETYPE_KEY = "none";

const DIE_STATE_CLASS = {
    one: "die-removed",
    cancelled: "die-cancelled",
    full: "die-full",
    success: "die-success",
    complication: "die-complication"
};

const ui = {
    selectedCharacterKey: null, // tylko dla MG, patrz resolveActiveKey()
    archetypeKey: "rycerz",
    freeDiceCount: 1, // tylko w trybie "Bez Archetypu" - patrz FREE_ARCHETYPE_KEY
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
    if (key === FREE_ARCHETYPE_KEY) return "Bez Archetypu";
    return data.archetypes.find(a => a.key === key)?.label || key;
}

/** Wielkość puli bazowej WYBRANEGO Archetypu, albo - w trybie "Bez Archetypu" - ręcznie wpisanej
 *  wolnej liczby kości (ui.freeDiceCount). Jedyne miejsce, które woła archetypeCurrent() na wybór
 *  gracza - character.archetypes[FREE_ARCHETYPE_KEY] nie istnieje, więc wywołanie wprost by rzuciło. */
function currentPoolDice(character, archetypeKey) {
    if (archetypeKey === FREE_ARCHETYPE_KEY) return Math.max(0, ui.freeDiceCount || 0);
    return archetypeCurrent(character.archetypes[archetypeKey]);
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

/** `graalCount` kości Graala = ostatnie `graalCount` pozycje w `dice` (patrz analogiczny komentarz
 *  w panels/journal.js#diceChipsHtml - umowne oznaczenie pochodzenia w puli, kości k6 są i.i.d.,
 *  więc nie ma znaczenia mechaniczne KTÓRE fizycznie kości "są" Graala, tylko ile ich było). */
function diceChipsHtml(dice, graalCount = 0) {
    const graalStart = dice.length - (graalCount || 0);
    return annotateDice(dice).map(({ value, state }, i) =>
        `<span class="die-chip ${DIE_STATE_CLASS[state] || ""} ${i >= graalStart ? "die-graal" : ""}">${value}</span>`
    ).join("");
}

function buildSetupHtml(state, data, character, transformation, archetypeDice) {
    const graalMax = archetypeDice;
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
    const isFree = ui.archetypeKey === FREE_ARCHETYPE_KEY;
    const poolSourceLabel = isFree ? "wolnej puli" : "Archetypu";

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
                <button class="archetype-chip ${isFree ? "archetype-chip-active" : ""}"
                    data-action="select-archetype" data-key="${FREE_ARCHETYPE_KEY}">
                    Bez Archetypu
                </button>
            </div>
            ${isFree ? `
                <label class="mg-inline-field">Liczba kości (wolna pula)
                    <input type="number" min="0" class="mg-input-num" id="rollerFreeDiceCount" value="${ui.freeDiceCount}">
                </label>
            ` : ""}

            <h3>Kości Graala</h3>
            <p class="placeholder">Pula Kości Graala nie jest współdzielona - deklarujesz ją każdorazowo do TEGO rzutu, maksymalnie tyle, ile wynosi aktualna wielkość ${poolSourceLabel} (${graalMax}).</p>
            <div class="stat-controls">
                <button class="btn btn-xs" data-action="graal-dec">−</button>
                <span>${ui.graalDiceUsed} <span class="placeholder">(maks. ${graalMax})</span></span>
                <button class="btn btn-xs" data-action="graal-inc">+</button>
            </div>

            ${bonusHtml ? `<h3>Moce (przed rzutem)</h3><div class="powers-checklist">${bonusHtml}</div>` : ""}

            <div class="roller-pool-summary">
                Pula testu: <strong>${poolTotal}</strong>
                <span class="placeholder">(${archetypeDice} z ${poolSourceLabel} + ${ui.graalDiceUsed} Graala${bonusDiceTotal ? ` + ${bonusDiceTotal} z Mocy` : ""})</span>
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
            <div class="dice-row">${diceChipsHtml(pr.dice, pr.graalDice)}</div>
            <p class="placeholder">Jedynki: ${pr.oneIndices.length} (anulowały ${pr.cancelledIndices.length} najwyższych kości)</p>
            <p class="placeholder">✓ Zapisano do dziennika kampanii.</p>
            ${appliedHtml}

            ${(trackedPowers.length || narrativePowers.length) ? `
                <h4>Moce (po rzucie)</h4>
                <div class="powers-checklist">
                    ${powerButtonsHtml(trackedPowers, true)}
                    ${powerButtonsHtml(narrativePowers, false)}
                </div>
            ` : ""}

            <div class="roller-actions">
                <button class="btn btn-gold" data-action="new-roll">Nowy rzut</button>
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
    const archetypeDice = currentPoolDice(character, ui.archetypeKey);

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
            <h2>Rzut - ${escapeHtml(character.name)}</h2>
            ${ui.pendingRoll ? buildPendingRollHtml(character, transformation) : buildSetupHtml(state, data, character, transformation, archetypeDice)}
        </div>
        <div class="card">
            ${buildJournalHtml(ctx)}
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
            return;
        }
        if (e.target.id === "rollerFreeDiceCount") {
            const { state, session } = root._ctx;
            const activeKey = resolveActiveKey(state, session);
            const character = state.characters[activeKey];
            ui.freeDiceCount = Math.max(0, parseInt(e.target.value, 10) || 0);
            if (character) {
                ui.graalDiceUsed = clamp(ui.graalDiceUsed, 0, currentPoolDice(character, ui.archetypeKey));
            }
            rerender(root);
        }
    });

    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "select-archetype") {
            const { state, session } = root._ctx;
            const activeKey = resolveActiveKey(state, session);
            const character = state.characters[activeKey];
            ui.archetypeKey = btn.dataset.key;
            if (character) {
                const newMax = currentPoolDice(character, ui.archetypeKey);
                ui.graalDiceUsed = clamp(ui.graalDiceUsed, 0, newMax);
            }
            rerender(root);
            return;
        }

        if (action === "graal-inc" || action === "graal-dec") {
            const { state, session } = root._ctx;
            const activeKey = resolveActiveKey(state, session);
            const character = state.characters[activeKey];
            const max = character ? currentPoolDice(character, ui.archetypeKey) : 0;
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

        if (action === "new-roll") {
            resetPendingSelection();
            rerender(root);
            return;
        }

        // Akcje dziennika (usuwanie wpisów/czyszczenie historii, tylko MG) - patrz panels/journal.js.
        if (handleJournalAction(action, btn, root._ctx)) {
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

    const archetypeDice = currentPoolDice(character, ui.archetypeKey);
    const bonusPowers = preRollBonusPowers(character, transformation)
        .filter(p => ui.selectedBonusPowerIds.has(p.id));
    const bonusDiceTotal = bonusPowers.reduce((sum, p) => sum + (p.effect.amount || 0), 0);
    const poolTotal = archetypeDice + ui.graalDiceUsed + bonusDiceTotal;

    let result = rollTestPool(poolTotal);
    const { result: afterPassive, applied: passiveApplied } = applyPassivePowers(character, transformation, result);
    result = afterPassive;

    const archetypeLabelStr = archetypeLabel(data, ui.archetypeKey);
    const appliedPowerNames = [...bonusPowers.map(p => p.name), ...passiveApplied];

    // Moce dorzucające kości PRZED rzutem są już "zużyte" w chwili rzutu (nie ma już osobnego kroku
    // zatwierdzania) - oznacz je od razu, patrz nagłówek pliku.
    updateState((s) => {
        const ch = s.characters[activeKey];
        if (!ch) return;
        for (const p of bonusPowers) {
            ch.usedPowers[p.id] = true;
            logEvent(s, "power-used", `${ch.name}: moc „${p.name}” użyta w teście (${archetypeLabelStr}).`);
        }
    });

    // Rzut trafia do wspólnego dziennika OD RAZU (bez czekania na zatwierdzenie) - id zwrócony przez
    // logRoll() pozwala późniejszym Mocom po rzucie (patrz applyPostPower) zaktualizować TEN SAM wpis.
    const rollId = logRoll({
        characterKey: activeKey,
        characterName: character.name,
        archetypeKey: ui.archetypeKey,
        archetypeLabel: archetypeLabelStr,
        archetypeDice,
        graalDice: ui.graalDiceUsed,
        dice: result.dice,
        tier: result.tier,
        note: appliedPowerNames.length ? `Moce: ${appliedPowerNames.join(", ")}` : ""
    });

    ui.pendingRoll = {
        rollId,
        archetypeKey: ui.archetypeKey,
        archetypeLabel: archetypeLabelStr,
        archetypeDice,
        graalDice: ui.graalDiceUsed,
        appliedPowerNames,
        dice: result.dice,
        survivingDice: result.survivingDice,
        oneIndices: result.oneIndices,
        cancelledIndices: result.cancelledIndices,
        tier: result.tier,
        tierLabel: TEST_TIER_LABELS[result.tier] || result.tier
    };
    showToast("Zapisano do dziennika");
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
    pr.oneIndices = result.oneIndices;
    pr.cancelledIndices = result.cancelledIndices;
    pr.tier = result.tier;
    pr.tierLabel = TEST_TIER_LABELS[result.tier] || result.tier;
    pr.appliedPowerNames.push(power.name);

    const noteText = pr.appliedPowerNames.length ? `Moce: ${pr.appliedPowerNames.join(", ")}` : "";

    // Wpis w dzienniku istnieje już od doRoll() - Moc po rzucie aktualizuje TEN SAM wpis (po
    // pr.rollId) w miejscu, zamiast dopisywać nowy, i (jeśli limitowana) od razu oznacza się jako
    // użyta - nie ma już osobnego kroku "zatwierdzenia", który wcześniej to odraczał.
    updateState((s) => {
        if (tracked) {
            const ch = s.characters[activeKey];
            if (ch) {
                ch.usedPowers[power.id] = true;
                logEvent(s, "power-used", `${ch.name}: moc „${power.name}” użyta w teście (${pr.archetypeLabel}).`);
            }
        }
        const entry = (s.rollHistory || []).find(r => r.id === pr.rollId);
        if (entry) {
            entry.dice = pr.dice;
            entry.tier = pr.tier;
            entry.tierLabel = pr.tierLabel;
            entry.note = noteText;
        }
    });

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
