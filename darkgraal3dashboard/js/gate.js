// Dark Graal III - Dashboard Solo (MG). Ekran startowy - uproszczony względem glide2solo (nie ma
// tu "zapisów"/imion do wpisania: kampania jest jedna i wspólna, już połączona z Firebase zanim
// gate w ogóle się pokazuje, patrz main.js#bootstrap). Gate pyta:
//   Krok 1 - rola: „Mistrz Gry” albo „Gracz”.
//   Krok 2a (dla „Mistrz Gry”) - PIN (4 cyfry), sprawdzany względem state.mgPin (patrz state.js -
//     ustawiany/zmieniany bezpośrednio w Firebase przez usera, domyślnie "0000").
//   Krok 2b (dla „Gracz”) - wybór jednej z 4 postaci z listy (data/characters.json).
// Wybór roli/postaci jest CZYSTO lokalny (localStorage, do wygody ponownego otwarcia na tym samym
// urządzeniu) - NIE jest częścią stanu kampanii zapisywanego do Firebase. PIN natomiast JEST
// częścią stanu kampanii (state.mgPin), więc wymaga getState() ze store.js.
//
// Gate można też otworzyć PONOWNIE w trakcie sesji (przycisk „Zmień postać” w nagłówku, patrz
// main.js) - w takim wypadku (opts.allowCancel) pokazujemy dodatkowy przycisk „Anuluj”, który
// zamyka gate BEZ wołania onDone, zostawiając bieżącą sesję bez zmian.

import { getState } from "./store.js";

const LAST_ROLE_KEY = "darkGraal3.lastRole";
const LAST_CHARACTER_KEY = "darkGraal3.lastCharacterKey";

const gateEl = document.getElementById("characterGate");
const appEl = document.getElementById("app");

const stepRoleEl = document.getElementById("gateStepRole");
const stepPinEl = document.getElementById("gateStepPin");
const stepCharacterEl = document.getElementById("gateStepCharacter");

const roleMgBtn = document.getElementById("gateRoleMg");
const rolePlayerBtn = document.getElementById("gateRolePlayer");

const pinInputsEl = document.getElementById("gatePinInputs");
const pinNextBtn = document.getElementById("gatePinNext");
const pinBackBtn = document.getElementById("gatePinBack");
const pinErrorEl = document.getElementById("gatePinError");

const characterSelect = document.getElementById("gateCharacterSelect");
const characterNextBtn = document.getElementById("gateCharacterNext");
const characterBackBtn = document.getElementById("gateCharacterBack");
const characterErrorEl = document.getElementById("gateCharacterError");

const gateCancelBtn = document.getElementById("gateCancel");

let wired = false;
let currentData = null;
let currentOnDone = null;
let currentAllowCancel = false;
let pinGroup = null;

/** Owija 4 osobne inputy cyfr PIN-u w jeden logiczny "input" (patrz glide2solo#js/gate.js dla
 *  pierwowzoru) - auto-przeskok po wpisaniu cyfry, Backspace cofa do poprzedniego pola, strzałki
 *  lewo/prawo, wklejenie całego PIN-u naraz. */
function createPinDigitGroup(container, { onChange, onEnter } = {}) {
    const boxes = Array.from(container.querySelectorAll(".pin-digit"));

    boxes.forEach((box, i) => {
        box.addEventListener("focus", () => box.select());

        box.addEventListener("input", () => {
            box.value = box.value.replace(/\D/g, "").slice(0, 1);
            if (box.value && i < boxes.length - 1) boxes[i + 1].focus();
            if (onChange) onChange();
        });

        box.addEventListener("keydown", (e) => {
            if (e.key === "Backspace" && !box.value && i > 0) {
                e.preventDefault();
                boxes[i - 1].value = "";
                boxes[i - 1].focus();
                if (onChange) onChange();
            } else if (e.key === "ArrowLeft" && i > 0) {
                e.preventDefault();
                boxes[i - 1].focus();
            } else if (e.key === "ArrowRight" && i < boxes.length - 1) {
                e.preventDefault();
                boxes[i + 1].focus();
            } else if (e.key === "Enter" && onEnter) {
                onEnter();
            }
        });

        box.addEventListener("paste", (e) => {
            const text = (e.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "");
            if (!text) return;
            e.preventDefault();
            boxes.forEach((b, j) => { b.value = text[j] || ""; });
            const nextEmpty = boxes.findIndex(b => !b.value);
            (nextEmpty >= 0 ? boxes[nextEmpty] : boxes[boxes.length - 1]).focus();
            if (onChange) onChange();
        });
    });

    return {
        get value() { return boxes.map(b => b.value).join(""); },
        set value(v) {
            const digits = String(v || "").split("");
            boxes.forEach((b, i) => { b.value = digits[i] || ""; });
        },
        focus() { boxes[0].focus(); }
    };
}

function hideAllSteps() {
    stepRoleEl.style.display = "none";
    stepPinEl.style.display = "none";
    stepCharacterEl.style.display = "none";
}

function showRoleStep() {
    hideAllSteps();
    stepRoleEl.style.display = "block";
}

function updatePinNextState() {
    pinErrorEl.style.display = "none";
    pinNextBtn.disabled = !/^\d{4}$/.test(pinGroup.value);
}

function showPinStep() {
    hideAllSteps();
    pinGroup.value = "";
    updatePinNextState();
    stepPinEl.style.display = "block";
    pinGroup.focus();
}

function showCharacterStep() {
    hideAllSteps();
    characterErrorEl.style.display = "none";
    const characters = currentData?.characters ?? [];
    const lastKey = localStorage.getItem(LAST_CHARACTER_KEY);
    characterSelect.innerHTML = `<option value="">- wybierz postać -</option>` +
        characters.map(c => `<option value="${c.key}" ${c.key === lastKey ? "selected" : ""}>${c.name}${c.epithet ? " " + c.epithet : ""} (${c.aliasName})</option>`).join("");
    stepCharacterEl.style.display = "block";
}

function finish(role, characterKey) {
    localStorage.setItem(LAST_ROLE_KEY, role);
    if (characterKey) localStorage.setItem(LAST_CHARACTER_KEY, characterKey);
    hideGate();
    if (currentOnDone) currentOnDone({ role, characterKey: characterKey || null });
}

function checkPin() {
    const entered = pinGroup.value;
    if (!/^\d{4}$/.test(entered)) return;
    const expected = getState()?.mgPin || "0000";
    if (entered === expected) {
        finish("mg", null);
    } else {
        pinErrorEl.textContent = "Nieprawidłowy PIN.";
        pinErrorEl.style.display = "block";
        pinGroup.value = "";
        pinGroup.focus();
        updatePinNextState();
    }
}

function wireOnce() {
    if (wired) return;
    wired = true;

    roleMgBtn.addEventListener("click", () => {
        showPinStep();
    });

    rolePlayerBtn.addEventListener("click", () => {
        showCharacterStep();
    });

    pinGroup = createPinDigitGroup(pinInputsEl, {
        onChange: updatePinNextState,
        onEnter: () => { if (!pinNextBtn.disabled) checkPin(); }
    });

    pinBackBtn.addEventListener("click", showRoleStep);
    pinNextBtn.addEventListener("click", checkPin);

    characterBackBtn.addEventListener("click", showRoleStep);

    characterNextBtn.addEventListener("click", () => {
        const key = characterSelect.value;
        if (!key) {
            characterErrorEl.textContent = "Wybierz postać, żeby kontynuować.";
            characterErrorEl.style.display = "block";
            return;
        }
        finish("player", key);
    });

    gateCancelBtn.addEventListener("click", () => {
        if (!currentAllowCancel) return;
        hideGate();
    });
}

/**
 * Pokazuje ekran startowy (wybór roli + PIN MG / wybór postaci gracza).
 * @param {object} data - wczytane dane gry (potrzebna lista postaci z data/characters.json)
 * @param {object} [opts]
 * @param {(sel: {role: "mg"|"player", characterKey: string|null}) => void} [opts.onDone]
 * @param {boolean} [opts.allowCancel] - pokazuje przycisk "Anuluj" (do ponownego otwarcia gate'a w
 *   trakcie sesji, np. przyciskiem "Zmień postać" w nagłówku, bez wymuszania nowego wyboru).
 */
export function showGate(data, { onDone = null, allowCancel = false } = {}) {
    currentData = data;
    currentOnDone = onDone;
    currentAllowCancel = allowCancel;
    wireOnce();

    gateCancelBtn.style.display = allowCancel ? "inline-flex" : "none";

    showRoleStep();

    gateEl.classList.add("active");
    appEl.classList.add("hidden");
}

export function hideGate() {
    gateEl.classList.remove("active");
    appEl.classList.remove("hidden");
}
