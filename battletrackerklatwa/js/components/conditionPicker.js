// Battle Tracker - Klątwa Strahda. Standardowa lista warunków 5e (+ Spowolniony, potrzebny przez
// Ostrza Włosów Baby Lysagi) do szybkiego dodawania, plus dowolny tekst niestandardowy.

export const STANDARD_CONDITIONS = [
    "Oślepiony", "Oczarowany", "Ogłuszony", "Chwycony", "Bezradny", "Niewidzialny",
    "Sparaliżowany", "Skamieniały", "Zatruty", "Powalony", "Spętany", "Oszołomiony",
    "Nieprzytomny", "Przestraszony", "Spowolniony", "Wyczerpanie"
];

export function buildConditionPickerHtml() {
    const chips = STANDARD_CONDITIONS
        .map((label) => `<button type="button" class="condition-pick-chip" data-action="add-condition" data-label="${label}">${label}</button>`)
        .join("");
    return `
        <div class="condition-picker">
            <div class="condition-pick-chips">${chips}</div>
            <div class="condition-custom-row">
                <input type="text" class="condition-custom-input" placeholder="Własny warunek / notatka...">
                <button type="button" class="btn btn-sm" data-action="add-custom-condition">Dodaj</button>
            </div>
        </div>
    `;
}
