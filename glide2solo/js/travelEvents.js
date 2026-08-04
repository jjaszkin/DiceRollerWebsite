// GLIDE: Part Two — automatyczne stosowanie mechanicznych efektów Wydarzeń Podróży
// (data/economy.json#travel_events_table_d100) do stanu gry. Każdy wpis tej tabeli ma tylko
// pole `text` (narracja + efekt mechaniczny w nawiasie na samym końcu) — efekt NIE jest
// ustrukturyzowany w JSON-ie, więc rozpoznajemy go wzorcami regex nad zawartością końcowego
// nawiasu. Efekty jednoznaczne (proste delty zasobów, Zużycie na Gliderze, "Następny Ruch
// kosztuje 0 Zasoby", -d10x10 Kredyty) stosujemy automatycznie i logujemy. Efekty wymagające
// decyzji gracza (Handel, wybór Gildii do Więzi, konkretny przedmiot Sprzętu, wartości "X" do
// wyboru, tymczasowe modyfikatory Prędkości "przy następnym Ruchu") zostają nierozpoznane —
// wracają jako `manual`, do ręcznego zastosowania przez gracza (patrz UI w panels/map.js i
// panels/roller.js, które renderują listy `applied`/`manual`).
//
// Współdzielone przez panels/map.js#rollMapTravelEvent (automatyczny rzut po przesunięciu
// postaci) i panels/roller.js#rollTravelEvent (ręczny rzut z zakładki Roller) — obie ścieżki
// czytają tę samą tabelę i powinny stosować efekty identycznie.
import { clamp, rollDie, escapeHtml } from "./utils.js";
import { logEvent } from "./eventLog.js";

// Zasoby postaci/glidera trzymane jako { cur, max } — clamp do [0, max].
const RESOURCE_FIELDS = {
    "Rozpęd": state => state.character.resources.momentum,
    "Wytrzymałość": state => state.character.resources.stamina,
    "Informacje": state => state.character.resources.intel,
    "Zasoby": state => state.character.glider.supply,
    "Złom": state => state.character.glider.scrap,
    "Relikt": state => state.character.glider.relics
};

// Zasoby postaci trzymane jako proste liczby, bez górnego limitu — tak samo jak
// panels/character.js#numberInputRow/counterRow (domyślnie min=0, bez max) dla Kredytów/Sławy.
const PLAIN_FIELDS = {
    "Kredyty": "credits",
    "Sława": "fame"
};

/** Zamienia dopasowany fragment `match` (wynik regex.exec) na spacje o tej samej długości —
 *  "usuwa" go z tekstu roboczego bez przesuwania indeksów pozostałych znaków, żeby dalsze
 *  wzorce mogły bezpiecznie przeszukiwać ten sam string od nowa. */
function blank(text, match) {
    return text.slice(0, match.index) + " ".repeat(match[0].length) + text.slice(match.index + match[0].length);
}

/** Sprząta to, co zostało z tekstu efektu po wycięciu rozpoznanych fragmentów — zbędne spacje,
 *  wiodące/końcowe przecinki i osierocone spójniki "i" (np. po "Zaznacz 1 Zużycie na Sprzęt i
 *  1 Zużycie na Glider", gdy druga część zostanie rozpoznana automatycznie). */
function cleanupLeftover(text) {
    let out = text.replace(/\s+/g, " ").trim();
    out = out.replace(/^[,;]+\s*/, "").replace(/\s*[,;]+$/, "");
    out = out.replace(/^i\s+/i, "").replace(/\s+i$/i, "");
    return out.trim();
}

/** Stosuje rozpoznane efekty mechaniczne Wydarzenia Podróży (`text` — pełen tekst wpisu z
 *  travel_events_table_d100, np. "Ogromna pustynna bestia Cię ściga (-1 Wytrzymałość)")
 *  bezpośrednio do `state`: mutuje zasoby postaci/glidera, Kredyty, oraz flagę
 *  `state.map.nextMoveFreeSupply`. Każdy zastosowany efekt jest logowany przez logEvent
 *  (typ "travel-event"). Zwraca { applied: string[], manual: string[] } — `applied` to czytelne
 *  opisy tego, co faktycznie zmieniło stan; `manual` to nierozpoznany fragment(y) tekstu
 *  wymagające ręcznej decyzji gracza. Wywołujący odpowiada za touch() po swojej stronie (tak
 *  samo jak przy logEvent) — patrz panels/map.js#rollMapTravelEvent, panels/roller.js#rollTravelEvent. */
export function applyTravelEventEffects(state, text) {
    const applied = [];

    // Efekt mechaniczny jest zawsze w nawiasie na samym końcu tekstu wpisu (potwierdzone
    // ręcznym przeglądem wszystkich wpisów travel_events_table_d100) — parsujemy tylko tę
    // część, żeby nie ryzykować fałszywych trafień w tekście narracyjnym.
    const bracket = text.match(/\(([^()]+)\)\s*$/);
    if (!bracket) {
        return { applied, manual: [] };
    }
    let working = bracket[1];

    // 1) "Następny Ruch kosztuje 0 Zasoby" — ustawia jednorazową flagę konsumowaną przy
    //    najbliższym ruchu (patrz panels/map.js#moveHere).
    {
        const re = /Następny Ruch kosztuje 0 Zasoby/;
        const m = re.exec(working);
        if (m) {
            state.map.nextMoveFreeSupply = true;
            applied.push("Następny Ruch będzie kosztować 0 Zasoby.");
            working = blank(working, m);
        }
    }

    // 2) "-d10x10 Kredyty" — rzut d10, wynik razy 10 odjęty od Kredytów.
    {
        const re = /-d10x10 Kredyty/;
        const m = re.exec(working);
        if (m) {
            const roll = rollDie(10);
            const delta = roll * 10;
            const before = state.character.resources.credits;
            state.character.resources.credits = clamp(before - delta, 0, null);
            applied.push(`Kredyty: ${before} → ${state.character.resources.credits} (d10=${roll} × 10 = -${delta})`);
            working = blank(working, m);
        }
    }

    // 3) "Przywróć N Zużycie na Glider" — zmniejsza Zużycie (naprawa). Musi być rozpoznane
    //    PRZED ogólnym wzorcem "N Zużycie na Glider" (punkt 4), bo inaczej ten drugi
    //    dopasowałby tę samą liczbę z odwrotnym znaczeniem (zaznaczenie zamiast naprawy).
    {
        const re = /Przywróć (\d+) Zużycie na Glider/g;
        let m;
        while ((m = re.exec(working))) {
            const n = parseInt(m[1], 10);
            const wear = state.character.glider.wear;
            const before = wear.cur;
            wear.cur = clamp(wear.cur - n, 0, wear.max);
            applied.push(`Zużycie na Gliderze: ${before} → ${wear.cur} (przywrócono ${n})`);
            working = blank(working, m);
            re.lastIndex = 0;
        }
    }

    // 4) "N Zużycie na Glider" (domyślnie = "Zaznacz") — zwiększa Zużycie. "Zaznacz " jest
    //    dopasowywane opcjonalnie (i wycinane razem z liczbą, gdy bezpośrednio sąsiaduje) —
    //    w zwykłych wpisach ("Zaznacz 1 Zużycie na Glider") usuwa to czasownik z leftovera; w
    //    jednym złożonym wpisie (41-42, "Zaznacz 1 Zużycie na Sprzęt i 1 Zużycie na Glider")
    //    "Zaznacz" NIE sąsiaduje bezpośrednio z "1 Zużycie na Glider", więc pozostaje
    //    (poprawnie) częścią nierozpoznanej klauzuli "Zaznacz 1 Zużycie na Sprzęt" w `manual`.
    {
        const re = /(?:Zaznacz\s+)?(\d+)\s*Zużycie na Glider/g;
        let m;
        while ((m = re.exec(working))) {
            const n = parseInt(m[1], 10);
            const wear = state.character.glider.wear;
            const before = wear.cur;
            wear.cur = clamp(wear.cur + n, 0, wear.max);
            applied.push(`Zużycie na Gliderze: ${before} → ${wear.cur} (zaznaczono ${n})`);
            working = blank(working, m);
            re.lastIndex = 0;
        }
    }

    // 5) Proste delty zasobów: "+N"/"-N" + nazwa zasobu (Rozpęd/Wytrzymałość/Informacje/
    //    Zasoby/Złom/Relikt/Kredyty/Sława). Wymaganie znaku +/- bezpośrednio przed liczbą
    //    celowo wyklucza wpisy typu "do 200 Kredyty łącznie" czy "-X Zasoby" (X to litera, nie
    //    cyfra) — te zostają nierozpoznane i trafiają do `manual`.
    {
        const re = /([+-]\d+)\s+(Rozpęd|Wytrzymałość|Informacje|Zasoby|Złom|Relikt|Kredyty|Sława)/g;
        let m;
        while ((m = re.exec(working))) {
            const delta = parseInt(m[1], 10);
            const name = m[2];
            if (RESOURCE_FIELDS[name]) {
                const res = RESOURCE_FIELDS[name](state);
                const before = res.cur;
                res.cur = clamp(res.cur + delta, 0, res.max);
                applied.push(`${name}: ${before} → ${res.cur} (${m[1]})`);
            } else if (PLAIN_FIELDS[name]) {
                const key = PLAIN_FIELDS[name];
                const before = state.character.resources[key];
                state.character.resources[key] = clamp(before + delta, 0, null);
                applied.push(`${name}: ${before} → ${state.character.resources[key]} (${m[1]})`);
            }
            working = blank(working, m);
            re.lastIndex = 0;
        }
    }

    const leftover = cleanupLeftover(working);
    const manual = leftover ? [leftover] : [];

    if (applied.length) {
        logEvent(state, "travel-event", `Wydarzenie Podróży — automatycznie zastosowano: ${applied.join("; ")}.`);
    }
    if (manual.length) {
        logEvent(state, "travel-event", `Wydarzenie Podróży — wymaga ręcznej decyzji: ${manual.join("; ")}.`);
    }

    return { applied, manual };
}

/** Renderuje wynik applyTravelEventEffects — osobno listę tego, co zostało zastosowane
 *  automatycznie, i tego, co gracz musi rozstrzygnąć sam (Handel, wybór Gildii, konkretny
 *  Sprzęt, wartości "X" itd.). Współdzielone przez baner Wydarzenia Podróży na mapie
 *  (panels/map.js#renderTravelEventBanner) i kartę "Wydarzenie Podróży" na zakładce Roller
 *  (panels/roller.js) — trzyma się tu, w module bez zależności od panels/*, żeby uniknąć
 *  cyklu importów (panels/map.js importuje z panels/roller.js, więc panels/roller.js nie może
 *  importować z powrotem z panels/map.js). */
export function renderTravelEventEffects(effects) {
    if (!effects || (!effects.applied.length && !effects.manual.length)) return "";
    return `
        <div class="entry" style="margin-top:6px;">
            ${effects.applied.length ? `
                <p><strong>Zastosowano automatycznie:</strong></p>
                <ul>${effects.applied.map(a => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
            ` : ""}
            ${effects.manual.length ? `
                <p class="placeholder"><strong>Wymaga ręcznej decyzji:</strong></p>
                <ul>${effects.manual.map(m => `<li class="placeholder">${escapeHtml(m)}</li>`).join("")}</ul>
            ` : ""}
        </div>
    `;
}
