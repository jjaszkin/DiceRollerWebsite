// Dark Graal III - Dashboard Solo (MG). Firebase wiring.
// Ten sam projekt Firebase co reszta DiceRollerWebsite (Realtime Database), własna gałąź
// `DarkGraal3dashboard`. W przeciwieństwie do GLIDE (jeden zapis na postać gracza), tu jest
// JEDNA wspólna kampania używana przez MG i wszystkich graczy naraz - więc tylko JEDEN węzeł
// pod DarkGraal3dashboard (nie ma osobnych saveKey per postać). Reguły .read/.write ustawione
// na węźle DarkGraal3dashboard obejmują też jego dzieci, więc nie trzeba nic zmieniać w konsoli
// Firebase, żeby to zadziałało.

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

export const DB_ROOT = "DarkGraal3dashboard";

// Odłącznik aktualnego nasłuchu - trzymany na module, na wypadek gdyby watchCampaign() zostało
// wywołane więcej niż raz (np. hot-reload w dev) - żeby nie zostać podpiętym dwukrotnie.
let detachCurrent = null;

/**
 * Subskrybuje wspólny stan kampanii pod DarkGraal3dashboard/. Callback woła się od razu po
 * podłączeniu (z `null`, jeśli kampania jeszcze nie istnieje - pierwsze uruchomienie) i przy
 * każdej zmianie z zewnątrz (np. inna karta przeglądarki, inny gracz, MG).
 */
export function watchCampaign(callback) {
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

/** Zapisuje cały obiekt stanu kampanii (nadpisuje całość pod DarkGraal3dashboard/). */
export function persistCampaign(state) {
    return set(ref(database, DB_ROOT), state);
}
