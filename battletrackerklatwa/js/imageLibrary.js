// Battle Tracker - Klątwa Strahda. Manifest dostępnych obrazków (images/) - wczytywany raz przy
// starcie z data/images.json (wygenerowanego przez shared/images/generate-manifest.js), NIE
// zapisywany do Firebase (to statyczne pliki wdrożone razem z appką, nie dane kampanii). Żeby
// nowy plik pojawił się w wybieraku, trzeba go wgrać do images/ i odpalić generator, bo statyczny
// hosting bez backendu nie pozwala na live listowanie folderu.

let images = [];

export async function loadImageLibrary() {
    const res = await fetch("data/images.json");
    images = res.ok ? await res.json() : [];
    return images;
}

export function getImageLibrary() {
    return images;
}
