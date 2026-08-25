// Hysteria Highest - Dashboard. Kształt wspólnego stanu kampanii + migracje/scalanie (wzorzec
// mergeWithDefaults 1:1 z darkgraal3dashboard/js/state.js - iteruje po sumie kluczy defaults ORAZ
// loaded, żeby nie ucinać dynamicznych kluczy nieznanych z góry).
//
// Dane statyczne (imiona, portrety, role, długość Toru Boskości, opisy kart) mieszkają w
// data/*.json (patrz data.js) i NIE są tu duplikowane - stan trzyma tylko to, co się zmienia w
// trakcie kampanii: PIN MG, aktywny etap talii, karty na krzyżu, karty w rękach postaci, atrybuty/
// Rany/Stabilność/Rozwój/Mroczne sekrety (✦)/Komplikacje (✧)/Atuty (☆)/postęp na Torze KAŻDEJ
// postaci (zaseedowane z data/characters.json przy pierwszym uruchomieniu, dalej edytowalne przez
// MG - stąd kopia w stanie, nie odczyt na żywo ze statycznych danych).
//
// Mroczne sekrety to swobodny tekst (narracyjne, unikalne per postać - bez mechaniki). Komplikacje
// to też swobodny tekst, ale ich bazowa nazwa (przed nawiasem z detalem, np. "Prześladowca (Nick
// 2.0)" -> "Prześladowca") zwykle odpowiada wpisowi w data/komplikacje.json - dopasowanie robione w
// panels/character.js#complicationMechanics, nie tutaj. Atuty (☆) to lista ID-ków wprost z
// data/atuty.json (tak jak dotychczas).

export const CROSS_POSITIONS = ["gorna", "dolna", "lewa", "prawa", "srodkowa"];

function seedCharacterState(charDef) {
    return {
        cards: [],
        attrs: { ...charDef.attrs },
        awareness: charDef.awareness || "swiadomy",
        wounds: charDef.wounds ? { serious: [...charDef.wounds.serious], critical: charDef.wounds.critical } : { serious: [false, false, false, false], critical: false },
        stability: typeof charDef.stability === "number" ? charDef.stability : 0,
        development: charDef.development ? [...charDef.development] : [false, false, false, false],
        divinityProgress: 0,
        darkSecrets: charDef.darkSecrets ? [...charDef.darkSecrets] : [],
        complications: charDef.complications ? [...charDef.complications] : [],
        abilities: charDef.abilities ? [...charDef.abilities] : []
    };
}

export function createDefaultState(gameData) {
    const characters = {};
    for (const c of gameData?.characters?.characters ?? []) {
        characters[c.key] = seedCharacterState(c);
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
        handouts: { visible: {}, order: [] }
    };
}

/** Migracja starych kształtów zapisu - na razie brak (pierwsza wersja), zostawione jako punkt
 *  zaczepienia na przyszłość, zgodnie z wzorcem darkgraal3dashboard. */
export function migrateLoadedState(loaded) {
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
