// Battle Tracker - Klątwa Strahda. Standardowa lista stanów 5e (+ Spowolniony, potrzebny przez
// Ostrza Włosów Baby Lysagi) do szybkiego dodawania, plus dowolny tekst niestandardowy. Stany są
// czysto opisowe (bez automatyzacji przewagi/utrudnienia w silniku rzutów) - CONDITION_INFO daje
// tylko podpowiedź "co ten stan właściwie robi" na hover, żeby nie trzeba było zaglądać do PHB.

import { escapeHtml } from "../utils.js";

export const STANDARD_CONDITIONS = [
    "Oślepiony", "Oczarowany", "Ogłuszony", "Chwycony", "Bezradny", "Niewidzialny",
    "Sparaliżowany", "Skamieniały", "Zatruty", "Powalony", "Spętany", "Oszołomiony",
    "Nieprzytomny", "Przestraszony", "Spowolniony", "Wyczerpanie"
];

export const CONDITION_INFO = {
    "Oślepiony": "Nie widzi i automatycznie oblewa testy wymagające wzroku. Ataki NA tę istotę mają przewagę, jej własne ataki - utrudnienie.",
    "Oczarowany": "Nie może atakować czarującego ani obierać go celem szkodliwych zdolności/zaklęć. Czarujący ma przewagę w testach społecznych wobec niego.",
    "Ogłuszony": "Nie słyszy i automatycznie oblewa testy wymagające słuchu.",
    "Chwycony": "Prędkość 0, bez bonusów do prędkości. Kończy się, gdy chwytający zostaje obezwładniony albo cel opuszcza jego zasięg.",
    "Bezradny": "Nie może wykonywać akcji ani reakcji.",
    "Niewidzialny": "Niewidoczny bez magii/specjalnych zmysłów, liczony jako mocno ukryty. Ataki NA tę istotę mają utrudnienie, jej własne - przewagę.",
    "Sparaliżowany": "Bezradny, nie może się ruszać ani mówić. Automatycznie oblewa rzuty Siły i Zwinności. Ataki NA tę istotę mają przewagę - trafienie w zasięgu 5 stóp to automatyczny krytyk.",
    "Skamieniały": "Zamieniony w nieożywioną substancję, bezradny. Odporność na wszystkie obrażenia oraz na truciznę i choroby (istniejące zawieszone).",
    "Zatruty": "Utrudnienie w rzutach na atak i testach cech/umiejętności.",
    "Powalony": "Może się tylko czołgać (lub wstać, kończąc ruch). Utrudnienie we własnych atakach. Ataki w zasięgu 5 stóp mają przewagę, spoza zasięgu - utrudnienie.",
    "Spętany": "Prędkość 0. Utrudnienie w atakach i rzutach obronnych Zwinności. Ataki NA tę istotę mają przewagę.",
    "Oszołomiony": "Bezradny, nie może się ruszać, mówi tylko urywanie. Automatycznie oblewa rzuty Siły i Zwinności. Ataki NA tę istotę mają przewagę.",
    "Nieprzytomny": "Bezradny, nieświadomy otoczenia, upuszcza przedmioty i pada. Automatycznie oblewa rzuty Siły i Zwinności. Ataki NA tę istotę mają przewagę - trafienie w zasięgu 5 stóp to automatyczny krytyk.",
    "Przestraszony": "Utrudnienie w atakach i testach umiejętności, dopóki źródło strachu jest w polu widzenia. Nie może dobrowolnie się do niego zbliżyć.",
    "Spowolniony": "Homebrew na potrzeby tej kampanii (np. Ostrza Włosów): prędkość o połowę, brak reakcji - dokładne działanie wg ustaleń GM.",
    "Wyczerpanie": "Poziomy 1-6 kumulują narastające kary (utrudnienie w testach, połowa prędkości, utrudnienie w atakach/rzutach obronnych, połowa PW maks., prędkość 0) - poziom 6 to śmierć."
};

export function buildConditionPickerHtml(immunities = []) {
    const immuneSet = new Set((immunities || []).map((s) => String(s).toLowerCase()));
    const chips = STANDARD_CONDITIONS.map((label) => {
        const isImmune = immuneSet.has(label.toLowerCase());
        const info = CONDITION_INFO[label] || "";
        const tooltip = isImmune ? `${info} (cel ma odporność na ten stan)` : info;
        return `
            <button type="button"
                class="condition-pick-chip info-tip${isImmune ? " condition-pick-chip-immune" : ""}"
                data-action="add-condition" data-label="${label}"
                data-tooltip="${escapeHtml(tooltip)}"
                ${isImmune ? "disabled" : ""}>${label}</button>
        `;
    }).join("");
    return `
        <div class="condition-picker">
            <div class="condition-pick-chips">${chips}</div>
            <div class="condition-custom-row">
                <input type="text" class="condition-custom-input" placeholder="Własny stan / notatka...">
                <button type="button" class="btn btn-sm" data-action="add-custom-condition">Dodaj</button>
            </div>
        </div>
    `;
}
