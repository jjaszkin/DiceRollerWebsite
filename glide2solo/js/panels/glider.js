// Panel: Glider — katalog Modów do zamontowania (do limitu mechanics.glider.mods_max) oraz
// tierowanych ulepszeń magazynowania Scrap/Supply/Reliktów (kupowane po kolei, tier po tierze,
// bez limitu montażu — to trwałe ulepszenia gliderа, nie mody w slotach). Podstawowe statystyki
// glidera (Wear/Supply/Speed/Scrap/Relics) zostają na dashboardzie (panel Postać).
import { getState, getData, touch } from "../store.js";
import { escapeHtml, clamp } from "../utils.js";
import { flattenMods, humanizeCategory, TIERED_UPGRADE_CATEGORIES } from "../gearData.js";
import { unlockedGuildItemRewards } from "../rewardsData.js";
import { logEvent } from "../eventLog.js";

function renderModCard(item, itemState, canInstallMore) {
    const owned = !!itemState.owned;
    const installed = !!itemState.installed;
    const disabledInstall = !owned || (!installed && !canInstallMore);
    return `
        <div class="item-card tt ${owned ? "owned" : ""} ${installed ? "equipped" : ""}" data-tip="${escapeHtml(item.effect || "")}">
            <div class="item-card-head">
                <span class="item-card-name">${escapeHtml(item.name)}</span>
                <span class="item-card-cost">${escapeHtml(item.cost || "")}</span>
            </div>
            <div class="item-card-toggles">
                <label>
                    <input type="checkbox" data-action="toggle-mod-owned" data-slug="${item.slug}" ${owned ? "checked" : ""}>
                    <span>Kupione</span>
                </label>
                <label class="${disabledInstall ? "disabled" : ""}">
                    <input type="checkbox" data-action="toggle-mod-installed" data-slug="${item.slug}" ${installed ? "checked" : ""} ${disabledInstall ? "disabled" : ""}>
                    <span>Zainstalowane</span>
                </label>
            </div>
        </div>
    `;
}

/** Karta dla nagrody Bond Level gildii kategorii "Glider Upgrade" — zawsze posiadana
 *  ("Kupione" zastąpione stałą etykietą źródła), ale Zainstalowane liczy się normalnie
 *  do mods_max, tak jak zwykłe mody. */
function renderRewardModCard(item, itemState, canInstallMore) {
    const installed = !!itemState.installed;
    const disabledInstall = !installed && !canInstallMore;
    return `
        <div class="item-card tt owned ${installed ? "equipped" : ""}" data-tip="${escapeHtml(item.effect || "")}">
            <div class="item-card-head">
                <span class="item-card-name">${escapeHtml(item.name)}</span>
                <span class="item-card-cost">${escapeHtml(item.badge)}</span>
            </div>
            <div class="item-card-toggles">
                <label class="disabled">
                    <input type="checkbox" checked disabled>
                    <span>Nagroda gildii</span>
                </label>
                <label class="${disabledInstall ? "disabled" : ""}">
                    <input type="checkbox" data-action="toggle-mod-installed" data-slug="${item.slug}" ${installed ? "checked" : ""} ${disabledInstall ? "disabled" : ""}>
                    <span>Zainstalowane</span>
                </label>
            </div>
        </div>
    `;
}

function renderTierCard(item, level) {
    const owned = item.tier <= level;
    return `
        <div class="item-card tt ${owned ? "owned equipped" : ""}" data-tip="${escapeHtml(item.effect || "")}">
            <div class="item-card-head">
                <span class="item-card-name">Tier ${item.tier}: ${escapeHtml(item.name)}</span>
                <span class="item-card-cost">${escapeHtml(item.cost || "")}</span>
            </div>
            <p class="placeholder" style="margin:0;">${owned ? "Posiadane" : "Niekupione"}</p>
        </div>
    `;
}

export function render(root, { state, data }) {
    const mechanics = data.mechanics;
    const modsMax = mechanics?.glider?.mods_max ?? 3;
    const flatMods = flattenMods(data.gear?.glider_upgrades);
    const modsState = state.character.glider.mods || {};
    const installedCount = Object.values(modsState).filter(s => s.installed).length;
    const canInstallMore = installedCount < modsMax;

    const modGroups = new Map();
    for (const item of flatMods) {
        const key = humanizeCategory(item.category);
        if (!modGroups.has(key)) modGroups.set(key, []);
        modGroups.get(key).push(item);
    }

    const upgrades = state.character.glider.upgrades || {};
    const guildModRewards = unlockedGuildItemRewards(state, data, "Glider Upgrade");

    root.innerHTML = `
        <div class="card">
            <h2>Glider — Mody</h2>
            <p class="cap-indicator ${installedCount >= modsMax ? "full" : ""}">Zainstalowane: ${installedCount} / ${modsMax}</p>
            <p class="placeholder">Najedź na kartę, żeby zobaczyć efekt. "Kupione" oznacza posiadanie modu; "Zainstalowane" liczy się do limitu slotów.</p>
        </div>
        ${Array.from(modGroups.entries()).map(([label, items]) => `
            <div class="card catalog-group" style="margin-top:12px;">
                <h4>${escapeHtml(label)}</h4>
                <div class="catalog-grid">
                    ${items.map(item => renderModCard(item, modsState[item.slug] || {}, canInstallMore)).join("")}
                </div>
            </div>
        `).join("")}
        ${guildModRewards.length ? `
            <div class="card catalog-group" style="margin-top:12px;">
                <h4>Nagrody Gildii (Glider Upgrade)</h4>
                <p class="placeholder">Odblokowane przez Bond Level — posiadane automatycznie, można je normalnie zainstalować/odinstalować.</p>
                <div class="catalog-grid">
                    ${guildModRewards.map(r => renderRewardModCard(
                        { slug: r.slug, name: r.baseName, effect: r.effect, badge: `${r.guildName} · Lv${r.tier}` },
                        modsState[r.slug] || {}, canInstallMore
                    )).join("")}
                </div>
            </div>
        ` : ""}

        <div class="card" style="margin-top:16px;">
            <h2>Ulepszenia magazynowania</h2>
            <p class="placeholder">${escapeHtml(data.gear?.glider_upgrades?.rules ?? "")}</p>
        </div>
        ${TIERED_UPGRADE_CATEGORIES.map(({ key, label }) => {
            const tiers = data.gear?.glider_upgrades?.[key] || [];
            const level = upgrades[key] || 0;
            return `
                <div class="card catalog-group" style="margin-top:12px;">
                    <h4>${escapeHtml(label)}</h4>
                    <div class="counter-row">
                        <div class="counter-label">Poziom</div>
                        <div class="counter-controls">
                            <button class="btn btn-sm btn-icon" data-action="adjust-upgrade-tier" data-key="${key}" data-delta="-1">−</button>
                            <span class="counter-value">${level} <span class="max">/ ${tiers.length}</span></span>
                            <button class="btn btn-sm btn-icon" data-action="adjust-upgrade-tier" data-key="${key}" data-delta="1">+</button>
                        </div>
                    </div>
                    <div class="catalog-grid">
                        ${tiers.map(item => renderTierCard(item, level)).join("")}
                    </div>
                </div>
            `;
        }).join("")}
    `;

    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        const el = e.target;
        const action = el.dataset.action;
        if (!action) return;
        const state = getState();
        const data = getData();
        const slug = el.dataset.slug;
        const mods = state.character.glider.mods;

        if (action === "toggle-mod-owned") {
            if (el.checked) {
                if (!mods[slug]) mods[slug] = { owned: true, installed: false };
                else mods[slug].owned = true;
                const item = flattenMods(data.gear?.glider_upgrades).find(m => m.slug === slug);
                logEvent(state, "item-gained", `Zdobyto mod glidera: "${item?.name ?? slug}".`);
            } else {
                if (mods[slug]?.installed && !window.confirm("Ten mod jest zainstalowany — na pewno oznaczyć jako niekupiony? (zostanie odinstalowany)")) {
                    el.checked = true;
                    return;
                }
                delete mods[slug];
            }
            touch();
        } else if (action === "toggle-mod-installed") {
            // Auto-vivify: nagrody gildii (Glider Upgrade) nie mają wpisu w mods[] dopóki
            // gracz sam czegoś tu nie przełączy — patrz renderRewardModCard/toggle-gear-equipped.
            if (!mods[slug]) mods[slug] = { owned: true, installed: false };
            mods[slug].installed = el.checked;
            touch();
        }
    });

    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action='adjust-upgrade-tier']");
        if (!btn) return;
        const state = getState();
        const data = getData();
        const key = btn.dataset.key;
        const delta = parseInt(btn.dataset.delta, 10);
        const maxTier = (data.gear?.glider_upgrades?.[key] || []).length;
        if (!state.character.glider.upgrades) state.character.glider.upgrades = {};
        const upgrades = state.character.glider.upgrades;
        const before = upgrades[key] || 0;
        const next = clamp(before + delta, 0, maxTier);
        upgrades[key] = next;
        if (next > before) {
            const label = TIERED_UPGRADE_CATEGORIES.find(c => c.key === key)?.label ?? key;
            logEvent(state, "glider-upgrade", `Ulepszono magazynowanie (${label}) do tieru ${next}.`);
        }
        touch();
    });
}
