// Battle Tracker - Klątwa Strahda. Centralny store: pub/sub + autosave (debounced) do Firebase.
// Jeden wspólny węzeł battletrackerKlatwa/ (patrz firebase.js), więc podłączamy się raz przy
// starcie (connect()), bez wyboru zapisu/roli - wzorowane na darkgraal3dashboard/js/store.js.

import { watchState, persistState } from "./firebase.js";
import { createDefaultState, mergeWithDefaults, migrateLoadedState } from "./state.js";
import { sanitizeForFirebase } from "./utils.js";

let state = null;
let gameData = null;
let connected = false;
const listeners = new Set();
let saveTimer = null;
let saveInFlight = false;
let onSaveStatus = () => {};

const SAVE_DEBOUNCE_MS = 600;

export function onSaveStatusChange(fn) {
    onSaveStatus = fn;
}

export function initStore(loadedGameData) {
    gameData = loadedGameData;
}

export function connectCampaign() {
    return new Promise((resolve) => {
        let resolved = false;
        watchState((remoteState, error) => {
            if (error) {
                onSaveStatus("error", error.message);
                if (!resolved) {
                    state = createDefaultState(gameData);
                    connected = true;
                    resolved = true;
                    resolve(state);
                }
                return;
            }

            if (!resolved) {
                if (remoteState) {
                    state = mergeWithDefaults(createDefaultState(gameData), migrateLoadedState(remoteState));
                } else {
                    state = createDefaultState(gameData);
                }
                connected = true;
                resolved = true;
                resolve(state);
            } else {
                // Zmiana z zewnątrz (inna karta/przeglądarka). Jeśli WŁASNA zmiana czeka jeszcze na
                // zapis, nie nadpisuj jej tym przychodzącym (sprzed naszego touch()) snapshotem - patrz
                // darkgraal3dashboard/js/store.js dla pełnego uzasadnienia tego samego wzorca.
                if (saveInFlight) return;
                state = remoteState
                    ? mergeWithDefaults(createDefaultState(gameData), migrateLoadedState(remoteState))
                    : createDefaultState(gameData);
                notify();
            }
        });
    });
}

export function isConnected() {
    return connected;
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

export function updateState(updater) {
    if (typeof updater === "function") {
        updater(state);
    } else {
        state = updater;
    }
    touch();
}

export function touch() {
    state.meta.updatedAt = Date.now();
    notify();
    scheduleSave();
}

function scheduleSave() {
    onSaveStatus("pending");
    saveInFlight = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        try {
            onSaveStatus("saving");
            await persistState(sanitizeForFirebase(state));
            onSaveStatus("saved");
        } catch (err) {
            console.error("[BattleTrackerKlatwa] Błąd zapisu do Firebase:", err);
            onSaveStatus("error", err.message);
        } finally {
            saveInFlight = false;
        }
    }, SAVE_DEBOUNCE_MS);
}
