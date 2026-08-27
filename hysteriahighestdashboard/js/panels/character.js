// Hysteria Highest - Dashboard. Zakładka karty postaci (jedna instancja tego panelu montowana
// DWUKROTNIE przez main.js - raz na #panel-charA, raz na #panel-charB, sparametryzowana przez
// ctx.characterKey). Układ 12-kolumnowy: 8 kolumn karta postaci, 4 kolumny wyniki rzutów (patrz
// .char-sheet-grid w styles.css). Mandala 10 cech nałożona na images/diagram cech.svg (pozycje
// węzłów wyliczone raz z geometrii tego SVG - patrz ATTR_POSITIONS). Atuty/Komplikacje/Mroczne
// Sekrety klikalne -> modal z opisem (+ przycisk Rzuć, jeśli nie są Pasywne/nie są Mrocznym
// Sekretem) - wynik loguje się do wspólnego Dziennika (state.log) i pokazuje w kolumnie wyników.
// Wpisy oznaczone w danych jako `active:false` są wygaszone i nieklikalne (patrz Figma node
// 895-298) - przełączane osobno od samego posiadania przez ikonkę oka w panelu MG.

import { escapeHtml, renderMoveText } from "../utils.js";
import { performRoll } from "../rollEngine.js";
import { logRoll, logEvent } from "../eventLog.js";
import { openModal } from "../modal.js";
import { mechanicsBodyHtml, darkSecretBodyHtml } from "../mechanicsView.js";

// Najwięcej Możliwości, jakie tekst Atutów każe bankować na raz to "do trzech" (patrz Szósty
// Zmysł 15+) - stąd twardy limit 3 na Atut, żeby nie dało się dodawać bez ograniczeń.
const MAX_ABILITY_OPTIONS = 3;

const ATTR_LABELS = {
    silaWoli: "Siła Woli", odpornosc: "Odporność", refleks: "Refleks", rozum: "Rozum",
    intuicja: "Intuicja", percepcja: "Percepcja", opanowanie: "Opanowanie", przemoc: "Przemoc",
    charyzma: "Charyzma", dusza: "Dusza"
};

// Środki węzłów wg geometrii images/diagram cech.svg (viewBox 255x480), w % szerokości/wysokości
// kontenera - patrz komentarz w PR: krzyż tarota / diagram cech dla wyprowadzenia tych liczb ze
// ścieżek SVG (każdy węzeł to okrąg lub romb o znanym środku).
const ATTR_POSITIONS = {
    silaWoli: { left: 50.6, top: 7.3 },
    odpornosc: { left: 13.7, top: 18.75 },
    refleks: { left: 86.3, top: 18.75 },
    rozum: { left: 13.5, top: 40.9 },
    intuicja: { left: 86.1, top: 40.9 },
    percepcja: { left: 50.4, top: 51.4 },
    opanowanie: { left: 13.5, top: 62.0 },
    przemoc: { left: 86.1, top: 62.0 },
    charyzma: { left: 50.4, top: 72.2 },
    dusza: { left: 50.4, top: 93.9 }
};

const AWARENESS_LABELS = { spiacy: "Śpiący", swiadomy: "Świadomy", oswiecony: "Oświecony" };
const ROLE_LABELS = { absolwent: "Absolwent", straznik: "Strażnik" };
const TIER_LABELS = { success: "15+ Sukces!", partial: "10–14 Częściowy sukces", failure: "≤9 Porażka" };

function getUi(root) {
    if (!root._ui) root._ui = { lastRoll: null };
    return root._ui;
}

function attrBadge(attrKey, value) {
    const pos = ATTR_POSITIONS[attrKey];
    return `
        <button class="attr-node" style="left:${pos.left}%; top:${pos.top}%;" data-action="roll-attr" data-attr="${attrKey}" title="Rzuć ${ATTR_LABELS[attrKey]}">
            <span class="attr-node-value">${value >= 0 ? "+" + value : value}</span>
            <span class="attr-node-label">${ATTR_LABELS[attrKey]}</span>
        </button>
    `;
}

/** Wyciąga wartość bazowego modyfikatora z pola `attr` Atutu ("+Dusza" -> wartość cechy Dusza,
 *  "+Dusza − poziom magii stworzenia" -> jw. ale z adnotacją, że część formuły trzeba doliczyć
 *  ręcznie, "Pasywny" -> null, czyli brak rzutu). */
function resolveAbilityModifier(ability, attrs) {
    if (ability.passive || !ability.attr || ability.attr === "Pasywny") return null;
    const m = ability.attr.match(/^\+([A-ZŚĆŻŹŁ][a-ząćęłńóśźż]+)/);
    if (!m) return { value: 0, note: null };
    const attrKey = Object.keys(ATTR_LABELS).find(k => ATTR_LABELS[k] === m[1]);
    if (!attrKey) return { value: 0, note: null };
    const extra = ability.attr.slice(m[0].length).trim();
    return { value: attrs[attrKey], note: extra ? `(${extra} - dolicz ręcznie)` : null, attrKey };
}

/** Atut "bankowalny", jeśli jego 15+/10-14 mówi "użyj ich w dowolnym momencie sesji/tej sceny" -
 *  czyli wynik NIE rozwiązuje się od razu, tylko odkłada wybrane możliwości na później (np. Szósty
 *  Zmysł), w odróżnieniu od Atutów, których "Wybierz możliwość" stosuje się natychmiast w bieżącej
 *  akcji (np. Charyzmatyczna aura). Tylko te pierwsze uczestniczą w "Możliwościach z Atutów". */
function isBankableAbility(ability) {
    return /w dowolnym momencie/.test(ability.high || "") || /w dowolnym momencie/.test(ability.mid || "");
}

function performAndLogRoll(root, { label, moveId, baseModifier, rollType, mechanicsFor }) {
    const { data, state, characterKey, updateState } = root._ctx;
    const charState = state.characters[characterKey];
    const charDef = data.characters.characters.find(c => c.key === characterKey);
    const result = performRoll({ gameData: data, characterState: charState, baseModifier, moveId, rollType });

    let resultText = null;
    let tierLabel = TIER_LABELS[result.tier];
    if (mechanicsFor) {
        resultText = result.tier === "success" ? mechanicsFor.high : result.tier === "partial" ? mechanicsFor.mid : mechanicsFor.low;
    } else if (moveId) {
        const move = data.moves.find(m => m.id === moveId);
        if (move) resultText = result.tier === "success" ? move.high : result.tier === "partial" ? move.mid : move.low;
    }

    // Rzut na bankowalny Atut z wynikiem 15+/10-14 -> odkłada jedną Możliwość do wykorzystania
    // później (patrz abilityOptionsHtml/isBankableAbility) - bez osobnego wpisu w Dzienniku, bo
    // sam rzut już się tam loguje z pełnym tekstem wyniku.
    if (rollType === "ability" && mechanicsFor && (result.tier === "success" || result.tier === "partial") && isBankableAbility(mechanicsFor)) {
        updateState(s => {
            const cs = s.characters[characterKey];
            if (!cs.abilityOptions) cs.abilityOptions = {};
            cs.abilityOptions[mechanicsFor.id] = Math.min(MAX_ABILITY_OPTIONS, (cs.abilityOptions[mechanicsFor.id] || 0) + 1);
        });
    }

    getUi(root).lastRoll = { label, result, resultText, tierLabel };
    logRoll(updateState, {
        characterName: charDef.name,
        source: rollType,
        label,
        result,
        resultText
    });
}

function abilityChip(item, atutyData) {
    const found = atutyData.find(a => a.id === item.id);
    if (!found) return null;
    if (!item.active) return `<div class="ability-chip ability-chip-inactive">☆ ${escapeHtml(found.name)}</div>`;
    return `<button type="button" class="ability-chip" data-action="open-ability" data-ability="${item.id}">☆ ${escapeHtml(found.name)}</button>`;
}

/** Nazwa do wyświetlenia dla Komplikacji: nazwa z katalogu + opcjonalny dopisek gracza w nawiasie
 *  (np. "Prześladowca (Nick 2.0)") - customLabel to WOLNY tekst wpisywany przez MG, stąd escapeHtml
 *  osobno od nazwy katalogowej. */
function complicationDisplayName(found, item) {
    return item.customLabel ? `${found.name} (${item.customLabel})` : found.name;
}

function darkSecretTag(item, mroczneSekretyData) {
    const found = mroczneSekretyData.find(s => s.id === item.id);
    if (!found) return null;
    if (!item.active) return `<div class="char-tag char-tag-inactive">✦ ${escapeHtml(found.name)}</div>`;
    return `<button type="button" class="char-tag char-tag-clickable" data-action="open-dark-secret" data-dark-secret="${item.id}">✦ ${escapeHtml(found.name)}</button>`;
}

function complicationTag(item, komplikacjeData) {
    const found = komplikacjeData.find(k => k.id === item.id);
    if (!found) return null;
    const name = complicationDisplayName(found, item);
    if (!item.active) return `<div class="char-tag char-tag-inactive">✧ ${escapeHtml(name)}</div>`;
    return `<button type="button" class="char-tag char-tag-clickable" data-action="open-complication" data-complication="${item.id}">✧ ${escapeHtml(name)}</button>`;
}

/** Wiersz Atutu z bankowanymi Możliwościami - wypełnione pipsy (klik zużywa jedną, loguje do
 *  Dziennika, pips znika) + jeden dodatkowy pusty pips na końcu, o ile nie osiągnięto
 *  MAX_ABILITY_OPTIONS (klik dodaje jedną, bez logowania - sam rzut, który ją przyznał, już się
 *  zaloguje z pełnym tekstem wyniku, patrz performAndLogRoll). Bez osobnego przycisku "+1" -
 *  zamiast tego zwiększanie/zużywanie dzieje się wprost przez klik w pipsy, analogicznie do Toru
 *  Boskości w panelu MG (ale bez opcji "Zeruj"). */
function abilityOptionRow(ability, count) {
    const filledPips = Array.from({ length: count }, () => `
        <button type="button" class="influence-pip" data-action="spend-ability-option" data-ability="${ability.id}" title="Wykorzystaj Możliwość"></button>
    `).join("");
    const addPip = count < MAX_ABILITY_OPTIONS
        ? `<button type="button" class="influence-pip influence-pip-empty" data-action="add-ability-option" data-ability="${ability.id}" title="Dodaj Możliwość"></button>`
        : "";
    return `
        <div class="ability-option-row">
            <span class="ability-option-name">${escapeHtml(ability.name)}</span>
            <div class="ability-option-controls">${filledPips}${addPip}</div>
        </div>
    `;
}

/** Tylko Atuty "bankowalne" (patrz isBankableAbility), obecnie AKTYWNE (nie wygaszone ikonką oka
 *  w panelu MG) i tylko te, w których postać ma aktualnie co najmniej 1 Możliwość - zero-owe Atuty
 *  się tu nie pokazują (pierwsza Możliwość przybywa z rzutu, patrz performAndLogRoll). Nigdy
 *  Komplikacje - te mają OSOBNY licznik Wpływu dla MG. */
function abilityOptionsHtml(charState, atutyData) {
    const rows = charState.abilities
        .filter(item => item.active)
        .map(item => atutyData.find(a => a.id === item.id))
        .filter(a => a && isBankableAbility(a))
        .map(a => ({ ability: a, count: charState.abilityOptions?.[a.id] || 0 }))
        .filter(({ count }) => count > 0)
        .map(({ ability, count }) => abilityOptionRow(ability, count))
        .join("");
    if (!rows) return "";
    return `<div class="sheet-block"><h4 class="sheet-block-title">Możliwości z Atutów</h4>${rows}</div>`;
}

function woundsHtml(wounds) {
    const serious = wounds.serious.map((w, i) => `
        <div class="wound-row">
            <label class="wound-checkbox-row">
                <input type="checkbox" data-action="toggle-wound" data-index="${i}" ${w.checked ? "checked" : ""}>
                Poważna
            </label>
            <input type="text" class="wound-note" placeholder="czego dotyczy…" data-action="set-wound-note" data-index="${i}" value="${escapeHtml(w.note || "")}">
        </div>
    `).join("");
    return `
        <div class="sheet-block">
            <h4 class="sheet-block-title">Rany</h4>
            ${serious}
            <div class="wound-row wound-row-critical">
                <label class="wound-checkbox-row">
                    <input type="checkbox" data-action="toggle-critical" ${wounds.critical.checked ? "checked" : ""}>
                    Krytyczna
                </label>
                <input type="text" class="wound-note" placeholder="czego dotyczy…" data-action="set-critical-note" value="${escapeHtml(wounds.critical.note || "")}">
            </div>
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
    const lastIdx = milestones.length - 1;
    const doneBeforeLast = development.slice(0, lastIdx).filter(Boolean).length;
    const rows = milestones.map((label, i) => {
        const locked = i === lastIdx && doneBeforeLast < lastIdx;
        return `
            <label class="dev-row ${locked ? "locked" : ""}">
                <input type="checkbox" data-action="toggle-dev" data-index="${i}" ${development[i] ? "checked" : ""} ${locked ? "disabled" : ""}>
                ${escapeHtml(label)}
            </label>
        `;
    }).join("");
    return `<div class="sheet-block"><h4 class="sheet-block-title">Rozwój</h4>${rows}</div>`;
}

function rollResultHtml(lastRoll) {
    if (!lastRoll) return `<p class="placeholder">Kliknij cechę, Atut lub Komplikację, żeby rzucić.</p>`;
    const r = lastRoll.result;
    return `
        <div class="roll-result-panel tier-${r.tier}">
            <div class="roll-result-header">
                <span class="roll-result-move">${escapeHtml(lastRoll.label)}</span>
                <span class="roll-result-dice">${r.dice.join(" + ")} ${r.modifier >= 0 ? "+" : ""}${r.modifier} = ${r.total}</span>
            </div>
            ${r.modifierNotes.length ? `<div class="roll-result-notes">${r.modifierNotes.map(escapeHtml).join(" · ")}</div>` : ""}
            <div class="roll-result-tier">${lastRoll.tierLabel}</div>
            ${lastRoll.resultText ? `<div class="roll-result-text">${renderMoveText(lastRoll.resultText)}</div>` : ""}
        </div>
    `;
}

function recentRollsHtml(log, characterName) {
    const mine = (log || []).filter(e => e.kind === "roll" && e.characterName === characterName).slice(0, 6);
    if (!mine.length) return "";
    return `
        <div class="sheet-block">
            <h4 class="sheet-block-title">Ostatnie rzuty</h4>
            <div class="recent-rolls-list">
                ${mine.map(e => `
                    <div class="recent-roll-row tier-${e.result.tier}">
                        <span>${escapeHtml(e.label)}</span>
                        <span>${e.result.total}</span>
                    </div>
                `).join("")}
            </div>
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

    const abilities = charState.abilities.map(item => abilityChip(item, data.atuty)).filter(Boolean).join("")
        || `<span class="placeholder-inline">brak</span>`;

    const darkSecrets = charState.darkSecrets.map(s => darkSecretTag(s, data.mroczneSekrety)).filter(Boolean).join("")
        || `<div class="char-tag char-tag-inactive">✦ brak</div>`;

    const complications = charState.complications.map(c => complicationTag(c, data.komplikacje)).filter(Boolean).join("")
        || `<div class="char-tag char-tag-inactive">✧ brak</div>`;

    const milestones = data.characters.developmentMilestonesByRole[charDef.role];

    return `
        <div class="char-sheet-grid">
            <div class="char-sheet-main">
                <div class="char-sheet-body">
                    <div class="char-sheet-left">
                        <div class="char-tags-group">${darkSecrets}</div>
                        <div class="char-tags-group">${complications}</div>
                        <div class="char-abilities-list">${abilities}</div>
                        ${abilityOptionsHtml(charState, data.atuty)}
                    </div>

                    <div class="char-sheet-center">
                        <div class="char-center-header">
                            <div class="char-badges-row">
                                <span class="char-badge">${AWARENESS_LABELS[charState.awareness] || charState.awareness}</span>
                                <span class="char-badge">${ROLE_LABELS[charDef.role]}</span>
                            </div>
                            <img class="char-portrait" src="${charDef.portrait}" alt="${escapeHtml(charDef.name)}" onerror="this.style.visibility='hidden'">
                        </div>
                        <h2 class="char-name">${escapeHtml(charDef.name)}</h2>
                        <div class="attr-mandala-wrap">
                            <div class="attr-mandala">${attrGrid}</div>
                        </div>
                    </div>

                    <div class="char-sheet-right">
                        ${woundsHtml(charState.wounds)}
                        ${stabilityHtml(charState.stability, data.characters.stabilityLevels)}
                        ${developmentHtml(charState.development, milestones)}
                    </div>
                </div>
            </div>
            <div class="char-sheet-rollcol">
                <h3 class="panel-subtitle">Wyniki rzutów</h3>
                ${rollResultHtml(ui.lastRoll)}
                ${recentRollsHtml(state.log, charDef.name)}
            </div>
        </div>
    `;
}

function openAbilityModal(root, abilityId) {
    const { data } = root._ctx;
    const found = data.atuty.find(a => a.id === abilityId);
    if (!found) return;
    const mod = resolveAbilityModifier(found, root._ctx.state.characters[root._ctx.characterKey].attrs);
    openModal({
        title: `☆ ${escapeHtml(found.name)}`,
        bodyHtml: mechanicsBodyHtml(found) + (mod?.note ? `<div class="card-tooltip-row">${escapeHtml(mod.note)}</div>` : ""),
        rollLabel: mod ? "Rzuć" : null,
        onRoll: mod ? () => performAndLogRoll(root, {
            label: found.name,
            moveId: null,
            baseModifier: mod.value,
            rollType: "ability",
            mechanicsFor: found
        }) : null
    });
}

function openAttrModal(root, attrKey) {
    const { data, state, characterKey } = root._ctx;
    const moveId = data.characters.attrMoveMap[attrKey];
    const move = data.moves.find(m => m.id === moveId);
    if (!move) return;
    const modifier = state.characters[characterKey].attrs[attrKey];
    const label = `${move.name} (+${ATTR_LABELS[attrKey]})`;
    openModal({
        title: escapeHtml(move.name),
        bodyHtml: mechanicsBodyHtml(move),
        rollLabel: "Rzuć",
        onRoll: () => performAndLogRoll(root, {
            label,
            moveId,
            baseModifier: modifier,
            rollType: "attribute",
            mechanicsFor: move
        })
    });
}

function openComplicationModal(root, complicationId) {
    const { data, state, characterKey } = root._ctx;
    const found = data.komplikacje.find(k => k.id === complicationId);
    if (!found) return;
    const item = state.characters[characterKey].complications.find(c => c.id === complicationId);
    const label = item ? complicationDisplayName(found, item) : found.name;
    openModal({
        title: `✧ ${escapeHtml(label)}`,
        bodyHtml: mechanicsBodyHtml(found),
        rollLabel: "Rzuć",
        onRoll: () => performAndLogRoll(root, {
            label,
            moveId: null,
            baseModifier: 0,
            rollType: "complication",
            mechanicsFor: found
        })
    });
}

function openDarkSecretModal(root, darkSecretId) {
    const { data } = root._ctx;
    const found = data.mroczneSekrety.find(s => s.id === darkSecretId);
    if (!found) return;
    openModal({
        title: `✦ ${escapeHtml(found.name)}`,
        bodyHtml: darkSecretBodyHtml(found)
    });
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const rollBtn = e.target.closest('[data-action="roll-attr"]');
        if (rollBtn) {
            openAttrModal(root, rollBtn.dataset.attr);
            return;
        }
        const abilityBtn = e.target.closest('[data-action="open-ability"]');
        if (abilityBtn) {
            openAbilityModal(root, abilityBtn.dataset.ability);
            return;
        }
        const complicationBtn = e.target.closest('[data-action="open-complication"]');
        if (complicationBtn) {
            openComplicationModal(root, complicationBtn.dataset.complication);
            return;
        }
        const darkSecretBtn = e.target.closest('[data-action="open-dark-secret"]');
        if (darkSecretBtn) {
            openDarkSecretModal(root, darkSecretBtn.dataset.darkSecret);
            return;
        }
        const spendOption = e.target.closest('[data-action="spend-ability-option"]');
        if (spendOption) {
            const { data, characterKey, updateState } = root._ctx;
            const charName = data.characters.characters.find(c => c.key === characterKey)?.name || characterKey;
            const abilityId = spendOption.dataset.ability;
            const abilityName = data.atuty.find(a => a.id === abilityId)?.name || abilityId;
            let newCount = 0;
            updateState(s => {
                const charState = s.characters[characterKey];
                if (!charState.abilityOptions) charState.abilityOptions = {};
                newCount = Math.max(0, (charState.abilityOptions[abilityId] || 0) - 1);
                charState.abilityOptions[abilityId] = newCount;
            });
            logEvent(updateState, `${charName}: wykorzystuje Możliwość z Atutu (${abilityName}) — pozostało ${newCount}`);
            return;
        }
        const addOption = e.target.closest('[data-action="add-ability-option"]');
        if (addOption) {
            const { characterKey, updateState } = root._ctx;
            const abilityId = addOption.dataset.ability;
            updateState(s => {
                const charState = s.characters[characterKey];
                if (!charState.abilityOptions) charState.abilityOptions = {};
                charState.abilityOptions[abilityId] = Math.min(MAX_ABILITY_OPTIONS, (charState.abilityOptions[abilityId] || 0) + 1);
            });
            return;
        }
    });

    root.addEventListener("change", (e) => {
        const { data, characterKey, updateState } = root._ctx;
        const charName = data.characters.characters.find(c => c.key === characterKey)?.name || characterKey;

        const woundToggle = e.target.closest('[data-action="toggle-wound"]');
        if (woundToggle) {
            const idx = Number(woundToggle.dataset.index);
            updateState(s => { s.characters[characterKey].wounds.serious[idx].checked = woundToggle.checked; });
            logEvent(updateState, `${charName}: ${woundToggle.checked ? "otrzymuje" : "leczy"} Poważną Ranę`);
            return;
        }
        const criticalToggle = e.target.closest('[data-action="toggle-critical"]');
        if (criticalToggle) {
            updateState(s => { s.characters[characterKey].wounds.critical.checked = criticalToggle.checked; });
            logEvent(updateState, `${charName}: ${criticalToggle.checked ? "otrzymuje" : "leczy"} Krytyczną Ranę`);
            return;
        }
        const woundNote = e.target.closest('[data-action="set-wound-note"]');
        if (woundNote) {
            const idx = Number(woundNote.dataset.index);
            updateState(s => { s.characters[characterKey].wounds.serious[idx].note = woundNote.value; });
            return;
        }
        const criticalNote = e.target.closest('[data-action="set-critical-note"]');
        if (criticalNote) {
            updateState(s => { s.characters[characterKey].wounds.critical.note = criticalNote.value; });
            return;
        }
        const stabilityRadio = e.target.closest('[data-action="set-stability"]');
        if (stabilityRadio) {
            const value = Number(stabilityRadio.value);
            const level = data.characters.stabilityLevels.find(l => l.value === value);
            updateState(s => { s.characters[characterKey].stability = value; });
            logEvent(updateState, `${charName}: Stabilność → ${value} ${level ? level.label : ""}`);
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

export function render(root, ctx) {
    root._ctx = ctx;
    root.innerHTML = buildHtml(ctx, getUi(root));
    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}
