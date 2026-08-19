// Panel: Backup — kopia zapasowa danych AKTUALNIE podłączonego zapisu (jednej postaci) jako
// plik JSON, do pobrania i późniejszego przywrócenia. W odróżnieniu od Dark Graala (jedna wspólna
// kampania pod jednym węzłem Firebase) GLIDE trzyma każdą postać pod osobnym węzłem
// GlidePartTwoSolo/{saveKey} (patrz store.js#connectSave) — export/import dotyczy więc wyłącznie
// tego jednego, aktualnie połączonego zapisu, nigdy całej bazy.
import { getState, getData, getSaveKey, updateState } from "../store.js";
import { createDefaultState, mergeWithDefaults, migrateLoadedState } from "../state.js";
import { sanitizeNameToKey } from "../utils.js";
import { confirmDialog } from "../modal.js";

// Ostatni komunikat po imporcie/eksporcie (błąd walidacji albo potwierdzenie) — czysto lokalny UI,
// nie zapisywany do Firebase, ten sam wzorzec co np. panels/roller.js#ui.oddJobs.blockedMsg.
const ui = { message: null };

export function render(root, { state }) {
    const saveKey = getSaveKey();
    const name = state.character?.name || saveKey || "postać";

    root.innerHTML = `
        <div class="card">
            <h2>Kopia zapasowa — ${name}</h2>
            <p class="placeholder">Eksportuje/importuje WYŁĄCZNIE aktualnie podłączony zapis (${saveKey ?? "?"}) — nie całą bazę Firebase i nie inne postacie. Przydatne przed ryzykowną zmianą albo jako lokalny backup na wypadek awarii.</p>
            <div class="backup-actions">
                <button type="button" class="btn btn-primary" data-action="export-backup">Eksportuj dane</button>
                <button type="button" class="btn btn-secondary" data-action="import-backup">Importuj dane</button>
                <input type="file" id="backupImportFileInput" accept="application/json,.json" style="display:none;">
            </div>
            ${ui.message ? `<p class="placeholder">${ui.message}</p>` : ""}
        </div>
    `;

    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}

/** Ściąga CAŁY stan AKTUALNIE podłączonego zapisu jako plik .json (zwykły JSON.stringify bez
 *  selekcji pól, żeby odtworzenie przez importBackup dało dokładnie ten sam stan poza meta.updatedAt). */
function exportBackup(state) {
    const saveKey = getSaveKey();
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
    const nameSlug = sanitizeNameToKey(state.character?.name || saveKey || "postac");
    const a = document.createElement("a");
    a.href = url;
    a.download = `glide2solo-${nameSlug}-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/** Wczytuje plik wybrany w #backupImportFileInput i — po walidacji kształtu i potwierdzeniu —
 *  NADPISUJE nim TYLKO aktualnie podłączony zapis (state module-scoped w store.js, zapisywany pod
 *  GlidePartTwoSolo/{aktualny saveKey}; import nigdy nie zmienia, który zapis jest podłączony).
 *  Przepuszcza dane przez te same createDefaultState/migrateLoadedState/mergeWithDefaults co
 *  store.js#connectSave przy starcie — żeby starsza kopia zapasowa (sprzed dodania nowszego pola
 *  w createDefaultState) dostała rozsądne domyślne wartości zamiast zepsuć resztę aplikacji
 *  brakiem oczekiwanego klucza. */
async function importBackup(root, data, file) {
    if (!file) return;
    let parsed;
    try {
        parsed = JSON.parse(await file.text());
    } catch {
        ui.message = "Nieprawidłowy plik JSON.";
        rerender(root);
        return;
    }
    if (!parsed || typeof parsed !== "object" || !parsed.character || typeof parsed.day?.current !== "number") {
        ui.message = "Plik nie wygląda na kopię zapasową postaci GLIDE: Part Two.";
        rerender(root);
        return;
    }

    const currentName = getState().character?.name;
    const importedName = parsed.character?.name;
    const nameMismatchNote = importedName && currentName && importedName !== currentName
        ? ` Uwaga: ten plik pochodzi z postaci „${importedName}”, a podłączony jest teraz zapis „${currentName}” — po imporcie „${currentName}” zacznie wyglądać jak „${importedName}”.`
        : "";

    const confirmed = await confirmDialog(
        `To NADPISZE aktualnie podłączony zapis (${getSaveKey()}) danymi z tego pliku — obecny stan tej postaci przepadnie, jeśli nie masz jego kopii. Tej operacji nie da się cofnąć.${nameMismatchNote} Kontynuować?`
    );
    if (!confirmed) return;

    const defaults = createDefaultState(data);
    const merged = mergeWithDefaults(defaults, migrateLoadedState(parsed));
    updateState(merged);
    ui.message = "Zaimportowano dane zapisu.";
    rerender(root);
}

function rerender(root) {
    render(root, { state: getState(), data: getData() });
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "export-backup") {
            exportBackup(getState());
        } else if (action === "import-backup") {
            root.querySelector("#backupImportFileInput").click();
        }
    });

    root.addEventListener("change", async (e) => {
        if (e.target !== root.querySelector("#backupImportFileInput")) return;
        const file = e.target.files?.[0];
        await importBackup(root, getData(), file);
        e.target.value = "";
    });
}
