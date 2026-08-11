// Dark Graal III - Dashboard Solo (MG). Kształt wspólnego stanu kampanii + migracje.
//
// W przeciwieństwie do glide2solo (jeden zapis Firebase per postać gracza), tu jest JEDEN
// wspólny stan kampanii (patrz js/firebase.js#DB_ROOT), zawierający wszystkie 4 postacie naraz
// (`characters.{gaven,palanore,cadwyn,brandon}`) - MG i gracze patrzą na ten sam dokument.
// Kim jest patrzący (MG / który gracz) to WYŁĄCZNIE lokalny wybór przeglądarki (patrz gate.js),
// nie część stanu zapisywanego do Firebase.

import { uid } from "./utils.js";

/** Głęboka kopia jednego archetypu z katalogu postaci (data/characters.json). */
function cloneArchetype(a) {
    return {
        base: a.base,
        woundDice: a.woundDice || 0,
        modifiers: (a.modifiers || []).map(m => ({ ...m }))
    };
}

function cloneArchetypes(catalogArchetypes) {
    const out = {};
    for (const key of Object.keys(catalogArchetypes || {})) {
        out[key] = cloneArchetype(catalogArchetypes[key]);
    }
    return out;
}

/** Konwertuje jeden wpis ekwipunku zwykłego z katalogu (zwykły string, np. "żołędzie z dębu
 *  Merlina") na żywy, edytowalny obiekt: { id, name, tooltip, disabled }. `tooltip` startuje puste
 *  (MG dopisuje go później z panelu MG - patrz panels/mg.js), `disabled` pozwala MG "wygasić"
 *  przedmiot (zepsuty/zużyty/skradziony) bez usuwania go z karty postaci. */
function cloneEquipmentItem(name) {
    return { id: uid(), name, tooltip: "", disabled: false };
}

/** Buduje żywy (edytowalny w trakcie kampanii) stan jednej postaci na bazie jej wpisu w katalogu
 *  data/characters.json. Katalog jest traktowany jako TYLKO seed stanu startowego - dalsze zmiany
 *  (modyfikatory, ekwipunek, użyte moce...) żyją wyłącznie w state.characters i są
 *  zapisywane do Firebase, katalog JSON się nie zmienia. */
function cloneCharacterFromCatalog(c) {
    return {
        key: c.key,
        aliasName: c.aliasName,
        type: c.type,
        name: c.name,
        epithet: c.epithet ?? null,
        archetypes: cloneArchetypes(c.archetypes),
        despair: { current: c.despair?.current ?? 0 },
        blessing: !!c.blessing,
        equipment: (c.equipment || []).map(cloneEquipmentItem),
        legendaryItemKeys: [...(c.legendaryItemKeys || [])],
        // Klucze Przedmiotów Legendarnych aktualnie "wygaszonych" przez MG (np. skradzione,
        // przeklęte, wyczerpane) - przedmiot ZOSTAJE na karcie postaci (w legendaryItemKeys), tylko
        // jest wyświetlany jako nieaktywny. Niezależne od `equipment[].disabled` (ekwipunek zwykły).
        disabledItemKeys: [...(c.disabledItemKeys || [])],
        // { [powerId]: true } - moc oznaczona jako "użyta" w tej sesji/scenie/walce (usage z
        // data/transformations.json#powers[].effect.usage, albo namespacowane id Mocy Legendarnych
        // przedmiotów typu "excalibur-blask-zepsucia" - patrz data/items.json#usable). Panel MG ma
        // zbiorczy przycisk "Nowa scena/sesja/walka", który czyści odpowiednie wpisy (panels/mg.js).
        usedPowers: {}
    };
}

export function createDefaultState(gameData) {
    const catalogChars = gameData?.characters ?? [];
    const characters = {};
    for (const c of catalogChars) characters[c.key] = cloneCharacterFromCatalog(c);

    return {
        meta: { version: 1, updatedAt: null },

        characters, // { [charKey]: <patrz cloneCharacterFromCatalog> }

        // PIN Mistrza Gry (4 cyfry) - broni dostępu do roli MG na gate.js. Ustawiany/zmieniany
        // bezpośrednio w Firebase przez usera (poza UI dashboardu), domyślnie "0000".
        mgPin: "0000",

        // Wiatr Camelotu - czysty licznik 0-10, bez wbudowanego efektu mechanicznego (potwierdzone
        // przez usera: "Wiatr Camelotu ma być tylko licznikiem, bez wartości"), narracyjny wskaźnik
        // narastającego zepsucia/finału sezonu 3, ręcznie przesuwany przez MG, widoczny na karcie
        // każdego gracza jako wyróżniony (glow/podwójna ramka) odczyt.
        campWind: { current: 0, scale: 10 },

        rollHistory: [], // [{ id, characterKey, archetypeKey, dice, tier, note, ts, at }] - patrz rollLog.js
        events: [],      // [{ id, type, text, ts, at }] - patrz eventLog.js
        journal: []      // [{ id, text, ts, at }] - zachowane wyłącznie jako "duchy" starych wpisów z
                          // testów (usuwalne przez MG) - UI dodawania nowych notatek zostało usunięte.
    };
}

/** Migracje starszych kształtów zapisu, wywoływane PRZED mergeWithDefaults (na wzór
 *  glide2solo#state.js#migrateLoadedState). Obecnie:
 *   1) Ekwipunek zwykły: stary kształt to string[] ("żołędzie z dębu Merlina"), nowy to
 *      { id, name, tooltip, disabled }[] - konwertujemy każdy string-owy wpis na obiekt (idempotentnie:
 *      wpisy, które już są obiektami, przechodzą bez zmian).
 *   2) Usuwamy martwe pole `graalDice` (stara, współdzielona pula Kości Graala) ze starszych zapisów -
 *      mechanika została zastąpiona deklarowaniem puli Graala każdorazowo przy rzucie (panels/roller.js).
 */
export function migrateLoadedState(loaded) {
    if (!loaded || typeof loaded !== "object") return loaded;
    if (loaded.graalDice !== undefined) delete loaded.graalDice;
    const characters = loaded.characters;
    if (characters && typeof characters === "object") {
        for (const key of Object.keys(characters)) {
            const character = characters[key];
            if (character && Array.isArray(character.equipment)) {
                character.equipment = character.equipment.map(entry =>
                    typeof entry === "string" ? cloneEquipmentItem(entry) : entry
                );
            }
        }
    }
    return loaded;
}

/** Głębokie scalenie wczytanego stanu z domyślnym - patrz glide2solo#state.js dla pełnego
 *  uzasadnienia (iterowanie po sumie kluczy defaults ORAZ loaded, żeby nie ucinać dynamicznych
 *  kluczy nieznanych z góry - tu istotne dla state.characters.{key}.archetypes.{key}.modifiers). */
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

/** Aktualna (efektywna) wartość Archetypu = baza - kości ran + suma aktywnych modyfikatorów,
 *  przycięta do min. 0. To jest wartość faktycznie używana do budowania puli testu. */
export function archetypeCurrent(archetype) {
    const modSum = (archetype.modifiers || [])
        .filter(m => m.active)
        .reduce((sum, m) => sum + (Number(m.delta) || 0), 0);
    return Math.max(0, (archetype.base || 0) - (archetype.woundDice || 0) + modSum);
}

/** Maksimum Rozpaczy postaci = najwyższa wartość BAZOWA (nie efektywna) spośród jej 5 Archetypów
 *  - potwierdzone przez usera ("Przyjmijmy, że limit to wartość Archetypu") i zweryfikowane
 *  krzyżowo z danymi z Figmy dla wszystkich 4 postaci (patrz data/characters.json). */
export function despairMax(character) {
    const bases = Object.values(character.archetypes || {}).map(a => a.base || 0);
    return bases.length ? Math.max(...bases) : 0;
}

/** Dodaje nowy (domyślnie aktywny) modyfikator freeform do archetypu - patrz panels/mg.js. */
export function addModifier(archetype, { label, delta, tooltip }) {
    archetype.modifiers.push({
        id: uid(),
        label: label || "",
        delta: Number(delta) || 0,
        tooltip: tooltip || "",
        active: true
    });
}

export function removeModifier(archetype, modifierId) {
    archetype.modifiers = archetype.modifiers.filter(m => m.id !== modifierId);
}

export function toggleModifier(archetype, modifierId) {
    const mod = archetype.modifiers.find(m => m.id === modifierId);
    if (mod) mod.active = !mod.active;
}
