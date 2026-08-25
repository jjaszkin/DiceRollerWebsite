// Hysteria Highest - Dashboard. Zakładka karty postaci (jedna instancja tego panelu montowana
// DWUKROTNIE przez main.js - raz na #panel-charA, raz na #panel-charB, sparametryzowana przez
// ctx.characterKey). Diagram 10 cech (mandala w stylu karty Luisa z Figmy), Rany/Stabilność/
// Rozwój edytowalne bezpośrednio na karcie, Nawiedzenia/Pakt/Namiętność/Zdolności z hover-opisem,
// klik na cechę = rzut testu KULT (2k10 + wartość cechy) z wynikiem w lokalnym (nie zapisywanym do
// Firebase) panelu rzutu - wzorzec "panele lokalne z transient UI" z BRIEFING.md Dark Graala.

import { escapeHtml, preserveScroll, rollKultTest } from "../utils.js";

const ATTR_LABELS = {
    silaWoli: "Siła Woli", odpornosc: "Odporność", refleks: "Refleks", rozum: "Rozum",
    intuicja: "Intuicja", percepcja: "Percepcja", opanowanie: "Opanowanie", przemoc: "Przemoc",
    charyzma: "Charyzma", dusza: "Dusza"
};

const AWARENESS_LABELS = { spiacy: "Śpiący", swiadomy: "Świadomy", oswiecony: "Oświecony" };
const ROLE_LABELS = { absolwent: "Absolwent", straznik: "Strażnik" };

/** Bazowa nazwa przed nawiasem z detalem, np. "Prześladowca (Nick 2.0)" -> "Prześladowca" -
 *  dopasowywana do data/komplikacje.json (patrz komentarz w state.js#seedCharacterState). */
function baseLabel(label) {
    return label.split(" (")[0].trim();
}

// UI efemeryczny (wynik ostatniego rzutu) per instancja panelu - trzymany na węźle root, żeby
// dwie zakładki (charA/charB) nie dzieliły jednego stanu.
function getUi(root) {
    if (!root._ui) root._ui = { lastRoll: null };
    return root._ui;
}

function attrBadge(attrKey, value) {
    return `
        <button class="attr-node attr-node-${attrKey}" data-action="roll-attr" data-attr="${attrKey}" title="Rzuć ${ATTR_LABELS[attrKey]}">
            <span class="attr-node-value">${value >= 0 ? "+" + value : value}</span>
            <span class="attr-node-label">${ATTR_LABELS[attrKey]}</span>
        </button>
    `;
}

function abilityLabel(abilityId, atutyData) {
    const found = atutyData.find(a => a.id === abilityId);
    if (!found) return `<span class="ability-chip">☆ ${escapeHtml(abilityId)}</span>`;
    const tooltip = `
        <div class="card-tooltip-name">${escapeHtml(found.name)}</div>
        <div class="card-tooltip-kicker">${escapeHtml(found.attr)}</div>
        <div class="card-tooltip-desc">${escapeHtml(found.intro || "")}</div>
        ${found.high ? `<div class="card-tooltip-row"><b>15+:</b> ${escapeHtml(found.high)}</div>` : ""}
        ${found.mid ? `<div class="card-tooltip-row"><b>10-14:</b> ${escapeHtml(found.mid)}</div>` : ""}
        ${found.low ? `<div class="card-tooltip-row"><b>≤9:</b> ${escapeHtml(found.low)}</div>` : ""}
    `;
    return `<span class="ability-chip">☆ ${escapeHtml(found.name)}<div class="card-tooltip ability-tooltip">${tooltip}</div></span>`;
}

// `<div>` wszędzie tu, NIE `<p>` - `<div class="card-tooltip">` zagnieżdżony w `<p>` byłby przez
// parser HTML wypchnięty poza niego jako rodzeństwo (p nie może zawierać elementów blokowych),
// co po cichu psuje hover (tooltip istnieje w DOM, ale poza .char-tag, więc selektor
// .char-tag-hoverable:hover .card-tooltip nigdy go nie widzi).

function darkSecretLabel(label) {
    return `<div class="char-tag">✦ ${escapeHtml(label)}</div>`;
}

/** Komplikacja (✧) - swobodny tekst, ale bazowa nazwa (przed nawiasem) zwykle odpowiada wpisowi w
 *  komplikacjeData; jeśli tak, dostaje hover z mechaniką (jak Atuty), inaczej renderuje się jako
 *  goły tekst. */
function complicationLabel(label, komplikacjeData) {
    const found = komplikacjeData.find(k => k.name.toLowerCase() === baseLabel(label).toLowerCase());
    if (!found) return `<div class="char-tag">✧ ${escapeHtml(label)}</div>`;
    const tooltip = `
        <div class="card-tooltip-name">${escapeHtml(found.name)}</div>
        <div class="card-tooltip-desc">${escapeHtml(found.intro || "")}</div>
        ${found.high ? `<div class="card-tooltip-row"><b>15+:</b> ${escapeHtml(found.high)}</div>` : ""}
        ${found.mid ? `<div class="card-tooltip-row"><b>10-14:</b> ${escapeHtml(found.mid)}</div>` : ""}
        ${found.low ? `<div class="card-tooltip-row"><b>≤9:</b> ${escapeHtml(found.low)}</div>` : ""}
    `;
    return `<div class="char-tag char-tag-hoverable">✧ ${escapeHtml(label)}<div class="card-tooltip ability-tooltip">${tooltip}</div></div>`;
}

function woundsHtml(wounds) {
    const serious = wounds.serious.map((checked, i) => `
        <label class="wound-row">
            <input type="checkbox" data-action="toggle-wound" data-index="${i}" ${checked ? "checked" : ""}>
            Poważna
        </label>
    `).join("");
    return `
        <div class="sheet-block">
            <h4 class="sheet-block-title">Rany</h4>
            ${serious}
            <label class="wound-row wound-row-critical">
                <input type="checkbox" data-action="toggle-critical" ${wounds.critical ? "checked" : ""}>
                Krytyczna
            </label>
        </div>
    `;
}

function stabilityHtml(currentValue, levels) {
    const rows = levels.map(lvl => `
        <label class="stability-row ${currentValue === lvl.value ? "current" : ""}">
            <input type="radio" name="stability" data-action="set-stability" value="${lvl.value}" ${currentValue === lvl.value ? "checked" : ""}>
            <span class="stability-value">${lvl.value}</span>
            <span class="stability-label">${escapeHtml(lvl.label)}</span>
            ${lvl.effect ? `<span class="stability-effect">${escapeHtml(lvl.effect)}</span>` : ""}
        </label>
    `).join("");
    return `<div class="sheet-block"><h4 class="sheet-block-title">Stabilność</h4>${rows}</div>`;
}

function developmentHtml(development, milestones) {
    const firstThreeDone = development.slice(0, 3).filter(Boolean).length;
    const rows = milestones.map((label, i) => {
        const locked = i === 3 && firstThreeDone < 3;
        return `
            <label class="dev-row ${locked ? "locked" : ""}">
                <input type="checkbox" data-action="toggle-dev" data-index="${i}" ${development[i] ? "checked" : ""} ${locked ? "disabled" : ""}>
                ${escapeHtml(label)}
            </label>
        `;
    }).join("");
    return `<div class="sheet-block"><h4 class="sheet-block-title">Rozwój</h4>${rows}</div>`;
}

function rollResultHtml(lastRoll, data) {
    if (!lastRoll) return "";
    const move = data.moves.find(m => m.id === lastRoll.moveId);
    const tierText = lastRoll.result.tier === "success" ? move.high : lastRoll.result.tier === "partial" ? move.mid : move.low;
    const tierLabel = lastRoll.result.tier === "success" ? "15+ Sukces!" : lastRoll.result.tier === "partial" ? "10–14 Częściowy sukces" : "≤9 Porażka";
    return `
        <div class="roll-result-panel tier-${lastRoll.result.tier}">
            <div class="roll-result-header">
                <span class="roll-result-move">${escapeHtml(move.name)} (${escapeHtml(move.attr)})</span>
                <span class="roll-result-dice">${lastRoll.result.dice.join(" + ")} ${lastRoll.result.modifier >= 0 ? "+" : ""}${lastRoll.result.modifier} = ${lastRoll.result.total}</span>
            </div>
            <div class="roll-result-tier">${tierLabel}</div>
            <div class="roll-result-text">${escapeHtml(tierText || "")}</div>
        </div>
    `;
}

function buildHtml(ctx, ui) {
    const { data, state, characterKey } = ctx;
    const charDef = data.characters.characters.find(c => c.key === characterKey);
    const charState = state.characters[characterKey];
    if (!charDef || !charState) return `<p class="placeholder">Nie znaleziono postaci "${escapeHtml(characterKey || "")}".</p>`;

    const attrOrder = data.characters.attrOrder;
    const attrGrid = attrOrder.map(k => attrBadge(k, charState.attrs[k])).join("");

    const abilities = charState.abilities.length
        ? charState.abilities.map(id => abilityLabel(id, data.atuty)).join("")
        : `<span class="placeholder-inline">brak</span>`;

    const darkSecrets = charState.darkSecrets.length
        ? charState.darkSecrets.map(darkSecretLabel).join("")
        : `<p class="char-tag char-tag-locked">✦ brak</p>`;

    const complications = charState.complications.length
        ? charState.complications.map(c => complicationLabel(c, data.komplikacje)).join("")
        : `<p class="char-tag char-tag-locked">✧ brak</p>`;

    return `
        <div class="char-sheet">
            <div class="char-sheet-header">
                <span class="char-badge char-badge-awareness">${AWARENESS_LABELS[charState.awareness] || charState.awareness}</span>
                <img class="char-portrait" src="${charDef.portrait}" alt="${escapeHtml(charDef.name)}" onerror="this.style.visibility='hidden'">
                <span class="char-badge char-badge-role">${ROLE_LABELS[charDef.role]}</span>
            </div>
            <h2 class="char-name">${escapeHtml(charDef.name)}</h2>

            <div class="char-sheet-body">
                <div class="char-sheet-left">
                    ${darkSecrets}
                    ${complications}
                    <div class="char-abilities-list">${abilities}</div>
                </div>

                <div class="char-sheet-center">
                    <div class="attr-mandala">${attrGrid}</div>
                    ${rollResultHtml(ui.lastRoll, data)}
                </div>

                <div class="char-sheet-right">
                    ${woundsHtml(charState.wounds)}
                    ${stabilityHtml(charState.stability, data.characters.stabilityLevels)}
                    ${developmentHtml(charState.development, data.characters.developmentMilestones)}
                </div>
            </div>
        </div>
    `;
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const rollBtn = e.target.closest('[data-action="roll-attr"]');
        if (rollBtn) {
            const { data, state, characterKey, updateState } = root._ctx;
            const attrKey = rollBtn.dataset.attr;
            const moveId = data.characters.attrMoveMap[attrKey];
            const modifier = state.characters[characterKey].attrs[attrKey];
            const result = rollKultTest({ modifier });
            getUi(root).lastRoll = { moveId, result };
            preserveScroll(() => rerender(root));
            return;
        }
    });

    root.addEventListener("change", (e) => {
        const { characterKey, updateState } = root._ctx;
        const woundToggle = e.target.closest('[data-action="toggle-wound"]');
        if (woundToggle) {
            const idx = Number(woundToggle.dataset.index);
            updateState(s => { s.characters[characterKey].wounds.serious[idx] = woundToggle.checked; });
            return;
        }
        const criticalToggle = e.target.closest('[data-action="toggle-critical"]');
        if (criticalToggle) {
            updateState(s => { s.characters[characterKey].wounds.critical = criticalToggle.checked; });
            return;
        }
        const stabilityRadio = e.target.closest('[data-action="set-stability"]');
        if (stabilityRadio) {
            updateState(s => { s.characters[characterKey].stability = Number(stabilityRadio.value); });
            return;
        }
        const devToggle = e.target.closest('[data-action="toggle-dev"]');
        if (devToggle) {
            const idx = Number(devToggle.dataset.index);
            updateState(s => { s.characters[characterKey].development[idx] = devToggle.checked; });
            return;
        }
    });
}

function rerender(root) {
    root.innerHTML = buildHtml(root._ctx, getUi(root));
}

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx, getUi(root));
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
