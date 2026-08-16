// Dark Graal III - Dashboard Solo (MG). Widok MG - NIE jest już zakładką w środku #mainTabs (MG w
// ogóle nie widzi zakładek "Postać"/"Rzuty", patrz main.js#applyRoleVisibility) - to jeden, samo-
// wystarczalny nietabowy widok osadzony w #mgUnifiedRoot, w układzie siatki 12 kolumn:
//   - Wiatr Camelotu na pełną szerokość, u góry (1.5x większy niż na karcie Gracza).
//   - kol. 1-8: moduł "Dodaj modyfikator" (globalny, jeden dla wszystkich postaci/Archetypów),
//     globalny katalog "Przedmioty Legendarne" (klik -> modal z przypisaniem/wygaszeniem/edycją
//     opisu), a pod nimi TABY wyboru postaci (Sir Gaven / Sir Palanore / Sir Cadwyn / Sir Brandon -
//     patrz renderCharacterTabs()) i pełna karta MG WYŁĄCZNIE aktualnie wybranej postaci (Rozpacz,
//     Błogosławieństwo, Archetypy z bazą/kośćmi ran/modyfikatorami, ekwipunek zwykły, posiadane
//     Przedmioty Legendarne (tylko odczyt - edycja przez katalog wyżej), reset zużytych Mocy).
//   - kol. 9-12: samodzielny rzut MG (dowolna liczba kości + osobna, nielimitowana pula Kości
//     Graala - MG nie rzuca "jako postać" ani "jako Archetyp") + osadzony Dziennik kampanii -
//     ZAWSZE widoczny, niezależnie od tego, która postać jest aktualnie wybrana w tabach.
//
// Poprzednie wersje tego panelu próbowały pokazać wszystkie 4 postacie naraz (albo w 4 kolumnach
// obok siebie, albo jedna pod drugą ze sticky spisem treści) - w obu przypadkach robiło się zbyt
// długie/rozdrobnione przy realnym użyciu przy stole, stąd taby: jedna postać na raz, przeklik jak
// w zakładkach Gracza, ale panel Rzutów MG NIE jest częścią tabów - zostaje zawsze widoczny obok.

import { updateState } from "../store.js";
import { logEvent } from "../eventLog.js";
import { logRoll } from "../rollLog.js";
import {
    archetypeCurrent, despairMax, addModifier, removeModifier, toggleModifier, resolveItemTooltip
} from "../state.js";
import {
    escapeHtml, clamp, preserveScroll, annotateDice, rollTestPool, TEST_TIER_LABELS
} from "../utils.js";
import { buildJournalHtml, handleJournalAction } from "./journal.js";
import {
    buildSoundboardControlHtml, buildSoundboardPlaylistEditorHtml, buildPlaylistPreviewHtml,
    handleSoundboardAction, reorderPlaylistEditorTrack, reorderMainOrder, setPlaylistEditorName
} from "../../../shared/soundboard/control-panel.js";
import { getNowPlaying } from "../../../shared/soundboard/player-engine.js";
import { buildHandoutsControlHtml, handleHandoutsAction } from "../../../shared/handouts/control-panel.js";

const ARCHETYPE_ORDER = ["rycerz", "lowczy", "lotr", "kaplan", "czarownik"];

const DIE_STATE_CLASS = {
    one: "die-removed",
    cancelled: "die-cancelled",
    full: "die-full",
    success: "die-success",
    complication: "die-complication"
};

// Stan czysto lokalny UI panelu MG (nie zapisywany do Firebase) - który modal Przedmiotu
// Legendarnego jest otwarty, ostatni wybór w module "Dodaj modyfikator" (żeby nie resetował się po
// każdym dodaniu), która postać jest aktualnie wybrana w tabach (patrz renderCharacterTabs()),
// który z górnych tabów MG ("Kampania"/"Muzyka") jest aktywny i podgląd rzutu MG do zatwierdzenia
// (analogicznie do panels/roller.js#ui.pendingRoll).
const ui = {
    openLegendaryKey: null,
    modAddCharacterKey: null,
    modAddArchetypeKey: "rycerz",
    activeCharacterKey: null,
    activeTopTab: "kampania", // "kampania" | "muzyka" - patrz renderTopTabs()
    rollDiceCount: 3,
    rollGraalDice: 0,
    pendingRoll: null
};

function archetypeLabel(data, key) {
    return data.archetypes.find(a => a.key === key)?.label || key;
}

/** Zwraca klucz aktualnie wybranej w tabach postaci - domyślnie pierwsza w kolejności z danych,
 *  chyba że coś już wybrano (i nadal istnieje - postać nie mogła zniknąć, ale defensywnie). */
function resolveActiveCharacterKey(state) {
    if (ui.activeCharacterKey && state.characters[ui.activeCharacterKey]) return ui.activeCharacterKey;
    const keys = Object.keys(state.characters || {});
    ui.activeCharacterKey = keys[0] || null;
    return ui.activeCharacterKey;
}

function renderCharacterTabs(characters, activeKey) {
    return `
        <nav class="tabs mg-character-tabs">
            ${characters.map(c => `
                <button type="button" class="tab-btn ${c.key === activeKey ? "active" : ""}" data-action="mg-select-character" data-key="${c.key}">
                    ${escapeHtml(c.name)}
                </button>
            `).join("")}
        </nav>
    `;
}

/** Górne taby widoku MG ("Kampania"/"Muzyka") - w odróżnieniu od renderCharacterTabs() (który
 *  z 4 postaci jest wybrany) te przełączają, co pokazuje kolumna 1-8 (patrz buildHtml()). Kolumna
 *  9-12 (rzut MG + dziennik) zostaje widoczna ZAWSZE, niezależnie od wybranego taba - to samo
 *  świadome ograniczenie, co przy tabach postaci (patrz komentarz na górze pliku). */
function renderTopTabs(activeTab) {
    return `
        <nav class="tabs mg-top-tabs">
            <button type="button" class="tab-btn ${activeTab === "kampania" ? "active" : ""}" data-action="mg-select-top-tab" data-tab="kampania">Kampania</button>
            <button type="button" class="tab-btn ${activeTab === "muzyka" ? "active" : ""}" data-action="mg-select-top-tab" data-tab="muzyka">Muzyka</button>
            <button type="button" class="tab-btn ${activeTab === "handouty" ? "active" : ""}" data-action="mg-select-top-tab" data-tab="handouty">Handouty</button>
        </nav>
    `;
}

function findOwnerKey(state, itemKey) {
    for (const c of Object.values(state.characters || {})) {
        if ((c.legendaryItemKeys || []).includes(itemKey)) return c.key;
    }
    return null;
}

/** `graalCount` kości Graala = ostatnie `graalCount` pozycje w `dice` (patrz analogiczny komentarz
 *  w panels/journal.js#diceChipsHtml - umowne oznaczenie pochodzenia w puli, bez znaczenia
 *  mechanicznego które fizycznie kości "są" Graala). */
function diceChipsHtml(dice, graalCount = 0) {
    const list = dice || [];
    const graalStart = list.length - (graalCount || 0);
    return annotateDice(list).map(({ value, state: dieState }, i) =>
        `<span class="die-chip ${DIE_STATE_CLASS[dieState] || ""} ${i >= graalStart ? "die-graal" : ""}">${value}</span>`
    ).join("");
}

/* -- Wiatr Camelotu (pełna szerokość) ------------------------------------------------------- */

function renderCampWindFull(state) {
    const campWind = state.campWind || { current: 0, scale: 10 };
    return `
        <div class="mg-camp-wind-full">
            <label>Wiatr Camelotu</label>
            <div class="stat-controls">
                <button class="btn btn-xs" data-action="wind-dec">−</button>
                <span class="camp-wind-value">${campWind.current} <span class="camp-wind-scale">/ ${campWind.scale}</span></span>
                <button class="btn btn-xs" data-action="wind-inc">+</button>
            </div>
        </div>
    `;
}

/* -- Moduł "Dodaj modyfikator" (globalny) --------------------------------------------------- */

function renderModifierModule(ctx) {
    const { state, data } = ctx;
    const characters = Object.values(state.characters || {});
    if (!ui.modAddCharacterKey || !state.characters[ui.modAddCharacterKey]) {
        ui.modAddCharacterKey = characters[0]?.key || null;
    }
    return `
        <div class="card mg-modifier-module">
            <h3>Dodaj modyfikator</h3>
            <div class="mg-modifier-form">
                <select id="mgModCharacter">
                    ${characters.map(c => `<option value="${c.key}" ${c.key === ui.modAddCharacterKey ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
                </select>
                <select id="mgModArchetype">
                    ${ARCHETYPE_ORDER.map(k => `<option value="${k}" ${k === ui.modAddArchetypeKey ? "selected" : ""}>${escapeHtml(archetypeLabel(data, k))}</option>`).join("")}
                </select>
                <input type="text" id="mgModLabel" placeholder="Etykieta">
                <input type="number" id="mgModDelta" class="mg-mod-delta" value="1">
                <input type="text" id="mgModTooltip" placeholder="Tooltip (opcjonalnie)">
                <button class="btn btn-sm btn-gold" data-action="add-modifier-global">Dodaj modyfikator</button>
            </div>
        </div>
    `;
}

/* -- Katalog "Przedmioty Legendarne" (globalny, klik -> modal) ------------------------------ */

function renderLegendaryCatalog(ctx) {
    const { state, data } = ctx;
    const entries = Object.entries(data.items || {});
    const chipsHtml = entries.map(([key, item]) => {
        const ownerKey = findOwnerKey(state, key);
        const owner = ownerKey ? state.characters[ownerKey] : null;
        const disabled = owner ? (owner.disabledItemKeys || []).includes(key) : false;
        return `
            <button class="item-chip legendary ${disabled ? "item-disabled" : ""}" data-action="open-legendary" data-key="${key}">
                ${escapeHtml(item.name)}${owner ? `<span class="mg-legendary-chip-owner">(${escapeHtml(owner.name)})</span>` : ""}${disabled ? " (wygaszony)" : ""}
            </button>
        `;
    }).join("");
    return `
        <div class="card mg-legendary-module">
            <h3>Przedmioty Legendarne</h3>
            <div class="mg-legendary-catalog">${chipsHtml || `<span class="placeholder">Brak Przedmiotów Legendarnych w katalogu.</span>`}</div>
        </div>
    `;
}

function renderLegendaryModal(ctx) {
    const { state, data } = ctx;
    const key = ui.openLegendaryKey;
    if (!key) return "";
    const item = data.items[key];
    if (!item) return "";
    const characters = Object.values(state.characters || {});
    const ownerKey = findOwnerKey(state, key);
    const owner = ownerKey ? state.characters[ownerKey] : null;
    const disabled = owner ? (owner.disabledItemKeys || []).includes(key) : false;
    const sections = (item.richDescription || []).map(s => `
        <h3>${escapeHtml(s.title)}</h3>
        <p>${escapeHtml(s.text)}</p>
    `).join("");

    return `
        <div class="modal-backdrop">
            <div class="modal">
                <h2>${escapeHtml(item.name)}</h2>
                ${item.image ? `<img class="item-modal-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">` : ""}
                ${owner && disabled ? `<p class="item-disabled-note">Ten przedmiot jest obecnie wygaszony.</p>` : ""}
                ${sections}

                <div class="mg-legendary-modal-field">
                    <label>Przypisana postać</label>
                    <select data-action="assign-legendary" data-key="${key}">
                        <option value="">- nieprzypisany -</option>
                        ${characters.map(c => `<option value="${c.key}" ${ownerKey === c.key ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}
                    </select>
                </div>

                ${owner ? `
                    <div class="mg-legendary-modal-field">
                        <label class="inline-check">
                            <input type="checkbox" data-action="toggle-legendary-disabled-modal" data-key="${key}" ${disabled ? "checked" : ""}>
                            Wygaszony
                        </label>
                    </div>
                ` : ""}

                <div class="mg-legendary-modal-field">
                    <label>Opis (widoczny dla graczy)</label>
                    <textarea id="mgLegendaryTooltipInput" rows="3">${escapeHtml(resolveItemTooltip(state, data, key))}</textarea>
                    <button class="btn btn-sm" data-action="save-legendary-tooltip" data-key="${key}">Zapisz opis</button>
                </div>

                <div class="modal-actions">
                    <button class="btn btn-sm" data-action="close-legendary">Zamknij</button>
                </div>
            </div>
        </div>
    `;
}

/* -- Karta postaci (Archetypy, ekwipunek, Przedmioty Legendarne (odczyt), reset Mocy) -------- */

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
        </div>
    `;
}

function renderEquipmentEditor(character) {
    const key = character.key;
    const plainHtml = (character.equipment || []).map(item => `
        <div class="mg-equipment-row ${item.disabled ? "item-disabled" : ""}">
            <input type="text" class="mg-equipment-name" data-action="edit-equipment-name"
                data-character="${key}" data-item-id="${item.id}" value="${escapeHtml(item.name)}">
            <input type="text" class="mg-equipment-tooltip-input" placeholder="Tooltip..." data-action="edit-equipment-tooltip"
                data-character="${key}" data-item-id="${item.id}" value="${escapeHtml(item.tooltip || "")}">
            <label class="inline-check">
                <input type="checkbox" data-action="toggle-equipment-disabled" data-character="${key}" data-item-id="${item.id}" ${item.disabled ? "checked" : ""}>
                Wygaszony
            </label>
            <button class="chip-remove" data-action="remove-equipment" data-character="${key}" data-item-id="${item.id}" title="Usuń">×</button>
        </div>
    `).join("");

    return `
        <div class="mg-equipment-list">${plainHtml || `<span class="placeholder">Brak.</span>`}</div>
        <div class="mg-add-equipment">
            <input type="text" class="mg-equipment-input" placeholder="Nowy przedmiot...">
            <input type="text" class="mg-equipment-tooltip-input" placeholder="Tooltip (opcjonalnie)">
            <button class="btn btn-xs" data-action="add-equipment" data-character="${key}">Dodaj</button>
        </div>
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

function renderCharacterBlock(character, ctx) {
    const { data } = ctx;
    const key = character.key;
    const transformation = data.transformations[key];
    const dMax = despairMax(character);
    const legendarySet = new Set(character.legendaryItemKeys || []);
    const disabledLegendary = new Set(character.disabledItemKeys || []);

    const ownedLegendaryHtml = [...legendarySet].map(itemKey => {
        const item = data.items[itemKey];
        if (!item) return "";
        const disabled = disabledLegendary.has(itemKey);
        return `
            <button class="item-chip legendary ${disabled ? "item-disabled" : ""}" data-action="open-legendary" data-key="${itemKey}">
                ${escapeHtml(item.name)}${disabled ? " (wygaszony)" : ""}
            </button>
        `;
    }).join("");

    return `
        <section class="mg-character-block">
            <h3 class="mg-character-block-title">${escapeHtml(character.name)} <span class="placeholder">(${escapeHtml(character.aliasName)})</span></h3>

            <div class="stat-row">
                <div class="stat-box">
                    <label>Rozpacz</label>
                    <div class="stat-controls">
                        <button class="btn btn-xs" data-action="despair-dec" data-character="${key}">−</button>
                        <span>${character.despair.current} / ${dMax}</span>
                        <button class="btn btn-xs" data-action="despair-inc" data-character="${key}">+</button>
                    </div>
                </div>
                <div class="stat-box">
                    <label>Błogosławieństwo Merlina</label>
                    <button class="btn btn-sm ${character.blessing ? "btn-gold" : ""}" data-action="toggle-blessing" data-character="${key}">
                        ${character.blessing ? "Dostępne" : "Wykorzystane"}
                    </button>
                </div>
            </div>

            <h4>Archetypy</h4>
            <div class="mg-archetype-list">
                ${ARCHETYPE_ORDER.map(k => renderArchetypeEditor(data, key, k, character.archetypes[k])).join("")}
            </div>

            <h4>Ekwipunek zwykły</h4>
            ${renderEquipmentEditor(character)}

            <h4>Przedmioty Legendarne (posiadane)</h4>
            <div class="equipment-legendary">
                ${ownedLegendaryHtml || `<span class="placeholder">Brak.</span>`}
            </div>

            ${renderPowerReset(character, transformation)}
        </section>
    `;
}

/* -- Rzut MG (niezależny od Archetypów/postaci) ---------------------------------------------- */

function buildMgPendingRollHtml() {
    const pr = ui.pendingRoll;
    return `
        <div class="card roller-panel">
            <h2>Rzut MG</h2>
            <div class="roller-result">
                <h3>Wynik: ${escapeHtml(pr.tierLabel)}</h3>
                <div class="dice-row">${diceChipsHtml(pr.dice, pr.graalDice)}</div>
                <p class="placeholder">Jedynki: ${pr.oneIndices.length} (anulowały ${pr.cancelledIndices.length} najwyższych kości)</p>
                <div class="roller-actions">
                    <button class="btn btn-gold" data-action="mg-finalize-roll">Zatwierdź i zapisz do dziennika</button>
                    <button class="btn btn-sm" data-action="mg-cancel-roll">Odrzuć rzut</button>
                </div>
            </div>
        </div>
    `;
}

function buildMgRollerHtml() {
    if (ui.pendingRoll) return buildMgPendingRollHtml();
    const poolTotal = ui.rollDiceCount + ui.rollGraalDice;
    return `
        <div class="card roller-panel">
            <h2>Rzut MG</h2>
            <div class="roller-setup">
                <h3>Kości</h3>
                <label class="mg-inline-field">Liczba kości
                    <input type="number" min="1" class="mg-input-num" id="mgRollDiceCount" value="${ui.rollDiceCount}">
                </label>

                <h3>Kości Graala</h3>
                <p class="placeholder">Pula MG jest niezależna od Archetypów postaci i nielimitowana.</p>
                <div class="stat-controls">
                    <button class="btn btn-xs" data-action="mg-graal-dec">−</button>
                    <span>${ui.rollGraalDice}</span>
                    <button class="btn btn-xs" data-action="mg-graal-inc">+</button>
                </div>

                <div class="roller-pool-summary">
                    Pula testu: <strong>${poolTotal}</strong>
                </div>

                <button class="btn btn-gold" data-action="mg-do-roll">Rzuć kośćmi</button>
            </div>
        </div>
    `;
}

/* -- Złożenie całości ------------------------------------------------------------------------ */

function buildHtml(ctx) {
    const { state, data, session } = ctx;
    if (session.role !== "mg") return `<p class="placeholder">Panel dostępny tylko dla Mistrza Gry.</p>`;

    const characters = Object.values(state.characters || {});
    if (!characters.length) return `<p class="placeholder">Brak postaci w kampanii.</p>`;

    const activeKey = resolveActiveCharacterKey(state);
    const activeCharacter = activeKey ? state.characters[activeKey] : null;

    const activeTopTab = ui.activeTopTab || "kampania";
    const nowPlaying = getNowPlaying();

    return `
        <div class="mg-unified-wrap">
            ${renderTopTabs(activeTopTab)}
            ${renderCampWindFull(state)}

            <div class="mg-grid-12">
                <div class="mg-characters-col">
                    ${activeTopTab === "muzyka" ? buildSoundboardControlHtml(ctx, nowPlaying) : ""}
                    ${activeTopTab === "handouty" ? buildHandoutsControlHtml(ctx) : ""}
                    ${activeTopTab === "kampania" ? `
                        ${renderModifierModule(ctx)}
                        ${renderLegendaryCatalog(ctx)}
                        ${renderCharacterTabs(characters, activeKey)}
                        ${activeCharacter ? renderCharacterBlock(activeCharacter, ctx) : `<p class="placeholder">Brak wybranej postaci.</p>`}
                    ` : ""}
                </div>

                <div class="mg-roller-col">
                    ${buildMgRollerHtml()}
                    <div class="card">${buildJournalHtml(ctx)}</div>
                </div>
            </div>
        </div>
        ${renderLegendaryModal(ctx)}
        ${buildSoundboardPlaylistEditorHtml(ctx)}
        ${buildPlaylistPreviewHtml(ctx, nowPlaying)}
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

        if (el.id === "mgModCharacter") { ui.modAddCharacterKey = el.value; return; }
        if (el.id === "mgModArchetype") { ui.modAddArchetypeKey = el.value; return; }

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

        if (action === "assign-legendary") {
            const itemKey = el.dataset.key;
            const newOwnerKey = el.value || null;
            withState(root, (state) => {
                let previousOwnerName = null;
                for (const c of Object.values(state.characters)) {
                    if ((c.legendaryItemKeys || []).includes(itemKey)) {
                        previousOwnerName = c.name;
                        c.legendaryItemKeys = c.legendaryItemKeys.filter(k => k !== itemKey);
                        c.disabledItemKeys = (c.disabledItemKeys || []).filter(k => k !== itemKey);
                    }
                }
                let newOwnerName = null;
                if (newOwnerKey && state.characters[newOwnerKey]) {
                    state.characters[newOwnerKey].legendaryItemKeys.push(itemKey);
                    newOwnerName = state.characters[newOwnerKey].name;
                }
                logEvent(state, "equipment-change",
                    `Przedmiot Legendarny "${itemKey}" przypisany: ${previousOwnerName || "brak"} → ${newOwnerName || "brak"}.`);
            });
            return;
        }

        if (action === "toggle-legendary-disabled-modal") {
            const itemKey = el.dataset.key;
            withState(root, (state) => {
                const ownerKey = findOwnerKey(state, itemKey);
                if (!ownerKey) return;
                const character = state.characters[ownerKey];
                if (!character.disabledItemKeys) character.disabledItemKeys = [];
                const isDisabled = character.disabledItemKeys.includes(itemKey);
                if (isDisabled) character.disabledItemKeys = character.disabledItemKeys.filter(k => k !== itemKey);
                else character.disabledItemKeys.push(itemKey);
                logEvent(state, "equipment-disabled", `${character.name}: Legendarny przedmiot "${itemKey}" ${isDisabled ? "przywrócony" : "wygaszony"}.`);
            });
            return;
        }

        // Suwak głośności muzyki (<input type="range">) - patrz shared/soundboard/control-panel.js.
        if (handleSoundboardAction(action, el, { ...root._ctx, updateState })) {
            rerender(root);
            return;
        }
    });

    root.addEventListener("click", (e) => {
        const { session } = root._ctx;
        if (session.role !== "mg") return;

        if (e.target.classList.contains("modal-backdrop")) {
            ui.openLegendaryKey = null;
            rerender(root);
            return;
        }

        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const characterKey = btn.dataset.character;

        if (action === "mg-select-character") {
            ui.activeCharacterKey = btn.dataset.key;
            rerender(root);
            return;
        }

        if (action === "mg-select-top-tab") {
            ui.activeTopTab = btn.dataset.tab;
            rerender(root);
            return;
        }

        if (action === "despair-inc" || action === "despair-dec") {
            withCharacter(root, characterKey, (character, state) => {
                const dMax = despairMax(character);
                const before = character.despair.current;
                character.despair.current = clamp(before + (action === "despair-inc" ? 1 : -1), 0, dMax);
                if (character.despair.current !== before) {
                    logEvent(state, "despair-change", `${character.name}: Rozpacz ${before} → ${character.despair.current}.`);
                }
            });
            return;
        }

        if (action === "toggle-blessing") {
            withCharacter(root, characterKey, (character, state) => {
                character.blessing = !character.blessing;
                logEvent(state, "blessing-change", `${character.name}: Błogosławieństwo Merlina ${character.blessing ? "aktywowane" : "utracone"}.`);
            });
            return;
        }

        if (action === "add-modifier-global") {
            const charSelect = document.getElementById("mgModCharacter");
            const archSelect = document.getElementById("mgModArchetype");
            const targetCharacterKey = charSelect?.value || ui.modAddCharacterKey;
            const archetypeKey = archSelect?.value || ui.modAddArchetypeKey;
            const label = document.getElementById("mgModLabel")?.value.trim();
            const delta = parseInt(document.getElementById("mgModDelta")?.value, 10) || 0;
            const tooltip = document.getElementById("mgModTooltip")?.value.trim();
            if (!targetCharacterKey || !archetypeKey || !label) return;
            ui.modAddCharacterKey = targetCharacterKey;
            ui.modAddArchetypeKey = archetypeKey;
            withCharacter(root, targetCharacterKey, (character, state) => {
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

        if (action === "open-legendary") {
            ui.openLegendaryKey = btn.dataset.key;
            rerender(root);
            return;
        }

        if (action === "close-legendary") {
            ui.openLegendaryKey = null;
            rerender(root);
            return;
        }

        if (action === "save-legendary-tooltip") {
            const itemKey = btn.dataset.key;
            const textarea = document.getElementById("mgLegendaryTooltipInput");
            const value = textarea ? textarea.value.trim() : "";
            withState(root, (state) => {
                if (!state.itemOverrides) state.itemOverrides = {};
                state.itemOverrides[itemKey] = { tooltip: value };
                logEvent(state, "equipment-change", `Zaktualizowano opis Przedmiotu Legendarnego "${itemKey}".`);
            });
            return;
        }

        if (action === "mg-graal-inc" || action === "mg-graal-dec") {
            ui.rollGraalDice = clamp(ui.rollGraalDice + (action === "mg-graal-inc" ? 1 : -1), 0, 999);
            rerender(root);
            return;
        }

        if (action === "mg-do-roll") {
            const diceInput = document.getElementById("mgRollDiceCount");
            const diceCount = Math.max(1, parseInt(diceInput?.value, 10) || 1);
            ui.rollDiceCount = diceCount;
            const poolTotal = diceCount + ui.rollGraalDice;
            const result = rollTestPool(poolTotal);
            ui.pendingRoll = {
                diceCount,
                graalDice: ui.rollGraalDice,
                dice: result.dice,
                oneIndices: result.oneIndices,
                cancelledIndices: result.cancelledIndices,
                tier: result.tier,
                tierLabel: TEST_TIER_LABELS[result.tier] || result.tier
            };
            rerender(root);
            return;
        }

        if (action === "mg-finalize-roll") {
            const pr = ui.pendingRoll;
            if (!pr) return;
            logRoll({
                characterKey: null,
                characterName: "MG",
                archetypeKey: "",
                archetypeLabel: "",
                archetypeDice: pr.diceCount,
                graalDice: pr.graalDice,
                dice: pr.dice,
                tier: pr.tier,
                note: ""
            });
            ui.pendingRoll = null;
            ui.rollGraalDice = 0;
            rerender(root);
            return;
        }

        if (action === "mg-cancel-roll") {
            ui.pendingRoll = null;
            rerender(root);
            return;
        }

        // Przewijanie (klik na pasku postępu) - poza handleSoundboardAction, bo control-panel.js
        // (czyste HTML) nie zna `duration` żadnego <audio> - to wie tylko player-engine.js
        // (patrz getNowPlaying()). Przewijanie = po prostu przesunięcie startedAt wstecz/w przód,
        // bo cała synchronizacja odtwarzania już i tak liczy pozycję z (teraz - startedAt).
        if (action === "sb-seek") {
            const nowPlaying = getNowPlaying();
            if (!nowPlaying) return;
            const rect = btn.getBoundingClientRect();
            const fraction = clamp((e.clientX - rect.left) / rect.width, 0, 1);
            const seekSeconds = fraction * nowPlaying.duration;
            updateState((state) => {
                if (state.soundboard?.music) state.soundboard.music.startedAt = Date.now() - seekSeconds * 1000;
            });
            rerender(root);
            return;
        }

        // Akcje modułu Dźwięki (play/stop muzyki, wyzwolenie efektu) - patrz shared/soundboard/.
        if (handleSoundboardAction(action, btn, { ...root._ctx, updateState })) {
            rerender(root);
            return;
        }

        // Akcje modułu Handouty (pokaż/ukryj, powiększenie) - patrz shared/handouts/.
        if (handleHandoutsAction(action, btn, { ...root._ctx, updateState })) {
            rerender(root);
            return;
        }

        // Akcje dziennika (usuwanie wpisów/czyszczenie historii) - patrz panels/journal.js.
        if (handleJournalAction(action, btn, root._ctx)) {
            rerender(root);
            return;
        }
    });

    // Przeciąganie kolejności - osobne zdarzenia (dragstart/dragover/drop), bo to nie jest zwykły
    // klik na [data-action]. Dwa konteksty dzielą tę samą obsługę: kolejność utworów WEWNĄTRZ
    // mini-kreatora playlisty (.sb-playlist-order-item, lokalny szkic, patrz
    // reorderPlaylistEditorTrack) i kolejność KART w głównej liście Dźwięki
    // ([data-reorder-scope="main"], zapisywana od razu do stanu, patrz reorderMainOrder). Przyciski
    // ↑/↓ obok obu list (patrz sb-editor-move-track / sb-move-entry wyżej) są odpowiednikiem dla
    // dotyku, gdzie natywne HTML5 drag&drop nie działa.
    let sbDragKey = null;
    let sbDragScope = null;

    function closestDraggable(target) {
        const playlistItem = target.closest(".sb-playlist-order-item");
        if (playlistItem) return { item: playlistItem, scope: "playlist" };
        const mainItem = target.closest("[data-reorder-scope='main']");
        if (mainItem) return { item: mainItem, scope: "main" };
        return null;
    }

    root.addEventListener("dragstart", (e) => {
        const found = closestDraggable(e.target);
        if (!found) return;
        sbDragKey = found.item.dataset.key;
        sbDragScope = found.scope;
        e.dataTransfer.effectAllowed = "move";
    });

    root.addEventListener("dragover", (e) => {
        if (!sbDragKey) return;
        const found = closestDraggable(e.target);
        if (!found || found.scope !== sbDragScope) return;
        e.preventDefault();
    });

    root.addEventListener("drop", (e) => {
        if (!sbDragKey) return;
        const found = closestDraggable(e.target);
        if (!found || found.scope !== sbDragScope) return;
        e.preventDefault();
        if (sbDragScope === "playlist") {
            reorderPlaylistEditorTrack(sbDragKey, found.item.dataset.key);
        } else {
            reorderMainOrder({ ...root._ctx, updateState }, sbDragKey, found.item.dataset.key);
        }
        sbDragKey = null;
        sbDragScope = null;
        rerender(root);
    });

    // Nazwa playlisty w mini-kreatorze - zapisywana na bieżąco BEZ rerenderu (patrz
    // control-panel.js#setPlaylistEditorName), żeby przetrwała rerender wywołany inną akcją w tym
    // samym modalu (np. zaznaczenie utworu) i żeby pisanie nie gubiło kursora/fokusu.
    root.addEventListener("input", (e) => {
        if (e.target.id === "sbPlaylistNameInput") setPlaylistEditorName(e.target.value);
    });
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx);
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
        // Odświeża pasek postępu utworu co sekundę - TYLKO gdy zakładka Muzyka jest aktywna i coś
        // faktycznie gra (patrz player-engine.js#getNowPlaying), żeby nie przerenderowywać całego
        // panelu MG bez potrzeby.
        setInterval(() => {
            if (ui.activeTopTab === "muzyka" && getNowPlaying()) rerender(root);
        }, 1000);
    }
}
