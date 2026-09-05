// Battle Tracker - Klątwa Strahda. Panel akcji (8 kolumn): przełącznik uczestników (niezależny od
// trackera inicjatywy, patrz initiativePanel.js), statblok, tor PW/KP, stany, dodatkowe liczniki
// (np. Latająca Czaszka) i akcje (jako taby Akcje/Akcje Dodatkowe/Reakcje/Czary) z pełnym auto-rzutem.
//
// Rzuty obronne: auto dla potworów/NPC (bonus wyliczony ze statbloku), ręczne wpisanie wyniku dla
// celów typu BG (gracz rzuca fizycznie przy stole) - patrz resolveActionOnce().
//
// WAŻNE: `participant.hp`/`participant.conditions` bywają `undefined` po przeładowaniu, jeśli były
// puste/null w chwili ostatniego zapisu - Firebase Realtime Database usuwa takie klucze przy
// zapisie (patrz rollLog.js). Dlatego każda mutacja tych pól musi się zabezpieczyć przez `??=`
// zamiast zakładać, że obiekt/tablica już istnieje - inaczej całe wywołanie updateState rzuca
// wyjątkiem w środku i NIC się nie zapisuje ani nie odświeża (żaden inny fragment tej samej
// mutacji też nie dojdzie do skutku).

import { updateState } from "../store.js";
import { escapeHtml, uid, clamp } from "../utils.js";
import { resolveAttack, resolveDamage, resolveSave, applyDamageMitigation } from "../diceEngine.js";
import { buildStatblockHeaderHtml, buildTraitsHtml } from "../components/statblock.js";
import { buildConditionPickerHtml, CONDITION_INFO } from "../components/conditionPicker.js";
import { participantDisplayName, participantPortrait } from "../components/participantDisplay.js";
import { logEntry } from "../rollLog.js";

const DAMAGE_TYPES = [
    "obuchowe", "kłute", "sieczące", "kwas", "zimno", "ogień", "siłowe",
    "piorunowe", "nekrotyczne", "trujące", "psychiczne", "promieniste", "dźwiękowe"
];

const ABILITY_KEY_BY_LABEL = { "Sił": "str", "Zwi": "dex", "Kon": "con", "Int": "int", "Mdr": "wis", "Cha": "cha" };

// Czysto lokalny stan UI (nie zapisywany do Firebase) - który tab akcji jest otwarty per
// uczestnik, żeby przetrwał kolejne re-rendery w tej samej sesji przeglądarki (ale nie
// przeładowanie strony - to celowo tylko wygoda, nie stan gry).
const selectedActionGroupByParticipant = {};

// Wybór, KTÓREGO uczestnika ogląda się tutaj, jest CELOWO niezależny od tego, kto jest oznaczony
// jako "na ruchu" w trackerze inicjatywy (initiativePanel.js#currentTurnInstanceId) - można więc
// przeglądać kartę jednego uczestnika, mając w inicjatywie zaznaczonego zupełnie innego.
export function renderActionPanel(root, { state, battle, selectedId, onSelect }) {
    const participant = battle.participants.find((p) => p.instanceId === selectedId);

    root.innerHTML = `
        <div class="card action-panel">
            <div class="participant-tabs">
                ${battle.participants.map((p) => `
                    <button type="button" class="tab-btn participant-tab-btn ${p.instanceId === selectedId ? "active" : ""}" data-select-participant="${p.instanceId}">${escapeHtml(participantDisplayName(state, p))}</button>
                `).join("") || '<p class="placeholder">Brak uczestników.</p>'}
            </div>
            <div class="action-panel-body" id="actionPanelBody"></div>
        </div>
    `;

    root.querySelectorAll("[data-select-participant]").forEach((btn) => {
        btn.addEventListener("click", () => onSelect(btn.dataset.selectParticipant));
    });

    const bodyRoot = root.querySelector("#actionPanelBody");
    if (!participant) {
        bodyRoot.innerHTML = '<p class="placeholder">Wybierz uczestnika z listy powyżej.</p>';
        return;
    }

    if (participant.sourceType === "party") {
        renderPartyCard(bodyRoot, { state, battle, participant });
    } else {
        renderMonsterCard(bodyRoot, { state, battle, participant });
    }
}

// BG zwykle nie mają akcji (gracze rzucają fizycznie przy stole) - ale sojusznik-NPC pod
// kontrolą GM w bibliotece BG (np. Ireena Kolyana) może mieć actions/bonusActions/reactions
// tak jak potwór. Karta rozszerza się o statblok/cel/taby akcji TYLKO gdy faktycznie coś tam jest.
function renderPartyCard(root, { state, battle, participant }) {
    const portrait = participantPortrait(state, participant);
    const partyEntry = state.library.party[participant.sourceId];
    const groupDefs = partyEntry ? [
        { key: "actions", label: "Akcje", actions: partyEntry.actions },
        { key: "bonus", label: "Akcje Dodatkowe", actions: partyEntry.bonusActions },
        { key: "reactions", label: "Reakcje", actions: partyEntry.reactions, countText: partyEntry.reactionLimit ? `${participant.reactionsUsedThisRound || 0}/${partyEntry.reactionLimit}` : "" }
    ].filter((g) => g.actions?.length) : [];
    const hasActions = groupDefs.length > 0;
    const otherParticipants = battle.participants.filter((p) => p.instanceId !== participant.instanceId);
    const storedGroupKey = selectedActionGroupByParticipant[participant.instanceId];
    const activeGroupKey = groupDefs.some((g) => g.key === storedGroupKey) ? storedGroupKey : groupDefs[0]?.key;

    root.innerHTML = `
        <div class="participant-card">
            ${portrait ? `<img class="participant-card-portrait" src="${escapeHtml(portrait)}" alt="">` : ""}
            <h3>${escapeHtml(participant.name)}</h3>
            <div class="hp-row">
                <label>PW aktualne <input type="number" class="pc-hp-current-input" value="${participant.hp?.current ?? ""}"></label>
                <label>PW maks. <input type="number" class="pc-hp-max-input" value="${participant.hp?.max ?? ""}"></label>
                <label>KP <input type="number" class="pc-ac-input" value="${participant.ac ?? ""}"></label>
            </div>
            ${participant.acNote ? `<p class="ac-note">KP: ${escapeHtml(participant.acNote)}</p>` : ""}
            ${renderDamageForm()}
            ${renderConditionsBlock(participant, partyEntry?.conditionImmunities)}
            ${hasActions ? `
                <label class="target-select-row">Cel akcji
                    <select class="action-target-select">
                        <option value="">- wybierz cel -</option>
                        ${otherParticipants.map((p) => `<option value="${p.instanceId}">${escapeHtml(participantDisplayName(state, p))}</option>`).join("")}
                    </select>
                </label>
                ${buildStatblockHeaderHtml({ ...partyEntry, label: participant.name }, { skipHpAc: true })}
                ${buildTraitsHtml(partyEntry.traits)}
                <div class="action-group-tabs">
                    ${groupDefs.map((g) => `
                        <button type="button" class="tab-btn action-group-tab-btn ${g.key === activeGroupKey ? "active" : ""}" data-group-tab="${g.key}">${escapeHtml(g.label)}${g.countText ? ` <span class="action-group-count">${escapeHtml(g.countText)}</span>` : ""}</button>
                    `).join("")}
                </div>
                ${groupDefs.map((g) => `
                    <div class="action-group-panel ${g.key === activeGroupKey ? "" : "hidden"}" data-group-panel="${g.key}">
                        <div class="action-list">${g.actions.map(renderActionRow).join("")}</div>
                    </div>
                `).join("")}
            ` : ""}
        </div>
    `;

    wireHpFields(root, battle.id, participant.instanceId);
    wireDamageForm(root, { battle, participant, mitigationTarget: partyEntry || null });
    wireConditionsBlock(root, battle.id, participant.instanceId);

    if (!hasActions) return;

    root.querySelectorAll(".action-group-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.groupTab;
            selectedActionGroupByParticipant[participant.instanceId] = key;
            root.querySelectorAll(".action-group-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.groupTab === key));
            root.querySelectorAll(".action-group-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.groupPanel !== key));
        });
    });

    const getTarget = () => {
        const id = root.querySelector(".action-target-select")?.value;
        return id ? battle.participants.find((p) => p.instanceId === id) || null : null;
    };
    const getTargetForm = (target) => {
        if (!target || target.sourceType !== "monster") return null;
        const tm = state.library.monsters[target.sourceId];
        return tm?.forms.find((f) => f.formId === target.formId) || null;
    };

    wireActionButtons(root, { battle, actor: participant, actorForm: partyEntry, getTarget, getTargetForm });
}

function renderMonsterCard(root, { state, battle, participant }) {
    const monster = state.library.monsters[participant.sourceId];
    const form = monster?.forms.find((f) => f.formId === participant.formId) || monster?.forms[0];

    if (!monster || !form) {
        root.innerHTML = '<p class="placeholder">Brak danych statbloku (usunięto z biblioteki?).</p>';
        return;
    }

    const otherParticipants = battle.participants.filter((p) => p.instanceId !== participant.instanceId);
    const formOptions = monster.forms
        .map((f) => `<option value="${f.formId}" ${f.formId === participant.formId ? "selected" : ""}>${escapeHtml(f.label)}</option>`)
        .join("");

    // "Rzucanie Zaklęć" (akcja z zagnieżdżonymi `spells`) jedzie na górę taba Czary jako karta z
    // opisem ogólnym (zdolność zaklinania, ZB, pełna lista) - nie zostaje duplikatem w Akcjach.
    const spellcastingActions = (form.actions || []).filter((a) => a.spells?.length);
    const nonSpellActions = (form.actions || []).filter((a) => !a.spells?.length);
    const spellActions = spellcastingActions.flatMap((a) => a.spells || []);
    const groupDefs = [
        { key: "actions", label: "Akcje", actions: nonSpellActions },
        { key: "bonus", label: "Akcje Dodatkowe", actions: form.bonusActions },
        { key: "reactions", label: "Reakcje", actions: form.reactions, countText: form.reactionLimit ? `${participant.reactionsUsedThisRound || 0}/${form.reactionLimit}` : "" },
        { key: "spells", label: "Czary", actions: [...spellcastingActions, ...spellActions] }
    ].filter((g) => g.actions?.length);
    const storedGroupKey = selectedActionGroupByParticipant[participant.instanceId];
    const activeGroupKey = groupDefs.some((g) => g.key === storedGroupKey) ? storedGroupKey : groupDefs[0]?.key;
    const portrait = participantPortrait(state, participant);

    root.innerHTML = `
        <div class="participant-card">
            ${portrait ? `<img class="participant-card-portrait" src="${escapeHtml(portrait)}" alt="">` : ""}
            <div class="participant-card-head">
                <h3>${escapeHtml(participantDisplayName(state, participant))}</h3>
                ${monster.forms.length > 1 ? `<label class="form-switch">Forma <select class="form-switch-select">${formOptions}</select></label>` : ""}
            </div>

            <div class="hp-row">
                <label>PW aktualne <input type="number" class="mon-hp-current-input" value="${participant.hp?.current ?? ""}"></label>
                <label>PW maks. <input type="number" class="mon-hp-max-input" value="${participant.hp?.max ?? ""}"></label>
                <label>KP <input type="number" class="mon-ac-input" value="${participant.ac ?? ""}"></label>
            </div>

            ${renderDamageForm()}
            ${renderConditionsBlock(participant, form.conditionImmunities)}
            ${participant.secondaryTrackers?.length ? renderSecondaryTrackers(participant) : ""}

            <label class="target-select-row">Cel akcji
                <select class="action-target-select">
                    <option value="">- wybierz cel -</option>
                    ${otherParticipants.map((p) => `<option value="${p.instanceId}">${escapeHtml(participantDisplayName(state, p))}</option>`).join("")}
                </select>
            </label>

            ${buildStatblockHeaderHtml(form, { skipHpAc: true })}
            ${buildTraitsHtml(form.traits)}

            ${groupDefs.length ? `
                <div class="action-group-tabs">
                    ${groupDefs.map((g) => `
                        <button type="button" class="tab-btn action-group-tab-btn ${g.key === activeGroupKey ? "active" : ""}" data-group-tab="${g.key}">${escapeHtml(g.label)}${g.countText ? ` <span class="action-group-count">${escapeHtml(g.countText)}</span>` : ""}</button>
                    `).join("")}
                </div>
                ${groupDefs.map((g) => `
                    <div class="action-group-panel ${g.key === activeGroupKey ? "" : "hidden"}" data-group-panel="${g.key}">
                        <div class="action-list">${g.actions.map(renderActionRow).join("")}</div>
                    </div>
                `).join("")}
            ` : ""}
        </div>
    `;

    wireHpFields(root, battle.id, participant.instanceId);
    wireDamageForm(root, { battle, participant, mitigationTarget: form });
    wireConditionsBlock(root, battle.id, participant.instanceId);
    if (participant.secondaryTrackers?.length) wireSecondaryTrackers(root, battle.id, participant.instanceId);

    root.querySelectorAll(".action-group-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const key = btn.dataset.groupTab;
            selectedActionGroupByParticipant[participant.instanceId] = key;
            root.querySelectorAll(".action-group-tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.groupTab === key));
            root.querySelectorAll(".action-group-panel").forEach((p) => p.classList.toggle("hidden", p.dataset.groupPanel !== key));
        });
    });

    root.querySelector(".form-switch-select")?.addEventListener("change", (e) => {
        const newForm = monster.forms.find((f) => f.formId === e.target.value);
        if (!newForm) return;
        updateState((s) => {
            const b = s.battles[battle.id];
            const p = b.participants.find((x) => x.instanceId === participant.instanceId);
            p.formId = newForm.formId;
            p.ac = newForm.ac ?? null;
            p.hp = { current: newForm.hp?.max ?? null, max: newForm.hp?.max ?? null };
            p.conditions = [];
            p.reactionsUsedThisRound = 0;
            p.secondaryTrackers = (newForm.secondaryTrackers || []).map((t) => ({
                id: t.id, label: t.label, ac: t.ac ?? null,
                hp: { current: t.hp?.max ?? null, max: t.hp?.max ?? null }, active: false,
                acBonus: t.acBonus ?? 0
            }));
            logEntry(s, battle.id, "event", `${escapeHtml(p.name)} zmienia formę na: ${escapeHtml(newForm.label)}.`);
        });
    });

    const getTarget = () => {
        const id = root.querySelector(".action-target-select")?.value;
        return id ? battle.participants.find((p) => p.instanceId === id) || null : null;
    };
    const getTargetForm = (target) => {
        if (!target || target.sourceType !== "monster") return null;
        const tm = state.library.monsters[target.sourceId];
        return tm?.forms.find((f) => f.formId === target.formId) || null;
    };

    wireActionButtons(root, { battle, actor: participant, actorForm: form, getTarget, getTargetForm });
}

// -- Bloki wspólne (PW/KP/obrażenia, stany, dodatkowe liczniki) -------------------------------

function renderDamageForm() {
    return `
        <div class="damage-form">
            <input type="number" class="damage-amount-input" min="0" placeholder="Ilość">
            <select class="damage-type-select">
                ${DAMAGE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
            </select>
            <button type="button" class="btn btn-sm damage-apply-btn">Zadaj obrażenia</button>
            <button type="button" class="btn btn-sm btn-secondary heal-apply-btn">Ulecz</button>
        </div>
    `;
}

function wireDamageForm(root, { battle, participant, mitigationTarget }) {
    root.querySelector(".damage-apply-btn").addEventListener("click", () => {
        const amountInput = root.querySelector(".damage-amount-input");
        const amount = Number(amountInput.value) || 0;
        const type = root.querySelector(".damage-type-select").value;
        if (amount <= 0) return;
        const { adjusted, note } = applyDamageMitigation(amount, type, mitigationTarget);
        updateState((s) => {
            const p = s.battles[battle.id].participants.find((x) => x.instanceId === participant.instanceId);
            p.hp ??= { current: null, max: null };
            if (p.hp.current == null) p.hp.current = p.hp.max ?? 0;
            p.hp.current = clamp(p.hp.current - adjusted, 0, p.hp.max ?? p.hp.current);
            logEntry(s, battle.id, "damage", `${escapeHtml(p.name)} otrzymuje ${adjusted} obrażeń (${escapeHtml(type)})${note ? ` [${note}, surowo: ${amount}]` : ""}. PW: ${p.hp.current}/${p.hp.max ?? "-"}.`);
        });
        amountInput.value = "";
    });

    root.querySelector(".heal-apply-btn").addEventListener("click", () => {
        const amountInput = root.querySelector(".damage-amount-input");
        const amount = Number(amountInput.value) || 0;
        if (amount <= 0) return;
        updateState((s) => {
            const p = s.battles[battle.id].participants.find((x) => x.instanceId === participant.instanceId);
            p.hp ??= { current: null, max: null };
            if (p.hp.current == null) p.hp.current = 0;
            p.hp.current = clamp(p.hp.current + amount, 0, p.hp.max ?? (p.hp.current + amount));
            logEntry(s, battle.id, "damage", `${escapeHtml(p.name)} leczy ${amount} PW. PW: ${p.hp.current}/${p.hp.max ?? "-"}.`);
        });
        amountInput.value = "";
    });
}

function renderConditionsBlock(participant, immunities = []) {
    const chips = (participant.conditions || []).map((c) => {
        const info = CONDITION_INFO[c.label] || "";
        return `
            <span class="condition-chip${info ? " info-tip" : ""}"${info ? ` data-tooltip="${escapeHtml(info)}"` : ""}>${escapeHtml(c.label)}${c.note ? `: ${escapeHtml(c.note)}` : ""} <button type="button" class="chip-remove" data-remove-condition="${c.id}">×</button></span>
        `;
    }).join("");
    return `
        <div class="conditions-block">
            <h4>Stany</h4>
            <div class="conditions-chip-row">${chips || '<span class="placeholder">Brak</span>'}</div>
            ${buildConditionPickerHtml(immunities)}
        </div>
    `;
}

function wireConditionsBlock(root, battleId, instanceId) {
    root.querySelectorAll("[data-remove-condition]").forEach((btn) => {
        btn.addEventListener("click", () => {
            updateState((s) => {
                const p = s.battles[battleId].participants.find((x) => x.instanceId === instanceId);
                p.conditions = (p.conditions || []).filter((c) => c.id !== btn.dataset.removeCondition);
            });
        });
    });

    root.querySelectorAll('[data-action="add-condition"]').forEach((btn) => {
        btn.addEventListener("click", () => {
            updateState((s) => {
                const p = s.battles[battleId].participants.find((x) => x.instanceId === instanceId);
                p.conditions ??= [];
                p.conditions.push({ id: uid(), label: btn.dataset.label, note: "" });
            });
        });
    });

    root.querySelector('[data-action="add-custom-condition"]')?.addEventListener("click", () => {
        const input = root.querySelector(".condition-custom-input");
        const text = input.value.trim();
        if (!text) return;
        updateState((s) => {
            const p = s.battles[battleId].participants.find((x) => x.instanceId === instanceId);
            p.conditions ??= [];
            p.conditions.push({ id: uid(), label: text, note: "" });
        });
        input.value = "";
    });
}

function renderSecondaryTrackers(participant) {
    return `
        <div class="secondary-trackers">
            <h4>Dodatkowe liczniki</h4>
            ${participant.secondaryTrackers.map((t) => `
                <div class="secondary-tracker-row" data-tracker-id="${t.id}">
                    <label class="tracker-active"><input type="checkbox" class="tracker-active-check" ${t.active ? "checked" : ""}> ${escapeHtml(t.label)}${t.acBonus ? ` (${t.acBonus > 0 ? "+" : ""}${t.acBonus} KP gdy aktywna)` : ""}</label>
                    <label>PW <input type="number" class="tracker-hp-input" value="${t.hp?.current ?? ""}"> / ${t.hp?.max ?? "-"}</label>
                    <label>KP <input type="number" class="tracker-ac-input" value="${t.ac ?? ""}"></label>
                </div>
            `).join("")}
        </div>
    `;
}

function wireSecondaryTrackers(root, battleId, instanceId) {
    root.querySelectorAll(".secondary-tracker-row").forEach((rowEl) => {
        const trackerId = rowEl.dataset.trackerId;
        rowEl.querySelector(".tracker-active-check").addEventListener("change", (e) => {
            updateState((s) => {
                const p = s.battles[battleId].participants.find((x) => x.instanceId === instanceId);
                const t = p.secondaryTrackers.find((x) => x.id === trackerId);
                const wasActive = t.active;
                t.active = e.target.checked;
                // Jedyny licznik z realnym efektem mechanicznym na razie (acBonus) - np. Latająca
                // Czaszka nalicza/odejmuje +5 KP uczestnika po (od)znaczeniu "aktywna", zamiast być
                // czystym oznaczeniem bez wpływu na rozgrywkę.
                if (t.acBonus && t.active !== wasActive) {
                    p.ac = (p.ac ?? 0) + (t.active ? t.acBonus : -t.acBonus);
                    logEntry(s, battleId, "event", `${escapeHtml(p.name)}: ${escapeHtml(t.label)} ${t.active ? "aktywna" : "nieaktywna"} (KP ${t.active ? "+" : "-"}${Math.abs(t.acBonus)} → ${p.ac}).`);
                }
            });
        });
        rowEl.querySelector(".tracker-hp-input").addEventListener("change", (e) => {
            updateState((s) => {
                const p = s.battles[battleId].participants.find((x) => x.instanceId === instanceId);
                const t = p.secondaryTrackers.find((x) => x.id === trackerId);
                t.hp ??= { current: null, max: null };
                const val = Number(e.target.value) || 0;
                t.hp.current = clamp(val, 0, t.hp.max ?? val);
            });
        });
        rowEl.querySelector(".tracker-ac-input").addEventListener("change", (e) => {
            updateState((s) => {
                const p = s.battles[battleId].participants.find((x) => x.instanceId === instanceId);
                p.secondaryTrackers.find((x) => x.id === trackerId).ac = e.target.value === "" ? null : Number(e.target.value);
            });
        });
    });
}

function wireHpFields(root, battleId, instanceId) {
    const prefix = root.querySelector(".pc-hp-current-input") ? "pc" : "mon";
    root.querySelector(`.${prefix}-hp-current-input`).addEventListener("change", (e) => {
        const val = e.target.value === "" ? null : Number(e.target.value);
        updateState((s) => {
            const p = s.battles[battleId].participants.find((x) => x.instanceId === instanceId);
            p.hp ??= { current: null, max: null };
            p.hp.current = val;
        });
    });
    root.querySelector(`.${prefix}-hp-max-input`).addEventListener("change", (e) => {
        const val = e.target.value === "" ? null : Number(e.target.value);
        updateState((s) => {
            const p = s.battles[battleId].participants.find((x) => x.instanceId === instanceId);
            p.hp ??= { current: null, max: null };
            p.hp.max = val;
        });
    });
    root.querySelector(`.${prefix}-ac-input`).addEventListener("change", (e) => {
        const val = e.target.value === "" ? null : Number(e.target.value);
        updateState((s) => { s.battles[battleId].participants.find((x) => x.instanceId === instanceId).ac = val; });
    });
}

// -- Akcje --------------------------------------------------------------------------------------

function renderActionRow(action) {
    const damageText = action.damage?.length
        ? action.damage.map((d) => `${escapeHtml(d.formula)} ${escapeHtml(d.type)}`).join(" + ")
        : "";
    const meta = [];
    if (action.attackBonus != null) meta.push(`+${action.attackBonus} do trafienia`);
    if (action.reach) meta.push(`zasięg ${escapeHtml(action.reach)}`);
    if (action.save) meta.push(`ZB ${action.save.dc} (${escapeHtml(action.save.ability)})`);
    if (damageText) meta.push(damageText);

    let buttons = "";
    if (action.kind === "multiattack" && action.multiattackOptions?.length) {
        buttons = action.multiattackOptions
            .map((opt, i) => `<button type="button" class="btn btn-xs use-multiattack-btn" data-action-id="${action.id}" data-option-index="${i}">${escapeHtml(opt.label)}</button>`)
            .join("");
    } else if (action.kind === "attack" || action.kind === "save" || action.kind === "damage") {
        buttons = `
            <button type="button" class="btn btn-xs use-action-btn" data-action-id="${action.id}">Rzuć</button>
            <button type="button" class="btn btn-xs btn-secondary log-action-btn" data-action-id="${action.id}">Użyj</button>
        `;
    } else {
        buttons = `<button type="button" class="btn btn-xs btn-secondary log-action-btn" data-action-id="${action.id}">Użyj</button>`;
    }

    return `
        <div class="action-card" data-action-card="${action.id}">
            <div class="action-card-head">
                <strong>${escapeHtml(action.name)}</strong>
                ${meta.length ? `<span class="action-meta">${meta.join(" - ")}</span>` : ""}
            </div>
            ${action.text ? `<p class="action-text">${escapeHtml(action.text)}</p>` : ""}
            <div class="action-buttons">${buttons}</div>
        </div>
    `;
}

function findAction(form, actionId) {
    const groups = [form.actions, form.bonusActions, form.reactions];
    for (const group of groups) {
        for (const a of group || []) {
            if (a.id === actionId) return a;
            const nested = (a.spells || []).find((sp) => sp.id === actionId);
            if (nested) return nested;
        }
    }
    return null;
}

function wireActionButtons(root, { battle, actor, actorForm, getTarget, getTargetForm }) {
    const reactionIds = new Set((actorForm.reactions || []).map((r) => r.id));

    /** Zużywa jedną reakcję z puli tego uczestnika na tę rundę, jeśli akcja jest reakcją i forma ma
     *  ustawiony limit. Zwraca `false` (i loguje wpis o zablokowaniu) gdy limit jest wyczerpany. */
    function tryConsumeReaction(s, action) {
        if (!reactionIds.has(action.id) || !actorForm.reactionLimit) return true;
        const liveActor = s.battles[battle.id].participants.find((p) => p.instanceId === actor.instanceId);
        const used = liveActor.reactionsUsedThisRound || 0;
        if (used >= actorForm.reactionLimit) {
            logEntry(s, battle.id, "event", `${escapeHtml(actor.name)} nie może użyć reakcji <strong>${escapeHtml(action.name)}</strong> - limit ${actorForm.reactionLimit} reakcji na rundę wyczerpany.`);
            return false;
        }
        liveActor.reactionsUsedThisRound = used + 1;
        return true;
    }

    root.querySelectorAll(".use-action-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const action = findAction(actorForm, btn.dataset.actionId);
            if (!action) return;
            const target = getTarget();
            const targetForm = getTargetForm(target);
            updateState((s) => {
                if (!tryConsumeReaction(s, action)) return;
                const line = resolveActionOnce({ s, battleId: battle.id, actorName: actor.name, action, targetInstanceId: target?.instanceId ?? null, targetForm });
                logEntry(s, battle.id, "roll", line);
            });
        });
    });

    root.querySelectorAll(".log-action-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const action = findAction(actorForm, btn.dataset.actionId);
            if (!action) return;
            updateState((s) => {
                if (!tryConsumeReaction(s, action)) return;
                logEntry(s, battle.id, "event", `${escapeHtml(actor.name)} używa: ${escapeHtml(action.name)}.`);
            });
        });
    });

    root.querySelectorAll(".use-multiattack-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const action = findAction(actorForm, btn.dataset.actionId);
            const option = action?.multiattackOptions?.[Number(btn.dataset.optionIndex)];
            if (!option) return;
            const target = getTarget();
            const targetForm = getTargetForm(target);
            updateState((s) => {
                const lines = [];
                for (const rep of option.repeat) {
                    const subAction = findAction(actorForm, rep.actionId);
                    if (!subAction) continue;
                    for (let i = 0; i < rep.times; i++) {
                        lines.push(resolveActionOnce({ s, battleId: battle.id, actorName: actor.name, action: subAction, targetInstanceId: target?.instanceId ?? null, targetForm }));
                    }
                }
                logEntry(s, battle.id, "roll", `${escapeHtml(actor.name)} używa <strong>${escapeHtml(action.name)}</strong> (${escapeHtml(option.label)}):<br>${lines.join("<br>")}`);
            });
        });
    });
}

function parseMonsterSaveBonus(targetForm, abilityLabel) {
    const re = new RegExp(`${abilityLabel}\\s*([+-]\\s*\\d+)`, "i");
    const m = re.exec(targetForm?.savingThrows || "");
    if (m) return Number(m[1].replace(/\s+/g, ""));
    const key = ABILITY_KEY_BY_LABEL[abilityLabel];
    const score = targetForm?.abilities?.[key] ?? 10;
    return Math.floor((score - 10) / 2);
}

function applyDamageToParticipant(target, adjustedAmount) {
    target.hp ??= { current: null, max: null };
    if (target.hp.current == null) target.hp.current = target.hp.max ?? 0;
    target.hp.current = clamp(target.hp.current - adjustedAmount, 0, target.hp.max ?? target.hp.current);
}

/** Rozwiązuje JEDNO użycie akcji (atak lub rzut obronny) przeciw aktualnie wybranemu celowi,
 *  mutując bezpośrednio draft stanu `s` - cel jest odszukiwany na nowo w `s` (nie w referencji
 *  sprzed renderu), żeby kolejne podrzuty w Wielokrotnym Ataku widziały już naliczone obrażenia
 *  z poprzednich. Zwraca gotową linię tekstu (HTML) do historii. */
function resolveActionOnce({ s, battleId, actorName, action, targetInstanceId, targetForm }) {
    const b = s.battles[battleId];
    const target = targetInstanceId ? b.participants.find((p) => p.instanceId === targetInstanceId) : null;

    if (action.kind === "attack") {
        const attack = resolveAttack({ attackBonus: action.attackBonus ?? 0, targetAc: target?.ac ?? null });
        let line = `${escapeHtml(actorName)} używa <strong>${escapeHtml(action.name)}</strong>${target ? ` na ${escapeHtml(target.name)}` : ""}: rzut ${attack.roll}${action.attackBonus ? ` (+${action.attackBonus})` : ""} = ${attack.total}`;
        if (attack.isFumble) line += " - krytyczne pudło.";
        else if (attack.isCrit) line += " - KRYTYCZNE TRAFIENIE!";

        if (attack.hit === false) {
            line += target?.ac ? ` vs KP ${target.ac} - pudło.` : " - pudło.";
        } else if (attack.hit === true && action.damage?.length) {
            const dmg = resolveDamage({ damageEntries: action.damage, target: targetForm, crit: attack.isCrit });
            if (target) applyDamageToParticipant(target, dmg.adjustedTotal);
            line += target?.ac ? ` vs KP ${target.ac} - trafienie.` : " - trafienie.";
            line += ` Obrażenia: ${dmg.adjustedTotal}${dmg.adjustedTotal !== dmg.rawTotal ? ` (surowo ${dmg.rawTotal})` : ""} [${dmg.parts.map((p) => `${escapeHtml(p.type)} ${p.adjusted}`).join(" + ")}]`;
            if (target) line += ` PW ${escapeHtml(target.name)}: ${target.hp.current}/${target.hp.max ?? "-"}.`;
        } else if (attack.hit === null) {
            line += " - brak ustawionego KP celu, oceń trafienie ręcznie.";
        }
        if (action.shortEffect && attack.hit === true) line += ` (${escapeHtml(action.shortEffect)})`;
        return line;
    }

    if (action.kind === "damage") {
        const dmg = resolveDamage({ damageEntries: action.damage, target: targetForm, crit: false });
        if (target) applyDamageToParticipant(target, dmg.adjustedTotal);
        let line = `${escapeHtml(actorName)} używa <strong>${escapeHtml(action.name)}</strong>${target ? ` na ${escapeHtml(target.name)}` : ""}: automatyczne trafienie.`;
        line += ` Obrażenia: ${dmg.adjustedTotal}${dmg.adjustedTotal !== dmg.rawTotal ? ` (surowo ${dmg.rawTotal})` : ""} [${dmg.parts.map((p) => `${escapeHtml(p.type)} ${p.adjusted}`).join(" + ")}]`;
        if (target) line += ` PW ${escapeHtml(target.name)}: ${target.hp.current}/${target.hp.max ?? "-"}.`;
        if (action.shortEffect) line += ` (${escapeHtml(action.shortEffect)})`;
        return line;
    }

    if (action.kind === "save") {
        const dc = action.save?.dc ?? 10;
        const abilityLabel = action.save?.ability || "";
        let saveResult;

        if (target?.sourceType === "party") {
            const input = window.prompt(`Wynik rzutu obronnego ${abilityLabel} gracza ${target.name} (ZB ${dc}) - podaj CAŁKOWITY wynik z modyfikatorem:`, "");
            const total = Number(input);
            const valid = input !== null && Number.isFinite(total);
            saveResult = { roll: null, total: valid ? total : null, dc, success: valid ? total >= dc : null };
        } else {
            const bonus = parseMonsterSaveBonus(targetForm, abilityLabel);
            saveResult = resolveSave({ dc, bonus });
        }

        let line = `${escapeHtml(actorName)} używa <strong>${escapeHtml(action.name)}</strong>${target ? ` na ${escapeHtml(target.name)}` : ""}: rzut obronny ${escapeHtml(abilityLabel)} ZB ${dc}`;
        if (saveResult.total == null) {
            line += " - nie podano wyniku, obrażenia nie zostały naliczone.";
        } else {
            line += ` = ${saveResult.total}${saveResult.roll != null ? ` (k20: ${saveResult.roll})` : ""} - ${saveResult.success ? "sukces" : "porażka"}.`;
            const halved = saveResult.success && action.save?.halfOnSuccess;
            const effectApplies = !saveResult.success || action.save?.halfOnSuccess;
            if (action.damage?.length && effectApplies) {
                const dmg = resolveDamage({ damageEntries: action.damage, target: targetForm, crit: false, halved: !!halved });
                if (target) applyDamageToParticipant(target, dmg.adjustedTotal);
                line += ` Obrażenia: ${dmg.adjustedTotal}${halved ? " (połowa)" : ""} [${dmg.parts.map((p) => `${escapeHtml(p.type)} ${p.adjusted}`).join(" + ")}]`;
                if (target) line += ` PW ${escapeHtml(target.name)}: ${target.hp.current}/${target.hp.max ?? "-"}.`;
            }
            if (action.shortEffect && effectApplies) line += ` (${escapeHtml(action.shortEffect)})`;
        }
        return line;
    }

    return `${escapeHtml(actorName)} używa: ${escapeHtml(action.name)}.`;
}
