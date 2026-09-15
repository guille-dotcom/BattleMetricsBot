const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BASE_URL = "https://steamhistory.net/id";

const REQUEST_TIMEOUT = 20000;

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

    "Accept-Language":
        "en-US,en;q=0.9",

    "Cache-Control":
        "no-cache",

    "Pragma":
        "no-cache"
};

// =====================================================
// DECODIFICAR STRING JAVASCRIPT
// =====================================================

function decodeJsString(text) {
    try {
        return JSON.parse(`"${text}"`);
    } catch {
        return String(text || "")
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t");
    }
}

// =====================================================
// LIMPIAR NOMBRE
// =====================================================

function limpiarNombre(nombre) {
    return String(nombre || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&nbsp;/gi, " ")
        .trim();
}

// =====================================================
// CONVERTIR TIMESTAMP
// =====================================================

function convertirTimestamp(timestamp) {
    const numero = Number(timestamp);

    if (!Number.isFinite(numero) || numero <= 0) {
        return null;
    }

    return new Date(numero * 1000);
}

// =====================================================
// EXTRAER HISTORIAL DE NOMBRES
// =====================================================

function extraerPersonaHistory(html) {
    const resultado = [];

    if (!html) {
        return resultado;
    }

    // Busca:
    //
    // historic: {
    //     persona: [...]
    // }

    const historicRegex =
        /["']?historic["']?\s*:\s*\{\s*["']?persona["']?\s*:\s*\[/i;

    const historicMatch =
        historicRegex.exec(html);

    if (!historicMatch) {
        console.log(
            "⚠️ SteamHistory: no se encontró userdata.historic.persona"
        );

        return resultado;
    }

    const inicio =
        historicMatch.index +
        historicMatch[0].length;

    const resto =
        html.substring(inicio);

    // El historial persona termina antes de realName

    const finMatch =
        resto.search(
            /\]\s*,\s*["']?realName["']?\s*:/
        );

    const bloque =
        finMatch !== -1
            ? resto.substring(0, finMatch)
            : resto.substring(0, 200000);

    if (!bloque) {
        return resultado;
    }

    // Extraer:

    // Name
    // Timestamp
    // Estimated
    // Hidden

    const itemRegex =
        /["']?Name["']?\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*["']?Timestamp["']?\s*:\s*(\d+)(?:\s*,\s*["']?Estimated["']?\s*:\s*(\d+))?(?:\s*,\s*["']?Hidden["']?\s*:\s*(\d+))?/g;

    let match;

    while (
        (match = itemRegex.exec(bloque)) !== null
    ) {
        const nombre =
            limpiarNombre(
                decodeJsString(match[1])
            );

        const timestamp =
            Number(match[2]);

        const estimated =
            Number(match[3] || 0);

        const hidden =
            Number(match[4] || 0);

        if (!nombre) {
            continue;
        }

        const fecha =
            convertirTimestamp(timestamp);

        resultado.push({
            name: nombre,
            timestamp,
            date: fecha,
            estimated,
            hidden
        });
    }

    // =================================================
    // ORDENAR MÁS RECIENTE → MÁS ANTIGUO
    // =================================================

    resultado.sort(
        (a, b) =>
            Number(b.timestamp) -
            Number(a.timestamp)
    );

    // =================================================
    // ELIMINAR DUPLICADOS CONSECUTIVOS
    // =================================================

    const limpio = [];

    for (const item of resultado) {
        const anterior =
            limpio[limpio.length - 1];

        if (
            anterior &&
            anterior.name.toLowerCase() ===
                item.name.toLowerCase()
        ) {
            continue;
        }

        limpio.push(item);
    }

    return limpio;
}

// =====================================================
// OBTENER HISTORIAL
// =====================================================

async function getSteamHistory(steamId64) {
    if (
        !steamId64 ||
        !/^\d{17}$/.test(String(steamId64))
    ) {
        throw new Error(
            "SteamID64 inválido para SteamHistory.net."
        );
    }

    const url =
        `${BASE_URL}/${steamId64}`;

    try {
        console.log(
            `📜 SteamHistory: consultando ${steamId64}`
        );

        const response =
            await axios.get(
                url,
                {
                    timeout:
                        REQUEST_TIMEOUT,

                    headers:
                        HEADERS,

                    validateStatus:
                        status =>
                            status >= 200 &&
                            status < 400
                }
            );

        const html =
            String(
                response.data || ""
            );

        if (!html) {
            console.log(
                "⚠️ SteamHistory: respuesta HTML vacía."
            );

            return {
                steamId64,
                url,
                names: []
            };
        }

        const names =
            extraerPersonaHistory(
                html
            );

        console.log(
            `📜 SteamHistory: ${names.length} nombre(s) encontrados para ${steamId64}`
        );

        return {
            steamId64,
            url,
            names
        };

    } catch (error) {
        console.error(
            "❌ Error consultando SteamHistory.net:",
            error.response?.status ||
            error.message
        );

        return {
            steamId64,
            url,
            names: []
        };
    }
}

// =====================================================
// EXPORTAR
// =====================================================

module.exports = {
    getSteamHistory,
    extraerPersonaHistory
};