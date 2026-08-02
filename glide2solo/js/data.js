// GLIDE: Part Two — statyczne dane gry (10 plików JSON wyekstrahowanych z podręcznika).
// Ładowane raz przy starcie przez fetch (brak bundlera w tym repo — spójnie z resztą projektu).

const FILES = [
    "mechanics", "companions", "guilds", "economy", "gear",
    "desert", "ruins", "green_space", "unique_locations", "oracles"
];

/** Zwraca obiekt { mechanics, companions, guilds, economy, gear, desert, ruins, green_space, unique_locations, oracles } */
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
