// GLIDE: Part Two — Firebase wiring
// Ten sam projekt Firebase co reszta DiceRollerWebsite (Realtime Database),
// ale własna gałąź `GlidePartTwoSolo`, żeby nie mieszać się z innymi kampaniami.
// Pod nią, żeby trzymać kilka równoległych gier solo obok siebie, każda postać
// (identyfikowana przez zsanityzowane imię z ekranu startowego) ma swój własny
// węzeł: GlidePartTwoSolo/{saveKey}. Reguły .read/.write ustawione na węźle
// GlidePartTwoSolo obejmują też wszystkie jego dzieci, więc nie trzeba nic
// zmieniać w konsoli Firebase, żeby to zadziałało.

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

export const DB_ROOT = "GlidePartTwoSolo";

function pathFor(saveKey) {
    return `${DB_ROOT}/${saveKey}`;
}

// Odłącznik nasłuchu poprzedniego zapisu — trzymany na module, żeby przy przełączeniu
// się na inną postać (inny saveKey) nie zostać podpiętym pod dwie ścieżki naraz.
let detachCurrent = null;

/**
 * Subskrybuje stan gry pod GlidePartTwoSolo/{saveKey}. Callback woła się od razu po
 * podłączeniu (z `null`, jeśli ten zapis jeszcze nie istnieje — nowa postać) i przy
 * każdej zmianie z zewnątrz. Jeśli był już podłączony nasłuch pod innym saveKey,
 * zostaje najpierw odłączony.
 */
export function watchState(saveKey, callback) {
    if (detachCurrent) {
        detachCurrent();
        detachCurrent = null;
    }
    detachCurrent = onValue(
        ref(database, pathFor(saveKey)),
        (snapshot) => callback(snapshot.exists() ? snapshot.val() : null, null),
        (error) => callback(null, error)
    );
    return detachCurrent;
}

/** Zapisuje cały obiekt stanu gry (nadpisuje całość pod GlidePartTwoSolo/{saveKey}). */
export function persistState(saveKey, state) {
    return set(ref(database, pathFor(saveKey)), state);
}
