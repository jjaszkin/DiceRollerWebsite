// Battle Tracker - Klątwa Strahda. Modal wyboru obrazka spośród plików już wdrożonych w images/
// (patrz imageLibrary.js) - siatka miniaturek, klik wybiera. Używany zarówno dla okładki walki
// (battleCreator.js/battleView.js), jak i portretów uczestników (participantsLibrary.js) - stąd
// generyczny `onSelect(file | null)`, bez wiedzy o tym, gdzie wynik ląduje.

import { escapeHtml } from "../utils.js";
import { getImageLibrary } from "../imageLibrary.js";

export function openImagePicker({ current = null, onSelect }) {
    const images = getImageLibrary();
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
        <div class="modal image-picker-modal">
            <h2>Wybierz obrazek</h2>
            ${images.length ? `
                <div class="image-picker-grid">
                    ${images.map((img) => `
                        <button type="button" class="image-picker-item ${img.file === current ? "active" : ""}" data-file="${escapeHtml(img.file)}" title="${escapeHtml(img.name)}">
                            <img src="${escapeHtml(img.file)}" alt="${escapeHtml(img.name)}" loading="lazy">
                            <span>${escapeHtml(img.name)}</span>
                        </button>
                    `).join("")}
                </div>
            ` : '<p class="placeholder">Brak obrazków w images/. Wgraj pliki i odpal shared/images/generate-manifest.js.</p>'}
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" data-action="clear">Usuń obrazek</button>
                <button type="button" class="btn btn-secondary" data-action="cancel">Anuluj</button>
            </div>
        </div>
    `;

    function close() {
        backdrop.remove();
        document.removeEventListener("keydown", onKeydown);
    }
    function onKeydown(e) { if (e.key === "Escape") close(); }

    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", close);
    backdrop.querySelector('[data-action="clear"]').addEventListener("click", () => {
        close();
        onSelect(null);
    });
    backdrop.querySelectorAll("[data-file]").forEach((btn) => {
        btn.addEventListener("click", () => {
            close();
            onSelect(btn.dataset.file);
        });
    });

    document.addEventListener("keydown", onKeydown);
    document.body.appendChild(backdrop);
}
