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

const app      = initializeApp(firebaseConfig, 'lite');
const database = getDatabase(app);

const DB_PATH = 'rollsKlatwaStrahda';

// ── Helpers ────────────────────────────────────────────────────────────────────

const pad = n => n.toString().padStart(2, '0');
function formatTime(date) { return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }

const DICE_SVG_ENTRY = `<svg class="entry-dice-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/></svg>`;
const DICE_SVG_RESULT = `<svg class="dice-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/></svg>`;

const SIDES_OPTIONS = [2, 4, 6, 8, 10, 12, 20, 100];

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
    const mod  = parseInt(document.getElementById('modifier').value) || 0;
    let expr   = diceGroups.map(g => `${g.qty}d${g.sides}`).join(' + ');
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

        const timeStr = formatTime(new Date());

        // Result HTML
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
            ? `<div class="result-group-line">
                   Modyfikator: <strong>${mod > 0 ? '+' : ''}${mod}</strong>
               </div>`
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

        // Firebase: zapisz rzut
        const expr   = groupResults.map(r => `${r.qty}d${r.sides}[${r.rolls.join(',')}]`).join('+');
        const modStr = mod !== 0 ? ` mod:${mod > 0 ? '+' : ''}${mod}` : '';
        saveRoll(`${name} rzucił(a): ${expr}${modStr} = ${grandTotal} ${timeStr}`);

        btn.disabled  = false;
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
                    const timeMatch = val.match(/\d{2}:\d{2}/);
                    rolls.push({ id: child.key, fullText: val, time: timeMatch ? timeMatch[0] : '' });
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

const SESSION = 'GMaudioKlatwaStrahda';
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
        if (candidate) {
            push(ref(database, `${SESSION}/listeners/${MY_ID}/listenerCandidates`), candidate.toJSON());
        }
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
            pc.close();
            listenerPc = null;
            setAudioStatus('🔴 Łączenie (retry)...', false);
            joinSession(audio);
        }
    }, 8000);

    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    const myRef = ref(database, `${SESSION}/listeners/${MY_ID}`);
    await set(myRef, { offer: { type: offer.type, sdp: offer.sdp } });
    onDisconnect(myRef).remove();

    const candBuffer = [];
    let remoteSet    = false;
    const seenCands  = new Set();

    function applyCandidate(cand) {
        pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    }

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
    renderDiceGroups();
    loadRollHistory();
    initAudioListener();
});
