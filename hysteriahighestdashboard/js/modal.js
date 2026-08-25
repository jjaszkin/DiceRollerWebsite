// Hysteria Highest - Dashboard. Modal współdzielony przez wszystkie panele (opis karty tarota,
// opis+rzut Atutu/Komplikacji) - zawsze wyśrodkowany w viewporcie, z przyciemnieniem 70%. Stan
// lokalny (nie synchronizowany do Firebase - każda przeglądarka ma swój otwarty modal), renderowany
// przez main.js do #modalRoot przy KAŻDYM renderAll() (patrz subscribeModal). Zamyka WYŁĄCZNIE X
// albo Esc (ta sama konwencja co shared/handouts/zoom.js) - klik w tło NIE zamyka, żeby nie tracić
// przypadkowo otwartego opisu.

let current = null; // { title, bodyHtml, rollLabel, onRoll } | null
const listeners = new Set();

function notify() {
    for (const fn of listeners) fn();
}

export function subscribeModal(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function openModal({ title, bodyHtml, rollLabel = null, onRoll = null }) {
    current = { title, bodyHtml, rollLabel, onRoll };
    notify();
}

export function closeModal() {
    current = null;
    notify();
}

export function isModalOpen() {
    return current !== null;
}

export function buildModalHtml() {
    if (!current) return "";
    return `
        <div class="modal-overlay">
            <div class="modal-box">
                <button type="button" class="modal-close" data-action="close-modal" title="Zamknij" aria-label="Zamknij">✕</button>
                ${current.title ? `<h3 class="modal-title">${current.title}</h3>` : ""}
                <div class="modal-body">${current.bodyHtml}</div>
                ${current.rollLabel ? `<button type="button" class="btn btn-primary modal-roll-btn" data-action="modal-roll">${current.rollLabel}</button>` : ""}
            </div>
        </div>
    `;
}

/** Wołane raz z main.js: obsługa klik na X i Esc, wspólna dla całej aplikacji (modal jest jeden
 *  na raz, niezależnie od tego, który panel go otworzył). */
export function wireModalGlobalEvents(rerenderAll) {
    document.addEventListener("click", (e) => {
        const closeBtn = e.target.closest('[data-action="close-modal"]');
        if (closeBtn) {
            closeModal();
            rerenderAll();
            return;
        }
        const rollBtn = e.target.closest('[data-action="modal-roll"]');
        if (rollBtn && current?.onRoll) {
            current.onRoll();
            closeModal();
            rerenderAll();
        }
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && current) {
            e.preventDefault();
            closeModal();
            rerenderAll();
        }
    });
}
