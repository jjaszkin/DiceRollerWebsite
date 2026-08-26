// Hysteria Highest - Dashboard. Widok Mistrza Gry - jeden nietabowy root (#mgUnifiedRoot) z
// WŁASNĄ, wewnętrzną nawigacją (ui.activeTab, lokalny stan nie zapisywany do Firebase) - wzorzec
// z darkgraal3dashboard/js/panels/mg.js. Zakładki: Tarot (dobieranie/przenoszenie/wydawanie kart),
// Tor Boskości (korekta postępu), Karty postaci (edycja wszystkich 8), Handouty (moduł shared/
// handouts/ 1:1), Ustawienia (PIN, reset talii).

import { CROSS_POSITIONS } from "../state.js";
import { renderCard, openCardModal } from "../cardView.js";
import { getAvailableCards, drawRandomCard, isHouseMatch } from "../deck.js";
import { escapeHtml, preserveScroll, renderMoveText } from "../utils.js";
import { openModal } from "../modal.js";
import {
    buildHandoutsControlHtml, handleHandoutsAction, reorderHandoutsOrder
} from "../../../shared/handouts/control-panel.js";
import { getZoomKey, wireZoomPan } from "../../../shared/handouts/zoom.js";
import {
    buildSoundboardControlHtml, buildSoundboardPlaylistEditorHtml, buildPlaylistPreviewHtml,
    handleSoundboardAction, reorderPlaylistEditorTrack, reorderMainOrder, setPlaylistEditorName,
    updateSoundboardProgressInPlace
} from "../../../shared/soundboard/control-panel.js";
import { getNowPlaying } from "../../../shared/soundboard/player-engine.js";
import * as journalPanel from "./journal.js";
import { logEvent } from "../eventLog.js";

const POSITION_LABELS = { gorna: "Górna", dolna: "Dolna", lewa: "Lewa", prawa: "Prawa", srodkowa: "Środkowa" };
const STAGE_LABELS = { 1: "Etap 1 — Małe Arkana", 2: "Etap 2 — + Archonci / Anioły Śmierci", 3: "Etap 3 — + Super Arkana" };
const ROLE_LABELS = { absolwent: "Absolwent", straznik: "Strażnik" };
const AWARENESS_OPTIONS = [["swiadomy", "Świadomy"], ["oswiecony", "Oświecony"]];

function getUi(root) {
    if (!root._ui) root._ui = { activeTab: "tarot", selectedCards: {}, activeCharKey: null };
    return root._ui;
}

// ── Zakładka: Tarot ─────────────────────────────────────────────────────────────

function buildTarotTab(ctx, ui) {
    const { state, data } = ctx;
    const cards = data.cards;

    const stageButtons = [1, 2, 3].map(stage => `
        <button class="btn btn-xs ${state.deck.activeStage === stage ? "active" : ""}" data-action="set-stage" data-stage="${stage}">${STAGE_LABELS[stage]}</button>
    `).join("");

    const remaining = getAvailableCards(state, data).length;

    const cross = CROSS_POSITIONS.map(pos => {
        const key = state.cross[pos];
        const charOptions = data.characters.characters.map(c => `<option value="${c.key}">${escapeHtml(c.name)}</option>`).join("");
        return `
            <div class="cross-slot cross-slot-${pos}">
                <span class="cross-slot-label">${POSITION_LABELS[pos]}</span>
                ${renderCard(cards, key, { size: "md", removable: !!key, removeData: { pos } })}
                ${key ? `
                    <div class="cross-slot-controls">
                        <select class="cross-assign-select" data-pos="${pos}">${charOptions}</select>
                        <button class="btn btn-xs" data-action="assign-cross" data-pos="${pos}">Przenieś do postaci</button>
                        <button class="btn btn-xs btn-danger" data-action="discard-cross" data-pos="${pos}">Odrzuć</button>
                    </div>
                ` : `
                    <button class="btn btn-xs" data-action="draw-cross" data-pos="${pos}" ${remaining ? "" : "disabled"}>Dobierz kartę</button>
                `}
            </div>
        `;
    }).join("");

    // Sparowane wiersze [Strażnik, Absolwent] per gracz - ta sama kolejność co widok Graczy
    // (panels/tarot.js#buildPairedCharacterRows), żeby układ MG był 1:1 analogiczny.
    const byKey = Object.fromEntries(data.characters.characters.map(c => [c.key, c]));
    const orderedChars = [];
    for (const pair of data.characters.pairs) {
        const chars = pair.characters.map(k => byKey[k]);
        orderedChars.push(chars.find(c => c.role === "straznik"), chars.find(c => c.role === "absolwent"));
    }

    const characters = orderedChars.map(charDef => {
        const charState = state.characters[charDef.key];
        const selected = ui.selectedCards[charDef.key] || new Set();
        // Checkbox (zaznaczenie do wydania) i karta (klik = modal opisu) są RODZEŃSTWEM, nie
        // zagnieżdżone w <label> - zagnieżdżony <button> (karta) w <label> powodowałby, że klik w
        // kartę TAKŻE przełączałby checkbox przez natywne zachowanie label->control.
        const chips = charState.cards.length ? charState.cards.map(k => `
            <div class="tarot-card-select ${selected.has(k) ? "selected" : ""}">
                <input type="checkbox" data-action="toggle-select-card" data-char="${charDef.key}" data-card="${k}" ${selected.has(k) ? "checked" : ""}>
                ${renderCard(cards, k, { size: "sm", removable: true, removeData: { char: charDef.key, card: k } })}
            </div>
        `).join("") : `<span class="placeholder-inline">brak kart</span>`;

        const selectedArr = [...selected];
        const canSpend = selectedArr.length === 3;
        const bonus = canSpend && isHouseMatch(data, selectedArr) ? 2 : 1;

        return `
            <div class="char-card-row">
                <span class="char-card-row-name">${escapeHtml(charDef.name)}</span>
                <div class="char-card-row-cards">${chips}</div>
                <button class="btn btn-xs" data-action="spend-cards" data-char="${charDef.key}" ${canSpend ? "" : "disabled"}>
                    Wydaj 3 karty → +${canSpend ? bonus : "?"} na Torze
                </button>
            </div>
        `;
    }).join("");

    return `
        <div class="card">
            <h3>Talia</h3>
            <div class="deck-stage-controls">${stageButtons}</div>
            <p class="deck-count">Dostępnych do dobrania: ${remaining}</p>
        </div>
        <div class="tarot-layout">
            <div class="tarot-cross-area card">
                <h3>Krzyż tarota</h3>
                <div class="mystic-cross">${cross}</div>
            </div>
            <div class="tarot-characters-area card">
                <h3>Ręka postaci</h3>
                <div class="tarot-pairs-grid">${characters}</div>
                <div class="give-card-module">
                    <h4 class="sheet-block-title">Dodaj konkretną kartę postaci</h4>
                    <div class="give-card-row">
                        <select id="giveCardSelect" ${remaining ? "" : "disabled"}>
                            ${remaining ? getAvailableCards(state, data).map(c => `<option value="${c.key}">${escapeHtml(c.name)}</option>`).join("") : `<option value="">Brak dostępnych kart</option>`}
                        </select>
                        <select id="giveCardCharSelect">
                            ${orderedChars.map(c => `<option value="${c.key}">${escapeHtml(c.name)}</option>`).join("")}
                        </select>
                        <button class="btn btn-xs" data-action="give-card" ${remaining ? "" : "disabled"}>Przekaż kartę</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function handleTarotAction(action, el, root) {
    const { state, data, updateState } = root._ctx;
    const ui = getUi(root);

    if (action === "set-stage") {
        updateState(s => { s.deck.activeStage = Number(el.dataset.stage); });
        return true;
    }
    if (action === "draw-cross") {
        const drawn = drawRandomCard(state, data);
        if (!drawn) return true;
        updateState(s => { s.cross[el.dataset.pos] = drawn.key; });
        return true;
    }
    if (action === "assign-cross") {
        const select = root.querySelector(`.cross-assign-select[data-pos="${el.dataset.pos}"]`);
        const charKey = select?.value;
        if (!charKey) return true;
        updateState(s => {
            const key = s.cross[el.dataset.pos];
            if (!key) return;
            s.cross[el.dataset.pos] = null;
            s.characters[charKey].cards.push(key);
        });
        return true;
    }
    if (action === "discard-cross") {
        updateState(s => {
            const key = s.cross[el.dataset.pos];
            if (!key) return;
            s.cross[el.dataset.pos] = null;
            s.deck.discardKeys.push(key);
        });
        return true;
    }
    if (action === "give-card") {
        const cardKey = root.querySelector("#giveCardSelect")?.value;
        const charKey = root.querySelector("#giveCardCharSelect")?.value;
        if (!cardKey || !charKey) return true;
        updateState(s => { s.characters[charKey].cards.push(cardKey); });
        return true;
    }
    if (action === "return-card") {
        const { pos, char: charKey, card: cardKey } = el.dataset;
        updateState(s => {
            if (pos) {
                s.cross[pos] = null;
            } else if (charKey && cardKey) {
                const list = s.characters[charKey].cards;
                const idx = list.indexOf(cardKey);
                if (idx !== -1) list.splice(idx, 1);
            }
        });
        if (charKey && cardKey) ui.selectedCards[charKey]?.delete(cardKey);
        return true;
    }
    if (action === "toggle-select-card") {
        const charKey = el.dataset.char;
        const cardKey = el.dataset.card;
        if (!ui.selectedCards[charKey]) ui.selectedCards[charKey] = new Set();
        const set = ui.selectedCards[charKey];
        if (set.has(cardKey)) set.delete(cardKey);
        else if (set.size < 3) set.add(cardKey);
        return true;
    }
    if (action === "spend-cards") {
        const charKey = el.dataset.char;
        const selected = [...(ui.selectedCards[charKey] || [])];
        if (selected.length !== 3) return true;
        const bonus = isHouseMatch(data, selected) ? 2 : 1;
        const charDef = data.characters.characters.find(c => c.key === charKey);
        updateState(s => {
            const charState = s.characters[charKey];
            charState.cards = charState.cards.filter(k => !selected.includes(k));
            s.deck.discardKeys.push(...selected);
            charState.divinityProgress = Math.min(charDef.divinitySteps, charState.divinityProgress + bonus);
        });
        ui.selectedCards[charKey] = new Set();
        return true;
    }
    return false;
}

// ── Zakładka: Tor Boskości ──────────────────────────────────────────────────────

function buildDivinityTab(ctx) {
    const { state, data } = ctx;
    const groups = ["straznik", "absolwent"].map(role => {
        const chars = data.characters.characters.filter(c => c.role === role);
        const rows = chars.map(charDef => {
            const charState = state.characters[charDef.key];
            const pips = Array.from({ length: charDef.divinitySteps }, (_, i) => `
                <button class="divinity-pip ${i < charState.divinityProgress ? "filled" : ""}" data-action="set-divinity" data-char="${charDef.key}" data-value="${i + 1}"></button>
            `).join("");
            return `
                <div class="divinity-row">
                    <span class="divinity-row-name">${escapeHtml(charDef.name)}</span>
                    <div class="divinity-track">${pips}</div>
                    <button class="btn btn-xs" data-action="set-divinity" data-char="${charDef.key}" data-value="0">Zeruj</button>
                </div>
            `;
        }).join("");
        return `<div class="card"><h3>${ROLE_LABELS[role]}</h3>${rows}</div>`;
    }).join("");
    return groups;
}

function handleDivinityAction(action, el, root) {
    if (action !== "set-divinity") return false;
    const { updateState } = root._ctx;
    const charKey = el.dataset.char;
    const value = Number(el.dataset.value);
    updateState(s => { s.characters[charKey].divinityProgress = value; });
    return true;
}

// ── Zakładka: Karty postaci ─────────────────────────────────────────────────────

/** Wiersz edytora Mrocznych sekretów (✦) / Komplikacji (✧): checkbox "aktywny" (odpowiada opacity
 *  20% na karcie u Gracza, patrz Figma 895-298) + pole tekstowe + usuń. Komplikacje: baza nazwy
 *  (przed nawiasem) powinna odpowiadać wpisowi w data/komplikacje.json, żeby dostać hover+rzut. */
function listEditorHtml(items, charKey, field, symbol, addLabel) {
    const rows = items.map((item, i) => `
        <div class="mg-list-row">
            <input type="checkbox" data-action="toggle-item-active" data-char="${charKey}" data-field="${field}" data-index="${i}" ${item.active ? "checked" : ""} title="Aktywny (widoczny/klikalny u Gracza)">
            <input type="text" data-action="set-item-label" data-char="${charKey}" data-field="${field}" data-index="${i}" value="${escapeHtml(item.label)}">
            <button type="button" class="btn btn-xs btn-danger" data-action="remove-item" data-char="${charKey}" data-field="${field}" data-index="${i}">✕</button>
        </div>
    `).join("");
    return `
        <div class="mg-list-editor">${rows}</div>
        <button type="button" class="btn btn-xs" data-action="add-item" data-char="${charKey}" data-field="${field}">+ ${addLabel}</button>
    `;
}

function buildCharactersTab(ctx, ui) {
    const { state, data } = ctx;
    const activeKey = ui.activeCharKey || data.characters.characters[0].key;
    const charDef = data.characters.characters.find(c => c.key === activeKey);
    const charState = state.characters[activeKey];

    const tabs = data.characters.characters.map(c => `
        <button class="btn btn-xs ${c.key === activeKey ? "active" : ""}" data-action="select-char" data-char="${c.key}">${escapeHtml(c.name)}</button>
    `).join("");

    const attrInputs = data.characters.attrOrder.map(k => `
        <label class="mg-attr-input">
            ${k}
            <input type="number" data-action="set-attr" data-char="${activeKey}" data-attr="${k}" value="${charState.attrs[k]}">
        </label>
    `).join("");

    const abilityChecks = data.atuty.map(a => `
        <label class="ability-check">
            <input type="checkbox" data-action="toggle-ability" data-char="${activeKey}" data-ability="${a.id}" ${charState.abilities.includes(a.id) ? "checked" : ""}>
            ${escapeHtml(a.name)}
        </label>
    `).join("");

    return `
        <div class="card">
            <h3>Wybierz postać</h3>
            <div class="mg-char-tabs">${tabs}</div>
        </div>
        <div class="card">
            <h3>${escapeHtml(charDef.name)} — ${ROLE_LABELS[charDef.role]}</h3>
            <label>Świadomość
                <select data-action="set-awareness" data-char="${activeKey}">
                    ${AWARENESS_OPTIONS.map(([v, l]) => `<option value="${v}" ${charState.awareness === v ? "selected" : ""}>${l}</option>`).join("")}
                </select>
            </label>
            <label>Stabilność
                <select data-action="set-stability" data-char="${activeKey}">
                    ${data.characters.stabilityLevels.map(lvl => `<option value="${lvl.value}" ${charState.stability === lvl.value ? "selected" : ""}>${lvl.value} — ${escapeHtml(lvl.label)}</option>`).join("")}
                </select>
            </label>
            <h4 class="sheet-block-title">Mroczne sekrety ✦</h4>
            ${listEditorHtml(charState.darkSecrets, activeKey, "darkSecrets", "✦", "Dodaj sekret")}
            <h4 class="sheet-block-title">Komplikacje ✧</h4>
            <p class="placeholder">Bazowa nazwa (przed nawiasem, np. "Prześladowca" w "Prześladowca (Nick 2.0)") dopasowywana do data/komplikacje.json - stąd hover z mechaniką i przycisk Rzuć u Gracza.</p>
            ${listEditorHtml(charState.complications, activeKey, "complications", "✧", "Dodaj komplikację")}
            <h4 class="sheet-block-title">Cechy</h4>
            <div class="mg-attr-grid">${attrInputs}</div>
            <h4 class="sheet-block-title">Zdolności / Atuty</h4>
            <div class="mg-ability-list">${abilityChecks}</div>
        </div>
    `;
}

function handleCharactersAction(action, el, root) {
    const { updateState } = root._ctx;
    const ui = getUi(root);

    if (action === "select-char") {
        ui.activeCharKey = el.dataset.char;
        return true;
    }
    if (action === "toggle-ability") {
        const charKey = el.dataset.char;
        const abilityId = el.dataset.ability;
        updateState(s => {
            const list = s.characters[charKey].abilities;
            const idx = list.indexOf(abilityId);
            if (idx === -1) list.push(abilityId); else list.splice(idx, 1);
        });
        return true;
    }
    if (action === "add-item") {
        const charKey = el.dataset.char;
        const field = el.dataset.field;
        updateState(s => { s.characters[charKey][field].push({ label: "Nowy wpis", active: true }); });
        return true;
    }
    if (action === "remove-item") {
        const charKey = el.dataset.char;
        const field = el.dataset.field;
        const index = Number(el.dataset.index);
        updateState(s => { s.characters[charKey][field].splice(index, 1); });
        return true;
    }
    return false;
}

function handleCharactersChange(el, root) {
    const { data, updateState } = root._ctx;
    const action = el.dataset.action;
    const charKey = el.dataset.char;
    const charName = data.characters.characters.find(c => c.key === charKey)?.name || charKey;
    if (action === "set-attr") {
        updateState(s => { s.characters[charKey].attrs[el.dataset.attr] = Number(el.value) || 0; });
        return true;
    }
    if (action === "set-awareness") {
        updateState(s => { s.characters[charKey].awareness = el.value; });
        return true;
    }
    if (action === "set-stability") {
        const value = Number(el.value);
        const level = data.characters.stabilityLevels.find(l => l.value === value);
        updateState(s => { s.characters[charKey].stability = value; });
        logEvent(updateState, `${charName}: Stabilność → ${value} ${level ? level.label : ""} (MG)`);
        return true;
    }
    if (action === "toggle-item-active") {
        const field = el.dataset.field;
        const index = Number(el.dataset.index);
        updateState(s => { s.characters[charKey][field][index].active = el.checked; });
        return true;
    }
    if (action === "set-item-label") {
        const field = el.dataset.field;
        const index = Number(el.dataset.index);
        updateState(s => { s.characters[charKey][field][index].label = el.value; });
        return true;
    }
    return false;
}

// ── Zakładka: Punkty Wpływu ──────────────────────────────────────────────────────

/** Bazowa nazwa Komplikacji (przed nawiasem z detalem, np. "Prześladowca (Nick 2.0)" ->
 *  "Prześladowca") - dopasowanie do data/komplikacje.json, wzorem panels/character.js#baseLabel. */
function baseLabel(label) {
    return label.split(" (")[0].trim();
}

/** Treść modala z opisem/mechaniką Atutu lub Komplikacji - 1:1 z panels/character.js#mechanicsBodyHtml
 *  (bez duplikowania importu, bo to jedyne dwa miejsca, które tego potrzebują). */
function mechanicsBodyHtml(item) {
    return `
        ${item.attr ? `<div class="card-tooltip-kicker">${escapeHtml(item.attr)}</div>` : ""}
        <div class="card-tooltip-desc">${escapeHtml(item.intro || "")}</div>
        ${item.high ? `<div class="card-tooltip-row"><b>15+:</b></div>${renderMoveText(item.high)}` : ""}
        ${item.mid ? `<div class="card-tooltip-row"><b>10-14:</b></div>${renderMoveText(item.mid)}` : ""}
        ${item.low ? `<div class="card-tooltip-row"><b>≤9:</b></div>${renderMoveText(item.low)}` : ""}
    `;
}

/** Klik na nazwę w "Punkty Wpływu" -> ten sam modal z opisem co u Graczy na karcie postaci (patrz
 *  panels/character.js#openAbilityModal/openComplicationModal), ale BEZ przycisku "Rzuć" (MG tu
 *  tylko sprawdza mechanikę, nie rzuca za postać) - stąd brak `rollLabel`/`onRoll` w openModal(). */
function openInfluenceInfoModal(ctx, kind, refId, name) {
    if (kind === "ability") {
        const found = ctx.data.atuty.find(a => a.id === refId);
        if (!found) return;
        openModal({ title: `☆ ${escapeHtml(found.name)}`, bodyHtml: mechanicsBodyHtml(found) });
        return;
    }
    const found = ctx.data.komplikacje.find(k => k.name.toLowerCase() === baseLabel(name).toLowerCase());
    if (!found) return;
    openModal({ title: `✧ ${escapeHtml(name)}`, bodyHtml: mechanicsBodyHtml(found) });
}

/** Wiersz Atutu/Komplikacji z licznikiem Punktów Wpływu MG (pipsy, klik = zużyj jeden + wpis do
 *  Dziennika) i przyciskiem "+1 Wpływu" (przyznanie, bez wpisu do Dziennika - patrz uzasadnienie w
 *  handleInfluenceAction). `kind`: "ability" (refId = id z data/atuty.json) | "complication"
 *  (refId = index w charState.complications). Nazwa jest klikalna -> modal z opisem/mechaniką. */
function influenceRowHtml({ charKey, kind, refId, name, count }) {
    const pips = Array.from({ length: count }, () => `
        <button type="button" class="influence-pip" data-action="spend-influence" data-char="${charKey}" data-kind="${kind}" data-ref="${refId}" title="Zużyj punkt Wpływu"></button>
    `).join("");
    return `
        <div class="influence-row">
            <button type="button" class="influence-row-name" data-action="open-influence-info" data-kind="${kind}" data-ref="${refId}" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>
            <div class="influence-pip-row">${pips}</div>
            <button type="button" class="btn btn-xs" data-action="add-influence" data-char="${charKey}" data-kind="${kind}" data-ref="${refId}">+1 Wpływu</button>
        </div>
    `;
}

/** Dwie kolumny, sparowane per gracz (Strażnik po lewej, Absolwent po prawej) - ta sama kolejność
 *  co "Ręka postaci" na tabie Tarot (patrz buildPairedCharacterRows w panels/tarot.js), więc Jasper
 *  obok Jose, Nick obok X, Jesse obok Miguela, Paul obok Orlando - potwierdzone przez usera. */
function buildInfluenceTab(ctx) {
    const { state, data } = ctx;
    const byKey = Object.fromEntries(data.characters.characters.map(c => [c.key, c]));
    const orderedChars = [];
    for (const pair of data.characters.pairs) {
        const chars = pair.characters.map(k => byKey[k]);
        orderedChars.push(chars.find(c => c.role === "straznik"), chars.find(c => c.role === "absolwent"));
    }

    const cards = orderedChars.map(charDef => {
        const charState = state.characters[charDef.key];

        const abilityRows = charState.abilities
            .map(id => data.atuty.find(a => a.id === id))
            .filter(a => a && a.attr !== "Pasywny")
            .map(a => influenceRowHtml({
                charKey: charDef.key, kind: "ability", refId: a.id, name: a.name,
                count: charState.abilityInfluence?.[a.id] || 0
            }))
            .join("");

        const complicationRows = charState.complications
            .map((c, i) => influenceRowHtml({
                charKey: charDef.key, kind: "complication", refId: String(i), name: c.label,
                count: c.influence || 0
            }))
            .join("");

        return `
            <div class="card">
                <h3>${escapeHtml(charDef.name)}</h3>
                ${abilityRows ? `<h4 class="sheet-block-title">Atuty ☆</h4>${abilityRows}` : ""}
                ${complicationRows ? `<h4 class="sheet-block-title">Komplikacje ✧</h4>${complicationRows}` : ""}
                ${!abilityRows && !complicationRows ? `<p class="placeholder">Brak Atutów/Komplikacji.</p>` : ""}
            </div>
        `;
    }).join("");

    return `<div class="tarot-pairs-grid">${cards}</div>`;
}

function findInfluenceItemName(ctx, charKey, kind, refId) {
    if (kind === "ability") {
        return ctx.data.atuty.find(a => a.id === refId)?.name || refId;
    }
    return ctx.state.characters[charKey].complications[Number(refId)]?.label || "Komplikacja";
}

/** Przyznanie punktu ("+1 Wpływu") NIE trafia do Dziennika - dzieje się często i doraźnie przy
 *  stole (po każdym częściowym/porażce na Komplikacji), więc logowanie zaśmiecałoby Dziennik.
 *  Zużycie punktu (klik w pips) TRAFIA do Dziennika - to jest ta decyzja MG warta zapisania. */
function handleInfluenceAction(action, el, root) {
    if (action !== "add-influence" && action !== "spend-influence") return false;
    const { data, updateState } = root._ctx;
    const charKey = el.dataset.char;
    const kind = el.dataset.kind;
    const refId = el.dataset.ref;
    const charName = data.characters.characters.find(c => c.key === charKey)?.name || charKey;
    const itemName = findInfluenceItemName(root._ctx, charKey, kind, refId);
    const delta = action === "add-influence" ? 1 : -1;
    let newCount = 0;
    updateState(s => {
        const charState = s.characters[charKey];
        if (kind === "ability") {
            if (!charState.abilityInfluence) charState.abilityInfluence = {};
            newCount = Math.max(0, (charState.abilityInfluence[refId] || 0) + delta);
            charState.abilityInfluence[refId] = newCount;
        } else {
            const item = charState.complications[Number(refId)];
            if (!item) return;
            newCount = Math.max(0, (item.influence || 0) + delta);
            item.influence = newCount;
        }
    });
    if (action === "spend-influence") {
        logEvent(updateState, `${charName}: MG zużywa punkt Wpływu (${itemName}) — pozostało ${newCount}`);
    }
    return true;
}

// ── Zakładka: Ustawienia ────────────────────────────────────────────────────────

function buildSettingsTab(ctx) {
    return `
        <div class="card">
            <h3>PIN Mistrza Gry</h3>
            <input type="text" id="mgPinInput" maxlength="4" inputmode="numeric" value="${escapeHtml(ctx.state.mgPin)}">
            <button class="btn btn-xs" data-action="save-pin">Zapisz PIN</button>
        </div>
        <div class="card">
            <h3>Reset talii tarota</h3>
            <p class="placeholder">Czyści krzyż, karty w rękach wszystkich postaci i stos odrzuconych - talia wraca do stanu "nierozdana". NIE dotyka Toru Boskości ani kart postaci.</p>
            <button class="btn btn-xs btn-danger" data-action="reset-deck">Resetuj talię</button>
        </div>
    `;
}

function handleSettingsAction(action, el, root) {
    if (action === "reset-deck") {
        if (!confirm("Na pewno zresetować talię? Krzyż, ręce postaci i stos odrzuconych zostaną wyczyszczone.")) return true;
        const { updateState } = root._ctx;
        updateState(s => {
            for (const pos of CROSS_POSITIONS) s.cross[pos] = null;
            s.deck.discardKeys = [];
            for (const charState of Object.values(s.characters)) charState.cards = [];
        });
        return true;
    }
    if (action !== "save-pin") return false;
    const { updateState } = root._ctx;
    const input = root.querySelector("#mgPinInput");
    if (!/^\d{4}$/.test(input.value)) return true;
    updateState(s => { s.mgPin = input.value; });
    return true;
}

// ── Root ─────────────────────────────────────────────────────────────────────────

const TABS = [
    ["tarot", "Tarot"],
    ["divinity", "Tor Boskości"],
    ["characters", "Karty postaci"],
    ["influence", "Punkty Wpływu"],
    ["music", "Muzyka"],
    ["handouts", "Handouty"],
    ["journal", "Dziennik"],
    ["settings", "Ustawienia"]
];

function buildHtml(ctx, ui) {
    const navButtons = TABS.map(([key, label]) => `
        <button class="btn ${ui.activeTab === key ? "active" : ""}" data-action="mg-tab" data-tab="${key}">${label}</button>
    `).join("");

    const nowPlaying = getNowPlaying();

    let body = "";
    if (ui.activeTab === "tarot") body = buildTarotTab(ctx, ui);
    else if (ui.activeTab === "divinity") body = buildDivinityTab(ctx);
    else if (ui.activeTab === "characters") body = buildCharactersTab(ctx, ui);
    else if (ui.activeTab === "influence") body = buildInfluenceTab(ctx);
    else if (ui.activeTab === "music") body = buildSoundboardControlHtml(ctx, nowPlaying);
    else if (ui.activeTab === "handouts") body = buildHandoutsControlHtml(ctx);
    else if (ui.activeTab === "journal") body = `<div id="mgJournalRoot"></div>`;
    else if (ui.activeTab === "settings") body = buildSettingsTab(ctx);

    return `
        <div class="mg-nav">${navButtons}</div>
        <div class="mg-body">${body}</div>
        ${buildSoundboardPlaylistEditorHtml(ctx)}
        ${buildPlaylistPreviewHtml(ctx, nowPlaying)}
    `;
}

/** Dziennik montowany jako osobny, samodzielny panel (własny root+wireEvents, patrz
 *  panels/journal.js) wewnątrz #mgJournalRoot - w odróżnieniu od reszty zakładek MG, które są
 *  czystymi funkcjami budującymi HTML w ten sam, przebudowywany co akcję root. */
function mountJournalIfActive(root, ui) {
    if (ui.activeTab !== "journal") return;
    const journalRoot = root.querySelector("#mgJournalRoot");
    if (journalRoot) journalPanel.render(journalRoot, root._ctx);
}

function rerender(root) {
    preserveScroll(() => {
        root.innerHTML = buildHtml(root._ctx, getUi(root));
        mountJournalIfActive(root, getUi(root));
    });
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "mg-tab") {
            getUi(root).activeTab = btn.dataset.tab;
            rerender(root);
            return;
        }
        if (action === "open-card") {
            openCardModal(root._ctx.data.cards, btn.dataset.cardKey);
            return;
        }
        if (action === "open-influence-info") {
            openInfluenceInfoModal(root._ctx, btn.dataset.kind, btn.dataset.ref, btn.dataset.name);
            return;
        }
        if (handleTarotAction(action, btn, root)) { rerender(root); return; }
        if (handleDivinityAction(action, btn, root)) { rerender(root); return; }
        if (handleCharactersAction(action, btn, root)) { rerender(root); return; }
        if (handleInfluenceAction(action, btn, root)) { rerender(root); return; }
        if (handleSettingsAction(action, btn, root)) { rerender(root); return; }

        // Przewijanie (klik na pasku postępu) - poza handleSoundboardAction, bo control-panel.js
        // (czyste HTML) nie zna `duration` żadnego <audio> - to wie tylko player-engine.js (patrz
        // getNowPlaying()). Przewijanie = po prostu przesunięcie startedAt wstecz/w przód, bo cała
        // synchronizacja odtwarzania już i tak liczy pozycję z (teraz - startedAt).
        if (action === "sb-seek") {
            const nowPlaying = getNowPlaying();
            if (!nowPlaying) return;
            const rect = btn.getBoundingClientRect();
            const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            const seekSeconds = fraction * nowPlaying.duration;
            root._ctx.updateState((state) => {
                if (state.soundboard?.music) state.soundboard.music.startedAt = Date.now() - seekSeconds * 1000;
            });
            rerender(root);
            return;
        }

        // Akcje modułu Dźwięki (play/stop muzyki, wyzwolenie efektu, playlisty) - patrz shared/soundboard/.
        if (handleSoundboardAction(action, btn, { ...root._ctx, updateState: root._ctx.updateState })) { rerender(root); return; }
        if (handleHandoutsAction(action, btn, { ...root._ctx, updateState: root._ctx.updateState })) { rerender(root); return; }
    });

    root.addEventListener("change", (e) => {
        if (handleCharactersChange(e.target, root)) { rerender(root); return; }
        // Suwak głośności muzyki (<input type="range">) - patrz shared/soundboard/control-panel.js.
        const action = e.target.dataset.action;
        if (action && handleSoundboardAction(action, e.target, { ...root._ctx, updateState: root._ctx.updateState })) rerender(root);
    });

    // Nazwa playlisty w mini-kreatorze - zapisywana na bieżąco BEZ rerenderu (patrz
    // control-panel.js#setPlaylistEditorName), żeby przetrwała rerender wywołany inną akcją w tym
    // samym modalu (np. zaznaczenie utworu) i żeby pisanie nie gubiło kursora/fokusu.
    root.addEventListener("input", (e) => {
        if (e.target.id === "sbPlaylistNameInput") setPlaylistEditorName(e.target.value);
    });

    // Przeciąganie kolejności - osobne zdarzenia (dragstart/dragover/drop), bo to nie jest zwykły
    // klik na [data-action]. Trzy konteksty dzielą tę samą obsługę, rozróżnione przez `scope`:
    // kolejność utworów WEWNĄTRZ mini-kreatora playlisty (.sb-playlist-order-item, lokalny szkic,
    // patrz reorderPlaylistEditorTrack), kolejność kart w głównej liście Dźwięki
    // ([data-reorder-scope="sb-main"], patrz reorderMainOrder) i kolejność kart Handoutów
    // ([data-reorder-scope="ho-main"], patrz reorderHandoutsOrder).
    const REORDER_HANDLERS = {
        playlist: (from, to) => reorderPlaylistEditorTrack(from, to),
        "sb-main": (from, to) => reorderMainOrder({ ...root._ctx, updateState: root._ctx.updateState }, from, to),
        "ho-main": (from, to) => reorderHandoutsOrder({ ...root._ctx, updateState: root._ctx.updateState }, from, to)
    };
    let dragKey = null;
    let dragScope = null;

    function closestDraggable(target) {
        const playlistItem = target.closest(".sb-playlist-order-item");
        if (playlistItem) return { item: playlistItem, scope: "playlist" };
        for (const scope of ["sb-main", "ho-main"]) {
            const item = target.closest(`[data-reorder-scope='${scope}']`);
            if (item) return { item, scope };
        }
        return null;
    }

    root.addEventListener("dragstart", (e) => {
        const found = closestDraggable(e.target);
        if (!found) return;
        dragKey = found.item.dataset.key;
        dragScope = found.scope;
        e.dataTransfer.effectAllowed = "move";
    });
    root.addEventListener("dragover", (e) => {
        if (!dragKey) return;
        const found = closestDraggable(e.target);
        if (!found || found.scope !== dragScope) return;
        e.preventDefault();
    });
    root.addEventListener("drop", (e) => {
        if (!dragKey) return;
        const found = closestDraggable(e.target);
        if (!found || found.scope !== dragScope) return;
        e.preventDefault();
        REORDER_HANDLERS[dragScope](dragKey, found.item.dataset.key);
        dragKey = null;
        dragScope = null;
        rerender(root);
    });

    document.addEventListener("keydown", (e) => {
        if (!getZoomKey()) return;
        if (e.key === "Escape") {
            e.preventDefault();
            if (handleHandoutsAction("ho-close-zoom", { dataset: {} }, root._ctx)) rerender(root);
            return;
        }
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const action = e.key === "ArrowLeft" ? "ho-zoom-prev" : "ho-zoom-next";
        if (handleHandoutsAction(action, { dataset: {} }, root._ctx)) rerender(root);
    });

    wireZoomPan(root);
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx, getUi(root));
    mountJournalIfActive(root, getUi(root));
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
        // Odświeża pasek postępu utworu co sekundę - TYLKO gdy zakładka Muzyka jest aktywna i coś
        // faktycznie gra (patrz player-engine.js#getNowPlaying). Aktualizuje TYLKO pasek postępu w
        // miejscu (patrz control-panel.js#updateSoundboardProgressInPlace) zamiast pełnego
        // rerender() - pełne przerysowanie co sekundę niszczyłoby i odtwarzało od zera cały panel
        // (m.in. retriggerując CSS :hover-transition przycisków i gubiąc fokus/wpisywaną wartość w
        // innych polach tego samego korzenia DOM, patrz darkgraal3dashboard/js/panels/mg.js).
        setInterval(() => {
            if (getUi(root).activeTab !== "music") return;
            const nowPlaying = getNowPlaying();
            if (!nowPlaying) return;
            const updated = updateSoundboardProgressInPlace(root, root._ctx.state, nowPlaying);
            if (!updated) rerender(root);
        }, 1000);
    }
}
