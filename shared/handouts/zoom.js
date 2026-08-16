// Handouty - wspólny moduł (DiceRollerWebsite/shared/handouts/). Malutki, współdzielony stan
// "powiększenia" obrazka - używany zarówno przez control-panel.js (MG) jak i viewer.js (gracze),
// żeby nie duplikować tej samej logiki w obu miejscach. Czysto lokalny stan przeglądarki, NIE
// synchronizowany przez Firebase - powiększenie jednej osoby nie ma wpływu na widok innych.
//
// Klik w miniaturkę otwiera pełnoekranową warstwę z dużym obrazkiem, klik GDZIEKOLWIEK w tej
// warstwie (łącznie z samym obrazkiem) ją zamyka - stąd data-action jest na zewnętrznym tle, nie
// na <img>, ale closest() z kliknięcia w obrazek i tak trafi w rodzica.

let openKey = null;

export function getZoomKey() {
    return openKey;
}

export function openZoom(key) {
    openKey = key;
}

export function closeZoom() {
    openKey = null;
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

/** Buduje HTML pełnoekranowej warstwy powiększenia dla `entry` ({ file, name }) - pusty string,
 *  jeśli `entry` jest `null` (nic aktualnie nie jest powiększone, albo klucz z getZoomKey() nie
 *  pasuje do żadnego dostępnego wpisu, np. MG akurat go ukrył). */
export function buildZoomOverlayHtml(entry) {
    if (!entry) return "";
    return `
        <div class="ho-zoom-overlay" data-action="ho-close-zoom">
            <img class="ho-zoom-image" src="${escapeHtml(entry.file)}" alt="${escapeHtml(entry.name)}">
        </div>
    `;
}
