// Terminy - wspólny moduł (DiceRollerWebsite/shared/scheduler/). Logika stanu dostępności -
// czyste funkcje operujące WYŁĄCZNIE na tym, co dostają jawnie w `ctx` (ten sam kontrakt co
// shared/handouts/control-panel.js): `ctx.state.scheduler.availability` i `ctx.updateState(fn)`
// (patrz store.js#updateState) - ten moduł nie zna Firebase ani konkretnego kształtu reszty stanu
// projektu. `participantKey` jest CAŁKOWICIE dowolny dla tego modułu - to projekt wpinający decyduje,
// czy to klucz postaci, imię gracza, czy cokolwiek innego (patrz panels/terminy.js i panels/mg.js
// w darkgraal3dashboard dla konkretnego mapowania).

function ensureSchedulerState(state) {
    if (!state.scheduler) state.scheduler = { availability: {} };
    if (!state.scheduler.availability) state.scheduler.availability = {};
    return state.scheduler;
}

/** Trzy stany w kółko: brak wpisu -> "yes" (mogę) -> "maybe" (być może) -> brak wpisu. */
function nextStatus(current) {
    if (current === "yes") return "maybe";
    if (current === "maybe") return null;
    return "yes";
}

/** Odczytuje status jednego uczestnika na jeden dzień, `null` jeśli nie zaznaczył (domyślny/nieznany). */
export function statusFor(state, participantKey, dateIso) {
    return state?.scheduler?.availability?.[participantKey]?.[dateIso] || null;
}

/** Klik w komórkę kalendarza - przesuwa status DANEGO uczestnika na DANY dzień o jeden krok w
 *  cyklu (patrz nextStatus). Usuwa klucz z Firebase całkowicie przy powrocie do stanu domyślnego,
 *  zamiast zapisywać jawne "no"/null - zgodnie z decyzją usera, żeby przechowywać tylko "mogę"/
 *  "być może". */
export function cycleAvailability(ctx, participantKey, dateIso) {
    const { updateState } = ctx;
    updateState((state) => {
        const scheduler = ensureSchedulerState(state);
        const own = scheduler.availability[participantKey] || (scheduler.availability[participantKey] = {});
        const next = nextStatus(own[dateIso] || null);
        if (next) own[dateIso] = next;
        else delete own[dateIso];
    });
}

/** Zbiera, kto (z listy `participants` = [{key, label}]) zaznaczył "mogę"/"być może" na dany dzień.
 *  Zwraca { yes: [{key,label}], maybe: [{key,label}] } - listy uczestników, nie same liczby, żeby
 *  wywołujący (control-panel.js) mógł pokazać zarówno liczbę, jak i imiona. */
export function aggregateForDate(state, participants, dateIso) {
    const yes = [];
    const maybe = [];
    for (const p of participants) {
        const status = statusFor(state, p.key, dateIso);
        if (status === "yes") yes.push(p);
        else if (status === "maybe") maybe.push(p);
    }
    return { yes, maybe };
}
