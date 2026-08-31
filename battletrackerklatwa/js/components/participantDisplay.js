// Battle Tracker - Klątwa Strahda. Nazwa uczestnika do wyświetlenia - dla potworów z więcej niż
// jedną formą dokleja aktualną formę, np. "Baba Lysaga (Matka Wiedźm)" / "Baba Lysaga (Z Bagna)".

export function participantDisplayName(state, participant) {
    if (participant.sourceType !== "monster") return participant.name;
    const monster = state.library.monsters[participant.sourceId];
    if (!monster || monster.forms.length < 2) return participant.name;
    const form = monster.forms.find((f) => f.formId === participant.formId);
    if (!form) return participant.name;
    return `${participant.name} (${form.label})`;
}
