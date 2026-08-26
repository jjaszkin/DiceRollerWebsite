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
// Mroczne sekrety (✦) i Komplikacje (✧) to listy { label, active } - "active: false" = wygaszone
// na karcie (jeszcze nie odkryte/wyzwolone w fabule, patrz Figma node 895-298), nieklikalne, bez
// rzutu. Bazowa nazwa Komplikacji (przed nawiasem z detalem, np. "Prześladowca (Nick 2.0)" ->
// "Prześladowca") odpowiada wpisowi w data/komplikacje.json - dopasowanie w panels/character.js.
// Atuty (☆) to lista ID-ków wprost z data/atuty.json. Rozwój ma różną długość per rola - patrz
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
        abilities: charDef.abilities ? [...charDef.abilities] : [],
        // Punkty Wpływu MG per Atut (kluczowane id-kiem z data/atuty.json) - Komplikacje trzymają
        // swój licznik wprost na obiekcie (complications[i].influence), patrz panels/mg.js#buildInfluenceTab.
        abilityInfluence: {},
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
