// Dark Graal III - Dashboard Solo (MG). Statyczne dane systemowe, wczytywane raz przy starcie.
// (Nazwa "Solo" w duchu wzorca glide2solo - w praktyce to dashboard dla MG + graczy przy wspólnej
// kampanii, patrz BRIEFING.md.)

const FILES = ["archetypes", "characters", "transformations", "items", "soundboard", "handouts"];

/** Zwraca obiekt { archetypes, characters, transformations, items, soundboard, handouts }.
 *  `soundboard` to manifest Soundboardu (shared/soundboard/) wygenerowany z music/ i sounds/,
 *  `handouts` to katalog Handoutów (shared/handouts/) wygenerowany z handouts/ - patrz
 *  odpowiedni generate-manifest.js w każdym z tych folderów. */
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
