// GLIDE: Part Two — generator napotkanych NPC-ów (panel Znajomości, panels/contacts.js).
// Losuje: frakcję (gildia z data/guilds.json albo Niezrzeszony), kilka słów-kluczy wyglądu
// i zachowania (data/npc_flavor.json#physical_traits/personality_traits — własna treść spisana
// z pliku "Losowy wygląd i cechy osobowości.md", patrz npc_flavor.json#_meta.notes), imię
// (reużywa nameGenerator.js — ta sama pula, co na ekranie startowym) oraz lokację i ewentualne
// pochodzenie (data/economy.json#settlement_names_table_d100).
//
// Tytuły NPC świadomie pominięte na tym etapie (na życzenie — może dojdą później).

import { generateName } from "./nameGenerator.js";

const UNAFFILIATED_CHANCE = 0.3;     // szansa, że NPC nie należy do żadnej gildii
const PHYSICAL_KEYWORDS_COUNT = 2;
const PERSONALITY_KEYWORDS_COUNT = 2;
const ORIGIN_DIFFERENT_CHANCE = 0.5; // szansa, że Pochodzenie pokazujemy osobno (różne od Lokacji)

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

/** Losuje `n` unikalnych elementów z listy (bez powtórzeń), bez mutowania wejściowej tablicy. */
function pickN(list, n) {
    const pool = [...list];
    const out = [];
    while (out.length < n && pool.length) {
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(idx, 1)[0]);
    }
    return out;
}

/**
 * Losuje jednego napotkanego NPC. `data` to wynik loadGameData() (js/data.js).
 * Zwraca: { faction: {id,name_pl}|null, keywords: string[], name: string, location: string, origin: string|null }
 * — `origin` jest ustawione tylko, gdy "różni się" od `location` (patrz ORIGIN_DIFFERENT_CHANCE);
 * w przeciwnym razie null (czyli: NPC jest stąd, nie ma osobnego Pochodzenia do pokazania).
 */
export function generateNpc(data) {
    const flavor = data?.npc_flavor;
    const guilds = data?.guilds?.guilds ?? [];
    const settlements = (data?.economy?.settlement_names_table_d100 ?? []).map(s => s.name);

    const physical = flavor?.physical_traits ?? [];
    const personality = flavor?.personality_traits ?? [];

    let faction = null;
    if (guilds.length && Math.random() >= UNAFFILIATED_CHANCE) {
        const g = pick(guilds);
        faction = { id: g.id, name_pl: g.name_pl };
    }

    const keywords = [
        ...pickN(physical, PHYSICAL_KEYWORDS_COUNT),
        ...pickN(personality, PERSONALITY_KEYWORDS_COUNT)
    ];

    const name = generateName(data);

    const location = settlements.length ? pick(settlements) : "";
    let origin = null;
    if (settlements.length > 1 && Math.random() < ORIGIN_DIFFERENT_CHANCE) {
        do { origin = pick(settlements); } while (origin === location);
    }

    return { faction, keywords, name, location, origin };
}
