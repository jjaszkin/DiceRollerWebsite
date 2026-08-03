// Panel: Karta postaci (Seeker) + tracker zasobów.
import { getState, touch } from "../store.js";
import { getPath, setPath, clamp, escapeHtml } from "../utils.js";
import { bondLevelFromPoints } from "../state.js";
import { showGate } from "../gate.js";
import { equippedGearEntries, installedModEntries } from "../gearData.js";

const STAT_ORDER = ["H", "K", "R", "C", "F"];

function counterRow({ label, abbr, curPath, curVal, maxPath, maxVal, min = 0, editableMax = false }) {
    const hasMax = maxVal !== undefined && maxVal !== null;
    return `
        <div class="counter-row">
            <div class="counter-label">${label}${abbr ? ` <span class="abbr">${abbr}</span>` : ""}</div>
            <div class="counter-controls">
                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="${curPath}" data-delta="-1" data-min="${min}">−</button>
                <span class="counter-value">${curVal}${hasMax ? ` <span class="max">${editableMax ? `/ <button class="max-edit" data-action="edit-max" data-path="${maxPath}" title="Zmień maksimum">${maxVal}</button>` : `/ ${maxVal}`}</span>` : ""}</span>
                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="${curPath}" data-delta="1" data-min="${min}">+</button>
            </div>
        </div>
    `;
}

/** Wiersz z licznikiem wpisywanym bezpośrednio (input number) zamiast +/- klikanych po jednym —
 *  wygodniejsze dla wartości, które często zmieniają się o więcej niż 1 (np. Credits). */
function numberInputRow({ label, abbr, path, value, min = 0 }) {
    return `
        <div class="counter-row">
            <div class="counter-label">${label}${abbr ? ` <span class="abbr">${abbr}</span>` : ""}</div>
            <div class="counter-controls">
                <input type="number" class="counter-input" data-action="set-number" data-path="${path}" data-min="${min}" value="${value}" step="1">
            </div>
        </div>
    `;
}

export function render(root, { state, data }) {
    const mechanics = data.mechanics;
    const ch = state.character;

    const maxCarried = mechanics?.resources?.gear?.max_carried ?? 3;
    const wearPerItem = mechanics?.resources?.gear?.wear_per_item ?? 3;
    const modsMax = mechanics?.glider?.mods_max ?? 3;
    const equippedGear = equippedGearEntries(state, data);
    const installedMods = installedModEntries(state, data);
    const companions = data.companions?.companions_table_d100 || [];
    const guilds = data.guilds?.guilds || [];
    const bondScale = data.economy?.connections_and_bonds?.bond_scale || [];
    const companionRewards = data.economy?.connections_and_bonds?.companion_bond_rewards || {};

    const roleInfo = ch.role
        ? mechanics.seeker_roles.find(r => r.role === ch.role)
        : null;

    root.innerHTML = `
        <div class="grid grid-2">

            <div class="card">
                <h2>${ch.name ? escapeHtml(ch.name) : "Seeker"}</h2>
                <div class="counter-row">
                    <div class="counter-label">Rola</div>
                    <div class="counter-value">${ch.role || "—"}</div>
                </div>
                ${roleInfo ? `
                    <p><strong>Cecha startowa:</strong> ${roleInfo.starting_bonus_trait}</p>
                    <p><strong>Cel:</strong> ${roleInfo.goal}</p>
                    <div class="counter-row">
                        <div class="counter-label">Postęp celu</div>
                        <div class="counter-controls">
                            <button class="btn btn-sm btn-icon" data-action="adjust" data-path="character.goalProgress" data-delta="-1" data-min="0">−</button>
                            <span class="counter-value">${ch.goalProgress}</span>
                            <button class="btn btn-sm btn-icon" data-action="adjust" data-path="character.goalProgress" data-delta="1" data-min="0">+</button>
                        </div>
                    </div>
                    <p><strong>Nagroda:</strong> ${roleInfo.reward_trait}</p>
                    <label class="counter-row">
                        <span class="counter-label">Nagroda odebrana</span>
                        <input type="checkbox" data-action="toggle-reward-claimed" ${ch.rewardClaimed ? "checked" : ""}>
                    </label>
                ` : `<p class="placeholder">Brak wybranej roli.</p>`}
                <button class="btn btn-sm" data-action="reopen-gate" style="margin-top:10px;">Zmień postać</button>
            </div>

            <div class="card">
                <h2>Statystyki</h2>
                ${STAT_ORDER.map(key => {
                    const statDef = mechanics.stats.find(s => s.key === key);
                    const proficient = ch.proficientStats.includes(key);
                    return `
                        <div class="counter-row">
                            <div class="counter-label">${statDef.name} <span class="abbr">${key}</span>
                                <label style="margin-left:8px;">
                                    <input type="checkbox" data-action="toggle-proficient" data-stat="${key}" ${proficient ? "checked" : ""}> <span class="abbr">proficient</span>
                                </label>
                            </div>
                            <div class="counter-controls">
                                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="character.stats.${key}" data-delta="-1" data-min="0" data-max="5">−</button>
                                <span class="counter-value">${ch.stats[key]}</span>
                                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="character.stats.${key}" data-delta="1" data-min="0" data-max="5">+</button>
                            </div>
                        </div>
                    `;
                }).join("")}
            </div>

            <div class="card">
                <h2>Zasoby</h2>
                ${counterRow({ label: "Stamina", abbr: "S", curPath: "character.resources.stamina.cur", curVal: ch.resources.stamina.cur, maxPath: "character.resources.stamina.max", maxVal: ch.resources.stamina.max, editableMax: true })}
                ${counterRow({ label: "Momentum", abbr: "MM", curPath: "character.resources.momentum.cur", curVal: ch.resources.momentum.cur, maxPath: "character.resources.momentum.max", maxVal: ch.resources.momentum.max, editableMax: true })}
                ${counterRow({ label: "Intel", abbr: "IN", curPath: "character.resources.intel.cur", curVal: ch.resources.intel.cur, maxPath: "character.resources.intel.max", maxVal: ch.resources.intel.max, editableMax: true })}
                ${numberInputRow({ label: "Credits", abbr: "cr", path: "character.resources.credits", value: ch.resources.credits, min: 0 })}
                ${counterRow({ label: "Fame", curPath: "character.resources.fame", curVal: ch.resources.fame })}
                <p class="placeholder">Koniec gry dostępny przy Fame ${mechanics.resources.fame.end_game_threshold}+.</p>
            </div>

            <div class="card">
                <h2>Sprzęt (Gear)</h2>
                <p class="cap-indicator ${equippedGear.length >= maxCarried ? "full" : ""}">Założone: ${equippedGear.length} / ${maxCarried}</p>
                ${equippedGear.length ? `
                    <ul class="summary-list">
                        ${equippedGear.map(g => `
                            <li class="tt" data-tip="${escapeHtml(g.effect || "")}">
                                <span>${escapeHtml(g.name)}</span>
                                <span class="abbr">${g.state.wear !== undefined ? `Wear ${g.state.wear}/${wearPerItem}` : ""}</span>
                            </li>
                        `).join("")}
                    </ul>
                ` : `<p class="summary-empty">Brak założonego sprzętu.</p>`}
                <button class="btn btn-sm" data-action="goto-tab" data-tab="gear" style="margin-top:10px;">Zarządzaj sprzętem →</button>
            </div>

            <div class="card">
                <h2>Glider</h2>
                ${counterRow({ label: "Wear", curPath: "character.glider.wear.cur", curVal: ch.glider.wear.cur, maxPath: "character.glider.wear.max", maxVal: ch.glider.wear.max, editableMax: true })}
                ${counterRow({ label: "Supply", curPath: "character.glider.supply.cur", curVal: ch.glider.supply.cur, maxPath: "character.glider.supply.max", maxVal: ch.glider.supply.max, editableMax: true })}
                ${counterRow({ label: "Speed", curPath: "character.glider.speed.cur", curVal: ch.glider.speed.cur, maxPath: "character.glider.speed.max", maxVal: ch.glider.speed.max, editableMax: true })}
                ${counterRow({ label: "Scrap", curPath: "character.glider.scrap.cur", curVal: ch.glider.scrap.cur, maxPath: "character.glider.scrap.max", maxVal: ch.glider.scrap.max, editableMax: true })}
                ${counterRow({ label: "Relics", curPath: "character.glider.relics.cur", curVal: ch.glider.relics.cur, maxPath: "character.glider.relics.max", maxVal: ch.glider.relics.max, editableMax: true })}
                <div class="counter-row"><div class="counter-label">Cargo slots</div><div class="counter-value">${ch.glider.cargoSlots}</div></div>
                <h3 style="margin-top:12px;">Zainstalowane mody</h3>
                <p class="cap-indicator ${installedMods.length >= modsMax ? "full" : ""}">Zainstalowane: ${installedMods.length} / ${modsMax}</p>
                ${installedMods.length ? `
                    <ul class="summary-list">
                        ${installedMods.map(m => `
                            <li class="tt" data-tip="${escapeHtml(m.effect || "")}">
                                <span>${escapeHtml(m.name)}</span>
                            </li>
                        `).join("")}
                    </ul>
                ` : `<p class="summary-empty">Brak zainstalowanych modów.</p>`}
                <button class="btn btn-sm" data-action="goto-tab" data-tab="glider" style="margin-top:10px;">Zarządzaj gliderem →</button>
            </div>

            <div class="card">
                <h2>Towarzysz</h2>
                <div class="counter-row">
                    <div class="counter-label">Wybór</div>
                    <select data-action="select-companion">
                        <option value="-1">— brak —</option>
                        ${companions.map((c, i) => `<option value="${i}" ${ch.companion.key === c.name ? "selected" : ""}>${c.name}</option>`).join("")}
                    </select>
                </div>
                ${ch.companion.key ? (() => {
                    const c = companions.find(x => x.name === ch.companion.key);
                    const level = bondLevelFromPoints(ch.companion.bondPoints);
                    return `
                        <p>${c ? c.description : ""}</p>
                        ${c ? `<p><strong>Key Stats:</strong> ${c.key_stats.join(", ")} — <strong>${c.passive_name}:</strong> ${c.passive_text}</p>` : ""}
                        ${counterRow({ label: "Stamina towarzysza", curPath: "character.companion.stamina.cur", curVal: ch.companion.stamina.cur, maxPath: "character.companion.stamina.max", maxVal: ch.companion.stamina.max, editableMax: true })}
                        <div class="counter-row">
                            <div class="counter-label">Bond Points <span class="abbr">Lvl ${level} — ${bondScale[level]?.name || ""}</span></div>
                            <div class="counter-controls">
                                <button class="btn btn-sm" data-action="adjust" data-path="character.companion.bondPoints" data-delta="-5" data-min="0">−5</button>
                                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="character.companion.bondPoints" data-delta="-1" data-min="0">−</button>
                                <span class="counter-value">${ch.companion.bondPoints}</span>
                                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="character.companion.bondPoints" data-delta="1" data-min="0">+</button>
                                <button class="btn btn-sm" data-action="adjust" data-path="character.companion.bondPoints" data-delta="5" data-min="0">+5</button>
                            </div>
                        </div>
                        <p class="placeholder">Nagroda na obecnym poziomie: ${companionRewards[level]?.name || "—"} — ${companionRewards[level]?.effect || ""}</p>
                    `;
                })() : `<p class="placeholder">Nie wybrano towarzysza.</p>`}
            </div>

            <div class="card" style="grid-column: 1 / -1;">
                <h2>Bond Level — Gildie</h2>
                <div class="grid grid-3">
                    ${guilds.map(g => {
                        const points = state.guildBonds[g.id]?.points || 0;
                        const level = bondLevelFromPoints(points);
                        const rewardsSoFar = [];
                        for (let lvl = 1; lvl <= level; lvl++) {
                            const r = g.bond_level_rewards?.[String(lvl)];
                            if (r) rewardsSoFar.push(`Lv${lvl}: ${r.name}`);
                        }
                        return `
                            <div class="card" style="margin-top:0;">
                                <h3 style="border:none; padding:0; margin-bottom:6px;">${g.name_pl}</h3>
                                <div class="counter-row">
                                    <div class="counter-label">BP <span class="abbr">Lvl ${level} — ${bondScale[level]?.name || ""}</span></div>
                                    <div class="counter-controls">
                                        <button class="btn btn-sm btn-icon" data-action="adjust" data-path="guildBonds.${g.id}.points" data-delta="-1" data-min="0">−</button>
                                        <input type="number" class="counter-input" data-action="set-number" data-path="guildBonds.${g.id}.points" data-min="0" value="${points}" step="1">
                                        <button class="btn btn-sm btn-icon" data-action="adjust" data-path="guildBonds.${g.id}.points" data-delta="1" data-min="0">+</button>
                                    </div>
                                </div>
                                <p class="placeholder">${rewardsSoFar.length ? rewardsSoFar.join(" · ") : "Brak odblokowanych nagród."}</p>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>

        </div>
    `;

    if (!root.dataset.wired) {
        wireEvents(root, { data, companions });
        root.dataset.wired = "1";
    }
}

function wireEvents(root, { data, companions }) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const state = getState();
        const action = btn.dataset.action;

        if (action === "adjust") {
            const path = btn.dataset.path;
            const delta = parseFloat(btn.dataset.delta);
            const min = btn.dataset.min !== undefined ? parseFloat(btn.dataset.min) : -Infinity;
            const maxAttr = btn.dataset.max;
            // Górny limit egzekwujemy tylko tam, gdzie max jest sztywno zakodowany w atrybucie
            // przycisku (staty H/K/R/C/F 0-5, Wear sprzętu). Liczniki zasobów z osobnym, edytowalnym
            // maksimum (Stamina, Momentum, Intel, Glider…) mogą je świadomie przekroczyć (np. 6/5
            // po tymczasowym wzmocnieniu) — patrz też numberInputRow/set-number poniżej.
            const max = maxAttr !== undefined ? parseFloat(maxAttr) : Infinity;
            const cur = getPath(state, path) || 0;
            setPath(state, path, clamp(cur + delta, min, max));
            touch();
        } else if (action === "edit-max") {
            const path = btn.dataset.path;
            const cur = getPath(state, path);
            const input = prompt("Nowa wartość maksymalna:", cur);
            if (input === null) return;
            const val = parseInt(input, 10);
            if (!Number.isFinite(val) || val < 0) return;
            setPath(state, path, val);
            touch();

        } else if (action === "reopen-gate") {
            if (!confirm("Otworzyć ekran startowy? Możesz tam wpisać inne imię, żeby przełączyć się na inną (albo nową) grę solo, albo zostawić to samo imię i zmienić rolę — co nadpisze statystyki, cel i cechy obecnej postaci.")) {
                return;
            }
            showGate(data, {
                initialName: state.character.name,
                allowCancel: true
            });

        } else if (action === "goto-tab") {
            document.querySelector(`.tab-btn[data-tab="${btn.dataset.tab}"]`)?.click();
        }
    });

    root.addEventListener("change", (e) => {
        const el = e.target;
        const state = getState();
        const action = el.dataset.action;

        if (action === "toggle-proficient") {
            const stat = el.dataset.stat;
            const list = state.character.proficientStats;
            const idx = list.indexOf(stat);
            if (idx >= 0) list.splice(idx, 1); else list.push(stat);
            touch();

        } else if (action === "toggle-reward-claimed") {
            state.character.rewardClaimed = el.checked;
            touch();

        } else if (action === "set-number") {
            // Input wpisywany bezpośrednio (Credits, BP gildii…) — bez górnego ograniczenia,
            // tylko dolne (domyślnie 0). Nieprawidłowy/pusty wpis cofa się do poprzedniej wartości.
            const path = el.dataset.path;
            const min = el.dataset.min !== undefined ? parseFloat(el.dataset.min) : -Infinity;
            const raw = parseFloat(el.value);
            const cur = getPath(state, path) || 0;
            const val = Number.isFinite(raw) ? Math.max(min, raw) : cur;
            setPath(state, path, val);
            el.value = val;
            touch();

        } else if (action === "select-companion") {
            const idx = parseInt(el.value, 10);
            if (idx < 0) {
                state.character.companion = { key: null, stamina: { cur: 0, max: 0 }, bondPoints: 0 };
            } else {
                const c = companions[idx];
                state.character.companion = {
                    key: c.name,
                    stamina: { cur: c.stamina, max: c.stamina },
                    bondPoints: 0
                };
            }
            touch();
        }
    });
}
