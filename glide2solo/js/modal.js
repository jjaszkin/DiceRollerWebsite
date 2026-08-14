// GLIDE: Part Two — własne okno potwierdzenia/wprowadzania danych, zastępujące window.confirm()/
// alert()/prompt(). Przeglądarka dopisuje do natywnych dialogów adres strony (np. "diceroller.
// netlify.app says…") i nie da się tego ukryć żadnym kodem — jedyny sposób, żeby nagranie sesji
// nie zdradzało domeny, to w ogóle nie używać natywnych dialogów. Ten moduł to zwykły <div>
// dopięty do <body>, więc żadna domena się nie pokazuje.

function openOverlay(cardHtml) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `<div class="modal-card" role="alertdialog" aria-modal="true">${cardHtml}</div>`;
    document.body.appendChild(overlay);
    return overlay;
}

function closeOverlay(overlay, onKeydown) {
    document.removeEventListener("keydown", onKeydown);
    overlay.remove();
}

/** Zastępuje window.confirm(). Zwraca Promise<boolean>. */
export function confirmDialog(message) {
    return new Promise((resolve) => {
        const overlay = openOverlay(`
            <p class="modal-message"></p>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" data-modal="cancel">Anuluj</button>
                <button type="button" class="btn btn-primary" data-modal="ok">Potwierdź</button>
            </div>
        `);
        overlay.querySelector(".modal-message").textContent = message;

        function finish(result) {
            closeOverlay(overlay, onKeydown);
            resolve(result);
        }
        function onKeydown(e) {
            if (e.key === "Escape") finish(false);
            else if (e.key === "Enter") finish(true);
        }

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) { finish(false); return; }
            const btn = e.target.closest("[data-modal]");
            if (btn) finish(btn.dataset.modal === "ok");
        });
        document.addEventListener("keydown", onKeydown);
        overlay.querySelector('[data-modal="ok"]').focus();
    });
}

/** Zastępuje window.alert(). Zwraca Promise<void>, rozwiązywany po zamknięciu. */
export function alertDialog(message) {
    return new Promise((resolve) => {
        const overlay = openOverlay(`
            <p class="modal-message"></p>
            <div class="modal-actions">
                <button type="button" class="btn btn-primary" data-modal="ok">OK</button>
            </div>
        `);
        overlay.querySelector(".modal-message").textContent = message;

        function finish() {
            closeOverlay(overlay, onKeydown);
            resolve();
        }
        function onKeydown(e) {
            if (e.key === "Escape" || e.key === "Enter") finish();
        }

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay || e.target.closest("[data-modal]")) finish();
        });
        document.addEventListener("keydown", onKeydown);
        overlay.querySelector('[data-modal="ok"]').focus();
    });
}

/** Zastępuje window.prompt(). Zwraca Promise<string|null> (null = anulowano, tak jak natywny prompt). */
export function promptDialog(message, defaultValue = "") {
    return new Promise((resolve) => {
        const overlay = openOverlay(`
            <p class="modal-message"></p>
            <input type="text" class="modal-input" data-modal="input">
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" data-modal="cancel">Anuluj</button>
                <button type="button" class="btn btn-primary" data-modal="ok">OK</button>
            </div>
        `);
        overlay.querySelector(".modal-message").textContent = message;
        const input = overlay.querySelector('[data-modal="input"]');
        input.value = defaultValue;

        function finish(result) {
            closeOverlay(overlay, onKeydown);
            resolve(result);
        }
        function onKeydown(e) {
            if (e.key === "Escape") finish(null);
            else if (e.key === "Enter") finish(input.value);
        }

        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) { finish(null); return; }
            const btn = e.target.closest("[data-modal]");
            if (!btn) return;
            finish(btn.dataset.modal === "ok" ? input.value : null);
        });
        document.addEventListener("keydown", onKeydown);
        input.focus();
        input.select();
    });
}
