// Battle Tracker - Klątwa Strahda. Kształt wspólnego stanu + seed z katalogu danych.
//
// `library.party`/`library.monsters` są seedowane z data/party.json i data/monsters.json TYLKO
// przy pierwszym uruchomieniu (gdy węzeł Firebase jeszcze nie istnieje) - patrz store.js#connect().
// Po pierwszym zapisie katalog żyje wyłącznie w Firebase, żeby GM mógł dodawać/edytować/usuwać
// wpisy z biblioteki bez ryzyka, że kolejny reload przywróci usunięty wpis z seeda.

import { uid } from "./utils.js";

function seedParty(entries) {
    const out = {};
    for (const p of entries || []) {
        const id = uid();
        out[id] = {
            id,
            name: p.name,
            race: p.race || "",
            class: p.class || "",
            ac: null,
            hp: { current: null, max: null },
            saves: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
            initiativeBonus: 0,
            notes: ""
        };
    }
    return out;
}

function seedMonsters(entries) {
    const out = {};
    for (const m of entries || []) {
        const id = uid();
        out[id] = {
            id,
            name: m.name,
            type: m.type || "",
            activeFormId: m.forms?.[0]?.formId ?? null,
            forms: (m.forms || []).map((f) => ({
                formId: f.formId,
                label: f.label,
                sizeType: f.sizeType || "",
                ac: f.ac ?? null,
                acNote: f.acNote || "",
                hp: { max: f.hp?.max ?? null },
                hpNote: f.hpNote || "",
                speed: f.speed || "",
                abilities: { ...(f.abilities || {}) },
                savingThrows: f.savingThrows || "",
                skills: f.skills || "",
                senses: f.senses || "",
                languages: f.languages || "",
                cr: f.cr || "",
                proficiencyBonus: f.proficiencyBonus ?? null,
                reactionLimit: f.reactionLimit ?? null,
                resistances: [...(f.resistances || [])],
                immunities: [...(f.immunities || [])],
                vulnerabilities: [...(f.vulnerabilities || [])],
                conditionImmunities: [...(f.conditionImmunities || [])],
                traits: (f.traits || []).map((t) => ({ ...t })),
                secondaryTrackers: (f.secondaryTrackers || []).map((t) => ({ ...t })),
                actions: (f.actions || []).map((a) => ({ ...a })),
                bonusActions: (f.bonusActions || []).map((a) => ({ ...a })),
                reactions: (f.reactions || []).map((a) => ({ ...a }))
            }))
        };
    }
    return out;
}

export function createDefaultState(gameData) {
    return {
        meta: { version: 1, updatedAt: null },
        library: {
            party: seedParty(gameData?.party),
            monsters: seedMonsters(gameData?.monsters)
        },
        battles: {},
        rollHistory: []
    };
}

/** Migracje starszych kształtów zapisu - obecnie brak, zastrzeżone na przyszłość. */
export function migrateLoadedState(loaded) {
    return loaded;
}

/** Uzupełnia TYLKO brakujące klucze najwyższego poziomu (meta/library/battles) z domyślnego stanu -
 *  celowo NIE scala głęboko w library.party/library.monsters/battles, żeby usunięcie wpisu z
 *  biblioteki przez GM nie zostało "wskrzeszone" przez seed przy kolejnym wczytaniu. */
export function mergeWithDefaults(defaults, loaded) {
    if (!loaded || typeof loaded !== "object") return defaults;
    const out = { ...loaded };
    for (const key of Object.keys(defaults)) {
        if (out[key] === undefined) out[key] = defaults[key];
    }
    return out;
}
