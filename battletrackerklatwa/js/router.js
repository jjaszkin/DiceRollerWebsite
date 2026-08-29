// Battle Tracker - Klątwa Strahda. Mikro-router oparty o hash: #/battles (domyślnie),
// #/battles/:id, #/participants. Rejestrowane wzorce to RegExp z grupami nazwanymi.

const routes = [];
let lastHash = null;

export function onRoute(pattern, handler) {
    routes.push({ pattern, handler });
}

function matchRoute(hash) {
    for (const { pattern, handler } of routes) {
        const m = pattern.exec(hash);
        if (m) return { handler, params: m.groups || {} };
    }
    return null;
}

export function currentHash() {
    return window.location.hash.slice(1) || "/battles";
}

export function navigate(path) {
    if (window.location.hash.slice(1) === path) {
        renderCurrentRoute();
        return;
    }
    window.location.hash = path;
}

export function renderCurrentRoute() {
    lastHash = currentHash();
    const match = matchRoute(lastHash);
    if (match) match.handler(match.params);
}

export function startRouter() {
    window.addEventListener("hashchange", renderCurrentRoute);
    renderCurrentRoute();
}
