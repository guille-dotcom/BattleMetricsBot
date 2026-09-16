const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BASE_URL = "https://steamhistory.net/id";

const REQUEST_TIMEOUT = 30000;

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9," +
        "image/avif,image/webp,image/apng,*/*;q=0.8",

    "Accept-Language":
        "es-CL,es;q=0.9,en;q=0.8",

    "Cache-Control":
        "no-cache",

    "Pragma":
        "no-cache"
};

// =====================================================
// VALIDAR STEAMID64
// =====================================================

function validarSteamID64(steamId) {

    return /^\d{17}$/.test(
        String(steamId || "").trim()
    );
}

// =====================================================
// DECODIFICAR STRING JAVASCRIPT
// =====================================================

function decodificarString(texto) {

    if (!texto) {
        return "";
    }

    try {

        return JSON.parse(
            `"${String(texto)
                .replace(/\\/g, "\\\\")
                .replace(/"/g, '\\"')
                .replace(/\r/g, "\\r")
                .replace(/\n/g, "\\n")
            }"`
        );

    } catch {

        return String(texto)
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
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

    if (
        nombre === null ||
        nombre === undefined
    ) {
        return "";
    }

    let resultado =
        String(nombre)
            .trim();

    resultado =
        resultado
            .replace(/^["']/, "")
            .replace(/["']$/, "");

    resultado =
        decodificarString(
            resultado
        ).trim();

    return resultado;
}

// =====================================================
// CONVERTIR TIMESTAMP
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

    const date =
        new Date(
            numero * 1000
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return date;
}

// =====================================================
// AGREGAR NOMBRE
// =====================================================

function agregarNombre(
    historial,
    nombre,
    timestamp,
    estimated = 0,
    hidden = 0
) {

    const nombreLimpio =
        limpiarNombre(
            nombre
        );

    if (!nombreLimpio) {
        return;
    }

    const fecha =
        convertirTimestamp(
            timestamp
        );

    if (!fecha) {
        return;
    }

    historial.push({

        name:
            nombreLimpio,

        date:
            fecha,

        timestamp:
            Number(timestamp),

        estimated:
            Number(estimated) || 0,

        hidden:
            Number(hidden) || 0
    });
}

// =====================================================
// EXTRAER ARRAY BALANCEADO
// Busca:
// persona: [{ ... }]
// o:
// "persona":[{ ... }]
// =====================================================

function extraerArrayBalanceado(
    texto,
    posicionInicio
) {

    if (
        !texto ||
        posicionInicio < 0
    ) {
        return null;
    }

    const inicio =
        texto.indexOf(
            "[",
            posicionInicio
        );

    if (inicio === -1) {
        return null;
    }

    let profundidad = 0;

    let dentroString = false;

    let escapeado = false;

    for (
        let i = inicio;
        i < texto.length;
        i++
    ) {

        const caracter =
            texto[i];

        if (dentroString) {

            if (escapeado) {

                escapeado = false;

                continue;
            }

            if (
                caracter === "\\"
            ) {

                escapeado = true;

                continue;
            }

            if (
                caracter === '"'
            ) {

                dentroString = false;
            }

            continue;
        }

        if (
            caracter === '"'
        ) {

            dentroString = true;

            continue;
        }

        if (
            caracter === "["
        ) {

            profundidad++;

            continue;
        }

        if (
            caracter === "]"
        ) {

            profundidad--;

            if (
                profundidad === 0
            ) {

                return texto.substring(
                    inicio,
                    i + 1
                );
            }
        }
    }

    return null;
}

// =====================================================
// EXTRAER PERSONA DESDE JSON
// =====================================================

function extraerPersonaDesdeJSON(
    texto
) {

    const resultados = [];

    if (!texto) {
        return resultados;
    }

    const patrones = [

        /"persona"\s*:\s*(\[[\s\S]*?\])/,

        /"persona"\s*:\s*(\[[\s\S]*)/,

        /persona"\s*:\s*(\[[\s\S]*?\])/,

        /persona\s*:\s*(\[[\s\S]*?\])/,

        /persona\s*:\s*(\[[\s\S]*)/
    ];

    for (
        const patron of patrones
    ) {

        const coincidencia =
            texto.match(
                patron
            );

        if (!coincidencia) {
            continue;
        }

        const posicion =
            texto.indexOf(
                coincidencia[0]
            );

        const arrayTexto =
            extraerArrayBalanceado(
                texto,
                posicion
            );

        if (!arrayTexto) {
            continue;
        }

        try {

            const datos =
                JSON.parse(
                    arrayTexto
                );

            if (
                Array.isArray(datos)
            ) {

                for (
                    const item of datos
                ) {

                    if (
                        !item ||
                        typeof item !== "object"
                    ) {
                        continue;
                    }

                    agregarNombre(
                        resultados,
                        item.Name ??
                        item.name,
                        item.Timestamp ??
                        item.timestamp,
                        item.Estimated ??
                        item.estimated ??
                        0,
                        item.Hidden ??
                        item.hidden ??
                        0
                    );
                }

                if (
                    resultados.length > 0
                ) {
                    return resultados;
                }
            }

        } catch {
            // Continuar con parser manual
        }
    }

    return resultados;
}

// =====================================================
// EXTRAER OBJETOS PERSONA MANUALMENTE
// =====================================================

function extraerObjetosPersona(
    texto
) {

    const resultados = [];

    if (!texto) {
        return resultados;
    }

    // Busca objetos con la estructura exacta de SteamHistory
    const regex =
        /\{\s*Name\s*:\s*["']([\s\S]*?)["']\s*,\s*Timestamp\s*:\s*(\d+)(?:\s*,\s*Estimated\s*:\s*(\d+))?(?:\s*,\s*Hidden\s*:\s*(\d+))?[\s\S]*?\}/g;

    let coincidencia;

    while (
        (coincidencia =
            regex.exec(texto)) !== null
    ) {

        agregarNombre(

            resultados,

            coincidencia[1],

            coincidencia[2],

            coincidencia[3] || 0,

            coincidencia[4] || 0
        );
    }

    return resultados;
}

// =====================================================
// EXTRAER PERSONA DESDE TEXTO
// =====================================================

function extraerDesdeTexto(
    texto
) {

    if (!texto) {
        return [];
    }

    // Primero intenta JSON válido
    let resultados =
        extraerPersonaDesdeJSON(
            texto
        );

    if (
        resultados.length > 0
    ) {
        return limpiarHistorial(
            resultados
        );
    }

    // Después intenta objetos JS serializados
    resultados =
        extraerObjetosPersona(
            texto
        );

    return limpiarHistorial(
        resultados
    );
}

// =====================================================
// EXTRAER DESDE JSON
// =====================================================

function extraerDesdeJson(
    datos
) {

    if (!datos) {
        return [];
    }

    const resultados = [];

    // Caso directo
    if (
        Array.isArray(
            datos.persona
        )
    ) {

        for (
            const item of datos.persona
        ) {

            if (
                !item ||
                typeof item !== "object"
            ) {
                continue;
            }

            agregarNombre(
                resultados,
                item.Name ??
                item.name,
                item.Timestamp ??
                item.timestamp,
                item.Estimated ??
                item.estimated ??
                0,
                item.Hidden ??
                item.hidden ??
                0
            );
        }
    }

    // historic.persona
    if (
        datos.historic &&
        Array.isArray(
            datos.historic.persona
        )
    ) {

        for (
            const item of datos.historic.persona
        ) {

            if (
                !item ||
                typeof item !== "object"
            ) {
                continue;
            }

            agregarNombre(
                resultados,
                item.Name ??
                item.name,
                item.Timestamp ??
                item.timestamp,
                item.Estimated ??
                item.estimated ??
                0,
                item.Hidden ??
                item.hidden ??
                0
            );
        }
    }

    // Buscar recursivamente dentro del objeto
    if (
        resultados.length === 0
    ) {

        function recorrer(objeto) {

            if (
                !objeto ||
                typeof objeto !== "object"
            ) {
                return;
            }

            if (
                Array.isArray(objeto)
            ) {

                for (
                    const item of objeto
                ) {

                    if (
                        item &&
                        typeof item === "object"
                    ) {

                        const tieneNombre =
                            item.Name ??
                            item.name;

                        const tieneTimestamp =
                            item.Timestamp ??
                            item.timestamp;

                        if (
                            tieneNombre !== undefined &&
                            tieneTimestamp !== undefined
                        ) {

                            agregarNombre(
                                resultados,
                                tieneNombre,
                                tieneTimestamp,
                                item.Estimated ??
                                item.estimated ??
                                0,
                                item.Hidden ??
                                item.hidden ??
                                0
                            );
                        }
                    }

                    recorrer(item);
                }

                return;
            }

            for (
                const clave of Object.keys(objeto)
            ) {

                recorrer(
                    objeto[clave]
                );
            }
        }

        recorrer(datos);
    }

    return limpiarHistorial(
        resultados
    );
}

// =====================================================
// LIMPIAR HISTORIAL
// =====================================================

function limpiarHistorial(
    historial
) {

    if (
        !Array.isArray(historial)
    ) {
        return [];
    }

    // Eliminar duplicados exactos
    const mapa =
        new Map();

    for (
        const item of historial
    ) {

        if (
            !item ||
            !item.name ||
            !item.date
        ) {
            continue;
        }

        const clave =
            `${item.name.toLowerCase()}|${item.timestamp}`;

        if (
            !mapa.has(clave)
        ) {

            mapa.set(
                clave,
                item
            );
        }
    }

    let resultado =
        Array.from(
            mapa.values()
        );

    // Más reciente primero
    resultado.sort(
        (a, b) =>
            b.timestamp -
            a.timestamp
    );

    // Eliminar repeticiones consecutivas
    const final = [];

    let ultimoNombre =
        null;

    for (
        const item of resultado
    ) {

        const nombreNormalizado =
            item.name
                .trim()
                .toLowerCase();

        if (
            nombreNormalizado ===
            ultimoNombre
        ) {
            continue;
        }

        final.push(
            item
        );

        ultimoNombre =
            nombreNormalizado;
    }

    return final;
}

// =====================================================
// CONSULTAR HTML
// =====================================================

async function consultarHtml(
    steamId
) {

    const url =
        `${BASE_URL}/${steamId}`;

    console.log(
        `[SteamHistory] Consultando HTML: ${url}`
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
                    () => true
            }
        );

    console.log(
        `[SteamHistory] HTML status: ${response.status}`
    );

    if (
        response.status !== 200
    ) {

        throw new Error(
            `SteamHistory HTTP ${response.status}`
        );
    }

    const html =
        String(
            response.data || ""
        );

    if (!html) {

        throw new Error(
            "SteamHistory devolvió una página vacía."
        );
    }

    console.log(
        `[SteamHistory] HTML recibido: ${html.length} caracteres`
    );

    return html;
}

// =====================================================
// OBTENER HISTORIAL
// =====================================================

async function getSteamHistory(
    steamId
) {

    const id =
        String(
            steamId || ""
        ).trim();

    if (
        !validarSteamID64(id)
    ) {

        throw new Error(
            "SteamID64 inválido."
        );
    }

    console.log(
        `[SteamHistory] Buscando historial para ${id}`
    );

    try {

        const html =
            await consultarHtml(
                id
            );

        const nombres =
            extraerDesdeTexto(
                html
            );

        console.log(
            `[SteamHistory] Nombres encontrados: ${nombres.length}`
        );

        if (
            nombres.length > 0
        ) {

            console.log(
                "[SteamHistory] Historial encontrado correctamente."
            );

            return {
                steamId64: id,
                names: nombres
            };
        }

        console.log(
            "[SteamHistory] No se encontró historic.persona en el HTML."
        );

        return {
            steamId64: id,
            names: []
        };

    } catch (error) {

        console.error(
            "[SteamHistory] Error:",
            error.message
        );

        throw error;
    }
}

// =====================================================
// EXPORTAR
// =====================================================

module.exports = {

    getSteamHistory,

    extraerPersonaHistory:
        extraerDesdeTexto,

    extraerDesdeTexto,

    extraerDesdeJson,

    limpiarHistorial
};