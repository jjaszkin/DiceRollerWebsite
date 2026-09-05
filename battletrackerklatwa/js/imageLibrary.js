// Battle Tracker - Klątwa Strahda. Manifesty dostępnych obrazków, osobno per kategoria (images/
// uczestnicy dla portretów, images/bitwy dla okładek walk) - wczytywane raz przy starcie z
// data/images-<kategoria>.json (wygenerowanych przez shared/images/generate-manifest.js), NIE
// zapisywane do Firebase (to statyczne pliki wdrożone razem z appką, nie dane kampanii). Żeby
// nowy plik pojawił się w wybieraku, trzeba go wgrać do odpowiedniego podfolderu i odpalić
// generator, bo statyczny hosting bez backendu nie pozwala na live listowanie folderu.

const CATEGORIES = ["uczestnicy", "bitwy"];

let imagesByCategory = { uczestnicy: [], bitwy: [] };

export async function loadImageLibrary() {
    const loaded = await Promise.all(CATEGORIES.map((category) =>
        fetch(`data/images-${category}.json`).then((res) => (res.ok ? res.json() : []))
    ));
    imagesByCategory = Object.fromEntries(CATEGORIES.map((category, i) => [category, loaded[i]]));
    return imagesByCategory;
}

export function getImageLibrary(category) {
    return imagesByCategory[category] || [];
}
