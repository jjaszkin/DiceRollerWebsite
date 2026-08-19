// GLIDE: Part Two — statyczne dane gry (10 plików JSON wyekstrahowanych z podręcznika + 2 pliki
// własnej treści — npc_flavor.json, ręcznie dobrana pula imion/cech, patrz jego _meta.notes;
// endgame.json, Cechy Spuścizny Żyjącej Legendy i nagrody za wymianę Fame, patrz jego _meta.notes).
// Ładowane raz przy starcie przez fetch (brak bundlera w tym repo — spójnie z resztą projektu).

export const FILES = [
    "mechanics", "companions", "guilds", "economy", "gear",
    "desert", "ruins", "green_space", "unique_locations", "oracles",
    "npc_flavor", "endgame"
];

/** Zwraca obiekt { mechanics, companions, guilds, economy, gear, desert, ruins, green_space, unique_locations, oracles, npc_flavor, endgame } */
export async function loadGameData() {
    const entries = await Promise.all(
        FILES.map(async (name) => {
            const res = await fetch(`data/${name}.json`);
            if (!res.ok) throw new Error(`Nie udało się wczytać data/${name}.json (HTTP ${res.status})`);
            return [name, await res.json()];
        })
    );
    return Object.fromEntries(entries);
}
