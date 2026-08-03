// GLIDE: Part Two — wspólne helpery do katalogu Sprzętu i Glidera (spłaszczanie danych z
// gear.json do kart, slugi kluczy stanu, listy "aktualnie założone/zainstalowane" używane
// zarówno w katalogach (panels/gear.js, panels/glider.js) jak i w skrócie na dashboardzie
// (panels/character.js).
import { sanitizeNameToKey } from "./utils.js";

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

/** Lista aktualnie założonego sprzętu (do skrótu na dashboardzie), z dociągniętymi
 *  danymi z katalogu (nazwa/efekt) — pomija sloty, których nazwa zniknęła z katalogu. */
export function equippedGearEntries(state, data) {
    const flat = flattenGear(data.gear);
    const bySlug = Object.fromEntries(flat.map(i => [i.slug, i]));
    const gearState = state.character.gear || {};
    return Object.entries(gearState)
        .filter(([, s]) => s.equipped)
        .map(([slug, s]) => ({ ...bySlug[slug], slug, state: s }))
        .filter(e => e.name);
}

/** Lista aktualnie zainstalowanych modów (do skrótu na dashboardzie). */
export function installedModEntries(state, data) {
    const flat = flattenMods(data.gear?.glider_upgrades);
    const bySlug = Object.fromEntries(flat.map(i => [i.slug, i]));
    const modsState = state.character.glider.mods || {};
    return Object.entries(modsState)
        .filter(([, s]) => s.installed)
        .map(([slug, s]) => ({ ...bySlug[slug], slug, state: s }))
        .filter(e => e.name);
}
