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

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const DB_PATH = 'rollsHysteriaHighest';

// ── Helpers ────────────────────────────────────────────────────────────────────

const pad = n => n.toString().padStart(2, '0');
function formatTime(date) { return `${pad(date.getHours())}:${pad(date.getMinutes())}`; }

const DICE_SVG = `<svg class="entry-dice-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/></svg>`;

// ── Dice Info ──────────────────────────────────────────────────────────────────

function updateDiceInfo() {
    const v = document.getElementById('diceType').value;
    document.getElementById('diceInfo').textContent = `Aktualna kość: d${v} (1-${v})`;
}

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

        const sorted = rolls.reverse().slice(0, 20);
        const list = document.getElementById('rollHistory');
        const section = document.getElementById('historySection');
        list.innerHTML = '';

        if (sorted.length === 0) { section.style.display = 'none'; return; }

        section.style.display = 'block';
        sorted.forEach(entry => {
            const li = document.createElement('li');
            li.className = 'history-entry';
            li.innerHTML = `
                <div class="entry-left">
                    ${DICE_SVG}
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

// ── Roll Button ────────────────────────────────────────────────────────────────

document.getElementById('rollButton').addEventListener('click', () => {
    const btn = document.getElementById('rollButton');
    btn.disabled = true;
    btn.textContent = 'Rzucanie...';

    const name   = document.getElementById('characterName').value.trim() || 'Gracz';
    const sides  = parseInt(document.getElementById('diceType').value);
    const amount = Math.max(0, parseInt(document.getElementById('diceQuantity').value) || 0);
    const mod    = parseInt(document.getElementById('modifier').value) || 0;

    if (name) localStorage.setItem('characterName', name);

    setTimeout(() => {
        const rolls = [];
        let total = 0;
        for (let i = 0; i < amount; i++) {
            const val = Math.floor(Math.random() * sides) + 1;
            rolls.push(val);
            total += val;
        }
        const finalResult = total + mod;
        const timeStr = formatTime(new Date());

        const breakdown = amount === 0 ? '0' : rolls.join(' + ');
        const modPart   = mod !== 0 ? ` ${mod > 0 ? '+' : '-'} ${Math.abs(mod)}` : '';

        const resultEl = document.getElementById('rollResult');
        resultEl.innerHTML = `
            <svg class="dice-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><path d="M16 8h.01"/><path d="M8 8h.01"/><path d="M8 16h.01"/><path d="M16 16h.01"/><path d="M12 12h.01"/></svg>
            <span class="result-main">Wynik rzutu: <strong>${finalResult}</strong></span>
            <span class="result-breakdown">( ${breakdown}${modPart} )</span>
        `;

        saveRoll(`${name} rzucił(a): ${rolls.join(', ')} (Modyfikator: ${mod}, Suma: ${finalResult}) ${timeStr}`);

        btn.disabled = false;
        btn.textContent = 'Rzuć';
    }, 500);
});

document.getElementById('diceType').addEventListener('change', updateDiceInfo);

window.addEventListener('load', () => {
    const saved = localStorage.getItem('characterName');
    if (saved) document.getElementById('characterName').value = saved;
    loadRollHistory();
    updateDiceInfo();
    initAudioListener();
});

// ── Audio Listener (WebRTC + Firebase signaling) ───────────────────────────────
// GM broadcasts from /gmpanel.html — players only receive here.

const SESSION = 'GMaudiostream_HH';
const MY_ID   = Math.random().toString(36).slice(2, 10);
const RTC_CFG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
        // Opcjonalnie TURN dla trudnych sieci (np. korporacyjnych):
        // Darmowe konto: https://www.metered.ca/stun-turn
        // { urls: 'turn:...', username: '...', credential: '...' }
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
            // Pierwsza interakcja = user gesture = AudioContext na pewno ruszy
            audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(audio.srcObject);
            gainNode = audioCtx.createGain();
            source.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            audio.muted = true; // oddajemy kontrolę GainNode, HTML element wyciszamy
        }

        if (gainNode) gainNode.gain.value = vol;
        else audio.volume = vol;

        if (audio.srcObject && audio.paused) audio.play().catch(() => {});
    });

    // Watch broadcast status
    onValue(
        ref(database, `${SESSION}/status`),
        async (snap) => {
            const status = snap.val();
            console.log('[Audio] Firebase status:', status);
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
            // Firebase permission error — most likely cause of "Brak transmisji"
            console.error('[Audio] Firebase error:', err);
            setAudioStatus(`⚠️ Firebase: ${err.code}`, false);
        }
    );
}

async function joinSession(audio) {
    if (listenerPc) return;

    const pc = new RTCPeerConnection(RTC_CFG);
    listenerPc = pc;

    // Receive broadcaster's audio track
    pc.ontrack = ({ streams }) => {
        audio.srcObject = streams[0];
        audio.muted = false;
        audio.volume = parseFloat(document.getElementById('volumeSlider').value);
        audio.play().catch(() => {});
        clearTimeout(watchdog);
        setAudioStatus('🔴 ON AIR', true);
    };

    // Send our ICE candidates to Firebase
    pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
            push(ref(database, `${SESSION}/listeners/${MY_ID}/listenerCandidates`), candidate.toJSON());
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            setAudioStatus('Połączenie przerwane — ponawiam...', false);
            listenerPc = null;
            // Retry after a short delay
            setTimeout(() => joinSession(audio), 2000);
        }
    };

    // Fallback: if no answer arrives in 8s, reset and retry
    const watchdog = setTimeout(() => {
        if (listenerPc === pc && pc.connectionState !== 'connected') {
            pc.close();
            listenerPc = null;
            setAudioStatus('🔴 Łączenie (retry)...', false);
            joinSession(audio);
        }
    }, 8000);

    // Create offer — we initiate the connection to the broadcaster
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);

    // Save offer + auto-cleanup on disconnect
    const myRef = ref(database, `${SESSION}/listeners/${MY_ID}`);
    await set(myRef, { offer: { type: offer.type, sdp: offer.sdp } });
    onDisconnect(myRef).remove();

    // Bufor ICE kandydatów od broadcastera — mogą dotrzeć PRZED setRemoteDescription
    const candBuffer = [];
    let remoteSet = false;
    const seenCands = new Set();

    function applyCandidate(cand) {
        pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    }

    // Wait for broadcaster's answer
    onValue(ref(database, `${SESSION}/listeners/${MY_ID}/answer`), async (snap) => {
        const answer = snap.val();
        if (answer && !pc.remoteDescription) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            remoteSet = true;
            // Zastosuj kandydatów zebranych przed odpowiedzią
            while (candBuffer.length) applyCandidate(candBuffer.shift());
        }
    });

    // Watch for ICE candidates from broadcaster
    onValue(ref(database, `${SESSION}/listeners/${MY_ID}/broadcasterCandidates`), (snap) => {
        snap.forEach(candSnap => {
            if (!seenCands.has(candSnap.key)) {
                seenCands.add(candSnap.key);
                const cand = candSnap.val();
                if (remoteSet) applyCandidate(cand);
                else candBuffer.push(cand); // Poczekaj na remote description
            }
        });
    });
}
