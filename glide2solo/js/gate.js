// GLIDE: Part Two — Ekran startowy: kreator postaci (imię Seekera + wybór roli).
//
// Pokazywany:
//   1) przy starcie aplikacji, dopóki postać nie ma ustawionego imienia i roli,
//   2) później na żądanie, przez przycisk „Zmień postać” w karcie Seeker (panel character.js).
//
// To jedyne miejsce w aplikacji, w którym rolę można ustawić/zmienić — na dashboardzie
// (karta Seeker) imię i rola są już tylko wyświetlane, bez możliwości edycji.

const gateEl = document.getElementById("characterGate");
const appEl = document.getElementById("app");
const nameInput = document.getElementById("gateName");
const roleSelect = document.getElementById("gateRole");
const previewEl = document.getElementById("gateRolePreview");
const errorEl = document.getElementById("gateError");
const submitBtn = document.getElementById("gateSubmit");
const cancelBtn = document.getElementById("gateCancel");

let wired = false;
let currentData = null;
let currentOnConfirm = null;

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

function updateSubmitState() {
    errorEl.style.display = "none";
    const nameOk = nameInput.value.trim().length > 0;
    const roleOk = parseInt(roleSelect.value, 10) >= 0;
    submitBtn.disabled = !(nameOk && roleOk);
}

function wireOnce() {
    if (wired) return;
    wired = true;

    roleSelect.addEventListener("change", () => {
        const idx = parseInt(roleSelect.value, 10);
        renderPreview(idx >= 0 ? currentData.mechanics.seeker_roles[idx] : null);
        updateSubmitState();
    });

    nameInput.addEventListener("input", updateSubmitState);

    submitBtn.addEventListener("click", () => {
        const name = nameInput.value.trim();
        const idx = parseInt(roleSelect.value, 10);
        if (!name || idx < 0) {
            errorEl.textContent = "Podaj imię i wybierz rolę, żeby kontynuować.";
            errorEl.style.display = "block";
            return;
        }
        const role = currentData.mechanics.seeker_roles[idx];
        const onConfirm = currentOnConfirm;
        currentOnConfirm = null;
        hideGate();
        onConfirm(name, role);
    });

    cancelBtn.addEventListener("click", () => {
        currentOnConfirm = null;
        hideGate();
    });
}

/**
 * Pokazuje ekran startowy kreatora postaci.
 * @param {object} data - wczytane dane gry (potrzebna lista ról z mechanics.json)
 * @param {(name: string, role: object) => void} onConfirm - wywoływane po zatwierdzeniu formularza
 * @param {object} [opts]
 * @param {{name?: string, role?: string}|null} [opts.current] - obecne imię/rola do wstępnego
 *        wypełnienia formularza (używane tylko przy „Zmień postać” — przy pierwszym uruchomieniu
 *        ekran zawsze startuje pusty, nawet jeśli w danych jest już zapisana rola)
 * @param {boolean} [opts.allowCancel] - czy pokazać przycisk Anuluj (tylko gdy postać już istnieje)
 * @param {string} [opts.submitLabel] - etykieta przycisku zatwierdzającego
 */
export function showGate(data, onConfirm, { current = null, allowCancel = false, submitLabel = "Rozpocznij grę" } = {}) {
    currentData = data;
    currentOnConfirm = onConfirm;
    wireOnce();

    const roles = data.mechanics.seeker_roles;
    const currentIdx = current?.role ? roles.findIndex(r => r.role === current.role) : -1;

    roleSelect.innerHTML = `<option value="-1">— wybierz rolę —</option>` +
        roles.map((r, i) => `<option value="${i}" ${i === currentIdx ? "selected" : ""}>${r.role}</option>`).join("");

    nameInput.value = current?.name || "";
    renderPreview(currentIdx >= 0 ? roles[currentIdx] : null);
    errorEl.style.display = "none";
    cancelBtn.style.display = allowCancel ? "inline-block" : "none";
    submitBtn.textContent = submitLabel;
    updateSubmitState();

    gateEl.classList.add("active");
    appEl.classList.add("hidden");
    nameInput.focus();
}

export function hideGate() {
    gateEl.classList.remove("active");
    appEl.classList.remove("hidden");
}
