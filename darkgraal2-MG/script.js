import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, push, set, onValue } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js"; // Dodaj getDatabase

// Konfiguracja Firebase
const firebaseConfig = {
    apiKey: "AIzaSyD7PRIk5KhfY-sMda_-w1V5XW2n0yexpMo",
    authDomain: "dicerollerwebsite.firebaseapp.com",
    projectId: "dicerollerwebsite",
    databaseURL: "https://dicerollerwebsite-default-rtdb.europe-west1.firebasedatabase.app/",
    storageBucket: "dicerollerwebsite.appspot.com",
    messagingSenderId: "117039589628",
    appId: "1:117039589628:web:1fc0ffa255db93a878cf79"
};

// Inicjalizacja Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);


// Funkcja do załadowania pełnej historii rzutów z Firebase w odwrotnej kolejności
function loadRollHistory() {
    const rollHistoryList = document.getElementById('rollHistory');

    // Odwołanie do bazy danych, aby pobrać wszystkie rzuty
    const rollRef = ref(database, 'rollsDarkGraal2');
    onValue(rollRef, (snapshot) => {
        rollHistoryList.innerHTML = ''; // Wyczyść listę historii

        // Przejście przez wszystkie wpisy w bazie
        const rolls = [];
        snapshot.forEach((childSnapshot) => {
            rolls.push(childSnapshot.val()); // Zapisz każdy rzut do tablicy
        });

        // Wyświetlenie rzutów w odwrotnej kolejności
        rolls.reverse().forEach((entry) => {
            const historyEntry = document.createElement('li');
            historyEntry.textContent = entry;
            rollHistoryList.appendChild(historyEntry); // Dodaj na górze listy
        });
    });
}




// Funkcja do zapisania rzutu w Firebase
function saveRollHistory(entry) {
    const newRollRef = push(ref(database, 'rollsDarkGraal2'));
    set(newRollRef, entry);
}

// Funkcja do rzucania kostkami
document.getElementById('rollButton').addEventListener('click', function() {
    const characterName = document.getElementById('characterName').value;
    const diceType = parseInt(document.getElementById('diceType').value);
    const diceQuantity = parseInt(document.getElementById('diceQuantity').value);
    const modifier = parseInt(document.getElementById('modifier').value) || 0; // Modyfikator
    const attribute = parseInt(document.getElementById('attribute').value) || 0; // Atrybut

    // Zapisz imię do LocalStorage
    if (characterName) {
        localStorage.setItem('characterName', characterName);
    }

    let results = [];
    let total = 0;

    for (let i = 0; i < diceQuantity; i++) {
        const roll = Math.floor(Math.random() * diceType) + 1;
        results.push(roll);
        total += roll;
    }

    total += modifier; // Dodaj modyfikator
    total += attribute; // Dodaj atrybut

 // Wyświetlenie wyników
 const resultsDiv = document.getElementById('results');
 resultsDiv.innerHTML = `
     <strong>${characterName}</strong>: <br> 
     Wyniki na kostkach: ${results.join(', ')} <br> 
     Modyfikator: ${modifier} <br> 
     Atrybut: ${attribute} <br> 
     Suma rzutu: ${total}
 `;

 // Dodanie do historii rzutów
 const rollHistoryEntry = `
     ${characterName} rzucił(a): ${results.join(', ')} 
     (Modyfikator: ${modifier}, Atrybut: ${attribute}, Suma: ${total})
 `;
 saveRollHistory(rollHistoryEntry);
});


window.onload = function() {
    // Pobierz imię z LocalStorage
    const savedName = localStorage.getItem('characterName');
    
    // Jeśli imię istnieje, uzupełnij pole
    if (savedName) {
        document.getElementById('characterName').value = savedName;
    }

    // Załaduj historię rzutów przy ładowaniu strony
    loadRollHistory();
    
};




//resizowanie lewego panelu
const resizer = document.querySelector('.resizer');
const leftPanel = document.querySelector('.dice-panel');
const rightPanel = document.querySelector('.figma-embed');

let isResizing = false;

resizer.addEventListener('mousedown', function (e) {
    isResizing = true;
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', stopResize);
});

function resize(e) {
    if (!isResizing) return;

    // Obliczamy szerokość lewego panelu
    const newLeftWidth = e.clientX - leftPanel.getBoundingClientRect().left;
    const containerWidth = leftPanel.parentElement.offsetWidth;

    // Przeliczamy szerokość lewego panelu na procenty
    const leftPanelPercentage = (newLeftWidth / containerWidth) * 100;

    // Upewniamy się, że panele nie są za wąskie lub za szerokie
    if (leftPanelPercentage > 10 && leftPanelPercentage < 90) {
        leftPanel.style.width = leftPanelPercentage + '%';
        rightPanel.style.width = (100 - leftPanelPercentage) + '%';
    }
}

function stopResize() {
    isResizing = false;
    document.removeEventListener('mousemove', resize);
    document.removeEventListener('mouseup', stopResize);
}



