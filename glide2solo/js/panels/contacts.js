// Panel: Znajomości — generator napotkanych NPC-ów do szybkiego wykorzystania przy losowych
// spotkaniach w terenie (kilka słów-kluczy wyglądu/zachowania, imię, lokacja oraz opcjonalnie
// frakcja i pochodzenie — patrz npcGenerator.js#generateNpc). Frakcja/Pochodzenie są losowane
// tylko, gdy gracz zaznaczy odpowiedni checkbox PRZED losowaniem (includeFaction/includeOrigin
// niżej) — to jego decyzja, czy te informacje mają się w ogóle pojawić. Wylosowany NPC to tylko
// PODGLĄD: stan lokalny UI (`draft`), nietrwały, taki sam wzorzec jak `ui`/`rerender()` w
// roller.js — dopiero "Zapisz NPCa" dopisuje go do state.contacts (trwała lista Znajomości tej
// postaci).
import { getState, touch } from "../store.js";
import { generateNpc } from "../npcGenerator.js";
import { uid, escapeHtml } from "../utils.js";
import { logEvent } from "../eventLog.js";

let draft = null; // aktualnie wylosowany, jeszcze niezapisany NPC (albo null)
let includeFaction = true; // stan checkboxa "losuj Frakcję" — lokalny UI, nietrwały
let includeOrigin = true;  // stan checkboxa "losuj Pochodzenie" — lokalny UI, nietrwały
let currentRoot = null;
let currentData = null;

function rerender() {
    if (currentRoot) render(currentRoot, { state: getState(), data: currentData });
}

function renderFactionLine(faction) {
    return faction ? `<p><strong>Frakcja:</strong> ${escapeHtml(faction.name_pl)}</p>` : "";
}

function renderOriginLine(origin) {
    return origin ? `<p><strong>Pochodzenie:</strong> ${escapeHtml(origin)}</p>` : "";
}

function renderDraft(npc) {
    return `
        <div class="entry" style="margin-top:10px;">
            <div class="entry-meta">
                <span>${escapeHtml(npc.location)}</span>
            </div>
            <div class="entry-result"><strong>${escapeHtml(npc.name)}</strong></div>
            ${renderFactionLine(npc.faction)}
            ${renderOriginLine(npc.origin)}
            <p>${npc.keywords.map(escapeHtml).join(" · ")}</p>
            <div class="counter-controls">
                <button class="btn btn-sm btn-primary" data-action="npc-save">Zapisz NPCa</button>
                <button class="btn btn-sm btn-secondary" data-action="npc-roll">Losuj ponownie</button>
                <button class="btn btn-sm btn-secondary" data-action="npc-discard">Odrzuć</button>
            </div>
        </div>
    `;
}

function renderSavedContact(c) {
    return `
        <div class="entry" style="margin-top:8px;">
            <div class="entry-meta">
                <span>Dzień ${c.day} — ${escapeHtml(c.location)}</span>
                <button class="btn btn-sm btn-icon" data-action="contact-delete" data-id="${c.id}" title="Usuń ze Znajomości">×</button>
            </div>
            <div class="entry-result"><strong>${escapeHtml(c.name)}</strong></div>
            ${renderFactionLine(c.faction)}
            ${renderOriginLine(c.origin)}
            <p>${(c.keywords ?? []).map(escapeHtml).join(" · ")}</p>
        </div>
    `;
}

export function render(root, { state, data }) {
    currentRoot = root;
    currentData = data;

    const contacts = [...(state.contacts ?? [])].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    root.innerHTML = `
        <div class="card">
            <h2>Losuj NPCa</h2>
            <p class="placeholder">Losuje napotkaną postać: kilka słów-kluczy wyglądu/zachowania, imię, lokację i (opcjonalnie) frakcję oraz pochodzenie. Wylosowany NPC to tylko podgląd — zapisz go, żeby trafił do Znajomości.</p>
            <label class="counter-row">
                <span class="counter-label">Losuj Frakcję</span>
                <input type="checkbox" data-field="include-faction" ${includeFaction ? "checked" : ""}>
            </label>
            <label class="counter-row">
                <span class="counter-label">Losuj Pochodzenie</span>
                <input type="checkbox" data-field="include-origin" ${includeOrigin ? "checked" : ""}>
            </label>
            <button class="btn btn-primary" data-action="npc-roll">🎲 Losuj NPCa</button>
            ${draft ? renderDraft(draft) : ""}
        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Znajomości (${contacts.length})</h2>
            ${contacts.length ? contacts.map(renderSavedContact).join("") : `<p class="placeholder">Brak zapisanych NPC-ów — wylosuj i zapisz pierwszego powyżej.</p>`}
        </div>
    `;

    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}

function wireEvents(root) {
    root.addEventListener("change", (e) => {
        const field = e.target.dataset.field;
        if (field === "include-faction") {
            includeFaction = e.target.checked;
        } else if (field === "include-origin") {
            includeOrigin = e.target.checked;
        }
    });

    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;

        if (action === "npc-roll") {
            draft = generateNpc(currentData, { includeFaction, includeOrigin });
            rerender();
        } else if (action === "npc-discard") {
            draft = null;
            rerender();
        } else if (action === "npc-save") {
            if (!draft) return;
            const state = getState();
            if (!state.contacts) state.contacts = [];
            state.contacts.push({
                id: uid(),
                day: state.day.current,
                name: draft.name,
                faction: draft.faction,
                keywords: draft.keywords,
                location: draft.location,
                origin: draft.origin,
                savedAt: Date.now()
            });
            logEvent(state, "contact-added", `Poznano nową postać: ${draft.name}${draft.faction ? ` (${draft.faction.name_pl})` : ""}.`);
            draft = null;
            touch();
        } else if (action === "contact-delete") {
            if (!window.confirm("Usunąć tego NPC-a ze Znajomości?")) return;
            const state = getState();
            state.contacts = (state.contacts ?? []).filter(c => c.id !== btn.dataset.id);
            touch();
        }
    });
}
