// GLIDE: Part Two — "most" Ścieżki A "Nowa Twarz" (patrz endgame.js#confirmPathA). store.js
// obsługuje tylko jeden podłączony zapis naraz, a w momencie decyzji nowa postać jeszcze nie
// istnieje (dostanie zapis dopiero po wpisaniu imienia na ekranie startowym) — więc wybraną
// Cechę Spuścizny przekazujemy między dwoma niezależnymi zapisami przez localStorage zamiast
// przez store. Wydzielone do osobnego, "neutralnego" modułu (zamiast trzymać wprost w
// endgame.js) właśnie po to, żeby uniknąć cyklicznego importu: endgame.js importuje showGate
// z gate.js, a gate.js z kolei musi umieć odczytać/skonsumować most — gdyby obie strony
// importowały się nawzajem, powstałby cykl. Zamiast tego obie importują stąd.
const KEY = "glide2solo:pendingBridge";

/** Zapisuje most (patrz endgame.js#confirmPathA za kształt obiektu) do localStorage. */
export function writePendingBridge(bridge) {
    localStorage.setItem(KEY, JSON.stringify(bridge));
}

/** Odczyt BEZ konsumpcji — do wyświetlenia adnotacji "Nowa Twarz" w gate.js (patrz showGate),
 *  zanim faktycznie dojdzie do zastosowania efektu (dopiero przy submitBtn/consumePendingBridge). */
export function peekPendingBridge() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.error("[GLIDE] Nie udało się odczytać mostu Nowej Twarzy z localStorage:", err);
        return null;
    }
}

/** Odczytuje i USUWA most z localStorage (jednorazowa konsumpcja, żeby nie zaaplikować go
 *  drugi raz przy kolejnym, niepowiązanym użyciu ekranu startowego) — zwraca obiekt mostu
 *  albo null, jeśli nic nie czeka na zastosowanie. */
export function consumePendingBridge() {
    const bridge = peekPendingBridge();
    if (bridge) localStorage.removeItem(KEY);
    return bridge;
}
