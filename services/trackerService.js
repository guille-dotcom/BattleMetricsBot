const fs = require("fs");
const path = require("path");

const trackersFile = path.join(__dirname, "..", "data", "trackers.json");

// Crear carpeta y archivo si no existen
if (!fs.existsSync(path.dirname(trackersFile))) {
    fs.mkdirSync(path.dirname(trackersFile), { recursive: true });
}

if (!fs.existsSync(trackersFile)) {
    fs.writeFileSync(trackersFile, JSON.stringify({}, null, 4));
}

// ----------------------------
// Leer trackers
// ----------------------------
function leerTrackers() {
    try {
        return JSON.parse(fs.readFileSync(trackersFile, "utf8"));
    } catch {
        return {};
    }
}

// ----------------------------
// Guardar trackers
// ----------------------------
function guardarTrackers(trackers) {
    fs.writeFileSync(
        trackersFile,
        JSON.stringify(trackers, null, 4),
        "utf8"
    );
}

// ----------------------------
// Obtener ID BattleMetrics
// ----------------------------
function obtenerBattleMetricsId(texto) {

    if (!texto)
        return null;

    texto = texto.trim();

    // Si es un número
    if (/^\d+$/.test(texto))
        return texto;

    // Si es un link
    const match = texto.match(/players\/(\d+)/);

    if (match)
        return match[1];

    return null;
}

// ----------------------------
// Registrar tracker
// ----------------------------
function registrarTracker({
    battlemetricsId,
    nombre = "Desconocido",
    canalId,
    guildId,
    registradoPor
}) {

    const trackers = leerTrackers();

    trackers[battlemetricsId] = {

        battlemetricsId,

        nombre,

        canalId,

        guildId,

        registradoPor,

        registradoEn: Date.now(),

        expiraEn: Date.now() + (24 * 60 * 60 * 1000),

        ultimoEstado: "offline",

        inicioSesion: null,

        ultimoServidor: null

    };

    guardarTrackers(trackers);

    return trackers[battlemetricsId];
}

// ----------------------------
// Placeholder
// ----------------------------
async function revisarTrackers(client) {
    // Lo haremos en la siguiente fase
}

module.exports = {

    trackersFile,

    leerTrackers,

    guardarTrackers,

    obtenerBattleMetricsId,

    registrarTracker,

    revisarTrackers

};