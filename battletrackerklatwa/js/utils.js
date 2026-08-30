// Battle Tracker - Klątwa Strahda. Ogólne helpery.

export function uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
}

export function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

/** Firebase Realtime Database odrzuca całe zapisy zawierające `undefined` (i samo w sobie NIE
 *  przechowuje kluczy o wartości `null` - przy odczycie taki klucz po prostu znika, więc kod, który
 *  kopiuje pole z wczytanego stanu do nowego obiektu bez fallbacku `?? null`, może nieświadomie
 *  wstrzyknąć `undefined` z powrotem do zapisu). Wołane tuż przed każdym zapisem jako siatka
 *  bezpieczeństwa, niezależnie od fallbacków w miejscach, które kopiują dane. */
export function sanitizeForFirebase(value) {
    if (value === undefined) return null;
    if (Array.isArray(value)) return value.map(sanitizeForFirebase);
    if (value && typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value)) out[key] = sanitizeForFirebase(value[key]);
        return out;
    }
    return value;
}

export function formatTimestamp(at) {
    const d = new Date(at);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
