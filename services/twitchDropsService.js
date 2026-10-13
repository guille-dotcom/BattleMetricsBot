const axios = require("axios");
const cheerio = require("cheerio");

let puppeteer = null;

try {
    puppeteer = require("puppeteer");
} catch (error) {
    console.warn(
        "[Twitch Drops] ⚠️ Puppeteer no está disponible. Se usará únicamente Axios."
    );
}

const {
    EmbedBuilder
} = require("discord.js");

const RustDropsMonitor =
    require("../models/RustDropsMonitor");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const FACEPUNCH_DROPS_URL =
    "https://twitch.facepunch.com/?handler=Twitch";

const TWITCH_API =
    "https://api.twitch.tv/helix";

const TWITCH_GAME_ID_RUST =
    "252490";

const INTERVALO_DROPS =
    60 * 1000;

const FACEPUNCH_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "Accept-Language":
        "en-US,en;q=0.9"
};

// ============================================================
// PUPPETEER
// ============================================================

let facepunchBrowser = null;
let facepunchPage = null;
let facepunchRenderPromise = null;

let facepunchHtmlCache = null;
let facepunchHtmlCacheTimestamp = 0;

const FACEPUNCH_HTML_CACHE_MS =
    45 * 1000;

// ============================================================
// CERRAR PUPPETEER
// ============================================================

async function cerrarPuppeteerFacepunch() {

    try {
        if (facepunchPage) {
            await facepunchPage.close();
        }
    } catch {}

    try {
        if (facepunchBrowser) {
            await facepunchBrowser.close();
        }
    } catch {}

    facepunchPage = null;
    facepunchBrowser = null;
}

// ============================================================
// HTML FACEPUNCH CON PUPPETEER
// ============================================================

async function obtenerHtmlFacepunchConPuppeteer() {

    if (!puppeteer) {
        return null;
    }

    if (
        facepunchHtmlCache &&
        Date.now() - facepunchHtmlCacheTimestamp <
            FACEPUNCH_HTML_CACHE_MS
    ) {
        return facepunchHtmlCache;
    }

    if (facepunchRenderPromise) {
        return facepunchRenderPromise;
    }

    facepunchRenderPromise = (async () => {

        try {

            if (
                !facepunchBrowser ||
                !facepunchBrowser.connected
            ) {

                await cerrarPuppeteerFacepunch();

                console.log(
                    "[Twitch Drops] 🌐 Iniciando navegador para Facepunch..."
                );

                facepunchBrowser =
                    await puppeteer.launch({
                        headless: true,
                        args: [
                            "--no-sandbox",
                            "--disable-setuid-sandbox",
                            "--disable-dev-shm-usage",
                            "--disable-gpu"
                        ]
                    });

                facepunchPage =
                    await facepunchBrowser.newPage();

                await facepunchPage.setUserAgent(
                    FACEPUNCH_HEADERS["User-Agent"]
                );

                await facepunchPage.setExtraHTTPHeaders({
                    "Accept-Language":
                        FACEPUNCH_HEADERS[
                            "Accept-Language"
                        ]
                });

                await facepunchPage.setViewport({
                    width: 1440,
                    height: 1400,
                    deviceScaleFactor: 1
                });
            }

            await facepunchPage.goto(
                FACEPUNCH_DROPS_URL,
                {
                    waitUntil: "networkidle2",
                    timeout: 60000
                }
            );

            try {

                await facepunchPage.waitForFunction(
                    () => {

                        const texto =
                            document.body?.innerText ||
                            "";

                        return (
                            /General Drops/i.test(texto) ||
                            /Streamer Drops/i.test(texto)
                        );
                    },
                    {
                        timeout: 15000
                    }
                );

            } catch {}

            await new Promise(resolve =>
                setTimeout(resolve, 2000)
            );

            const html =
                await facepunchPage.content();

            if (
                !html ||
                typeof html !== "string"
            ) {
                throw new Error(
                    "Puppeteer no devolvió HTML."
                );
            }

            facepunchHtmlCache =
                html;

            facepunchHtmlCacheTimestamp =
                Date.now();

            console.log(
                `[Twitch Drops] 🌐 HTML renderizado: ${html.length} caracteres`
            );

            return html;

        } catch (error) {

            console.error(
                "[Twitch Drops] ❌ Error Puppeteer:",
                error.message
            );

            await cerrarPuppeteerFacepunch();

            return null;

        } finally {

            facepunchRenderPromise = null;
        }

    })();

    return facepunchRenderPromise;
}

// ============================================================
// TWITCH TOKEN
// ============================================================

let twitchAccessToken = null;
let twitchTokenExpira = 0;

// ============================================================
// SERVICIO
// ============================================================

let intervaloAutomatico = null;
let revisando = false;

// ============================================================
// UTILIDADES
// ============================================================

function limpiarTexto(texto) {

    return String(texto || "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizarNombre(nombre) {

    return limpiarTexto(nombre)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function limpiarNombreDrop(nombre) {

    nombre =
        limpiarTexto(nombre);

    if (!nombre) {
        return "";
    }

    nombre =
        nombre
            .replace(
                /^loading\s*(?:\.\.\.|…)/i,
                ""
            )
            .replace(
                /\s+loading\s*(?:\.\.\.|…)$/i,
                ""
            );

    return limpiarTexto(nombre);
}

// ============================================================
// URL IMAGEN
// ============================================================

function normalizarUrlImagen(url) {

    if (!url) {
        return null;
    }

    url =
        String(url)
            .trim()
            .replace(/&amp;/g, "&");

    if (!url) {
        return null;
    }

    if (
        url.startsWith("data:")
    ) {
        return null;
    }

    if (
        url.startsWith("//")
    ) {
        return `https:${url}`;
    }

    if (
        url.startsWith("/")
    ) {
        return `https://twitch.facepunch.com${url}`;
    }

    if (
        /^https?:\/\//i.test(url)
    ) {
        return url;
    }

    return null;
}

// ============================================================
// SRCSET
// ============================================================

function extraerPrimeraUrlSrcset(srcset) {

    if (!srcset) {
        return null;
    }

    const partes =
        String(srcset)
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);

    if (!partes.length) {
        return null;
    }

    for (
        let i = partes.length - 1;
        i >= 0;
        i--
    ) {

        const url =
            partes[i]
                .split(/\s+/)[0];

        const normalizada =
            normalizarUrlImagen(url);

        if (normalizada) {
            return normalizada;
        }
    }

    return null;
}

// ============================================================
// BACKGROUND
// ============================================================

function extraerUrlBackground(style) {

    if (!style) {
        return null;
    }

    const match =
        String(style).match(
            /url\(\s*['"]?([^'")]+)['"]?\s*\)/i
        );

    if (!match) {
        return null;
    }

    return normalizarUrlImagen(
        match[1]
    );
}

// ============================================================
// IMAGEN DIRECTA DE ELEMENTO
// ============================================================

function extraerImagenDirecta(
    $,
    elemento
) {

    if (
        !elemento ||
        !elemento.length
    ) {
        return null;
    }

    const atributos = [
        "src",
        "data-src",
        "data-image",
        "data-img",
        "data-lazy-src",
        "data-original",
        "data-url",
        "data-image-url",
        "data-background-image"
    ];

    const nodos = [];

    if (
        elemento.is &&
        elemento.is(
            "img,source"
        )
    ) {
        nodos.push(elemento);
    }

    elemento
        .find(
            "img,source"
        )
        .each((_, el) => {
            nodos.push(
                $(el)
            );
        });

    for (
        const nodo
        of nodos
    ) {

        for (
            const atributo
            of atributos
        ) {

            const valor =
                nodo.attr(
                    atributo
                );

            const url =
                normalizarUrlImagen(
                    valor
                );

            if (url) {
                return url;
            }
        }

        const srcset =
            nodo.attr("srcset") ||
            nodo.attr("data-srcset");

        const urlSrcset =
            extraerPrimeraUrlSrcset(
                srcset
            );

        if (urlSrcset) {
            return urlSrcset;
        }
    }

    const estilos = [];

    if (
        elemento.attr
    ) {
        estilos.push(
            elemento.attr("style")
        );
    }

    elemento
        .find("[style]")
        .each((_, el) => {
            estilos.push(
                $(el).attr("style")
            );
        });

    for (
        const style
        of estilos
    ) {

        const url =
            extraerUrlBackground(
                style
            );

        if (url) {
            return url;
        }
    }

    return null;
}

// ============================================================
// IMÁGENES CONOCIDAS
// ============================================================

const STREAMER_DROP_IMAGENES = {

    "small backpack":
        "https://files.facepunch.com/lewis/2026/October/backpack.jpg",

    "backpack":
        "https://files.facepunch.com/lewis/2026/October/backpack.jpg"

};

// ============================================================
// IMAGEN CONOCIDA
// ============================================================

function obtenerImagenConocidaDrop(
    nombre
) {

    const clave =
        normalizarNombre(
            nombre
        );

    return (
        STREAMER_DROP_IMAGENES[
            clave
        ] ||
        null
    );
}

// ============================================================
// BUSCAR IMAGEN POR NOMBRE
// ============================================================

function buscarImagenPorNombre(
    $,
    root,
    nombre
) {

    if (
        !root ||
        !root.length ||
        !nombre
    ) {
        return null;
    }

    const objetivo =
        normalizarNombre(
            nombre
        );

    if (!objetivo) {
        return null;
    }

    const palabras =
        objetivo
            .split(/\s+/)
            .filter(
                palabra =>
                    palabra.length >= 3
            );

    let mejor = null;
    let mejorPuntuacion = 0;

    root.find(
        "img,source,[style*='background']"
    ).each((_, elemento) => {

        const $el =
            $(elemento);

        const metadatos = [
            $el.attr("alt"),
            $el.attr("title"),
            $el.attr("aria-label"),
            $el.attr("data-name"),
            $el.attr("data-title"),
            $el.attr("data-alt"),
            $el.attr("data-item"),
            $el.attr("data-image"),
            $el.attr("data-reward"),
            $el.attr("src"),
            $el.attr("data-src")
        ]
            .filter(Boolean)
            .map(valor =>
                normalizarNombre(valor)
            );

        if (!metadatos.length) {
            return;
        }

        let puntuacion = 0;

        for (
            const meta
            of metadatos
        ) {

            if (
                meta === objetivo
            ) {
                puntuacion = Math.max(
                    puntuacion,
                    100
                );
            }

            if (
                meta.includes(objetivo)
            ) {
                puntuacion = Math.max(
                    puntuacion,
                    90
                );
            }

            if (
                objetivo.includes(meta) &&
                meta.length >= 4
            ) {
                puntuacion = Math.max(
                    puntuacion,
                    80
                );
            }

            if (
                palabras.length
            ) {

                const coincidencias =
                    palabras.filter(
                        palabra =>
                            meta.includes(
                                palabra
                            )
                    ).length;

                if (
                    coincidencias ===
                    palabras.length
                ) {
                    puntuacion = Math.max(
                        puntuacion,
                        75
                    );
                } else if (
                    coincidencias >= 2
                ) {
                    puntuacion = Math.max(
                        puntuacion,
                        60
                    );
                }
            }
        }

        if (
            puntuacion >
            mejorPuntuacion
        ) {

            const imagen =
                extraerImagenDirecta(
                    $,
                    $el
                );

            if (imagen) {

                mejorPuntuacion =
                    puntuacion;

                mejor =
                    imagen;
            }
        }
    });

    return mejor;
}

// ============================================================
// BUSCAR IMAGEN CERCA DEL NOMBRE
// ============================================================

function buscarImagenCercana(
    $,
    elementoNombre,
    nombre
) {

    if (
        !elementoNombre ||
        !elementoNombre.length
    ) {
        return null;
    }

    const objetivo =
        normalizarNombre(
            nombre
        );

    let actual =
        elementoNombre;

    for (
        let nivel = 0;
        nivel < 6;
        nivel++
    ) {

        if (
            !actual ||
            !actual.length
        ) {
            break;
        }

        const imagenExacta =
            buscarImagenPorNombre(
                $,
                actual,
                nombre
            );

        if (imagenExacta) {
            return imagenExacta;
        }

        const imagenDirecta =
            extraerImagenDirecta(
                $,
                actual
            );

        if (
            imagenDirecta &&
            nivel <= 2
        ) {
            return imagenDirecta;
        }

        actual =
            actual.parent();
    }

    return null;
}

// ============================================================
// IMAGEN DE DROP
// ============================================================

function extraerImagenDrop(
    $,
    card,
    nombre,
    elementoNombre = null
) {

    // --------------------------------------------------------
    // 1. Imagen conocida
    // --------------------------------------------------------

    const conocida =
        obtenerImagenConocidaDrop(
            nombre
        );

    if (conocida) {
        return conocida;
    }

    // --------------------------------------------------------
    // 2. Imagen con alt/title/nombre exacto
    // --------------------------------------------------------

    if (card) {

        const porNombre =
            buscarImagenPorNombre(
                $,
                card,
                nombre
            );

        if (porNombre) {
            return porNombre;
        }
    }

    // --------------------------------------------------------
    // 3. Imagen cercana al elemento que contiene el nombre
    // --------------------------------------------------------

    if (elementoNombre) {

        const cercana =
            buscarImagenCercana(
                $,
                elementoNombre,
                nombre
            );

        if (cercana) {
            return cercana;
        }
    }

    // --------------------------------------------------------
    // 4. Buscar en ancestros pequeños
    // --------------------------------------------------------

    let actual =
        elementoNombre ||
        card;

    for (
        let nivel = 0;
        nivel < 5;
        nivel++
    ) {

        if (
            !actual ||
            !actual.length
        ) {
            break;
        }

        const texto =
            limpiarTexto(
                actual.text()
            );

        // Nunca subir a contenedores gigantes.
        if (
            texto.length > 500
        ) {
            break;
        }

        const imagen =
            buscarImagenPorNombre(
                $,
                actual,
                nombre
            );

        if (imagen) {
            return imagen;
        }

        actual =
            actual.parent();
    }

    // --------------------------------------------------------
    // 5. IMPORTANTE:
    // No usamos la primera imagen de toda la card.
    // Eso era lo que provocaba imágenes incorrectas.
    // --------------------------------------------------------

    return null;
}

// ============================================================
// DURACIÓN
// ============================================================

function extraerHoras(
    texto
) {

    texto =
        limpiarTexto(texto);

    if (!texto) {
        return null;
    }

    let match =
        texto.match(
            /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\b/i
        );

    if (match) {
        return Number(
            match[1]
        );
    }

    match =
        texto.match(
            /(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\b/i
        );

    if (match) {
        return (
            Number(match[1]) /
            60
        );
    }

    return null;
}

function formatearDuracion(
    horas
) {

    if (
        horas === null ||
        horas === undefined ||
        Number.isNaN(Number(horas))
    ) {
        return "—";
    }

    horas =
        Number(horas);

    if (horas < 1) {

        const minutos =
            Math.round(
                horas * 60
            );

        return (
            `${minutos} minuto` +
            (
                minutos === 1
                    ? ""
                    : "s"
            )
        );
    }

    if (
        Number.isInteger(horas)
    ) {

        return (
            `${horas} hora` +
            (
                horas === 1
                    ? ""
                    : "s"
            )
        );
    }

    return `${horas} horas`;
}

// ============================================================
// FECHAS
// ============================================================

const MESES_ES = {
    enero: 0,
    febrero: 1,
    marzo: 2,
    abril: 3,
    mayo: 4,
    junio: 5,
    julio: 6,
    agosto: 7,
    septiembre: 8,
    setiembre: 8,
    octubre: 9,
    noviembre: 10,
    diciembre: 11
};

const MESES_EN = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,

    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    sept: 8,
    oct: 9,
    nov: 10,
    dec: 11
};

// ============================================================
// CREAR FECHA CON OFFSET
// ============================================================

function crearFechaConOffset(
    año,
    mes,
    dia,
    hora,
    minuto,
    offsetHoras,
    offsetMinutos
) {

    const signo =
        offsetHoras < 0
            ? -1
            : 1;

    const offsetTotal =
        (
            Math.abs(offsetHoras) *
            60
        ) +
        (
            offsetMinutos || 0
        );

    const offsetFirmado =
        signo *
        offsetTotal;

    const utc =
        Date.UTC(
            año,
            mes,
            dia,
            hora,
            minuto
        ) -
        (
            offsetFirmado *
            60 *
            1000
        );

    const fecha =
        new Date(utc);

    return Number.isNaN(
        fecha.getTime()
    )
        ? null
        : fecha;
}

// ============================================================
// PARSEAR FECHA
// ============================================================

function parsearFechaFacepunch(
    texto
) {

    if (!texto) {
        return null;
    }

    texto =
        limpiarTexto(texto);

    const iso =
        texto.match(
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})/
        );

    if (iso) {

        const fecha =
            new Date(
                iso[0]
            );

        if (
            !Number.isNaN(
                fecha.getTime()
            )
        ) {
            return fecha;
        }
    }

    let match =
        texto.match(
            /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})\s+a\s+las\s+(\d{1,2}):(\d{2})\s+GMT\s*([+-])(\d{1,2})(?::?(\d{2}))?/i
        );

    if (match) {

        const mesNombre =
            match[2]
                .toLowerCase()
                .normalize("NFD")
                .replace(
                    /[\u0300-\u036f]/g,
                    ""
                );

        const mes =
            MESES_ES[
                mesNombre
            ];

        if (
            mes !== undefined
        ) {

            const signo =
                match[6] === "-"
                    ? -1
                    : 1;

            return crearFechaConOffset(
                Number(match[3]),
                mes,
                Number(match[1]),
                Number(match[4]),
                Number(match[5]),
                signo * Number(match[7]),
                Number(match[8] || 0)
            );
        }
    }

    match =
        texto.match(
            /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})(?:\s+at)?\s+(\d{1,2}):(\d{2})\s*(AM|PM)?\s*GMT\s*([+-])(\d{1,2})(?::?(\d{2}))?/i
        );

    if (match) {

        const mes =
            MESES_EN[
                match[1].toLowerCase()
            ];

        if (
            mes !== undefined
        ) {

            let hora =
                Number(match[4]);

            if (
                match[6]
            ) {

                if (
                    /^PM$/i.test(match[6]) &&
                    hora < 12
                ) {
                    hora += 12;
                }

                if (
                    /^AM$/i.test(match[6]) &&
                    hora === 12
                ) {
                    hora = 0;
                }
            }

            const signo =
                match[7] === "-"
                    ? -1
                    : 1;

            return crearFechaConOffset(
                Number(match[3]),
                mes,
                Number(match[2]),
                hora,
                Number(match[5]),
                signo * Number(match[8]),
                Number(match[9] || 0)
            );
        }
    }

    const fecha =
        new Date(texto);

    if (
        !Number.isNaN(
            fecha.getTime()
        )
    ) {
        return fecha;
    }

    return null;
}

// ============================================================
// FECHAS CAMPAÑA
// ============================================================

function extraerFechasCampaña(
    $,
    textoPagina
) {

    let inicio = null;
    let fin = null;

    $(
        "[datetime],[data-start],[data-end],[data-start-date],[data-end-date],[data-start-time],[data-end-time]"
    ).each((_, elemento) => {

        const $el =
            $(elemento);

        const atributos = [
            "datetime",
            "data-start",
            "data-end",
            "data-start-date",
            "data-end-date",
            "data-start-time",
            "data-end-time"
        ];

        for (
            const atributo
            of atributos
        ) {

            const valor =
                $el.attr(
                    atributo
                );

            if (!valor) {
                continue;
            }

            const fecha =
                parsearFechaFacepunch(
                    valor
                );

            if (!fecha) {
                continue;
            }

            if (
                /start/i.test(atributo) &&
                !inicio
            ) {
                inicio = fecha;
            }

            if (
                /end/i.test(atributo) &&
                !fin
            ) {
                fin = fecha;
            }
        }
    });

    const texto =
        limpiarTexto(
            textoPagina
        );

    const patrones = [

        /\d{1,2}\s+de\s+[a-záéíóú]+\s+de\s+\d{4}\s+a\s+las\s+\d{1,2}:\d{2}\s+GMT\s*[+-]\d{1,2}(?::?\d{2})?/gi,

        /[A-Za-z]{3,12}\s+\d{1,2},\s+\d{4}(?:\s+at)?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s*GMT\s*[+-]\d{1,2}(?::?\d{2})?/gi,

        /\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4}(?:\s+at)?\s+\d{1,2}:\d{2}\s*(?:AM|PM)?\s*GMT\s*[+-]\d{1,2}(?::?\d{2})?/gi

    ];

    const fechas = [];

    for (
        const regex
        of patrones
    ) {

        const matches =
            texto.match(regex) ||
            [];

        for (
            const valor
            of matches
        ) {

            const fecha =
                parsearFechaFacepunch(
                    valor
                );

            if (
                fecha &&
                !fechas.some(
                    existente =>
                        existente.getTime() ===
                        fecha.getTime()
                )
            ) {
                fechas.push(fecha);
            }
        }
    }

    fechas.sort(
        (a, b) =>
            a.getTime() -
            b.getTime()
    );

    if (
        !inicio &&
        fechas.length
    ) {
        inicio = fechas[0];
    }

    if (
        !fin &&
        fechas.length >= 2
    ) {
        fin = fechas[1];
    }

    // --------------------------------------------------------
    // Buscar fechas dentro de scripts
    // --------------------------------------------------------

    const scripts =
        $("script")
            .map(
                (_, el) =>
                    $(el).html() || ""
            )
            .get()
            .join("\n");

    if (scripts) {

        const isoRegex =
            /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g;

        const fechasScript =
            (
                scripts.match(
                    isoRegex
                ) || []
            )
                .map(
                    fecha =>
                        new Date(fecha)
                )
                .filter(
                    fecha =>
                        !Number.isNaN(
                            fecha.getTime()
                        )
                )
                .sort(
                    (a, b) =>
                        a.getTime() -
                        b.getTime()
                );

        if (
            !inicio &&
            fechasScript.length
        ) {
            inicio =
                fechasScript[0];
        }

        if (
            !fin &&
            fechasScript.length >= 2
        ) {
            fin =
                fechasScript[1];
        }
    }

    return {
        inicio,
        fin
    };
}

// ============================================================
// INFORMACIÓN CAMPAÑA
// ============================================================

function extraerInformacionCampaña(
    $
) {

    const texto =
        limpiarTexto(
            $("body").text()
        );

    let estado = "";

    const estadoMatch =
        texto.match(
            /\b(Upcoming|Active|Ended)\b/i
        );

    if (estadoMatch) {
        estado =
            estadoMatch[1];
    }

    let titulo = "";
    let nombre = "";

    $("h1,h2,h3,h4,h5,h6,strong,b").each(
        (_, elemento) => {

            if (titulo) {
                return;
            }

            const valor =
                limpiarTexto(
                    $(elemento)
                        .clone()
                        .children()
                        .remove()
                        .end()
                        .text()
                );

            if (
                /^Twitch Drops Round\s+\d+/i.test(
                    valor
                )
            ) {
                titulo = valor;
            }
        }
    );

    $("h1,h2,h3").each(
        (_, elemento) => {

            if (nombre) {
                return;
            }

            const valor =
                limpiarTexto(
                    $(elemento).text()
                );

            if (!valor) {
                return;
            }

            if (
                /Twitch Drops Round/i.test(valor) ||
                /General Drops/i.test(valor) ||
                /Streamer Drops/i.test(valor) ||
                /Upcoming|Active|Ended/i.test(valor)
            ) {
                return;
            }

            if (
                valor.length <= 80
            ) {
                nombre = valor;
            }
        }
    );

    // Fallback específico para campañas como Base Invaders
    if (!nombre) {

        const match =
            texto.match(
                /Twitch Drops Round\s+\d+[^\n]*?\s+(Base Invaders)\b/i
            );

        if (match) {
            nombre =
                limpiarTexto(
                    match[1]
                );
        }
    }

    const fechas =
        extraerFechasCampaña(
            $,
            texto
        );

    return {

        estado,

        titulo,

        nombre,

        fechaInicio:
            fechas.inicio
                ? fechas.inicio.toISOString()
                : null,

        fechaFin:
            fechas.fin
                ? fechas.fin.toISOString()
                : null
    };
}

// ============================================================
// ENCONTRAR CARD
// ============================================================

function encontrarContenedorDrop(
    $,
    elemento
) {

    let actual =
        elemento;

    let mejor =
        elemento;

    for (
        let nivel = 0;
        nivel < 10;
        nivel++
    ) {

        if (
            !actual ||
            !actual.length
        ) {
            break;
        }

        const texto =
            limpiarTexto(
                actual.text()
            );

        if (
            texto.length > 600
        ) {
            break;
        }

        const tieneDuracion =
            /\b\d+(?:\.\d+)?\s*(?:hour|hours|hrs?|h|minute|minutes|mins?|m)\b/i
                .test(texto);

        if (tieneDuracion) {
            mejor = actual;
        }

        actual =
            actual.parent();
    }

    return mejor;
}

// ============================================================
// NOMBRE DESDE CARD
// ============================================================

function extraerNombreDesdeCard(
    $,
    card,
    opciones = {}
) {

    if (
        !card ||
        !card.length
    ) {
        return "";
    }

    const streamer =
        opciones.streamer || "";

    const candidatos = [];

    card.find(
        "[class*='drop-name'],[class*='dropName'],[class*='reward-name'],[class*='rewardName'],[class*='item-name'],[class*='itemName'],[class*='title'],h1,h2,h3,h4,h5,strong,b,a"
    ).each((_, elemento) => {

        const $el =
            $(elemento);

        const texto =
            limpiarTexto(
                $el.text()
            );

        if (!texto) {
            return;
        }

        if (
            texto.length > 80
        ) {
            return;
        }

        if (
            /^(?:loading|claimed|video|twitch|account|connect|login|sign in|log in)$/i.test(
                texto
            )
        ) {
            return;
        }

        if (
            /\b\d+(?:\.\d+)?\s*(?:hour|hours|minute|minutes|h|m)\b/i.test(
                texto
            )
        ) {
            return;
        }

        if (
            streamer &&
            texto.toLowerCase() ===
            streamer.toLowerCase()
        ) {
            return;
        }

        candidatos.push({
            texto,
            elemento: $el
        });
    });

    if (!candidatos.length) {
        return "";
    }

    const prohibidos = [
        /^general drops$/i,
        /^streamer drops$/i,
        /^drops$/i,
        /^twitch drops$/i,
        /^twitch account$/i,
        /^connect account$/i,
        /^connect twitch$/i,
        /^account$/i,
        /^login$/i,
        /^sign in$/i,
        /^log in$/i
    ];

    const valido =
        candidatos.find(
            candidato =>
                !prohibidos.some(
                    regex =>
                        regex.test(
                            candidato.texto
                        )
                )
        );

    return valido
        ? limpiarNombreDrop(
            valido.texto
        )
        : "";
}

// ============================================================
// GENERAL DROPS
// ============================================================

function extraerGeneralDrops(
    $
) {

    const drops = [];

    $(
        "a[href*='twitch.tv/directory/category/rust']"
    ).each((_, elemento) => {

        const $a =
            $(elemento);

        const texto =
            limpiarTexto(
                $a.text()
            );

        const horas =
            extraerHoras(
                texto
            );

        if (
            horas == null
        ) {
            return;
        }

        const card =
            encontrarContenedorDrop(
                $,
                $a
            );

        let nombre =
            limpiarNombreDrop(
                texto.replace(
                    /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b/i,
                    ""
                )
            );

        let elementoNombre =
            $a;

        if (
            !nombre ||
            /^video$/i.test(nombre)
        ) {

            const encontrado =
                extraerNombreDesdeCard(
                    $,
                    card
                );

            nombre =
                encontrado;

            if (encontrado) {

                card.find(
                    "*"
                ).each((_, el) => {

                    const $el =
                        $(el);

                    if (
                        limpiarTexto(
                            $el.text()
                        ) === encontrado
                    ) {
                        elementoNombre =
                            $el;
                    }
                });
            }
        }

        if (!nombre) {
            return;
        }

        if (
            /^(?:video|claimed|twitch|twitch account|twitch drops|connect account)$/i.test(
                nombre
            )
        ) {
            return;
        }

        const duplicado =
            drops.some(
                drop =>
                    normalizarNombre(
                        drop.nombre
                    ) ===
                    normalizarNombre(
                        nombre
                    )
            );

        if (duplicado) {
            return;
        }

        const imagen =
            extraerImagenDrop(
                $,
                card,
                nombre,
                elementoNombre
            );

        drops.push({

            tipo:
                "general",

            nombre,

            horas,

            imagen:
                imagen || null,

            streamers:
                []
        });
    });

    return drops;
}

// ============================================================
// STREAMER DROPS
// ============================================================

function extraerStreamerDrops(
    $
) {

    const drops = [];
    const streamersProcesados =
        new Set();

    const invalidos =
        new Set([
            "twitch",
            "twitchaccount",
            "twitch-account",
            "twitchdrops",
            "twitch-drops",
            "account",
            "login",
            "signin",
            "directory",
            "search",
            "videos",
            "browse",
            "drops",
            "settings",
            "subscriptions"
        ]);

    $(
        "a[href]"
    ).each((_, elemento) => {

        const $a =
            $(elemento);

        const href =
            String(
                $a.attr("href") || ""
            ).trim();

        let url;

        try {
            url =
                new URL(href);
        } catch {
            return;
        }

        if (
            !/^https?:$/i.test(
                url.protocol
            )
        ) {
            return;
        }

        if (
            !/^(?:www\.)?twitch\.tv$/i.test(
                url.hostname
            )
        ) {
            return;
        }

        const partes =
            url.pathname
                .split("/")
                .filter(Boolean);

        if (
            partes.length !== 1
        ) {
            return;
        }

        const login =
            partes[0]
                .toLowerCase()
                .replace(/^@/, "")
                .trim();

        if (
            !login ||
            invalidos.has(login) ||
            streamersProcesados.has(login)
        ) {
            return;
        }

        const streamer =
            limpiarTexto(
                $a.text()
            ) ||
            partes[0];

        if (
            /^(?:twitch|account|connect account|login|sign in|log in)$/i.test(
                streamer
            )
        ) {
            return;
        }

        const card =
            encontrarContenedorDrop(
                $,
                $a
            );

        const textoCard =
            limpiarTexto(
                card.text()
            );

        const horas =
            extraerHoras(
                textoCard
            );

        if (
            horas == null
        ) {
            return;
        }

        let nombre =
            extraerNombreDesdeCard(
                $,
                card,
                {
                    streamer
                }
            );

        if (nombre) {

            nombre =
                nombre
                    .replace(
                        new RegExp(
                            `^${streamer.replace(
                                /[.*+?^${}()|[\]\\]/g,
                                "\\$&"
                            )}\\s+`,
                            "i"
                        ),
                        ""
                    )
                    .trim();
        }

        if (!nombre) {

            const candidatos = [];

            card.find("*").each(
                (_, nodo) => {

                    const texto =
                        limpiarTexto(
                            $(nodo)
                                .clone()
                                .children()
                                .remove()
                                .end()
                                .text()
                        );

                    if (
                        !texto ||
                        texto.length > 80
                    ) {
                        return;
                    }

                    if (
                        texto.toLowerCase() ===
                        login
                    ) {
                        return;
                    }

                    if (
                        texto.toLowerCase() ===
                        streamer.toLowerCase()
                    ) {
                        return;
                    }

                    if (
                        /^(?:twitch|account|connect account|login|sign in|log in|loading)$/i.test(
                            texto
                        )
                    ) {
                        return;
                    }

                    if (
                        /\b\d+(?:\.\d+)?\s*(?:hour|hours|minute|minutes|h|m)\b/i.test(
                            texto
                        )
                    ) {
                        return;
                    }

                    candidatos.push({
                        texto,
                        elemento:
                            $(nodo)
                    });
                }
            );

            if (candidatos.length) {

                nombre =
                    limpiarNombreDrop(
                        candidatos[0].texto
                    );
            }
        }

        if (
            !nombre ||
            normalizarNombre(nombre) ===
                normalizarNombre(login)
        ) {
            return;
        }

        if (
            nombre.length > 80
        ) {
            return;
        }

        const imagen =
            extraerImagenDrop(
                $,
                card,
                nombre,
                $a
            );

        let drop =
            drops.find(
                item =>
                    normalizarNombre(
                        item.nombre
                    ) ===
                    normalizarNombre(
                        nombre
                    )
            );

        if (!drop) {

            drop = {

                tipo:
                    "streamer",

                nombre,

                horas,

                imagen:
                    imagen || null,

                streamers:
                    []
            };

            drops.push(
                drop
            );

        } else if (
            !drop.imagen &&
            imagen
        ) {

            drop.imagen =
                imagen;
        }

        const yaExiste =
            drop.streamers.some(
                streamerActual => {

                    const loginActual =
                        typeof streamerActual ===
                        "string"
                            ? streamerActual
                            : streamerActual.login;

                    return (
                        String(
                            loginActual || ""
                        ).toLowerCase() ===
                        login
                    );
                }
            );

        if (!yaExiste) {

            drop.streamers.push({

                login,

                nombre:
                    streamer,

                online:
                    false
            });
        }

        streamersProcesados.add(
            login
        );
    });

    return drops;
}

// ============================================================
// PARSEAR HTML
// ============================================================

async function parsearHtmlFacepunch(
    html
) {

    if (
        !html ||
        typeof html !== "string"
    ) {
        return null;
    }

    const $ =
        cheerio.load(html);

    const campaña =
        extraerInformacionCampaña(
            $
        );

    const generalDrops =
        extraerGeneralDrops(
            $
        );

    const streamerDrops =
        extraerStreamerDrops(
            $
        );

    console.log(
        `[Twitch Drops] ${generalDrops.length ? "✅" : "⚠️"} General Drops detectados: ${generalDrops.length}`
    );

    console.log(
        `[Twitch Drops] ${streamerDrops.length ? "✅" : "⚠️"} Streamer Drops detectados: ${streamerDrops.length}`
    );

    return {

        $,

        campaña,

        generalDrops,

        streamerDrops
    };
}

// ============================================================
// OBTENER DROPS FACEPUNCH
// ============================================================

async function obtenerDropsFacepunch() {

    let html = null;

    try {

        const response =
            await axios.get(
                FACEPUNCH_DROPS_URL,
                {
                    headers:
                        FACEPUNCH_HEADERS,
                    timeout:
                        30000
                }
            );

        html =
            response.data;

    } catch (error) {

        console.error(
            "[Twitch Drops] ❌ Error Axios:",
            error.response?.status ||
            error.message
        );
    }

    let resultado =
        await parsearHtmlFacepunch(
            html
        );

    if (
        !resultado ||
        (
            resultado.generalDrops.length === 0 &&
            resultado.streamerDrops.length === 0
        )
    ) {

        console.log(
            "[Twitch Drops] ⚠️ Axios no encontró Drops. Usando Puppeteer..."
        );

        const htmlRenderizado =
            await obtenerHtmlFacepunchConPuppeteer();

        if (htmlRenderizado) {

            const resultadoRenderizado =
                await parsearHtmlFacepunch(
                    htmlRenderizado
                );

            if (
                resultadoRenderizado &&
                (
                    resultadoRenderizado
                        .generalDrops.length > 0 ||
                    resultadoRenderizado
                        .streamerDrops.length > 0
                )
            ) {

                resultado =
                    resultadoRenderizado;

                console.log(
                    "[Twitch Drops] ✅ Drops encontrados con Puppeteer."
                );
            }
        }
    }

    if (!resultado) {

        throw new Error(
            "No se pudo obtener la página de Facepunch."
        );
    }

    const campaña =
        resultado.campaña;

    const generalDrops =
        resultado.generalDrops;

    const streamerDrops =
        resultado.streamerDrops;

    const drops = [
        ...generalDrops,
        ...streamerDrops
    ];

    const streamers = [
        ...new Set(
            streamerDrops.flatMap(
                drop =>
                    (
                        drop.streamers ||
                        []
                    )
                        .map(
                            streamer =>
                                typeof streamer ===
                                "string"
                                    ? streamer
                                    : streamer.login
                        )
                        .filter(Boolean)
                )
        )
    ];

    console.log(
        `[Twitch Drops] Campaña: ${
            campaña.titulo ||
            "sin título"
        }`
    );

    console.log(
        `[Twitch Drops] Tema: ${
            campaña.nombre ||
            "sin tema"
        }`
    );

    console.log(
        `[Twitch Drops] Estado: ${
            campaña.estado ||
            "desconocido"
        }`
    );

    console.log(
        `[Twitch Drops] Inicio: ${
            campaña.fechaInicio ||
            "no encontrado"
        }`
    );

    console.log(
        `[Twitch Drops] Final: ${
            campaña.fechaFin ||
            "no encontrado"
        }`
    );

    console.log(
        `[Twitch Drops] General Drops: ${generalDrops.length}`
    );

    for (
        const drop
        of generalDrops
    ) {

        console.log(
            `[Twitch Drops] 📦 ${drop.nombre} | ${formatearDuracion(drop.horas)} | imagen=${drop.imagen ? "SI" : "NO"}`
        );
    }

    console.log(
        `[Twitch Drops] Streamer Drops: ${streamerDrops.length}`
    );

    for (
        const drop
        of streamerDrops
    ) {

        const asociados =
            (
                drop.streamers ||
                []
            )
                .map(
                    streamer =>
                        typeof streamer ===
                        "string"
                            ? streamer
                            : streamer.login
                )
                .join(", ");

        console.log(
            `[Twitch Drops] 🎯 ${drop.nombre} | ${formatearDuracion(drop.horas)} | ${asociados} | imagen=${drop.imagen ? "SI" : "NO"}`
        );
    }

    console.log(
        `[Twitch Drops] Streamers asociados: ${streamers.length}`
    );

    return {

        estado:
            campaña.estado,

        campaignTitle:
            campaña.titulo,

        campaignName:
            campaña.nombre,

        campaignStart:
            campaña.fechaInicio,

        campaignEnd:
            campaña.fechaFin,

        generalDrops,

        streamerDrops,

        drops,

        streamers,

        fechaConsulta:
            new Date()
    };
}

// ============================================================
// TOKEN TWITCH
// ============================================================

async function obtenerTwitchAccessToken() {

    if (
        twitchAccessToken &&
        Date.now() <
            twitchTokenExpira
    ) {
        return twitchAccessToken;
    }

    const clientId =
        process.env.TWITCH_CLIENT_ID;

    const clientSecret =
        process.env.TWITCH_CLIENT_SECRET;

    if (
        !clientId ||
        !clientSecret
    ) {
        throw new Error(
            "Faltan TWITCH_CLIENT_ID o TWITCH_CLIENT_SECRET."
        );
    }

    const response =
        await axios.post(
            "https://id.twitch.tv/oauth2/token",
            null,
            {
                params: {

                    client_id:
                        clientId,

                    client_secret:
                        clientSecret,

                    grant_type:
                        "client_credentials"
                },

                timeout:
                    15000
            }
        );

    twitchAccessToken =
        response.data.access_token;

    twitchTokenExpira =
        Date.now() +
        (
            Number(
                response.data.expires_in ||
                3600
            ) - 300
        ) *
        1000;

    return twitchAccessToken;
}

// ============================================================
// STREAMERS ONLINE EN RUST
// ============================================================

async function obtenerStreamersOnlineRust(
    logins
) {

    const resultado = {};

    const unicos =
        [
            ...new Set(
                (
                    logins ||
                    []
                )
                    .map(
                        login =>
                            typeof login ===
                            "string"
                                ? login
                                : login.login
                    )
                    .filter(Boolean)
                    .map(
                        login =>
                            String(login)
                                .toLowerCase()
                                .replace(/^@/, "")
                                .trim()
                    )
                    .filter(Boolean)
            )
        ];

    if (!unicos.length) {
        return resultado;
    }

    try {

        const token =
            await obtenerTwitchAccessToken();

        const clientId =
            process.env.TWITCH_CLIENT_ID;

        if (!clientId) {
            throw new Error(
                "Falta TWITCH_CLIENT_ID."
            );
        }

        const headers = {

            "Client-ID":
                clientId,

            "Authorization":
                `Bearer ${token}`,

            "Accept":
                "application/json"
        };

        for (
            let i = 0;
            i < unicos.length;
            i += 100
        ) {

            const lote =
                unicos.slice(
                    i,
                    i + 100
                );

            const query =
                new URLSearchParams();

            query.append(
                "game_id",
                TWITCH_GAME_ID_RUST
            );

            for (
                const login
                of lote
            ) {

                query.append(
                    "user_login",
                    login
                );
            }

            const response =
                await axios.get(
                    `${TWITCH_API}/streams?${query.toString()}`,
                    {
                        headers,
                        timeout:
                            15000
                    }
                );

            for (
                const stream
                of (
                    response.data?.data ||
                    []
                )
            ) {

                const login =
                    String(
                        stream.user_login ||
                        ""
                    ).toLowerCase();

                if (!login) {
                    continue;
                }

                if (
                    String(
                        stream.game_id
                    ) !==
                    TWITCH_GAME_ID_RUST
                ) {
                    continue;
                }

                resultado[login] = {

                    online:
                        true,

                    userId:
                        stream.user_id,

                    displayName:
                        stream.user_name,

                    title:
                        stream.title,

                    viewers:
                        stream.viewer_count ||
                        0,

                    startedAt:
                        stream.started_at
                };
            }
        }

    } catch (error) {

        console.error(
            "[Twitch Drops] Error consultando Twitch:",
            error.response?.data ||
            error.message
        );
    }

    return resultado;
}

// ============================================================
// EMBED CAMPAÑA
// ============================================================

function crearEmbedCampaña(
    datos
) {

    datos =
        datos || {};

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎁 RUST TWITCH DROPS"
            )
            .setDescription(
                [
                    `📢 **${
                        datos.campaignTitle ||
                        "Twitch Drops"
                    }**`,
                    "",
                    `🎨 **${
                        datos.campaignName ||
                        "Campaña actual"
                    }**`
                ].join("\n")
            )
            .setTimestamp();

    if (datos.estado) {

        let estadoTexto =
            datos.estado;

        if (
            /^upcoming$/i.test(
                datos.estado
            )
        ) {
            estadoTexto =
                "🟡 Próximamente";
        }

        if (
            /^active$/i.test(
                datos.estado
            )
        ) {
            estadoTexto =
                "🟢 Drops activos";
        }

        if (
            /^ended$/i.test(
                datos.estado
            )
        ) {
            estadoTexto =
                "🔴 Finalizados";
        }

        embed.addFields({
            name:
                "📌 Estado",
            value:
                estadoTexto,
            inline:
                true
        });
    }

    if (
        datos.campaignStart
    ) {

        const timestamp =
            Math.floor(
                new Date(
                    datos.campaignStart
                ).getTime() /
                1000
            );

        if (
            Number.isFinite(timestamp)
        ) {

            embed.addFields({
                name:
                    "⏳ EMPIEZA EN",
                value:
                    `<t:${timestamp}:R>`,
                inline:
                    false
            });

            embed.addFields({
                name:
                    "📅 Inicio",
                value:
                    `<t:${timestamp}:F>`,
                inline:
                    true
            });
        }
    }

    if (
        datos.campaignEnd
    ) {

        const timestamp =
            Math.floor(
                new Date(
                    datos.campaignEnd
                ).getTime() /
                1000
            );

        if (
            Number.isFinite(timestamp)
        ) {

            embed.addFields({
                name:
                    "📅 Finaliza",
                value:
                    `<t:${timestamp}:F>`,
                inline:
                    true
            });
        }
    }

    embed.setFooter({
        text:
            "RustLogix • Twitch Drops"
    });

    return embed;
}

// ============================================================
// EMBED DROP
// ============================================================

function crearEmbedDrop(
    drop,
    onlineMap = {}
) {

    if (!drop) {
        throw new Error(
            "No se recibió información del Drop."
        );
    }

    const esStreamer =
        drop.tipo ===
        "streamer";

    const embed =
        new EmbedBuilder()
            .setTitle(
                esStreamer
                    ? `🎯 ${drop.nombre}`
                    : `📦 ${drop.nombre}`
            )
            .addFields({
                name:
                    "⏱️ Tiempo",
                value:
                    formatearDuracion(
                        drop.horas
                    ),
                inline:
                    true
            });

    if (!esStreamer) {

        embed.addFields({
            name:
                "📺 Disponible en",
            value:
                "Todos los streams de Rust con Drops habilitados.",
            inline:
                false
        });

    } else {

        const streamers =
            Array.isArray(
                drop.streamers
            )
                ? drop.streamers
                : [];

        const lineas =
            streamers
                .map(
                    streamer => {

                        const login =
                            typeof streamer ===
                            "string"
                                ? streamer
                                : streamer.login;

                        const nombre =
                            typeof streamer ===
                            "string"
                                ? streamer
                                : (
                                    streamer.nombre ||
                                    streamer.login
                                );

                        if (!login) {
                            return null;
                        }

                        const info =
                            onlineMap[
                                String(
                                    login
                                ).toLowerCase()
                            ];

                        const online =
                            info?.online ===
                            true;

                        return (
                            `${
                                online
                                    ? "🟢"
                                    : "⚫"
                            } [${nombre}](https://twitch.tv/${encodeURIComponent(login)})`
                        );
                    }
                )
                .filter(Boolean);

        embed.addFields({
            name:
                "📺 Streamer asociado",
            value:
                lineas.length
                    ? lineas.join("\n")
                    : "Sin streamer disponible.",
            inline:
                false
        });
    }

    if (
        drop.imagen
    ) {
        embed.setImage(
            drop.imagen
        );
    }

    embed.setFooter({
        text:
            "RustLogix • Twitch Drops"
    });

    return embed;
}

// ============================================================
// CAMPAIGN KEY
// ============================================================

function crearCampaignKey(
    datos
) {

    const drops =
        (
            datos?.drops ||
            []
        )
            .map(drop => {

                const streamers =
                    (
                        drop.streamers ||
                        []
                    )
                        .map(
                            streamer =>
                                typeof streamer ===
                                "string"
                                    ? streamer
                                    : streamer.login
                        )
                        .filter(Boolean)
                        .sort()
                        .join(",");

                return [
                    drop.tipo,
                    drop.nombre,
                    drop.horas,
                    streamers
                ].join(":");
            })
            .sort()
            .join("|");

    return [
        datos?.campaignTitle || "",
        datos?.campaignName || "",
        datos?.campaignStart || "",
        datos?.campaignEnd || "",
        drops
    ].join("||");
}

// ============================================================
// NORMALIZAR DROP
// ============================================================

function normalizarDropGuardado(
    drop
) {

    drop =
        drop || {};

    return {

        tipo:
            drop.tipo ||
            "general",

        nombre:
            drop.nombre ||
            "Drop",

        horas:
            Number(
                drop.horas ||
                0
            ),

        imagen:
            drop.imagen ||
            null,

        streamers:
            Array.isArray(
                drop.streamers
            )
                ? drop.streamers.map(
                    streamer => {

                        if (
                            typeof streamer ===
                            "string"
                        ) {

                            return {

                                login:
                                    streamer.toLowerCase(),

                                nombre:
                                    streamer,

                                online:
                                    false
                            };
                        }

                        return {

                            login:
                                streamer.login ||
                                "",

                            nombre:
                                streamer.nombre ||
                                streamer.login ||
                                "",

                            online:
                                streamer.online ===
                                true
                        };
                    }
                )
                : []
    };
}

// ============================================================
// DATOS MONGOOSE
// ============================================================

function convertirDatosAGuardado(
    datos,
    onlineMap = {}
) {

    return (
        datos?.drops ||
        []
    )
        .map(drop => {

            const normalizado =
                normalizarDropGuardado(
                    drop
                );

            if (
                normalizado.tipo ===
                "streamer"
            ) {

                normalizado.streamers =
                    normalizado.streamers.map(
                        streamer => {

                            const info =
                                onlineMap[
                                    String(
                                        streamer.login ||
                                        ""
                                    ).toLowerCase()
                                ];

                            return {

                                ...streamer,

                                online:
                                    info?.online ===
                                    true
                            };
                        }
                    );
            }

            return normalizado;
        });
}

// ============================================================
// GRUPOS DE MENSAJES
// ============================================================

function crearGruposMensajesDrops(
    datos,
    onlineMap = {}
) {

    const mensajes = [];

    mensajes.push({

        tipo:
            "header",

        embeds: [
            crearEmbedCampaña(
                datos
            )
        ]
    });

    for (
        const drop
        of (
            datos?.generalDrops ||
            []
        )
    ) {

        mensajes.push({

            tipo:
                "general",

            embeds: [
                crearEmbedDrop(
                    drop,
                    onlineMap
                )
            ]
        });
    }

    for (
        const drop
        of (
            datos?.streamerDrops ||
            []
        )
    ) {

        mensajes.push({

            tipo:
                "streamer",

            embeds: [
                crearEmbedDrop(
                    drop,
                    onlineMap
                )
            ]
        });
    }

    return mensajes;
}

// ============================================================
// PUBLICAR RUST DROPS
// ============================================================

async function publicarRustDrops(
    primerParametro,
    datos = null,
    onlineMap = {}
) {

    try {

        let interaction = null;
        let channel = null;

        if (
            primerParametro &&
            primerParametro.channel &&
            primerParametro.options
        ) {

            interaction =
                primerParametro;

            channel =
                interaction.channel;

            if (!datos) {
                datos =
                    await obtenerDropsFacepunch();
            }

        } else {

            channel =
                primerParametro;
        }

        if (!channel) {
            throw new Error(
                "No se encontró el canal."
            );
        }

        if (!datos) {
            datos =
                await obtenerDropsFacepunch();
        }

        if (
            !datos ||
            !Array.isArray(datos.drops) ||
            !datos.drops.length
        ) {

            throw new Error(
                "Facepunch no devolvió Drops de Rust."
            );
        }

        if (
            !onlineMap ||
            typeof onlineMap !== "object"
        ) {
            onlineMap = {};
        }

        if (
            !Object.keys(onlineMap).length &&
            datos.streamers?.length
        ) {

            onlineMap =
                await obtenerStreamersOnlineRust(
                    datos.streamers
                );
        }

        const grupos =
            crearGruposMensajesDrops(
                datos,
                onlineMap
            );

        const mensajesPublicados = [];

        for (
            const grupo
            of grupos
        ) {

            if (
                !grupo?.embeds?.length
            ) {
                continue;
            }

            const mensaje =
                await channel.send({
                    embeds:
                        grupo.embeds
                });

            mensajesPublicados.push({

                channelId:
                    channel.id,

                messageId:
                    mensaje.id,

                tipo:
                    grupo.tipo
            });
        }

        return {

            ok:
                true,

            cantidadDrops:
                datos.drops.length,

            cantidadMensajes:
                mensajesPublicados.length,

            mensajes:
                mensajesPublicados,

            datos,

            onlineMap
        };

    } catch (error) {

        console.error(
            "❌ Error publicando Rust Drops de Twitch:",
            error
        );

        throw error;
    }
}

// ============================================================
// ACTUALIZAR STREAMERS
// ============================================================

function actualizarEstadosStreamer(
    drops,
    onlineMap
) {

    let cambio = false;

    for (
        const drop
        of drops
    ) {

        if (
            drop.tipo !==
            "streamer"
        ) {
            continue;
        }

        if (
            !Array.isArray(
                drop.streamers
            )
        ) {
            continue;
        }

        for (
            const streamer
            of drop.streamers
        ) {

            if (
                typeof streamer ===
                "string"
            ) {
                continue;
            }

            const login =
                String(
                    streamer.login ||
                    ""
                ).toLowerCase();

            if (!login) {
                continue;
            }

            const online =
                onlineMap[
                    login
                ]?.online === true;

            if (
                streamer.online !==
                online
            ) {

                streamer.online =
                    online;

                cambio = true;
            }
        }
    }

    return cambio;
}

// ============================================================
// EDITAR MONITOR
// ============================================================

async function editarMensajesMonitor(
    client,
    monitor,
    datos,
    onlineMap
) {

    if (
        !Array.isArray(
            monitor.mensajes
        )
    ) {
        return false;
    }

    const drops =
        Array.isArray(
            monitor.drops
        )
            ? monitor.drops.map(
                normalizarDropGuardado
            )
            : [];

    const embeds = [
        crearEmbedCampaña(
            datos
        )
    ];

    for (
        const drop
        of drops
    ) {

        embeds.push(
            crearEmbedDrop(
                drop,
                onlineMap
            )
        );
    }

    let cambio = false;

    for (
        let i = 0;
        i < monitor.mensajes.length;
        i++
    ) {

        const registro =
            monitor.mensajes[i];

        if (
            !registro?.channelId ||
            !registro?.messageId
        ) {
            continue;
        }

        try {

            const channel =
                await client.channels.fetch(
                    registro.channelId
                );

            if (!channel) {
                continue;
            }

            const mensaje =
                await channel.messages.fetch(
                    registro.messageId
                );

            if (
                !mensaje ||
                !embeds[i]
            ) {
                continue;
            }

            await mensaje.edit({
                embeds: [
                    embeds[i]
                ]
            });

            cambio = true;

        } catch (error) {

            console.error(
                `[Twitch Drops] Error editando ${registro.messageId}:`,
                error.message
            );
        }
    }

    return cambio;
}

// ============================================================
// REVISIÓN AUTOMÁTICA
// ============================================================

async function revisarDropsAutomaticos(
    client
) {

    if (revisando) {
        return;
    }

    revisando = true;

    try {

        const monitores =
            await RustDropsMonitor.find({
                activo:
                    true
            });

        if (
            !monitores.length
        ) {
            return;
        }

        const datos =
            await obtenerDropsFacepunch();

        if (
            !datos?.drops?.length
        ) {

            console.log(
                "[Twitch Drops] No se encontraron Drops."
            );

            return;
        }

        const onlineMap =
            await obtenerStreamersOnlineRust(
                datos.streamers ||
                []
            );

        const campaignKey =
            crearCampaignKey(
                datos
            );

        for (
            const monitor
            of monitores
        ) {

            try {

                const expectedMessages =
                    1 +
                    datos.drops.length;

                const mensajesActuales =
                    Array.isArray(
                        monitor.mensajes
                    )
                        ? monitor.mensajes.length
                        : 0;

                const campaignChanged =
                    monitor.campaignKey !==
                    campaignKey;

                const formatoAntiguo =
                    mensajesActuales !==
                    expectedMessages;

                if (
                    campaignChanged ||
                    formatoAntiguo
                ) {

                    const channel =
                        await client.channels.fetch(
                            monitor.channelId
                        );

                    if (!channel) {
                        continue;
                    }

                    const resultado =
                        await publicarRustDrops(
                            channel,
                            datos,
                            onlineMap
                        );

                    monitor.drops =
                        convertirDatosAGuardado(
                            datos,
                            onlineMap
                        );

                    monitor.mensajes =
                        resultado.mensajes;

                    monitor.campaignKey =
                        campaignKey;

                    await monitor.save();

                    continue;
                }

                const dropsGuardados =
                    Array.isArray(
                        monitor.drops
                    )
                        ? monitor.drops.map(
                            normalizarDropGuardado
                        )
                        : [];

                const cambioStreamer =
                    actualizarEstadosStreamer(
                        dropsGuardados,
                        onlineMap
                    );

                if (
                    cambioStreamer
                ) {

                    monitor.drops =
                        dropsGuardados;

                    await monitor.save();

                    const datosEdicion = {

                        ...datos,

                        drops:
                            dropsGuardados,

                        generalDrops:
                            dropsGuardados.filter(
                                drop =>
                                    drop.tipo ===
                                    "general"
                            ),

                        streamerDrops:
                            dropsGuardados.filter(
                                drop =>
                                    drop.tipo ===
                                    "streamer"
                            )
                    };

                    await editarMensajesMonitor(
                        client,
                        monitor,
                        datosEdicion,
                        onlineMap
                    );
                }

            } catch (error) {

                console.error(
                    `[Twitch Drops] ❌ Error monitor ${monitor._id}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "[Twitch Drops] ❌ Error revisión automática:",
            error.response?.data ||
            error.message
        );

    } finally {

        revisando = false;
    }
}

// ============================================================
// INICIAR SERVICIO
// ============================================================

function iniciarDropsAutomaticos(
    client
) {

    if (intervaloAutomatico) {

        console.log(
            "[Twitch Drops] El servicio automático ya está iniciado."
        );

        return;
    }

    console.log(
        "[Twitch Drops] Servicio automático iniciado."
    );

    setTimeout(
        () => {

            revisarDropsAutomaticos(
                client
            ).catch(error => {

                console.error(
                    "[Twitch Drops] Error revisión inicial:",
                    error.message
                );

            });

        },
        5000
    );

    intervaloAutomatico =
        setInterval(
            () => {

                revisarDropsAutomaticos(
                    client
                ).catch(error => {

                    console.error(
                        "[Twitch Drops] Error automático:",
                        error.message
                    );

                });

            },
            INTERVALO_DROPS
        );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {

    obtenerDropsFacepunch,

    obtenerStreamersOnlineRust,

    crearEmbedDrop,

    crearEmbedCampaña,

    crearGruposMensajesDrops,

    publicarRustDrops,

    revisarDropsAutomaticos,

    iniciarDropsAutomaticos

};