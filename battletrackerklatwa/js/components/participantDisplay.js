// Battle Tracker - Klątwa Strahda. Nazwa i portret uczestnika do wyświetlenia - dla potworów z
// więcej niż jedną formą nazwa dokleja aktualną formę, np. "Baba Lysaga (Matka Wiedźm)" /
// "Baba Lysaga (Z Bagna)".

export function participantDisplayName(state, participant) {
    if (participant.sourceType !== "monster") return participant.name;
    const monster = state.library.monsters[participant.sourceId];
    if (!monster || monster.forms.length < 2) return participant.name;
    const form = monster.forms.find((f) => f.formId === participant.formId);
    if (!form) return participant.name;
    return `${participant.name} (${form.label})`;
}

/** Portret uczestnika - CELOWO odczytywany na żywo z biblioteki (party/monsters) po sourceId,
 *  a nie skopiowany na uczestnika przy tworzeniu walki, żeby zmiana portretu w bibliotece
 *  odświeżyła się od razu we WSZYSTKICH już utworzonych walkach bez potrzeby usuwania walki -
 *  ten sam wzorzec co already-live nazwa formy potwora powyżej. */
export function participantPortrait(state, participant) {
    if (participant.sourceType === "party") {
        return state.library.party[participant.sourceId]?.portrait || null;
    }
    return state.library.monsters[participant.sourceId]?.portrait || null;
}
