const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer-core");
const { spawn } = require("child_process");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_SEARCH_PAGE = `${STEAM_BASE}/search/users/`;
const STEAM_SEARCH_AJAX = `${STEAM_BASE}/search/SearchCommunityAjax`;

const RESULTADOS_POR_PAGINA = 10;
const MAX_PAGINAS = 10;
const DELAY_PAGINAS = 1200;

const RUST_APPID = "252490";
const CONCURRENCIA_RUST = 3;

// =====================================================
// CHROME
// =====================================================

const CHROME_PATH =
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const CHROME_PROFILE =
    "C:\\BattleMetricsBotProfile";

const CHROME_DEBUG_PORT = 9222;

const CHROME_DEBUG_URL =
    `http://localhost:${CHROME_DEBUG_PORT}`;

// =====================================================
// AXIOS
// =====================================================

const steam = axios.create({
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,

    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/139.0.0.0 Safari/537.36",

        "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9," +
            "image/avif,image/webp,image/apng,*/*;q=0.8",

        "Accept-Language":
            "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",

        "Accept-Encoding":
            "gzip, deflate, br",

        "Connection": "keep-alive"
    }
});

// =====================================================
// UTILIDADES
// =====================================================

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarUrlSteam(url) {
    if (!url) {
        return "";
    }

    let resultado = String(url).trim();

    if (resultado.startsWith("//")) {
        resultado = "https:" + resultado;
    }

    if (resultado.startsWith("/")) {
        resultado = STEAM_BASE + resultado;
    }

    return resultado;
}

function extraerSteamID(url) {
    if (!url) {
        return null;
    }

    const match = String(url).match(
        /steamcommunity\.com\/profiles\/(\d{17})/i
    );

    return match ? match[1] : null;
}

function clavePerfil(perfil) {
    return (
        perfil.steamID64 ||
        String(perfil.url || "").toLowerCase()
    );
}

// =====================================================
// OBTENER SESIÓN DE STEAM
// =====================================================

async function obtenerSesionSteam(nombre) {
    console.log("[STEAM] Obteniendo sesión de Steam...");

    const url =
        `${STEAM_SEARCH_PAGE}?text=${encodeURIComponent(nombre)}&filter=users`;

    const respuesta = await steam.get(url);

    const cookies = {};

    const setCookie = respuesta.headers["set-cookie"];

    if (Array.isArray(setCookie)) {
        for (const cookie of setCookie) {
            const parte = cookie.split(";")[0];
            const indice = parte.indexOf("=");

            if (indice !== -1) {
                const key = parte.substring(0, indice);
                const value = parte.substring(indice + 1);

                cookies[key] = value;
            }
        }
    }

    const html = String(respuesta.data || "");

    let sessionId = null;

    const matchSession = html.match(
        /g_sessionID\s*=\s*["']([^"']+)["']/i
    );

    if (matchSession) {
        sessionId = matchSession[1];
    }

    if (!sessionId && cookies.sessionid) {
        sessionId = cookies.sessionid;
    }

    if (!sessionId) {
        sessionId = "";
    }

    console.log("[STEAM] Sesión obtenida correctamente.");

    console.log(
        `[STEAM] Cookies disponibles: ${
            Object.keys(cookies).length > 0
                ? "Sí"
                : "No"
        }`
    );

    return {
        sessionId,
        cookies
    };
}

// =====================================================
// COOKIE HEADER
// =====================================================

function construirCookieHeader(cookies, sessionId) {
    const lista = [];

    for (const [key, value] of Object.entries(cookies || {})) {
        if (value !== undefined && value !== null) {
            lista.push(`${key}=${value}`);
        }
    }

    if (
        sessionId &&
        !Object.prototype.hasOwnProperty.call(
            cookies || {},
            "sessionid"
        )
    ) {
        lista.push(`sessionid=${sessionId}`);
    }

    return lista.join("; ");
}

// =====================================================
// EXTRAER RESULTADOS
// =====================================================

function extraerResultados(html) {
    const resultados = [];

    if (!html) {
        return resultados;
    }

    const $ = cheerio.load(html);

    // =================================================
    // MÉTODO PRINCIPAL
    // =================================================

    $(".search_row").each((index, elemento) => {
        const row = $(elemento);

        let enlace = row
            .find("a.searchPersonaName")
            .first();

        let nombre = limpiarTexto(enlace.text());
        let url = enlace.attr("href") || "";

        if (!url) {
            const cualquierEnlace = row
                .find("a")
                .filter((i, el) => {
                    const href = $(el).attr("href") || "";

                    return (
                        href.includes("steamcommunity.com/id/") ||
                        href.includes("steamcommunity.com/profiles/")
                    );
                })
                .first();

            url = cualquierEnlace.attr("href") || "";

            nombre = limpiarTexto(
                cualquierEnlace.text()
            );
        }

        if (!nombre || !url) {
            return;
        }

        url = normalizarUrlSteam(url);

        resultados.push({
            nombre,
            url,
            steamID64: extraerSteamID(url)
        });
    });

    // =================================================
    // SEGUNDO MÉTODO
    // =================================================

    if (resultados.length === 0) {
        $("a").each((index, elemento) => {
            const enlace = $(elemento);

            const href = enlace.attr("href") || "";

            if (
                !href.includes("steamcommunity.com/id/") &&
                !href.includes("steamcommunity.com/profiles/")
            ) {
                return;
            }

            const nombre =
                limpiarTexto(
                    enlace.find("span").text()
                ) ||
                limpiarTexto(
                    enlace.text()
                );

            if (!nombre) {
                return;
            }

            const url = normalizarUrlSteam(href);

            resultados.push({
                nombre,
                url,
                steamID64: extraerSteamID(url)
            });
        });
    }

    // =================================================
    // DUPLICADOS
    // =================================================

    const vistos = new Set();

    return resultados.filter(perfil => {
        const clave = clavePerfil(perfil);

        if (vistos.has(clave)) {
            return false;
        }

        vistos.add(clave);

        return true;
    });
}

// =====================================================
// BÚSQUEDA NORMAL
// =====================================================

async function buscarPaginaNormal(nombre, pagina) {
    const url =
        `${STEAM_SEARCH_PAGE}` +
        `?text=${encodeURIComponent(nombre)}` +
        `&filter=users` +
        `&page=${pagina}`;

    console.log(
        `[STEAM] Página normal ${pagina}`
    );

    const respuesta =
        await steam.get(url);

    console.log(
        `[STEAM] Página normal ${pagina}: HTTP ${respuesta.status}`
    );

    if (respuesta.status === 429) {
        return {
            rateLimited: true,
            resultados: []
        };
    }

    if (respuesta.status !== 200) {
        return {
            rateLimited: false,
            resultados: []
        };
    }

    const resultados =
        extraerResultados(
            String(respuesta.data || "")
        );

    console.log(
        `[STEAM] Resultados encontrados en HTML: ${resultados.length}`
    );

    return {
        rateLimited: false,
        resultados
    };
}

// =====================================================
// AJAX
// =====================================================

async function buscarPaginaAjax(
    nombre,
    pagina,
    sesion
) {
    const cookies =
        construirCookieHeader(
            sesion.cookies,
            sesion.sessionId
        );

    const parametros = {
        text: nombre,
        filter: "users",
        sessionid: sesion.sessionId,
        steamid_user: "false",
        page: pagina
    };

    const respuesta =
        await steam.get(
            STEAM_SEARCH_AJAX,
            {
                params: parametros,

                headers: {
                    "X-Requested-With":
                        "XMLHttpRequest",

                    "Referer":
                        `${STEAM_SEARCH_PAGE}?text=${encodeURIComponent(
                            nombre
                        )}&filter=users`,

                    "Origin":
                        STEAM_BASE,

                    "Cookie":
                        cookies,

                    "Accept":
                        "application/json, text/javascript, */*; q=0.01"
                }
            }
        );

    console.log(
        `[STEAM] AJAX página ${pagina}: HTTP ${respuesta.status}`
    );

    if (respuesta.status === 429) {
        return {
            rateLimited: true,
            resultados: []
        };
    }

    if (respuesta.status !== 200) {
        return {
            rateLimited: false,
            resultados: []
        };
    }

    let html = "";

    if (typeof respuesta.data === "string") {
        html = respuesta.data;
    } else if (respuesta.data) {
        html =
            respuesta.data.html ||
            respuesta.data.results_html ||
            respuesta.data.results ||
            "";
    }

    return {
        rateLimited: false,
        resultados: extraerResultados(html)
    };
}

// =====================================================
// NOMBRE EXACTO
// =====================================================

function filtrarNombreExacto(
    resultados,
    nombreBuscado
) {
    return resultados.filter(perfil => {
        return perfil.nombre === nombreBuscado;
    });
}

// =====================================================
// COMPROBAR CHROME
// =====================================================

async function chromeDisponible() {
    try {
        const respuesta =
            await axios.get(
                `${CHROME_DEBUG_URL}/json/version`,
                {
                    timeout: 3000,
                    validateStatus: () => true
                }
            );

        return respuesta.status === 200;
    } catch {
        return false;
    }
}

// =====================================================
// INICIAR CHROME
// =====================================================

async function iniciarChrome() {
    console.log(
        "[STEAM] Chrome no está disponible en 9222."
    );

    console.log(
        "[STEAM] Iniciando Chrome con depuración remota..."
    );

    try {
        const proceso =
            spawn(
                CHROME_PATH,
                [
                    `--remote-debugging-port=${CHROME_DEBUG_PORT}`,
                    `--user-data-dir=${CHROME_PROFILE}`,
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-background-networking",
                    "--disable-component-update"
                ],
                {
                    detached: true,
                    stdio: "ignore",
                    windowsHide: true
                }
            );

        proceso.unref();

        for (
            let intento = 1;
            intento <= 20;
            intento++
        ) {
            await esperar(500);

            if (await chromeDisponible()) {
                console.log(
                    "[STEAM] Chrome iniciado correctamente."
                );

                return true;
            }
        }

        console.log(
            "[STEAM] Chrome se inició pero el puerto 9222 no respondió."
        );

        return false;
    } catch (error) {
        console.log(
            `[STEAM] Error iniciando Chrome: ${error.message}`
        );

        return false;
    }
}

// =====================================================
// CONECTAR A CHROME
// =====================================================

async function conectarChromeSteam() {
    console.log(
        "[STEAM] Comprobando Chrome en puerto 9222..."
    );

    if (!(await chromeDisponible())) {
        const iniciado =
            await iniciarChrome();

        if (!iniciado) {
            return null;
        }
    } else {
        console.log(
            "[STEAM] Chrome ya está disponible en 9222."
        );
    }

    try {
        const browser =
            await puppeteer.connect({
                browserURL:
                    CHROME_DEBUG_URL,
                defaultViewport: null
            });

        console.log(
            "[STEAM] Conectado a Chrome correctamente."
        );

        return browser;
    } catch (error) {
        console.log(
            `[STEAM] Error conectando a Chrome: ${error.message}`
        );

        return null;
    }
}

// =====================================================
// OBTENER PÁGINA STEAM
// =====================================================

async function obtenerPaginaSteamChrome(
    browser
) {
    const paginas =
        await browser.pages();

    let pagina =
        paginas.find(page => {
            return page
                .url()
                .includes(
                    "steamcommunity.com"
                );
        });

    if (!pagina) {
        console.log(
            "[STEAM] No existe pestaña de Steam. Creando..."
        );

        pagina =
            await browser.newPage();

        await pagina.setViewport({
            width: 1400,
            height: 900
        });
    } else {
        console.log(
            `[STEAM] Utilizando pestaña Steam existente: ${pagina.url()}`
        );
    }

    return pagina;
}

// =====================================================
// EXTRAER RESULTADOS DESDE CHROME
// =====================================================

async function extraerResultadosDesdeChrome(
    pagina
) {
    return await pagina.evaluate(() => {
        const resultados = [];

        const normalizarUrl = url => {
            if (!url) {
                return "";
            }

            if (url.startsWith("//")) {
                return "https:" + url;
            }

            if (url.startsWith("/")) {
                return (
                    "https://steamcommunity.com" +
                    url
                );
            }

            return url;
        };

        const extraerSteamID = url => {
            const match =
                String(url || "").match(
                    /steamcommunity\.com\/profiles\/(\d{17})/i
                );

            return match
                ? match[1]
                : null;
        };

        const filas =
            document.querySelectorAll(
                ".search_row"
            );

        filas.forEach(fila => {
            let enlace =
                fila.querySelector(
                    "a.searchPersonaName"
                );

            if (!enlace) {
                const enlaces =
                    fila.querySelectorAll("a");

                for (const a of enlaces) {
                    const href =
                        a.getAttribute(
                            "href"
                        ) || "";

                    if (
                        href.includes(
                            "steamcommunity.com/id/"
                        ) ||
                        href.includes(
                            "steamcommunity.com/profiles/"
                        )
                    ) {
                        enlace = a;
                        break;
                    }
                }
            }

            if (!enlace) {
                return;
            }

            const nombre =
                (
                    enlace.innerText ||
                    ""
                )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            let url =
                enlace.getAttribute(
                    "href"
                ) || "";

            if (!nombre || !url) {
                return;
            }

            url =
                normalizarUrl(url);

            resultados.push({
                nombre,
                url,
                steamID64:
                    extraerSteamID(url)
            });
        });

        return resultados;
    });
}

// =====================================================
// BÚSQUEDA CON CHROME
// =====================================================

async function buscarPaginaChrome(
    pagina,
    nombre,
    numeroPagina
) {
    const url =
        `${STEAM_SEARCH_PAGE}` +
        `?text=${encodeURIComponent(nombre)}` +
        `&filter=users` +
        `&page=${numeroPagina}`;

    console.log(
        `[STEAM] Chrome buscando página ${numeroPagina}...`
    );

    try {
        await pagina.goto(
            url,
            {
                waitUntil:
                    "domcontentloaded",
                timeout: 30000
            }
        );

        await esperar(2000);

        const resultados =
            await extraerResultadosDesdeChrome(
                pagina
            );

        console.log(
            `[STEAM] Chrome página ${numeroPagina}: ${resultados.length} resultados`
        );

        return {
            rateLimited: false,
            resultados
        };
    } catch (error) {
        console.log(
            `[STEAM] Error Chrome página ${numeroPagina}: ${error.message}`
        );

        return {
            rateLimited: false,
            resultados: []
        };
    }
}

// =====================================================
// BÚSQUEDA COMPLETA CON CHROME
// =====================================================

async function buscarConChrome(
    nombreBuscado
) {
    let browser = null;

    try {
        browser =
            await conectarChromeSteam();

        if (!browser) {
            return [];
        }

        const pagina =
            await obtenerPaginaSteamChrome(
                browser
            );

        const perfiles = [];
        const vistos = new Set();

        for (
            let paginaNumero = 1;
            paginaNumero <= MAX_PAGINAS;
            paginaNumero++
        ) {
            const respuesta =
                await buscarPaginaChrome(
                    pagina,
                    nombreBuscado,
                    paginaNumero
                );

            const exactos =
                filtrarNombreExacto(
                    respuesta.resultados,
                    nombreBuscado
                );

            for (const perfil of exactos) {
                const clave =
                    clavePerfil(perfil);

                if (!vistos.has(clave)) {
                    vistos.add(clave);
                    perfiles.push(perfil);
                }
            }

            if (
                respuesta.resultados.length === 0
            ) {
                break;
            }

            if (
                respuesta.resultados.length <
                RESULTADOS_POR_PAGINA
            ) {
                break;
            }

            if (
                paginaNumero <
                MAX_PAGINAS
            ) {
                await esperar(
                    DELAY_PAGINAS
                );
            }
        }

        console.log(
            `[STEAM] Chrome encontró ${perfiles.length} coincidencias exactas.`
        );

        return perfiles;
    } catch (error) {
        console.log(
            `[STEAM] Error general usando Chrome: ${error.message}`
        );

        return [];
    }
}

// =====================================================
// BUSCAR TODOS LOS PERFILES EXACTOS
// =====================================================

async function buscarPerfilesExactos(
    nombreBuscado
) {
    console.log(
        `[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`
    );

    const perfiles = [];
    const vistos = new Set();

    let huboRateLimit = false;

    // =================================================
    // NORMAL
    // =================================================

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS;
        pagina++
    ) {
        let respuesta;

        try {
            respuesta =
                await buscarPaginaNormal(
                    nombreBuscado,
                    pagina
                );
        } catch (error) {
            console.log(
                `[STEAM] Error página normal ${pagina}: ${error.message}`
            );

            respuesta = {
                rateLimited: false,
                resultados: []
            };
        }

        if (respuesta.rateLimited) {
            console.log(
                "[STEAM] Steam está limitando la búsqueda normal."
            );

            huboRateLimit = true;
            break;
        }

        const exactos =
            filtrarNombreExacto(
                respuesta.resultados,
                nombreBuscado
            );

        for (const perfil of exactos) {
            const clave =
                clavePerfil(perfil);

            if (!vistos.has(clave)) {
                vistos.add(clave);
                perfiles.push(perfil);
            }
        }

        if (
            respuesta.resultados.length === 0
        ) {
            break;
        }

        if (
            respuesta.resultados.length <
            RESULTADOS_POR_PAGINA
        ) {
            break;
        }

        if (pagina < MAX_PAGINAS) {
            await esperar(
                DELAY_PAGINAS
            );
        }
    }

    // =================================================
    // AJAX
    // =================================================

    if (
        perfiles.length === 0 ||
        huboRateLimit
    ) {
        console.log(
            "[STEAM] Intentando método AJAX..."
        );

        try {
            const sesion =
                await obtenerSesionSteam(
                    nombreBuscado
                );

            for (
                let pagina = 1;
                pagina <= MAX_PAGINAS;
                pagina++
            ) {
                const respuesta =
                    await buscarPaginaAjax(
                        nombreBuscado,
                        pagina,
                        sesion
                    );

                if (respuesta.rateLimited) {
                    console.log(
                        "[STEAM] AJAX también está limitado por Steam."
                    );

                    break;
                }

                const exactos =
                    filtrarNombreExacto(
                        respuesta.resultados,
                        nombreBuscado
                    );

                for (const perfil of exactos) {
                    const clave =
                        clavePerfil(perfil);

                    if (!vistos.has(clave)) {
                        vistos.add(clave);
                        perfiles.push(perfil);
                    }
                }

                if (
                    respuesta.resultados.length === 0
                ) {
                    break;
                }

                if (
                    respuesta.resultados.length <
                    RESULTADOS_POR_PAGINA
                ) {
                    break;
                }

                if (
                    pagina <
                    MAX_PAGINAS
                ) {
                    await esperar(
                        DELAY_PAGINAS
                    );
                }
            }
        } catch (error) {
            console.log(
                `[STEAM] Error en método AJAX: ${error.message}`
            );
        }
    }

    // =================================================
    // CHROME
    // =================================================

    if (perfiles.length === 0) {
        console.log(
            "[STEAM] Los métodos HTTP no devolvieron resultados."
        );

        console.log(
            "[STEAM] Intentando búsqueda mediante Chrome..."
        );

        const chromePerfiles =
            await buscarConChrome(
                nombreBuscado
            );

        for (const perfil of chromePerfiles) {
            const clave =
                clavePerfil(perfil);

            if (!vistos.has(clave)) {
                vistos.add(clave);
                perfiles.push(perfil);
            }
        }
    }

    console.log(
        `[STEAM] RESULTADO FINAL: ${perfiles.length} coincidencias exactas.`
    );

    return perfiles;
}

// =====================================================
// EXTRAER NOMBRE BATTLEMETRICS
// =====================================================

async function obtenerNombreBattleMetrics(
    url
) {
    console.log(
        `[BATTLEMETRICS] Obteniendo jugador desde: ${url}`
    );

    try {
        const respuesta =
            await axios.get(
                url,
                {
                    timeout: 15000,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                            "AppleWebKit/537.36 (KHTML, like Gecko) " +
                            "Chrome/139.0.0.0 Safari/537.36"
                    },

                    validateStatus: () => true
                }
            );

        console.log(
            `[BATTLEMETRICS] HTTP ${respuesta.status}`
        );

        const $ =
            cheerio.load(
                String(
                    respuesta.data || ""
                )
            );

        let nombre = "";

        const h1 =
            $("h1")
                .first()
                .text();

        if (h1) {
            nombre =
                limpiarTexto(h1);
        }

        if (!nombre) {
            const title =
                $("title")
                    .first()
                    .text();

            nombre =
                limpiarTexto(
                    title.replace(
                        /\s*-\s*BattleMetrics.*$/i,
                        ""
                    )
                );
        }

        if (!nombre) {
            const meta =
                $(
                    'meta[name="description"]'
                )
                    .attr("content");

            if (meta) {
                nombre =
                    limpiarTexto(
                        meta.replace(
                            /^.*?player\s*/i,
                            ""
                        )
                    );
            }
        }

        if (nombre) {
            console.log(
                `[BATTLEMETRICS] Nombre detectado: ${nombre}`
            );
        }

        return nombre || null;
    } catch (error) {
        console.log(
            `[BATTLEMETRICS] Error: ${error.message}`
        );

        return null;
    }
}

// =====================================================
// DETECTAR RUST
// =====================================================

function analizarRustHTML(html) {
    if (!html) {
        return {
            rust: false,
            inventario: false
        };
    }

    const texto =
        String(html).toLowerCase();

    const inventario =
        texto.includes(
            `#${RUST_APPID}_`
        ) ||
        texto.includes(
            `/inventory/${RUST_APPID}`
        ) ||
        texto.includes(
            `/gamecards/${RUST_APPID}`
        ) ||
        texto.includes(
            `/app/${RUST_APPID}`
        ) ||
        texto.includes(
            `inventory/#${RUST_APPID}`
        ) ||
        texto.includes(
            `inventory/#${RUST_APPID}_`
        );

    const rust =
        inventario ||
        texto.includes(
            "appid=252490"
        ) ||
        texto.includes(
            '"appid":252490'
        ) ||
        texto.includes(
            "'appid':252490"
        ) ||
        texto.includes(
            "rust™"
        ) ||
        texto.includes(
            ">rust<"
        ) ||
        texto.includes(
            "rust -"
        ) ||
        texto.includes(
            "rust |"
        );

    return {
        rust,
        inventario
    };
}

// =====================================================
// COMPROBAR RUST
// =====================================================

async function comprobarRust(perfil) {
    console.log(
        `[RUST] Comprobando: ${perfil.nombre} - ${perfil.url}`
    );

    try {
        const respuesta =
            await steam.get(
                perfil.url,
                {
                    timeout: 15000,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                            "AppleWebKit/537.36 (KHTML, like Gecko) " +
                            "Chrome/139.0.0.0 Safari/537.36",

                        "Accept-Language":
                            "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",

                        "Accept-Encoding":
                            "gzip, deflate, br"
                    }
                }
            );

        if (
            respuesta.status !== 200
        ) {
            console.log(
                `[RUST] HTTP ${respuesta.status} para ${perfil.nombre}`
            );

            return {
                ...perfil,
                rust: null,
                inventarioRust: null
            };
        }

        const resultado =
            analizarRustHTML(
                String(
                    respuesta.data || ""
                )
            );

        console.log(
            `[RUST] ${perfil.nombre} -> Rust: ${
                resultado.rust
                    ? "Sí"
                    : "No confirmado"
            } | Inventario: ${
                resultado.inventario
                    ? "Sí"
                    : "No confirmado"
            }`
        );

        return {
            ...perfil,
            rust:
                resultado.rust,
            inventarioRust:
                resultado.inventario
        };
    } catch (error) {
        console.log(
            `[RUST] Error ${perfil.nombre}: ${error.message}`
        );

        return {
            ...perfil,
            rust: null,
            inventarioRust: null
        };
    }
}

// =====================================================
// RUST - CONCURRENCIA
// =====================================================

async function comprobarRustTodos(
    perfiles
) {
    const resultados =
        new Array(
            perfiles.length
        );

    let siguiente = 0;

    async function trabajador() {
        while (true) {
            const indice =
                siguiente++;

            if (
                indice >=
                perfiles.length
            ) {
                return;
            }

            resultados[indice] =
                await comprobarRust(
                    perfiles[indice]
                );
        }
    }

    const trabajadores = [];

    const cantidad =
        Math.min(
            CONCURRENCIA_RUST,
            perfiles.length
        );

    for (
        let i = 0;
        i < cantidad;
        i++
    ) {
        trabajadores.push(
            trabajador()
        );
    }

    await Promise.all(
        trabajadores
    );

    return resultados;
}

// =====================================================
// ORDENAR
// =====================================================

function ordenarPerfiles(
    perfiles
) {
    return [...perfiles].sort(
        (a, b) => {
            function prioridad(
                perfil
            ) {
                if (
                    perfil.rust === true &&
                    perfil.inventarioRust === true
                ) {
                    return 3;
                }

                if (
                    perfil.rust === true
                ) {
                    return 2;
                }

                return 1;
            }

            return (
                prioridad(b) -
                prioridad(a)
            );
        }
    );
}

// =====================================================
// DESCRIPCIÓN
// =====================================================

function crearDescripcion(
    perfil,
    numero
) {
    let texto =
        `**${numero}. ${perfil.nombre}**\n`;

    texto +=
        `🔗 ${perfil.url}\n`;

    if (perfil.steamID64) {
        texto +=
            `🆔 SteamID64: \`${perfil.steamID64}\`\n`;
    } else {
        texto +=
            `🆔 SteamID64: No disponible\n`;
    }

    if (
        perfil.rust === true
    ) {
        texto +=
            `🎮 Rust: **Sí**\n`;
    } else {
        texto +=
            `🎮 Rust: **No confirmado**\n`;
    }

    if (
        perfil.inventarioRust === true
    ) {
        texto +=
            `🎒 Inventario/skins de Rust: **Sí**\n`;
    } else {
        texto +=
            `🎒 Inventario/skins de Rust: **No confirmado**\n`;
    }

    return texto;
}

// =====================================================
// EMBED
// =====================================================

function crearEmbed(
    perfiles,
    pagina,
    total,
    nombreBuscado
) {
    const inicio =
        pagina *
        RESULTADOS_POR_PAGINA;

    const paginaPerfiles =
        perfiles.slice(
            inicio,
            inicio +
                RESULTADOS_POR_PAGINA
        );

    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                total /
                    RESULTADOS_POR_PAGINA
            )
        );

    return new EmbedBuilder()
        .setTitle(
            `🔎 Steam — "${nombreBuscado}"`
        )
        .setDescription(
            paginaPerfiles
                .map(
                    (perfil, index) =>
                        crearDescripcion(
                            perfil,
                            inicio +
                                index +
                                1
                        )
                )
                .join("\n")
        )
        .setFooter({
            text:
                `Página ${pagina + 1}/${totalPaginas} • ` +
                `${total} coincidencias exactas`
        });
}

// =====================================================
// BOTONES
// =====================================================

function crearBotones(
    pagina,
    total,
    usuarioId,
    deshabilitarTodos = false
) {
    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                total /
                    RESULTADOS_POR_PAGINA
            )
        );

    const anterior =
        new ButtonBuilder()
            .setCustomId(
                `steam_anterior_${usuarioId}`
            )
            .setLabel("Anterior")
            .setEmoji("⬅️")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                deshabilitarTodos ||
                pagina <= 0
            );

    const siguiente =
        new ButtonBuilder()
            .setCustomId(
                `steam_siguiente_${usuarioId}`
            )
            .setLabel("Siguiente")
            .setEmoji("➡️")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                deshabilitarTodos ||
                pagina >=
                    totalPaginas - 1
            );

    return new ActionRowBuilder()
        .addComponents(
            anterior,
            siguiente
        );
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca perfiles de Steam por nombre exacto"
            )
            .addStringOption(
                option =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre exacto de Steam o URL de BattleMetrics"
                        )
                        .setRequired(true)
            ),

    async execute(interaction) {
        const entrada =
            interaction.options
                .getString("nombre")
                .trim();

        console.log(
            `[STEAM] Entrada recibida: ${entrada}`
        );

        await interaction.deferReply();

        let nombreBuscado =
            entrada;

        // =================================================
        // BATTLEMETRICS
        // =================================================

        if (
            entrada.includes(
                "battlemetrics.com/players/"
            )
        ) {
            const nombreBM =
                await obtenerNombreBattleMetrics(
                    entrada
                );

            if (!nombreBM) {
                await interaction.editReply({
                    content:
                        "❌ No pude obtener el nombre del jugador desde BattleMetrics."
                });

                return;
            }

            nombreBuscado =
                nombreBM;
        }

        // =================================================
        // BUSCAR
        // =================================================

        const perfiles =
            await buscarPerfilesExactos(
                nombreBuscado
            );

        if (
            perfiles.length === 0
        ) {
            await interaction.editReply({
                content:
                    `❌ No se encontraron perfiles de Steam con el nombre exacto **${nombreBuscado}**.\n\n` +
                    `Steam está limitando temporalmente las búsquedas desde esta conexión/IP.`
            });

            console.log(
                "[STEAM] No se encontraron coincidencias."
            );

            return;
        }

        // =================================================
        // AVISO
        // =================================================

        await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(
                        `🔎 Buscando "${nombreBuscado}"...`
                    )
                    .setDescription(
                        `Encontré **${perfiles.length}** coincidencias exactas.\n\n` +
                        `⏳ Comprobando cuáles tienen Rust...`
                    )
            ]
        });

        // =================================================
        // RUST
        // =================================================

        const perfilesComprobados =
            await comprobarRustTodos(
                perfiles
            );

        // =================================================
        // ORDENAR
        // =================================================

        const perfilesOrdenados =
            ordenarPerfiles(
                perfilesComprobados
            );

        // =================================================
        // PAGINACIÓN
        // =================================================

        let pagina = 0;

        const total =
            perfilesOrdenados.length;

        const actualizar =
            async () => {
                await interaction.editReply({
                    embeds: [
                        crearEmbed(
                            perfilesOrdenados,
                            pagina,
                            total,
                            nombreBuscado
                        )
                    ],

                    components: [
                        crearBotones(
                            pagina,
                            total,
                            interaction.user.id
                        )
                    ]
                });
            };

        await actualizar();

        // =================================================
        // COLLECTOR
        // =================================================

        const mensaje =
            await interaction.fetchReply();

        const collector =
            mensaje.createMessageComponentCollector({
                time: 120000
            });

        collector.on(
            "collect",
            async boton => {
                try {
                    if (
                        boton.user.id !==
                        interaction.user.id
                    ) {
                        await boton.reply({
                            content:
                                "❌ Solo la persona que ejecutó `/steam` puede usar estos botones.",
                            ephemeral: true
                        });

                        return;
                    }

                    const totalPaginas =
                        Math.max(
                            1,
                            Math.ceil(
                                total /
                                    RESULTADOS_POR_PAGINA
                            )
                        );

                    if (
                        boton.customId.startsWith(
                            "steam_anterior_"
                        )
                    ) {
                        pagina =
                            Math.max(
                                0,
                                pagina - 1
                            );
                    }

                    if (
                        boton.customId.startsWith(
                            "steam_siguiente_"
                        )
                    ) {
                        pagina =
                            Math.min(
                                totalPaginas - 1,
                                pagina + 1
                            );
                    }

                    await boton.update({
                        embeds: [
                            crearEmbed(
                                perfilesOrdenados,
                                pagina,
                                total,
                                nombreBuscado
                            )
                        ],

                        components: [
                            crearBotones(
                                pagina,
                                total,
                                interaction.user.id
                            )
                        ]
                    });
                } catch (error) {
                    console.log(
                        `[STEAM] Error botón: ${error.message}`
                    );
                }
            }
        );

        // =================================================
        // FINAL
        // =================================================

        collector.on(
            "end",
            async () => {
                try {
                    await interaction.editReply({
                        components: [
                            crearBotones(
                                pagina,
                                total,
                                interaction.user.id,
                                true
                            )
                        ]
                    });
                } catch (error) {
                    // Mensaje eliminado.
                }
            }
        );
    }
};