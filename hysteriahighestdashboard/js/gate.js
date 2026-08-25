// Hysteria Highest - Dashboard. Ekran startowy, wzorzec z darkgraal3dashboard/js/gate.js:
//   Krok 1 - rola: „Mistrz Gry” albo „Gracz”.
//   Krok 2a (MG) - PIN (4 cyfry) sprawdzany względem state.mgPin (domyślnie "0000").
//   Krok 2b (Gracz) - wybór JEDNEGO z 4 duetów postaci (data/characters.json#pairs). W
//     przeciwieństwie do Dark Graala (1 postać na gracza), tu wybór duetu daje dostęp do DWÓCH
//     zakładek postaci naraz (patrz main.js). Gracze nie mają PIN-u - tylko MG (potwierdzone
//     przez usera).
// Wybór jest czysto lokalny (localStorage, wygoda ponownego otwarcia na tym samym urządzeniu) -
// NIE jest częścią stanu kampanii. PIN JEST częścią stanu (state.mgPin).

import { getState } from "./store.js";

const LAST_ROLE_KEY = "hysteriaHighest.lastRole";
const LAST_PAIR_KEY = "hysteriaHighest.lastPairKey";

const gateEl = document.getElementById("characterGate");
const appEl = document.getElementById("app");

const stepRoleEl = document.getElementById("gateStepRole");
const stepPinEl = document.getElementById("gateStepPin");
const stepPairEl = document.getElementById("gateStepPair");

const roleMgBtn = document.getElementById("gateRoleMg");
const rolePlayerBtn = document.getElementById("gateRolePlayer");

const pinInputsEl = document.getElementById("gatePinInputs");
const pinNextBtn = document.getElementById("gatePinNext");
const pinBackBtn = document.getElementById("gatePinBack");
const pinErrorEl = document.getElementById("gatePinError");

const pairListEl = document.getElementById("gatePairList");
const pairErrorEl = document.getElementById("gatePairError");
const pairBackBtn = document.getElementById("gatePairBack");

const gateCancelBtn = document.getElementById("gateCancel");

let wired = false;
let currentData = null;
let currentOnDone = null;
let currentAllowCancel = false;
let pinGroup = null;

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
    stepPairEl.style.display = "none";
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

function characterName(key) {
    const c = currentData?.characters?.characters?.find(ch => ch.key === key);
    return c ? c.name : key;
}

function showPairStep() {
    hideAllSteps();
    pairErrorEl.style.display = "none";
    const pairs = currentData?.characters?.pairs ?? [];
    const lastKey = localStorage.getItem(LAST_PAIR_KEY);
    pairListEl.innerHTML = pairs.map(p => `
        <button class="gate-pair-btn ${p.key === lastKey ? "last-used" : ""}" data-pair="${p.key}">
            <span class="gate-pair-player">${p.player}</span>
            <span class="gate-pair-chars">${p.characters.map(characterName).join(" / ")}</span>
        </button>
    `).join("");
    stepPairEl.style.display = "block";
}

function finish(role, pairKey) {
    localStorage.setItem(LAST_ROLE_KEY, role);
    if (pairKey) localStorage.setItem(LAST_PAIR_KEY, pairKey);
    hideGate();
    const pair = pairKey ? currentData?.characters?.pairs?.find(p => p.key === pairKey) : null;
    if (currentOnDone) {
        currentOnDone({
            role,
            pairKey: pairKey || null,
            characterKeys: pair ? pair.characters : null
        });
    }
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

    roleMgBtn.addEventListener("click", showPinStep);
    rolePlayerBtn.addEventListener("click", showPairStep);

    pinGroup = createPinDigitGroup(pinInputsEl, {
        onChange: updatePinNextState,
        onEnter: () => { if (!pinNextBtn.disabled) checkPin(); }
    });

    pinBackBtn.addEventListener("click", showRoleStep);
    pinNextBtn.addEventListener("click", checkPin);

    pairBackBtn.addEventListener("click", showRoleStep);

    pairListEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".gate-pair-btn");
        if (!btn) return;
        finish("player", btn.dataset.pair);
    });

    gateCancelBtn.addEventListener("click", () => {
        if (!currentAllowCancel) return;
        hideGate();
    });
}

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
