// Panel: Karta postaci (Poszukiwacz) + tracker zasobów.
import { getState, touch } from "../store.js";
import { getPath, setPath, clamp, escapeHtml } from "../utils.js";
import { bondLevelFromPoints } from "../state.js";
import { showGate } from "../gate.js";
import { equippedGearEntries, installedModEntries, gearCapacity } from "../gearData.js";
import { unlockedGuildRewards, roleRewardEntries } from "../rewardsData.js";
import { logEvent } from "../eventLog.js";

const STAT_ORDER = ["H", "K", "R", "C", "F"];

// Angielskie nazwy pięciu statystyk core z oryginału podręcznika (przed tłumaczeniem PL) —
// patrz commit fa69bd7 (przed tłumaczeniem mechanics.json): H=Hardy, K=Knowledgeable,
// R=Resourceful, C=Connected, F=Focused. Nigdzie indziej w przetłumaczonych danych już nie
// występują, więc trzymane tu lokalnie do treści hover-tooltipów (mechanics.stats[].represents
// ma sam opis PL, bez angielskiej nazwy).
const STAT_ENGLISH_NAMES = { H: "Hardy", K: "Knowledgeable", R: "Resourceful", C: "Connected", F: "Focused" };

/** Domyślne Biegłości (ang. „proficient”) towarzysza = jego Key Stats z companions.json —
 *  patrz companions.json#rules.roles: „jeśli towarzysz ma Key Stat pasujący do wykonywanego
 *  testu, gracz może wydać 1 Wytrzymałość towarzysza, by zyskać +1 do rzutu (max raz)”. Nagroda
 *  Poziomu Więzi „Uwielbiany” (economy.json#companion_bond_rewards) pozwala oznaczyć dodatkowy
 *  Stat jako biegły — stąd checkboxy są edytowalne, nie tylko informacyjne. Mapujemy tekstowe
 *  nazwy Key Stats (np. "Kumaty"/"Hardy") na klucze H/K/R/C/F przez mechanics.stats[].name. */
function companionKeyStatKeys(mechanics, companion) {
    if (!companion) return [];
    return (companion.key_stats || [])
        .map(name => mechanics.stats.find(s => s.name === name)?.key)
        .filter(Boolean);
}

/** Opisy do hover-tooltipów Zasobów postaci i Glidera — krótkie wyjaśnienie „czym to jest”
 *  plus angielska nazwa z oryginału (mechanika sama jest po angielsku w podręczniku źródłowym,
 *  patrz mechanics.json przed tłumaczeniem PL, commit fa69bd7). Trzymane tu lokalnie (nie w
 *  danych), bo to czysto opisowy tekst pomocniczy UI, niezależny od katalogów przedmiotów. */
const RESOURCE_TIPS = {
    stamina: { en: "Stamina", desc: "Zdrowie/wytrzymałość fizyczna Poszukiwacza. Przy 0 rzuć na Tabelę Wyczerpania." },
    momentum: { en: "Momentum", desc: "Zapas tempa/szczęścia. Wydaj 1, by przerzucić kość albo użyć zamiast Wytrzymałości lub Zasobów." },
    intel: { en: "Intel", desc: "Zgromadzona wiedza/dane. Wydaj 1, by zyskać Przewagę, przerzucić Kość Wyzwania, zmniejszyć trudność lokacji (min. 1) albo wymienić na nagrody w osadzie." },
    credits: { en: "Credits", desc: "Waluta do zakupów Sprzętu, Modów i usług w osadach oraz u gildii." },
    fame: { en: "Fame", desc: "Reputacja Poszukiwacza. Po osiągnięciu progu odblokowuje zakończenie gry." }
};

const GLIDER_STAT_TIPS = {
    wear: { en: "Wear", desc: "Stan techniczny glidera. Przy 0: maks. Prędkość spada do 1, Mody stają się niedostępne." },
    supply: { en: "Supply", desc: "Zapasy na pokładzie glidera. Przy 0 zaznacz 1 Zużycie zamiast wydawać Zasoby." },
    speed: { en: "Speed", desc: "Zasięg ruchu glidera (w heksach) podczas akcji Move." },
    scrap: { en: "Scrap", desc: "Surowiec zbierany podczas eksploracji — waluta rzemieślnicza/handlowa Glidera." },
    relics: { en: "Relics", desc: "Rzadkie, cenne znaleziska — nagroda za Duże Sukcesy w trudniejszych lokacjach." },
    cargoSlots: { en: "Cargo Slots", desc: "Pojemność przestrzeni ładunkowej glidera na towary/dobra wymienne, osobno od Złom/Zasoby/Relikty." }
};

/** Buduje treść hover-tooltipa z opisu + angielskiej nazwy — wspólny format dla Zasobów i
 *  statów Glidera (patrz RESOURCE_TIPS/GLIDER_STAT_TIPS powyżej). */
function tipText(entry) {
    if (!entry) return "";
    return `${entry.desc} (ang. „${entry.en}”)`;
}

function counterRow({ label, abbr, curPath, curVal, maxPath, maxVal, min = 0, editableMax = false, tip = "" }) {
    const hasMax = maxVal !== undefined && maxVal !== null;
    return `
        <div class="counter-row">
            <div class="counter-label${tip ? " tt" : ""}"${tip ? ` data-tip="${escapeHtml(tip)}"` : ""}>${label}${abbr ? ` <span class="abbr">${abbr}</span>` : ""}</div>
            <div class="counter-controls">
                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="${curPath}" data-delta="-1" data-min="${min}">−</button>
                <span class="counter-value">${curVal}${hasMax ? ` <span class="max">${editableMax ? `/ <button class="max-edit" data-action="edit-max" data-path="${maxPath}" title="Zmień maksimum">${maxVal}</button>` : `/ ${maxVal}`}</span>` : ""}</span>
                <button class="btn btn-sm btn-icon" data-action="adjust" data-path="${curPath}" data-delta="1" data-min="${min}">+</button>
            </div>
        </div>
    `;
}

/** Wiersz z licznikiem wpisywanym bezpośrednio (input number) zamiast +/- klikanych po jednym —
 *  wygodniejsze dla wartości, które często zmieniają się o więcej niż 1 (np. Kredyty). */
function numberInputRow({ label, abbr, path, value, min = 0, tip = "" }) {
    return `
        <div class="counter-row">
            <div class="counter-label${tip ? " tt" : ""}"${tip ? ` data-tip="${escapeHtml(tip)}"` : ""}>${label}${abbr ? ` <span class="abbr">${abbr}</span>` : ""}</div>
            <div class="counter-controls">
                <input type="number" class="counter-input" data-action="set-number" data-path="${path}" data-min="${min}" value="${value}" step="1">
            </div>
        </div>
    `;
}

export function render(root, { state, data }) {
    const mechanics = data.mechanics;
    const ch = state.character;

    const baseMaxCarried = mechanics?.resources?.gear?.max_carried ?? 3;
    const wearPerItem = mechanics?.resources?.gear?.wear_per_item ?? 3;
    const modsMax = mechanics?.glider?.mods_max ?? 3;
    const { maxCarried, equippedCount: equippedGearCount } = gearCapacity(state, baseMaxCarried);
    const equippedGear = equippedGearEntries(state, data);
    const installedMods = installedModEntries(state, data);
    const companions = data.companions?.companions_table_d100 || [];
    const guilds = data.guilds?.guilds || [];
    const bondScale = data.economy?.connections_and_bonds?.bond_scale || [];
    const companionRewards = data.economy?.connections_and_bonds?.companion_bond_rewards || {};

    const roleInfo = ch.role
        ? mechanics.seeker_roles.find(r => r.role === ch.role)
        : null;

    // Nagrody i Traity — zebrane w jednym miejscu z dwóch źródeł: Poziom Więzi gildii (wszystkie
    // kategorie: Sprzęt/Cecha/Ulepszenie Glidera) i roli postaci (cecha startowa + nagroda za cel).
    // Sprzęt/Ulepszenie Glidera auto-oznaczają się jako posiadane w odpowiednim tabie (patrz gearData.js/
    // panels/gear.js/panels/glider.js) — tu tylko informujemy o tym w opisie karty.
    const allRewards = [
        ...unlockedGuildRewards(state, data).map(r => ({
            name: r.baseName,
            effect: r.effect,
            badge: `${r.guildName} · Lv${r.tier} · ${r.category || "?"}`
        })),
        ...roleRewardEntries(state, data).map(r => ({
            name: r.name,
            effect: "",
            badge: `${r.source} · ${r.category}${r.claimed === false ? " (nieodebrana)" : ""}`
        }))
    ];

    root.innerHTML = `
        <div class="grid grid-2">

            <div class="card">
                <h2>${ch.name ? escapeHtml(ch.name) : "Poszukiwacz"}</h2>
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
                    const statTip = `${statDef.represents || ""} (ang. „${STAT_ENGLISH_NAMES[key]}”)`;
                    return `
                        <div class="counter-row">
                            <div class="counter-label tt" data-tip="${escapeHtml(statTip)}">${statDef.name} <span class="abbr">${key}</span></div>
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
                ${counterRow({ label: "Wytrzymałość", abbr: "S", curPath: "character.resources.stamina.cur", curVal: ch.resources.stamina.cur, maxPath: "character.resources.stamina.max", maxVal: ch.resources.stamina.max, editableMax: true, tip: tipText(RESOURCE_TIPS.stamina) })}
                ${counterRow({ label: "Rozpęd", abbr: "MM", curPath: "character.resources.momentum.cur", curVal: ch.resources.momentum.cur, maxPath: "character.resources.momentum.max", maxVal: ch.resources.momentum.max, editableMax: true, tip: tipText(RESOURCE_TIPS.momentum) })}
                ${counterRow({ label: "Informacje", abbr: "IN", curPath: "character.resources.intel.cur", curVal: ch.resources.intel.cur, maxPath: "character.resources.intel.max", maxVal: ch.resources.intel.max, editableMax: true, tip: tipText(RESOURCE_TIPS.intel) })}
                ${numberInputRow({ label: "Kredyty", abbr: "cr", path: "character.resources.credits", value: ch.resources.credits, min: 0, tip: tipText(RESOURCE_TIPS.credits) })}
                ${counterRow({ label: "Sława", curPath: "character.resources.fame", curVal: ch.resources.fame, tip: tipText(RESOURCE_TIPS.fame) })}
                <p class="placeholder">Koniec gry dostępny przy Sława ${mechanics.resources.fame.end_game_threshold}+.</p>
            </div>

            <div class="card">
                <h2>Sprzęt (Sprzęt)</h2>
                <p class="cap-indicator ${equippedGearCount >= maxCarried ? "full" : ""}">Założone: ${equippedGearCount} / ${maxCarried}</p>
                ${equippedGear.length ? `
                    <ul class="summary-list">
                        ${equippedGear.map(g => `
                            <li class="tt" data-tip="${escapeHtml(g.effect || "")}">
                                <span>${escapeHtml(g.name)}</span>
                                <span class="abbr">${g.state.wear !== undefined ? `Zużycie ${g.state.wear}/${wearPerItem}` : ""}</span>
                            </li>
                        `).join("")}
                    </ul>
                ` : `<p class="summary-empty">Brak założonego sprzętu.</p>`}
                <button class="btn btn-sm" data-action="goto-tab" data-tab="gear" style="margin-top:10px;">Zarządzaj sprzętem →</button>
            </div>

            <div class="card">
                <h2>Glider</h2>
                ${counterRow({ label: "Zużycie", curPath: "character.glider.wear.cur", curVal: ch.glider.wear.cur, maxPath: "character.glider.wear.max", maxVal: ch.glider.wear.max, editableMax: true, tip: tipText(GLIDER_STAT_TIPS.wear) })}
                ${counterRow({ label: "Zasoby", curPath: "character.glider.supply.cur", curVal: ch.glider.supply.cur, maxPath: "character.glider.supply.max", maxVal: ch.glider.supply.max, editableMax: true, tip: tipText(GLIDER_STAT_TIPS.supply) })}
                ${counterRow({ label: "Prędkość", curPath: "character.glider.speed.cur", curVal: ch.glider.speed.cur, maxPath: "character.glider.speed.max", maxVal: ch.glider.speed.max, editableMax: true, tip: tipText(GLIDER_STAT_TIPS.speed) })}
                ${counterRow({ label: "Złom", curPath: "character.glider.scrap.cur", curVal: ch.glider.scrap.cur, maxPath: "character.glider.scrap.max", maxVal: ch.glider.scrap.max, editableMax: true, tip: tipText(GLIDER_STAT_TIPS.scrap) })}
                ${counterRow({ label: "Relikty", curPath: "character.glider.relics.cur", curVal: ch.glider.relics.cur, maxPath: "character.glider.relics.max", maxVal: ch.glider.relics.max, editableMax: true, tip: tipText(GLIDER_STAT_TIPS.relics) })}
                <div class="counter-row"><div class="counter-label tt" data-tip="${escapeHtml(tipText(GLIDER_STAT_TIPS.cargoSlots))}">Przestrzeń załadunkowa</div><div class="counter-value">${ch.glider.cargoSlots}</div></div>
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
                    const defaultProficient = companionKeyStatKeys(mechanics, c);
                    const proficientStats = ch.companion.proficientStats ?? defaultProficient;
                    return `
                        <p>${c ? c.description : ""}</p>
                        ${c ? `<p><strong>Key Stats:</strong> ${c.key_stats.join(", ")} — <strong>${c.passive_name}:</strong> ${c.passive_text}</p>` : ""}
                        ${counterRow({ label: "Wytrzymałość towarzysza", curPath: "character.companion.stamina.cur", curVal: ch.companion.stamina.cur, maxPath: "character.companion.stamina.max", maxVal: ch.companion.stamina.max, editableMax: true })}
                        <div class="counter-row">
                            <div class="counter-label tt" data-tip="Przy Rzucie Wyzwania w Stat, w którym towarzysz jest biegły, gracz może wydać 1 Wytrzymałość towarzysza, by zyskać +1 do rzutu (max raz na test). Domyślnie biegli w swoich Key Stats; Poziom Więzi „Uwielbiany” pozwala oznaczyć dodatkowy Stat.">Biegłość towarzysza</div>
                        </div>
                        <div class="item-card-toggles" style="margin-bottom:10px;">
                            ${STAT_ORDER.map(key => {
                                const statDef = mechanics.stats.find(s => s.key === key);
                                const checked = proficientStats.includes(key);
                                return `
                                    <label>
                                        <input type="checkbox" data-action="toggle-companion-proficient" data-stat="${key}" ${checked ? "checked" : ""}>
                                        <span>${statDef.name}</span>
                                    </label>
                                `;
                            }).join("")}
                        </div>
                        <div class="counter-row">
                            <div class="counter-label">Punkty Więzi <span class="abbr">Poz. ${level} — ${bondScale[level]?.name || ""}</span></div>
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
                <h2>Poziom Więzi — Gildie</h2>
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
                                    <div class="counter-label">PW <span class="abbr">Poz. ${level} — ${bondScale[level]?.name || ""}</span></div>
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

            <div class="card" style="grid-column: 1 / -1;">
                <h2>Nagrody i Traity</h2>
                <p class="placeholder">Najedź na pozycję, żeby zobaczyć jej efekt. Nagrody Sprzęt/Ulepszenie Glidera pojawiają się automatycznie jako posiadane w tabach Sprzęt/Glider — wystarczy je tam założyć/zainstalować.</p>
                ${allRewards.length ? `
                    <ul class="summary-list">
                        ${allRewards.map(r => `
                            <li class="tt" data-tip="${escapeHtml(r.effect || r.name)}">
                                <span>${escapeHtml(r.name)}</span>
                                <span class="abbr">${escapeHtml(r.badge)}</span>
                            </li>
                        `).join("")}
                    </ul>
                ` : `<p class="summary-empty">Brak zebranych nagród i traitów.</p>`}
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
            // przycisku (staty H/K/R/C/F 0-5, Zużycie sprzętu). Liczniki zasobów z osobnym, edytowalnym
            // maksimum (Wytrzymałość, Rozpęd, Informacje, Glider…) mogą je świadomie przekroczyć (np. 6/5
            // po tymczasowym wzmocnieniu) — patrz też numberInputRow/set-number poniżej.
            const max = maxAttr !== undefined ? parseFloat(maxAttr) : Infinity;
            const cur = getPath(state, path) || 0;
            const next = clamp(cur + delta, min, max);
            setPath(state, path, next);
            // Logujemy tylko realne zmiany statystyk H/K/R/C/F (nie zasoby typu Wytrzymałość/Rozpęd/
            // Kredyty/PW itd., które i tak dostają swoje podsumowanie na starcie nowego dnia).
            const statMatch = /^character\.stats\.([A-Z])$/.exec(path);
            if (statMatch && next !== cur) {
                const key = statMatch[1];
                const statDef = data.mechanics?.stats?.find(s => s.key === key);
                const label = statDef ? `${statDef.name} (${key})` : key;
                logEvent(state, "stat-change", `${label}: ${cur} → ${next}.`);
            }
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

        if (action === "toggle-reward-claimed") {
            state.character.rewardClaimed = el.checked;
            if (el.checked) {
                const roleInfo = state.character.role
                    ? data.mechanics?.seeker_roles?.find(r => r.role === state.character.role)
                    : null;
                const traitName = roleInfo?.reward_trait ?? state.character.rewardTrait;
                logEvent(state, "trait-gained", `Odebrano nagrodę za cel: "${traitName}".`);
            }
            touch();

        } else if (action === "set-number") {
            // Input wpisywany bezpośrednio (Kredyty, PW gildii…) — bez górnego ograniczenia,
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
                state.character.companion = { key: null, stamina: { cur: 0, max: 0 }, bondPoints: 0, proficientStats: [] };
            } else {
                const c = companions[idx];
                state.character.companion = {
                    key: c.name,
                    stamina: { cur: c.stamina, max: c.stamina },
                    bondPoints: 0,
                    // Domyślnie biegły w swoich Key Stats — patrz companionKeyStatKeys() powyżej.
                    proficientStats: companionKeyStatKeys(data.mechanics, c)
                };
            }
            touch();

        } else if (action === "toggle-companion-proficient") {
            const stat = el.dataset.stat;
            // Auto-vivify na wypadek starszych zapisów sprzed tej funkcji (companion.proficientStats
            // jeszcze nie istnieje w stanie) — inicjalizujemy domyślnymi Key Stats towarzysza, tak
            // jak przy pierwszym wyborze towarzysza (select-companion powyżej).
            if (!state.character.companion.proficientStats) {
                const c = companions.find(x => x.name === state.character.companion.key);
                state.character.companion.proficientStats = companionKeyStatKeys(data.mechanics, c);
            }
            const list = state.character.companion.proficientStats;
            const idx = list.indexOf(stat);
            if (idx >= 0) list.splice(idx, 1); else list.push(stat);
            touch();
        }
    });
}
