// Soundboard - wspólny moduł (DiceRollerWebsite/shared/soundboard/). Panel sterowania dla MG:
// siatka kart (jedna na wpis z manifestu music/sounds, patrz generate-manifest.js) + play/stop
// muzyki w tle (jeden aktywny kanał na raz - crossfade między scenami zamiast nakładania kilku
// podkładów), głośność, i jednorazowe wyzwalanie efektów (mogą nakładać się na muzykę i na siebie).
//
// Czyste funkcje w konwencji panels/journal.js z darkgraal3dashboard (buildXHtml/handleXAction) -
// projekt wpina je we WŁASNY render i dispatch akcji (klik + change), ten moduł nie zna Firebase
// ani konkretnego kształtu projektu poza tym, co dostaje jawnie w `ctx`:
//   ctx.state.soundboard  - { music: {key, startedAt, volume} | null, sfxFired: {key, at} | null }
//   ctx.data.soundboard   - manifest: [{ key, name, file, category: "music"|"sfx", loop }]
//   ctx.updateState(fn)   - mutator stanu danego projektu (patrz store.js#updateState)

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function clamp01(n) {
    return Math.min(1, Math.max(0, n));
}

function ensureSoundboardState(state) {
    if (!state.soundboard) state.soundboard = { music: null, sfxFired: null };
    return state.soundboard;
}

function renderMusicCard(entry, soundboard) {
    const playing = soundboard?.music?.key === entry.key;
    const volume = playing ? (soundboard.music.volume ?? 0.8) : 0.8;
    return `
        <div class="sb-card ${playing ? "sb-card-playing" : ""}">
            <div class="sb-card-name">${escapeHtml(entry.name)}</div>
            <button type="button" class="btn btn-sm ${playing ? "btn-gold" : ""}" data-action="sb-toggle-music" data-key="${entry.key}">
                ${playing ? "■ Stop" : "▶ Graj"}
            </button>
            ${playing ? `
                <input type="range" class="sb-card-volume" min="0" max="100" value="${Math.round(volume * 100)}"
                    data-action="sb-set-volume" data-key="${entry.key}">
            ` : ""}
        </div>
    `;
}

function renderSfxCard(entry) {
    return `
        <div class="sb-card">
            <div class="sb-card-name">${escapeHtml(entry.name)}</div>
            <button type="button" class="btn btn-sm" data-action="sb-fire-sfx" data-key="${entry.key}">▶ Odtwórz</button>
        </div>
    `;
}

/** Buduje HTML modułu "Dźwięki" do osadzenia w panelu MG (jedna karta `.card`, jak reszta modułów
 *  panels/mg.js) - patrz darkgraal3dashboard/js/panels/mg.js#buildHtml(). */
export function buildSoundboardControlHtml(ctx) {
    const manifest = ctx.data?.soundboard || [];
    if (!manifest.length) {
        return `
            <div class="card sb-module">
                <h3>Dźwięki</h3>
                <p class="placeholder">Brak plików w music/ i sounds/ - wgraj nagrania i odpal
                    <code>node shared/soundboard/generate-manifest.js &lt;projekt&gt;</code>, żeby zbudować manifest.</p>
            </div>
        `;
    }
    const music = manifest.filter(e => e.category === "music");
    const sfx = manifest.filter(e => e.category === "sfx");
    return `
        <div class="card sb-module">
            <h3>Dźwięki</h3>
            ${music.length ? `
                <h4>Muzyka</h4>
                <div class="sb-grid">${music.map(e => renderMusicCard(e, ctx.state.soundboard)).join("")}</div>
            ` : ""}
            ${sfx.length ? `
                <h4>Efekty</h4>
                <div class="sb-grid">${sfx.map(e => renderSfxCard(e)).join("")}</div>
            ` : ""}
        </div>
    `;
}

/** Obsługuje akcje modułu Dźwięki - do wywołania z jednego delegowanego handlera (klik ORAZ
 *  change, bo suwak głośności to <input type="range">, nie przycisk) w panelu MG danego projektu.
 *  Zwraca `true`, jeśli akcja została rozpoznana i obsłużona (wywołujący powinien wtedy przerwać
 *  dalsze przetwarzanie i wywołać swój rerender), inaczej `false`. */
export function handleSoundboardAction(action, el, ctx) {
    const { updateState } = ctx;

    if (action === "sb-toggle-music") {
        const key = el.dataset.key;
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            if (soundboard.music?.key === key) {
                soundboard.music = null;
            } else {
                soundboard.music = { key, startedAt: Date.now(), volume: soundboard.music?.volume ?? 0.8 };
            }
        });
        return true;
    }

    if (action === "sb-set-volume") {
        const key = el.dataset.key;
        const value = clamp01(Number(el.value) / 100);
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            if (soundboard.music?.key === key) soundboard.music.volume = value;
        });
        return true;
    }

    if (action === "sb-fire-sfx") {
        const key = el.dataset.key;
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            soundboard.sfxFired = { key, at: Date.now() };
        });
        return true;
    }

    return false;
}
