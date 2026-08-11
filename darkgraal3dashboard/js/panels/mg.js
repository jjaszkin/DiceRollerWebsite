// Dark Graal III - Dashboard Solo (MG). Panel "MG" - zaplecze widoczne wyłącznie dla Mistrza Gry
// (main.js chowa tę zakładkę graczom; poniższy guard na session.role === "mg" jest tylko
// zabezpieczeniem defensywnym, na wypadek bezpośredniego wejścia w routing).
//
// Podstawowe liczniki bojowe (Rozpacz/Błogosławieństwo) MG edytuje już z poziomu panelu Postać
// (panels/character.js działa tak samo dla MG jak dla gracza, tylko z selektorem postaci) - tu żyje
// wszystko, czego NIE ma w panelu Postać: edycja bazowych wartości Archetypów i kości ran,
// zarządzanie freeform modyfikatorami, edycja ekwipunku (zwykłego - w tym tooltipów - i
// Legendarnego, w tym "wygaszania"), licznik Wiatru Camelotu oraz zbiorczy reset zużytych Mocy
// (nowa scena/sesja/walka). Wszystkie 4 postacie są widoczne NARAZ, obok siebie (4 kolumny), bez
// przełącznika/dropdownu - stąd każda kontrolka niesie `data-character="{key}"`, żeby handler
// wiedział, którą postać zmienić.

import { updateState } from "../store.js";
import { logEvent } from "../eventLog.js";
import { archetypeCurrent, addModifier, removeModifier, toggleModifier } from "../state.js";
import { escapeHtml, clamp, preserveScroll } from "../utils.js";

const ARCHETYPE_ORDER = ["rycerz", "lowczy", "lotr", "kaplan", "czarownik"];

function archetypeLabel(data, key) {
    return data.archetypes.find(a => a.key === key)?.label || key;
}

function renderModifierRow(characterKey, archetypeKey, m) {
    return `
        <div class="mod-row">
            <label class="inline-check">
                <input type="checkbox" data-action="toggle-modifier" data-character="${characterKey}" data-archetype="${archetypeKey}" data-mod-id="${m.id}" ${m.active ? "checked" : ""}>
            </label>
            <span class="mod-chip ${m.active ? "mod-active" : "mod-inactive"}" title="${escapeHtml(m.tooltip || "")}">
                ${escapeHtml(m.label)} (${m.delta >= 0 ? "+" : ""}${m.delta})
            </span>
            <button class="btn btn-xs" data-action="remove-modifier" data-character="${characterKey}" data-archetype="${archetypeKey}" data-mod-id="${m.id}">Usuń</button>
        </div>
    `;
}

function renderArchetypeEditor(data, characterKey, key, archetype) {
    const modifiersHtml = (archetype.modifiers || []).map(m => renderModifierRow(characterKey, key, m)).join("");
    return `
        <div class="mg-archetype-edit">
            <div class="archetype-row-head">
                <span class="archetype-name">${escapeHtml(archetypeLabel(data, key))}</span>
                <span class="archetype-value">= ${archetypeCurrent(archetype)}</span>
            </div>
            <label class="mg-inline-field">Baza
                <input type="number" min="0" class="mg-input-num" data-action="edit-base" data-character="${characterKey}" data-archetype="${key}" value="${archetype.base}">
            </label>
            <label class="mg-inline-field">Kości ran
                <input type="number" min="0" class="mg-input-num" data-action="edit-wounddice" data-character="${characterKey}" data-archetype="${key}" value="${archetype.woundDice || 0}">
            </label>
            <div class="mg-modifiers">
                ${modifiersHtml || `<span class="placeholder">Brak modyfikatorów.</span>`}
            </div>
            <div class="mg-add-modifier">
                <input type="text" class="mg-mod-label" placeholder="Etykieta modyfikatora">
                <input type="number" class="mg-mod-delta" placeholder="Δ" value="1">
                <input type="text" class="mg-mod-tooltip" placeholder="Tooltip (opcjonalnie)">
                <button class="btn btn-xs" data-action="add-modifier" data-character="${characterKey}" data-archetype="${key}">Dodaj modyfikator</button>
            </div>
        </div>
    `;
}

function legendaryTooltip(item) {
    return [item.shortTooltip, ...(item.richDescription || []).map(s => `${s.title}: ${s.text}`)]
        .filter(Boolean).join(" | ");
}

function renderEquipmentEditor(character, data) {
    const key = character.key;
    const legendarySet = new Set(character.legendaryItemKeys || []);
    const disabledLegendary = new Set(character.disabledItemKeys || []);

    const plainHtml = (character.equipment || []).map(item => `
        <div class="mg-equipment-row ${item.disabled ? "item-disabled" : ""}">
            <input type="text" class="mg-equipment-name" data-action="edit-equipment-name"
                data-character="${key}" data-item-id="${item.id}" value="${escapeHtml(item.name)}">
            <input type="text" class="mg-equipment-tooltip" placeholder="Tooltip..." data-action="edit-equipment-tooltip"
                data-character="${key}" data-item-id="${item.id}" value="${escapeHtml(item.tooltip || "")}">
            <label class="inline-check">
                <input type="checkbox" data-action="toggle-equipment-disabled" data-character="${key}" data-item-id="${item.id}" ${item.disabled ? "checked" : ""}>
                Wygaszony
            </label>
            <button class="chip-remove" data-action="remove-equipment" data-character="${key}" data-item-id="${item.id}" title="Usuń">×</button>
        </div>
    `).join("");

    const legendaryHtml = Object.entries(data.items || {}).map(([itemKey, item]) => {
        const owned = legendarySet.has(itemKey);
        return `
            <div class="mg-legendary-row">
                <label class="power-check" title="${escapeHtml(legendaryTooltip(item))}">
                    <input type="checkbox" data-action="toggle-legendary" data-character="${key}" data-item-key="${itemKey}" ${owned ? "checked" : ""}>
                    ${escapeHtml(item.name)}
                </label>
                ${owned ? `
                    <label class="inline-check mg-legendary-disable">
                        <input type="checkbox" data-action="toggle-legendary-disabled" data-character="${key}" data-item-key="${itemKey}" ${disabledLegendary.has(itemKey) ? "checked" : ""}>
                        Wygaszony
                    </label>
                ` : ""}
            </div>
        `;
    }).join("");

    return `
        <h4>Ekwipunek zwykły</h4>
        <div class="mg-equipment-list">${plainHtml || `<span class="placeholder">Brak.</span>`}</div>
        <div class="mg-add-equipment">
            <input type="text" class="mg-equipment-input" placeholder="Nowy przedmiot...">
            <input type="text" class="mg-equipment-tooltip-input" placeholder="Tooltip (opcjonalnie)">
            <button class="btn btn-xs" data-action="add-equipment" data-character="${key}">Dodaj</button>
        </div>

        <h4>Przedmioty Legendarne</h4>
        <div class="mg-legendary-list">${legendaryHtml}</div>
    `;
}

function renderPowerReset(character, transformation) {
    const usedEntries = Object.keys(character.usedPowers || {}).map(id => {
        const power = (transformation?.powers || []).find(p => p.id === id);
        return power ? power.name : id;
    });
    return `
        <h4>Zużyte Moce</h4>
        <p class="placeholder">${usedEntries.length ? escapeHtml(usedEntries.join(", ")) : "Brak zużytych Mocy."}</p>
        <button class="btn btn-sm" data-action="reset-used-powers" data-character="${character.key}" ${usedEntries.length ? "" : "disabled"}>
            Wyczyść zużycie Mocy (nowa scena/sesja/walka)
        </button>
    `;
}

function renderCharacterColumn(character, data) {
    const transformation = data.transformations[character.key];
    return `
        <div class="mg-character-col">
            <h3 class="mg-character-col-title">${escapeHtml(character.name)} <span class="placeholder">(${escapeHtml(character.aliasName)})</span></h3>

            <h4>Archetypy</h4>
            <div class="mg-archetype-list">
                ${ARCHETYPE_ORDER.map(key => renderArchetypeEditor(data, character.key, key, character.archetypes[key])).join("")}
            </div>

            ${renderEquipmentEditor(character, data)}

            ${renderPowerReset(character, transformation)}
        </div>
    `;
}

function renderGlobalControls(state) {
    return `
        <div class="mg-global-controls">
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

    const characters = Object.values(state.characters || {});
    if (!characters.length) return `<p class="placeholder">Brak postaci w kampanii.</p>`;

    return `
        <div class="mg-panel">
            <h2>Zaplecze MG</h2>
            ${renderGlobalControls(state)}

            <h2>Postacie</h2>
            <div class="mg-character-grid">
                ${characters.map(c => renderCharacterColumn(c, data)).join("")}
            </div>
        </div>
    `;
}

function rerender(root) {
    preserveScroll(() => { root.innerHTML = buildHtml(root._ctx); });
}

function withCharacter(root, characterKey, fn) {
    const { state } = root._ctx;
    const character = state.characters[characterKey];
    if (!character) return;
    updateState((s) => fn(s.characters[characterKey], s));
    rerender(root);
}

function withState(root, fn) {
    updateState((s) => fn(s));
    rerender(root);
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        const { session } = root._ctx;
        if (session.role !== "mg") return;
        const el = e.target;
        const action = el.dataset.action;
        const characterKey = el.dataset.character;

        if (action === "edit-base" || action === "edit-wounddice") {
            const archetypeKey = el.dataset.archetype;
            const value = Math.max(0, parseInt(el.value, 10) || 0);
            withCharacter(root, characterKey, (character, state) => {
                const archetype = character.archetypes[archetypeKey];
                if (action === "edit-base") {
                    const before = archetype.base;
                    archetype.base = value;
                    logEvent(state, "character-edited", `${character.name}: baza Archetypu "${archetypeKey}" ${before} → ${value}.`);
                } else {
                    const before = archetype.woundDice || 0;
                    archetype.woundDice = value;
                    logEvent(state, "character-edited", `${character.name}: kości ran Archetypu "${archetypeKey}" ${before} → ${value}.`);
                }
            });
            return;
        }

        if (action === "toggle-legendary") {
            const itemKey = el.dataset.itemKey;
            withCharacter(root, characterKey, (character, state) => {
                const has = character.legendaryItemKeys.includes(itemKey);
                if (has) {
                    character.legendaryItemKeys = character.legendaryItemKeys.filter(k => k !== itemKey);
                    character.disabledItemKeys = (character.disabledItemKeys || []).filter(k => k !== itemKey);
                } else {
                    character.legendaryItemKeys.push(itemKey);
                }
                logEvent(state, "equipment-change", `${character.name}: Legendarny przedmiot "${itemKey}" ${has ? "usunięty" : "dodany"}.`);
            });
            return;
        }

        if (action === "toggle-legendary-disabled") {
            const itemKey = el.dataset.itemKey;
            withCharacter(root, characterKey, (character, state) => {
                if (!character.disabledItemKeys) character.disabledItemKeys = [];
                const isDisabled = character.disabledItemKeys.includes(itemKey);
                if (isDisabled) character.disabledItemKeys = character.disabledItemKeys.filter(k => k !== itemKey);
                else character.disabledItemKeys.push(itemKey);
                logEvent(state, "equipment-disabled", `${character.name}: Legendarny przedmiot "${itemKey}" ${isDisabled ? "przywrócony" : "wygaszony"}.`);
            });
            return;
        }

        if (action === "toggle-equipment-disabled") {
            const itemId = el.dataset.itemId;
            withCharacter(root, characterKey, (character, state) => {
                const item = (character.equipment || []).find(i => i.id === itemId);
                if (!item) return;
                item.disabled = !item.disabled;
                logEvent(state, "equipment-disabled", `${character.name}: przedmiot "${item.name}" ${item.disabled ? "wygaszony" : "przywrócony"}.`);
            });
            return;
        }

        if (action === "edit-equipment-name") {
            const itemId = el.dataset.itemId;
            const value = el.value.trim();
            if (!value) { el.value = ""; return; }
            withCharacter(root, characterKey, (character, state) => {
                const item = (character.equipment || []).find(i => i.id === itemId);
                if (!item) return;
                const before = item.name;
                item.name = value;
                logEvent(state, "equipment-change", `${character.name}: przedmiot "${before}" przemianowany na "${value}".`);
            });
            return;
        }

        if (action === "edit-equipment-tooltip") {
            const itemId = el.dataset.itemId;
            const value = el.value.trim();
            withCharacter(root, characterKey, (character, state) => {
                const item = (character.equipment || []).find(i => i.id === itemId);
                if (!item) return;
                item.tooltip = value;
                logEvent(state, "equipment-change", `${character.name}: zaktualizowano tooltip przedmiotu "${item.name}".`);
            });
            return;
        }

        if (action === "toggle-modifier") {
            const archetypeKey = el.dataset.archetype;
            const modId = el.dataset.modId;
            withCharacter(root, characterKey, (character, state) => {
                toggleModifier(character.archetypes[archetypeKey], modId);
                logEvent(state, "modifier-toggled", `${character.name}: modyfikator Archetypu "${archetypeKey}" przełączony.`);
            });
            return;
        }
    });

    root.addEventListener("click", (e) => {
        const { session } = root._ctx;
        if (session.role !== "mg") return;

        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const characterKey = btn.dataset.character;

        if (action === "add-modifier") {
            const archetypeKey = btn.dataset.archetype;
            const wrap = btn.closest(".mg-add-modifier");
            const label = wrap.querySelector(".mg-mod-label").value.trim();
            const delta = parseInt(wrap.querySelector(".mg-mod-delta").value, 10) || 0;
            const tooltip = wrap.querySelector(".mg-mod-tooltip").value.trim();
            if (!label) return;
            withCharacter(root, characterKey, (character, state) => {
                addModifier(character.archetypes[archetypeKey], { label, delta, tooltip });
                logEvent(state, "modifier-added", `${character.name}: dodano modyfikator "${label}" (${delta >= 0 ? "+" : ""}${delta}) do Archetypu "${archetypeKey}".`);
            });
            return;
        }

        if (action === "remove-modifier") {
            const archetypeKey = btn.dataset.archetype;
            const modId = btn.dataset.modId;
            withCharacter(root, characterKey, (character, state) => {
                const archetype = character.archetypes[archetypeKey];
                const mod = (archetype.modifiers || []).find(m => m.id === modId);
                removeModifier(archetype, modId);
                logEvent(state, "modifier-removed", `${character.name}: usunięto modyfikator "${mod?.label || modId}" z Archetypu "${archetypeKey}".`);
            });
            return;
        }

        if (action === "add-equipment") {
            const wrap = btn.closest(".mg-add-equipment");
            const nameInput = wrap.querySelector(".mg-equipment-input");
            const tooltipInput = wrap.querySelector(".mg-equipment-tooltip-input");
            const name = nameInput.value.trim();
            const tooltip = tooltipInput.value.trim();
            if (!name) return;
            withCharacter(root, characterKey, (character, state) => {
                character.equipment.push({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name, tooltip, disabled: false });
                logEvent(state, "equipment-change", `${character.name}: dodano przedmiot "${name}".`);
            });
            return;
        }

        if (action === "remove-equipment") {
            const itemId = btn.dataset.itemId;
            withCharacter(root, characterKey, (character, state) => {
                const item = (character.equipment || []).find(i => i.id === itemId);
                character.equipment = (character.equipment || []).filter(i => i.id !== itemId);
                logEvent(state, "equipment-change", `${character.name}: usunięto przedmiot "${item?.name || itemId}".`);
            });
            return;
        }

        if (action === "reset-used-powers") {
            withCharacter(root, characterKey, (character, state) => {
                character.usedPowers = {};
                logEvent(state, "power-usage-reset", `${character.name}: zużycie Mocy zresetowane.`);
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

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx);
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
