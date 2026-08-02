// GLIDE: Part Two — Firebase wiring
// Ten sam projekt Firebase co reszta DiceRollerWebsite (Realtime Database),
// ale własna ścieżka `GlidePartTwoSolo`, żeby nie mieszać się z innymi kampaniami.
// To gra solo — jeden zapis, jedna postać, cały stan gry jako pojedynczy obiekt.

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

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export const DB_PATH = "GlidePartTwoSolo";

/**
 * Subskrybuje stan gry pod DB_PATH. Callback woła się od razu po podłączeniu
 * (z `null`, jeśli w bazie jeszcze nic nie ma) i przy każdej zmianie z zewnątrz.
 */
export function watchState(callback) {
    onValue(
        ref(database, DB_PATH),
        (snapshot) => callback(snapshot.exists() ? snapshot.val() : null, null),
        (error) => callback(null, error)
    );
}

/** Zapisuje cały obiekt stanu gry (nadpisuje całość pod DB_PATH). */
export function persistState(state) {
    return set(ref(database, DB_PATH), state);
}
