const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BASE_URL = "https://steamhistory.net/id";

const REQUEST_TIMEOUT = 20000;

// =====================================================
// HEADERS
// =====================================================

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",

    "Accept-Language":
        "es-CL,es;q=0.9,en-US;q=0.8,en;q=0.7",

    "Accept-Encoding":
        "gzip, deflate, br",

    "Cache-Control":
        "no-cache",

    "Pragma":
        "no-cache",

    "Sec-Ch-Ua":
        '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',

    "Sec-Ch-Ua-Mobile":
        "?0",

    "Sec-Ch-Ua-Platform":
        '"Windows"',

    "Sec-Fetch-Dest":
        "document",

    "Sec-Fetch-Mode":
        "navigate",

    "Sec-Fetch-Site":
        "none",

    "Sec-Fetch-User":
        "?1",

    "Upgrade-Insecure-Requests":
        "1"
};

// =====================================================
// DECODIFICAR STRING JAVASCRIPT
// =====================================================

function decodeJsString(text) {
    if (!text) {
        return "";
    }

    try {
        return JSON.parse(`"${text}"`);
    } catch {
        return String(text)
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, "\\")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t")
            .trim();
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
// BUSCAR BLOQUE PERSONA
// =====================================================

function localizarPersona(html) {
    if (!html) {
        return null;
    }

    const patrones = [

        // Formato normal
        /["']?historic["']?\s*:\s*\{\s*["']?persona["']?\s*:\s*\[/i,

        // Por si viene escapado
        /\\"historic\\"\s*:\s*\{\s*\\"persona\\"\s*:\s*\[/i,

        // Variante Svelte serializada
        /historic\s*:\s*\{\s*persona\s*:\s*\[/i
    ];

    for (const regex of patrones) {

        const match = regex.exec(html);

        if (match) {

            console.log(
                "✅ SteamHistory: encontrado bloque historic.persona"
            );

            return {
                index:
                    match.index +
                    match[0].length
            };
        }
    }

    return null;
}

// =====================================================
// EXTRAER HISTORIAL
// =====================================================

function extraerPersonaHistory(html) {

    const resultado = [];

    if (!html) {
        return resultado;
    }

    const persona =
        localizarPersona(html);

    if (!persona) {

        console.log(
            "⚠️ SteamHistory: no se encontró historic.persona"
        );

        // DEBUG CONTROLADO
        console.log(
            `📄 SteamHistory: HTML recibido: ${html.length} caracteres`
        );

        return resultado;
    }

    const inicio =
        persona.index;

    const resto =
        html.substring(inicio);

    // =================================================
    // LOCALIZAR FINAL DEL ARRAY
    // =================================================

    let fin = -1;

    const finales = [

        /\]\s*,\s*["']?realName["']?\s*:/i,

        /\]\s*,\s*["']?realname["']?\s*:/i,

        /\]\s*,\s*realName\s*:/i,

        /\]\s*,\s*realname\s*:/i
    ];

    for (const regex of finales) {

        const match =
            regex.exec(resto);

        if (match) {

            fin =
                match.index;

            break;
        }
    }

    const bloque =
        fin !== -1
            ? resto.substring(0, fin)
            : resto.substring(0, 250000);

    if (!bloque) {
        return resultado;
    }

    console.log(
        `📄 SteamHistory: bloque persona ${bloque.length} caracteres`
    );

    // =================================================
    // EXTRAER OBJETOS
    // =================================================

    const patrones = [

        // Formato:
        // Name: "...", Timestamp: 123
        /["']?Name["']?\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*["']?Timestamp["']?\s*:\s*(\d+)(?:\s*,\s*["']?Estimated["']?\s*:\s*(\d+))?(?:\s*,\s*["']?Hidden["']?\s*:\s*(\d+))?/g,

        // Formato con comillas escapadas
        /\\"Name\\"\s*:\s*\\"((?:\\.|[^"\\])*)\\"\s*,\s*\\"Timestamp\\"\s*:\s*(\d+)(?:\s*,\s*\\"Estimated\\"\s*:\s*(\d+))?(?:\s*,\s*\\"Hidden\\"\s*:\s*(\d+))?/g
    ];

    for (const itemRegex of patrones) {

        let match;

        while (
            (match =
                itemRegex.exec(
                    bloque
                )) !== null
        ) {

            const nombre =
                limpiarNombre(
                    decodeJsString(
                        match[1]
                    )
                );

            const timestamp =
                Number(match[2]);

            const estimated =
                Number(
                    match[3] || 0
                );

            const hidden =
                Number(
                    match[4] || 0
                );

            if (!nombre) {
                continue;
            }

            if (
                !Number.isFinite(
                    timestamp
                )
            ) {
                continue;
            }

            const fecha =
                convertirTimestamp(
                    timestamp
                );

            resultado.push({
                name:
                    nombre,

                timestamp:
                    timestamp,

                date:
                    fecha,

                estimated:
                    estimated,

                hidden:
                    hidden
            });
        }
    }

    // =================================================
    // ORDENAR
    // =================================================

    resultado.sort(
        (a, b) =>
            Number(b.timestamp) -
            Number(a.timestamp)
    );

    // =================================================
    // ELIMINAR DUPLICADOS
    // =================================================

    const limpio = [];

    const vistos = new Set();

    for (const item of resultado) {

        const key =
            `${item.name.toLowerCase()}_${item.timestamp}`;

        if (vistos.has(key)) {
            continue;
        }

        vistos.add(key);

        limpio.push(item);
    }

    // =================================================
    // ELIMINAR NOMBRES CONSECUTIVOS IGUALES
    // =================================================

    const final = [];

    for (const item of limpio) {

        const anterior =
            final[final.length - 1];

        if (
            anterior &&
            anterior.name.toLowerCase() ===
                item.name.toLowerCase()
        ) {
            continue;
        }

        final.push(item);
    }

    return final;
}

// =====================================================
// OBTENER HISTORIAL
// =====================================================

async function getSteamHistory(steamId64) {

    if (
        !steamId64 ||
        !/^\d{17}$/.test(
            String(steamId64)
        )
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

                    maxRedirects:
                        5,

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

        console.log(
            `📄 SteamHistory: HTTP ${response.status}`
        );

        console.log(
            `📄 SteamHistory: respuesta ${html.length} caracteres`
        );

        if (!html) {

            console.log(
                "⚠️ SteamHistory: respuesta vacía."
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
            error.code ||
            error.message
        );

        if (
            error.response?.status
        ) {

            console.error(
                `❌ SteamHistory HTTP ${error.response.status}`
            );
        }

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