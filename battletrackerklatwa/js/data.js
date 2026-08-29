// Battle Tracker - Klątwa Strahda. Statyczne dane startowe (katalog BG + bestiariusz), wczytywane
// raz przy starcie i używane WYŁĄCZNIE jako seed pierwszego uruchomienia (patrz state.js).

export async function loadGameData() {
    const [party, monsters] = await Promise.all([
        fetch("data/party.json").then((res) => {
            if (!res.ok) throw new Error(`Nie udało się wczytać data/party.json (HTTP ${res.status})`);
            return res.json();
        }),
        fetch("data/monsters.json").then((res) => {
            if (!res.ok) throw new Error(`Nie udało się wczytać data/monsters.json (HTTP ${res.status})`);
            return res.json();
        })
    ]);
    return { party, monsters };
}
