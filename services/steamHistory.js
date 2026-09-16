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
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1"
};

// =====================================================
// UTILIDADES
// =====================================================

function decodeJsString(value) {
    if (value === null || value === undefined) {
        return "";
    }

    let text = String(value);

    try {
        text = text
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16))
            )
            .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) =>
                String.fromCharCode(parseInt(hex, 16))
            )
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\")
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "\r")
            .replace(/\\t/g, "\t");
    } catch (error) {
        // Mantener texto original
    }

    return text;
}

function limpiarNombre(nombre) {
    if (nombre === null || nombre === undefined) {
        return null;
    }

    let resultado = decodeJsString(nombre);

    resultado = resultado
        .replace(/\u0000/g, "")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .trim();

    if (!resultado) {
        return null;
    }

    return resultado;
}

function convertirTimestamp(timestamp) {
    const numero = Number(timestamp);

    if (!Number.isFinite(numero) || numero <= 0) {
        return null;
    }

    const fecha = new Date(numero * 1000);

    if (Number.isNaN(fecha.getTime())) {
        return null;
    }

    return fecha;
}

// =====================================================
// AGREGAR NOMBRE
// =====================================================

function agregarNombre(resultado, item) {
    if (!item || typeof item !== "object") {
        return;
    }

    const nombre = limpiarNombre(
        item.Name ??
        item.name ??
        item.Persona ??
        item.persona
    );

    if (!nombre) {
        return;
    }

    const timestamp = Number(
        item.Timestamp ??
        item.timestamp ??
        item.TimeStamp ??
        0
    );

    const fecha = convertirTimestamp(timestamp);

    resultado.push({
        name: nombre,
        timestamp: Number.isFinite(timestamp) ? timestamp : 0,
        date: fecha,
        estimated: Number(item.Estimated ?? item.estimated ?? 0),
        hidden: Number(item.Hidden ?? item.hidden ?? 0)
    });
}

// =====================================================
// BUSCAR historic.persona
// =====================================================

function buscarPersona(obj, encontrados = [], visitados = new Set()) {
    if (!obj || typeof obj !== "object") {
        return encontrados;
    }

    if (visitados.has(obj)) {
        return encontrados;
    }

    visitados.add(obj);

    if (
        obj.historic &&
        typeof obj.historic === "object" &&
        Array.isArray(obj.historic.persona)
    ) {
        for (const item of obj.historic.persona) {
            agregarNombre(encontrados, item);
        }
    }

    if (Array.isArray(obj.persona)) {
        for (const item of obj.persona) {
            agregarNombre(encontrados, item);
        }
    }

    for (const [key, value] of Object.entries(obj)) {
        if (
            key === "persona" &&
            Array.isArray(value)
        ) {
            for (const item of value) {
                agregarNombre(encontrados, item);
            }
        }

        if (
            value &&
            typeof value === "object"
        ) {
            buscarPersona(
                value,
                encontrados,
                visitados
            );
        }
    }

    return encontrados;
}

// =====================================================
// EXTRAER DESDE JSON
// =====================================================

function extraerDesdeJson(data) {
    const encontrados = [];

    buscarPersona(data, encontrados);

    return limpiarHistorial(encontrados);
}

// =====================================================
// EXTRAER DESDE TEXTO
// =====================================================

function extraerDesdeTexto(texto) {
    if (!texto || typeof texto !== "string") {
        return [];
    }

    const encontrados = [];

    const patrones = [
        /\bpersona\s*:\s*\[/gi,
        /["']persona["']\s*:\s*\[/gi
    ];

    for (const patron of patrones) {
        let match;

        while ((match = patron.exec(texto)) !== null) {
            const inicioArray = texto.indexOf(
                "[",
                match.index
            );

            if (inicioArray === -1) {
                continue;
            }

            const contenido =
                extraerArrayBalanceado(
                    texto,
                    inicioArray
                );

            if (!contenido) {
                continue;
            }

            extraerObjetosPersona(
                contenido,
                encontrados
            );
        }
    }

    if (encontrados.length === 0) {
        try {
            const posiblesObjetos =
                extraerBloquesJSON(texto);

            for (const bloque of posiblesObjetos) {
                try {
                    const data = JSON.parse(bloque);

                    const encontradosJson =
                        extraerDesdeJson(data);

                    encontrados.push(
                        ...encontradosJson
                    );
                } catch (error) {
                    // Continuar
                }
            }
        } catch (error) {
            // Continuar
        }
    }

    return limpiarHistorial(encontrados);
}

// =====================================================
// EXTRAER ARRAY BALANCEADO
// =====================================================

function extraerArrayBalanceado(texto, inicio) {
    if (
        !texto ||
        inicio < 0 ||
        texto[inicio] !== "["
    ) {
        return null;
    }

    let profundidad = 0;
    let dentroString = false;
    let escape = false;

    for (let i = inicio; i < texto.length; i++) {
        const char = texto[i];

        if (dentroString) {
            if (escape) {
                escape = false;
                continue;
            }

            if (char === "\\") {
                escape = true;
                continue;
            }

            if (char === '"') {
                dentroString = false;
            }

            continue;
        }

        if (char === '"') {
            dentroString = true;
            continue;
        }

        if (char === "[") {
            profundidad++;
        } else if (char === "]") {
            profundidad--;

            if (profundidad === 0) {
                return texto.slice(
                    inicio,
                    i + 1
                );
            }
        }
    }

    return null;
}

// =====================================================
// EXTRAER OBJETOS PERSONA
// =====================================================

function extraerObjetosPersona(
    arrayTexto,
    resultado
) {
    if (!arrayTexto) {
        return;
    }

    const regex =
        /\{\s*Name\s*:\s*(["'`])([\s\S]*?)\1\s*,\s*Timestamp\s*:\s*(\d+)/g;

    let match;

    while (
        (match = regex.exec(arrayTexto)) !== null
    ) {
        const nombre = limpiarNombre(match[2]);
        const timestamp = Number(match[3]);

        if (!nombre) {
            continue;
        }

        resultado.push({
            name: nombre,
            timestamp,
            date: convertirTimestamp(timestamp),
            estimated: 0,
            hidden: 0
        });
    }

    const regexJson =
        /\{\s*["']Name["']\s*:\s*(["'])([\s\S]*?)\1\s*,\s*["']Timestamp["']\s*:\s*(\d+)/g;

    while (
        (match = regexJson.exec(arrayTexto)) !== null
    ) {
        const nombre = limpiarNombre(match[2]);
        const timestamp = Number(match[3]);

        if (!nombre) {
            continue;
        }

        resultado.push({
            name: nombre,
            timestamp,
            date: convertirTimestamp(timestamp),
            estimated: 0,
            hidden: 0
        });
    }
}

// =====================================================
// LIMPIAR HISTORIAL
// =====================================================

function limpiarHistorial(nombres) {
    if (!Array.isArray(nombres)) {
        return [];
    }

    let resultado = nombres.filter(
        item =>
            item &&
            typeof item.name === "string" &&
            item.name.trim().length > 0
    );

    const vistos = new Set();

    resultado = resultado.filter(item => {
        const clave =
            `${item.name}|${item.timestamp}`;

        if (vistos.has(clave)) {
            return false;
        }

        vistos.add(clave);

        return true;
    });

    resultado.sort(
        (a, b) =>
            Number(b.timestamp || 0) -
            Number(a.timestamp || 0)
    );

    const sinConsecutivos = [];

    let anterior = null;

    for (const item of resultado) {
        if (
            anterior &&
            anterior.toLowerCase() ===
                item.name.toLowerCase()
        ) {
            continue;
        }

        sinConsecutivos.push(item);

        anterior = item.name;
    }

    return sinConsecutivos;
}

// =====================================================
// EXTRAER BLOQUES JSON
// =====================================================

function extraerBloquesJSON(texto) {
    const bloques = [];

    if (!texto) {
        return bloques;
    }

    let inicio = -1;
    let profundidad = 0;
    let dentroString = false;
    let escape = false;

    for (let i = 0; i < texto.length; i++) {
        const char = texto[i];

        if (dentroString) {
            if (escape) {
                escape = false;
                continue;
            }

            if (char === "\\") {
                escape = true;
                continue;
            }

            if (char === '"') {
                dentroString = false;
            }

            continue;
        }

        if (char === '"') {
            dentroString = true;
            continue;
        }

        if (char === "{") {
            if (profundidad === 0) {
                inicio = i;
            }

            profundidad++;
        } else if (char === "}") {
            if (profundidad > 0) {
                profundidad--;
            }

            if (
                profundidad === 0 &&
                inicio !== -1
            ) {
                const bloque =
                    texto.slice(
                        inicio,
                        i + 1
                    );

                if (
                    bloque.includes("persona") ||
                    bloque.includes("historic")
                ) {
                    bloques.push(bloque);
                }

                inicio = -1;
            }
        }
    }

    return bloques;
}

// =====================================================
// CONSULTAR __data.json
// =====================================================

async function consultarDataJson(steamId64) {
    const urls = [
        `${BASE_URL}/${steamId64}/__data.json?x-sveltekit-invalidated=011`,
        `${BASE_URL}/${steamId64}/__data.json`
    ];

    for (const url of urls) {
        try {
            console.log(
                `[SteamHistory] Consultando: ${url}`
            );

            const response = await axios.get(
                url,
                {
                    timeout: REQUEST_TIMEOUT,
                    headers: {
                        ...HEADERS,
                        Accept:
                            "application/json,text/plain,*/*",
                        Referer:
                            `${BASE_URL}/${steamId64}`
                    },
                    validateStatus: () => true
                }
            );

            console.log(
                `[SteamHistory] Status ${response.status}`
            );

            if (response.status !== 200) {
                continue;
            }

            const data = response.data;

            const names =
                typeof data === "string"
                    ? extraerDesdeTexto(data)
                    : extraerDesdeJson(data);

            if (names.length > 0) {
                console.log(
                    `[SteamHistory] Encontrados ${names.length} nombres mediante __data.json`
                );

                return names;
            }
        } catch (error) {
            console.log(
                `[SteamHistory] Error __data.json: ${error.message}`
            );
        }
    }

    return [];
}

// =====================================================
// CONSULTAR HTML PRINCIPAL
// =====================================================

async function consultarHtml(steamId64) {
    const url =
        `${BASE_URL}/${steamId64}`;

    try {
        console.log(
            `[SteamHistory] Consultando HTML: ${url}`
        );

        const response = await axios.get(
            url,
            {
                timeout: REQUEST_TIMEOUT,
                headers: HEADERS,
                validateStatus: () => true
            }
        );

        console.log(
            `[SteamHistory] HTML status: ${response.status}`
        );

        if (response.status !== 200) {
            console.log(
                `[SteamHistory] HTML rechazado con HTTP ${response.status}`
            );

            return {
                status: response.status,
                names: []
            };
        }

        const html =
            typeof response.data === "string"
                ? response.data
                : JSON.stringify(response.data);

        console.log(
            `[SteamHistory] HTML recibido: ${html.length} caracteres`
        );

        const names =
            extraerDesdeTexto(html);

        console.log(
            `[SteamHistory] Nombres extraídos del HTML: ${names.length}`
        );

        return {
            status: response.status,
            names
        };
    } catch (error) {
        console.log(
            `[SteamHistory] Error HTML: ${error.message}`
        );

        return {
            status: null,
            names: []
        };
    }
}

// =====================================================
// FUNCIÓN PRINCIPAL
// =====================================================

async function getSteamHistory(steamId64) {
    steamId64 = String(steamId64 || "").trim();

    if (!/^\d{17}$/.test(steamId64)) {
        console.log(
            `[SteamHistory] SteamID64 inválido: ${steamId64}`
        );

        return {
            steamId64,
            url: `${BASE_URL}/${steamId64}`,
            names: []
        };
    }

    console.log(
        "=============================================="
    );

    console.log(
        `[SteamHistory] Buscando historial para ${steamId64}`
    );

    console.log(
        "=============================================="
    );

    // -------------------------------------------------
    // 1. Intentar __data.json
    // -------------------------------------------------

    let names =
        await consultarDataJson(steamId64);

    // -------------------------------------------------
    // 2. Intentar HTML
    // -------------------------------------------------

    if (names.length === 0) {
        const htmlResult =
            await consultarHtml(steamId64);

        names = htmlResult.names;

        if (
            htmlResult.status &&
            htmlResult.status !== 200
        ) {
            console.log(
                `[SteamHistory] SteamHistory devolvió HTTP ${htmlResult.status}.`
            );

            console.log(
                `[SteamHistory] No se pueden extraer nombres mientras Render reciba ese código HTTP.`
            );
        }
    }

    names = limpiarHistorial(names);

    console.log(
        `[SteamHistory] Historial final: ${names.length} nombres`
    );

    if (names.length > 0) {
        console.log(
            "[SteamHistory] Nombres encontrados:"
        );

        names.forEach((item, index) => {
            console.log(
                `  ${index + 1}. ${item.name} (${item.timestamp})`
            );
        });
    }

    console.log(
        "=============================================="
    );

    return {
        steamId64,
        url: `${BASE_URL}/${steamId64}`,
        names
    };
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    getSteamHistory,
    extraerPersonaHistory: extraerDesdeTexto,
    extraerDesdeTexto,
    extraerDesdeJson
};