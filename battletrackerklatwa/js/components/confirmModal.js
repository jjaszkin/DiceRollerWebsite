// Battle Tracker - Klątwa Strahda. Generyczny modal potwierdzenia (Tak/Anuluj), zbudowany z
// istniejącej powłoki CSS .modal-backdrop/.modal/.modal-actions. Używany wszędzie tam, gdzie
// usunięcie wymaga potwierdzenia "na modalu" (np. wpisy historii walki).

import { escapeHtml } from "../utils.js";

export function openConfirm({ title = "Potwierdź", message = "", confirmLabel = "Usuń", cancelLabel = "Anuluj", onConfirm }) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
        <div class="modal confirm-modal">
            <h2>${escapeHtml(title)}</h2>
            <p>${escapeHtml(message)}</p>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
                <button type="button" class="btn btn-primary btn-danger" data-action="confirm">${escapeHtml(confirmLabel)}</button>
            </div>
        </div>
    `;

    function close() {
        backdrop.remove();
        document.removeEventListener("keydown", onKeydown);
    }

    function onKeydown(e) {
        if (e.key === "Escape") close();
    }

    backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) close();
    });
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", close);
    backdrop.querySelector('[data-action="confirm"]').addEventListener("click", () => {
        close();
        onConfirm?.();
    });

    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(backdrop);
}
