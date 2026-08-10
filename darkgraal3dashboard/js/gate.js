// Dark Graal III - Dashboard Solo (MG). Ekran startowy - uproszczony względem glide2solo (nie ma
// tu "zapisów"/imion do wpisania: kampania jest jedna i wspólna, już połączona z Firebase zanim
// gate w ogóle się pokazuje, patrz main.js#bootstrap). Gate pyta tylko, KTO patrzy:
//   Krok 1 - rola: „Mistrz Gry” albo „Gracz”.
//   Krok 2 (tylko dla „Gracz”) - wybór jednej z 4 postaci z listy (data/characters.json).
// Wybór jest CZYSTO lokalny (localStorage, do wygody ponownego otwarcia na tym samym urządzeniu) -
// NIE jest częścią stanu kampanii zapisywanego do Firebase (patrz state.js).

const LAST_ROLE_KEY = "darkGraal3.lastRole";
const LAST_CHARACTER_KEY = "darkGraal3.lastCharacterKey";

const gateEl = document.getElementById("characterGate");
const appEl = document.getElementById("app");

const stepRoleEl = document.getElementById("gateStepRole");
const stepCharacterEl = document.getElementById("gateStepCharacter");

const roleMgBtn = document.getElementById("gateRoleMg");
const rolePlayerBtn = document.getElementById("gateRolePlayer");

const characterSelect = document.getElementById("gateCharacterSelect");
const characterNextBtn = document.getElementById("gateCharacterNext");
const characterBackBtn = document.getElementById("gateCharacterBack");
const characterErrorEl = document.getElementById("gateCharacterError");

let wired = false;
let currentData = null;
let currentOnDone = null;

function showRoleStep() {
    stepCharacterEl.style.display = "none";
    stepRoleEl.style.display = "block";
}

function showCharacterStep() {
    stepRoleEl.style.display = "none";
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

function wireOnce() {
    if (wired) return;
    wired = true;

    roleMgBtn.addEventListener("click", () => finish("mg", null));

    rolePlayerBtn.addEventListener("click", () => {
        showCharacterStep();
    });

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
}

/**
 * Pokazuje ekran startowy (wybór roli + ew. postaci).
 * @param {object} data - wczytane dane gry (potrzebna lista postaci z data/characters.json)
 * @param {object} [opts]
 * @param {(sel: {role: "mg"|"player", characterKey: string|null}) => void} [opts.onDone]
 */
export function showGate(data, { onDone = null } = {}) {
    currentData = data;
    currentOnDone = onDone;
    wireOnce();

    showRoleStep();

    gateEl.classList.add("active");
    appEl.classList.add("hidden");
}

export function hideGate() {
    gateEl.classList.remove("active");
    appEl.classList.remove("hidden");
}
