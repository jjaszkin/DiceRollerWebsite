// GLIDE: Part Two — Ekran startowy: wybór/utworzenie zapisu (imię Poszukiwacza) + kreator roli.
//
// Dwuetapowy przepływ:
//   Krok 1 (imię) — użytkownik wpisuje imię Poszukiwacza. Zsanityzowana wersja imienia
//   (patrz utils.js#sanitizeNameToKey) staje się kluczem zapisu w Firebase, pod
//   GlidePartTwoSolo/{klucz} — patrz store.js#connectSave. Istniejące imię wczytuje
//   istniejący zapis (kontynuacja tej samej postaci), nowe imię tworzy nową, pustą
//   równoległą grę solo.
//   Krok 2 (rola) — pokazywany tylko, gdy wczytany zapis nie ma jeszcze ustawionej
//   roli (nowa postać), albo gdy użytkownik edytuje AKTUALNIE aktywną postać (np.
//   przez „Zmień postać” na tej samej postaci, żeby świadomie zmienić rolę). Przy
//   przełączeniu się na inną, już skonfigurowaną postać krok roli jest pomijany —
//   dashboard od razu pokazuje wczytany stan.
//
// Uwaga: kliknięcie „Dalej” na kroku imienia natychmiast łączy store z wybranym
// zapisem (connectSave) — od tego momentu store „patrzy” już na nowy zapis. Przycisk
// „Anuluj” na kroku imienia po prostu zamyka ekran bez cofania tego połączenia (nie ma
// osobnego stanu do przywrócenia poza kolejnym wywołaniem showGate) — w praktyce nie
// stanowi to problemu, bo Anuluj jest dostępny tylko, zanim jakiekolwiek połączenie
// zostanie w ogóle nawiązane w ramach danego otwarcia ekranu.
//
// Pokazywany:
//   1) przy starcie aplikacji (main.js#bootstrap) — zawsze zaczyna od kroku imienia,
//   2) później na żądanie, przez przycisk „Zmień postać” w karcie Poszukiwacz (panel character.js).

import { connectSave, getSaveKey, notifyNow, updateState } from "./store.js";
import { sanitizeNameToKey } from "./utils.js";
import { applyRole } from "./state.js";

const gateEl = document.getElementById("characterGate");
const appEl = document.getElementById("app");

const stepNameEl = document.getElementById("gateStepName");
const stepRoleEl = document.getElementById("gateStepRole");

const nameInput = document.getElementById("gateName");
const nameErrorEl = document.getElementById("gateNameError");
const nameNextBtn = document.getElementById("gateNameNext");
const cancelBtn = document.getElementById("gateCancel");

const subRoleEl = document.getElementById("gateSubRole");
const roleSelect = document.getElementById("gateRole");
const previewEl = document.getElementById("gateRolePreview");
const roleErrorEl = document.getElementById("gateRoleError");
const backBtn = document.getElementById("gateBack");
const submitBtn = document.getElementById("gateSubmit");

let wired = false;
let currentData = null;
let currentOnDone = null;
let pendingDisplayName = "";

function renderPreview(role) {
    if (!role) { previewEl.innerHTML = ""; return; }
    const s = role.starting_stats;
    previewEl.innerHTML = `
        <div class="gate-role-preview">
            <p><strong>Statystyki startowe:</strong> H ${s.H} · K ${s.K} · R ${s.R} · C ${s.C} · F ${s.F}</p>
            <p><strong>Cecha startowa:</strong> ${role.starting_bonus_trait}</p>
            <p><strong>Cel:</strong> ${role.goal}</p>
            <p><strong>Nagroda:</strong> ${role.reward_trait}</p>
        </div>
    `;
}

function updateNameNextState() {
    nameErrorEl.style.display = "none";
    nameNextBtn.disabled = nameInput.value.trim().length === 0;
}

function updateSubmitState() {
    roleErrorEl.style.display = "none";
    submitBtn.disabled = !(parseInt(roleSelect.value, 10) >= 0);
}

function showNameStep() {
    stepRoleEl.style.display = "none";
    stepNameEl.style.display = "block";
    nameInput.focus();
}

function showRoleStep() {
    stepNameEl.style.display = "none";
    stepRoleEl.style.display = "block";
}

function finish() {
    // notifyNow (a nie touch) — sam wybór/wczytanie zapisu nie jest jeszcze „zmianą” do
    // zapisania, jedynie odświeżeniem UI; ewentualny zapis roli poszedł już przez
    // updateState (patrz submitBtn handler), który sam zaplanuje zapis.
    notifyNow();
    hideGate();
    if (currentOnDone) currentOnDone();
}

async function goToRoleOrFinish() {
    const name = nameInput.value.trim();
    if (!name) {
        nameErrorEl.textContent = "Podaj imię Poszukiwacza, żeby kontynuować.";
        nameErrorEl.style.display = "block";
        return;
    }
    const saveKey = sanitizeNameToKey(name);
    if (!saveKey) {
        nameErrorEl.textContent = "To imię nie zawiera żadnych znaków, które da się zapisać jako identyfikator — spróbuj innego.";
        nameErrorEl.style.display = "block";
        return;
    }

    const previousSaveKey = getSaveKey();
    pendingDisplayName = name;

    nameNextBtn.disabled = true;
    nameNextBtn.textContent = "Wczytywanie…";
    let loadedState;
    try {
        loadedState = await connectSave(saveKey);
    } finally {
        nameNextBtn.disabled = false;
        nameNextBtn.textContent = "Dalej";
    }

    const isSelfEdit = previousSaveKey !== null && previousSaveKey === saveKey;
    const roles = currentData.mechanics.seeker_roles;

    if (loadedState.character.role && !isSelfEdit) {
        // Postać już istnieje i ma ustawioną rolę — wczytaj ją bez pokazywania kroku roli.
        finish();
        return;
    }

    const currentIdx = isSelfEdit && loadedState.character.role
        ? roles.findIndex(r => r.role === loadedState.character.role)
        : -1;

    roleSelect.innerHTML = `<option value="-1">— wybierz rolę —</option>` +
        roles.map((r, i) => `<option value="${i}" ${i === currentIdx ? "selected" : ""}>${r.role}</option>`).join("");

    renderPreview(currentIdx >= 0 ? roles[currentIdx] : null);
    subRoleEl.textContent = `Wybierz rolę dla: ${name}`;
    updateSubmitState();
    showRoleStep();
}

function wireOnce() {
    if (wired) return;
    wired = true;

    nameInput.addEventListener("input", updateNameNextState);
    nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !nameNextBtn.disabled) goToRoleOrFinish();
    });
    nameNextBtn.addEventListener("click", goToRoleOrFinish);

    cancelBtn.addEventListener("click", () => {
        currentOnDone = null;
        hideGate();
    });

    roleSelect.addEventListener("change", () => {
        const idx = parseInt(roleSelect.value, 10);
        renderPreview(idx >= 0 ? currentData.mechanics.seeker_roles[idx] : null);
        updateSubmitState();
    });

    backBtn.addEventListener("click", () => {
        showNameStep();
    });

    submitBtn.addEventListener("click", () => {
        const idx = parseInt(roleSelect.value, 10);
        if (idx < 0) {
            roleErrorEl.textContent = "Wybierz rolę, żeby kontynuować.";
            roleErrorEl.style.display = "block";
            return;
        }
        const role = currentData.mechanics.seeker_roles[idx];
        updateState((s) => {
            s.character.name = pendingDisplayName;
            applyRole(s.character, role);
        });
        finish();
    });
}

/**
 * Pokazuje ekran startowy (wybór/utworzenie zapisu + ewentualny kreator roli).
 * @param {object} data - wczytane dane gry (potrzebna lista ról z mechanics.json)
 * @param {object} [opts]
 * @param {string} [opts.initialName] - imię do wstępnego wypełnienia pola (np. ostatnio używane)
 * @param {boolean} [opts.allowCancel] - czy pokazać przycisk Anuluj na kroku imienia
 *        (tylko gdy jakaś postać jest już aktywna — czyli wywołanie przez „Zmień postać”)
 * @param {() => void} [opts.onDone] - wywoływane po zakończeniu (wczytaniu zapisu / zapisaniu roli)
 */
export function showGate(data, { initialName = "", allowCancel = false, onDone = null } = {}) {
    currentData = data;
    currentOnDone = onDone;
    wireOnce();

    nameInput.value = initialName;
    nameErrorEl.style.display = "none";
    cancelBtn.style.display = allowCancel ? "inline-block" : "none";
    updateNameNextState();
    showNameStep();

    gateEl.classList.add("active");
    appEl.classList.add("hidden");
    nameInput.focus();
}

export function hideGate() {
    gateEl.classList.remove("active");
    appEl.classList.remove("hidden");
}
