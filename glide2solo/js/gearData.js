// GLIDE: Part Two — wspólne helpery do katalogu Sprzętu i Glidera (spłaszczanie danych z
// gear.json do kart, slugi kluczy stanu, listy "aktualnie założone/zainstalowane" używane
// zarówno w katalogach (panels/gear.js, panels/glider.js) jak i w skrócie na dashboardzie
// (panels/character.js).
import { sanitizeNameToKey } from "./utils.js";
import { unlockedGuildItemRewards } from "./rewardsData.js";

/** Slug używany jako klucz w state.character.gear / state.character.glider.mods —
 *  reużywa sanityzacji nazwy postaci do klucza Firebase (bez diakrytyków/spacji/znaków `.#$[]/`). */
export function gearSlug(name) {
    return sanitizeNameToKey(name);
}

function humanize(key) {
    return String(key).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
export { humanize as humanizeCategory };

/** Płaska lista całego Gear z katalogu (common + advanced), z tier/category/slug doklejonym. */
export function flattenGear(gearData) {
    const flat = [];
    for (const [tierKey, tierLabel] of [["common_gear", "Common"], ["advanced_gear", "Advanced"]]) {
        const cats = gearData?.[tierKey] || {};
        for (const [catKey, items] of Object.entries(cats)) {
            for (const item of items) flat.push({ ...item, tier: tierLabel, category: catKey, slug: gearSlug(item.name) });
        }
    }
    return flat;
}

/** Płaska lista modów glidera do zamontowania (3 kategorie objęte limitem mods_max). */
export function flattenMods(gliderUpgrades) {
    const flat = [];
    for (const catKey of ["engine_and_mobility", "sensors_and_tech", "frame_and_survival"]) {
        for (const item of gliderUpgrades?.[catKey] || []) flat.push({ ...item, category: catKey, slug: gearSlug(item.name) });
    }
    return flat;
}

/** Tierowane ulepszenia magazynowania (Scrap/Supply/Reliki) — kupowane po kolei, tier po tierze,
 *  poza limitem mods_max (to nie są "mody" montowane w slotach, tylko trwałe ulepszenia gliderа). */
export const TIERED_UPGRADE_CATEGORIES = [
    { key: "scrap_processing_tiers", label: "Magazynowanie Scrap" },
    { key: "supply_management_tiers", label: "Magazynowanie Supply" },
    { key: "relic_preservation_tiers", label: "Konserwacja Reliktów" }
];

/** Explorer's Backpack ma specjalny efekt (patrz gear.json): "Max Gear +2 (ten Gear nie
 *  zajmuje slotu)" — założony podnosi efektywny limit noszonego sprzętu o 2 i sam się do
 *  tego limitu nie liczy. Slug wyliczony tym samym sanityzatorem co pozostałe klucze stanu. */
export const EXPLORERS_BACKPACK_SLUG = gearSlug("Explorer's Backpack");
export const EXPLORERS_BACKPACK_GEAR_BONUS = 2;

/** Efektywny limit noszonego Gear (bazowy max_carried z mechanics.json + bonus z założonego
 *  Explorer's Backpacka) oraz liczba faktycznie zajętych slotów (Backpack, mimo że założony,
 *  slotu nie zajmuje — patrz jego efekt). Współdzielone przez panels/gear.js i panels/character.js,
 *  żeby limit i licznik zawsze się zgadzały. */
export function gearCapacity(state, baseMaxCarried) {
    const gearState = state.character.gear || {};
    const backpackEquipped = !!gearState[EXPLORERS_BACKPACK_SLUG]?.equipped;
    const maxCarried = baseMaxCarried + (backpackEquipped ? EXPLORERS_BACKPACK_GEAR_BONUS : 0);
    const equippedCount = Object.entries(gearState)
        .filter(([slug, s]) => s.equipped && slug !== EXPLORERS_BACKPACK_SLUG)
        .length;
    return { maxCarried, equippedCount, backpackEquipped };
}

/** Lista aktualnie założonego sprzętu (do skrótu na dashboardzie), z dociągniętymi
 *  danymi z katalogu (nazwa/efekt) — pomija sloty, których nazwa zniknęła z katalogu.
 *  Doklejane są też nagrody Bond Level gildii kategorii "Gear" — nie są w statycznym
 *  katalogu gear.json (patrz rewardsData.js), więc bez tego ich nazwa/efekt by nie
 *  wyszukały się po slugu, gdyby gracz je założył. */
export function equippedGearEntries(state, data) {
    const flat = flattenGear(data.gear);
    const bySlug = Object.fromEntries(flat.map(i => [i.slug, i]));
    for (const r of unlockedGuildItemRewards(state, data, "Gear")) {
        if (!bySlug[r.slug]) bySlug[r.slug] = { name: r.baseName, effect: r.effect, slug: r.slug };
    }
    const gearState = state.character.gear || {};
    return Object.entries(gearState)
        .filter(([, s]) => s.equipped)
        .map(([slug, s]) => ({ ...bySlug[slug], slug, state: s }))
        .filter(e => e.name);
}

/** Lista aktualnie zainstalowanych modów (do skrótu na dashboardzie) — analogicznie doklejane
 *  są nagrody Bond Level gildii kategorii "Glider Upgrade". */
export function installedModEntries(state, data) {
    const flat = flattenMods(data.gear?.glider_upgrades);
    const bySlug = Object.fromEntries(flat.map(i => [i.slug, i]));
    for (const r of unlockedGuildItemRewards(state, data, "Glider Upgrade")) {
        if (!bySlug[r.slug]) bySlug[r.slug] = { name: r.baseName, effect: r.effect, slug: r.slug };
    }
    const modsState = state.character.glider.mods || {};
    return Object.entries(modsState)
        .filter(([, s]) => s.installed)
        .map(([slug, s]) => ({ ...bySlug[slug], slug, state: s }))
        .filter(e => e.name);
}
