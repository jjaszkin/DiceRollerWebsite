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
    const rollHistory = document.getElementById('rollHistory');
    const historyEntry = document.createElement('li');
    historyEntry.textContent = `${characterName} rzucił(a): ${results.join(', ')} (Suma: ${total})`;
    rollHistory.appendChild(historyEntry);
});
