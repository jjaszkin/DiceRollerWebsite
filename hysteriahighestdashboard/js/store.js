// Hysteria Highest - Dashboard. Centralny store: pub/sub + autosave (debounced) do Firebase.
// Jedna wspólna kampania pod HysteriaHighestDashboard/ (patrz firebase.js) - wzorzec 1:1 z
// darkgraal3dashboard/js/store.js.

import { watchCampaign, persistCampaign } from "./firebase.js";
import { createDefaultState, mergeWithDefaults, migrateLoadedState } from "./state.js";

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
        watchCampaign((remoteState, error) => {
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
                const defaults = createDefaultState(gameData);
                state = remoteState ? mergeWithDefaults(defaults, migrateLoadedState(remoteState, gameData)) : defaults;
                connected = true;
                resolved = true;
                resolve(state);
            } else {
                if (saveInFlight) return;
                const defaults = createDefaultState(gameData);
                state = remoteState ? mergeWithDefaults(defaults, migrateLoadedState(remoteState, gameData)) : defaults;
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

export function notifyNow() {
    notify();
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
            await persistCampaign(state);
            onSaveStatus("saved");
        } catch (err) {
            console.error("[HysteriaHighest] Błąd zapisu do Firebase:", err);
            onSaveStatus("error", err.message);
        } finally {
            saveInFlight = false;
        }
    }, SAVE_DEBOUNCE_MS);
}
