// GLIDE: Part Two — generator losowych imion w klimacie pustynnego sci-fi (Dune/Sable). Treść
// (data/npc_flavor.json) to własna, ręcznie dobrana pula — nie pochodzi z podręcznika. Współdzielony
// przez ekran startowy (gate.js, przycisk "Wylosuj imię") i generator napotkanych postaci
// (panels/contacts.js) — patrz też data/npc_flavor.json#_meta.notes.
//
// Pula dzieli się na dwie części o innym charakterze brzmieniowym:
//   - names_alien (60)  — krótkie, "mruczane" obcobrzmiące imiona (np. "Stom", "Chirthi").
//     Zawsze samodzielne — epitet obok nich brzmiałby nienaturalnie (zderzenie stylu).
//   - names_proper (160) — "twarde", Dune-owe imiona (np. "Zerath", "Draevon"), część już
//     gotowych dwuczłonowych (np. "Zyn Varek").
// name_epithets (20) — przydomki ("Sandstrider", "Stormcaller"...) doklejane WYŁĄCZNIE do
// jednoczłonowych imion z names_proper, z ~30% szansą — daje losowe dwuczłonowe kombinacje
// (np. "Zerath Sandstrider") bez ryzyka trójczłonowych potworków ani zderzenia stylu z pulą alien.

const EPITHET_CHANCE = 0.3;

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

/** Losuje jedno imię z puli data.npc_flavor. `data` to wynik loadGameData() (js/data.js). */
export function generateName(data) {
    const flavor = data?.npc_flavor;
    if (!flavor) return "";

    const alien = flavor.names_alien || [];
    const proper = flavor.names_proper || [];
    const epithets = flavor.name_epithets || [];

    const pool = [...alien, ...proper];
    if (!pool.length) return "";

    let name = pick(pool);
    const isProperSingleWord = proper.includes(name) && !name.includes(" ");
    if (isProperSingleWord && epithets.length && Math.random() < EPITHET_CHANCE) {
        name = `${name} ${pick(epithets)}`;
    }
    return name;
}
