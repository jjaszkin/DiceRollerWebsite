// Panel: Karta postaci (Seeker) + tracker zasobów.
import { getState, touch } from "../store.js";
import { getPath, setPath, clamp } from "../utils.js";
import { bondLevelFromPoints } from "../state.js";

const STAT_ORDER = ["H", "K", "R", "C", "F"];

function humanize(key) {
    return String(key).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function flattenGear(gearData) {
    const flat = [];
    for (const [tierKey, tierLabel] of [["common_gear", "Common"], ["advanced_gear", "Advanced"]]) {
        const cats = gearData?.[tierKey] || {};
        for (const [catKey, items] of Object.entries(cats)) {
            for (const item of items) flat.push({ ...item, tier: tierLabel, category: catKey });
        }
    }
    return flat;
}

function flattenMods(gliderUpgrades) {
    const flat = [];
    for (const catKey of ["engine_and_mobility", "sensors_and_tech", "frame_and_survival"]) {
        for (const item of gliderUpgrades?.[catKey] || []) flat.push({ ...item, category: catKey });
    }
    return flat;
}

function optionsWithGroups(flatList, selectedName) {
    const groups = {};
    flatList.forEach((item, idx) => {
        const key = `${item.category}${item.tier ? " — " + item.tier : ""}`;
        (groups[key] = groups[key] || []).push({ ...item, idx });
    });
    return Object.entries(groups).map(([groupLabel, items]) => `
        <optgroup label="${humanize(groupLabel)}">
            ${items.map(item => `<option value="${item.idx}" ${item.name === selectedName ? "selected" : ""}>${item.name}${item.cost ? ` (${item.cost})` : ""}</option>`).join("")}
        </optgroup>
    `).join("");
}

function counterRow({ label, abbr, curPath, curVal, maxPath, maxVal, min = 0, editableMax = false }) {
    const hasMax = maxVal !== undefined && maxVal !== null;
    return `
        <div class="counter-row">
            <div class="counter-label">${label}${abbr ? ` <span class="abbr">${abbr}</span>` : ""}</div>
            <div class="counter-controls">
                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="${curPath}" data-delta="-1" data-min="${min}" ${maxPath ? `data-maxpath="${maxPath}"` : ""}>−</button>
                <span class="counter-value">${curVal}${hasMax ? ` <span class="max">${editableMax ? `/ <button class="max-edit" data-action="edit-max" data-path="${maxPath}" data-curpath="${curPath}" title="Zmień maksimum">${maxVal}</button>` : `/ ${maxVal}`}</span>` : ""}</span>
                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="${curPath}" data-delta="1" data-min="${min}" ${maxPath ? `data-maxpath="${maxPath}"` : ""}>+</button>
            </div>
        </div>
    `;
}

export function render(root, { state, data }) {
    const mechanics = data.mechanics;
    const ch = state.character;

    const flatGear = flattenGear(data.gear);
    const flatMods = flattenMods(data.gear?.glider_upgrades);
    const companions = data.companions?.companions_table_d100 || [];
    const guilds = data.guilds?.guilds || [];
    const bondScale = data.economy?.connections_and_bonds?.bond_scale || [];
    const companionRewards = data.economy?.connections_and_bonds?.companion_bond_rewards || {};

    const roleOptions = mechanics.seeker_roles.map((r, i) =>
        `<option value="${i}" ${ch.role === r.role ? "selected" : ""}>${r.role}</option>`
    ).join("");

    const roleInfo = ch.role
        ? mechanics.seeker_roles.find(r => r.role === ch.role)
        : null;

    root.innerHTML = `
        <div class="grid grid-2">

            <div class="card">
                <h2>Seeker</h2>
                <div class="counter-row">
                    <div class="counter-label">Rola</div>
                    <select data-action="select-role">
                        <option value="-1">— wybierz rolę —</option>
                        ${roleOptions}
                    </select>
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
                ` : `<p class="placeholder">Wybierz rolę, żeby ustawić startowe statystyki i cel.</p>`}
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
                ${counterRow({ label: "Credits", abbr: "cr", curPath: "character.resources.credits", curVal: ch.resources.credits })}
                ${counterRow({ label: "Fame", curPath: "character.resources.fame", curVal: ch.resources.fame })}
                <p class="placeholder">Koniec gry dostępny przy Fame ${mechanics.resources.fame.end_game_threshold}+.</p>
            </div>

            <div class="card">
                <h2>Sprzęt (Gear)</h2>
                ${ch.gear.map((slot, i) => `
                    <div class="counter-row" style="flex-direction:column; align-items:stretch; gap:6px;">
                        <select data-action="gear-select" data-slot="${i}">
                            <option value="-1">— pusty slot —</option>
                            ${optionsWithGroups(flatGear, slot?.name)}
                        </select>
                        ${slot ? `
                            <div class="counter-row">
                                <div class="counter-label">Wear</div>
                                <div class="counter-controls">
                                    <button class="btn btn-sm btn-icon" data-action="adjust" data-path="character.gear.${i}.wear" data-delta="-1" data-min="0" data-max="${slot.maxWear}">−</button>
                                    <span class="counter-value ${slot.wear === 0 ? "max" : ""}">${slot.wear} <span class="max">/ ${slot.maxWear}</span></span>
                                    <button class="btn btn-sm btn-icon" data-action="adjust" data-path="character.gear.${i}.wear" data-delta="1" data-min="0" data-max="${slot.maxWear}">+</button>
                                </div>
                            </div>
                            <p class="placeholder">${slot.effect || ""}${slot.wear === 0 ? " — NIEUŻYWALNY (0 Wear)" : ""}</p>
                        ` : ""}
                    </div>
                `).join("")}
            </div>

            <div class="card">
                <h2>Glider</h2>
                ${counterRow({ label: "Wear", curPath: "character.glider.wear.cur", curVal: ch.glider.wear.cur, maxPath: "character.glider.wear.max", maxVal: ch.glider.wear.max, editableMax: true })}
                ${counterRow({ label: "Supply", curPath: "character.glider.supply.cur", curVal: ch.glider.supply.cur, maxPath: "character.glider.supply.max", maxVal: ch.glider.supply.max, editableMax: true })}
                ${counterRow({ label: "Speed", curPath: "character.glider.speed.cur", curVal: ch.glider.speed.cur, maxPath: "character.glider.speed.max", maxVal: ch.glider.speed.max, editableMax: true })}
                ${counterRow({ label: "Scrap", curPath: "character.glider.scrap.cur", curVal: ch.glider.scrap.cur, maxPath: "character.glider.scrap.max", maxVal: ch.glider.scrap.max, editableMax: true })}
                ${counterRow({ label: "Relics", curPath: "character.glider.relics.cur", curVal: ch.glider.relics.cur, maxPath: "character.glider.relics.max", maxVal: ch.glider.relics.max, editableMax: true })}
                <div class="counter-row"><div class="counter-label">Cargo slots</div><div class="counter-value">${ch.glider.cargoSlots}</div></div>
                <h3 style="margin-top:12px;">Mody (do 3)</h3>
                ${ch.glider.mods.map((mod, i) => `
                    <div class="counter-row" style="flex-direction:column; align-items:stretch; gap:6px;">
                        <select data-action="mod-select" data-slot="${i}">
                            <option value="-1">— pusty slot —</option>
                            ${optionsWithGroups(flatMods, mod?.name)}
                        </select>
                        ${mod ? `<p class="placeholder">${mod.effect || ""}</p>` : ""}
                    </div>
                `).join("")}
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
                                        <button class="btn btn-sm" data-action="adjust" data-path="guildBonds.${g.id}.points" data-delta="-5" data-min="0">−5</button>
                                        <button class="btn btn-sm btn-icon" data-action="adjust" data-path="guildBonds.${g.id}.points" data-delta="-1" data-min="0">−</button>
                                        <span class="counter-value">${points}</span>
                                        <button class="btn btn-sm btn-icon" data-action="adjust" data-path="guildBonds.${g.id}.points" data-delta="1" data-min="0">+</button>
                                        <button class="btn btn-sm" data-action="adjust" data-path="guildBonds.${g.id}.points" data-delta="5" data-min="0">+5</button>
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
        wireEvents(root, { data, flatGear, flatMods, companions });
        root.dataset.wired = "1";
    }
}

function applyRole(role) {
    const state = getState();
    state.character.role = role.role;
    state.character.stats = { ...role.starting_stats };
    state.character.startingBonusTrait = role.starting_bonus_trait;
    state.character.goal = role.goal;
    state.character.rewardTrait = role.reward_trait;
    state.character.goalProgress = 0;
    state.character.rewardClaimed = false;
    touch();
}

function wireEvents(root, { data, flatGear, flatMods, companions }) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const state = getState();
        const action = btn.dataset.action;

        if (action === "adjust") {
            const path = btn.dataset.path;
            const delta = parseFloat(btn.dataset.delta);
            const min = btn.dataset.min !== undefined ? parseFloat(btn.dataset.min) : -Infinity;
            const maxPath = btn.dataset.maxpath;
            const maxAttr = btn.dataset.max;
            const max = maxPath ? getPath(state, maxPath) : (maxAttr !== undefined ? parseFloat(maxAttr) : Infinity);
            const cur = getPath(state, path) || 0;
            setPath(state, path, clamp(cur + delta, min, max));
            touch();
        } else if (action === "edit-max") {
            const path = btn.dataset.path;
            const curPath = btn.dataset.curpath;
            const cur = getPath(state, path);
            const input = prompt("Nowa wartość maksymalna:", cur);
            if (input === null) return;
            const val = parseInt(input, 10);
            if (!Number.isFinite(val) || val < 0) return;
            setPath(state, path, val);
            if (curPath) {
                const c = getPath(state, curPath);
                if (c > val) setPath(state, curPath, val);
            }
            touch();
        }
    });

    root.addEventListener("change", (e) => {
        const el = e.target;
        const state = getState();
        const action = el.dataset.action;

        if (action === "select-role") {
            const idx = parseInt(el.value, 10);
            if (idx < 0) return;
            const role = data.mechanics.seeker_roles[idx];
            if (state.character.role && state.character.role !== role.role) {
                if (!confirm(`Zmienić rolę na ${role.role}? To nadpisze startowe statystyki, cel i cechy.`)) {
                    render(root, { state, data }); // przywróć poprzednią wartość selecta
                    return;
                }
            }
            applyRole(role);

        } else if (action === "toggle-proficient") {
            const stat = el.dataset.stat;
            const list = state.character.proficientStats;
            const idx = list.indexOf(stat);
            if (idx >= 0) list.splice(idx, 1); else list.push(stat);
            touch();

        } else if (action === "toggle-reward-claimed") {
            state.character.rewardClaimed = el.checked;
            touch();

        } else if (action === "gear-select") {
            const slot = parseInt(el.dataset.slot, 10);
            const idx = parseInt(el.value, 10);
            state.character.gear[slot] = idx < 0 ? null : {
                name: flatGear[idx].name,
                effect: flatGear[idx].effect,
                wear: 3,
                maxWear: 3
            };
            touch();

        } else if (action === "mod-select") {
            const slot = parseInt(el.dataset.slot, 10);
            const idx = parseInt(el.value, 10);
            state.character.glider.mods[slot] = idx < 0 ? null : {
                name: flatMods[idx].name,
                category: flatMods[idx].category,
                effect: flatMods[idx].effect
            };
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
