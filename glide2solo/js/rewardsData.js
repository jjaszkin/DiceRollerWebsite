// GLIDE: Part Two — nagrody Poziom Więzi gildii oraz nagrody roli (klasy postaci) w jednym
// wspólnym kształcie, do modułu "Nagrody i Traity" na dashboardzie oraz do automatycznego
// oznaczania przedmiotów-nagród jako posiadane w tabach Sprzęt/Glider.
//
// WAŻNE (unikanie cykli importów): ten moduł importuje `sanitizeNameToKey` bezpośrednio
// z utils.js (NIE `gearSlug` z gearData.js) i `bondLevelFromPoints` z state.js — dzięki temu
// gearData.js może bezpiecznie importować STĄD (żeby dociągnąć nazwę/efekt nagród-przedmiotów
// do equippedGearEntries/installedModEntries), bez tworzenia importu cyklicznego.
import { sanitizeNameToKey } from "./utils.js";
import { bondLevelFromPoints } from "./state.js";

/** Nazwy nagród Poziom Więzi w guilds.json mają ujednolicony sufiks w nawiasie —
 *  "(Sprzęt)", "(Cecha)" albo "(Ulepszenie Glidera)" — konsekwentnie we wszystkich 6 gildiach
 *  (tier 1 = Sprzęt, tier 2 = Cecha, tier 3 = Ulepszenie Glidera, tier 4 = Cecha). Rozbija pełną
 *  nazwę na czystą nazwę bazową (do wyświetlenia/sluga) i kategorię (do routingu do
 *  właściwego taba oraz auto-ownership). Brak nawiasu (nie powinno się zdarzyć w danych) —
 *  traktowane jako brak kategorii, tylko do wyświetlenia. */
export function parseRewardName(fullName) {
    const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(fullName || "");
    if (!m) return { baseName: fullName || "", category: null };
    return { baseName: m[1], category: m[2] };
}

/** Wszystkie odblokowane nagrody Poziom Więzi (dla obecnego poziomu każdej gildii, tiery 1..level),
 *  ze sparsowaną kategorią i slugiem (do kluczowania w character.gear / character.glider.mods). */
export function unlockedGuildRewards(state, data) {
    const guilds = data?.guilds?.guilds || [];
    const out = [];
    for (const g of guilds) {
        const points = state.guildBonds?.[g.id]?.points || 0;
        const level = bondLevelFromPoints(points);
        for (let tier = 1; tier <= level; tier++) {
            const r = g.bond_level_rewards?.[String(tier)];
            if (!r) continue;
            const { baseName, category } = parseRewardName(r.name);
            out.push({
                guildId: g.id,
                guildName: g.name_pl,
                tier,
                fullName: r.name,
                baseName,
                category,
                effect: r.effect || "",
                slug: sanitizeNameToKey(baseName)
            });
        }
    }
    return out;
}

/** Podzbiór unlockedGuildRewards ograniczony do jednej kategorii ("Sprzęt" albo "Ulepszenie Glidera") —
 *  używane przez panels/gear.js i panels/glider.js do dobudowania katalogowej grupy "Nagrody Gildii". */
export function unlockedGuildItemRewards(state, data, category) {
    return unlockedGuildRewards(state, data).filter(r => r.category === category);
}

/** Nagrody/traity związane z wybraną rolą (klasą) postaci — zawsze czysty tekst, bez kategorii
 *  przedmiotowej (patrz uwaga w state.js/planowaniu: Nawigator ma w tekście nazwę realnego
 *  przedmiotu z katalogu, ale to zbyt kruche do generycznego parsowania — celowo pomijane,
 *  traktujemy obie nagrody roli jako Cecha-only). `claimed` dla cechy startowej jest zawsze
 *  true (dostaje się ją od razu przy wyborze roli); dla nagrody za cel odzwierciedla checkbox
 *  "Nagroda odebrana" z panelu Postać. */
export function roleRewardEntries(state, data) {
    const ch = state.character;
    if (!ch?.role) return [];
    const roleInfo = data?.mechanics?.seeker_roles?.find(r => r.role === ch.role);
    if (!roleInfo) return [];
    const out = [];
    if (roleInfo.starting_bonus_trait) {
        out.push({ source: "Cecha startowa", name: roleInfo.starting_bonus_trait, category: "Cecha", claimed: true });
    }
    if (roleInfo.reward_trait) {
        out.push({ source: "Nagroda za cel", name: roleInfo.reward_trait, category: "Cecha", claimed: !!ch.rewardClaimed });
    }
    return out;
}
