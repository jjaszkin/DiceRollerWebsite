// Hysteria Highest - Dashboard. Kształt wspólnego stanu kampanii + migracje/scalanie (wzorzec
// mergeWithDefaults 1:1 z darkgraal3dashboard/js/state.js - iteruje po sumie kluczy defaults ORAZ
// loaded, żeby nie ucinać dynamicznych kluczy nieznanych z góry).
//
// Dane statyczne (imiona, portrety, role, długość Toru Boskości, opisy kart) mieszkają w
// data/*.json (patrz data.js) i NIE są tu duplikowane - stan trzyma tylko to, co się zmienia w
// trakcie kampanii: PIN MG, aktywny etap talii, karty na krzyżu, karty w rękach postaci, atrybuty/
// Rany/Stabilność/Rozwój/Mroczne sekrety (✦)/Komplikacje (✧)/Atuty (☆)/postęp na Torze KAŻDEJ
// postaci (zaseedowane z data/characters.json przy pierwszym uruchomieniu, dalej edytowalne przez
// MG - stąd kopia w stanie, nie odczyt na żywo ze statycznych danych) + wspólny dziennik (log[]).
//
// Mroczne sekrety (✦), Komplikacje (✧) i Atuty (☆) to teraz WSZYSTKIE listy zaznaczalne z pełnego
// katalogu w data/*.json (data.mroczneSekrety / data.komplikacje / data.atuty), każdy wpis w
// kształcie { id, active } - "id" wprost z odpowiedniego pliku danych, "active: false" = wygaszony
// na karcie (jeszcze nie odkryty/wyzwolony w fabule, patrz Figma node 895-298), nieklikalny, bez
// rzutu (przełączane osobno od samego posiadania - patrz ikonka oka w panels/mg.js). Komplikacje
// dodatkowo mają "customLabel" (opcjonalny dopisek w nawiasie, np. "Prześladowca (Nick 2.0)") -
// Atuty i Mroczne Sekrety go NIE mają. Rozwój ma różną długość per rola - patrz
// data/characters.json#developmentMilestonesByRole (Absolwenci 4 kroki, Strażnicy 7).

export const CROSS_POSITIONS = ["gorna", "dolna", "lewa", "prawa", "srodkowa"];

function seedWounds(charDef) {
    if (charDef.wounds) return JSON.parse(JSON.stringify(charDef.wounds));
    return {
        serious: [
            { checked: false, note: "" }, { checked: false, note: "" },
            { checked: false, note: "" }, { checked: false, note: "" }
        ],
        critical: { checked: false, note: "" }
    };
}

function seedCharacterState(charDef, developmentLength) {
    return {
        cards: [],
        attrs: { ...charDef.attrs },
        awareness: charDef.awareness || "swiadomy",
        wounds: seedWounds(charDef),
        stability: typeof charDef.stability === "number" ? charDef.stability : 0,
        development: charDef.development ? [...charDef.development] : Array(developmentLength).fill(false),
        divinityProgress: 0,
        darkSecrets: charDef.darkSecrets ? charDef.darkSecrets.map(s => ({ ...s })) : [],
        complications: charDef.complications ? charDef.complications.map(c => ({ ...c })) : [],
        abilities: charDef.abilities ? charDef.abilities.map(a => ({ ...a })) : [],
        // Punkty Wpływu MG per Atut/Komplikacja, kluczowane id-kiem z data/atuty.json /
        // data/komplikacje.json - patrz panels/mg.js#buildInfluenceTab.
        abilityInfluence: {},
        complicationInfluence: {},
        // Możliwości banked przez SAMĄ postać z Atutów (np. Szósty Zmysł: "wybierz do X możliwości
        // i użyj ich w dowolnym momencie sesji") - osobny licznik od abilityInfluence (MG), patrz
        // panels/character.js#abilityOptionsHtml.
        abilityOptions: {}
    };
}

export function createDefaultState(gameData) {
    const characters = {};
    const milestonesByRole = gameData?.characters?.developmentMilestonesByRole ?? {};
    for (const c of gameData?.characters?.characters ?? []) {
        const devLength = (milestonesByRole[c.role] ?? []).length || 4;
        characters[c.key] = seedCharacterState(c, devLength);
    }
    const cross = {};
    for (const pos of CROSS_POSITIONS) cross[pos] = null;

    return {
        meta: { updatedAt: Date.now() },
        mgPin: "0000",
        deck: {
            activeStage: 1,
            discardKeys: []
        },
        cross,
        characters,
        handouts: { visible: {}, order: [] },
        // Stan odtwarzania Soundboardu (shared/soundboard/) - MIKROSKOPIJNE dane sterujące, NIE
        // same pliki audio (te serwuje Netlify bezpośrednio, patrz data/soundboard.json). Patrz
        // darkgraal3dashboard/js/state.js dla pełnego komentarza o znaczeniu każdego pola.
        soundboard: { music: null, sfxFired: null, playlists: {}, trackOrder: [] },
        log: []
    };
}

function baseLabel(label) {
    return label.split(" (")[0].trim();
}

function customLabelFromOldLabel(label) {
    const m = label.match(/\(([^)]+)\)\s*$/);
    return m ? m[1].trim() : "";
}

/** Stary kształt Atutów był `string[]` (samo ID) - nowy to `{ id, active }[]`, żeby dało się
 *  wygaszać pojedynczy Atut niezależnie od tego, że postać go posiada (patrz komentarz na górze
 *  pliku). Jeśli wpis jest już obiektem (nowy kształt), przechodzi bez zmian. */
function migrateAbilities(abilities) {
    if (!Array.isArray(abilities)) return abilities;
    return abilities.map(a => (typeof a === "string" ? { id: a, active: true } : a));
}

/** Stary kształt Mrocznych Sekretów/Komplikacji to `{ label, active }[]` z dowolnym tekstem -
 *  nowy to `{ id, active }[]` (Komplikacje dodatkowo `customLabel`), dopasowane do pełnego katalogu
 *  w data/mroczneSekrety.json / data/komplikacje.json (patrz komentarz na górze pliku). Dopasowanie
 *  po bazowej nazwie (przed nawiasem) - wzorzec 1:1 z tym, jak działało poprzednie dopasowanie w
 *  panels/character.js. Wpis bez dopasowania w katalogu jest odrzucany (z ostrzeżeniem w konsoli) -
 *  nowy model jest w pełni katalogowy, więc "osierocona" wolnotekstowa etykieta nie ma już gdzie się
 *  wyświetlić. */
function migrateCatalogItems(items, catalog, { withCustomLabel }) {
    if (!Array.isArray(items)) return items;
    const out = [];
    for (const item of items) {
        if (item && typeof item === "object" && "id" in item) {
            out.push(item);
            continue;
        }
        if (!item || typeof item.label !== "string") continue;
        const base = baseLabel(item.label).toLowerCase();
        const found = catalog.find(c => c.name.toLowerCase() === base);
        if (!found) {
            console.warn(`[HysteriaHighest] Migracja: nie znaleziono w katalogu wpisu "${item.label}" - pominięto.`);
            continue;
        }
        const migrated = { id: found.id, active: item.active !== false };
        if (withCustomLabel) migrated.customLabel = customLabelFromOldLabel(item.label);
        out.push(migrated);
    }
    return out;
}

/** Komplikacje potrzebują osobnej migracji (nie generyczny migrateCatalogItems) - stary per-wpisowy
 *  licznik Wpływu (complications[i].influence) trzeba przenieść do nowej wspólnej mapy
 *  complicationInfluence (kluczowanej id-kiem, analogicznie do abilityInfluence) W TYM SAMYM
 *  przebiegu co dopasowanie do katalogu, bo migrateCatalogItems pomija niedopasowane wpisy - po
 *  fakcie indeks w starej tablicy nie odpowiadałby już indeksowi w nowej. */
function migrateComplications(items, catalog) {
    const migrated = [];
    const influence = {};
    if (!Array.isArray(items)) return { migrated: items, influence };
    for (const item of items) {
        if (item && typeof item === "object" && "id" in item) {
            migrated.push(item);
            continue;
        }
        if (!item || typeof item.label !== "string") continue;
        const base = baseLabel(item.label).toLowerCase();
        const found = catalog.find(c => c.name.toLowerCase() === base);
        if (!found) {
            console.warn(`[HysteriaHighest] Migracja: nie znaleziono w katalogu Komplikacji "${item.label}" - pominięto.`);
            continue;
        }
        migrated.push({ id: found.id, customLabel: customLabelFromOldLabel(item.label), active: item.active !== false });
        if (item.influence) influence[found.id] = item.influence;
    }
    return { migrated, influence };
}

/** Migracja starych kształtów zapisu na aktualny (patrz migrateAbilities/migrateCatalogItems/
 *  migrateComplications). Wymaga gameData (katalogi Atutów/Komplikacji/Mrocznych Sekretów) do
 *  dopasowania starych wolnotekstowych etykiet - stąd dodatkowy parametr względem poprzedniej wersji
 *  tej funkcji. */
export function migrateLoadedState(loaded, gameData) {
    if (!loaded || !loaded.characters || !gameData) return loaded;
    for (const charState of Object.values(loaded.characters)) {
        if (charState.abilities) charState.abilities = migrateAbilities(charState.abilities);
        if (charState.darkSecrets) {
            charState.darkSecrets = migrateCatalogItems(charState.darkSecrets, gameData.mroczneSekrety, { withCustomLabel: false });
        }
        if (charState.complications) {
            const { migrated, influence } = migrateComplications(charState.complications, gameData.komplikacje);
            charState.complications = migrated;
            if (Object.keys(influence).length) {
                charState.complicationInfluence = { ...influence, ...(charState.complicationInfluence || {}) };
            }
        }
    }
    return loaded;
}

function isPlainObject(v) {
    return v && typeof v === "object" && !Array.isArray(v);
}

/** Głębokie scalanie wczytanego stanu z domyślnym, po sumie kluczy defaults ORAZ loaded. */
export function mergeWithDefaults(defaults, loaded) {
    if (!isPlainObject(defaults) || !isPlainObject(loaded)) {
        return loaded === undefined ? defaults : loaded;
    }
    const keys = new Set([...Object.keys(defaults), ...Object.keys(loaded)]);
    const out = {};
    for (const key of keys) {
        const dv = defaults[key];
        const lv = loaded[key];
        if (isPlainObject(dv) && isPlainObject(lv)) {
            out[key] = mergeWithDefaults(dv, lv);
        } else if (lv !== undefined) {
            out[key] = lv;
        } else {
            out[key] = dv;
        }
    }
    return out;
}
