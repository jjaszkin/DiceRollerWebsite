// Battle Tracker - Klątwa Strahda. Współdzielony, czysto opisowy render statbloku (nagłówek,
// atrybuty, cechy) - używany zarówno w bibliotece uczestników (podgląd), jak i w panelu akcji
// (pełny widok + przyciski "Użyj" dorzucane osobno przez actionPanel.js).

import { escapeHtml } from "../utils.js";

export function abilityMod(score) {
    return Math.floor((Number(score ?? 10) - 10) / 2);
}

export function fmtMod(n) {
    return n >= 0 ? `+${n}` : `${n}`;
}

export const ABILITY_LABELS = { str: "SIŁ", dex: "ZWI", con: "KON", int: "INT", wis: "MDR", cha: "CHA" };

export function buildAbilityRowHtml(abilities) {
    const keys = ["str", "dex", "con", "int", "wis", "cha"];
    return `
        <div class="statblock-abilities">
            ${keys.map((k) => {
                const score = abilities?.[k] ?? 10;
                return `<div class="ability-box"><div class="ability-label">${ABILITY_LABELS[k]}</div><div class="ability-score">${score}</div><div class="ability-mod">${fmtMod(abilityMod(score))}</div></div>`;
            }).join("")}
        </div>
    `;
}

export function buildStatblockHeaderHtml(form) {
    const line = (label, value) => value ? `<div class="statblock-line"><strong>${label}</strong> ${value}</div>` : "";
    return `
        <div class="statblock-header">
            <div class="statblock-title">${escapeHtml(form.label || "")}</div>
            <div class="statblock-subtitle">${escapeHtml(form.sizeType || "")}</div>
            ${line("Klasa Pancerza", `${form.ac ?? "-"}${form.acNote ? ` (${escapeHtml(form.acNote)})` : ""}`)}
            ${line("Punkty Wytrzymałości", `${form.hp?.max ?? "-"}${form.hpNote ? ` (${escapeHtml(form.hpNote)})` : ""}`)}
            ${line("Szybkość", escapeHtml(form.speed || "-"))}
            ${buildAbilityRowHtml(form.abilities)}
            ${line("Rzuty Obronne", form.savingThrows ? escapeHtml(form.savingThrows) : "")}
            ${line("Umiejętności", form.skills ? escapeHtml(form.skills) : "")}
            ${line("Odporności", form.resistances?.length ? form.resistances.map(escapeHtml).join(", ") : "")}
            ${line("Immunitety", form.immunities?.length ? form.immunities.map(escapeHtml).join(", ") : "")}
            ${line("Podatności", form.vulnerabilities?.length ? form.vulnerabilities.map(escapeHtml).join(", ") : "")}
            ${line("Odporności na Warunki", form.conditionImmunities?.length ? form.conditionImmunities.map(escapeHtml).join(", ") : "")}
            ${line("Zmysły", escapeHtml(form.senses || "-"))}
            ${line("Języki", escapeHtml(form.languages || "-"))}
            ${line("Stopień Wyzwania", escapeHtml(form.cr || "-"))}
        </div>
    `;
}

export function buildTraitsHtml(traits) {
    if (!traits?.length) return "";
    return `<div class="statblock-traits">${traits.map((t) => `<p><strong>${escapeHtml(t.name)}.</strong> ${escapeHtml(t.text)}</p>`).join("")}</div>`;
}
