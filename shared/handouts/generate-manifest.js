#!/usr/bin/env node
// Handouty - wspólny moduł (DiceRollerWebsite/shared/handouts/). Skanuje handouts/ danego
// projektu i (re)generuje data/handouts.json - manifest, z którego korzystają control-panel.js
// (MG) i viewer.js (gracze). Zero zależności (tylko fs/path z Node), ta sama konwencja co
// shared/soundboard/generate-manifest.js.
//
// Użycie:  node shared/handouts/generate-manifest.js <ścieżka-do-projektu>
// Przykład: node shared/handouts/generate-manifest.js darkgraal3dashboard
//
// Idempotentne i nienaruszające ręcznych zmian: wpisy dla plików, które nadal są na dysku,
// zostają BEZ ZMIAN (więc ręcznie poprawiona `name` przetrwa ponowne odpalenie po wgraniu nowych
// obrazków) - dopisywane są tylko NOWE pliki, a wpisy dla plików, które zniknęły z folderu, są
// usuwane (z ostrzeżeniem).

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** Zamienia nazwę pliku na stabilny, czytelny klucz (bez rozszerzenia, bez polskich znaków,
 *  kebab-case) - używany jako identyfikator wpisu w state.handouts, patrz control-panel.js. */
function slugify(name) {
    return name
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Wyciąga numer z nazwy pliku (pierwszy ciąg cyfr) - steruje domyślną kolejnością "najwyższy
 *  numer na górze" (patrz control-panel.js#buildHandoutsControlHtml). Brak cyfr w nazwie => 0,
 *  więc taki wpis ląduje na końcu listy zamiast gdzieś losowo w środku. */
function extractNumber(name) {
    const m = name.match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
}

function main() {
    const projectArg = process.argv[2];
    if (!projectArg) {
        console.error("Użycie: node shared/handouts/generate-manifest.js <ścieżka-do-projektu>");
        process.exit(1);
    }
    if (!existsSync(projectArg)) {
        console.error(`Nie znaleziono folderu projektu: ${projectArg}`);
        process.exit(1);
    }

    const handoutsDir = join(projectArg, "handouts");
    const manifestPath = join(projectArg, "data", "handouts.json");
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

    const files = existsSync(handoutsDir)
        ? readdirSync(handoutsDir).filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase())).sort()
        : [];

    const result = [];
    const seenFiles = new Set();
    let added = 0;

    for (const filename of files) {
        const file = `handouts/${filename}`;
        seenFiles.add(file);
        const prior = existingByFile.get(file);
        if (prior) {
            result.push(prior);
            continue;
        }
        const nameWithoutExt = basename(filename, extname(filename));
        result.push({
            key: slugify(nameWithoutExt),
            name: nameWithoutExt,
            file,
            number: extractNumber(nameWithoutExt)
        });
        added++;
    }

    const removed = existing.filter(entry => !seenFiles.has(entry.file));
    for (const entry of removed) {
        console.warn(`Usunięto z manifestu (plik już nie istnieje): ${entry.file}`);
    }

    mkdirSync(join(projectArg, "data"), { recursive: true });
    writeFileSync(manifestPath, `${JSON.stringify(result, null, 4)}\n`);
    console.log(`Zapisano ${manifestPath}: ${result.length} wpisów (${added} nowych, ${removed.length} usuniętych).`);
}

main();
