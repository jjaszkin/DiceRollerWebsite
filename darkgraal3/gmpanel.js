import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import {
    getDatabase, ref, set, onValue, push, remove, onDisconnect
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

const app = initializeApp(firebaseConfig, 'gmpanel');
const db  = getDatabase(app);

// ── Config ─────────────────────────────────────────────────────────────────────

const SESSION = 'GMaudiostream';
const RTC_CFG = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
        // Opcjonalnie TURN dla trudnych sieci:
        // { urls: 'turn:...', username: '...', credential: '...' }
    ]
};

// ── State ──────────────────────────────────────────────────────────────────────

let localStream        = null;
let peerConnections    = {};
let processedListeners = new Set();
let isBroadcasting     = false;

// ── UI refs ────────────────────────────────────────────────────────────────────

const broadcastBtn      = document.getElementById('broadcastBtn');
const gmStatusDot       = document.getElementById('gmStatusDot');
const gmStatusText      = document.getElementById('gmStatusText');
const listenerCountEl   = document.getElementById('listenerCount');
const listenerCountText = document.getElementById('listenerCountText');
const deviceSelect      = document.getElementById('audioDeviceSelect');
const refreshBtn        = document.getElementById('refreshDevicesBtn');

// ── Device enumeration ─────────────────────────────────────────────────────────

async function loadAudioDevices() {
    // getUserMedia first — required by browsers to reveal device labels
    try {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach(t => t.stop());
    } catch (_) { /* permission denied — labels will be empty */ }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs  = devices.filter(d => d.kind === 'audioinput');

    deviceSelect.innerHTML = '';

    if (inputs.length === 0) {
        deviceSelect.innerHTML = '<option value="">Brak urządzeń audio</option>';
        return;
    }

    // Sort: Loopback devices first
    inputs.sort((a, b) => {
        const aIsLoop = /loopback/i.test(a.label);
        const bIsLoop = /loopback/i.test(b.label);
        return bIsLoop - aIsLoop;
    });

    inputs.forEach(device => {
        const opt   = document.createElement('option');
        opt.value   = device.deviceId;
        const isLoop = /loopback/i.test(device.label);
        opt.textContent = isLoop
            ? `🎵 ${device.label}`
            : device.label || `Urządzenie (${device.deviceId.slice(0, 8)})`;
        if (isLoop && deviceSelect.options.length === 0) opt.selected = true;
        deviceSelect.appendChild(opt);
    });
}

// ── UI helpers ─────────────────────────────────────────────────────────────────

function setStatus(text, isLive) {
    gmStatusText.textContent = text;
    gmStatusDot.className = `gm-status-dot${isLive ? ' live' : ''}`;
}

function updateListenerCount(n) {
    listenerCountEl.style.display = n > 0 ? 'block' : 'none';
    listenerCountText.textContent = `${n} ${n === 1 ? 'gracz połączony' : 'graczy połączonych'}`;
}

// ── Broadcast ──────────────────────────────────────────────────────────────────

async function startBroadcast() {
    const deviceId = deviceSelect.value;
    if (!deviceId) { setStatus('❌ Wybierz urządzenie audio.', false); return; }

    setStatus('Łączę z urządzeniem audio…', false);

    try {
        // getUserMedia + Loopback: zero okna share screen, czyste audio
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: deviceId }, echoCancellation: false,
                     noiseSuppression: false, autoGainControl: false },
            video: false
        });
    } catch (err) {
        setStatus(`❌ Błąd: ${err.message}`, false);
        return;
    }

    isBroadcasting = true;
    broadcastBtn.textContent = '⏹ Zatrzymaj transmisję';
    broadcastBtn.classList.add('active');
    deviceSelect.disabled = true;
    refreshBtn.disabled   = true;

    // ── Kolejność krytyczna ────────────────────────────────────────────────────
    // 1. Usuń stare dane graczy
    await remove(ref(db, `${SESSION}/listeners`));

    // 2. Nasłuch PRZED ogłoszeniem — żaden offer nie zginie
    onValue(ref(db, `${SESSION}/listeners`), (snapshot) => {
        if (!isBroadcasting || !snapshot.exists()) return;
        const currentIds = new Set();
        snapshot.forEach(childSnap => {
            const listenerId = childSnap.key;
            const data = childSnap.val();
            currentIds.add(listenerId);
            if (data?.offer && !processedListeners.has(listenerId)) {
                processedListeners.add(listenerId);
                connectToListener(listenerId, data.offer);
            }
        });
        updateListenerCount(currentIds.size);
    });

    // 3. Ogłoś transmisję graczom
    await set(ref(db, `${SESSION}/status`), 'live');
    onDisconnect(ref(db, `${SESSION}/status`)).set('offline');
    setStatus('📡 Nadajesz — gracze słyszą Twój system audio.', true);

    // Zatrzymaj gdy urządzenie przestanie działać
    localStream.getAudioTracks()[0].addEventListener('ended', stopBroadcast);
}

// ── WebRTC: obsługa połączenia z graczem ───────────────────────────────────────

async function connectToListener(listenerId, offer) {
    if (peerConnections[listenerId]) return;

    const pc = new RTCPeerConnection(RTC_CFG);
    peerConnections[listenerId] = pc;

    localStream.getAudioTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
            push(ref(db, `${SESSION}/listeners/${listenerId}/broadcasterCandidates`), candidate.toJSON());
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`Listener ${listenerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            delete peerConnections[listenerId];
            processedListeners.delete(listenerId);
        }
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await set(
        ref(db, `${SESSION}/listeners/${listenerId}/answer`),
        { type: answer.type, sdp: answer.sdp }
    );

    const seenCands = new Set();
    onValue(ref(db, `${SESSION}/listeners/${listenerId}/listenerCandidates`), (snap) => {
        snap.forEach(candSnap => {
            if (!seenCands.has(candSnap.key)) {
                seenCands.add(candSnap.key);
                pc.addIceCandidate(new RTCIceCandidate(candSnap.val())).catch(() => {});
            }
        });
    });
}

// ── Stop ───────────────────────────────────────────────────────────────────────

async function stopBroadcast() {
    isBroadcasting = false;

    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    processedListeners.clear();

    try {
        await set(ref(db, `${SESSION}/status`), 'offline');
        await remove(ref(db, `${SESSION}/listeners`));
    } catch (_) {}

    broadcastBtn.textContent = '▶ Nadawaj';
    broadcastBtn.classList.remove('active');
    deviceSelect.disabled = false;
    refreshBtn.disabled   = false;
    setStatus('Transmisja zakończona.', false);
    updateListenerCount(0);
}

// ── Events ─────────────────────────────────────────────────────────────────────

broadcastBtn.addEventListener('click', () => {
    if (isBroadcasting) stopBroadcast();
    else startBroadcast();
});

refreshBtn.addEventListener('click', loadAudioDevices);

// ── Init ───────────────────────────────────────────────────────────────────────

loadAudioDevices();
