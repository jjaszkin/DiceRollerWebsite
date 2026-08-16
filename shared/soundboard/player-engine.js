// Soundboard - wspólny moduł (DiceRollerWebsite/shared/soundboard/). Silnik odtwarzania dla
// graczy: subskrybuje wspólny stan kampanii i steruje realnymi elementami <audio> lokalnie w
// przeglądarce. Przez sieć (Firebase) leci WYŁĄCZNIE mikroskopijny stan odtwarzania (który klucz
// gra, od kiedy, jaka głośność) - same pliki audio serwuje Netlify (CDN) bezpośrednio do gracza,
// bez żadnego streamu z komputera MG (patrz control-panel.js dla strony MG, generate-manifest.js
// dla budowania manifestu z folderów music/ i sounds/).
//
// Nie zna Firebase ani konkretnego projektu - dostaje jawnie { manifest, subscribe, getState }.
// `subscribe(fn)`/`getState()` to store.js#subscribe/getState danego projektu (ten sam kontrakt,
// który już mają wszystkie panele - patrz darkgraal3dashboard/js/store.js).
//
// Mocno zalecane: montować z poziomu powłoki UI gracza RAZ, do stabilnego węzła DOM POZA
// panelami, które robią pełny `root.innerHTML = ...` przy każdym rerenderze (np. character.js/
// roller.js) - inaczej element <audio> byłby niszczony i tworzony na nowo przy każdej zmianie
// stanu, co przerywałoby odtwarzanie. W darkgraal3dashboard to osobny <div id="soundboardRoot">
// w index.html, montowany raz z main.js#bootstrap().

const MASTER_VOLUME_KEY = "soundboard-master-volume";
const MASTER_MUTED_KEY = "soundboard-master-muted";
const SFX_STALE_MS = 4000; // starsze zdarzenia (np. przy dołączeniu w trakcie sesji) są ignorowane

function clamp01(n) {
    return Math.min(1, Math.max(0, n));
}

function readMasterVolume() {
    const raw = localStorage.getItem(MASTER_VOLUME_KEY);
    const n = raw === null ? 1 : Number(raw);
    return Number.isFinite(n) ? clamp01(n) : 1;
}

function readMasterMuted() {
    return localStorage.getItem(MASTER_MUTED_KEY) === "1";
}

// Referencja do jedynego (na całą stronę) elementu <audio> muzyki - montowanego raz, patrz
// main.js#ensureSoundboardMounted. Wystawiona przez getNowPlaying(), żeby panel MG (control-panel.js
// nie zna Firebase ani żadnego <audio> - to CZYSTE funkcje budujące HTML) mógł pokazać pasek
// postępu i policzyć pozycję kliknięcia przy przewijaniu (patrz panels/mg.js#sb-seek).
let activeMusicAudioRef = null;

/** Zwraca { currentTime, duration } aktualnie odtwarzanego utworu muzyki, albo `null`, jeśli nic
 *  nie gra albo metadane (długość) jeszcze nie są znane. `duration` bywa `NaN`/`Infinity` zanim
 *  przeglądarka pozna długość pliku - wywołujący powinien to sprawdzić przed pokazaniem paska. */
export function getNowPlaying() {
    const el = activeMusicAudioRef;
    if (!el || el.paused || !Number.isFinite(el.duration) || el.duration <= 0) return null;
    return { currentTime: el.currentTime, duration: el.duration };
}

/**
 * Montuje silnik odtwarzania + mały pływający widget (głośność/wycisz) w `container`.
 * @param {HTMLElement} container
 * @param {{ manifest: Array, subscribe: Function, getState: Function, onMusicEnded?: Function }} deps
 *   `onMusicEnded(playlistId, finishedKey)` - opcjonalne, wywoływane, gdy odtwarzany jako część
 *   playlisty utwór naturalnie dogra do końca (utwory z playlisty świadomie NIE są zapętlane
 *   pojedynczo, patrz applyMusicState niżej - inaczej nigdy nie doszłoby do zdarzenia "ended").
 *   Ma sens tylko w JEDNEJ przeglądarce naraz (patrz komentarz w main.js#ensureSoundboardMounted),
 *   więc większość wywołujących (gracze) po prostu tego nie przekazuje.
 */
export function mountSoundboardPlayer(container, { manifest, subscribe, getState, onMusicEnded }) {
    const byKey = new Map((manifest || []).map(e => [e.key, e]));

    const musicAudio = new Audio();
    musicAudio.preload = "auto";
    activeMusicAudioRef = musicAudio;

    let masterVolume = readMasterVolume();
    let masterMuted = readMasterMuted();
    let appliedMusicKey = null;
    let appliedMusicStartedAt = null;
    let appliedPlaylistId = null;
    let lastSfxAt = 0;
    let locked = false; // autoplay zablokowany przez przeglądarkę - patrz showUnlockPrompt niżej
    let toggleBtnRef = null;

    musicAudio.addEventListener("ended", () => {
        if (onMusicEnded && appliedPlaylistId && appliedMusicKey) {
            onMusicEnded(appliedPlaylistId, appliedMusicKey);
        }
    });

    // Kropka na przycisku FAB pokazująca, czy TA przeglądarka faktycznie coś teraz słyszy (nie to
    // samo, co "state.soundboard.music istnieje" - to mogłoby być true nawet gdy audio jest
    // zablokowane/jeszcze się ładuje). Zdarzeniowo (play/pause), nie odpytywaniem co sekundę.
    musicAudio.addEventListener("play", () => {
        if (toggleBtnRef) toggleBtnRef.classList.add("sb-player-toggle-active");
    });
    musicAudio.addEventListener("pause", () => {
        if (toggleBtnRef) toggleBtnRef.classList.remove("sb-player-toggle-active");
    });

    function effectiveVolume(trackVolume) {
        return masterMuted ? 0 : clamp01((trackVolume ?? 1) * masterVolume);
    }

    function attemptPlay(audioEl) {
        const playPromise = audioEl.play();
        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch(() => showUnlockPrompt());
        }
    }

    function applyMusicState(musicState) {
        if (!musicState) {
            if (appliedMusicKey !== null) {
                musicAudio.pause();
                appliedMusicKey = null;
                appliedMusicStartedAt = null;
                appliedPlaylistId = null;
            }
            return;
        }
        const entry = byKey.get(musicState.key);
        if (!entry) return;

        musicAudio.volume = effectiveVolume(musicState.volume);

        if (appliedMusicKey === musicState.key && appliedMusicStartedAt === musicState.startedAt) {
            return; // ten sam utwór, od tego samego momentu - już powinien grać, nic nie rób
        }
        appliedMusicKey = musicState.key;
        appliedMusicStartedAt = musicState.startedAt;
        appliedPlaylistId = musicState.playlistId || null;
        musicAudio.src = entry.file;
        // Utwory odtwarzane jako część playlisty NIE są zapętlane pojedynczo (nawet jeśli katalog
        // ma dla nich `loop: true`) - inaczej audio.loop=true sprawiłoby, że przeglądarka nigdy nie
        // wyemitowałaby zdarzenia "ended", więc playlista nigdy by się nie przesunęła dalej.
        const loop = appliedPlaylistId ? false : !!entry.loop;
        musicAudio.loop = loop;

        const seekAndPlay = () => {
            const elapsed = Math.max(0, (Date.now() - musicState.startedAt) / 1000);
            try {
                musicAudio.currentTime = loop && musicAudio.duration
                    ? elapsed % musicAudio.duration
                    : elapsed;
            } catch { /* metadata jeszcze nie w pełni gotowe - odtwórz od bieżącej pozycji */ }
            attemptPlay(musicAudio);
        };
        if (musicAudio.readyState >= 1) seekAndPlay();
        else musicAudio.addEventListener("loadedmetadata", seekAndPlay, { once: true });
    }

    function fireSfx(sfxState) {
        if (!sfxState || sfxState.at <= lastSfxAt) return;
        lastSfxAt = sfxState.at;
        if (Date.now() - sfxState.at > SFX_STALE_MS) return; // stare zdarzenie (np. świeże dołączenie)
        const entry = byKey.get(sfxState.key);
        if (!entry) return;
        const el = new Audio(entry.file);
        el.volume = effectiveVolume(1);
        el.addEventListener("ended", () => el.remove());
        attemptPlay(el);
    }

    function onStateChange(state) {
        const soundboard = state?.soundboard;
        applyMusicState(soundboard?.music || null);
        fireSfx(soundboard?.sfxFired || null);
    }

    /** Przeglądarka zablokowała autoplay - patrz attemptPlay(). ŚWIADOMIE nie ma tu osobnego,
     *  dodatkowego pływającego przycisku "odblokuj" (poprzednia wersja miała taki, dokładnie w tym
     *  samym miejscu na ekranie co panel głośności - z wyższym z-index, więc gdy zostawał
     *  niezauważony, CICHO blokował kliknięcia w suwak głośności pod spodem). Zamiast tego sam
     *  przycisk FAB sygnalizuje blokadę (🔇 + pulsowanie) - kliknięcie w NIEGO (który i tak trzeba
     *  kliknąć, żeby otworzyć panel) jest samo w sobie gestem użytkownika, więc odblokowuje audio. */
    function showUnlockPrompt() {
        if (locked) return;
        locked = true;
        if (toggleBtnRef) {
            toggleBtnRef.textContent = "🔇";
            toggleBtnRef.classList.add("sb-player-toggle-locked");
            toggleBtnRef.title = "Dźwięk zablokowany przez przeglądarkę - kliknij, żeby włączyć";
        }
    }

    function unlock() {
        if (!locked) return;
        locked = false;
        if (toggleBtnRef) {
            toggleBtnRef.textContent = "🔊";
            toggleBtnRef.classList.remove("sb-player-toggle-locked");
            toggleBtnRef.title = "Dźwięk";
        }
        if (appliedMusicKey) attemptPlay(musicAudio);
    }

    function buildWidget() {
        const el = document.createElement("div");
        el.className = "sb-player-widget";
        el.innerHTML = `
            <button type="button" class="sb-player-toggle" title="Dźwięk" aria-label="Ustawienia dźwięku">🔊</button>
            <div class="sb-player-panel">
                <label class="sb-player-row">
                    <input type="checkbox" class="sb-player-mute" ${masterMuted ? "checked" : ""}>
                    Wycisz
                </label>
                <label class="sb-player-row">
                    <input type="range" class="sb-range sb-player-volume" min="0" max="100" step="1" value="${Math.round(masterVolume * 100)}">
                </label>
            </div>
        `;

        const toggleBtn = el.querySelector(".sb-player-toggle");
        toggleBtnRef = toggleBtn;
        const panel = el.querySelector(".sb-player-panel");
        toggleBtn.addEventListener("click", () => {
            if (locked) unlock();
            panel.classList.toggle("sb-player-panel-open");
        });

        el.querySelector(".sb-player-mute").addEventListener("change", (e) => {
            masterMuted = e.target.checked;
            localStorage.setItem(MASTER_MUTED_KEY, masterMuted ? "1" : "0");
            musicAudio.volume = effectiveVolume(getState()?.soundboard?.music?.volume);
        });

        el.querySelector(".sb-player-volume").addEventListener("input", (e) => {
            masterVolume = clamp01(Number(e.target.value) / 100);
            localStorage.setItem(MASTER_VOLUME_KEY, String(masterVolume));
            musicAudio.volume = effectiveVolume(getState()?.soundboard?.music?.volume);
        });

        return el;
    }

    container.appendChild(buildWidget());
    subscribe(onStateChange);
    onStateChange(getState());
}
