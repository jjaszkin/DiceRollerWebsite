// Soundboard - wspólny moduł (DiceRollerWebsite/shared/soundboard/). Panel sterowania dla MG:
// siatka kart (jedna na wpis z manifestu music/sounds, patrz generate-manifest.js) + play/stop
// muzyki w tle (jeden aktywny kanał na raz - crossfade między scenami zamiast nakładania kilku
// podkładów), głośność, playlisty (kolejność utworów odtwarzana automatycznie jedna po drugiej,
// patrz advancePlaylistTrack()), i jednorazowe wyzwalanie efektów (mogą nakładać się na muzykę
// i na siebie).
//
// Czyste funkcje w konwencji panels/journal.js z darkgraal3dashboard (buildXHtml/handleXAction) -
// projekt wpina je we WŁASNY render i dispatch akcji (klik + change), ten moduł nie zna Firebase
// ani konkretnego kształtu projektu poza tym, co dostaje jawnie w `ctx`:
//   ctx.state.soundboard  - { music, sfxFired, playlists } - patrz darkgraal3dashboard/js/state.js
//   ctx.data.soundboard   - manifest: [{ key, name, file, category: "music"|"sfx", loop }]
//   ctx.updateState(fn)   - mutator stanu danego projektu (patrz store.js#updateState)
//
// Mini-kreator playlist trzyma SWÓJ WŁASNY szkic (który utwór zaznaczony, w jakiej kolejności)
// jako czysto lokalny stan modułu (`ui` niżej) - analogicznie do panels/mg.js#ui.openLegendaryKey -
// dopóki MG nie kliknie "Zapisz", nic nie trafia do Firebase (więc podgląd kolejności podczas
// przeciągania nie synchronizuje się z nikim, co jest zamierzone - to lokalny szkic).

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    }[c]));
}

function clamp01(n) {
    return Math.min(1, Math.max(0, n));
}

function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function ensureSoundboardState(state) {
    if (!state.soundboard) state.soundboard = { music: null, sfxFired: null, playlists: {} };
    if (!state.soundboard.playlists) state.soundboard.playlists = {};
    return state.soundboard;
}

const ui = {
    editorOpen: false,
    editorPlaylistId: null, // null = tworzenie nowej playlisty, string = edycja istniejącej
    editorName: "",
    editorTrackKeys: []     // szkic kolejności odtwarzania (klucze utworów z manifestu)
};

function isPlayingMusic(state, key) {
    return state?.soundboard?.music?.key === key && !state.soundboard.music.playlistId;
}

function isPlayingPlaylist(state, playlistId) {
    return state?.soundboard?.music?.playlistId === playlistId;
}

function renderMusicCard(entry, state) {
    const playing = isPlayingMusic(state, entry.key);
    const volume = playing ? (state.soundboard.music.volume ?? 0.8) : 0.8;
    return `
        <div class="sb-card ${playing ? "sb-card-playing" : ""}">
            <div class="sb-card-name">${escapeHtml(entry.name)}</div>
            <button type="button" class="btn btn-sm ${playing ? "btn-gold" : ""}" data-action="sb-toggle-music" data-key="${entry.key}">
                ${playing ? "■ Stop" : "▶ Graj"}
            </button>
            ${playing ? `
                <input type="range" class="sb-range sb-card-volume" min="0" max="100" step="1" value="${Math.round(volume * 100)}"
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

function renderPlaylistCard(playlistId, playlist, state) {
    const playing = isPlayingPlaylist(state, playlistId);
    const volume = playing ? (state.soundboard.music.volume ?? 0.8) : 0.8;
    return `
        <div class="sb-card ${playing ? "sb-card-playing" : ""}">
            <div class="sb-card-name">${escapeHtml(playlist.name)} <span class="sb-card-sub">(${playlist.trackKeys.length})</span></div>
            <button type="button" class="btn btn-sm ${playing ? "btn-gold" : ""}" data-action="sb-toggle-playlist" data-key="${playlistId}">
                ${playing ? "■ Stop" : "▶ Graj"}
            </button>
            ${playing ? `
                <input type="range" class="sb-range sb-card-volume" min="0" max="100" step="1" value="${Math.round(volume * 100)}"
                    data-action="sb-set-volume" data-key="${playlistId}">
            ` : ""}
            <button type="button" class="btn btn-sm" data-action="sb-edit-playlist" data-key="${playlistId}">Edytuj</button>
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
    const playlists = Object.entries(ctx.state?.soundboard?.playlists || {});
    return `
        <div class="card sb-module">
            <h3>Dźwięki</h3>
            ${music.length ? `
                <h4>Muzyka</h4>
                <div class="sb-grid">${music.map(e => renderMusicCard(e, ctx.state)).join("")}</div>
            ` : ""}

            <h4>Playlisty</h4>
            <div class="sb-grid">
                ${playlists.map(([id, pl]) => renderPlaylistCard(id, pl, ctx.state)).join("")}
                <button type="button" class="sb-card sb-add-playlist" data-action="sb-new-playlist">+ Dodaj playlistę</button>
            </div>

            ${sfx.length ? `
                <h4>Efekty</h4>
                <div class="sb-grid">${sfx.map(e => renderSfxCard(e)).join("")}</div>
            ` : ""}
        </div>
    `;
}

/** Buduje HTML mini-kreatora playlisty (modal) - pusty string, jeśli edytor jest zamknięty. Do
 *  osadzenia obok reszty modali panelu MG (patrz panels/mg.js#buildHtml). */
export function buildSoundboardPlaylistEditorHtml(ctx) {
    if (!ui.editorOpen) return "";
    const musicEntries = (ctx.data?.soundboard || []).filter(e => e.category === "music");
    const byKey = new Map(musicEntries.map(e => [e.key, e]));
    const isEditing = !!ui.editorPlaylistId;

    return `
        <div class="modal-backdrop">
            <div class="modal">
                <h2>${isEditing ? "Edytuj playlistę" : "Nowa playlista"}</h2>

                <div class="mg-legendary-modal-field">
                    <label>Nazwa playlisty</label>
                    <input type="text" id="sbPlaylistNameInput" value="${escapeHtml(ui.editorName)}" placeholder="np. Camelot - sceny w zamku">
                </div>

                <div class="mg-legendary-modal-field">
                    <label>Utwory</label>
                    <div class="sb-playlist-track-checks">
                        ${musicEntries.length ? musicEntries.map(e => `
                            <label class="inline-check">
                                <input type="checkbox" data-action="sb-editor-toggle-track" data-key="${e.key}" ${ui.editorTrackKeys.includes(e.key) ? "checked" : ""}>
                                ${escapeHtml(e.name)}
                            </label>
                        `).join("") : `<span class="placeholder">Brak utworów w katalogu music/.</span>`}
                    </div>
                </div>

                <div class="mg-legendary-modal-field">
                    <label>Kolejność odtwarzania (przeciągnij albo użyj strzałek)</label>
                    <ul class="sb-playlist-order-list" id="sbPlaylistOrderList">
                        ${ui.editorTrackKeys.length ? ui.editorTrackKeys.map(key => `
                            <li class="sb-playlist-order-item" draggable="true" data-key="${key}">
                                <span class="sb-playlist-order-handle">☰</span>
                                <span class="sb-playlist-order-name">${escapeHtml(byKey.get(key)?.name || key)}</span>
                                <span class="sb-playlist-order-move">
                                    <button type="button" class="btn btn-xs" data-action="sb-editor-move-track" data-key="${key}" data-dir="up">↑</button>
                                    <button type="button" class="btn btn-xs" data-action="sb-editor-move-track" data-key="${key}" data-dir="down">↓</button>
                                </span>
                            </li>
                        `).join("") : `<li class="placeholder">Zaznacz utwory powyżej.</li>`}
                    </ul>
                </div>

                <div class="modal-actions">
                    ${isEditing ? `<button type="button" class="btn btn-sm" data-action="sb-delete-playlist" data-key="${ui.editorPlaylistId}">Usuń playlistę</button>` : ""}
                    <button type="button" class="btn btn-sm btn-gold" data-action="sb-save-playlist">Zapisz</button>
                    <button type="button" class="btn btn-sm" data-action="sb-close-playlist-editor">Anuluj</button>
                </div>
            </div>
        </div>
    `;
}

/** Czy mini-kreator playlisty jest aktualnie otwarty - do ew. warunków w projekcie (np. blokowania
 *  innych skrótów klawiszowych), obecnie nieużywane poza samym modułem. */
export function isPlaylistEditorOpen() {
    return ui.editorOpen;
}

/** Zapisuje NA BIEŻĄCO wpisywaną nazwę playlisty do lokalnego szkicu, BEZ rerenderu (patrz
 *  #sbPlaylistNameInput w projekcie - wpięte pod "input", nie pod żaden data-action). Bez tego
 *  wpisana nazwa ginęłaby przy najbliższym rerenderze wywołanym przez INNĄ akcję w tym samym
 *  modalu (np. zaznaczenie checkboxa utworu), bo input jest budowany od nowa z `ui.editorName`
 *  przy każdym pełnym innerHTML-rerenderze panelu MG. */
export function setPlaylistEditorName(value) {
    ui.editorName = value;
}

/** Przesuwa `fromKey` w szkicu kolejności edytora tak, żeby wylądował na pozycji `toKey` - do
 *  wywołania z obsługi natywnego "drop" w projekcie (patrz panels/mg.js), bo przeciąganie to inny
 *  rodzaj zdarzenia niż zwykłe data-action (dragstart/dragover/drop, nie click/change). */
export function reorderPlaylistEditorTrack(fromKey, toKey) {
    const fromIdx = ui.editorTrackKeys.indexOf(fromKey);
    const toIdx = ui.editorTrackKeys.indexOf(toKey);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const next = [...ui.editorTrackKeys];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, fromKey);
    ui.editorTrackKeys = next;
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
            if (soundboard.music?.key === key && !soundboard.music.playlistId) {
                soundboard.music = null;
            } else {
                soundboard.music = { key, startedAt: Date.now(), volume: soundboard.music?.volume ?? 0.8 };
            }
        });
        return true;
    }

    if (action === "sb-toggle-playlist") {
        const playlistId = el.dataset.key;
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            if (soundboard.music?.playlistId === playlistId) {
                soundboard.music = null;
            } else {
                const playlist = soundboard.playlists[playlistId];
                const firstKey = playlist?.trackKeys?.[0];
                if (!firstKey) return;
                soundboard.music = { key: firstKey, startedAt: Date.now(), volume: soundboard.music?.volume ?? 0.8, playlistId };
            }
        });
        return true;
    }

    if (action === "sb-set-volume") {
        const key = el.dataset.key;
        const value = clamp01(Number(el.value) / 100);
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            if (soundboard.music && (soundboard.music.key === key || soundboard.music.playlistId === key)) {
                soundboard.music.volume = value;
            }
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

    if (action === "sb-new-playlist") {
        ui.editorOpen = true;
        ui.editorPlaylistId = null;
        ui.editorName = "";
        ui.editorTrackKeys = [];
        return true;
    }

    if (action === "sb-edit-playlist") {
        const playlistId = el.dataset.key;
        const playlist = ctx.state?.soundboard?.playlists?.[playlistId];
        if (!playlist) return true;
        ui.editorOpen = true;
        ui.editorPlaylistId = playlistId;
        ui.editorName = playlist.name;
        ui.editorTrackKeys = [...playlist.trackKeys];
        return true;
    }

    if (action === "sb-close-playlist-editor") {
        ui.editorOpen = false;
        return true;
    }

    if (action === "sb-editor-toggle-track") {
        const key = el.dataset.key;
        ui.editorTrackKeys = ui.editorTrackKeys.includes(key)
            ? ui.editorTrackKeys.filter(k => k !== key)
            : [...ui.editorTrackKeys, key];
        return true;
    }

    if (action === "sb-editor-move-track") {
        const key = el.dataset.key;
        const dir = el.dataset.dir;
        const idx = ui.editorTrackKeys.indexOf(key);
        if (idx === -1) return true;
        const swapWith = dir === "up" ? idx - 1 : idx + 1;
        if (swapWith < 0 || swapWith >= ui.editorTrackKeys.length) return true;
        const next = [...ui.editorTrackKeys];
        [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
        ui.editorTrackKeys = next;
        return true;
    }

    if (action === "sb-save-playlist") {
        const nameInput = document.getElementById("sbPlaylistNameInput");
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name || !ui.editorTrackKeys.length) return true;
        const playlistId = ui.editorPlaylistId || uid();
        const trackKeys = [...ui.editorTrackKeys];
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            soundboard.playlists[playlistId] = { name, trackKeys };
        });
        ui.editorOpen = false;
        return true;
    }

    if (action === "sb-delete-playlist") {
        const playlistId = el.dataset.key;
        if (!window.confirm("Usunąć tę playlistę?")) return true;
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            delete soundboard.playlists[playlistId];
            if (soundboard.music?.playlistId === playlistId) soundboard.music = null;
        });
        ui.editorOpen = false;
        return true;
    }

    return false;
}

/** Przesuwa wspólny stan odtwarzania na KOLEJNY utwór playlisty po tym, jak `finishedKey` dograł do
 *  końca (patrz player-engine.js#onMusicEnded) - zapętla całą playlistę od początku po ostatnim
 *  utworze (świadomy domyślny wybór: w tle sceny raczej nie chcemy nagłej ciszy). Wywoływane
 *  WYŁĄCZNIE z przeglądarki MG (patrz main.js) - patrz komentarz w control-panel.js na górze pliku
 *  i w main.js#ensureSoundboardMounted, dlaczego tylko jedna przeglądarka może o tym decydować. */
export function advancePlaylistTrack(ctx, playlistId, finishedKey) {
    const { state, updateState } = ctx;
    const playlist = state?.soundboard?.playlists?.[playlistId];
    if (!playlist || !playlist.trackKeys?.length) return;
    const idx = playlist.trackKeys.indexOf(finishedKey);
    const nextIdx = (idx + 1) % playlist.trackKeys.length;
    const nextKey = playlist.trackKeys[nextIdx];
    updateState((s) => {
        const soundboard = ensureSoundboardState(s);
        // Playlista mogła w międzyczasie zostać zatrzymana/podmieniona przez MG - nie wskrzeszaj jej.
        if (soundboard.music?.playlistId !== playlistId) return;
        soundboard.music = { key: nextKey, startedAt: Date.now(), volume: soundboard.music?.volume ?? 0.8, playlistId };
    });
}
