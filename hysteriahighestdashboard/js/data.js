// Hysteria Highest - Dashboard. Wczytywanie statycznych danych systemowych z data/*.json.

const FILES = ["cards", "characters", "moves", "atuty", "komplikacje", "handouts"];

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
