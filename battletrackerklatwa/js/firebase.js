// Battle Tracker - Klątwa Strahda. Firebase wiring, ten sam projekt co reszta
// DiceRollerWebsite (Realtime Database), własna gałąź battletrackerKlatwa.

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
    getDatabase, ref, set, onValue
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyD7PRIk5KhfY-sMda_-w1V5XW2n0yexpMo",
    authDomain: "dicerollerwebsite.firebaseapp.com",
    projectId: "dicerollerwebsite",
    databaseURL: "https://dicerollerwebsite-default-rtdb.europe-west1.firebasedatabase.app/",
    storageBucket: "dicerollerwebsite.appspot.com",
    messagingSenderId: "117039589628",
    appId: "1:117039589628:web:1fc0ffa255db93a878cf79"
};

const app = initializeApp(firebaseConfig, "battletrackerklatwa");
const database = getDatabase(app);

export const DB_ROOT = "battletrackerKlatwa";

let detachCurrent = null;

/** Subskrybuje wspólny stan trackera pod battletrackerKlatwa/. Callback woła się od razu po
 *  podłączeniu (z `null`, jeśli węzeł jeszcze nie istnieje - pierwsze uruchomienie) i przy
 *  każdej zmianie z zewnątrz. */
export function watchState(callback) {
    if (detachCurrent) {
        detachCurrent();
        detachCurrent = null;
    }
    detachCurrent = onValue(
        ref(database, DB_ROOT),
        (snapshot) => callback(snapshot.exists() ? snapshot.val() : null, null),
        (error) => callback(null, error)
    );
    return detachCurrent;
}

/** Zapisuje cały obiekt stanu (nadpisuje całość pod battletrackerKlatwa/). */
export function persistState(state) {
    return set(ref(database, DB_ROOT), state);
}
