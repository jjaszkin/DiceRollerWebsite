// Battle Tracker - Klątwa Strahda. Mini-kreator nowej walki: nazwa, uczestnicy z biblioteki
// (BG + bestiariusz), arena (miejsce, modyfikatory środowiskowe, specjalne cechy).

import { uid, escapeHtml } from "../utils.js";

export function openBattleCreator({ state, onCreate }) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    const partyEntries = Object.values(state.library.party || {});
    const monsterEntries = Object.values(state.library.monsters || {});

    backdrop.innerHTML = `
        <div class="modal battle-creator-modal">
            <h2>Nowa walka</h2>

            <label class="creator-field">
                <span>Nazwa walki</span>
                <input type="text" id="battleNameInput" placeholder="np. Finał w Berezie">
            </label>

            <h3>Uczestnicy</h3>
            <div class="creator-participants">
                <div class="creator-column">
                    <h4>Bohaterowie Graczy</h4>
                    <div class="creator-checklist">
                        ${partyEntries.map((p) => `
                            <label class="creator-check">
                                <input type="checkbox" class="party-check" value="${p.id}">
                                ${escapeHtml(p.name)} <span class="creator-check-sub">(${escapeHtml(p.race)} ${escapeHtml(p.class)})</span>
                            </label>
                        `).join("") || '<p class="placeholder">Brak BG w bibliotece.</p>'}
                    </div>
                </div>
                <div class="creator-column">
                    <h4>Stworzenia i wrogowie</h4>
                    <div class="creator-checklist">
                        ${monsterEntries.map((m) => `
                            <label class="creator-check">
                                <input type="checkbox" class="monster-check" value="${m.id}">
                                ${escapeHtml(m.name)}
                            </label>
                        `).join("") || '<p class="placeholder">Brak stworzeń w bibliotece.</p>'}
                    </div>
                </div>
            </div>

            <h3>Arena</h3>
            <label class="creator-field">
                <span>Miejsce</span>
                <input type="text" id="arenaLocationInput" placeholder="np. Bagno Berezu, przed chatką">
            </label>
            <label class="creator-field">
                <span>Modyfikatory środowiskowe (jeden na linię)</span>
                <textarea id="arenaModifiersInput" rows="3" placeholder="np. Trudny teren w promieniu 20 stóp"></textarea>
            </label>
            <label class="creator-field">
                <span>Specjalne cechy (jedna na linię)</span>
                <textarea id="arenaFeaturesInput" rows="3" placeholder="np. Zapadające się deski podłogowe"></textarea>
            </label>

            <p class="creator-error hidden" id="creatorError">Podaj nazwę walki.</p>

            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" data-action="cancel">Anuluj</button>
                <button type="button" class="btn btn-primary" data-action="create">Utwórz walkę</button>
            </div>
        </div>
    `;

    function close() { backdrop.remove(); }

    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) close(); });
    backdrop.querySelector('[data-action="cancel"]').addEventListener("click", close);
    backdrop.querySelector('[data-action="create"]').addEventListener("click", () => {
        const name = backdrop.querySelector("#battleNameInput").value.trim();
        if (!name) {
            backdrop.querySelector("#creatorError").classList.remove("hidden");
            return;
        }

        const participants = [];

        backdrop.querySelectorAll(".party-check:checked").forEach((el) => {
            const p = state.library.party[el.value];
            if (!p) return;
            participants.push({
                instanceId: uid(),
                sourceType: "party",
                sourceId: p.id,
                formId: null,
                name: p.name,
                ac: p.ac ?? null,
                acNote: p.acNote || "",
                hp: { current: p.hp?.max ?? null, max: p.hp?.max ?? null },
                initiative: 0,
                conditions: []
            });
        });

        backdrop.querySelectorAll(".monster-check:checked").forEach((el) => {
            const m = state.library.monsters[el.value];
            if (!m) return;
            const form = m.forms.find((f) => f.formId === m.activeFormId) || m.forms[0];
            participants.push({
                instanceId: uid(),
                sourceType: "monster",
                sourceId: m.id,
                formId: form?.formId ?? null,
                name: m.name,
                ac: form?.ac ?? null,
                hp: { current: form?.hp?.max ?? null, max: form?.hp?.max ?? null },
                initiative: 0,
                conditions: [],
                reactionsUsedThisRound: 0,
                secondaryTrackers: (form?.secondaryTrackers || []).map((t) => ({
                    id: t.id,
                    label: t.label,
                    ac: t.ac ?? null,
                    hp: { current: t.hp?.max ?? null, max: t.hp?.max ?? null },
                    active: false,
                    acBonus: t.acBonus ?? 0
                }))
            });
        });

        const battle = {
            id: uid(),
            name,
            createdAt: Date.now(),
            arena: {
                location: backdrop.querySelector("#arenaLocationInput").value.trim(),
                environmentalModifiers: splitLines(backdrop.querySelector("#arenaModifiersInput").value),
                specialFeatures: splitLines(backdrop.querySelector("#arenaFeaturesInput").value)
            },
            round: 1,
            turnIndex: 0,
            participants
        };

        close();
        onCreate(battle);
    });

    document.body.appendChild(backdrop);
}

function splitLines(text) {
    return String(text || "").split("\n").map((s) => s.trim()).filter(Boolean);
}
