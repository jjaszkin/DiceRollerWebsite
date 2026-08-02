// GLIDE: Part Two — centralny store stanu gry.
// Prosty pub/sub + autosave do Firebase (debounced), żeby każda zmiana z UI
// (rollery, tracker zasobów, questy, dziennik...) zapisywała się automatycznie.

import { watchState, persistState } from "./firebase.js";
import { createDefaultState, mergeWithDefaults } from "./state.js";

let state = null;
let gameData = null;
const listeners = new Set();
let saveTimer = null;
let onSaveStatus = () => {};

const SAVE_DEBOUNCE_MS = 600;

export function onSaveStatusChange(fn) {
    onSaveStatus = fn;
}

/** Inicjalizacja: wczytuje statyczne dane gry + stan z Firebase (albo tworzy domyślny). */
export function initStore(loadedGameData) {
    gameData = loadedGameData;
    return new Promise((resolve) => {
        let resolved = false;
        watchState((remoteState, error) => {
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
                state = remoteState ? mergeWithDefaults(defaults, remoteState) : defaults;
                resolved = true;
                resolve(state);
            } else {
                // Zmiana przyszła z zewnątrz (np. inna karta przeglądarki) — zaktualizuj lokalnie bez re-zapisu.
                const defaults = createDefaultState(gameData);
                state = remoteState ? mergeWithDefaults(defaults, remoteState) : defaults;
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
    state.meta.updatedAt = Date.now();
    notify();
    scheduleSave();
}

function scheduleSave() {
    onSaveStatus("pending");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            onSaveStatus("saving");
            await persistState(state);
            onSaveStatus("saved");
        } catch (err) {
            console.error("[GLIDE] Błąd zapisu do Firebase:", err);
            onSaveStatus("error", err.message);
        }
    }, SAVE_DEBOUNCE_MS);
}
