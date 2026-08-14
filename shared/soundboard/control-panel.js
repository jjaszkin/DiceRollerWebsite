// Soundboard - wspólny moduł (DiceRollerWebsite/shared/soundboard/). Panel sterowania dla MG:
// lista kart pełnej szerokości (jedna na wpis z manifestu music/sounds, patrz generate-manifest.js,
// plus playlisty) + play/stop muzyki w tle (jeden aktywny kanał na raz - crossfade między scenami
// zamiast nakładania kilku podkładów), głośność, playlisty (kolejność utworów odtwarzana
// automatycznie jedna po drugiej, patrz advancePlaylistTrack()), podgląd/przeskakiwanie w obrębie
// playlisty (buildPlaylistPreviewHtml), własna kolejność wyświetlania kart (uchwyt/strzałki/
// drag&drop - patrz trackOrder), i jednorazowe wyzwalanie efektów (mogą nakładać się na muzykę
// i na siebie - to już działa "za darmo", bo to dwa niezależne kanały odtwarzania, patrz
// player-engine.js).
//
// Czyste funkcje w konwencji panels/journal.js z darkgraal3dashboard (buildXHtml/handleXAction) -
// projekt wpina je we WŁASNY render i dispatch akcji (klik + change + drag&drop), ten moduł nie zna
// Firebase ani konkretnego kształtu projektu poza tym, co dostaje jawnie w `ctx`:
//   ctx.state.soundboard  - { music, sfxFired, playlists, trackOrder } - patrz darkgraal3dashboard/js/state.js
//   ctx.data.soundboard   - manifest: [{ key, name, file, category: "music"|"sfx", loop }]
//   ctx.updateState(fn)   - mutator stanu danego projektu (patrz store.js#updateState)
//
// Mini-kreator playlist i modal podglądu trzymają SWÓJ WŁASNY, czysto lokalny stan (`ui` niżej) -
// analogicznie do panels/mg.js#ui.openLegendaryKey - dopóki MG nie kliknie "Zapisz" (dla edytora)
// nic nie trafia do Firebase.

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
    if (!state.soundboard) state.soundboard = { music: null, sfxFired: null, playlists: {}, trackOrder: [] };
    if (!state.soundboard.playlists) state.soundboard.playlists = {};
    if (!state.soundboard.trackOrder) state.soundboard.trackOrder = [];
    return state.soundboard;
}

const ui = {
    editorOpen: false,
    editorPlaylistId: null, // null = tworzenie nowej playlisty, string = edycja istniejącej
    editorName: "",
    editorTrackKeys: [],    // szkic kolejności odtwarzania (klucze utworów z manifestu)
    previewPlaylistId: null // otwarty modal podglądu/przeskakiwania playlisty, null = zamknięty
};

function isPlayingMusic(state, key) {
    return state?.soundboard?.music?.key === key && !state.soundboard.music.playlistId;
}

function isPlayingPlaylist(state, playlistId) {
    return state?.soundboard?.music?.playlistId === playlistId;
}

/** Sortuje `items` (obiekty z polem `key`) wg pozycji w `order` - elementy spoza `order` (np. nowo
 *  wgrany plik, zanim MG go choć raz przesunie) lądują na końcu, w swojej naturalnej kolejności. */
function applyOrder(items, order) {
    const orderIndex = new Map((order || []).map((k, i) => [k, i]));
    return [...items].sort((a, b) => {
        const ai = orderIndex.has(a.key) ? orderIndex.get(a.key) : Infinity;
        const bi = orderIndex.has(b.key) ? orderIndex.get(b.key) : Infinity;
        return ai - bi;
    });
}

/** Klucze WSZYSTKICH elementów danej sekcji ("music"/"sfx"/"playlist") w AKTUALNEJ kolejności
 *  wyświetlania - do wyznaczenia sąsiadów przy strzałkach ↑/↓ (patrz sb-move-entry). */
function getSectionKeys(ctx, section) {
    const order = ctx.state?.soundboard?.trackOrder || [];
    if (section === "playlist") {
        const items = Object.keys(ctx.state?.soundboard?.playlists || {}).map(id => ({ key: id }));
        return applyOrder(items, order).map(x => x.key);
    }
    const items = (ctx.data?.soundboard || []).filter(e => e.category === section);
    return applyOrder(items, order).map(e => e.key);
}

/** Pełna lista kluczy do zapisania jako trackOrder (manifest + playlisty) - baza do "dopełnienia"
 *  częściowej/pustej kolejności o elementy, których jeszcze w niej nie ma (patrz sb-move-entry
 *  i reorderMainOrder). */
function allOrderableKeys(ctx) {
    return [
        ...(ctx.data?.soundboard || []).map(e => e.key),
        ...Object.keys(ctx.state?.soundboard?.playlists || {})
    ];
}

function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Pasek postępu + klik-aby-przewinąć (patrz panels/mg.js#sb-seek - liczenie sekund z pozycji
 *  kliknięcia musi znać `duration`, którego ten czysto-HTML-owy moduł nie zna, więc samo
 *  przewijanie jest obsłużone poza handleSoundboardAction, bezpośrednio w projekcie). `key` to
 *  klucz utworu ALBO playlisty - musi być tym samym, co MG kliknął w "Graj" (patrz sb-set-volume
 *  dla analogicznego dopasowania po key/playlistId). */
function renderProgressBar(key, nowPlaying) {
    if (!nowPlaying) return "";
    const pct = clamp01(nowPlaying.currentTime / nowPlaying.duration) * 100;
    return `
        <div class="sb-progress" data-action="sb-seek" data-key="${key}">
            <div class="sb-progress-fill" style="width: ${pct}%"></div>
        </div>
        <div class="sb-progress-time">${formatTime(nowPlaying.currentTime)} / ${formatTime(nowPlaying.duration)}</div>
    `;
}

function renderMusicCard(entry, state, nowPlaying) {
    const playing = isPlayingMusic(state, entry.key);
    const volume = playing ? (state.soundboard.music.volume ?? 0.8) : 0.8;
    return `
        <div class="sb-card sb-card-row ${playing ? "sb-card-playing" : ""}" draggable="true" data-key="${entry.key}" data-reorder-scope="main">
            <span class="sb-card-handle" title="Przeciągnij, żeby zmienić kolejność">☰</span>
            <span class="sb-card-order-buttons">
                <button type="button" class="btn btn-xs" data-action="sb-move-entry" data-key="${entry.key}" data-section="music" data-dir="up">↑</button>
                <button type="button" class="btn btn-xs" data-action="sb-move-entry" data-key="${entry.key}" data-section="music" data-dir="down">↓</button>
            </span>
            <div class="sb-card-body">
                <div class="sb-card-name">${escapeHtml(entry.name)}</div>
                ${playing ? renderProgressBar(entry.key, nowPlaying) : ""}
                ${playing ? `
                    <input type="range" class="sb-range sb-card-volume" min="0" max="100" step="1" value="${Math.round(volume * 100)}"
                        data-action="sb-set-volume" data-key="${entry.key}">
                ` : ""}
            </div>
            <button type="button" class="btn btn-sm ${playing ? "btn-gold" : ""}" data-action="sb-toggle-music" data-key="${entry.key}">
                ${playing ? "■ Stop" : "▶ Graj"}
            </button>
        </div>
    `;
}

function renderSfxCard(entry) {
    return `
        <div class="sb-card sb-card-row" draggable="true" data-key="${entry.key}" data-reorder-scope="main">
            <span class="sb-card-handle" title="Przeciągnij, żeby zmienić kolejność">☰</span>
            <span class="sb-card-order-buttons">
                <button type="button" class="btn btn-xs" data-action="sb-move-entry" data-key="${entry.key}" data-section="sfx" data-dir="up">↑</button>
                <button type="button" class="btn btn-xs" data-action="sb-move-entry" data-key="${entry.key}" data-section="sfx" data-dir="down">↓</button>
            </span>
            <div class="sb-card-body">
                <div class="sb-card-name">${escapeHtml(entry.name)}</div>
            </div>
            <button type="button" class="btn btn-sm" data-action="sb-fire-sfx" data-key="${entry.key}">▶ Odtwórz</button>
        </div>
    `;
}

function renderPlaylistCard(playlistId, playlist, state, nowPlaying) {
    const playing = isPlayingPlaylist(state, playlistId);
    const volume = playing ? (state.soundboard.music.volume ?? 0.8) : 0.8;
    return `
        <div class="sb-card sb-card-row ${playing ? "sb-card-playing" : ""}" draggable="true" data-key="${playlistId}" data-reorder-scope="main">
            <span class="sb-card-handle" title="Przeciągnij, żeby zmienić kolejność">☰</span>
            <span class="sb-card-order-buttons">
                <button type="button" class="btn btn-xs" data-action="sb-move-entry" data-key="${playlistId}" data-section="playlist" data-dir="up">↑</button>
                <button type="button" class="btn btn-xs" data-action="sb-move-entry" data-key="${playlistId}" data-section="playlist" data-dir="down">↓</button>
            </span>
            <div class="sb-card-body">
                <div class="sb-card-name">${escapeHtml(playlist.name)} <span class="sb-card-sub">(${playlist.trackKeys.length})</span></div>
                ${playing ? renderProgressBar(playlistId, nowPlaying) : ""}
                ${playing ? `
                    <input type="range" class="sb-range sb-card-volume" min="0" max="100" step="1" value="${Math.round(volume * 100)}"
                        data-action="sb-set-volume" data-key="${playlistId}">
                ` : ""}
            </div>
            <div class="sb-card-actions">
                <button type="button" class="btn btn-sm ${playing ? "btn-gold" : ""}" data-action="sb-toggle-playlist" data-key="${playlistId}">
                    ${playing ? "■ Stop" : "▶ Graj"}
                </button>
                <button type="button" class="btn btn-sm" data-action="sb-open-playlist-preview" data-key="${playlistId}">Podgląd</button>
                <button type="button" class="btn btn-sm" data-action="sb-edit-playlist" data-key="${playlistId}">Edytuj</button>
            </div>
        </div>
    `;
}

/** Buduje HTML modułu "Dźwięki" do osadzenia w panelu MG (jedna karta `.card`, jak reszta modułów
 *  panels/mg.js) - patrz darkgraal3dashboard/js/panels/mg.js#buildHtml(). `nowPlaying` (opcjonalne,
 *  patrz player-engine.js#getNowPlaying) włącza pasek postępu na aktualnie grającej karcie - projekt
 *  musi go dostarczyć samodzielnie, bo ten moduł nie ma dostępu do żadnego <audio>. */
export function buildSoundboardControlHtml(ctx, nowPlaying = null) {
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
    const order = ctx.state?.soundboard?.trackOrder || [];
    const music = applyOrder(manifest.filter(e => e.category === "music"), order);
    const sfx = applyOrder(manifest.filter(e => e.category === "sfx"), order);
    const playlistItems = Object.entries(ctx.state?.soundboard?.playlists || {}).map(([id, pl]) => ({ key: id, ...pl }));
    const playlists = applyOrder(playlistItems, order);

    return `
        <div class="card sb-module">
            <h3>Dźwięki</h3>
            ${music.length ? `
                <h4>Muzyka</h4>
                <div class="sb-list">${music.map(e => renderMusicCard(e, ctx.state, nowPlaying)).join("")}</div>
            ` : ""}

            <h4>Playlisty</h4>
            <div class="sb-list">
                ${playlists.map(pl => renderPlaylistCard(pl.key, pl, ctx.state, nowPlaying)).join("")}
            </div>
            <button type="button" class="sb-add-playlist" data-action="sb-new-playlist">+ Dodaj playlistę</button>

            ${sfx.length ? `
                <h4>Efekty</h4>
                <div class="sb-list">${sfx.map(e => renderSfxCard(e)).join("")}</div>
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

/** Buduje HTML modalu podglądu playlisty: lista jej utworów (aktualnie grający podświetlony,
 *  klikalny -> przeskakuje na niego), strzałki poprzedni/następny, pasek postępu aktualnego utworu.
 *  Pusty string, jeśli zamknięty. */
export function buildPlaylistPreviewHtml(ctx, nowPlaying = null) {
    if (!ui.previewPlaylistId) return "";
    const playlist = ctx.state?.soundboard?.playlists?.[ui.previewPlaylistId];
    if (!playlist) return "";
    const musicByKey = new Map((ctx.data?.soundboard || []).filter(e => e.category === "music").map(e => [e.key, e]));
    const playlistId = ui.previewPlaylistId;
    const isPlaying = isPlayingPlaylist(ctx.state, playlistId);
    const currentKey = isPlaying ? ctx.state.soundboard.music.key : null;

    const rows = playlist.trackKeys.map(key => {
        const entry = musicByKey.get(key);
        const isCurrent = key === currentKey;
        return `
            <li class="sb-preview-row ${isCurrent ? "sb-preview-row-current" : ""}">
                <button type="button" class="sb-preview-track-btn" data-action="sb-playlist-jump" data-playlist="${playlistId}" data-key="${key}">
                    ${isCurrent ? "▶ " : ""}${escapeHtml(entry?.name || key)}
                </button>
            </li>
        `;
    }).join("");

    return `
        <div class="modal-backdrop">
            <div class="modal">
                <h2>${escapeHtml(playlist.name)}</h2>
                ${isPlaying ? `
                    ${renderProgressBar(playlistId, nowPlaying)}
                    <div class="sb-preview-transport">
                        <button type="button" class="btn btn-sm" data-action="sb-playlist-step" data-playlist="${playlistId}" data-dir="prev">← Poprzedni</button>
                        <button type="button" class="btn btn-sm" data-action="sb-playlist-step" data-playlist="${playlistId}" data-dir="next">Następny →</button>
                    </div>
                ` : `<p class="placeholder">Playlista aktualnie nie gra - kliknij utwór, żeby ją odtworzyć od tego miejsca.</p>`}
                <ul class="sb-preview-list">${rows || `<li class="placeholder">Playlista jest pusta.</li>`}</ul>
                <div class="modal-actions">
                    <button type="button" class="btn btn-sm" data-action="sb-close-playlist-preview">Zamknij</button>
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

/** Jak reorderPlaylistEditorTrack, ale dla GŁÓWNEJ listy kart (music/sfx/playlisty) - w
 *  odróżnieniu od edytora playlisty, to NIE jest lokalny szkic: pisze od razu do
 *  state.soundboard.trackOrder (tak jak strzałki ↑/↓, patrz sb-move-entry w handleSoundboardAction),
 *  bo główna lista nie ma kroku "Zapisz". Wywołuj z obsługi natywnego "drop" w projekcie. */
export function reorderMainOrder(ctx, fromKey, toKey) {
    if (fromKey === toKey) return;
    const { updateState } = ctx;
    const allKeys = allOrderableKeys(ctx);
    updateState((state) => {
        const soundboard = ensureSoundboardState(state);
        const order = soundboard.trackOrder.length ? [...soundboard.trackOrder] : [];
        for (const k of allKeys) if (!order.includes(k)) order.push(k);
        const fromIdx = order.indexOf(fromKey);
        const toIdx = order.indexOf(toKey);
        if (fromIdx === -1 || toIdx === -1) return;
        order.splice(fromIdx, 1);
        order.splice(order.indexOf(toKey), 0, fromKey);
        soundboard.trackOrder = order;
    });
}

/** Zapisuje NA BIEŻĄCO wpisywaną nazwę playlisty do lokalnego szkicu, BEZ rerenderu (patrz
 *  #sbPlaylistNameInput w projekcie - wpięte pod "input", nie pod żaden data-action). Bez tego
 *  wpisana nazwa ginęłaby przy najbliższym rerenderze wywołanym przez INNĄ akcję w tym samym
 *  modalu (np. zaznaczenie checkboxa utworu), bo input jest budowany od nowa z `ui.editorName`
 *  przy każdym pełnym innerHTML-rerenderze panelu MG. */
export function setPlaylistEditorName(value) {
    ui.editorName = value;
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

    if (action === "sb-move-entry") {
        const key = el.dataset.key;
        const section = el.dataset.section;
        const siblingKeys = getSectionKeys(ctx, section);
        const idx = siblingKeys.indexOf(key);
        const dir = el.dataset.dir;
        const swapWithKey = dir === "up" ? siblingKeys[idx - 1] : siblingKeys[idx + 1];
        if (!swapWithKey) return true;
        const allKeys = allOrderableKeys(ctx);
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            const order = soundboard.trackOrder.length ? [...soundboard.trackOrder] : [];
            for (const k of allKeys) if (!order.includes(k)) order.push(k);
            const i1 = order.indexOf(key);
            const i2 = order.indexOf(swapWithKey);
            [order[i1], order[i2]] = [order[i2], order[i1]];
            soundboard.trackOrder = order;
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
        if (ui.previewPlaylistId === playlistId) ui.previewPlaylistId = null;
        return true;
    }

    if (action === "sb-open-playlist-preview") {
        ui.previewPlaylistId = el.dataset.key;
        return true;
    }

    if (action === "sb-close-playlist-preview") {
        ui.previewPlaylistId = null;
        return true;
    }

    if (action === "sb-playlist-jump") {
        const playlistId = el.dataset.playlist;
        const key = el.dataset.key;
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            soundboard.music = { key, startedAt: Date.now(), volume: soundboard.music?.volume ?? 0.8, playlistId };
        });
        return true;
    }

    if (action === "sb-playlist-step") {
        const playlistId = el.dataset.playlist;
        const dir = el.dataset.dir;
        updateState((state) => {
            const soundboard = ensureSoundboardState(state);
            const playlist = soundboard.playlists?.[playlistId];
            if (!playlist || !playlist.trackKeys.length) return;
            const len = playlist.trackKeys.length;
            const currentKey = soundboard.music?.playlistId === playlistId ? soundboard.music.key : null;
            const idx = currentKey ? playlist.trackKeys.indexOf(currentKey) : -1;
            const nextIdx = dir === "prev"
                ? (idx <= 0 ? len - 1 : idx - 1)
                : (idx + 1) % len;
            soundboard.music = { key: playlist.trackKeys[nextIdx], startedAt: Date.now(), volume: soundboard.music?.volume ?? 0.8, playlistId };
        });
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
