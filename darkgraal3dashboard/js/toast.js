// Dark Graal III - Dashboard Solo (MG). Krótkie, samoznikające powiadomienie ("toast") u góry ekranu
// - jedyny obecny użytek: potwierdzenie "Użyłeś przedmiotu" po kliknięciu w ekwipunek/moc przedmiotu
// na karcie postaci (panels/character.js), bo wcześniej kliknięcie nie dawało żadnej widocznej
// reakcji poza wpisem w dzienniku. Wymaga stałego kontenera #toastContainer w index.html.

const CONTAINER_ID = "toastContainer";
const DEFAULT_DURATION = 2600;

export function showToast(message, duration = DEFAULT_DURATION) {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    container.appendChild(el);

    requestAnimationFrame(() => el.classList.add("toast-visible"));

    setTimeout(() => {
        el.classList.remove("toast-visible");
        setTimeout(() => el.remove(), 300);
    }, duration);
}
