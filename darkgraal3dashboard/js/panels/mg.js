// Dark Graal III - Dashboard Solo (MG). Panel "MG" - zaplecze widoczne wyłącznie dla Mistrza Gry
// (main.js chowa tę zakładkę graczom; poniższy guard na session.role === "mg" jest tylko
// zabezpieczeniem defensywnym, na wypadek bezpośredniego wejścia w routing).
//
// Podstawowe liczniki bojowe (Rozpacz/Rany/Błogosławieństwo) MG edytuje już z poziomu panelu
// Postać (panels/character.js działa tak samo dla MG jak dla gracza, tylko z selektorem postaci) -
// tu żyje wszystko, czego NIE ma w panelu Postać: edycja bazowych wartości Archetypów i kości ran,
// zarządzanie freeform modyfikatorami, edycja ekwipunku (zwykłego i Legendarnego), wspólna pula
// Kości Graala, licznik Wiatru Camelotu oraz zbiorczy reset zużytych Mocy (nowa scena/sesja/walka).

import { updateState } from "../store.js";
import { logEvent } from "../eventLog.js";
import { archetypeCurrent, addModifier, removeModifier, toggleModifier } from "../state.js";
import { escapeHtml, clamp, preserveScroll } from "../utils.js";

const ARCHETYPE_ORDER = ["rycerz", "lowczy", "lotr", "kaplan", "czarownik"];

const ui = {
    selectedCharacterKey: null
};

function resolveSelectedKey(state) {
    if (ui.selectedCharacterKey && state.characters[ui.selectedCharacterKey]) return ui.selectedCharacterKey;
    const keys = Object.keys(state.characters);
    ui.selectedCharacterKey = keys[0] || null;
    return ui.selectedCharacterKey;
}

function archetypeLabel(data, key) {
    return data.archetypes.find(a => a.key === key)?.label || key;
}

function renderModifierRow(archetypeKey, m) {
    return `
        <div class="mod-row">
            <label class="inline-check">
                <input type="checkbox" data-action="toggle-modifier" data-archetype="${archetypeKey}" data-mod-id="${m.id}" ${m.active ? "checked" : ""}>
            </label>
            <span class="mod-chip ${m.active ? "mod-active" : "mod-inactive"}" title="${escapeHtml(m.tooltip || "")}">
                ${escapeHtml(m.label)} (${m.delta >= 0 ? "+" : ""}${m.delta})
            </span>
            <button class="btn btn-xs" data-action="remove-modifier" data-archetype="${archetypeKey}" data-mod-id="${m.id}">Usuń</button>
        </div>
    `;
}

function renderArchetypeEditor(data, key, archetype) {
    const modifiersHtml = (archetype.modifiers || []).map(m => renderModifierRow(key, m)).join("");
    return `
        <div class="mg-archetype-edit">
            <div class="archetype-row-head">
                <span class="archetype-name">${escapeHtml(archetypeLabel(data, key))}</span>
                <label class="mg-inline-field">Baza
                    <input type="number" min="0" class="mg-input-num" data-action="edit-base" data-archetype="${key}" value="${archetype.base}">
                </label>
                <label class="mg-inline-field">Kości ran
                    <input type="number" min="0" class="mg-input-num" data-action="edit-wounddice" data-archetype="${key}" value="${archetype.woundDice || 0}">
                </label>
                <span class="archetype-value">= ${archetypeCurrent(archetype)}</span>
            </div>
            <div class="mg-modifiers">
                ${modifiersHtml || `<span class="placeholder">Brak modyfikatorów.</span>`}
            </div>
            <div class="mg-add-modifier">
                <input type="text" class="mg-mod-label" placeholder="Etykieta modyfikatora">
                <input type="number" class="mg-mod-delta" placeholder="Δ" value="1">
                <input type="text" class="mg-mod-tooltip" placeholder="Tooltip (opcjonalnie)">
                <button class="btn btn-xs" data-action="add-modifier" data-archetype="${key}">Dodaj modyfikator</button>
            </div>
        </div>
    `;
}

function renderEquipmentEditor(character, data) {
    const legendarySet = new Set(character.legendaryItemKeys || []);
    const plainHtml = (character.equipment || []).map((item, i) => `
        <span class="item-chip">${escapeHtml(item)} <button class="chip-remove" data-action="remove-equipment" data-index="${i}">×</button></span>
    `).join("");
    const legendaryHtml = Object.entries(data.items || {}).map(([key, item]) => `
        <label class="power-check">
            <input type="checkbox" data-action="toggle-legendary" data-item-key="${key}" ${legendarySet.has(key) ? "checked" : ""}>
            ${escapeHtml(item.name)}
        </label>
    `).join("");
    return `
        <h3>Ekwipunek zwykły</h3>
        <div class="equipment-plain">${plainHtml || `<span class="placeholder">Brak.</span>`}</div>
        <div class="mg-add-equipment">
            <input type="text" class="mg-equipment-input" placeholder="Nowy przedmiot...">
            <button class="btn btn-xs" data-action="add-equipment">Dodaj</button>
        </div>

        <h3>Przedmioty Legendarne</h3>
        <div class="powers-checklist">${legendaryHtml}</div>
    `;
}

function renderPowerReset(character, transformation) {
    const usedEntries = Object.keys(character.usedPowers || {}).map(id => {
        const power = (transformation?.powers || []).find(p => p.id === id);
        return power ? power.name : id;
    });
    return `
        <h3>Zużyte Moce</h3>
        <p class="placeholder">${usedEntries.length ? escapeHtml(usedEntries.join(", ")) : "Brak zużytych Mocy."}</p>
        <button class="btn btn-sm" data-action="reset-used-powers" ${usedEntries.length ? "" : "disabled"}>
            Wyczyść zużycie Mocy (nowa scena/sesja/walka)
        </button>
    `;
}

function renderGlobalControls(state) {
    return `
        <div class="mg-global-controls">
            <div class="stat-box">
                <label>Kości Graala (pula wspólna)</label>
                <div class="stat-controls">
                    <button class="btn btn-xs" data-action="graal-dec">−</button>
                    <span>${state.graalDice.current}</span>
                    <button class="btn btn-xs" data-action="graal-inc">+</button>
                </div>
                <div class="mg-quick-add">
                    <input type="number" class="mg-graal-amount-input" value="1">
                    <button class="btn btn-xs" data-action="graal-add-amount">Dodaj/odejmij</button>
                </div>
            </div>
            <div class="stat-box">
                <label>Wiatr Camelotu</label>
                <div class="stat-controls">
                    <button class="btn btn-xs" data-action="wind-dec">−</button>
                    <span>${state.campWind.current} / ${state.campWind.scale}</span>
                    <button class="btn btn-xs" data-action="wind-inc">+</button>
                </div>
            </div>
        </div>
    `;
}

function buildHtml(ctx) {
    const { state, data, session } = ctx;
    if (session.role !== "mg") return `<p class="placeholder">Panel dostępny tylko dla Mistrza Gry.</p>`;

    const selectedKey = resolveSelectedKey(state);
    const character = selectedKey ? state.characters[selectedKey] : null;
    if (!character) return `<p class="placeholder">Brak postaci w kampanii.</p>`;

    const transformation = data.transformations[selectedKey];

    return `
        <div class="mg-panel">
            <h2>Zaplecze MG</h2>
            ${renderGlobalControls(state)}

            <h2>Postać</h2>
            <select id="mgCharacterPicker" class="char-picker">
                ${Object.values(state.characters).map(c => `
                    <option value="${c.key}" ${c.key === selectedKey ? "selected" : ""}>${escapeHtml(c.name)} (${escapeHtml(c.aliasName)})</option>
                `).join("")}
            </select>

            <h3>Archetypy</h3>
            <div class="mg-archetype-list">
                ${ARCHETYPE_ORDER.map(key => renderArchetypeEditor(data, key, character.archetypes[key])).join("")}
            </div>

            ${renderEquipmentEditor(character, data)}

            ${renderPowerReset(character, transformation)}
        </div>
    `;
}

function rerender(root) {
    preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        const { session } = root._ctx;
        if (session.role !== "mg") return;

        if (e.target.id === "mgCharacterPicker") {
            ui.selectedCharacterKey = e.target.value;
            rerender(root);
            return;
        }

        if (e.target.dataset.action === "edit-base" || e.target.dataset.action === "edit-wounddice") {
            const archetypeKey = e.target.dataset.archetype;
            const value = Math.max(0, parseInt(e.target.value, 10) || 0);
            withSelectedCharacter(root, (character, state) => {
                const archetype = character.archetypes[archetypeKey];
                if (e.target.dataset.action === "edit-base") {
                    const before = archetype.base;
                    archetype.base = value;
                    logEvent(state, "character-edited", `${character.name}: baza Archetypu "${archetypeKey}" ${before} → ${value}.`);
                } else {
                    const before = archetype.woundDice || 0;
                    archetype.woundDice = value;
                    logEvent(state, "character-edited", `${character.name}: kości ran Archetypu "${archetypeKey}" ${before} → ${value}.`);
                }
            });
        }

        if (e.target.dataset.action === "toggle-legendary") {
            const itemKey = e.target.dataset.itemKey;
            withSelectedCharacter(root, (character, state) => {
                const has = character.legendaryItemKeys.includes(itemKey);
                if (has) character.legendaryItemKeys = character.legendaryItemKeys.filter(k => k !== itemKey);
                else character.legendaryItemKeys.push(itemKey);
                logEvent(state, "equipment-change", `${character.name}: Legendarny przedmiot "${itemKey}" ${has ? "usunięty" : "dodany"}.`);
            });
        }

        if (e.target.dataset.action === "toggle-modifier") {
            const archetypeKey = e.target.dataset.archetype;
            const modId = e.target.dataset.modId;
            withSelectedCharacter(root, (character, state) => {
                toggleModifier(character.archetypes[archetypeKey], modId);
                logEvent(state, "modifier-toggled", `${character.name}: modyfikator Archetypu "${archetypeKey}" przełączony.`);
            });
        }
    });

    root.addEventListener("click", (e) => {
        const { session } = root._ctx;
        if (session.role !== "mg") return;

        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "add-modifier") {
            const archetypeKey = btn.dataset.archetype;
            const wrap = btn.closest(".mg-add-modifier");
            const label = wrap.querySelector(".mg-mod-label").value.trim();
            const delta = parseInt(wrap.querySelector(".mg-mod-delta").value, 10) || 0;
            const tooltip = wrap.querySelector(".mg-mod-tooltip").value.trim();
            if (!label) return;
            withSelectedCharacter(root, (character, state) => {
                addModifier(character.archetypes[archetypeKey], { label, delta, tooltip });
                logEvent(state, "modifier-added", `${character.name}: dodano modyfikator "${label}" (${delta >= 0 ? "+" : ""}${delta}) do Archetypu "${archetypeKey}".`);
            });
            return;
        }

        if (action === "remove-modifier") {
            const archetypeKey = btn.dataset.archetype;
            const modId = btn.dataset.modId;
            withSelectedCharacter(root, (character, state) => {
                const archetype = character.archetypes[archetypeKey];
                const mod = (archetype.modifiers || []).find(m => m.id === modId);
                removeModifier(archetype, modId);
                logEvent(state, "modifier-removed", `${character.name}: usunięto modyfikator "${mod?.label || modId}" z Archetypu "${archetypeKey}".`);
            });
            return;
        }

        if (action === "add-equipment") {
            const wrap = btn.closest(".mg-add-equipment");
            const input = wrap.querySelector(".mg-equipment-input");
            const value = input.value.trim();
            if (!value) return;
            withSelectedCharacter(root, (character, state) => {
                character.equipment.push(value);
                logEvent(state, "equipment-change", `${character.name}: dodano przedmiot "${value}".`);
            });
            return;
        }

        if (action === "remove-equipment") {
            const index = parseInt(btn.dataset.index, 10);
            withSelectedCharacter(root, (character, state) => {
                const removed = character.equipment[index];
                character.equipment.splice(index, 1);
                logEvent(state, "equipment-change", `${character.name}: usunięto przedmiot "${removed}".`);
            });
            return;
        }

        if (action === "reset-used-powers") {
            withSelectedCharacter(root, (character, state) => {
                character.usedPowers = {};
                logEvent(state, "power-usage-reset", `${character.name}: zużycie Mocy zresetowane.`);
            });
            return;
        }

        if (action === "graal-inc" || action === "graal-dec") {
            withState(root, (state) => {
                const before = state.graalDice.current;
                state.graalDice.current = Math.max(0, before + (action === "graal-inc" ? 1 : -1));
                if (state.graalDice.current !== before) {
                    logEvent(state, "graal-dice-change", `Kości Graala: ${before} → ${state.graalDice.current}.`);
                }
            });
            return;
        }

        if (action === "graal-add-amount") {
            const wrap = btn.closest(".mg-quick-add");
            const amount = parseInt(wrap.querySelector(".mg-graal-amount-input").value, 10) || 0;
            if (!amount) return;
            withState(root, (state) => {
                const before = state.graalDice.current;
                state.graalDice.current = Math.max(0, before + amount);
                logEvent(state, "graal-dice-change", `Kości Graala: ${before} → ${state.graalDice.current} (MG ${amount >= 0 ? "dodał" : "odjął"} ${Math.abs(amount)}).`);
            });
            return;
        }

        if (action === "wind-inc" || action === "wind-dec") {
            withState(root, (state) => {
                const before = state.campWind.current;
                state.campWind.current = clamp(before + (action === "wind-inc" ? 1 : -1), 0, state.campWind.scale);
                if (state.campWind.current !== before) {
                    logEvent(state, "camp-wind-change", `Wiatr Camelotu: ${before} → ${state.campWind.current}.`);
                }
            });
            return;
        }
    });
}

function withSelectedCharacter(root, fn) {
    const { state } = root._ctx;
    const key = resolveSelectedKey(state);
    const character = state.characters[key];
    if (!character) return;
    updateState((s) => fn(s.characters[key], s));
    rerender(root);
}

function withState(root, fn) {
    updateState((s) => fn(s));
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
