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
        saveRoll(`${name} rzucił(a)${moveStr}: ${expr}${modStr} = ${grandTotal} ${timeStr}`);

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
    renderDiceGroups();
    loadRollHistory();
    initAudioListener();
});
