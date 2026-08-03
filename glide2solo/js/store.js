// GLIDE: Part Two — centralny store stanu gry.
// Prosty pub/sub + autosave do Firebase (debounced), żeby każda zmiana z UI
// (rollery, tracker zasobów, questy, dziennik...) zapisywała się automatycznie.
//
// Store obsługuje kilka równoległych „zapisów” (gier solo) — jeden na postać,
// pod GlidePartTwoSolo/{saveKey} w Firebase. Które imię/zapis jest aktywne, ustala
// się dopiero na ekranie startowym (gate.js), więc initStore() samo w sobie NIE
// łączy się jeszcze z Firebase — robi to connectSave(saveKey), wywoływane raz przy
// starcie (po wybraniu/utworzeniu postaci) i ponownie przy każdym przełączeniu się
// na inną postać („Zmień postać” → inne imię).

import { watchState, persistState } from "./firebase.js";
import { createDefaultState, mergeWithDefaults, migrateLoadedState } from "./state.js";

let state = null;
let gameData = null;
let currentSaveKey = null;
const listeners = new Set();
let saveTimer = null;
let onSaveStatus = () => {};

const SAVE_DEBOUNCE_MS = 600;

export function onSaveStatusChange(fn) {
    onSaveStatus = fn;
}

/** Zapamiętuje wczytane statyczne dane gry (JSON-y z podręcznika). Nie łączy się
 *  jeszcze z Firebase — patrz connectSave(). */
export function initStore(loadedGameData) {
    gameData = loadedGameData;
}

/** Klucz aktualnie podłączonego zapisu (zsanityzowane imię postaci), albo null,
 *  jeśli jeszcze żaden zapis nie został wybrany/utworzony. */
export function getSaveKey() {
    return currentSaveKey;
}

/**
 * (Roz)łącza store z zapisem w Firebase pod GlidePartTwoSolo/{saveKey}. Jeśli był już
 * podłączony inny zapis, jego nasłuch zostaje odłączony (patrz firebase.js#watchState).
 * Zwraca Promise ze stanem tego zapisu — wczytanym z Firebase i scalonym z domyślnym
 * kształtem, albo całkiem domyślnym, jeśli ten zapis jeszcze nie istnieje (nowa postać).
 */
export function connectSave(saveKey) {
    currentSaveKey = saveKey;
    return new Promise((resolve) => {
        let resolved = false;
        watchState(saveKey, (remoteState, error) => {
            if (error) {
                onSaveStatus("error", error.message);
                if (!resolved) {
                    // Brak połączenia z Firebase przy starcie — jedź na domyślnym stanie lokalnie.
                    state = createDefaultState(gameData);
                    resolved = true;
                    resolve(state);
                }
                return;
            }

            if (!resolved) {
                const defaults = createDefaultState(gameData);
                state = remoteState ? mergeWithDefaults(defaults, migrateLoadedState(remoteState)) : defaults;
                resolved = true;
                resolve(state);
            } else {
                // Zmiana przyszła z zewnątrz (np. inna karta przeglądarki) — zaktualizuj lokalnie bez re-zapisu.
                const defaults = createDefaultState(gameData);
                state = remoteState ? mergeWithDefaults(defaults, migrateLoadedState(remoteState)) : defaults;
                notify();
            }
        });
    });
}

export function getState() {
    return state;
}

export function getData() {
    return gameData;
}

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

function notify() {
    for (const fn of listeners) fn(state);
}

/** Odświeża subskrybentów (renderAll) bez dotykania meta.updatedAt ani zapisu do Firebase —
 *  do użycia tuż po connectSave(), żeby dashboard pokazał świeżo wczytany/utworzony zapis. */
export function notifyNow() {
    notify();
}

/**
 * Aktualizuje stan przez funkcję `updater(draftState) -> void` (mutuje bezpośrednio,
 * dla prostoty bez immutability) albo przez podanie gotowego nowego obiektu.
 */
export function updateState(updater) {
    if (typeof updater === "function") {
        updater(state);
    } else {
        state = updater;
    }
    touch();
}

/** Do użycia, gdy state został już zmutowany bezpośrednio (np. przez setPath) —
 *  oznacza zmianę, odświeża UI i planuje zapis, bez ponownego przechodzenia po stanie. */
export function touch() {
    state.meta.updatedAt = Date.now();
    notify();
    scheduleSave();
}

function scheduleSave() {
    // Klucz zapisu w chwili planowania — jeśli w międzyczasie (przed upływem debounce)
    // nastąpi przełączenie na inną postać, ten zapis i tak trafi pod właściwą, starą
    // ścieżkę, a nie pod nowo wybraną.
    const saveKey = currentSaveKey;
    onSaveStatus("pending");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            onSaveStatus("saving");
            await persistState(saveKey, state);
            onSaveStatus("saved");
        } catch (err) {
            console.error("[GLIDE] Błąd zapisu do Firebase:", err);
            onSaveStatus("error", err.message);
        }
    }, SAVE_DEBOUNCE_MS);
}
