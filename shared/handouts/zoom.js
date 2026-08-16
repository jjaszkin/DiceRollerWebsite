// Handouty - wspólny moduł (DiceRollerWebsite/shared/handouts/). Malutki, współdzielony stan
// "powiększenia" obrazka - używany zarówno przez control-panel.js (MG) jak i viewer.js (gracze),
// żeby nie duplikować tej samej logiki w obu miejscach. Czysto lokalny stan przeglądarki, NIE
// synchronizowany przez Firebase - powiększenie jednej osoby nie ma wpływu na widok innych.
//
// Klik w miniaturkę otwiera pełnoekranową warstwę z dużym obrazkiem, klik GDZIEKOLWIEK w tej
// warstwie (łącznie z samym obrazkiem) ją zamyka - stąd data-action="ho-close-zoom" jest na
// zewnętrznym tle, nie na <img>, ale closest() z kliknięcia w obrazek i tak trafi w rodzica.
// Strzałki poprzedni/następny (klik ORAZ strzałki lewo/prawo na klawiaturze) nie zamykają warstwy -
// mają WŁASNY data-action, więc closest() zatrzymuje się na nich, zanim dotrze do tła.
//
// Ten moduł nie wie, PO CZYM się nawiguje (pełny katalog MG czy tylko widoczne u gracza) - to
// ustala wywołujący (control-panel.js / viewer.js), przekazując `hasPrev`/`hasNext` przy
// budowaniu HTML i obsługując same akcje "ho-zoom-prev"/"ho-zoom-next" u siebie.

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
 *  pasuje do żadnego dostępnego wpisu, np. MG akurat go ukrył). `hasPrev`/`hasNext` sterują tym,
 *  czy strzałki nawigacji w ogóle się pokazują (nie pokazujemy strzałki w "donikąd" na krańcach
 *  listy). */
export function buildZoomOverlayHtml(entry, hasPrev, hasNext) {
    if (!entry) return "";
    return `
        <div class="ho-zoom-overlay" data-action="ho-close-zoom">
            ${hasPrev ? `<button type="button" class="ho-zoom-nav ho-zoom-nav-prev" data-action="ho-zoom-prev" title="Poprzedni" aria-label="Poprzedni">‹</button>` : ""}
            <img class="ho-zoom-image" src="${escapeHtml(entry.file)}" alt="${escapeHtml(entry.name)}">
            ${hasNext ? `<button type="button" class="ho-zoom-nav ho-zoom-nav-next" data-action="ho-zoom-next" title="Następny" aria-label="Następny">›</button>` : ""}
        </div>
    `;
}
