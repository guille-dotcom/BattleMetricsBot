const { chromium } = require("playwright");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BASE_URL = "https://steamhistory.net/id";

const NAVIGATION_TIMEOUT = 45000;

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/140.0.0.0 Safari/537.36";

// =====================================================
// VALIDAR STEAMID64
// =====================================================

function validarSteamID64(steamId) {

    return /^\d{17}$/.test(
        String(steamId || "").trim()
    );
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

    return String(nombre)
        .trim();
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

    const fecha =
        new Date(
            numero * 1000
        );

    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {
        return null;
    }

    return fecha;
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
        limpiarNombre(nombre);

    if (!nombreLimpio) {
        return;
    }

    const fecha =
        convertirTimestamp(timestamp);

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

            if (caracter === "\\") {
                escapeado = true;
                continue;
            }

            if (caracter === '"') {
                dentroString = false;
            }

            continue;
        }

        if (caracter === '"') {

            dentroString = true;
            continue;
        }

        if (caracter === "[") {

            profundidad++;
            continue;
        }

        if (caracter === "]") {

            profundidad--;

            if (profundidad === 0) {

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
// EXTRAER PERSONA DESDE TEXTO
// =====================================================

function extraerDesdeTexto(texto) {

    if (!texto) {
        return [];
    }

    const resultados = [];

    // =================================================
    // CASO 1
    // "persona":[...]
    // =================================================

    const patrones = [

        /"persona"\s*:\s*\[/,

        /persona"\s*:\s*\[/,

        /persona\s*:\s*\[/
    ];

    for (
        const patron of patrones
    ) {

        const coincidencia =
            texto.match(patron);

        if (!coincidencia) {
            continue;
        }

        const posicion =
            coincidencia.index;

        const arrayTexto =
            extraerArrayBalanceado(
                texto,
                posicion
            );

        if (!arrayTexto) {
            continue;
        }

        // =================================================
        // INTENTAR JSON
        // =================================================

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
                    return limpiarHistorial(
                        resultados
                    );
                }
            }

        } catch {
            // Puede ser JavaScript serializado
        }

        // =================================================
        // PARSER MANUAL
        // =================================================

        const regex =
            /\{\s*Name\s*:\s*["']([\s\S]*?)["']\s*,\s*Timestamp\s*:\s*(\d+)(?:\s*,\s*Estimated\s*:\s*(\d+))?(?:\s*,\s*Hidden\s*:\s*(\d+))?/g;

        let match;

        while (
            (match =
                regex.exec(arrayTexto)) !== null
        ) {

            agregarNombre(

                resultados,

                match[1],

                match[2],

                match[3] || 0,

                match[4] || 0
            );
        }

        if (
            resultados.length > 0
        ) {

            return limpiarHistorial(
                resultados
            );
        }
    }

    // =================================================
    // ÚLTIMO INTENTO
    // Buscar directamente objetos persona
    // =================================================

    const regexDirecto =
        /\{\s*Name\s*:\s*["']([\s\S]*?)["']\s*,\s*Timestamp\s*:\s*(\d+)/g;

    let match;

    while (
        (match =
            regexDirecto.exec(texto)) !== null
    ) {

        agregarNombre(

            resultados,

            match[1],

            match[2]
        );
    }

    return limpiarHistorial(
        resultados
    );
}

// =====================================================
// EXTRAER DESDE JSON
// =====================================================

function extraerDesdeJson(datos) {

    if (!datos) {
        return [];
    }

    const resultados = [];

    // =================================================
    // historic.persona
    // =================================================

    if (
        datos.historic &&
        Array.isArray(
            datos.historic.persona
        )
    ) {

        for (
            const item of
            datos.historic.persona
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

    // =================================================
    // persona directo
    // =================================================

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

    // Eliminar nombres repetidos consecutivos
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
// EXTRAER DATOS DEL HTML CON PLAYWRIGHT
// =====================================================

async function consultarConPlaywright(
    steamId
) {

    const url =
        `${BASE_URL}/${steamId}`;

    console.log(
        `[SteamHistory] Abriendo Chromium: ${url}`
    );

    let browser = null;

    try {

        // =================================================
        // LANZAR CHROMIUM
        // =================================================

        browser =
            await chromium.launch({

                headless: true,

                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu"
                ]
            });

        // =================================================
        // CREAR CONTEXTO
        // =================================================

        const context =
            await browser.newContext({

                userAgent:
                    USER_AGENT,

                locale:
                    "es-CL",

                timezoneId:
                    "America/Santiago",

                viewport: {
                    width: 1366,
                    height: 768
                },

                extraHTTPHeaders: {

                    "Accept-Language":
                        "es-CL,es;q=0.9,en;q=0.8"
                }
            });

        // =================================================
        // CREAR PÁGINA
        // =================================================

        const page =
            await context.newPage();

        // =================================================
        // LOG DE RESPUESTA PRINCIPAL
        // =================================================

        page.on(
            "response",
            response => {

                const responseUrl =
                    response.url();

                if (
                    responseUrl.includes(
                        "steamhistory.net/id/"
                    )
                ) {

                    console.log(
                        `[SteamHistory] Browser response: ${response.status()} ${responseUrl}`
                    );
                }
            }
        );

        // =================================================
        // NAVEGAR
        // =================================================

        const response =
            await page.goto(
                url,
                {
                    waitUntil:
                        "domcontentloaded",

                    timeout:
                        NAVIGATION_TIMEOUT
                }
            );

        const status =
            response
                ? response.status()
                : 0;

        console.log(
            `[SteamHistory] Chromium HTTP status: ${status}`
        );

        // =================================================
        // ESPERAR UN POCO POR SVELTEKIT
        // =================================================

        await page.waitForTimeout(
            3000
        );

        // =================================================
        // OBTENER HTML FINAL
        // =================================================

        const html =
            await page.content();

        console.log(
            `[SteamHistory] HTML Chromium: ${html.length} caracteres`
        );

        // =================================================
        // BUSCAR HISTORIAL
        // =================================================

        let historial =
            extraerDesdeTexto(
                html
            );

        // =================================================
        // SI NO ESTÁ EN HTML, BUSCAR EN SCRIPT
        // =================================================

        if (
            historial.length === 0
        ) {

            const scripts =
                await page
                    .locator("script")
                    .allTextContents();

            console.log(
                `[SteamHistory] Scripts encontrados: ${scripts.length}`
            );

            for (
                const script of scripts
            ) {

                if (
                    !script ||
                    !script.includes(
                        "persona"
                    )
                ) {
                    continue;
                }

                historial =
                    extraerDesdeTexto(
                        script
                    );

                if (
                    historial.length > 0
                ) {
                    break;
                }
            }
        }

        // =================================================
        // RESULTADO
        // =================================================

        console.log(
            `[SteamHistory] Historial encontrado con Chromium: ${historial.length}`
        );

        return {

            steamId64:
                steamId,

            names:
                historial,

            httpStatus:
                status
        };

    } finally {

        if (browser) {

            try {

                await browser.close();

            } catch {
                // Ignorar error de cierre
            }
        }
    }
}

// =====================================================
// CONSULTAR STEAMHISTORY
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

        const resultado =
            await consultarConPlaywright(
                id
            );

        if (
            resultado.names.length > 0
        ) {

            console.log(
                `[SteamHistory] ✅ Encontrados ${resultado.names.length} nombres.`
            );

            return resultado;
        }

        console.log(
            "[SteamHistory] ⚠️ Chromium no encontró historic.persona."
        );

        return {

            steamId64:
                id,

            names:
                []
        };

    } catch (error) {

        console.error(
            "[SteamHistory] ❌ Error Playwright:",
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