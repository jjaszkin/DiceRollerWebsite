import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
    getDatabase, ref, push, set, onValue, onDisconnect, remove
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-database.js";

// ── Firebase ───────────────────────────────────────────────────────────────────

const firebaseConfig = {
    apiKey: "AIzaSyD7PRIk5KhfY-sMda_-w1V5XW2n0yexpMo",
    authDomain: "dicerollerwebsite.firebaseapp.com",
    projectId: "dicerollerwebsite",
    databaseURL: "https://dicerollerwebsite-default-rtdb.europe-west1.firebasedatabase.app/",
    storageBucket: "dicerollerwebsite.appspot.com",
    messagingSenderId: "117039589628",
    appId: "1:117039589628:web:1fc0ffa255db93a878cf79"
};

const app      = initializeApp(firebaseConfig, 'lite-hh-moves');
const database = getDatabase(app);

const DB_PATH = 'rollsHysteriaHighest';

// ── Helpers ────────────────────────────────────────────────────────────────────

const pad = n => n.toString().padStart(2, '0');
function formatTimestamp(date) {
    const yy = String(date.getFullYear()).slice(-2);
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${yy} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const DICE_SVG_ENTRY = `<svg class="entry-dice-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/></svg>`;
const DICE_SVG_RESULT = `<svg class="dice-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/></svg>`;

const SIDES_OPTIONS = [2, 4, 6, 8, 10, 12, 20, 100];

// ── Ruchy podstawowe ───────────────────────────────────────────────────────────

const MOVES = [
    {
        id: 'dzialaj-pod-presja',
        name: 'Działaj pod presją',
        attr: '+Opanowanie',
        intro: 'Za każdym razem, gdy robisz coś ryzykownego, pod presją czasu lub usiłujesz uniknąć zagrożenia, MG opisuje konsekwencje potencjalnej porażki.',
        high: 'Robisz to, co zamierzałeś.',
        mid:  'Udaje ci się, jednak wahasz się, działasz z opóźnieniem lub sprawy się gmatwają – MG opisuje nieoczekiwane skutki, wysoką cenę lub trudny wybór.',
        low:  'Występują poważne konsekwencje, robisz błąd lub wystawiasz się na zagrożenie. MG wykonuje Ruch.'
    },
    {
        id: 'przystap-do-walki',
        name: 'Przystąp do walki',
        attr: '+Przemoc',
        intro: 'Za każdym razem, gdy przystępujesz do walki z przeciwnikiem, który może stanowić wyzwanie, opisz, jak zamierzasz ją prowadzić.',
        high: 'Zadajesz przeciwnikowi obrażenia i unikasz kontrataków.',
        mid:  'Zadajesz obrażenia, ale MG wybiera jedną z możliwości:\n◊ Padasz ofiarą kontrataku.\n◊ Zadajesz mniej obrażeń, niż zamierzałeś.\n◊ Tracisz coś istotnego.\n◊ Zużywasz całą amunicję.\n◊ Pojawia się nowe zagrożenie.\n◊ Wpadniesz później w kłopoty.',
        low:  'Twój atak nie kończy się tak, jak zakładałeś. Może masz pecha, może pudłujesz lub ponosisz wysoką cenę. MG wykonuje Ruch.'
    },
    {
        id: 'wplyw-na-innych-npc',
        name: 'Wpłyń na innych (NPC)',
        attr: '+Charyzma',
        intro: 'Gdy wpływasz na BN-a przez negocjacje, argumentację lub wykorzystując swoją wyższą pozycję.',
        high: 'Postać robi to, o co prosisz.',
        mid:  'Postać robi to, o co prosisz, ale MG wybiera jedną z możliwości:\n◊ Postać żąda lepszego wynagrodzenia.\n◊ W przyszłości sprawy się zagmatwają.\n◊ Postać teraz się zgadza, ale później zmieni zdanie i będzie żałować.',
        low:  'Twoje działanie ma niezamierzone następstwa. MG wykonuje Ruch.'
    },
    {
        id: 'wplyw-na-innych-bg',
        name: 'Wpłyń na innych (BG)',
        attr: '+Charyzma',
        intro: 'Gdy wpływasz na innego gracza (BG).',
        high: 'Wybierz obie poniższe możliwości:\n◊ Postać czuje się zachęcona, by zrobić to, o co prosisz; otrzymuje +1 do swojego następnego rzutu, jeśli to zrobi.\n◊ Postać przejmuje się konsekwencjami, jeśli nie zrobi tego, o co prosisz, i zmniejsza Stabilność o −1, jeśli odmówi.',
        mid:  'Wybierz jedną z poniższych możliwości:\n◊ Postać czuje się zachęcona, by zrobić to, o co prosisz; otrzymuje +1 do swojego następnego rzutu, jeśli to zrobi.\n◊ Postać przejmuje się konsekwencjami, jeśli nie zrobi tego, o co prosisz, i zmniejsza Stabilność o −1, jeśli odmówi.',
        low:  'Postać, na którą usiłowałeś wpłynąć, otrzymuje +1 do następnego rzutu przeciw tobie. MG wykonuje Ruch.'
    },
    {
        id: 'analizuj-sytuacje',
        name: 'Analizuj sytuację',
        attr: '+Percepcja',
        intro: 'Za każdym razem, gdy analizujesz sytuację. Działając z uzyskanych odpowiedzi, otrzymujesz +1 do rzutów.',
        high: 'Zadaj dwa pytania MG:\n◊ Co w tej sytuacji zadziała najlepiej?\n◊ Co w tym momencie stanowi największe zagrożenie?\n◊ Czego mogę użyć na swoją korzyść?\n◊ Na co powinienem uważać?\n◊ Czy czegoś nie dostrzegam?\n◊ Co się tu wydaje dziwne?',
        mid:  'Zadaj jedno pytanie MG:\n◊ Co w tej sytuacji zadziała najlepiej?\n◊ Co w tym momencie stanowi największe zagrożenie?\n◊ Czego mogę użyć na swoją korzyść?\n◊ Na co powinienem uważać?\n◊ Czy czegoś nie dostrzegam?\n◊ Co się tu wydaje dziwne?',
        low:  'Możesz zadać jedno pytanie (bez premii do rzutów):\n◊ Co w tej sytuacji zadziała najlepiej?\n◊ Co w tym momencie stanowi największe zagrożenie?\n◊ Czego mogę użyć na swoją korzyść?\n◊ Na co powinienem uważać?\n◊ Czy czegoś nie dostrzegam?\n◊ Co się tu wydaje dziwne?\nCzegoś nie zauważasz, przyciągasz niepożądaną uwagę lub wystawiasz się na zagrożenie. MG wykonuje Ruch.'
    },
    {
        id: 'uniknij-obrazen',
        name: 'Uniknij Obrażeń',
        attr: '+Refleks',
        intro: 'Gdy wykonujesz unik, parujesz lub blokujesz Obrażenia.',
        high: 'Całkowicie unikasz Obrażeń.',
        mid:  'Unikasz najgorszego, ale MG decyduje, czy znalazłeś się w niekorzystnym położeniu, tracisz coś lub otrzymujesz część Obrażeń.',
        low:  'Zareagowałeś zbyt wolno lub źle oceniłeś sytuację. Być może w ogóle nie udało ci się uniknąć Obrażeń lub jesteś w jeszcze gorszym położeniu niż wcześniej. MG wykonuje Ruch.'
    },
    {
        id: 'pomoz-lub-przeszkodz',
        name: 'Pomóż lub przeszkodź',
        attr: '+Atrybut (ten sam co drugi gracz)',
        intro: 'Opisz przed rzutem drugiego gracza, w jaki sposób pomagasz lub przeszkadzasz.',
        high: 'Możesz zmodyfikować jego rzut o +2 lub −2.',
        mid:  'Możesz zmodyfikować rzut o +1 lub −1.',
        low:  'Twoja ingerencja ma niezamierzone konsekwencje. MG wykonuje Ruch.'
    },
    {
        id: 'znies-obrazenia',
        name: 'Znieś Obrażenia',
        attr: '+Odporność − Obrażenia (+ Pancerz)',
        intro: 'Gdy znosisz obrażenia. Jeśli nosisz pancerz, dodaj jego wartość do rzutu.',
        high: 'Ignorujesz ból i przesz naprzód.',
        mid:  'Nadal stoisz, ale MG wybiera jeden warunek:\n◊ Zostajesz wytrącony z równowagi.\n◊ Tracisz coś.\n◊ Otrzymujesz Poważną Ranę.',
        low:  'Obrażenia są przytłaczające. Wybierasz:\n◊ Zostajesz ogłuszony (MG może też zdecydować o Poważnej Ranie).\n◊ Otrzymujesz Krytyczną Ranę, ale możesz nadal działać (nie możesz wybrać ponownie, jeśli już ją masz).\n◊ Umierasz.'
    },
    {
        id: 'wez-sie-w-gars',
        name: 'Weź się w garść',
        attr: '+Siła Woli',
        intro: 'Za każdym razem, gdy starasz się nie poddać stresowi, traumatycznym przeżyciom, wpływom psychicznym lub nadnaturalnym mocom.',
        high: 'Zaciskasz zęby i przesz naprzód.',
        mid:  'Próba samokontroli wywiera skutek uboczny (−1 do rzutów, gdy ogranicza cię w działaniu). Wybierz jedną możliwość:\n◊ Wzbiera w tobie gniew (−1 Stabilności).\n◊ Ogarnia cię smutek (−1 Stabilności).\n◊ Ogarnia cię strach (−1 Stabilności).\n◊ Wzbiera w tobie poczucie winy (−1 Stabilności).\n◊ Dostajesz obsesji (+1 do Relacji z tym, co wywołało stan).\n◊ Rozpraszasz się (−2 do rzutów, gdy stan cię ogranicza).\n◊ To doświadczenie nie da ci później spokoju.',
        low:  'Obciążenie jest zbyt wielkie. MG decyduje, jak reagujesz: kulisz się bezbronnie w obecności zagrożenia, panikujesz i tracisz kontrolę, przechodzisz traumę (−2 Stabilności) lub traumę odmieniającą życie (−4 Stabilności).'
    },
    {
        id: 'przejrzyj-iluze',
        name: 'Przejrzyj Iluzję',
        attr: '+Dusza',
        intro: 'Gdy jesteś w szoku, otrzymujesz obrażenia albo używasz narkotyków lub odprawiasz rytuały, które mogą zniekształcać postrzeganie rzeczywistości.',
        high: 'Dostrzegasz prawdziwą naturę rzeczy.',
        mid:  'Widzisz Rzeczywistość, ale wpływasz też na Iluzję. MG wybiera:\n◊ Coś cię wyczuwa.\n◊ Iluzja rozdziera się wokół ciebie.',
        low:  'MG opisuje, co widzisz, i wykonuje Ruch.'
    },
    {
        id: 'rozeznaj-intencje',
        name: 'Rozeznaj intencje',
        attr: '+Intuicja',
        intro: 'Za każdym razem, gdy rozeznajesz intencje jakiejś osoby. W przypadku sukcesu możesz zadać pytania w dowolnym momencie sceny.',
        high: 'Możesz zadać dwa pytania:\n◊ Czy kłamiesz?\n◊ Jak się teraz czujesz?\n◊ Co zamierzasz teraz zrobić?\n◊ Co chcesz, żebym ja zrobił?\n◊ Jak mogę sprawić, żebyś (…)?',
        mid:  'Możesz zadać jedno pytanie:\n◊ Czy kłamiesz?\n◊ Jak się teraz czujesz?\n◊ Co zamierzasz teraz zrobić?\n◊ Co chcesz, żebym ja zrobił?\n◊ Jak mogę sprawić, żebyś (…)?',
        low:  'Przypadkowo odsłaniasz swoje własne motywy osobie, której intencje usiłujesz rozeznać. Powiedz MG lub graczowi, jakie masz intencje. MG wykonuje Ruch.'
    },
    {
        id: 'zbadaj',
        name: 'Zbadaj',
        attr: '+Rozum',
        intro: 'Kiedy coś badasz. W przypadku sukcesu odkrywasz wszystkie bezpośrednie wskazówki i możesz zadać pytania.',
        high: 'Możesz zadać dwa pytania:\n◊ Jak mogę dowiedzieć się więcej o tym, co badam?\n◊ Co moja intuicja mówi o tym, co badam?\n◊ Czy jest coś dziwnego w tym, co badam?',
        mid:  'Możesz zadać jedno pytanie:\n◊ Jak mogę dowiedzieć się więcej o tym, co badam?\n◊ Co moja intuicja mówi o tym, co badam?\n◊ Czy jest coś dziwnego w tym, co badam?\nMG ustala, jak wiele kosztuje cię zdobycie tej informacji.',
        low:  'Możesz otrzymać nieco informacji, ale nie za darmo. Możesz narazić się na niebezpieczeństwo lub koszty. MG wykonuje Ruch.'
    }
];

// ── Atuty ──────────────────────────────────────────────────────────────────────

const ATUTY = [
    {
        id: 'amator-okultyzmu',
        name: 'Amator okultyzmu',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy odprawiasz rytuał na podstawie instrukcji.',
        high: 'Prawidłowo odprawiasz cały rytuał, który działa zgodnie z zamiarem.',
        mid:  'Robisz drobny błąd. MG wybiera pojawiający się problem:\n◊ Nie posiadasz ochrony przed mocami lub bytami, które rytuał przywołuje.\n◊ Działanie rytuału jest nieco inne niż oczekiwałeś.\n◊ Rytuał przywołuje istoty lub moce, których się nie spodziewałeś.',
        low:  'Źle zrozumiałeś pisma i przeprowadzasz rytuał bez żadnej kontroli nad jego skutkami. MG wykonuje Ruch.'
    },
    {
        id: 'boski',
        name: 'Boski',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy spotykasz potwora.',
        high: 'Istota bierze cię za boga. Wybierz do trzech możliwości i użyj ich w dowolnym momencie tej sceny:\n◊ Uspokój agresywną istotę.\n◊ Rozkazuj istocie i zmuś ją do posłuszeństwa.',
        mid:  'Fascynujesz istotę. Wybierz jedną z możliwości:\n◊ Uspokój agresywną istotę.\n◊ Rozkazuj istocie i zmuś ją do posłuszeństwa.',
        low:  'Możesz wybrać jedną z możliwości, ale po jej wykorzystaniu istota pragnie cię posiąść – może usiłować cię pożreć lub schwytać. MG wykonuje Ruch.\n◊ Uspokój agresywną istotę.\n◊ Rozkazuj istocie i zmuś ją do posłuszeństwa.'
    },
    {
        id: 'bron-naturalna',
        name: 'Broń naturalna',
        attr: 'Pasywny',
        intro: 'Kiedy Przystępujesz do walki w zwarciu, wykorzystując swoją naturalną broń, zadajesz 3 punkty Obrażeń.',
        passive: true
    },
    {
        id: 'charyzmatyczna-aura',
        name: 'Charyzmatyczna aura',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy twoja aura jest naprawdę zauważalna.',
        high: 'Wybierz dwie różne możliwości:\n◊ Przyciągnij uwagę obcego. Jest ciebie ciekaw i podchodzi.\n◊ Zmień nastawienie osoby: z agresywnego na podejrzliwe, z podejrzliwego na neutralne lub z neutralnego na pozytywne.\n◊ Spraw, że przeciwnicy będą postrzegać cię jako niegroźnego i zignorują, dopóki pozostajesz z tyłu i nie działasz przeciw nim.',
        mid:  'Wybierz jedną z możliwości:\n◊ Przyciągnij uwagę obcego. Jest ciebie ciekaw i podchodzi.\n◊ Zmień nastawienie osoby: z agresywnego na podejrzliwe, z podejrzliwego na neutralne lub z neutralnego na pozytywne.\n◊ Spraw, że przeciwnicy będą postrzegać cię jako niegroźnego i zignorują, dopóki pozostajesz z tyłu i nie działasz przeciw nim.',
        low:  'Wybierz jedną z możliwości; przyciągasz także niepożądaną uwagę. MG wykonuje Ruch.\n◊ Przyciągnij uwagę obcego. Jest ciebie ciekaw i podchodzi.\n◊ Zmień nastawienie osoby: z agresywnego na podejrzliwe, z podejrzliwego na neutralne lub z neutralnego na pozytywne.\n◊ Spraw, że przeciwnicy będą postrzegać cię jako niegroźnego i zignorują, dopóki pozostajesz z tyłu i nie działasz przeciw nim.'
    },
    {
        id: 'cichociemny',
        name: 'Cichociemny',
        attr: '+Opanowanie',
        intro: 'Za każdym razem, gdy ukrywasz się i usiłujesz nie ściągać na siebie uwagi.',
        high: 'Wybierz dwie możliwości. Możesz wykorzystać je w dowolnym momencie sceny:\n◊ Znajdź miejsce, w którym będziesz mógł się chwilowo bezpiecznie ukryć.\n◊ Znajdź alternatywną drogę, by uniknąć napotykania ludzi.\n◊ Omiń system bezpieczeństwa lub inną przeszkodę tak, aby cię nie zauważono.',
        mid:  'Wybierz jedną z możliwości. Możesz wykorzystać ją w dowolnym momencie sceny:\n◊ Znajdź miejsce, w którym będziesz mógł się chwilowo bezpiecznie ukryć.\n◊ Znajdź alternatywną drogę, by uniknąć napotykania ludzi.\n◊ Omiń system bezpieczeństwa lub inną przeszkodę tak, aby cię nie zauważono.',
        low:  'Wybierz jedną z możliwości, ale przyciągasz też czyjąś uwagę. MG wykonuje Ruch.\n◊ Znajdź miejsce, w którym będziesz mógł się chwilowo bezpiecznie ukryć.\n◊ Znajdź alternatywną drogę, by uniknąć napotykania ludzi.\n◊ Omiń system bezpieczeństwa lub inną przeszkodę tak, aby cię nie zauważono.'
    },
    {
        id: 'egzorcysta',
        name: 'Egzorcysta',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy odprawiasz egzorcyzmy, by wygnać ducha lub istotę z innego wymiaru.',
        high: 'Istota zostaje odesłana. Wybierz dwie możliwości:\n◊ Nikt nie ucierpiał podczas rytuału.\n◊ Istota nie pojawi się ponownie później.\n◊ Istota nie będzie wobec ciebie wroga.',
        mid:  'Istota zostaje odesłana. Wybierz jedną z możliwości:\n◊ Nikt nie ucierpiał podczas rytuału.\n◊ Istota nie pojawi się ponownie później.\n◊ Istota nie będzie wobec ciebie wroga.',
        low:  'Istota opiera się odesłaniu i wydarza się coś okropnego – na przykład opętuje cię. MG wykonuje Ruch.'
    },
    {
        id: 'eteryczny',
        name: 'Eteryczny',
        attr: '+Dusza',
        intro: 'Kiedy przyjmujesz eteryczną postać.',
        high: 'Wybierz trzy Przewagi. Do dwóch z nich możesz zachować na później:\n◊ Bezcielesny ruch: Przenikaj przez materialne przeszkody, takie jak ludzie, ściany czy drzwi.\n◊ Broń nie czyni mi krzywdy: Całkowicie ignorujesz fizyczne Obrażenia.\n◊ Niemożliwy do pochwycenia: Wyzwól się z uchwytu, więzów lub innych materialnych ograniczeń.',
        mid:  'Wybierz dwie Przewagi. Jedną z nich możesz zachować na później:\n◊ Bezcielesny ruch: Przenikaj przez materialne przeszkody, takie jak ludzie, ściany czy drzwi.\n◊ Broń nie czyni mi krzywdy: Całkowicie ignorujesz fizyczne Obrażenia.\n◊ Niemożliwy do pochwycenia: Wyzwól się z uchwytu, więzów lub innych materialnych ograniczeń.',
        low:  'Wybierz jedną Przewagę; zwracasz na siebie uwagę duchów lub innych bezcielesnych istot. MG wykonuje Ruch.\n◊ Bezcielesny ruch: Przenikaj przez materialne przeszkody, takie jak ludzie, ściany czy drzwi.\n◊ Broń nie czyni mi krzywdy: Całkowicie ignorujesz fizyczne Obrażenia.\n◊ Niemożliwy do pochwycenia: Wyzwól się z uchwytu, więzów lub innych materialnych ograniczeń.'
    },
    {
        id: 'lowca',
        name: 'Łowca',
        attr: '+Percepcja',
        intro: 'Za każdym razem, gdy polujesz na coś lub kogoś.',
        high: 'Wybierz trzy możliwości. Możesz użyć ich w dowolnym momencie tej sceny:\n◊ Zastaw zasadzkę na wroga (zadaj Obrażenia właściwe twojej broni).\n◊ Kamuflaż (+2 do Ruchu Działaj pod presją, gdy się ukrywasz).\n◊ Poruszaj się w cieniu (+2 do Ruchu Uniknij obrażeń zadawanych bronią dystansową).',
        mid:  'Wybierz dwie możliwości. Możesz użyć ich w dowolnym momencie tej sceny:\n◊ Zastaw zasadzkę na wroga (zadaj Obrażenia właściwe twojej broni).\n◊ Kamuflaż (+2 do Ruchu Działaj pod presją, gdy się ukrywasz).\n◊ Poruszaj się w cieniu (+2 do Ruchu Uniknij obrażeń zadawanych bronią dystansową).',
        low:  'Wybierz jedną z możliwości, ale teraz to ty jesteś zwierzyną. MG wykonuje Ruch.\n◊ Zastaw zasadzkę na wroga (zadaj Obrażenia właściwe twojej broni).\n◊ Kamuflaż (+2 do Ruchu Działaj pod presją, gdy się ukrywasz).\n◊ Poruszaj się w cieniu (+2 do Ruchu Uniknij obrażeń zadawanych bronią dystansową).'
    },
    {
        id: 'magiczna-intuicja',
        name: 'Magiczna intuicja',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy korzystasz z magicznej intuicji.',
        high: 'Wybierz do trzech możliwości. Do dwóch możesz zostawić na później do wykorzystania w tej scenie:\n◊ Dowiedz się czegoś o prawdziwej naturze jakiejś istoty.\n◊ Ustal, czy coś jest magiczne.\n◊ Ustal, gdzie Iluzja dzieląca wymiary jest najsłabsza.',
        mid:  'Wybierz do dwóch możliwości. Jedną możesz zostawić na później do wykorzystania w tej scenie:\n◊ Dowiedz się czegoś o prawdziwej naturze jakiejś istoty.\n◊ Ustal, czy coś jest magiczne.\n◊ Ustal, gdzie Iluzja dzieląca wymiary jest najsłabsza.',
        low:  'Wybierz jedną z możliwości. Masz również niespodziewaną wizję lub przyciągasz uwagę. MG wykonuje Ruch.\n◊ Dowiedz się czegoś o prawdziwej naturze jakiejś istoty.\n◊ Ustal, czy coś jest magiczne.\n◊ Ustal, gdzie Iluzja dzieląca wymiary jest najsłabsza.'
    },
    {
        id: 'manipulacja-iluzja',
        name: 'Manipulacja Iluzją',
        attr: '+Dusza − poziom magii stworzenia',
        intro: 'Kiedy manipulujesz Iluzją, by rozproszyć magiczną moc, odepchnąć istotę lub zamknąć portal.',
        high: 'Pozwalasz przytłaczającej potędze Iluzji rozproszyć magię lub odepchnąć istotę.',
        mid:  'Pozwalasz przytłaczającej potędze Iluzji rozproszyć magię lub odepchnąć istotę, ale występują nieprzewidziane konsekwencje — magia bądź istota mają czas wpłynąć na ciebie, albo twoje użycie mocy przyciągnęło niechcianą uwagę.',
        low:  'Iluzja tymczasowo cię odrzuca. Możesz poczuć się przytłoczony, zostać przeniesiony w inne miejsce albo stać się celem dla widzących cię teraz wyraźnie istot. MG wykonuje Ruch.'
    },
    {
        id: 'manipulator-umyslow',
        name: 'Manipulator umysłów',
        attr: '+Dusza',
        intro: 'Kiedy wdzierasz się do czyjejś głowy.',
        high: 'Wybierz do trzech możliwości:\n◊ Przeglądaj wspomnienia w poszukiwaniu konkretnego wydarzenia. Doświadczasz tego wspomnienia, jakby należało do ciebie.\n◊ Dowiedz się, jakie są w tej chwili powierzchowne myśli celu.\n◊ Szukaj konkretnej informacji, którą cel powinien posiadać.',
        mid:  'Wybierz do dwóch możliwości:\n◊ Przeglądaj wspomnienia w poszukiwaniu konkretnego wydarzenia. Doświadczasz tego wspomnienia, jakby należało do ciebie.\n◊ Dowiedz się, jakie są w tej chwili powierzchowne myśli celu.\n◊ Szukaj konkretnej informacji, którą cel powinien posiadać.',
        low:  'Wybierz jedną z możliwości; twój umysł również staje otworem przed osobą, którą próbowałeś manipulować. Wybiera ona jedną z możliwości i wykorzystuje ją przeciwko tobie.\n◊ Przeglądaj wspomnienia w poszukiwaniu konkretnego wydarzenia. Doświadczasz tego wspomnienia, jakby należało do ciebie.\n◊ Dowiedz się, jakie są w tej chwili powierzchowne myśli celu.\n◊ Szukaj konkretnej informacji, którą cel powinien posiadać.'
    },
    {
        id: 'mistrz-przeslucha',
        name: 'Mistrz przesłuchań',
        attr: 'Pasywny',
        intro: 'Za każdym razem, gdy Rozeznajesz intencje i wymienisz nazwę, osobę lub przedmiot, możesz zawsze zapytać: „Czy kłamiesz?". To pytanie nie wlicza się do normalnego limitu.',
        passive: true
    },
    {
        id: 'nalozenie-rak',
        name: 'Nałożenie rąk',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy nakładasz ręce na poważnie lub krytycznie ranną osobę i modlisz się.',
        high: 'Całkowicie leczysz rannego, przenosząc Ranę na siebie lub wybrany cel.',
        mid:  'Stabilizujesz stan rannego, przenosząc Ranę na siebie lub wybrany cel.',
        low:  'Możesz ustabilizować stan rannego, ale jeśli to zrobisz, moc wymknie się spod twojej kontroli. MG wykonuje Ruch.'
    },
    {
        id: 'odporny',
        name: 'Odporny',
        attr: 'Pasywny',
        intro: 'Za każdym razem, gdy obniżasz Stabilność, tracisz 1 poziom mniej niż normalnie.',
        passive: true
    },
    {
        id: 'oko-za-oko',
        name: 'Oko za oko',
        attr: 'Pasywny',
        intro: 'Za każdym razem, gdy otrzymujesz poważne lub krytyczne obrażenia — wskaż odpowiedzialną osobę. Otrzymujesz +2 do wszystkich rzutów bezpośrednio przeciw niej na zawsze.',
        passive: true
    },
    {
        id: 'podstepny',
        name: 'Podstępny',
        attr: '+Intuicja',
        intro: 'Za każdym razem, gdy manipulujesz BN-em podczas dłuższej rozmowy.',
        high: 'Wybierz do dwóch możliwości. Jedną możesz zostawić do wykorzystania później w tej scenie:\n◊ Dana osoba staje się podejrzliwa wobec kogoś, kogo wskażesz.\n◊ Dana osoba uznaje cię za sojusznika, dopóki jej nie zdradzisz (+1 do wszystkich rzutów przeciw niej).\n◊ Dana osoba chętnie wyświadczy ci przysługę.',
        mid:  'Wybierz jedną z możliwości:\n◊ Dana osoba staje się podejrzliwa wobec kogoś, kogo wskażesz.\n◊ Dana osoba uznaje cię za sojusznika, dopóki jej nie zdradzisz (+1 do wszystkich rzutów przeciw niej).\n◊ Dana osoba chętnie wyświadczy ci przysługę.',
        low:  'Druga strona coś podejrzewa. MG wykonuje Ruch.'
    },
    {
        id: 'przerazajacy',
        name: 'Przerażający',
        attr: '+Przemoc',
        intro: 'Za każdym razem, gdy usiłujesz przestraszyć inną osobę.',
        high: 'Dana osoba poddaje się strachowi i spełnia twoje żądania.',
        mid:  'Dana osoba ucieka przed tobą lub poddaje ci się. Wybór należy do MG.',
        low:  'Dana osoba uznaje cię za główne zagrożenie i działa zgodnie z tym wnioskiem. MG wykonuje Ruch w jej imieniu.'
    },
    {
        id: 'regeneracja',
        name: 'Regeneracja',
        attr: 'Pasywny',
        intro: 'Poważne Rany znikają całkowicie po kilku godzinach. Krytyczne Rany goją się w ciągu jednego dnia.',
        passive: true
    },
    {
        id: 'rozwinięta-swiadomosc',
        name: 'Rozwinięta świadomość',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy skupisz się w miejscu, gdzie Iluzja jest słaba.',
        high: 'Dostrzegasz wyraźne szczegóły dotyczące tego miejsca. Możesz porozmawiać z bytami z nim związanymi.',
        mid:  'Masz kilka ogólnych wrażeń dotyczących tego miejsca. Możesz porozmawiać z bytami z nim związanymi.',
        low:  'Iluzja kruszeje. Zasłona tymczasowo się podnosi, ukazując jeden z wymiarów alternatywnych — MG decyduje który. BG może zostać do niego wciągnięty lub coś może przedostać się do naszej rzeczywistości. MG wykonuje Ruch.'
    },
    {
        id: 'ryzykant',
        name: 'Ryzykant',
        attr: '+Percepcja',
        intro: 'Za każdym razem, gdy znajdziesz się w niebezpiecznej sytuacji.',
        high: 'Otrzymujesz trzy Przewagi. Możesz wydać je w dowolnym momencie sceny:\n◊ Miej oczy otwarte: Odkryj zagrożenie, zanim ono odkryje ciebie.\n◊ Zejdź z drogi: Uniknij ataku.\n◊ Zaskocz ich: Zadaj Obrażenia, zanim przeciwnicy zdążą zareagować.',
        mid:  'Otrzymujesz dwie Przewagi. Możesz wydać je w dowolnym momencie sceny:\n◊ Miej oczy otwarte: Odkryj zagrożenie, zanim ono odkryje ciebie.\n◊ Zejdź z drogi: Uniknij ataku.\n◊ Zaskocz ich: Zadaj Obrażenia, zanim przeciwnicy zdążą zareagować.',
        low:  'Otrzymujesz jedną Przewagę, ale tym razem przesadziłeś. MG wykonuje Ruch.\n◊ Miej oczy otwarte: Odkryj zagrożenie, zanim ono odkryje ciebie.\n◊ Zejdź z drogi: Uniknij ataku.\n◊ Zaskocz ich: Zadaj Obrażenia, zanim przeciwnicy zdążą zareagować.'
    },
    {
        id: 'sztuka-przetrwania',
        name: 'Sztuka przetrwania',
        attr: '+Percepcja',
        intro: 'Za każdym razem, gdy korzystasz z umiejętności przetrwania.',
        high: 'Wybierz do trzech możliwości i użyj ich, dopóki trwa dana sytuacja:\n◊ Znajdź wodę i jedzenie.\n◊ Pokonaj naturalną przeszkodę.\n◊ Znajdź bezpieczne miejsce na kryjówkę i odpoczynek.',
        mid:  'Wybierz do dwóch możliwości i użyj ich, dopóki trwa dana sytuacja:\n◊ Znajdź wodę i jedzenie.\n◊ Pokonaj naturalną przeszkodę.\n◊ Znajdź bezpieczne miejsce na kryjówkę i odpoczynek.',
        low:  'Wybierz jedną z możliwości i użyj jej, dopóki trwa dana sytuacja. Przeoczyłeś jednak coś ważnego. MG wykonuje Ruch.\n◊ Znajdź wodę i jedzenie.\n◊ Pokonaj naturalną przeszkodę.\n◊ Znajdź bezpieczne miejsce na kryjówkę i odpoczynek.'
    },
    {
        id: 'szosty-zmysl',
        name: 'Szósty Zmysł',
        attr: '+Dusza',
        intro: 'Na początku każdej sesji gry.',
        high: 'Wybierz do trzech możliwości i użyj ich w dowolnym momencie sesji:\n◊ Działaj pierwszy w groźnej sytuacji (nawet uprzedzając atak z zaskoczenia).\n◊ Wyczuj, czy ktoś życzy ci źle, czy dobrze.\n◊ Odkryj lub wyczuj wskazówkę lub ślad, gdy nie wiesz, co robić.',
        mid:  'Wybierz do dwóch możliwości i użyj ich w dowolnym momencie sesji:\n◊ Działaj pierwszy w groźnej sytuacji (nawet uprzedzając atak z zaskoczenia).\n◊ Wyczuj, czy ktoś życzy ci źle, czy dobrze.\n◊ Odkryj lub wyczuj wskazówkę lub ślad, gdy nie wiesz, co robić.',
        low:  'Twój instynkt nie działa w niebezpiecznej sytuacji. MG wykonuje Ruch w którymś momencie sesji.'
    },
    {
        id: 'sledczy',
        name: 'Śledczy',
        attr: '+Rozum',
        intro: 'Za każdym razem, gdy badasz miejsce zbrodni.',
        high: 'Zadaj dwa pytania:\n◊ Jak przebiegły zdarzenia?\n◊ Co mogę założyć na temat sprawcy?\n◊ Jakie błędy popełnił sprawca?\n◊ Kiedy popełniono przestępstwo?\n◊ Kiedy ktoś tu ostatnio był?\n◊ Czy przestępstwo przypomina mi coś, co już znam, a jeśli tak, to co?\n◊ Kto może wiedzieć więcej o tym przestępstwie?',
        mid:  'Zadaj jedno pytanie:\n◊ Jak przebiegły zdarzenia?\n◊ Co mogę założyć na temat sprawcy?\n◊ Jakie błędy popełnił sprawca?\n◊ Kiedy popełniono przestępstwo?\n◊ Kiedy ktoś tu ostatnio był?\n◊ Czy przestępstwo przypomina mi coś, co już znam, a jeśli tak, to co?\n◊ Kto może wiedzieć więcej o tym przestępstwie?',
        low:  'Zadaj jedno pytanie, ale twoje śledztwo wystawia cię na zagrożenie lub tworzy nowe problemy, które pojawią się później:\n◊ Jak przebiegły zdarzenia?\n◊ Co mogę założyć na temat sprawcy?\n◊ Jakie błędy popełnił sprawca?\n◊ Kiedy popełniono przestępstwo?\n◊ Kiedy ktoś tu ostatnio był?\n◊ Czy przestępstwo przypomina mi coś, co już znam, a jeśli tak, to co?\n◊ Kto może wiedzieć więcej o tym przestępstwie?'
    },
    {
        id: 'twardziel',
        name: 'Twardziel',
        attr: 'Pasywny',
        intro: 'Otrzymujesz +1 na stałe do Ruchu Znieś Obrażenia.',
        passive: true
    },
    {
        id: 'uparty',
        name: 'Uparty',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy dajesz z siebie wszystko, by pokonać zagrożenie.',
        high: 'Otrzymujesz trzy Przewagi. Możesz wydać je w dowolnym momencie sceny:\n◊ Nie poddawaj się: Opóźnij działanie krytycznych obrażeń do momentu, kiedy wymkniesz się zagrożeniu.\n◊ Wola ponad talentem: Rzuć +Siła Woli zamiast zwykłego Atrybutu, gdy unikasz lub walczysz z czymś, co ci zagraża.\n◊ Skup się: Wyzwól się spod działania nadnaturalnego efektu.',
        mid:  'Otrzymujesz dwie Przewagi. Możesz wydać je w dowolnym momencie sceny:\n◊ Nie poddawaj się: Opóźnij działanie krytycznych obrażeń do momentu, kiedy wymkniesz się zagrożeniu.\n◊ Wola ponad talentem: Rzuć +Siła Woli zamiast zwykłego Atrybutu, gdy unikasz lub walczysz z czymś, co ci zagraża.\n◊ Skup się: Wyzwól się spod działania nadnaturalnego efektu.',
        low:  'Otrzymujesz jedną Przewagę, ale przekraczasz granice swojej wytrzymałości. Zmniejsz Stabilność (−2).\n◊ Nie poddawaj się: Opóźnij działanie krytycznych obrażeń do momentu, kiedy wymkniesz się zagrożeniu.\n◊ Wola ponad talentem: Rzuć +Siła Woli zamiast zwykłego Atrybutu, gdy unikasz lub walczysz z czymś, co ci zagraża.\n◊ Skup się: Wyzwól się spod działania nadnaturalnego efektu.'
    },
    {
        id: 'uwazny',
        name: 'Uważny',
        attr: 'Pasywny',
        intro: 'Za każdym razem, gdy Rozeznajesz intencje, możesz dodatkowo zadać jedno z poniższych pytań:\n◊ Jaką osobą jesteś?\n◊ Czy jest w tobie coś dziwnego?',
        passive: true
    },
    {
        id: 'wewnetrzna-moc',
        name: 'Wewnętrzna moc',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy wyzwalasz swoją wewnętrzną moc.',
        high: 'Moc dosięga wszystkich wrogów w pobliżu, zadając 2 punkty Obrażeń.',
        mid:  'Moc atakuje najbliższego przeciwnika, zadając 2 punkty Obrażeń.',
        low:  'Moc dosięga wszystkich istot żyjących, w tym ciebie, zadając 2 punkty Obrażeń. MG wykonuje Ruch.'
    },
    {
        id: 'zacisniete-zeby',
        name: 'Zaciśnięte zęby',
        attr: 'Pasywny',
        intro: 'Nie otrzymujesz kar za Rany — ani Poważne, ani Krytyczne.',
        passive: true
    },
    {
        id: 'zakazana-inspiracja',
        name: 'Zakazana inspiracja',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy zanurzasz się w swojej sztuce i pozwalasz Prawdzie się inspirować.',
        high: 'Wybierz dwie możliwości:\n◊ Przywabienie: Nakłoń jakąś istotę, by do ciebie przybyła.\n◊ Wizje: Przejrzyj Iluzję i skieruj wzrok na konkretne, wybrane przez ciebie miejsce.\n◊ Inspiracja: Zapytaj MG, czy w sytuacji, w której się znajdujesz, jest coś dziwnego lub nadnaturalnego. Odpowiedź ujawni się poprzez twoją sztukę.',
        mid:  'Wybierz jedną z możliwości:\n◊ Przywabienie: Nakłoń jakąś istotę, by do ciebie przybyła.\n◊ Wizje: Przejrzyj Iluzję i skieruj wzrok na konkretne, wybrane przez ciebie miejsce.\n◊ Inspiracja: Zapytaj MG, czy w sytuacji, w której się znajdujesz, jest coś dziwnego lub nadnaturalnego. Odpowiedź ujawni się poprzez twoją sztukę.',
        low:  'Spojrzałeś zbyt głęboko w otchłań. Wybierz jedną z możliwości, ale doświadczasz również straszliwych wizji lub spotykasz coś strasznego. MG wykonuje Ruch.\n◊ Przywabienie: Nakłoń jakąś istotę, by do ciebie przybyła.\n◊ Wizje: Przejrzyj Iluzję i skieruj wzrok na konkretne, wybrane przez ciebie miejsce.\n◊ Inspiracja: Zapytaj MG, czy w sytuacji, w której się znajdujesz, jest coś dziwnego lub nadnaturalnego. Odpowiedź ujawni się poprzez twoją sztukę.'
    },
    {
        id: 'zarazliwe-szalenstwo',
        name: 'Zaraźliwe szaleństwo',
        attr: '+Dusza',
        intro: 'Za każdym razem, gdy pozwalasz swojemu szaleństwu zarazić kogoś, z kim rozmawiasz.',
        high: 'Wybierz dwie możliwości:\n◊ Wywołaj u ofiary czasową psychozę, w której nawiedzają ją jej własne lęki (tylko BN-i).\n◊ Wprowadź Komplikację tej osoby do gry (dotyczy tylko BG; należy wykonać rzut na Komplikację).\n◊ Wpłyń na jedną osobę więcej.\n◊ Wezwij istoty związane z Obłędem, by nawiedzały zarażonych.',
        mid:  'Wybierz jedną z możliwości:\n◊ Wywołaj u ofiary czasową psychozę, w której nawiedzają ją jej własne lęki (tylko BN-i).\n◊ Wprowadź Komplikację tej osoby do gry (dotyczy tylko BG; należy wykonać rzut na Komplikację).\n◊ Wpłyń na jedną osobę więcej.\n◊ Wezwij istoty związane z Obłędem, by nawiedzały zarażonych.',
        low:  'Zarażają cię lęki i objawiają ci się Mroczne Sekrety twojej niedoszłej ofiary. Musisz Wziąć się w garść.'
    },
    {
        id: 'zimna-krew',
        name: 'Zimna krew',
        attr: '+Opanowanie',
        intro: 'Za każdym razem, gdy uczestniczysz w walce.',
        high: 'Otrzymujesz trzy Przewagi. Możesz wydać je w dowolnym momencie sceny:\n◊ Uniknij ataku.\n◊ Złap coś lub zwędź.\n◊ Zajmij lepszą pozycję.\n◊ Wmanewruj kogoś w trudne położenie (wszyscy otrzymują +2 do Ruchów związanych z atakiem).',
        mid:  'Otrzymujesz dwie Przewagi. Możesz wydać je w dowolnym momencie sceny:\n◊ Uniknij ataku.\n◊ Złap coś lub zwędź.\n◊ Zajmij lepszą pozycję.\n◊ Wmanewruj kogoś w trudne położenie (wszyscy otrzymują +2 do Ruchów związanych z atakiem).',
        low:  'Otrzymujesz jedną Przewagę, ale przyciągasz uwagę wrogów. MG wykonuje Ruch.\n◊ Uniknij ataku.\n◊ Złap coś lub zwędź.\n◊ Zajmij lepszą pozycję.\n◊ Wmanewruj kogoś w trudne położenie (wszyscy otrzymują +2 do Ruchów związanych z atakiem).'
    },
];

// ── Komplikacje ────────────────────────────────────────────────────────────────

const KOMPLIKACJE = [
    {
        id: 'fanatyk',
        name: 'Fanatyk',
        attr: '+0',
        intro: 'Za każdym razem, gdy ktoś podważa wyznawaną przez ciebie ideologię.',
        high: 'Trzymasz emocje na wodzy.',
        mid:  'Robisz się zły, zdezorientowany lub sfrustrowany. Otrzymujesz karę −1 do następnego rzutu.',
        low:  'Musisz wybrać: albo podejmujesz kroki, by wpłynąć na daną osobę lub sytuację tak, aby pozostawały w zgodzie z twoją ideologią, albo obniżasz swoją Stabilność (−2).'
    },
    {
        id: 'narkoman',
        name: 'Narkoman',
        attr: '+0',
        intro: 'Podczas pierwszej sesji gry i za każdym razem, gdy bierzesz lub masz okazję brać narkotyki.',
        high: 'Na razie panujesz nad uzależnieniem.',
        mid:  'MG zyskuje 1 punkt Wpływu.',
        low:  'MG zyskuje 3 punkty Wpływu. MG może wydawać je, by wykonywać Ruchy reprezentujące twoje uzależnienie.'
    },
    {
        id: 'nieudany-eksperyment',
        name: 'Nieudany eksperyment',
        attr: '+0',
        intro: 'Podczas pierwszej sesji gry i za każdym razem, gdy sprawy wydają się pod kontrolą.',
        high: 'Twój eksperyment zostawia cię w spokoju.',
        mid:  'Twój eksperyment depcze ci po piętach. MG zyskuje 1 punkt Wpływu.',
        low:  'Twój eksperyment jest w pobliżu i działa przeciw tobie. MG zyskuje 3 punkty Wpływu.'
    },
    {
        id: 'obsesja',
        name: 'Obsesja',
        attr: '+0',
        intro: 'Podczas pierwszej sesji gry i za każdym razem, gdy napotykasz coś związanego z twoją obsesją.',
        high: 'Chwilowo opanowujesz swoją obsesję.',
        mid:  'Twoja obsesja wpływa na twoje zachowanie. MG zyskuje 1 punkt Wpływu.',
        low:  'Twoja obsesja przejmuje całkowitą kontrolę. MG zyskuje 3 punkty Wpływu.'
    },
    {
        id: 'ofiara-wlasnych-namietnosci',
        name: 'Ofiara własnych namiętności',
        attr: '+0',
        intro: 'Podczas pierwszej sesji gry i za każdym razem, gdy napotykasz przedmiot swojej pasji (lub coś, co go przypomina).',
        high: 'Utrzymujesz swoją żądzę na wodzy.',
        mid:  'Rozbudza się w tobie namiętność. MG zyskuje 1 punkt Wpływu.',
        low:  'Namiętność ma cię całkowicie w swojej mocy. MG zyskuje 3 punkty Wpływu.'
    },
    {
        id: 'poczucie-winy',
        name: 'Poczucie winy',
        attr: '+0',
        intro: 'Podczas pierwszej sesji gry i za każdym razem, gdy sprawy wydają się w porządku.',
        high: 'Nie myślisz w tej chwili o swojej winie.',
        mid:  'Coś przypomina ci o twojej winie. MG zyskuje 1 punkt Wpływu.',
        low:  'Dopada cię poczucie winy. MG zyskuje 3 punkty Wpływu.'
    },
    {
        id: 'przesladowca',
        name: 'Prześladowca',
        attr: '+0',
        intro: 'W czasie pierwszej sesji gry i za każdym razem, gdy ujawniasz miejsce, gdzie aktualnie przebywasz.',
        high: 'Jesteś na razie bezpieczny.',
        mid:  'Twoi wrogowie są blisko. MG zyskuje 1 punkt Wpływu.',
        low:  'Twoi wrogowie namierzyli cię. MG zyskuje 3 punkty Wpływu.'
    },
    {
        id: 'przysiega-zemsty',
        name: 'Przysięga zemsty',
        attr: '+0',
        intro: 'Za każdym razem, gdy w scenie pojawia się cel twojej zemsty (lub ktoś albo coś z nim powiązanego).',
        high: 'Kontrolujesz swoją mściwość i możesz działać racjonalnie.',
        mid:  'Nie możesz skupić się na niczym innym niż cel twojej zemsty. Otrzymujesz −1 do wszystkich rzutów, dopóki cel bierze udział w scenie.',
        low:  'Ogarnia cię obsesja; możesz się jedynie mścić. Zrobienie czegokolwiek innego wymaga Ruchu Weź się w garść.'
    },
];

// ── Move helpers ───────────────────────────────────────────────────────────────

function getMoveResult(move, total) {
    if (total >= 15) return { cls: 'tier-high', label: '15+  Sukces!',           text: move.high };
    if (total >= 10) return { cls: 'tier-mid',  label: '10–14  Częściowy sukces', text: move.mid  };
    return              { cls: 'tier-low',  label: '≤9  Porażka',             text: move.low  };
}

function renderMoveText(text) {
    return text.split('\n').map(line => {
        const t = line.trim();
        if (!t) return '';
        if (t.startsWith('◊')) return `<div class="move-diamond-item">${t}</div>`;
        return `<p class="move-result-line">${t}</p>`;
    }).filter(Boolean).join('');
}

// ── Move select init ───────────────────────────────────────────────────────────

function initMoveSelect() {
    const sel = document.getElementById('moveSelect');
    MOVES.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name;
        sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
        const move = MOVES.find(m => m.id === sel.value);
        const introBox  = document.getElementById('moveIntroBox');
        const attrBadge = document.getElementById('moveAttrBadge');
        const introText = document.getElementById('moveIntroText');

        if (move) {
            attrBadge.textContent = move.attr;
            introText.textContent = move.intro;
            introBox.style.display = 'flex';
        } else {
            introBox.style.display = 'none';
        }
    });
}

function initAdvantageSelect() {
    const sel = document.getElementById('advantageSelect');
    ATUTY.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.name + (a.passive ? ' ★' : '');
        sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
        const adv = ATUTY.find(a => a.id === sel.value);
        const box  = document.getElementById('advantageIntroBox');
        const badge = document.getElementById('advantageAttrBadge');
        const text  = document.getElementById('advantageIntroText');
        if (adv) {
            badge.textContent = adv.attr;
            text.textContent  = adv.intro;
            box.style.display = 'flex';
        } else {
            box.style.display = 'none';
        }
    });
}

function initComplicationSelect() {
    const sel = document.getElementById('complicationSelect');
    KOMPLIKACJE.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
        const comp = KOMPLIKACJE.find(c => c.id === sel.value);
        const box   = document.getElementById('complicationIntroBox');
        const badge = document.getElementById('complicationAttrBadge');
        const text  = document.getElementById('complicationIntroText');
        if (comp) {
            badge.textContent = comp.attr;
            text.textContent  = comp.intro;
            box.style.display = 'flex';
        } else {
            box.style.display = 'none';
        }
    });
}

// ── Dice groups state ──────────────────────────────────────────────────────────

let diceGroups = [{ qty: 1, sides: 6 }];

function renderDiceGroups() {
    const list = document.getElementById('diceGroupsList');
    list.innerHTML = '';

    diceGroups.forEach((group, i) => {
        const row = document.createElement('div');
        row.className = 'dice-group-row';
        row.innerHTML = `
            <input
                type="number"
                class="dg-qty fm-input"
                min="1" max="20"
                value="${group.qty}"
                data-idx="${i}"
                title="Liczba kości">
            <span class="dg-sep">×</span>
            <select class="dg-type fm-input" data-idx="${i}">
                ${SIDES_OPTIONS.map(s =>
                    `<option value="${s}"${s === group.sides ? ' selected' : ''}>d${s}</option>`
                ).join('')}
            </select>
            ${diceGroups.length > 1
                ? `<button class="btn-remove-group" data-idx="${i}" title="Usuń">×</button>`
                : `<div style="width:34px; flex-shrink:0;"></div>`}
        `;
        list.appendChild(row);
    });

    list.querySelectorAll('.dg-qty').forEach(el => {
        el.addEventListener('input', e => {
            diceGroups[+e.target.dataset.idx].qty =
                Math.max(1, Math.min(20, parseInt(e.target.value) || 1));
            updateFormulaPreview();
        });
    });

    list.querySelectorAll('.dg-type').forEach(el => {
        el.addEventListener('change', e => {
            diceGroups[+e.target.dataset.idx].sides = parseInt(e.target.value);
            updateFormulaPreview();
        });
    });

    list.querySelectorAll('.btn-remove-group').forEach(el => {
        el.addEventListener('click', e => {
            diceGroups.splice(+e.target.dataset.idx, 1);
            renderDiceGroups();
        });
    });

    updateFormulaPreview();
}

function updateFormulaPreview() {
    const mod = parseInt(document.getElementById('modifier').value) || 0;
    let expr  = diceGroups.map(g => `${g.qty}d${g.sides}`).join(' + ');
    if (mod !== 0) expr += ` ${mod > 0 ? '+' : '−'} ${Math.abs(mod)}`;
    document.getElementById('formulaPreview').textContent = expr;
}

document.getElementById('addGroupBtn').addEventListener('click', () => {
    if (diceGroups.length < 8) {
        diceGroups.push({ qty: 1, sides: 6 });
        renderDiceGroups();
    }
});

document.getElementById('modifier').addEventListener('input', updateFormulaPreview);

// ── Roll ───────────────────────────────────────────────────────────────────────

document.getElementById('rollButton').addEventListener('click', () => {
    const btn = document.getElementById('rollButton');
    btn.disabled = true;
    btn.textContent = 'Rzucanie...';

    const name = document.getElementById('characterName').value.trim() || 'Gracz';
    const mod  = parseInt(document.getElementById('modifier').value) || 0;
    const moveId = document.getElementById('moveSelect').value;
    const move   = MOVES.find(m => m.id === moveId) || null;
    const advId  = document.getElementById('advantageSelect').value;
    const adv    = ATUTY.find(a => a.id === advId) || null;
    const compId = document.getElementById('complicationSelect').value;
    const comp   = KOMPLIKACJE.find(c => c.id === compId) || null;

    if (name) localStorage.setItem('characterName', name);

    setTimeout(() => {
        let grandTotal = mod;
        const groupResults = diceGroups.map(g => {
            const rolls = Array.from({ length: g.qty }, () =>
                Math.floor(Math.random() * g.sides) + 1
            );
            const sum = rolls.reduce((a, b) => a + b, 0);
            grandTotal += sum;
            return { qty: g.qty, sides: g.sides, rolls, sum };
        });

        const timeStr = formatTimestamp(new Date());

        // ── Move result panel ──────────────────────────────────────────────────
        const movePanel = document.getElementById('moveResultPanel');
        if (move) {
            const mr = getMoveResult(move, grandTotal);
            movePanel.className = `move-result-panel ${mr.cls}`;
            movePanel.innerHTML = `
                <div class="move-result-header">
                    <span class="move-result-name">${move.name}</span>
                    <span class="move-result-tier-badge">${mr.label}</span>
                </div>
                <div class="move-result-body">${renderMoveText(mr.text)}</div>
            `;
            movePanel.style.display = 'flex';
        } else {
            movePanel.style.display = 'none';
        }

        // ── Advantage result panel ─────────────────────────────────────────────
        const advPanel = document.getElementById('advantageResultPanel');
        if (adv) {
            if (adv.passive) {
                advPanel.className = 'move-result-panel tier-passive';
                advPanel.innerHTML = `
                    <div class="move-result-header">
                        <span class="move-result-name">${adv.name}</span>
                        <span class="move-result-tier-badge">Atut pasywny</span>
                    </div>
                    <div class="move-result-body">${renderMoveText(adv.intro)}</div>
                `;
            } else {
                const ar = getMoveResult(adv, grandTotal);
                advPanel.className = `move-result-panel ${ar.cls}`;
                advPanel.innerHTML = `
                    <div class="move-result-header">
                        <span class="move-result-name">${adv.name}</span>
                        <span class="move-result-tier-badge">${ar.label}</span>
                    </div>
                    <div class="move-result-body">${renderMoveText(ar.text)}</div>
                `;
            }
            advPanel.style.display = 'flex';
        } else {
            advPanel.style.display = 'none';
        }

        // ── Complication result panel ──────────────────────────────────────────
        const compPanel = document.getElementById('complicationResultPanel');
        if (comp) {
            const cr = getMoveResult(comp, grandTotal);
            compPanel.className = `move-result-panel ${cr.cls}`;
            compPanel.innerHTML = `
                <div class="move-result-header">
                    <span class="move-result-name">${comp.name}</span>
                    <span class="move-result-tier-badge">${cr.label}</span>
                </div>
                <div class="move-result-body">${renderMoveText(cr.text)}</div>
            `;
            compPanel.style.display = 'flex';
        } else {
            compPanel.style.display = 'none';
        }

        // ── Dice breakdown ─────────────────────────────────────────────────────
        const groupLines = groupResults.map(r => {
            const rollsStr = r.rolls.join(' + ');
            const sumPart  = r.qty > 1
                ? ` <span style="color:#6b7280">= ${r.sum}</span>`
                : '';
            return `<div class="result-group-line">
                        <strong>${r.qty}d${r.sides}:</strong> ${rollsStr}${sumPart}
                    </div>`;
        }).join('');

        const modLine = mod !== 0
            ? `<div class="result-group-line">Modyfikator: <strong>${mod > 0 ? '+' : ''}${mod}</strong></div>`
            : '';

        const showDivider = groupResults.length > 1 || mod !== 0;

        document.getElementById('rollResult').innerHTML = `
            ${DICE_SVG_RESULT}
            <div class="result-multi">
                ${groupLines}
                ${modLine}
                ${showDivider ? '<hr class="result-divider">' : ''}
                <div class="result-total">Suma: <strong>${grandTotal}</strong></div>
            </div>
        `;

        // ── Firebase save ──────────────────────────────────────────────────────
        const expr    = groupResults.map(r => `${r.qty}d${r.sides}[${r.rolls.join(',')}]`).join('+');
        const modStr  = mod !== 0 ? ` mod:${mod > 0 ? '+' : ''}${mod}` : '';
        const moveStr = move ? ` [${move.name}]` : '';
        const advStr  = adv  ? ` [Atut: ${adv.name}]` : '';
        const compStr = comp ? ` [Komp: ${comp.name}]` : '';
        saveRoll(`${name} rzucił(a)${moveStr}${advStr}${compStr}: ${expr}${modStr} = ${grandTotal} ${timeStr}`);

        btn.disabled    = false;
        btn.textContent = 'Rzuć';
    }, 500);
});

// ── Roll History ───────────────────────────────────────────────────────────────

function loadRollHistory() {
    onValue(ref(database, DB_PATH), (snapshot) => {
        const rolls = [];
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const val = child.val();
                if (typeof val === 'string') {
                    const timeMatch = val.match(/\d{2}-\d{2}-\d{2} \d{2}:\d{2}/) || val.match(/\d{2}:\d{2}/);
                    const displayText = timeMatch ? val.replace(timeMatch[0], '').trim() : val;
                    rolls.push({ id: child.key, fullText: displayText, time: timeMatch ? timeMatch[0] : '' });
                }
            });
        }

        const sorted  = rolls.reverse().slice(0, 20);
        const list    = document.getElementById('rollHistory');
        const section = document.getElementById('historySection');
        list.innerHTML = '';

        if (sorted.length === 0) { section.style.display = 'none'; return; }

        section.style.display = 'block';
        sorted.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'history-entry';
            li.innerHTML = `
                <div class="entry-left">
                    ${DICE_SVG_ENTRY}
                    <span class="entry-text">${entry.fullText}</span>
                    <span class="entry-green-dot" title="Zapisane w Firebase"></span>
                </div>
                ${entry.time ? `<span class="entry-time">${entry.time}</span>` : ''}
            `;
            list.appendChild(li);
        });
    });
}

function saveRoll(text) {
    const newRef = push(ref(database, DB_PATH));
    set(newRef, text);
}

// ── Audio Listener (WebRTC + Firebase signaling) ───────────────────────────────

const SESSION = 'GMaudiostream_HH';
const MY_ID   = Math.random().toString(36).slice(2, 10);
const RTC_CFG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
    ]
};

let listenerPc = null;
let gainNode   = null;
let audioCtx   = null;

function setAudioStatus(text, isLive) {
    document.getElementById('audioStatusText').textContent = text;
    document.getElementById('audioStatusDot').className = `audio-dot${isLive ? ' live' : ''}`;
    document.getElementById('audioVolumeRow').style.display = isLive ? 'flex' : 'none';
}

function initAudioListener() {
    const audio = document.getElementById('remoteAudio');

    document.getElementById('volumeSlider').addEventListener('input', e => {
        const vol = parseFloat(e.target.value);
        if (!gainNode && audio.srcObject) {
            audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(audio.srcObject);
            gainNode = audioCtx.createGain();
            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            audio.muted = true;
        }
        if (gainNode) gainNode.gain.value = vol;
        else audio.volume = vol;
        if (audio.srcObject && audio.paused) audio.play().catch(() => {});
    });

    onValue(
        ref(database, `${SESSION}/status`),
        async (snap) => {
            const status = snap.val();
            if (status === 'live') {
                if (!listenerPc) {
                    setAudioStatus('🔴 Łączenie...', false);
                    await joinSession(audio);
                }
            } else {
                setAudioStatus('Brak transmisji', false);
                if (listenerPc) { listenerPc.close(); listenerPc = null; }
                audio.srcObject = null;
            }
        },
        (err) => {
            console.error('[Audio] Firebase error:', err);
            setAudioStatus(`⚠️ Firebase: ${err.code}`, false);
        }
    );
}

async function joinSession(audio) {
    if (listenerPc) return;
    const pc = new RTCPeerConnection(RTC_CFG);
    listenerPc = pc;

    pc.ontrack = ({ streams }) => {
        audio.srcObject = streams[0];
        audio.muted = false;
        audio.volume = parseFloat(document.getElementById('volumeSlider').value);
        audio.play().catch(() => {});
        clearTimeout(watchdog);
        setAudioStatus('🔴 ON AIR', true);
    };

    pc.onicecandidate = ({ candidate }) => {
        if (candidate)
            push(ref(database, `${SESSION}/listeners/${MY_ID}/listenerCandidates`), candidate.toJSON());
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            setAudioStatus('Połączenie przerwane — ponawiam...', false);
            listenerPc = null;
            setTimeout(() => joinSession(audio), 2000);
        }
    };

    const watchdog = setTimeout(() => {
        if (listenerPc === pc && pc.connectionState !== 'connected') {
            pc.close(); listenerPc = null;
            setAudioStatus('🔴 Łączenie (retry)...', false);
            joinSession(audio);
        }
    }, 8000);

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    const myRef = ref(database, `${SESSION}/listeners/${MY_ID}`);
    await set(myRef, { offer: { type: offer.type, sdp: offer.sdp } });
    onDisconnect(myRef).remove();

    const candBuffer = []; let remoteSet = false; const seenCands = new Set();
    const applyCandidate = cand => pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});

    onValue(ref(database, `${SESSION}/listeners/${MY_ID}/answer`), async (snap) => {
        const answer = snap.val();
        if (answer && !pc.remoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            remoteSet = true;
            while (candBuffer.length) applyCandidate(candBuffer.shift());
        }
    });

    onValue(ref(database, `${SESSION}/listeners/${MY_ID}/broadcasterCandidates`), (snap) => {
        snap.forEach(candSnap => {
            if (!seenCands.has(candSnap.key)) {
                seenCands.add(candSnap.key);
                const cand = candSnap.val();
                if (remoteSet) applyCandidate(cand);
                else candBuffer.push(cand);
            }
        });
    });
}

// ── Init ───────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
    const saved = localStorage.getItem('characterName');
    if (saved) document.getElementById('characterName').value = saved;
    initMoveSelect();
    initAdvantageSelect();
    initComplicationSelect();
    renderDiceGroups();
    loadRollHistory();
    initAudioListener();
});
