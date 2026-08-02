// GLIDE: Part Two — domyślny kształt stanu gry solo.
// Budowany na bazie danych z JSON-ów (lista gildii do guildBonds/guildJobs),
// żeby nie duplikować nazw gildii na sztywno w kodzie.

export function createDefaultState(gameData) {
    const guilds = gameData?.guilds?.guilds ?? [];

    const guildBonds = {};
    const guildJobs = {};
    for (const g of guilds) {
        guildBonds[g.id] = { points: 0 };
        guildJobs[g.id] = (g.missions ?? []).map(m => ({
            number: m.number,
            status: "available" // available | active | completed
        }));
    }

    return {
        meta: { version: 1, updatedAt: null },

        character: {
            role: null,
            stats: { H: 0, K: 0, R: 0, C: 0, F: 0 },
            proficientStats: [],
            startingBonusTrait: "",
            goal: "",
            goalDone: false,
            rewardTrait: "",
            rewardClaimed: false,

            resources: {
                stamina: { cur: 5, max: 5 },
                momentum: { cur: 1, max: 3 },
                intel: { cur: 1, max: 3 },
                credits: 50,
                fame: 0
            },

            gear: [null, null, null], // { name, wear, maxWear } | null

            glider: {
                wear: { cur: 5, max: 5 },
                supply: { cur: 6, max: 6 },
                speed: { cur: 2, max: 5 },
                cargoSlots: 3,
                scrap: { cur: 0, max: 5 },
                relics: { cur: 0, max: 3 },
                mods: [] // do 3 wpisów tekstowych
            },

            companion: {
                key: null,       // "name" wybranego towarzysza z companions_table_d100
                stamina: { cur: 0, max: 0 },
                bondPoints: 0
            }
        },

        guildBonds,   // { [guildId]: { points } } — level = floor(points/10), max 4

        quests: {
            guildJobs,    // { [guildId]: [{ number, status }] }
            oddJobs: []   // [{ id, range, name, status }] — max 2 aktywne naraz
        },

        day: { current: 1 },

        rollHistory: [], // [{ id, day, table, rollText, resultText, ts }]

        journal: []       // [{ id, day, text, ts }]
    };
}

/** Głębokie scalenie wczytanego stanu z domyślnym, żeby nowe pola dodane w kolejnych fazach
 *  nie wywalały się na starych zapisach z Firebase. */
export function mergeWithDefaults(defaults, loaded) {
    if (!loaded || typeof loaded !== "object") return defaults;
    const out = Array.isArray(defaults) ? [...defaults] : { ...defaults };
    for (const key of Object.keys(defaults)) {
        const defVal = defaults[key];
        const loadedVal = loaded[key];
        if (loadedVal === undefined) continue;
        if (defVal && typeof defVal === "object" && !Array.isArray(defVal) &&
            loadedVal && typeof loadedVal === "object" && !Array.isArray(loadedVal)) {
            out[key] = mergeWithDefaults(defVal, loadedVal);
        } else {
            out[key] = loadedVal;
        }
    }
    return out;
}

/** Bond Level = floor(points / 10), przycięty do [0, 4]. */
export function bondLevelFromPoints(points) {
    return Math.max(0, Math.min(4, Math.floor((points || 0) / 10)));
}
