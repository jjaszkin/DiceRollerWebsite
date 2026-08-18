// Dark Graal III - Dashboard Solo (MG). Centralny store: pub/sub + autosave (debounced) do
// Firebase. W przeciwieństwie do glide2solo (wiele równoległych zapisów, jeden per postać gracza),
// tu jest JEDEN wspólny stan kampanii pod DarkGraal3dashboard/ (patrz firebase.js) - więc zamiast
// connectSave(saveKey) mamy proste connectCampaign() bez parametru, wywoływane raz przy starcie.

import { watchCampaign, persistCampaign } from "./firebase.js";
import { createDefaultState, mergeWithDefaults, migrateLoadedState } from "./state.js";

let state = null;
let gameData = null;
let connected = false;
const listeners = new Set();
let saveTimer = null;
// Prawdziwe od touch() aż do momentu, gdy persistCampaign() faktycznie dograł do Firebase (czyli
// obejmuje CAŁE okno: debounce + sam zapis sieciowy) - patrz użycie w connectCampaign() niżej.
let saveInFlight = false;
let onSaveStatus = () => {};

const SAVE_DEBOUNCE_MS = 600;

export function onSaveStatusChange(fn) {
    onSaveStatus = fn;
}

/** Zapamiętuje wczytane statyczne dane gry (JSON-y z data/). Nie łączy się jeszcze z Firebase -
 *  patrz connectCampaign(). */
export function initStore(loadedGameData) {
    gameData = loadedGameData;
}

/**
 * Łączy store ze wspólnym stanem kampanii w Firebase pod DarkGraal3dashboard/. Zwraca Promise ze
 * stanem - wczytanym z Firebase i scalonym z domyślnym kształtem, albo całkiem domyślnym (4
 * postacie zaseedowane z data/characters.json), jeśli kampania jeszcze nie istnieje (pierwsze
 * uruchomienie dashboardu). Wywoływane raz z main.js#bootstrap(), PRZED pokazaniem gate'a wyboru
 * roli - w odróżnieniu od glide2solo tu nie trzeba czekać na wybór postaci, żeby wiedzieć, co
 * wczytać (jest tylko jedna wspólna kampania).
 */
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
                state = remoteState ? mergeWithDefaults(defaults, migrateLoadedState(remoteState)) : defaults;
                connected = true;
                resolved = true;
                resolve(state);
            } else {
                // Zmiana przyszła z zewnątrz (inna karta/inny gracz/MG). Jeśli WŁASNA zmiana wciąż
                // czeka na zapis (patrz saveInFlight/scheduleSave), NIE nadpisuj nią lokalnego stanu -
                // ten przychodzący snapshot jest sprzed naszego jeszcze niezapisanego touch() i
                // cofnąłby go (np. auto-przejście playlisty na kolejny utwór po "ended" ginęło w ten
                // sposób, gdy ktokolwiek inny zapisał cokolwiek w tym samym ~600ms oknie). Nasz
                // zaplanowany zapis i tak wkrótce sam odświeży serwer i wróci tu echem.
                if (saveInFlight) return;
                const defaults = createDefaultState(gameData);
                state = remoteState ? mergeWithDefaults(defaults, migrateLoadedState(remoteState)) : defaults;
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

/** Odświeża subskrybentów bez dotykania meta.updatedAt ani zapisu do Firebase. */
export function notifyNow() {
    notify();
}

/** Aktualizuje stan przez funkcję `updater(draftState) -> void` (mutuje bezpośrednio). */
export function updateState(updater) {
    if (typeof updater === "function") {
        updater(state);
    } else {
        state = updater;
    }
    touch();
}

/** Do użycia, gdy state został już zmutowany bezpośrednio - oznacza zmianę, odświeża UI i planuje
 *  zapis, bez ponownego przechodzenia po stanie. */
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
            console.error("[DarkGraal3] Błąd zapisu do Firebase:", err);
            onSaveStatus("error", err.message);
        } finally {
            saveInFlight = false;
        }
    }, SAVE_DEBOUNCE_MS);
}
