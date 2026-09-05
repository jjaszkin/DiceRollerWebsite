#!/usr/bin/env node
// Obrazki - wspólny moduł (DiceRollerWebsite/shared/images/). Skanuje images/ danego projektu i
// (re)generuje data/images.json - manifest, z którego korzystają wybieraki obrazków w danym
// projekcie (np. battletrackerklatwa/js/components/imagePicker.js). Ta sama konwencja co
// shared/handouts/generate-manifest.js, tylko skanuje images/ zamiast handouts/ i pomija plik
// favicon.ico (wyklucza go po nazwie, nie tylko po rozszerzeniu, bo .ico i tak nie jest na liście
// rozszerzeń poniżej).
//
// Użycie:  node shared/images/generate-manifest.js <ścieżka-do-projektu>
// Przykład: node shared/images/generate-manifest.js battletrackerklatwa
//
// Idempotentne i nienaruszające ręcznych zmian: wpisy dla plików, które nadal są na dysku,
// zostają BEZ ZMIAN (więc ręcznie poprawiona `name` przetrwa ponowne odpalenie po wgraniu nowych
// obrazków) - dopisywane są tylko NOWE pliki, a wpisy dla plików, które zniknęły z folderu, są
// usuwane (z ostrzeżeniem).

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, extname, basename } from "node:path";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function slugify(name) {
    return name
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function main() {
    const projectArg = process.argv[2];
    if (!projectArg) {
        console.error("Użycie: node shared/images/generate-manifest.js <ścieżka-do-projektu>");
        process.exit(1);
    }
    if (!existsSync(projectArg)) {
        console.error(`Nie znaleziono folderu projektu: ${projectArg}`);
        process.exit(1);
    }

    const imagesDir = join(projectArg, "images");
    const manifestPath = join(projectArg, "data", "images.json");
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

    const files = existsSync(imagesDir)
        ? readdirSync(imagesDir).filter(f => IMAGE_EXTENSIONS.has(extname(f).toLowerCase())).sort()
        : [];

    const result = [];
    const seenFiles = new Set();
    let added = 0;

    for (const rawFilename of files) {
        // macOS (HFS+/APFS) can hand back accented filenames in NFD (decomposed) form from
        // readdirSync, even when the file is stored/committed as NFC (composed) - Netlify's Linux
        // servers do exact byte matching on the URL path, so an NFD manifest entry silently 404s
        // for any filename with diacritics (e.g. "ą", "ę") even though it looks identical on screen.
        // Normalizing here is what actually fixed the broken thumbnails - not a defensive guess.
        const filename = rawFilename.normalize("NFC");
        const file = `images/${filename}`;
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
            file
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
