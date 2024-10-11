
    // Import the functions you need from the SDKs you need
    import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
    // TODO: Add SDKs for Firebase products that you want to use
    // https://firebase.google.com/docs/web/setup#available-libraries
  
    // Your web app's Firebase configuration
    const firebaseConfig = {
      apiKey: "AIzaSyD7PRIk5KhfY-sMda_-w1V5XW2n0yexpMo",
      authDomain: "dicerollerwebsite.firebaseapp.com",
      projectId: "dicerollerwebsite",
      databaseURL: " https://dicerollerwebsite-default-rtdb.europe-west1.firebasedatabase.app/", // Dodaj tę linię
      storageBucket: "dicerollerwebsite.appspot.com",
      messagingSenderId: "117039589628",
      appId: "1:117039589628:web:1fc0ffa255db93a878cf79"
    };
  
    // Initialize Firebase     const app = initializeApp(firebaseConfig);


// Get a reference to the database service const database = getDatabase(app);

console.log("Inicjalizuję Firebase...");
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();
console.log("Firebase zainicjowany:", app);

    // Funkcja do testowania zapisu i odczytu z Firebase
function testFirebase() {
    const testRef = database.ref('test');

    // Zapisywanie testowej wartości
    testRef.set({ message: "Firebase działa!" })
        .then(() => {
            console.log("Dane zapisane pomyślnie!");
            return testRef.once('value');
        })
        .then((snapshot) => {
            console.log("Odczytano dane z Firebase:", snapshot.val());
        })
        .catch((error) => {
            console.error("Błąd:", error);
        });
}

// Wywołaj funkcję testFirebase po załadowaniu strony
window.onload = testFirebase;

// Funkcja do załadowania historii rzutów z Firebase
function loadRollHistory() {
    const rollHistoryList = document.getElementById('rollHistory');
    rollHistoryList.innerHTML = '';

    database.ref('rolls').on('value', (snapshot) => {
        snapshot.forEach((childSnapshot) => {
            const entry = childSnapshot.val();
            const historyEntry = document.createElement('li');
            historyEntry.textContent = entry;
            rollHistoryList.appendChild(historyEntry);
        });
    });
}

// Funkcja do zapisania historii rzutów w Firebase
function saveRollHistory(entry) {
    const newRollRef = database.ref('rolls').push();
    newRollRef.set(entry);
}

// Funkcja do rzucania kostkami
document.getElementById('rollButton').addEventListener('click', function() {
    const characterName = document.getElementById('characterName').value;
    const diceType = parseInt(document.getElementById('diceType').value);
    const diceQuantity = parseInt(document.getElementById('diceQuantity').value);
    const modifier = parseInt(document.getElementById('modifier').value) || 0;

    let results = [];
    let total = 0;

    for (let i = 0; i < diceQuantity; i++) {
        const roll = Math.floor(Math.random() * diceType) + 1;
        results.push(roll);
        total += roll;
    }

    total += modifier;

    // Wyświetlenie wyników
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `<strong>${characterName}</strong>: ${results.join(', ')} | Suma: ${total}`;

    // Dodanie do historii rzutów
    const rollHistoryEntry = `${characterName} rzucił(a): ${results.join(', ')} (Suma: ${total})`;
    saveRollHistory(rollHistoryEntry);
});

// Załaduj historię rzutów przy ładowaniu strony
loadRollHistory();