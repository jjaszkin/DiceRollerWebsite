// GLIDE: Part Two — Ekran startowy: wybór/utworzenie zapisu (imię Poszukiwacza) + kreator roli.
//
// Do trzech etapów przepływ (krok PIN pomijany, gdy nie dotyczy):
//   Krok 1 (imię) — użytkownik wpisuje imię Poszukiwacza. Zsanityzowana wersja imienia
//   (patrz utils.js#sanitizeNameToKey) staje się kluczem zapisu w Firebase, pod
//   GlidePartTwoSolo/{klucz} — patrz store.js#connectSave. Istniejące imię wczytuje
//   istniejący zapis (kontynuacja tej samej postaci), nowe imię tworzy nową, pustą
//   równoległą grę solo.
//   Krok 1.5 (PIN, opcjonalny) — pokazywany tylko, gdy wczytany zapis ma już ustawiony
//   PIN (patrz state.js#character.pin) i NIE jest to samo-edycja aktualnie aktywnej
//   postaci (patrz goToRoleOrFinish/checkPin). To bramka po stronie aplikacji przeciwko
//   przypadkowemu/niepożądanemu wczytaniu cudzego zapisu po samym imieniu — NIE jest to
//   prawdziwe zabezpieczenie bazy (reguły Firebase pod GlidePartTwoSolo są otwarte).
//   Krok 2 (rola + PIN) — pokazywany tylko, gdy wczytany zapis nie ma jeszcze ustawionej
//   roli (nowa postać, wymaga też ustawienia nowego PIN-u), albo gdy użytkownik edytuje
//   AKTUALNIE aktywną postać (np. przez „Zmień postać” na tej samej postaci, żeby
//   świadomie zmienić rolę i/albo PIN). Przy przełączeniu się na inną, już skonfigurowaną
//   postać (po ewentualnym kroku PIN) krok roli jest pomijany — dashboard od razu
//   pokazuje wczytany stan.
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
import { sanitizeNameToKey, clamp } from "./utils.js";
import { applyRole } from "./state.js";
import { generateName } from "./nameGenerator.js";
import { logEvent } from "./eventLog.js";
import { placeMemorialHex } from "./panels/map.js";
import { peekPendingBridge, consumePendingBridge } from "./endgameBridge.js";

const gateEl = document.getElementById("characterGate");
const appEl = document.getElementById("app");

const stepNameEl = document.getElementById("gateStepName");
const stepPinEl = document.getElementById("gateStepPin");
const stepRoleEl = document.getElementById("gateStepRole");

const subNameEl = document.getElementById("gateSubName");
const nameInput = document.getElementById("gateName");
const nameErrorEl = document.getElementById("gateNameError");
const nameNextBtn = document.getElementById("gateNameNext");
const randomNameBtn = document.getElementById("gateRandomName");
const cancelBtn = document.getElementById("gateCancel");

const subPinEl = document.getElementById("gateSubPin");
const pinInputsEl = document.getElementById("gatePinInputs");
const pinErrorEl = document.getElementById("gatePinError");
const pinBackBtn = document.getElementById("gatePinBack");
const pinNextBtn = document.getElementById("gatePinNext");

const subRoleEl = document.getElementById("gateSubRole");
const roleSelect = document.getElementById("gateRole");
const previewEl = document.getElementById("gateRolePreview");
const setPinInputsEl = document.getElementById("gateSetPinInputs");
const roleErrorEl = document.getElementById("gateRoleError");
const backBtn = document.getElementById("gateBack");
const submitBtn = document.getElementById("gateSubmit");

let wired = false;
let currentData = null;
let currentOnDone = null;
let pendingDisplayName = "";
// Zapis wczytany po kroku imienia, którego pokazanie (krok Roli albo od razu finish()) czeka na
// weryfikację PIN-u — patrz showPinStep()/checkPin() niżej. Ustawiane tylko, gdy dany zapis ma
// już ustawiony PIN i nie jest to samo-edycja aktualnie aktywnej postaci (patrz goToRoleOrFinish).
let pendingLoadedState = null;
let pendingIsSelfEdit = false;

// Kontrolery grup 4 osobnych pól cyfr PIN-u (patrz createPinDigitGroup niżej) — przypisywane
// dopiero w wireOnce(), bo dopiero tam wiążemy faktyczne inputy z DOM-u z resztą logiki.
let pinGroup = null;
let setPinGroup = null;

/** Owija 4 osobne inputy cyfr (jeden na cyfrę PIN-u, patrz index.html#gatePinInputs/
 *  #gateSetPinInputs) w jeden logiczny "input" — z .value (get/set stringa 0-4 cyfr) i .focus() —
 *  żeby reszta modułu (checkPin, submitBtn, updateSubmitState itd.) mogła traktować grupę
 *  tak samo jak zwykłe pojedyncze pole tekstowe. Obsługuje: auto-przeskok do następnego pola po
 *  wpisaniu cyfry, Backspace na pustym polu cofa do poprzedniego, strzałki lewo/prawo, wklejenie
 *  całego PIN-u naraz (rozdziela cyfry po kolejnych polach) i zaznaczenie zawartości przy fokusie
 *  (żeby wpisanie nowej cyfry nadpisywało starą zamiast być blokowane przez maxlength=1). */
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

function updatePinNextState() {
    pinErrorEl.style.display = "none";
    pinNextBtn.disabled = !/^\d{4}$/.test(pinGroup.value);
}

function updateSubmitState() {
    roleErrorEl.style.display = "none";
    const roleOk = parseInt(roleSelect.value, 10) >= 0;
    const pinOk = /^\d{4}$/.test(setPinGroup.value);
    submitBtn.disabled = !(roleOk && pinOk);
}

function showNameStep() {
    stepPinEl.style.display = "none";
    stepRoleEl.style.display = "none";
    stepNameEl.style.display = "block";
    nameInput.focus();
}

function showPinStep() {
    stepNameEl.style.display = "none";
    stepRoleEl.style.display = "none";
    pinGroup.value = "";
    updatePinNextState();
    subPinEl.textContent = `Zapis „${pendingDisplayName}” jest zabezpieczony PIN-em. Podaj PIN, żeby go wczytać.`;
    stepPinEl.style.display = "block";
    pinGroup.focus();
}

function showRoleStep() {
    stepNameEl.style.display = "none";
    stepPinEl.style.display = "none";
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

    // Zapis ma ustawiony PIN i nie jest to samo-edycja aktualnie aktywnej postaci (ta jest już
    // "zalogowana" w tej sesji, patrz showGate/wywołania z panels/character.js) — wymagamy
    // podania PIN-u, zanim cokolwiek pokażemy (patrz showPinStep/checkPin niżej).
    if (loadedState.character.role && loadedState.character.pin && !isSelfEdit) {
        pendingLoadedState = loadedState;
        pendingIsSelfEdit = isSelfEdit;
        showPinStep();
        return;
    }

    proceedAfterAuth(loadedState, isSelfEdit);
}

/** Woła się po tym, jak dostęp do zapisu jest już potwierdzony — od razu (brak ustawionego PIN-u
 *  albo samo-edycja aktywnej postaci), albo dopiero po poprawnie podanym PIN-ie (patrz checkPin). */
function proceedAfterAuth(loadedState, isSelfEdit) {
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
    subRoleEl.textContent = `Wybierz rolę dla: ${pendingDisplayName}`;
    setPinGroup.value = loadedState.character.pin || "";
    updateSubmitState();
    showRoleStep();
}

/** Sprawdza PIN podany na kroku gateStepPin przeciwko temu z pendingLoadedState (patrz
 *  goToRoleOrFinish). Zła próba tylko czyści pole i pokazuje błąd — bez limitu prób, to nie
 *  prawdziwe zabezpieczenie bazy (patrz komentarz przy character.pin w state.js), tylko bramka
 *  po stronie aplikacji przeciwko przypadkowemu/niepożądanemu wczytaniu cudzego zapisu. */
function checkPin() {
    const val = pinGroup.value;
    if (val === pendingLoadedState.character.pin) {
        const state = pendingLoadedState;
        const selfEdit = pendingIsSelfEdit;
        pendingLoadedState = null;
        proceedAfterAuth(state, selfEdit);
    } else {
        pinErrorEl.textContent = "Nieprawidłowy PIN.";
        pinErrorEl.style.display = "block";
        pinGroup.value = "";
        pinGroup.focus();
    }
}

/** Konsumuje (odczytuje + usuwa z localStorage) ewentualny most Nowej Twarzy i stosuje jego
 *  efekt (Cecha Spuścizny, patrz data/endgame.json#legacy_traits) na świeżo utworzonej postaci
 *  `state`, tuż po applyRole() w submitBtn handlerze niżej — to jedyne miejsce, w którym most
 *  jest w ogóle konsumowany, więc efekt aplikuje się dokładnie raz, niezależnie od tego, ile razy
 *  gracz wcześniej otworzy/zamknie ekran startowy (peekPendingBridge w showGate() tylko podgląda,
 *  nie usuwa). Brak mostu (zwykłe utworzenie/edycja postaci bez przejścia przez endgame.js) to
 *  normalny, najczęstszy przypadek — funkcja wtedy nic nie robi. */
function applyPendingBridgeIfAny(state) {
    const bridge = consumePendingBridge();
    if (!bridge || bridge.type !== "new-face") return;

    // Zabezpieczenie: most jest przeznaczony dla NOWEJ postaci. Jeśli gracz zignorował adnotację
    // (patrz showGate) i wpisał to samo imię co poprzednik, NIE aplikujemy efektu — to nie byłaby
    // Nowa Twarz, tylko przypadkowo nadpisana rola tej samej, starej postaci. Most i tak został
    // już skonsumowany (usunięty) wyżej, więc nie zaaplikuje się przy kolejnej, właściwej próbie —
    // gracz musiałby ponownie przejść przez ekran Rozdroża, co jest akceptowalne dla tego rzadkiego
    // przypadku świadomego zignorowania instrukcji.
    if (bridge.previousName && sanitizeNameToKey(bridge.previousName) === getSaveKey()) return;

    const trait = currentData?.endgame?.legacy_traits?.find(t => t.id === bridge.traitId);
    if (!trait) return;
    const effect = trait.effect || {};
    const ch = state.character;

    if (typeof effect.credits === "number") ch.resources.credits += effect.credits;
    if (typeof effect.scrap === "number") ch.glider.scrap.cur += effect.scrap;

    if (typeof effect.statBonus === "number" && bridge.subChoice && ch.stats[bridge.subChoice] !== undefined) {
        ch.stats[bridge.subChoice] = clamp(ch.stats[bridge.subChoice] + effect.statBonus, 0, 5);
    }

    if (typeof effect.guildBondPoints === "number" && bridge.subChoice && state.guildBonds[bridge.subChoice]) {
        state.guildBonds[bridge.subChoice].points = Math.max(state.guildBonds[bridge.subChoice].points, effect.guildBondPoints);
    }

    if (effect.grantGear && effect.grantGear.name) {
        const slug = sanitizeNameToKey(effect.grantGear.name);
        // wear: 0 = świeży/nieużywany przedmiot (licznik rośnie w stronę max wraz z użyciem —
        // patrz mechanics.json#resources.gear.wear_per_item i panels/gear.js).
        ch.gear[slug] = { owned: true, equipped: !!effect.grantGear.equipped, wear: 0 };
    }

    logEvent(state, "endgame", `Nowa Twarz dziedziczy Cechę Spuścizny: „${trait.name_pl}” (po „${bridge.previousName || "poprzedniku"}”).`);

    // Pomnik poprzednika na mapie nowej postaci (Sektor 0 — start) — wołane na końcu, bo
    // placeMemorialHex samo woła touch()/notify() (patrz panels/map.js), więc powinno nastąpić
    // dopiero po tym, jak wszystkie inne mutacje stanu w tej funkcji są już zastosowane.
    placeMemorialHex(state, 0, bridge.previousName || "Poprzednik");
}

function wireOnce() {
    if (wired) return;
    wired = true;

    nameInput.addEventListener("input", updateNameNextState);
    nameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !nameNextBtn.disabled) goToRoleOrFinish();
    });
    nameNextBtn.addEventListener("click", goToRoleOrFinish);

    // Losuje imię i wstawia je do pola — nie zatwierdza niczego samo z siebie, gracz nadal musi
    // kliknąć "Dalej" (albo je najpierw poprawić/odrzucić), dokładnie jak przy ręcznym wpisywaniu.
    randomNameBtn.addEventListener("click", () => {
        nameInput.value = generateName(currentData);
        updateNameNextState();
        nameInput.focus();
    });

    cancelBtn.addEventListener("click", () => {
        currentOnDone = null;
        hideGate();
    });

    roleSelect.addEventListener("change", () => {
        const idx = parseInt(roleSelect.value, 10);
        renderPreview(idx >= 0 ? currentData.mechanics.seeker_roles[idx] : null);
        updateSubmitState();
    });

    setPinGroup = createPinDigitGroup(setPinInputsEl, { onChange: updateSubmitState });

    backBtn.addEventListener("click", () => {
        showNameStep();
    });

    pinGroup = createPinDigitGroup(pinInputsEl, {
        onChange: updatePinNextState,
        onEnter: () => { if (!pinNextBtn.disabled) checkPin(); }
    });
    pinNextBtn.addEventListener("click", checkPin);
    pinBackBtn.addEventListener("click", () => {
        pendingLoadedState = null;
        showNameStep();
    });

    submitBtn.addEventListener("click", () => {
        const idx = parseInt(roleSelect.value, 10);
        if (idx < 0) {
            roleErrorEl.textContent = "Wybierz rolę, żeby kontynuować.";
            roleErrorEl.style.display = "block";
            return;
        }
        const pin = setPinGroup.value;
        if (!/^\d{4}$/.test(pin)) {
            roleErrorEl.textContent = "Podaj 4-cyfrowy PIN, żeby zabezpieczyć ten zapis.";
            roleErrorEl.style.display = "block";
            return;
        }
        const role = currentData.mechanics.seeker_roles[idx];
        updateState((s) => {
            s.character.name = pendingDisplayName;
            s.character.pin = pin;
            applyRole(s.character, role);
            applyPendingBridgeIfAny(s);
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

    // Adnotacja "Nowa Twarz": jeśli czeka most z endgame.js (Ścieżka A, patrz endgameBridge.js),
    // informujemy gracza, że wpisywane tu imię tworzy następcę, który odziedziczy Cechę Spuścizny
    // — most sam w sobie jest konsumowany dopiero przy faktycznym utworzeniu postaci (patrz
    // submitBtn handler niżej), więc samo jego istnienie tu tylko czytamy (peek), nie usuwamy.
    const pendingBridge = peekPendingBridge();
    subNameEl.textContent = (pendingBridge && pendingBridge.type === "new-face")
        ? `Nowa Twarz — poprzednia postać: ${pendingBridge.previousName || "?"}. Podaj imię nowej postaci, żeby przejęła Cechę Spuścizny: „${pendingBridge.traitName || "?"}”.`
        : "Wpisz imię Poszukiwacza, żeby rozpocząć nową grę albo wczytać istniejący zapis";

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
