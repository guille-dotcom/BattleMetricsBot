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
        "application/json,text/plain,*/*",

    "Accept-Language":
        "es-CL,es;q=0.9,en-US;q=0.8,en;q=0.7",

    "Cache-Control":
        "no-cache",

    "Pragma":
        "no-cache",

    "Referer":
        "https://steamhistory.net/",

    "Sec-Ch-Ua":
        '"Chromium";v="140", "Google Chrome";v="140", "Not=A?Brand";v="24"',

    "Sec-Ch-Ua-Mobile":
        "?0",

    "Sec-Ch-Ua-Platform":
        '"Windows"',

    "Sec-Fetch-Dest":
        "empty",

    "Sec-Fetch-Mode":
        "cors",

    "Sec-Fetch-Site":
        "same-origin"
};

// =====================================================
// DECODIFICAR STRING
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
// TIMESTAMP
// =====================================================

function convertirTimestamp(timestamp) {
    const numero = Number(timestamp);

    if (!Number.isFinite(numero) || numero <= 0) {
        return null;
    }

    return new Date(numero * 1000);
}

// =====================================================
// AÑADIR NOMBRE
// =====================================================

function agregarNombre(resultado, item) {
    if (!item) {
        return;
    }

    let nombre = null;
    let timestamp = null;
    let estimated = 0;
    let hidden = 0;

    // ================================================
    // FORMATO NORMAL
    // ================================================

    if (typeof item === "object") {
        nombre =
            item.Name ??
            item.name ??
            item.personaName ??
            item.personaname ??
            null;

        timestamp =
            item.Timestamp ??
            item.timestamp ??
            item.TimeStamp ??
            null;

        estimated =
            Number(
                item.Estimated ??
                item.estimated ??
                0
            );

        hidden =
            Number(
                item.Hidden ??
                item.hidden ??
                0
            );
    }

    // ================================================
    // FORMATO ARRAY
    // ================================================

    if (
        Array.isArray(item)
    ) {
        nombre =
            item[0] ??
            item.Name ??
            item.name ??
            null;

        timestamp =
            item[1] ??
            item.Timestamp ??
            item.timestamp ??
            null;

        estimated =
            Number(
                item[2] ??
                0
            );

        hidden =
            Number(
                item[3] ??
                0
            );
    }

    if (!nombre) {
        return;
    }

    const nombreLimpio =
        limpiarNombre(nombre);

    if (!nombreLimpio) {
        return;
    }

    const numeroTimestamp =
        Number(timestamp);

    if (
        !Number.isFinite(
            numeroTimestamp
        )
    ) {
        return;
    }

    resultado.push({
        name:
            nombreLimpio,

        timestamp:
            numeroTimestamp,

        date:
            convertirTimestamp(
                numeroTimestamp
            ),

        estimated,

        hidden
    });
}

// =====================================================
// BUSCAR PERSONA RECURSIVAMENTE
// =====================================================

function buscarPersona(
    objeto,
    resultado,
    profundidad = 0
) {
    if (
        objeto === null ||
        objeto === undefined
    ) {
        return;
    }

    if (profundidad > 20) {
        return;
    }

    // ================================================
    // ARRAY
    // ================================================

    if (
        Array.isArray(objeto)
    ) {

        // Si parece ser el array persona
        // intentamos interpretar sus elementos.

        for (
            const item of objeto
        ) {

            if (
                item &&
                typeof item === "object" &&
                !Array.isArray(item)
            ) {

                const tieneNombre =
                    item.Name !== undefined ||
                    item.name !== undefined;

                const tieneTimestamp =
                    item.Timestamp !== undefined ||
                    item.timestamp !== undefined;

                if (
                    tieneNombre &&
                    tieneTimestamp
                ) {

                    agregarNombre(
                        resultado,
                        item
                    );

                    continue;
                }
            }

            buscarPersona(
                item,
                resultado,
                profundidad + 1
            );
        }

        return;
    }

    // ================================================
    // OBJETO
    // ================================================

    if (
        typeof objeto !== "object"
    ) {
        return;
    }

    // ================================================
    // ENCONTRAMOS historic
    // ================================================

    if (
        objeto.historic &&
        typeof objeto.historic === "object"
    ) {

        const historic =
            objeto.historic;

        if (
            Array.isArray(
                historic.persona
            )
        ) {

            for (
                const item of historic.persona
            ) {

                agregarNombre(
                    resultado,
                    item
                );
            }
        }
    }

    // ================================================
    // ENCONTRAMOS persona DIRECTAMENTE
    // ================================================

    if (
        Array.isArray(
            objeto.persona
        )
    ) {

        for (
            const item of objeto.persona
        ) {

            agregarNombre(
                resultado,
                item
            );
        }
    }

    // ================================================
    // RECORRER TODO
    // ================================================

    for (
        const [clave, valor]
        of Object.entries(objeto)
    ) {

        if (
            clave === "historic" ||
            clave === "persona"
        ) {
            continue;
        }

        if (
            valor &&
            typeof valor === "object"
        ) {

            buscarPersona(
                valor,
                resultado,
                profundidad + 1
            );
        }
    }
}

// =====================================================
// EXTRAER DESDE JSON
// =====================================================

function extraerDesdeJson(data) {

    const resultado = [];

    if (!data) {
        return resultado;
    }

    // =================================================
    // CASO DIRECTO
    // =================================================

    buscarPersona(
        data,
        resultado
    );

    // =================================================
    // CASO SVELTEKIT SERIALIZADO
    // =================================================

    if (
        data.nodes &&
        Array.isArray(data.nodes)
    ) {

        for (
            const node of data.nodes
        ) {

            if (
                node &&
                node.data
            ) {

                buscarPersona(
                    node.data,
                    resultado
                );
            }
        }
    }

    // =================================================
    // ELIMINAR DUPLICADOS
    // =================================================

    const vistos =
        new Set();

    const limpio = [];

    for (
        const item of resultado
    ) {

        const key =
            `${item.name.toLowerCase()}_${item.timestamp}`;

        if (
            vistos.has(key)
        ) {
            continue;
        }

        vistos.add(key);

        limpio.push(
            item
        );
    }

    // =================================================
    // ORDENAR
    // =================================================

    limpio.sort(
        (a, b) =>
            Number(b.timestamp) -
            Number(a.timestamp)
    );

    // =================================================
    // DUPLICADOS CONSECUTIVOS
    // =================================================

    const final = [];

    for (
        const item of limpio
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
// EXTRAER DESDE TEXTO JSON / SVELTEKIT
// =====================================================

function extraerDesdeTexto(texto) {

    if (!texto) {
        return [];
    }

    const resultado = [];

    // =================================================
    // 1. INTENTAR JSON NORMAL
    // =================================================

    try {

        const json =
            JSON.parse(texto);

        const nombres =
            extraerDesdeJson(
                json
            );

        if (
            nombres.length > 0
        ) {
            return nombres;
        }

    } catch {
        // Puede ser JSON Lines / SvelteKit
    }

    // =================================================
    // 2. JSON LINES
    // =================================================

    const lineas =
        String(texto)
            .split(/\r?\n/)
            .map(
                linea =>
                    linea.trim()
            )
            .filter(Boolean);

    for (
        const linea of lineas
    ) {

        try {

            const json =
                JSON.parse(
                    linea
                );

            const nombres =
                extraerDesdeJson(
                    json
                );

            resultado.push(
                ...nombres
            );

        } catch {
            // Continuar
        }
    }

    // =================================================
    // 3. BUSCAR historic.persona
    //    DIRECTAMENTE EN EL TEXTO
    // =================================================

    if (
        resultado.length === 0
    ) {

        const regex =
            /["']?Name["']?\s*:\s*"((?:\\.|[^"\\])*)"\s*,\s*["']?Timestamp["']?\s*:\s*(\d+)(?:\s*,\s*["']?Estimated["']?\s*:\s*(\d+))?(?:\s*,\s*["']?Hidden["']?\s*:\s*(\d+))?/g;

        let match;

        while (
            (
                match =
                    regex.exec(
                        texto
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

            if (
                !nombre ||
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
                    Number(
                        match[3] || 0
                    ),

                hidden:
                    Number(
                        match[4] || 0
                    )
            });
        }
    }

    // =================================================
    // LIMPIAR
    // =================================================

    const vistos =
        new Set();

    const limpio = [];

    for (
        const item of resultado
    ) {

        const key =
            `${item.name.toLowerCase()}_${item.timestamp}`;

        if (
            vistos.has(key)
        ) {
            continue;
        }

        vistos.add(key);

        limpio.push(
            item
        );
    }

    limpio.sort(
        (a, b) =>
            Number(b.timestamp) -
            Number(a.timestamp)
    );

    return limpio;
}

// =====================================================
// CONSULTAR __DATA.JSON
// =====================================================

async function consultarDataJson(
    steamId64
) {

    const urls = [

        // =================================================
        // FORMATO PRINCIPAL
        // =================================================

        `${BASE_URL}/${steamId64}/__data.json?x-sveltekit-invalidated=011`,

        // =================================================
        // FORMATO ALTERNATIVO
        // =================================================

        `${BASE_URL}/${steamId64}/__data.json`
    ];

    for (
        let i = 0;
        i < urls.length;
        i++
    ) {

        const url =
            urls[i];

        console.log(
            `🌐 SteamHistory __data.json: intento ${i + 1}/${urls.length}`
        );

        console.log(
            `🔗 ${url}`
        );

        try {

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

                        decompress:
                            true,

                        validateStatus:
                            () => true
                    }
                );

            const status =
                response.status;

            const data =
                response.data;

            console.log(
                `📡 SteamHistory __data.json HTTP ${status}`
            );

            // =================================================
            // 403
            // =================================================

            if (
                status === 403
            ) {

                console.log(
                    "🚫 SteamHistory __data.json también devuelve 403."
                );

                continue;
            }

            // =================================================
            // NO OK
            // =================================================

            if (
                status < 200 ||
                status >= 400
            ) {

                console.log(
                    `⚠️ SteamHistory __data.json respondió ${status}`
                );

                continue;
            }

            // =================================================
            // PROCESAR
            // =================================================

            const nombres =
                typeof data === "string"
                    ? extraerDesdeTexto(
                        data
                    )
                    : extraerDesdeJson(
                        data
                    );

            console.log(
                `📜 SteamHistory __data.json: ${nombres.length} nombre(s) encontrados`
            );

            if (
                nombres.length > 0
            ) {

                return {

                    success:
                        true,

                    url,

                    names:
                        nombres
                };
            }

            console.log(
                "⚠️ __data.json respondió correctamente, pero no encontramos historic.persona."
            );

            // =================================================
            // DEBUG CONTROLADO
            // =================================================

            if (
                typeof data === "string"
            ) {

                console.log(
                    `📄 Tamaño respuesta: ${data.length} caracteres`
                );

            } else {

                try {

                    const texto =
                        JSON.stringify(
                            data
                        );

                    console.log(
                        `📄 Tamaño JSON: ${texto.length} caracteres`
                    );

                } catch {
                    // Ignorar
                }
            }

        } catch (error) {

            console.error(
                "❌ Error __data.json:",
                error.response?.status ||
                error.code ||
                error.message
            );
        }
    }

    return {

        success:
            false,

        names:
            []
    };
}

// =====================================================
// FUNCIÓN PRINCIPAL
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

    console.log(
        `📜 SteamHistory: consultando ${steamId64} mediante __data.json`
    );

    // =================================================
    // INTENTO PRINCIPAL
    // =================================================

    const resultado =
        await consultarDataJson(
            steamId64
        );

    if (
        resultado.success
    ) {

        console.log(
            `✅ SteamHistory: historial obtenido mediante __data.json`
        );

        return {

            steamId64,

            url:
                resultado.url,

            names:
                resultado.names
        };
    }

    // =================================================
    // FALLBACK
    // =================================================
    //
    // Si __data.json falla, hacemos una última
    // petición a la página HTML.
    //
    // Esto permite que siga funcionando si
    // __data.json está protegido pero la página
    // normal vuelve a estar disponible.
    // =================================================

    console.log(
        "🔄 SteamHistory: __data.json no funcionó. Probando página HTML como fallback..."
    );

    const htmlUrl =
        `${BASE_URL}/${steamId64}`;

    try {

        const response =
            await axios.get(
                htmlUrl,
                {
                    timeout:
                        REQUEST_TIMEOUT,

                    headers: {
                        ...HEADERS,

                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                        "Sec-Fetch-Dest":
                            "document",

                        "Sec-Fetch-Mode":
                            "navigate",

                        "Sec-Fetch-User":
                            "?1"
                    },

                    maxRedirects:
                        5,

                    decompress:
                        true,

                    validateStatus:
                        () => true
                }
            );

        console.log(
            `📡 SteamHistory HTML HTTP ${response.status}`
        );

        if (
            response.status === 200
        ) {

            const html =
                String(
                    response.data || ""
                );

            const names =
                extraerDesdeTexto(
                    html
                );

            console.log(
                `📜 SteamHistory HTML: ${names.length} nombre(s) encontrados`
            );

            return {

                steamId64,

                url:
                    htmlUrl,

                names
            };
        }

    } catch (error) {

        console.error(
            "❌ SteamHistory HTML:",
            error.response?.status ||
            error.code ||
            error.message
        );
    }

    // =================================================
    // SIN RESULTADOS
    // =================================================

    console.error(
        `❌ SteamHistory: no fue posible obtener historial para ${steamId64}`
    );

    return {

        steamId64,

        url:
            `${BASE_URL}/${steamId64}`,

        names:
            []
    };
}

// =====================================================
// EXPORTAR
// =====================================================

module.exports = {

    getSteamHistory,

    extraerPersonaHistory:
        extraerDesdeTexto
};