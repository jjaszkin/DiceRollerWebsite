// GLIDE: Part Two — wspólne helpery do katalogu Sprzętu i Glidera (spłaszczanie danych z
// gear.json do kart, slugi kluczy stanu, listy "aktualnie założone/zainstalowane" używane
// zarówno w katalogach (panels/gear.js, panels/glider.js) jak i w skrócie na dashboardzie
// (panels/character.js).
import { sanitizeNameToKey, getPath, setPath } from "./utils.js";
import { unlockedGuildItemRewards } from "./rewardsData.js";

/** Slug używany jako klucz w state.character.gear / state.character.glider.mods —
 *  reużywa sanityzacji nazwy postaci do klucza Firebase (bez diakrytyków/spacji/znaków `.#$[]/`). */
export function gearSlug(name) {
    return sanitizeNameToKey(name);
}

// Etykiety PL dla kategorii katalogowych (klucze snake_case z gear.json/glider_upgrades) —
// inaczej naiwna humanizacja wypisałaby je po angielsku (np. "Social And Information Assets").
const CATEGORY_LABELS = {
    // gear.json — common_gear / advanced_gear
    social_and_information_assets: "Zasoby Społeczne i Informacyjne",
    survival_and_exploration_gear: "Sprzęt Survivalowy i Eksploracyjny",
    navigation_and_sensory_equipment: "Sprzęt Nawigacyjny i Sensoryczny",
    technical_and_scavenging_tools: "Narzędzia Techniczne i Złomiarskie",
    consumables_and_supplies: "Materiały Eksploatacyjne i Zapasy",
    // gear.json — glider_upgrades mody
    engine_and_mobility: "Silnik i Mobilność",
    sensors_and_tech: "Sensory i Technologia",
    frame_and_survival: "Rama i Przetrwanie"
};

function humanize(key) {
    if (Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, key)) return CATEGORY_LABELS[key];
    return String(key).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
export { humanize as humanizeCategory };

/** Płaska lista całego Sprzęt z katalogu (common + advanced), z tier/category/slug doklejonym. */
export function flattenGear(gearData) {
    const flat = [];
    for (const [tierKey, tierLabel] of [["common_gear", "Podstawowy"], ["advanced_gear", "Zaawansowany"]]) {
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

/** Tierowane ulepszenia magazynowania (Złom/Zasoby/Reliki) — kupowane po kolei, tier po tierze,
 *  poza limitem mods_max (to nie są "mody" montowane w slotach, tylko trwałe ulepszenia gliderа). */
export const TIERED_UPGRADE_CATEGORIES = [
    { key: "scrap_processing_tiers", label: "Magazynowanie Złomu" },
    { key: "supply_management_tiers", label: "Magazynowanie Zasobów" },
    { key: "relic_preservation_tiers", label: "Konserwacja Reliktów" }
];

/** Niektóre poziomy tierowanych ulepszeń magazynowania dają stały bonus do max. statystyki
 *  glidera wprost w treści efektu (np. "Max Złom +4", patrz gear.json) — reszta poziomów to
 *  zdolności sytuacyjne (bez wpływu na statystyki), więc dopasowanie jest opcjonalne (brak
 *  trafienia = brak zmiany stanu). Wzorce po kolei sprawdzane na treści efektu; ścieżka wskazuje
 *  pole w state, które ma zostać podniesione/obniżone o wyłuskaną liczbę. */
const TIER_STAT_BONUS_PATTERNS = [
    { re: /Max Złom \+(\d+)/i, path: "character.glider.scrap.max" },
    { re: /Max Zasoby \+(\d+)/i, path: "character.glider.supply.max" },
    { re: /Max Reliktó?w? \+(\d+)/i, path: "character.glider.relics.max" },
    { re: /Max Przestrzeń Załadunkowa \+(\d+)/i, path: "character.glider.cargoSlots" }
];

/** Nakłada (sign=+1) albo cofa (sign=-1) trwały bonus do statystyki glidera opisany w treści
 *  efektu jednego poziomu tierowanego ulepszenia — wołane raz na każdy pojedynczy stopień
 *  zmiany poziomu (patrz panels/glider.js#adjust-upgrade-tier), więc przy zejściu o tier w dół
 *  bonus jest symetrycznie odejmowany. Mutuje przekazany state; wywołujący odpowiada za touch(). */
export function applyTierStatBonus(state, effectText, sign) {
    if (!effectText) return;
    for (const { re, path } of TIER_STAT_BONUS_PATTERNS) {
        const m = re.exec(effectText);
        if (!m) continue;
        const amount = parseInt(m[1], 10) * sign;
        const cur = getPath(state, path) || 0;
        setPath(state, path, cur + amount);
    }
}

/** Plecak Odkrywcy ma specjalny efekt (patrz gear.json): "Max Sprzęt +2 (ten Sprzęt nie
 *  zajmuje slotu)" — założony podnosi efektywny limit noszonego sprzętu o 2 i sam się do
 *  tego limitu nie liczy. Slug wyliczony tym samym sanityzatorem co pozostałe klucze stanu.
 *  UWAGA: nazwa musi się zgadzać dokładnie z item.name w gear.json (katalog jest po polsku —
 *  wcześniej ten slug był liczony z angielskiej nazwy "Explorer's Backpack", przez co nigdy
 *  nie trafiał w rzeczywisty slug przedmiotu i wyjątek "nie zajmuje slotu" nigdy się nie uruchamiał). */
export const EXPLORERS_BACKPACK_SLUG = gearSlug("Plecak Odkrywcy");
export const EXPLORERS_BACKPACK_GEAR_BONUS = 2;

/** Efektywny limit noszonego Sprzęt (bazowy max_carried z mechanics.json + bonus z założonego
 *  Plecaka Odkrywcy) oraz liczba faktycznie zajętych slotów (Plecak, mimo że założony,
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
 *  Doklejane są też nagrody Poziom Więzi gildii kategorii "Sprzęt" — nie są w statycznym
 *  katalogu gear.json (patrz rewardsData.js), więc bez tego ich nazwa/efekt by nie
 *  wyszukały się po slugu, gdyby gracz je założył. */
export function equippedGearEntries(state, data) {
    const flat = flattenGear(data.gear);
    const bySlug = Object.fromEntries(flat.map(i => [i.slug, i]));
    for (const r of unlockedGuildItemRewards(state, data, "Sprzęt")) {
        if (!bySlug[r.slug]) bySlug[r.slug] = { name: r.baseName, effect: r.effect, slug: r.slug };
    }
    const gearState = state.character.gear || {};
    return Object.entries(gearState)
        .filter(([, s]) => s.equipped)
        .map(([slug, s]) => ({ ...bySlug[slug], slug, state: s }))
        .filter(e => e.name);
}

/** Lista aktualnie zainstalowanych modów (do skrótu na dashboardzie) — analogicznie doklejane
 *  są nagrody Poziom Więzi gildii kategorii "Ulepszenie Glidera". */
export function installedModEntries(state, data) {
    const flat = flattenMods(data.gear?.glider_upgrades);
    const bySlug = Object.fromEntries(flat.map(i => [i.slug, i]));
    for (const r of unlockedGuildItemRewards(state, data, "Ulepszenie Glidera")) {
        if (!bySlug[r.slug]) bySlug[r.slug] = { name: r.baseName, effect: r.effect, slug: r.slug };
    }
    const modsState = state.character.glider.mods || {};
    return Object.entries(modsState)
        .filter(([, s]) => s.installed)
        .map(([slug, s]) => ({ ...bySlug[slug], slug, state: s }))
        .filter(e => e.name);
}
