// Hysteria Highest - Dashboard. Firebase wiring, wzorzec 1:1 z darkgraal3dashboard/js/firebase.js:
// jedna wspólna kampania (MG + wszyscy gracze naraz), jeden węzeł HysteriaHighestDashboard w tej
// samej współdzielonej instancji RTDB co reszta DiceRollerWebsite. Reguły .read/.write na węźle
// obejmują dzieci, więc nie trzeba nic zmieniać w konsoli Firebase.

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

const app = initializeApp(firebaseConfig, "hysteria-highest-dashboard");
const database = getDatabase(app);

export const DB_ROOT = "HysteriaHighestDashboard";

let detachCurrent = null;

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

export function persistCampaign(state) {
    return set(ref(database, DB_ROOT), state);
}
