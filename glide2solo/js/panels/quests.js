// Panel: Tracker questów. Bond Level i nagrody gildii są już widoczne w karcie postaci (Faza 2) —
// tutaj śledzimy postęp konkretnych Guild Jobs (misji) oraz Odd-Jobs (fuch) zapisanych w stanie gry.
import { getState, getData, touch } from "../store.js";
import { logEvent } from "../eventLog.js";

const STATUS_LABELS = { available: "Dostępna", active: "Aktywna", completed: "Ukończona" };

/** Wg zasad podręcznika: Seeker może mieć jednocześnie tylko 1 aktywną Guild Mission (globalnie, przez wszystkie gildie). */
function anyGuildMissionActive(state) {
    return Object.values(state.quests.guildJobs).some(list => list.some(j => j.status === "active"));
}

function renderMission(g, mission, jobState, blockActivate) {
    const status = jobState?.status || "available";
    return `
        <div class="entry" style="margin-top:8px;">
            <div class="entry-meta">
                <span>#${mission.number} — ${g.name_pl}</span>
                <span>${STATUS_LABELS[status]}</span>
            </div>
            <div class="entry-result"><strong>${mission.name}</strong></div>
            <p>${mission.task}</p>
            ${mission.test ? `<p class="placeholder"><strong>Test:</strong> ${mission.test}</p>` : ""}
            <p><strong>Major:</strong> ${mission.major}</p>
            <p><strong>Minor:</strong> ${mission.minor}</p>
            <p><strong>Miss:</strong> ${mission.miss}</p>
            <div class="counter-controls">
                ${status === "available" ? `<button class="btn btn-sm btn-primary" data-action="mission-activate" data-guild="${g.id}" data-num="${mission.number}" ${blockActivate ? "disabled title=\"Masz już aktywną Guild Mission\"" : ""}>Rozpocznij</button>` : ""}
                ${status === "active" ? `
                    <button class="btn btn-sm" data-action="mission-complete" data-guild="${g.id}" data-num="${mission.number}">Ukończ</button>
                    <button class="btn btn-sm btn-secondary" data-action="mission-cancel" data-guild="${g.id}" data-num="${mission.number}">Anuluj</button>
                ` : ""}
                ${status === "completed" ? `<button class="btn btn-sm btn-secondary" data-action="mission-reset" data-guild="${g.id}" data-num="${mission.number}">Rozpocznij ponownie</button>` : ""}
            </div>
        </div>
    `;
}

/** Stan fuchy (state.quests.oddJobs) trzyma tylko { id, range, name, status } — pełny opis
 *  (lokacja, opis fabularny, zadanie, test, nagroda, porażka) jest w katalogu
 *  data.guilds.odd_jobs_table_d100 i dociągany tu po nazwie (unikalna w tabeli 20 wpisów,
 *  patrz roller.js rollOddJobs/acceptOddJob). Bez tego po wzięciu fuchy nie było widać,
 *  na czym w ogóle polega — tylko nazwa i status. */
function renderOddJob(job, oddJobsTable) {
    const entry = oddJobsTable.find(e => e.name === job.name);
    return `
        <div class="entry" style="margin-top:8px;">
            <div class="entry-meta">
                <span>d100 ${job.range}${entry?.location_type ? ` — ${entry.location_type}` : ""}</span>
                <span>${STATUS_LABELS[job.status] || job.status}</span>
            </div>
            <div class="entry-result"><strong>${job.name}</strong></div>
            ${entry ? `
                ${entry.description ? `<p>${entry.description}</p>` : ""}
                ${entry.task ? `<p><strong>Zadanie:</strong> ${entry.task}</p>` : ""}
                ${entry.test ? `<p class="placeholder"><strong>Test:</strong> ${entry.test}</p>` : ""}
                ${entry.reward ? `<p><strong>Nagroda:</strong> ${entry.reward}</p>` : ""}
                ${entry.fail ? `<p><strong>Porażka:</strong> ${entry.fail}</p>` : ""}
            ` : `<p class="placeholder">Brak opisu w katalogu (nazwa fuchy nie została odnaleziona).</p>`}
            <div class="counter-controls">
                ${job.status === "active" ? `<button class="btn btn-sm" data-action="oddjob-complete" data-id="${job.id}">Ukończ</button>` : ""}
                <button class="btn btn-sm btn-secondary" data-action="oddjob-remove" data-id="${job.id}">Usuń</button>
            </div>
        </div>
    `;
}

export function render(root, { state, data }) {
    const guilds = data.guilds?.guilds ?? [];
    const oddJobsTable = data.guilds?.odd_jobs_table_d100 ?? [];
    const blockActivate = anyGuildMissionActive(state);
    const activeOddJobs = state.quests.oddJobs.filter(j => j.status === "active");
    const completedOddJobs = state.quests.oddJobs.filter(j => j.status === "completed");

    root.innerHTML = `
        <p class="placeholder">${data.guilds?.rules?.guild_missions ?? ""}</p>

        <div class="grid grid-2">
            ${guilds.map(g => `
                <div class="card">
                    <h2>${g.name_pl}</h2>
                    ${(state.quests.guildJobs[g.id] ?? []).map(js => {
                        const mission = (g.missions ?? []).find(m => m.number === js.number);
                        return mission ? renderMission(g, mission, js, blockActivate) : "";
                    }).join("")}
                </div>
            `).join("")}
        </div>

        <div class="card" style="margin-top:12px;">
            <h2>Odd-Jobs — Aktywne (${activeOddJobs.length}/2)</h2>
            ${activeOddJobs.length ? activeOddJobs.map(j => renderOddJob(j, oddJobsTable)).join("") : `<p class="placeholder">Brak aktywnych zleceń. Rzuć w karcie Roller → Odd-Jobs Table.</p>`}
        </div>

        ${completedOddJobs.length ? `
            <div class="card" style="margin-top:12px;">
                <h2>Odd-Jobs — Ukończone</h2>
                ${completedOddJobs.map(j => renderOddJob(j, oddJobsTable)).join("")}
            </div>
        ` : ""}
    `;

    if (!root.dataset.wired) {
        wireEvents(root);
        root.dataset.wired = "1";
    }
}

function wireEvents(root) {
    root.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const state = getState();

        if (action === "mission-activate" || action === "mission-complete" || action === "mission-cancel" || action === "mission-reset") {
            const guildId = btn.dataset.guild;
            const num = parseInt(btn.dataset.num, 10);
            const job = (state.quests.guildJobs[guildId] ?? []).find(j => j.number === num);
            if (!job) return;
            const g = (getData().guilds?.guilds ?? []).find(gg => gg.id === guildId);
            const mission = (g?.missions ?? []).find(m => m.number === num);
            const missionLabel = `"${mission?.name ?? `#${num}`}" (${g?.name_pl ?? guildId})`;
            if (action === "mission-activate") {
                if (anyGuildMissionActive(state)) return;
                job.status = "active";
                logEvent(state, "quest-start", `Rozpoczęto misję gildii ${missionLabel}.`);
            } else if (action === "mission-complete") {
                job.status = "completed";
                logEvent(state, "quest-complete", `Ukończono misję gildii ${missionLabel}.`);
            } else if (action === "mission-cancel") {
                job.status = "available";
            } else if (action === "mission-reset") {
                job.status = "available";
            }
            touch();
        } else if (action === "oddjob-complete") {
            const job = state.quests.oddJobs.find(j => j.id === btn.dataset.id);
            if (job) {
                job.status = "completed";
                logEvent(state, "quest-complete", `Ukończono fuchę "${job.name}".`);
                touch();
            }
        } else if (action === "oddjob-remove") {
            state.quests.oddJobs = state.quests.oddJobs.filter(j => j.id !== btn.dataset.id);
            touch();
        }
    });
}
