#!/usr/bin/env node
// Soundboard - wspólny moduł (DiceRollerWebsite/shared/soundboard/).
// Skanuje music/ i sounds/ danego projektu (np. darkgraal3dashboard/) i (re)generuje
// data/soundboard.json - manifest, z którego korzysta player-engine.js (gracze) i
// control-panel.js (MG). Zero zależności (tylko fs/path z Node) - zgodnie z resztą repo, które
// nie ma buildera.
//
// Użycie:  node shared/soundboard/generate-manifest.js <ścieżka-do-projektu>
// Przykład: node shared/soundboard/generate-manifest.js darkgraal3dashboard
//
// Idempotentne i nienaruszające ręcznych zmian: jeśli data/soundboard.json już istnieje, wpisy
// dla plików, które nadal są na dysku, zostają BEZ ZMIAN (więc ręcznie poprawiona `name` albo
// przełączony `loop` MG przetrwa ponowne odpalenie skryptu po wgraniu nowych plików) - dopisywane
// są tylko NOWE pliki, a wpisy dla plików, które zniknęły z folderu, są usuwane (z ostrzeżeniem).

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

const AUDIO_EXTENSIONS = new Set([".mp3", ".ogg", ".m4a", ".wav", ".flac"]);

const CATEGORIES = [
    { folder: "music", category: "music", defaultLoop: true },
    { folder: "sounds", category: "sfx", defaultLoop: false }
];

/** Zamienia nazwę pliku na stabilny, czytelny klucz (bez rozszerzenia, bez polskich znaków,
 *  kebab-case) - używany jako identyfikator wpisu w state.soundboard, patrz control-panel.js. */
function slugify(name) {
    return name
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function scanFolder(projectDir, folder) {
    const dir = join(projectDir, folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter(f => AUDIO_EXTENSIONS.has(extname(f).toLowerCase()))
        .sort();
}

function main() {
    const projectArg = process.argv[2];
    if (!projectArg) {
        console.error("Użycie: node shared/soundboard/generate-manifest.js <ścieżka-do-projektu>");
        process.exit(1);
    }
    const projectDir = projectArg;
    if (!existsSync(projectDir)) {
        console.error(`Nie znaleziono folderu projektu: ${projectDir}`);
        process.exit(1);
    }

    const manifestPath = join(projectDir, "data", "soundboard.json");
    let existing = [];
    if (existsSync(manifestPath)) {
        try {
            existing = JSON.parse(readFileSync(manifestPath, "utf8"));
        } catch (err) {
            console.error(`Nie udało się wczytać istniejącego ${manifestPath}: ${err.message}`);
            process.exit(1);
        }
    }
    const existingByFile = new Map(existing.map(entry => [entry.file, entry]));

    const result = [];
    const seenFiles = new Set();
    let added = 0;

    for (const { folder, category, defaultLoop } of CATEGORIES) {
        for (const filename of scanFolder(projectDir, folder)) {
            const file = `${folder}/${filename}`;
            seenFiles.add(file);
            const prior = existingByFile.get(file);
            if (prior) {
                result.push(prior);
                continue;
            }
            const key = slugify(basename(filename, extname(filename)));
            result.push({
                key,
                name: basename(filename, extname(filename)),
                file,
                category,
                loop: defaultLoop
            });
            added++;
        }
    }

    const removed = existing.filter(entry => !seenFiles.has(entry.file));
    if (removed.length) {
        for (const entry of removed) {
            console.warn(`Usunięto z manifestu (plik już nie istnieje): ${entry.file}`);
        }
    }

    mkdirSync(join(projectDir, "data"), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(result, null, 4)}\n`);
    console.log(`Zapisano ${manifestPath}: ${result.length} wpisów (${added} nowych, ${removed.length} usuniętych).`);
}

main();
