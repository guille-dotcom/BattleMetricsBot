const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BASE_URL = "https://steamhistory.net/id";

const REQUEST_TIMEOUT = 20000;

// =====================================================
// HEADERS BASE
// =====================================================

const BASE_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",

    "Accept-Language":
        "es-CL,es;q=0.9,en-US;q=0.8,en;q=0.7",

    "Cache-Control":
        "no-cache",

    "Pragma":
        "no-cache",

    "Upgrade-Insecure-Requests":
        "1",

    "Sec-Ch-Ua":
        '"Chromium";v="140", "Google Chrome";v="140", "Not=A?Brand";v="24"',

    "Sec-Ch-Ua-Mobile":
        "?0",

    "Sec-Ch-Ua-Platform":
        '"Windows"',

    "Sec-Fetch-Dest":
        "document",

    "Sec-Fetch-Mode":
        "navigate",

    "Sec-Fetch-User":
        "?1",

    "Sec-Fetch-Site":
        "none"
};

// =====================================================
// DECODIFICAR STRING JAVASCRIPT
// =====================================================

function decodeJsString(text) {

    if (!text) {
        return "";
    }

    try {

        return JSON.parse(
            `"${text}"`
        );

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
// TIMESTAMP
// =====================================================

function convertirTimestamp(timestamp) {

    const numero =
        Number(timestamp);

    if (
        !Number.isFinite(numero) ||
        numero <= 0
    ) {
        return null;
    }

    return new Date(
        numero * 1000
    );
}

// =====================================================
// LOCALIZAR HISTORIC.PERSONA
// =====================================================

function localizarPersona(html) {

    if (!html) {
        return null;
    }

    const patrones = [

        /["']?historic["']?\s*:\s*\{\s*["']?persona["']?\s*:\s*\[/i,

        /\\"historic\\"\s*:\s*\{\s*\\"persona\\"\s*:\s*\[/i,

        /historic\s*:\s*\{\s*persona\s*:\s*\[/i
    ];

    for (
        const regex of patrones
    ) {

        const match =
            regex.exec(html);

        if (match) {

            console.log(
                "✅ SteamHistory: encontrado historic.persona"
            );

            return (
                match.index +
                match[0].length
            );
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

    const inicio =
        localizarPersona(html);

    if (
        inicio === null ||
        inicio === undefined
    ) {

        console.log(
            "⚠️ SteamHistory: no se encontró historic.persona"
        );

        return resultado;
    }

    const resto =
        html.substring(
            inicio
        );

    // =================================================
    // BUSCAR FIN DEL ARRAY
    // =================================================

    let fin = -1;

    const finales = [

        /\]\s*,\s*["']?realName["']?\s*:/i,

        /\]\s*,\s*["']?realname["']?\s*:/i,

        /\]\s*,\s*realName\s*:/i,

        /\]\s*,\s*realname\s*:/i
    ];

    for (
        const regex of finales
    ) {

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
            ? resto.substring(
                0,
                fin
            )
            : resto.substring(
                0,
                300000
            );

    if (!bloque) {
        return resultado;
    }

    console.log(
        `📄 SteamHistory: bloque persona ${bloque.length} caracteres`
    );

    // =================================================
    // EXTRAER ITEMS
    // =================================================

    const patrones = [

        /["']?Name["']?\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*["']?Timestamp["']?\s*:\s*(\d+)(?:\s*,\s*["']?Estimated["']?\s*:\s*(\d+))?(?:\s*,\s*["']?Hidden["']?\s*:\s*(\d+))?/g,

        /\\"Name\\"\s*:\s*\\"((?:\\.|[^"\\])*)\\"\s*,\s*\\"Timestamp\\"\s*:\s*(\d+)(?:\s*,\s*\\"Estimated\\"\s*:\s*(\d+))?(?:\s*,\s*\\"Hidden\\"\s*:\s*(\d+))?/g
    ];

    for (
        const itemRegex of patrones
    ) {

        let match;

        while (
            (
                match =
                    itemRegex.exec(
                        bloque
                    )
            ) !== null
        ) {

            const nombre =
                limpiarNombre(
                    decodeJsString(
                        match[1]
                    )
                );

            const timestamp =
                Number(
                    match[2]
                );

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

            resultado.push({

                name:
                    nombre,

                timestamp:
                    timestamp,

                date:
                    convertirTimestamp(
                        timestamp
                    ),

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
    // ELIMINAR DUPLICADOS EXACTOS
    // =================================================

    const sinDuplicados = [];

    const vistos =
        new Set();

    for (
        const item of resultado
    ) {

        const clave =
            `${item.name.toLowerCase()}_${item.timestamp}`;

        if (
            vistos.has(
                clave
            )
        ) {
            continue;
        }

        vistos.add(
            clave
        );

        sinDuplicados.push(
            item
        );
    }

    // =================================================
    // ELIMINAR REPETICIONES CONSECUTIVAS
    // =================================================

    const final = [];

    for (
        const item of sinDuplicados
    ) {

        const anterior =
            final[
                final.length - 1
            ];

        if (
            anterior &&
            anterior.name.toLowerCase() ===
                item.name.toLowerCase()
        ) {

            continue;
        }

        final.push(
            item
        );
    }

    return final;
}

// =====================================================
// REALIZAR PETICIÓN
// =====================================================

async function realizarPeticion(
    url,
    headers
) {

    return axios.get(
        url,
        {
            timeout:
                REQUEST_TIMEOUT,

            headers,

            maxRedirects:
                5,

            decompress:
                true,

            validateStatus:
                status =>
                    status >= 200 &&
                    status < 400
        }
    );
}

// =====================================================
// OBTENER HISTORIAL
// =====================================================

async function getSteamHistory(
    steamId64
) {

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

    const urls = [

        // =============================================
        // INTENTO 1
        // =============================================

        `${BASE_URL}/${steamId64}`,

        // =============================================
        // INTENTO 2
        // =============================================

        `${BASE_URL}/${steamId64}/`
    ];

    console.log(
        `📜 SteamHistory: consultando ${steamId64}`
    );

    for (
        let i = 0;
        i < urls.length;
        i++
    ) {

        const url =
            urls[i];

        console.log(
            `🌐 SteamHistory: intento ${i + 1}/${urls.length}`
        );

        console.log(
            `🔗 ${url}`
        );

        try {

            const headers = {

                ...BASE_HEADERS,

                "Referer":
                    "https://steamhistory.net/",

                "Origin":
                    "https://steamhistory.net/"
            };

            const response =
                await realizarPeticion(
                    url,
                    headers
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

            if (
                response.status === 200 &&
                html.length > 0
            ) {

                const names =
                    extraerPersonaHistory(
                        html
                    );

                console.log(
                    `📜 SteamHistory: ${names.length} nombre(s) encontrados`
                );

                if (
                    names.length > 0
                ) {

                    return {

                        steamId64,

                        url,

                        names
                    };
                }

                console.log(
                    "⚠️ SteamHistory: página obtenida pero no se pudo extraer el historial."
                );

                // No seguimos haciendo peticiones
                // si ya conseguimos la página.

                return {

                    steamId64,

                    url,

                    names: []
                };
            }

        } catch (error) {

            const status =
                error.response?.status;

            console.error(
                `❌ SteamHistory intento ${i + 1}:`,
                status ||
                error.code ||
                error.message
            );

            if (
                status === 403
            ) {

                console.log(
                    "🚫 SteamHistory: el servidor rechazó la petición con HTTP 403."
                );
            }

            // Si no es el último intento,
            // probamos la siguiente URL.

            if (
                i <
                urls.length - 1
            ) {

                console.log(
                    "🔄 SteamHistory: probando estrategia alternativa..."
                );
            }
        }
    }

    // =================================================
    // TODOS LOS INTENTOS FALLARON
    // =================================================

    console.error(
        `❌ SteamHistory: no fue posible obtener ${steamId64}`
    );

    return {

        steamId64,

        url:
            `${BASE_URL}/${steamId64}`,

        names: []
    };
}

// =====================================================
// EXPORTAR
// =====================================================

module.exports = {

    getSteamHistory,

    extraerPersonaHistory
};