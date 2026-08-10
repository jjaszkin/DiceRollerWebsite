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

/** Buduje żywy (edytowalny w trakcie kampanii) stan jednej postaci na bazie jej wpisu w katalogu
 *  data/characters.json. Katalog jest traktowany jako TYLKO seed stanu startowego - dalsze zmiany
 *  (rany, modyfikatory, ekwipunek, użyte moce...) żyją wyłącznie w state.characters i są
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
        // Rany - licznik + osobna flaga "rana śmiertelna" (widziana w źródle Figma jako osobny
        // symbol na karcie postaci). Dokładne mechaniczne konsekwencje progu ran nie zostały
        // jeszcze doprecyzowane w danych dostępnych tej sesji - na razie to czysty licznik do
        // ręcznego odczytu/interpretacji przez MG, edytowalny z panelu MG.
        wounds: { count: 0, deadly: false },
        equipment: [...(c.equipment || [])],
        legendaryItemKeys: [...(c.legendaryItemKeys || [])],
        // { [powerId]: true } - moc oznaczona jako "użyta" w tej sesji/scenie/walce (usage z
        // data/transformations.json#powers[].effect.usage). Panel MG ma zbiorczy przycisk "Nowa
        // scena/sesja/walka", który czyści odpowiednie wpisy (patrz panels/mg.js).
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

        // Kości Graala - współdzielona pula, którą MG przyznaje graczom; przy teście gracz
        // deklaruje, ile z puli chce dorzucić do swojej puli testu (patrz panels/roller.js).
        // Czysty licznik bez wbudowanego maksimum (MG decyduje ręcznie, ile przyznać/odjąć).
        graalDice: { current: 0 },

        // Wiatr Camelotu - czysty licznik 0-10, bez wbudowanego efektu mechanicznego (potwierdzone
        // przez usera: "Wiatr Camelotu ma być tylko licznikiem, bez wartości"), narracyjny wskaźnik
        // narastającego zepsucia/finału sezonu 3, ręcznie przesuwany przez MG.
        campWind: { current: 0, scale: 10 },

        rollHistory: [], // [{ id, characterKey, archetypeKey, dice, tier, note, ts, at }] - patrz rollLog.js
        events: [],      // [{ id, type, text, ts, at }] - patrz eventLog.js
        journal: []      // [{ id, text, ts, at }] - wolne notatki MG (fabuła, ważne decyzje sesji)
    };
}

/** Punkt zaczepienia pod przyszłe migracje starszych kształtów zapisu (na wzór
 *  glide2solo#state.js#migrateLoadedState) - na razie nie ma jeszcze żadnej starszej wersji
 *  schematu, więc funkcja tylko przepuszcza wczytany stan bez zmian. Wywoływana PRZED
 *  mergeWithDefaults, tak jak w glide2solo. */
export function migrateLoadedState(loaded) {
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
