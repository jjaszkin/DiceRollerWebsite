// GLIDE: Part Two — generator napotkanych NPC-ów (panel Znajomości, panels/contacts.js).
// Losuje: frakcję (gildia z data/guilds.json), kilka słów-kluczy wyglądu i zachowania
// (data/npc_flavor.json#physical_traits/personality_traits — własna treść spisana z pliku
// "Losowy wygląd i cechy osobowości.md", patrz npc_flavor.json#_meta.notes), imię (reużywa
// nameGenerator.js — ta sama pula, co na ekranie startowym) oraz lokację i ewentualne
// pochodzenie (data/economy.json#settlement_names_table_d100).
//
// Frakcja i Pochodzenie są losowane/pokazywane WYŁĄCZNIE, gdy gracz zaznaczy odpowiedni
// checkbox w panelu Znajomości (patrz opts.includeFaction/includeOrigin niżej) — to decyzja
// gracza, nie losowość generatora.
//
// Tytuły NPC świadomie pominięte na tym etapie (na życzenie — może dojdą później).

import { generateName } from "./nameGenerator.js";

const PHYSICAL_KEYWORDS_COUNT = 2;
const PERSONALITY_KEYWORDS_COUNT = 2;

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
 * `opts.includeFaction`/`opts.includeOrigin` (domyślnie true) sterują tym, czy Frakcja i
 * Pochodzenie w ogóle są losowane — to checkboxy w panelu Znajomości, zaznaczane PRZED
 * losowaniem (patrz panels/contacts.js). Gdy wyłączone, pole jest zawsze `null` (nie losujemy
 * i nie pokazujemy).
 * Zwraca: { faction: {id,name_pl}|null, keywords: string[], name: string, location: string, origin: string|null }
 * — `origin`, gdy włączone, zawsze różni się od `location` (osobne miejsce pochodzenia).
 */
export function generateNpc(data, opts = {}) {
    const { includeFaction = true, includeOrigin = true } = opts;

    const flavor = data?.npc_flavor;
    const guilds = data?.guilds?.guilds ?? [];
    const settlements = (data?.economy?.settlement_names_table_d100 ?? []).map(s => s.name);

    const physical = flavor?.physical_traits ?? [];
    const personality = flavor?.personality_traits ?? [];

    let faction = null;
    if (includeFaction && guilds.length) {
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
    if (includeOrigin && settlements.length > 1) {
        do { origin = pick(settlements); } while (origin === location);
    }

    return { faction, keywords, name, location, origin };
}
