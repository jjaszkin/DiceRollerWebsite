// Handouty - wspólny moduł (DiceRollerWebsite/shared/handouts/). Malutki, współdzielony stan
// "powiększenia" obrazka - używany zarówno przez control-panel.js (MG) jak i viewer.js (gracze),
// żeby nie duplikować tej samej logiki w obu miejscach. Czysto lokalny stan przeglądarki, NIE
// synchronizowany przez Firebase - powiększenie jednej osoby nie ma wpływu na widok innych.
//
// Klik w miniaturkę otwiera pełnoekranową warstwę z obrazkiem dopasowanym do ekranu. Warstwę
// zamyka WYŁĄCZNIE klawisz Esc albo przycisk X (data-action="ho-close-zoom" na tym przycisku) -
// klik w tło i klik w sam obrazek już NIE zamykają (świadoma zmiana - zbyt łatwo było zamknąć
// przez przypadek, patrz uwaga gracza). Zamiast tego klik w obrazek przełącza głębszy zoom
// (data-action="ho-zoom-toggle", patrz toggleZoomLevel/getZoomedIn) - gdy obrazek jest większy niż
// widok, można go przeciągać (patrz wireZoomPan niżej). Strzałki poprzedni/następny (klik ORAZ
// strzałki lewo/prawo na klawiaturze) mają WŁASNY data-action i nie zmieniają poziomu zoomu -
// przejście na inny obrazek zawsze wraca do dopasowania do ekranu (patrz openZoom).
//
// Ten moduł nie wie, PO CZYM się nawiguje (pełny katalog MG czy tylko widoczne u gracza) - to
// ustala wywołujący (control-panel.js / viewer.js), przekazując `hasPrev`/`hasNext` przy
// budowaniu HTML i obsługując same akcje "ho-zoom-prev"/"ho-zoom-next" u siebie.

let openKey = null;
let zoomedIn = false;

export function getZoomKey() {
    return openKey;
}

export function getZoomedIn() {
    return zoomedIn;
}

export function openZoom(key) {
    openKey = key;
    zoomedIn = false;
}

export function closeZoom() {
    openKey = null;
    zoomedIn = false;
}

export function toggleZoomLevel() {
    zoomedIn = !zoomedIn;
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
 *  listy). `zoomedIn` (patrz getZoomedIn) przełącza między obrazkiem dopasowanym do ekranu a
 *  większym, przeciąganym widokiem. */
export function buildZoomOverlayHtml(entry, hasPrev, hasNext, zoomedIn) {
    if (!entry) return "";
    return `
        <div class="ho-zoom-overlay ${zoomedIn ? "ho-zoom-overlay-zoomed" : ""}">
            <button type="button" class="ho-zoom-close" data-action="ho-close-zoom" title="Zamknij" aria-label="Zamknij">✕</button>
            ${hasPrev ? `<button type="button" class="ho-zoom-nav ho-zoom-nav-prev" data-action="ho-zoom-prev" title="Poprzedni" aria-label="Poprzedni">‹</button>` : ""}
            <img class="ho-zoom-image ${zoomedIn ? "ho-zoom-image-zoomed" : ""}" src="${escapeHtml(entry.file)}" alt="${escapeHtml(entry.name)}" data-action="ho-zoom-toggle">
            ${hasNext ? `<button type="button" class="ho-zoom-nav ho-zoom-nav-next" data-action="ho-zoom-next" title="Następny" aria-label="Następny">›</button>` : ""}
        </div>
    `;
}

/** Podpina przeciąganie myszą powiększonego obrazka (`.ho-zoom-image-zoomed`), gdy jest większy niż
 *  widok - jak w zwykłej przeglądarce obrazków. Tylko dla myszy (pointerType "mouse") - na
 *  dotyku/trackpadzie przewijanie działa natywnie przez `overflow: auto` na `.ho-zoom-overlay-
 *  zoomed` (patrz handouts.css), więc własna obsługa tylko by z nią kolidowała.
 *
 *  Wywołaj RAZ na stały `root` (przeżywa rerendery) - używa delegacji zamiast referencji do samego
 *  `<img>`, bo ten węzeł DOM jest niszczony i tworzony od nowa przy każdym rerenderze.
 *
 *  Jeśli przeciągnięcie faktycznie przesunęło obrazek (powyżej małego progu), tłumi następujące po
 *  nim zdarzenie `click` na obrazku - inaczej przeciągnięcie kończyłoby się (fałszywym) kliknięciem,
 *  które przełączałoby zoom z powrotem do dopasowania do ekranu. */
export function wireZoomPan(root) {
    let drag = null;

    root.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "mouse") return;
        const img = e.target.closest(".ho-zoom-image-zoomed");
        if (!img) return;
        const overlay = img.closest(".ho-zoom-overlay");
        if (!overlay) return;
        drag = {
            pointerId: e.pointerId,
            img,
            overlay,
            startX: e.clientX,
            startY: e.clientY,
            scrollLeft: overlay.scrollLeft,
            scrollTop: overlay.scrollTop,
            moved: false
        };
        img.setPointerCapture(e.pointerId);
        img.classList.add("ho-zoom-dragging");
    });

    root.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        const dx = e.clientX - drag.startX;
        const dy = e.clientY - drag.startY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
        drag.overlay.scrollLeft = drag.scrollLeft - dx;
        drag.overlay.scrollTop = drag.scrollTop - dy;
    });

    const endDrag = (e) => {
        if (!drag || e.pointerId !== drag.pointerId) return;
        drag.img.classList.remove("ho-zoom-dragging");
        if (drag.moved) {
            drag.img.addEventListener("click", (clickEvent) => {
                clickEvent.stopPropagation();
            }, { capture: true, once: true });
        }
        drag = null;
    };
    root.addEventListener("pointerup", endDrag);
    root.addEventListener("pointercancel", endDrag);
}
