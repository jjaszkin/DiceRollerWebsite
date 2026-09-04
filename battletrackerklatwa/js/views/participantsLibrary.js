// Battle Tracker - Klątwa Strahda. Tab "Uczestnicy": listing BG + bestiariusza z biblioteki,
// lekka edycja podstawowych statystyk (KP/PW/bonus inicjatywy), podgląd statbloku, usuwanie.

import { getState, updateState } from "../store.js";
import { escapeHtml, uid } from "../utils.js";
import { buildStatblockHeaderHtml, buildTraitsHtml, ABILITY_LABELS, abilityMod, fmtMod } from "../components/statblock.js";
import { openConfirm } from "../components/confirmModal.js";
import { openImagePicker } from "../components/imagePicker.js";

const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

// Czysto lokalny stan UI (nie zapisywany do Firebase) - które wiersze mają rozwiniętą sekcję
// "Statystyki". Bez tego edycja JAKIEGOKOLWIEK pola w środku (np. wynik cechy) wywołuje
// updateState -> pełny re-render całego widoku -> sekcja wraca do domyślnie zwiniętej, więc
// wpisanie kilku pól z rzędu wymagałoby ciągłego doklikiwania "Statystyki" na nowo.
const expandedRows = new Set();

export function renderParticipantsLibrary(root) {
    const state = getState();
    const party = Object.values(state.library.party || {});
    const monsters = Object.values(state.library.monsters || {});

    root.innerHTML = `
        <div class="view-head"><h2>Uczestnicy</h2></div>

        <section class="card participants-section">
            <h3>Bohaterowie Graczy</h3>
            <div class="participants-list">
                ${party.map(renderPartyRow).join("") || '<p class="placeholder">Brak BG w bibliotece.</p>'}
            </div>
            <form class="add-party-form" id="addPartyForm">
                <input type="text" name="name" placeholder="Imię" required>
                <input type="text" name="race" placeholder="Rasa">
                <input type="text" name="class" placeholder="Klasa">
                <button type="submit" class="btn btn-sm btn-primary">+ Dodaj BG</button>
            </form>
        </section>

        <section class="card participants-section">
            <h3>Stworzenia i wrogowie</h3>
            <div class="participants-list">
                ${monsters.map(renderMonsterRow).join("") || '<p class="placeholder">Brak stworzeń w bibliotece.</p>'}
            </div>
        </section>
    `;

    wirePartyRows(root, state);
    wireMonsterRows(root, state);

    root.querySelector("#addPartyForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const name = String(fd.get("name") || "").trim();
        if (!name) return;
        const id = uid();
        updateState((s) => {
            s.library.party[id] = {
                id,
                name,
                race: String(fd.get("race") || "").trim(),
                class: String(fd.get("class") || "").trim(),
                level: null,
                proficiencyBonus: null,
                ac: null,
                acNote: "",
                hp: { current: null, max: null },
                abilities: { str: null, dex: null, con: null, int: null, wis: null, cha: null },
                saves: { str: null, dex: null, con: null, int: null, wis: null, cha: null },
                initiativeBonus: 0,
                notes: ""
            };
        });
    });
}

function renderPartyRow(p) {
    return `
        <div class="participant-row party-row" data-party-id="${p.id}">
            <div class="participant-row-head">
                ${renderPortraitPicker(p.portrait, "party-portrait-btn")}
                <div class="participant-row-name">${escapeHtml(p.name)}<span class="participant-row-sub">${escapeHtml(p.race)} ${escapeHtml(p.class)}</span></div>
                <label class="participant-field">KP <input type="number" class="party-ac-input" value="${p.ac ?? ""}" min="0"></label>
                <label class="participant-field">PW maks. <input type="number" class="party-hpmax-input" value="${p.hp?.max ?? ""}" min="0"></label>
                <label class="participant-field">Bonus inicjatywy <input type="number" class="party-init-input" value="${p.initiativeBonus ?? 0}"></label>
                <button type="button" class="btn btn-sm party-expand-btn">Statystyki</button>
                <button type="button" class="btn btn-icon btn-sm party-delete-btn" title="Usuń">×</button>
            </div>
            <div class="party-row-detail${expandedRows.has(p.id) ? "" : " hidden"}">
                <div class="party-detail-fields">
                    <label>Poziom <input type="number" class="party-level-input" value="${p.level ?? ""}" min="1"></label>
                    <label>Bonus biegłości <input type="number" class="party-prof-input" value="${p.proficiencyBonus ?? ""}"></label>
                    <label class="party-acnote-field">Notatka do KP <input type="text" class="party-acnote-input" value="${escapeHtml(p.acNote || "")}" placeholder="np. 18+ w Dzikim Kształcie"></label>
                </div>
                <div class="party-ability-grid">
                    ${ABILITY_KEYS.map((key) => {
                        const score = p.abilities?.[key];
                        return `
                            <div class="party-ability-box">
                                <div class="party-ability-label">${ABILITY_LABELS[key]}</div>
                                <input type="number" class="party-ability-score-input" data-ability="${key}" value="${score ?? ""}" placeholder="wynik">
                                <div class="party-ability-mod">${score != null ? fmtMod(abilityMod(score)) : "-"}</div>
                                <input type="number" class="party-ability-save-input" data-ability="${key}" value="${p.saves?.[key] ?? ""}" placeholder="ST">
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>
        </div>
    `;
}

function renderMonsterRow(m) {
    const activeForm = m.forms.find((f) => f.formId === m.activeFormId) || m.forms[0];
    const formOptions = m.forms
        .map((f) => `<option value="${f.formId}" ${f.formId === m.activeFormId ? "selected" : ""}>${escapeHtml(f.label)}</option>`)
        .join("");
    return `
        <div class="participant-row monster-row" data-monster-id="${m.id}">
            <div class="participant-row-head">
                ${renderPortraitPicker(m.portrait, "monster-portrait-btn")}
                <div class="participant-row-name">${escapeHtml(m.name)}</div>
                ${m.forms.length > 1 ? `<select class="monster-form-select">${formOptions}</select>` : ""}
                <button type="button" class="btn btn-sm monster-expand-btn">Statystyki</button>
                <button type="button" class="btn btn-icon btn-sm monster-delete-btn" title="Usuń">×</button>
            </div>
            <div class="monster-row-summary">KP ${activeForm?.ac ?? "-"} - PW ${activeForm?.hp?.max ?? "-"} - ST ${escapeHtml(activeForm?.cr || "-")}</div>
            <div class="monster-row-detail${expandedRows.has(m.id) ? "" : " hidden"}">
                ${buildStatblockHeaderHtml(activeForm)}
                ${buildTraitsHtml(activeForm.traits)}
            </div>
        </div>
    `;
}

function renderPortraitPicker(portrait, btnClass) {
    return `
        <div class="portrait-picker">
            ${portrait ? `<img class="portrait-thumb" src="${escapeHtml(portrait)}" alt="">` : '<div class="portrait-thumb portrait-thumb-empty"></div>'}
            <button type="button" class="btn btn-xs ${btnClass}" title="Zmień portret">Portret</button>
        </div>
    `;
}

function wirePartyRows(root, state) {
    root.querySelectorAll(".participant-row[data-party-id]").forEach((rowEl) => {
        const id = rowEl.dataset.partyId;

        rowEl.querySelector(".party-expand-btn")?.addEventListener("click", () => {
            if (expandedRows.has(id)) expandedRows.delete(id); else expandedRows.add(id);
            rowEl.querySelector(".party-row-detail").classList.toggle("hidden");
        });
        rowEl.querySelector(".party-portrait-btn").addEventListener("click", () => {
            openImagePicker({
                current: state.library.party[id]?.portrait ?? null,
                onSelect: (file) => updateState((s) => { s.library.party[id].portrait = file; })
            });
        });

        rowEl.querySelector(".party-ac-input").addEventListener("change", (e) => {
            const val = e.target.value === "" ? null : Number(e.target.value);
            updateState((s) => { s.library.party[id].ac = val; });
        });
        rowEl.querySelector(".party-hpmax-input").addEventListener("change", (e) => {
            const val = e.target.value === "" ? null : Number(e.target.value);
            updateState((s) => {
                const p = s.library.party[id];
                p.hp ??= { current: null, max: null };
                p.hp.max = val;
                if (p.hp.current == null) p.hp.current = val;
            });
        });
        rowEl.querySelector(".party-init-input").addEventListener("change", (e) => {
            updateState((s) => { s.library.party[id].initiativeBonus = Number(e.target.value) || 0; });
        });
        rowEl.querySelector(".party-level-input").addEventListener("change", (e) => {
            const val = e.target.value === "" ? null : Number(e.target.value);
            updateState((s) => { s.library.party[id].level = val; });
        });
        rowEl.querySelector(".party-prof-input").addEventListener("change", (e) => {
            const val = e.target.value === "" ? null : Number(e.target.value);
            updateState((s) => { s.library.party[id].proficiencyBonus = val; });
        });
        rowEl.querySelector(".party-acnote-input").addEventListener("change", (e) => {
            updateState((s) => { s.library.party[id].acNote = e.target.value; });
        });
        rowEl.querySelectorAll(".party-ability-score-input").forEach((input) => {
            input.addEventListener("change", (e) => {
                const key = input.dataset.ability;
                const val = e.target.value === "" ? null : Number(e.target.value);
                updateState((s) => {
                    const p = s.library.party[id];
                    p.abilities ??= {};
                    p.abilities[key] = val;
                });
            });
        });
        rowEl.querySelectorAll(".party-ability-save-input").forEach((input) => {
            input.addEventListener("change", (e) => {
                const key = input.dataset.ability;
                const val = e.target.value === "" ? null : Number(e.target.value);
                updateState((s) => {
                    const p = s.library.party[id];
                    p.saves ??= {};
                    p.saves[key] = val;
                });
            });
        });
        rowEl.querySelector(".party-delete-btn").addEventListener("click", () => {
            const name = state.library.party[id]?.name || "";
            openConfirm({
                title: "Usunąć BG?",
                message: `Usunąć "${name}" z biblioteki? Nie usunie to uczestnika z już utworzonych walk.`,
                onConfirm: () => updateState((s) => { delete s.library.party[id]; })
            });
        });
    });
}

function wireMonsterRows(root, state) {
    root.querySelectorAll(".participant-row[data-monster-id]").forEach((rowEl) => {
        const id = rowEl.dataset.monsterId;

        rowEl.querySelector(".monster-expand-btn")?.addEventListener("click", () => {
            if (expandedRows.has(id)) expandedRows.delete(id); else expandedRows.add(id);
            rowEl.querySelector(".monster-row-detail").classList.toggle("hidden");
        });
        rowEl.querySelector(".monster-portrait-btn").addEventListener("click", () => {
            openImagePicker({
                current: state.library.monsters[id]?.portrait ?? null,
                onSelect: (file) => updateState((s) => { s.library.monsters[id].portrait = file; })
            });
        });
        rowEl.querySelector(".monster-form-select")?.addEventListener("change", (e) => {
            updateState((s) => { s.library.monsters[id].activeFormId = e.target.value; });
        });
        rowEl.querySelector(".monster-delete-btn").addEventListener("click", () => {
            const name = state.library.monsters[id]?.name || "";
            openConfirm({
                title: "Usunąć stworzenie?",
                message: `Usunąć "${name}" z biblioteki? Nie usunie to uczestnika z już utworzonych walk.`,
                onConfirm: () => updateState((s) => { delete s.library.monsters[id]; })
            });
        });
    });
}
