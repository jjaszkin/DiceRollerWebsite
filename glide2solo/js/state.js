// GLIDE: Part Two — domyślny kształt stanu gry solo.
// Budowany na bazie danych z JSON-ów (lista gildii do guildBonds/guildJobs),
// żeby nie duplikować nazw gildii na sztywno w kodzie.
import { sanitizeNameToKey } from "./utils.js";

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
            name: "",
            role: null,
            pin: null, // string "0000".."9999" (4 cyfry) albo null — prosta ochrona przed przypadkowym/
                       // niepożądanym wczytaniem cudzego zapisu po samym imieniu, patrz gate.js#showPinStep.
                       // To NIE jest prawdziwe zabezpieczenie bazy (reguły Firebase pod GlidePartTwoSolo są
                       // otwarte, patrz firebase.js) — tylko bramka po stronie aplikacji.
            stats: { H: 0, K: 0, R: 0, C: 0, F: 0 },
            startingBonusTrait: "",
            goal: "",
            goalProgress: 0,
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

            gear: {}, // { [slug]: { owned, equipped, wear } } — katalog kart w data/gear.json,
                       // slug = sanitizeNameToKey(nazwa); wear domyślne/max liczone z mechanics.resources.gear.wear_per_item

            glider: {
                wear: { cur: 5, max: 5 },
                supply: { cur: 6, max: 6 },
                speed: { cur: 2, max: 5 },
                cargoSlots: 3,
                scrap: { cur: 0, max: 5 },
                relics: { cur: 0, max: 3 },
                mods: {}, // { [slug]: { owned, installed } } — do mechanics.glider.mods_max zainstalowanych naraz
                upgrades: { scrap_processing_tiers: 0, supply_management_tiers: 0, relic_preservation_tiers: 0 } // najwyższy zakupiony tier (0 = brak) tierowanych ulepszeń magazynowania
            },

            companion: {
                key: null,       // "name" wybranego towarzysza z companions_table_d100
                stamina: { cur: 0, max: 0 },
                bondPoints: 0
                // proficientStats (klucze H/K/R/C/F, w których towarzysz jest biegły) celowo NIE ma
                // tu domyślnej wartości — patrz character.js#companionKeyStatKeys/render(): brak pola
                // oznacza "użyj domyślnych Key Stats towarzysza", ustawianych realnie dopiero przy
                // wyborze towarzysza (select-companion) albo pierwszym kliknięciu checkboxa
                // (auto-vivify, toggle-companion-proficient) — tak jak przy nagrodach gildii w
                // gear.js/glider.js. Jawne `[]` w defaultach zepsułoby fallback dla starszych zapisów
                // (mergeWithDefaults nadpisałby brakujące pole pustą tablicą zamiast zostawić undefined).
            }
        },

        guildBonds,   // { [guildId]: { points } } — level = floor(points/10), max 4

        quests: {
            guildJobs,    // { [guildId]: [{ number, status }] }
            oddJobs: []   // [{ id, range, name, status }] — max 2 aktywne naraz
        },

        day: { current: 1 },

        rollHistory: [], // [{ id, day, table, rollText, resultText, ts }]

        journal: [],      // [{ id, day, text, ts }]

        contacts: [],      // [{ id, day, name, faction: {id,name_pl}|null, keywords: string[],
                            //    location, origin: string|null, savedAt }] — zapisani NPC z panelu
                            //    Znajomości (panels/contacts.js), patrz npcGenerator.js#generateNpc

        map: {
            // Mapa jest podzielona na Sektory (osobne siatki 12x10 heksów) rozciągające się na
            // wschód/zachód od startowego Sektora 0 — patrz panels/map.js#navigateSegment.
            // Sektory tworzone są leniwie (dopiero przy kliknięciu "Na wschód/zachód"), więc
            // `segments` na starcie zawiera tylko klucz "0". Segment ID to liczba całkowita
            // (0 = start, dodatnie = wschód, ujemne = zachód); etykieta "W{n}"/"Z{n}" powstaje
            // z niej dopiero przy renderze (patrz segmentLabel).
            segments: {
                "0": {
                    hexes: {},        // { [coordId]: HexEntry } — brak klucza = nieodkryty heks. Patrz panels/map.js.
                                       // HexEntry (root/samodzielny): { discovered, regionRoot: null, typeResult, typeRoll,
                                       //   tiles, tilesTotal, tilesRoll, level, levelRoll, levelGapFallback, tests: [] }
                                       // HexEntry (członek regionu): { discovered, regionRoot: <coordId root>, tests: [] }
                                       // — dane typu/poziomu lokacji dla członka regionu czyta się z heksu-roota.
                    pendingRegion: null // { rootId, tilesTotal, remaining } — aktywny tryb "kliknij N pól, żeby dodać
                                         // do regionu"; null = brak aktywnego wyboru regionu
                }
            },
            currentSegment: 0, // ID Sektora aktualnie wyświetlanego na mapie — czysto widokowe, NIE
                                // zmienia się przy przesunięciu postaci (patrz panels/map.js#navigateSegment
                                // vs moveHere).
            position: null,    // { segment, coord } aktualnej pozycji postaci na mapie, albo null
                                // (jeszcze nieustawiona)
            nextMoveFreeSupply: false // Flaga ustawiana przez efekt Wydarzenia Podróży "Następny Ruch
                                // kosztuje 0 Zasoby" (patrz travelEvents.js) — konsumowana (zresetowana
                                // do false) przez najbliższy kolejny ruch w panels/map.js#moveHere.
        },

        events: []        // [{ id, day, type, text, ts, at }] — patrz eventLog.js: questy, przedmioty,
                           // ulepszenia glidera, traity, zmiany statystyk, podsumowania nowego dnia
    };
}

/** Migruje starszy kształt zapisu — Sprzęt i Mody glidera jako sztywne tablice slotów
 *  ([null,null,null] z { name, wear, maxWear }/{ name, category, effect }) — do nowego kształtu:
 *  mapy kluczowane slugiem nazwy przedmiotu, z osobnymi flagami owned/equipped(/installed).
 *  Wywoływane PRZED mergeWithDefaults (który same tablice zostawiłby bez zmian, bo scalanie
 *  głębokie dotyczy tylko obiektów, nie tablic). Nowe zapisy (już w formie mapy, albo bez
 *  danych) przechodzą przez tę funkcję bez zmian. Mutuje i zwraca ten sam obiekt `loaded`. */
export function migrateLoadedState(loaded) {
    if (!loaded || typeof loaded !== "object") return loaded;

    const ch = loaded.character;
    if (ch) {
        if (Array.isArray(ch.gear)) {
            const map = {};
            for (const slot of ch.gear) {
                if (!slot || !slot.name) continue;
                map[sanitizeNameToKey(slot.name)] = {
                    owned: true,
                    equipped: true,
                    wear: typeof slot.wear === "number" ? slot.wear : (slot.maxWear ?? 3)
                };
            }
            ch.gear = map;
        }

        if (ch.glider && Array.isArray(ch.glider.mods)) {
            const map = {};
            for (const slot of ch.glider.mods) {
                if (!slot || !slot.name) continue;
                map[sanitizeNameToKey(slot.name)] = { owned: true, installed: true };
            }
            ch.glider.mods = map;
        }
    }

    // Migracja Mapy: stary (płaski, jednosegmentowy) kształt state.map — { hexes, position: coordId,
    // pendingRegion } — do nowego, wielosegmentowego { segments: { [segId]: { hexes, pendingRegion } },
    // currentSegment, position: { segment, coord } }. Segment startowy to zawsze "0". Rozpoznajemy
    // stary kształt po braku `segments` (nowe zapisy, już w tym kształcie, przechodzą bez zmian).
    if (loaded.map && !loaded.map.segments) {
        const oldMap = loaded.map;
        loaded.map = {
            segments: {
                "0": {
                    hexes: oldMap.hexes || {},
                    pendingRegion: oldMap.pendingRegion ?? null
                }
            },
            currentSegment: 0,
            position: oldMap.position ? { segment: 0, coord: oldMap.position } : null
        };
    }

    return loaded;
}

/** Głębokie scalenie wczytanego stanu z domyślnym, żeby nowe pola dodane w kolejnych fazach
 *  nie wywalały się na starych zapisach z Firebase.
 *  WAŻNE: iterujemy po sumie kluczy defaults ORAZ loaded (nie tylko defaults) — niektóre gałęzie
 *  (np. character.gear, character.glider.mods) mają domyślnie pusty kształt `{}` i przechowują
 *  dynamiczne klucze (slugi przedmiotów) nieznane z góry. Iterowanie wyłącznie po Object.keys(defaults)
 *  ucinałoby wtedy każdy taki wpis przy każdym scaleniu (czyli przy każdym echu z Firebase). */
export function mergeWithDefaults(defaults, loaded) {
    if (!loaded || typeof loaded !== "object") return defaults;
    const out = Array.isArray(defaults) ? [...defaults] : { ...defaults };
    const keys = new Set([...Object.keys(defaults), ...Object.keys(loaded)]);
    for (const key of keys) {
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

/** Poziom Więzi = floor(points / 10), przycięty do [0, 4]. */
export function bondLevelFromPoints(points) {
    return Math.max(0, Math.min(4, Math.floor((points || 0) / 10)));
}

/** Ustawia rolę Poszukiwacza na obiekcie character (mutuje bezpośrednio): nazwę roli,
 *  statystyki startowe, cechę startową, cel i nagrodę. Resetuje postęp celu i status
 *  odebrania nagrody. Używane przez ekran startowy (kreator postaci) — jedyne miejsce,
 *  w którym rolę można ustawić lub zmienić. */
export function applyRole(character, role) {
    character.role = role.role;
    character.stats = { ...role.starting_stats };
    character.startingBonusTrait = role.starting_bonus_trait;
    character.goal = role.goal;
    character.rewardTrait = role.reward_trait;
    character.goalProgress = 0;
    character.rewardClaimed = false;
}
