# Wsad do nowego chatu: dashboard dla Dark Graal (na wzór glide2solo)

Ten dokument to kompletny kontekst startowy dla nowej sesji czatu, w której będziemy
przerabiać architekturę dashboardu `glide2solo` (Glide: Part Two — solo RPG) na nowy
system/setting: **Dark Graal**. Wklej ten plik (albo jego treść) na start nowego chatu.

---

## 1. Co już istnieje i co jest tu wzorcem

Projekt `glide2solo/` w tym repo (`DiceRollerWebsite/`) to w pełni działający,
sprawdzony w praktyce (pierwsza prawdziwa sesja już się odbyła) dashboard do gry solo:
karta postaci, zasoby, questy, mapa, dziennik, kontakty, rzuty na tabele — wszystko
zapisywane na żywo do Firebase Realtime Database. Chcemy **skopiować wzorzec
architektoniczny 1:1**, a wymienić tylko treść systemową (zasady, statystyki, tabele,
mechaniki Dark Graala).

Ważne: `darkgraal3/` (istniejący folder w tym repo) to **NIE jest** porównywalny
dashboard — to osobny, prosty roller (dowolna kość/ilość/modyfikator, bez karty
postaci, bez stanu gry) plus niepowiązana funkcja transmisji audio GM przez WebRTC
(`gmpanel.html`/`.js` — nadawca, `script.js` — odbiornik), oba używające Firebase RTDB
tylko jako płaskiego logu rzutów (`rollsDarkGraal3`) i sygnalizacji WebRTC
(`GMaudiostream`). **W repo nie ma obecnie żadnej treści systemowej Dark Graala**
(statystyk, tabel, kart postaci) — to trzeba będzie dostarczyć od nowa w nowym chacie.

---

## 2. Architektura do skopiowania (wzorzec z glide2solo)

### Stack
- Zero bundlera, zero build-stepu. Czysty `<script type="module">` + natywny `fetch()`.
- Dane systemowe (tabele, zasady) jako statyczne pliki `data/*.json`, wczytywane raz
  przy starcie.
- Firebase Realtime Database jako jedyna warstwa trwałości (bez Firestore, bez Storage
  w aktywnym użyciu).

### Kluczowe pliki i ich rola (do odtworzenia jeden do jednego)

**`js/firebase.js`** — konfiguracja Firebase + `DB_ROOT` + `watchState`/`persistState`:
```js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

const firebaseConfig = { /* ...patrz sekcja 4 niżej... */ };

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export const DB_ROOT = "DarkGraal3dashboard"; // patrz sekcja 4 — decyzja o nazwie/bazie

function pathFor(saveKey) { return `${DB_ROOT}/${saveKey}`; }

let detachCurrent = null;

export function watchState(saveKey, callback) {
    if (detachCurrent) { detachCurrent(); detachCurrent = null; }
    detachCurrent = onValue(
        ref(database, pathFor(saveKey)),
        (snapshot) => callback(snapshot.exists() ? snapshot.val() : null, null),
        (error) => callback(null, error)
    );
    return detachCurrent;
}

export function persistState(saveKey, state) {
    return set(ref(database, pathFor(saveKey)), state);
}
```
Wzorzec: jeden JSON-drzewo per "zapis" (postać), kluczowany zsanityzowaną nazwą
(`sanitizeNameToKey`) pod jednym `DB_ROOT`. Reguły `.read`/`.write` ustawione na węźle
`DB_ROOT` obejmują wszystkie dzieci — nic nie trzeba zmieniać w konsoli Firebase przy
dodawaniu nowych postaci.

**`js/store.js`** — centralny store pub/sub + debounce zapisu:
- `initStore(loadedGameData)`, `getSaveKey()`, `connectSave(saveKey)` (Promise, wpina
  `watchState`), `getState()`, `getData()`, `subscribe(fn)`, `notify()`, `notifyNow()`,
  `updateState(updater)`, `touch()`, `scheduleSave()` z debounce `SAVE_DEBOUNCE_MS = 600`.
- Wzorzec: `updateState(fn)` mutuje stan → `notify()` do wszystkich subskrybentów →
  zaplanowany (debounced) zapis do Firebase. `touch()` do wywołania notify+save bez
  zmiany danych (np. po ręcznej mutacji obiektu stanu).

**`js/main.js`** — bootstrap i routing paneli:
- `PANELS` = obiekt `{ tabKey: panelModule }`.
- `renderAll()` — pętla po `PANELS`, wywołuje `panel.render(root, {state, data})` dla
  każdego `#panel-{tab}`, całość owinięta w `preserveScroll()`.
- `bootstrap()`: `loadGameData() → initStore() → subscribe(renderAll) → setupTabs() →
  setupSaveIndicator() → showGate(gameData, {...})`.
- `localStorage` używany WYŁĄCZNIE do UX (zapamiętanie ostatniego imienia do
  pre-wypełnienia pola), nigdy jako źródło prawdy o stanie gry.

**`js/data.js`** — wczytywanie danych systemowych:
```js
const FILES = ["mechanics", "..."]; // lista nazw bazowych plików w data/

export async function loadGameData() {
    const entries = await Promise.all(
        FILES.map(async (name) => {
            const res = await fetch(`data/${name}.json`);
            if (!res.ok) throw new Error(`Nie udało się wczytać data/${name}.json (HTTP ${res.status})`);
            return [name, await res.json()];
        })
    );
    return Object.fromEntries(entries);
}
```
Dla Dark Graala: trzeba będzie zdefiniować własną listę plików JSON odpowiadającą
strukturze reguł tej gry (patrz sekcja 3 — czego brakuje).

**`js/state.js`** — kształt stanu gry + migracje:
- `createDefaultState(gameData)` — pełny domyślny kształt stanu. W glide2solo zawiera
  Glide-specyficzne pola (statystyki H/K/R/C/F, stamina/momentum/intel/credits/fame,
  glider, companion, guildBonds, quests, mapa, journal, contacts, events) — **to
  wszystko trzeba przeprojektować od zera pod kartę postaci/zasoby Dark Graala**.
- Portowalne wprost wzorce:
  - `migrateLoadedState(loaded)` — migracja starych kształtów zapisu (np. tablica →
    mapa kluczowana slugiem) wywoływana PRZED mergem.
  - `mergeWithDefaults(defaults, loaded)` — głębokie scalanie wczytanego stanu z
    domyślnym, iterujące po **sumie kluczy** defaults ORAZ loaded (nie tylko
    defaults!) — żeby nie ucinać dynamicznych kluczy (np. slugów przedmiotów)
    nieznanych z góry. Kluczowe dla forward-compatibility zapisów po zmianach schematu.
  - Drobne helpery w stylu `bondLevelFromPoints`, `applyRole` — wzorzec "funkcja
    mutująca fragment stanu wg reguł systemu", do odtworzenia z własną logiką.

**`js/utils.js`** — biblioteka narzędziowa, część systemowo-specyficzna, część
generyczna:
- Do WYMIANY (specyficzne dla Glide 2): `rollD100()` jako 2k10 (kość dziesiątek +
  kość jedności, 0&0→100), `rollD2`/`rollD5` derywowane z rzutu k10 wg mapowań z
  podręcznika Glide. **Dla Dark Graala trzeba od nowa wyprowadzić mechanikę kości z
  jego własnych zasad** — nie zakładać, że cokolwiek z tego się przenosi.
- Portowalne wprost (generyczne): `uid()`, `rollDie(sides)`, `parseRange()`,
  `findInRangeTable(table, rollValue, field)` (odczyt z tabel zakresowych typu
  `{range: "1-5", ...}`, z defensywnym fallbackiem do najbliższego niższego przy
  lukach), `clamp()`, `getPath`/`setPath`, `escapeHtml()`, `sanitizeNameToKey()`,
  `preserveScroll(fn)` (zachowuje `window.scrollY` wokół przebudowy DOM),
  `formatTimestamp()`.

**`index.html`** — szkielet DOM:
- Wieloetapowa `#characterGate` (imię → opcjonalny PIN → wybór roli + ustawienie PIN-u
  dla nowych postaci).
- `#app` shell: header (licznik dnia, przyciski akcji, wskaźnik zapisu), nawigacja
  zakładek, sekcje `<section id="panel-{tab}">` per panel, footer ze statusem bootu.
- Jeden `<script type="module" src="js/main.js">`.
- Elementy specyficzne dla Glide (licznik dnia, przycisk obozowania, endgame overlay)
  do przemyślenia pod kątem tego, czy Dark Graal ma analogiczne koncepty (np. dni,
  odpoczynek, "koniec kampanii").

### Wzorzec panelu (`js/panels/*.js`)
Każdy panel eksportuje `render(root, {state, data})`, który przy KAŻDEJ zmianie stanu
w pełni przebudowuje `root.innerHTML`. Żeby listenery nie ginęły/nie dublowały się
przy każdym rebuildzie:
```js
export function render(root, ctx) {
    root.innerHTML = buildHtml(ctx);
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
        // switch/if po action, czytając dalsze data-* atrybuty
    });
}
```
Delegacja zdarzeń na jednym listenerze + atrybuty `data-action`/`data-*` zamiast
osobnych listenerów per element — kluczowe, bo `render()` niszczy i odtwarza cały DOM
panelu.

**Wzorzec komunikatu blokującego** (zamiast `window.alert()`): lokalny `ui = {...}`
(nie zapisywany do Firebase) z polem np. `blockedMsg: string|null`, ustawiane +
`rerender()` panelu + renderowane warunkowo jako `<p class="placeholder">{msg}</p>`,
czyszczone przy kolejnej udanej akcji. Wyjątek: `window.confirm()` nadal używany
pragmatycznie do akcji destrukcyjnych (kasowanie wpisów w dzienniku itp.) — konwencja
"bez popupów" dotyczy tylko alert/prompt jako input/notyfikacji, nie wszystkich
dialogów.

**Panele lokalne z transient UI**: złożone panele (rzuty, wybory w toku) trzymają
lokalny `ui` z własnym `rerender()` owiniętym w `preserveScroll()`.

### Logowanie rzutów i zdarzeń (dwa osobne, ale współwyświetlane strumienie)
- `js/rollLog.js` — `logRoll(table, rollText, resultText)`, samowystarczalny (sam woła
  `updateState`).
- `js/eventLog.js` — `EVENT_TYPE_LABELS` (mapa etykiet typu zdarzenia → do
  zdefiniowania od nowa dla Dark Graala) + `logEvent(state, type, text)` — TUTAJ
  wywołujący musi sam wywołać `touch()` osobno (w przeciwieństwie do `logRoll`).
- Oba strumienie (plus swobodne wpisy dziennika) łączone i wyświetlane razem w
  panelu dziennika, grupowane wg dnia, najnowsze na górze.

### Bramka wejścia (`js/gate.js`)
Wieloetapowy proces: wpisanie imienia → (jeśli istnieje zapis z PIN-em) wpisanie PIN-u
→ (dla nowej postaci) wybór roli + ustawienie PIN-u → `showGate(gameData, {initialName,
allowCancel, onDone})`, wołane raz z `main.js#bootstrap()`. PIN to **ochrona
aplikacyjna, nie bezpieczeństwo** — reguły Firebase pod danym `DB_ROOT` są otwarte.

---

## 3. Czego brakuje i trzeba dostarczyć w nowym chacie

W repo nie ma ŻADNEJ wyekstrahowanej treści zasad Dark Graala. W Glide 2 to było 12
plików JSON (`mechanics, companions, guilds, economy, gear, desert, ruins,
green_space, unique_locations, oracles, npc_flavor, endgame`) wyekstrahowanych z
podręcznika. Dla Dark Graala trzeba będzie w nowym chacie dostarczyć/omówić:
- Kartę postaci: jakie statystyki/atrybuty, jakie zasoby (odpowiedniki
  stamina/momentum/credits/fame z Glide), jak wygląda postęp/rozwój postaci.
- Mechanikę kości: jaki system rzutów (k100? k20? własny?), czy są jakieś derywowane
  rzuty (jak `rollD2`/`rollD5` z k10 w Glide) czy proste rzuty natywne.
- Tabele losowe specyficzne dla settingu (odpowiedniki desert/ruins/green_space,
  unique_locations, oracles, npc_flavor z Glide) — jeśli Dark Graal ma mapę/eksplorację.
- Questy/frakcje/gildie — czy jest odpowiednik guildBonds/guildJobs, czy inna struktura.
- Ekwipunek/sprzęt — czy jest odpowiednik systemu gear/mods z wear (zużyciem).
- Czy gra ma koncept "dni"/upływu czasu, obozowania, wydarzeń podróży (travelEvents.js
  w Glide) — czy to specyficzne tylko dla Glide (glider = statek/pojazd).
- Czy jest koncept "endgame"/zakończenia kampanii z bonusowymi cechami (jak
  endgame.json w Glide) — do potwierdzenia, czy Dark Graal to potrzebuje.

Innymi słowy: **cała warstwa `data/*.json` + `state.js#createDefaultState` +
mechanika kości w `utils.js` musi być zaprojektowana od zera** na bazie faktycznych
zasad Dark Graala, które user dostarczy w nowym chacie. Architektura dookoła
(store/panele/firebase/gate/logowanie) przenosi się practically 1:1.

---

## 4. Firebase: decyzja do podjęcia

User poprosił o zapis w "database o nazwie DarkGraal3dashboard". Dwie możliwe
interpretacje:

**Opcja A (rekomendowana)** — nowy węzeł/root w tej samej, współdzielonej domyślnej
instancji RTDB projektu `dicerollerwebsite` (dokładnie ten sam wzorzec co
`GlidePartTwoSolo` w glide2solo i `rollsDarkGraal3` w darkgraal3):
```js
const firebaseConfig = {
    apiKey: "AIzaSyD7PRIk5KhfY-sMda_-w1V5XW2n0yexpMo",
    authDomain: "dicerollerwebsite.firebaseapp.com",
    projectId: "dicerollerwebsite",
    databaseURL: "https://dicerollerwebsite-default-rtdb.europe-west1.firebasedatabase.app/",
    storageBucket: "dicerollerwebsite.appspot.com",
    messagingSenderId: "117039589628",
    appId: "1:117039589628:web:1fc0ffa255db93a878cf79"
};
export const DB_ROOT = "DarkGraal3dashboard";
```
Zero konfiguracji w konsoli Firebase — działa od razu, bo reguły na poziomie
"otwarte dla zalogowanych/wszystkich" (jak reszta projektu) obejmują nowy węzeł
automatycznie. To dokładnie ta sama konwencja co reszta repo.

**Opcja B** — faktycznie osobna, dodatkowa nazwana instancja RTDB w tym samym
projekcie Firebase (Firebase wspiera wiele baz RTDB per projekt). Wymaga: utworzenia
nowej instancji w konsoli Firebase Console, nadania jej własnego `databaseURL`, i
osobnego ustawienia reguł `.read`/`.write` dla tej instancji (bo reguły nie
dziedziczą się między instancjami). Realna izolacja danych (np. inne reguły
bezpieczeństwa, inny region), ale wymaga ręcznej pracy w konsoli, której nie da się
zrobić z tego chatu.

**Rekomendacja**: iść w Opcję A, chyba że user ma konkretny powód do prawdziwej
izolacji (np. inne reguły dostępu, inny region danych, chęć osobnego rozliczania
usage). Nazwa `"DarkGraal3dashboard"` jako nazwa węzła (`DB_ROOT`) spełnia literalnie
to, o co user prosił ("baza o nazwie..."), bez dodatkowej pracy w konsoli.

---

## 5. Rekomendacja: umiejscowienie folderu projektu

Nowy dashboard **nie powinien** wchodzić do istniejącego `darkgraal3/` — ten folder
hostuje żywy, prawdopodobnie wdrożony prosty roller + transmisję audio GM (własne
`index.html`/`script.js`/`styles.css`, netlify.toml), którego nie chcemy nadpisać
ani zdestabilizować.

**Rekomendacja**: nowy sibling-folder w tym samym repo, np.
`darkgraal3dashboard/` (ten właśnie, w którym powstał ten plik) — struktura
lustrzana do `glide2solo/`:
```
darkgraal3dashboard/
├── index.html
├── data/           (nowe pliki JSON z zasadami Dark Graala)
├── js/
│   ├── main.js
│   ├── store.js
│   ├── data.js
│   ├── state.js
│   ├── utils.js
│   ├── firebase.js
│   ├── gate.js
│   ├── rollLog.js
│   ├── eventLog.js
│   └── panels/
└── BRIEFING.md     (ten plik)
```

---

## 6. Bonus (opcjonalnie, do potwierdzenia z userem)

`darkgraal3/gmpanel.js` + `script.js` zawierają gotową, działającą funkcję transmisji
audio GM przez WebRTC (Firebase RTDB jako sygnalizacja pod węzłem `GMaudiostream`) —
nadawca (`gmpanel.js`: wybór urządzenia, `getUserMedia`, `RTCPeerConnection`, wymiana
ICE candidates) i odbiornik (`script.js`, druga połowa pliku). To **osobna, gotowa do
przeniesienia funkcja**, niezwiązana z treścią systemową gry — warto zapytać usera w
nowym chacie, czy chce ją zintegrować z nowym dashboardem (np. jako dodatkowy panel
"Audio GM"), zanim się to założy.

---

## 7. Sugerowany pierwszy krok w nowym chacie

1. Potwierdzić z userem: Opcję A vs B dla Firebase (sekcja 4) i umiejscowienie folderu
   (sekcja 5) — chyba że ten briefing ma być traktowany jako już zaakceptowana
   rekomendacja domyślna (w takim wypadku można od razu jechać dalej).
   2. Zebrać od usera podstawy zasad Dark Graala (sekcja 3) — przynajmniej: mechanikę
      kości, kartę postaci/zasoby, i czy jest mapa/eksploracja/questy w podobnym stylu
      do Glide, żeby wiedzieć, które panele z glide2solo mają swoje odpowiedniki, a które
      trzeba zaprojektować od zera albo pominąć.
3. Zbudować szkielet: `index.html` (gate + app shell) + `js/{main,store,data,utils,
   state,firebase,gate,rollLog,eventLog}.js` wg wzorców z sekcji 2, z pustym/minimalnym
   `data/` i jednym prostym panelem (np. karta postaci) jako pierwszym pionowym
   przekrojem do przetestowania całego potoku (wczytanie → edycja → zapis do
   Firebase → odczyt po odświeżeniu).
4. Iteracyjnie dodawać kolejne panele wg tego, jak wygląda karta postaci/zasady Dark
   Graala.
