const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const STEAM_LIMITED_URL =
    "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited&l=english";

const STEAM_AJAX_URL =
    "https://store.steampowered.com/itemstore/252490/ajaxgetitemdefs";

const CHECK_INTERVAL =
    10 * 60 * 1000;

const REQUEST_DELAY =
    250;

const REQUEST_TIMEOUT =
    30000;

// =====================================================
// ESTADO
// =====================================================

let navegadorPropio = null;
let comprobacionEnCurso = false;

// =====================================================
// UTILIDADES
// =====================================================

function sleep(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

function normalizarUrlImagen(url) {

    if (!url) {
        return null;
    }

    let resultado = String(url).trim();

    resultado = resultado
        .replace(/^url\(["']?/i, "")
        .replace(/["']?\)$/i, "")
        .trim();

    if (
        resultado.startsWith("//")
    ) {
        resultado = "https:" + resultado;
    }

    if (
        resultado.startsWith("/")
    ) {
        resultado =
            "https://store.steampowered.com" +
            resultado;
    }

    if (
        !/^https?:\/\//i.test(resultado)
    ) {
        return null;
    }

    return resultado;
}

// =====================================================
// BUSCAR CHROME
// =====================================================

function buscarChromeRecursivo(directorio) {

    try {

        if (
            !directorio ||
            !fs.existsSync(directorio)
        ) {
            return null;
        }

        const entradas =
            fs.readdirSync(
                directorio,
                {
                    withFileTypes: true
                }
            );

        for (
            const entrada of entradas
        ) {

            const ruta =
                path.join(
                    directorio,
                    entrada.name
                );

            if (
                entrada.isFile() &&
                (
                    entrada.name === "chrome" ||
                    entrada.name === "chrome.exe"
                )
            ) {
                return ruta;
            }

            if (
                entrada.isDirectory()
            ) {

                const encontrado =
                    buscarChromeRecursivo(
                        ruta
                    );

                if (encontrado) {
                    return encontrado;
                }
            }
        }

    } catch (error) {
        return null;
    }

    return null;
}

// =====================================================
// OBTENER NAVEGADOR
// =====================================================

async function obtenerNavegador() {

    if (
        navegadorPropio &&
        navegadorPropio.isConnected()
    ) {
        return navegadorPropio;
    }

    // -------------------------------------------------
    // INTENTAR CHROME EXISTENTE EN 9222
    // -------------------------------------------------

    try {

        const puppeteer =
            require("puppeteer-core");

        const browser =
            await puppeteer.connect({
                browserURL:
                    "http://127.0.0.1:9222",
                defaultViewport: null
            });

        console.log(
            "[RUST STORE] Chrome existente conectado en 9222."
        );

        return browser;

    } catch (error) {

        console.log(
            "[RUST STORE] Chrome en 9222 no disponible."
        );
    }

    // -------------------------------------------------
    // BUSCAR CHROME INSTALADO POR PUPPETEER
    // -------------------------------------------------

    const posiblesDirectorios = [
        process.env.PUPPETEER_CACHE_DIR,
        path.join(
            process.cwd(),
            ".puppeteer-cache"
        ),
        path.join(
            process.cwd(),
            "node_modules",
            "puppeteer",
            ".local-chromium"
        )
    ].filter(Boolean);

    let chromePath = null;

    for (
        const directorio
        of posiblesDirectorios
    ) {

        chromePath =
            buscarChromeRecursivo(
                directorio
            );

        if (chromePath) {
            break;
        }
    }

    // -------------------------------------------------
    // RUTAS COMUNES
    // -------------------------------------------------

    if (!chromePath) {

        const rutasComunes = [

            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",

            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"

        ];

        for (
            const ruta
            of rutasComunes
        ) {

            if (
                fs.existsSync(ruta)
            ) {

                chromePath = ruta;
                break;
            }
        }
    }

    if (!chromePath) {

        throw new Error(
            "No se encontró Chrome."
        );
    }

    console.log(
        "[RUST STORE] Chrome encontrado en:",
        chromePath
    );

    const puppeteer =
        require("puppeteer-core");

    navegadorPropio =
        await puppeteer.launch({

            executablePath:
                chromePath,

            headless: true,

            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-blink-features=AutomationControlled"
            ],

            defaultViewport: {
                width: 1400,
                height: 1000
            }
        });

    console.log(
        "[RUST STORE] Navegador propio iniciado."
    );

    return navegadorPropio;
}

// =====================================================
// EXTRAER IMAGEN DE UN ELEMENTO
// =====================================================

function extraerUrlDesdeBackground(valor) {

    if (!valor) {
        return null;
    }

    const texto =
        String(valor);

    const coincidencias =
        texto.match(
            /url\(\s*["']?([^"')]+)["']?\s*\)/gi
        );

    if (
        !coincidencias ||
        !coincidencias.length
    ) {
        return null;
    }

    for (
        const coincidencia
        of coincidencias
    ) {

        const limpio =
            coincidencia
                .replace(
                    /^url\(\s*["']?/i,
                    ""
                )
                .replace(
                    /["']?\s*\)$/i,
                    ""
                )
                .trim();

        const url =
            normalizarUrlImagen(
                limpio
            );

        if (url) {
            return url;
        }
    }

    return null;
}

// =====================================================
// EXTRAER ITEMS DESDE PÁGINA
// =====================================================

async function extraerItemsDesdePagina(
    page
) {

    return await page.evaluate(() => {

        function normalizarUrl(url) {

            if (!url) {
                return null;
            }

            let resultado =
                String(url).trim();

            resultado =
                resultado
                    .replace(
                        /^url\(\s*["']?/i,
                        ""
                    )
                    .replace(
                        /["']?\s*\)$/i,
                        ""
                    )
                    .trim();

            if (
                resultado.startsWith("//")
            ) {
                resultado =
                    "https:" +
                    resultado;
            }

            if (
                resultado.startsWith("/")
            ) {
                resultado =
                    "https://store.steampowered.com" +
                    resultado;
            }

            if (
                !/^https?:\/\//i.test(
                    resultado
                )
            ) {
                return null;
            }

            return resultado;
        }

        function extraerBackground(
            valor
        ) {

            if (!valor) {
                return null;
            }

            const coincidencias =
                String(valor).match(
                    /url\(\s*["']?([^"')]+)["']?\s*\)/gi
                );

            if (
                !coincidencias
            ) {
                return null;
            }

            for (
                const coincidencia
                of coincidencias
            ) {

                const limpio =
                    coincidencia
                        .replace(
                            /^url\(\s*["']?/i,
                            ""
                        )
                        .replace(
                            /["']?\s*\)$/i,
                            ""
                        )
                        .trim();

                const url =
                    normalizarUrl(
                        limpio
                    );

                if (url) {
                    return url;
                }
            }

            return null;
        }

        function buscarImagen(
            elemento
        ) {

            if (!elemento) {
                return null;
            }

            // -----------------------------------------
            // 1. IMG
            // -----------------------------------------

            const imagenes =
                elemento.querySelectorAll
                    ? elemento.querySelectorAll(
                        "img"
                    )
                    : [];

            for (
                const img
                of imagenes
            ) {

                const atributos = [
                    "src",
                    "data-src",
                    "data-lazy-src",
                    "data-original",
                    "data-image",
                    "data-image-url",
                    "data-background-image",
                    "data-bg",
                    "data-url"
                ];

                for (
                    const atributo
                    of atributos
                ) {

                    const valor =
                        img.getAttribute(
                            atributo
                        );

                    const url =
                        normalizarUrl(
                            valor
                        );

                    if (url) {
                        return url;
                    }
                }

                const srcset =
                    img.getAttribute(
                        "srcset"
                    );

                if (srcset) {

                    const partes =
                        srcset.split(",");

                    for (
                        const parte
                        of partes
                    ) {

                        const url =
                            normalizarUrl(
                                parte.trim()
                                    .split(/\s+/)[0]
                            );

                        if (url) {
                            return url;
                        }
                    }
                }

                const style =
                    img.getAttribute(
                        "style"
                    );

                const styleUrl =
                    extraerBackground(
                        style
                    );

                if (styleUrl) {
                    return styleUrl;
                }
            }

            // -----------------------------------------
            // 2. ELEMENTO Y DESCENDIENTES
            //    CON BACKGROUND-IMAGE
            // -----------------------------------------

            const candidatos = [
                elemento,
                ...(elemento.querySelectorAll
                    ? elemento.querySelectorAll("*")
                    : [])
            ];

            for (
                const candidato
                of candidatos
            ) {

                const style =
                    candidato.getAttribute
                        ? candidato.getAttribute(
                            "style"
                        )
                        : null;

                const styleUrl =
                    extraerBackground(
                        style
                    );

                if (styleUrl) {
                    return styleUrl;
                }

                try {

                    const computed =
                        window.getComputedStyle(
                            candidato
                        );

                    const background =
                        computed.backgroundImage;

                    const backgroundUrl =
                        extraerBackground(
                            background
                        );

                    if (backgroundUrl) {
                        return backgroundUrl;
                    }

                } catch (error) {}
            }

            // -----------------------------------------
            // 3. ATRIBUTOS DATA-* GENERALES
            // -----------------------------------------

            for (
                const candidato
                of candidatos
            ) {

                if (
                    !candidato.attributes
                ) {
                    continue;
                }

                for (
                    const atributo
                    of Array.from(
                        candidato.attributes
                    )
                ) {

                    const nombre =
                        atributo.name
                            .toLowerCase();

                    if (
                        nombre.includes(
                            "image"
                        ) ||
                        nombre.includes(
                            "background"
                        ) ||
                        nombre.includes(
                            "thumbnail"
                        ) ||
                        nombre.includes(
                            "picture"
                        )
                    ) {

                        const url =
                            normalizarUrl(
                                atributo.value
                            );

                        if (url) {
                            return url;
                        }

                        const bgUrl =
                            extraerBackground(
                                atributo.value
                            );

                        if (bgUrl) {
                            return bgUrl;
                        }
                    }
                }
            }

            return null;
        }

        // =================================================
        // BUSCAR TODOS LOS LINKS DE DETALLE
        // =================================================

        const links =
            Array.from(
                document.querySelectorAll(
                    'a[href*="/itemstore/252490/detail/"]'
                )
            );

        const resultados = [];

        const vistos =
            new Set();

        for (
            const link
            of links
        ) {

            const href =
                link.href || "";

            const coincidencia =
                href.match(
                    /\/detail\/(\d+)/
                );

            if (
                !coincidencia
            ) {
                continue;
            }

            const id =
                coincidencia[1];

            if (
                vistos.has(id)
            ) {
                continue;
            }

            vistos.add(id);

            // -----------------------------------------
            // NOMBRE
            // -----------------------------------------

            let nombre =
                (
                    link.innerText ||
                    link.textContent ||
                    ""
                )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            // -----------------------------------------
            // CONTENEDOR
            // -----------------------------------------

            let contenedor =
                link;

            let mejorContenedor =
                link;

            for (
                let nivel = 0;
                nivel < 6 &&
                contenedor;
                nivel++
            ) {

                contenedor =
                    contenedor.parentElement;

                if (!contenedor) {
                    break;
                }

                const texto =
                    (
                        contenedor.innerText ||
                        ""
                    )
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();

                if (
                    texto.length >=
                    nombre.length
                ) {
                    mejorContenedor =
                        contenedor;
                }

                if (
                    texto.includes("$")
                ) {
                    mejorContenedor =
                        contenedor;
                    break;
                }
            }

            contenedor =
                mejorContenedor;

            // -----------------------------------------
            // PRECIO
            // -----------------------------------------

            const textoContenedor =
                (
                    contenedor.innerText ||
                    ""
                )
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            const coincidenciaPrecio =
                textoContenedor.match(
                    /\$\s*\d+(?:[.,]\d{1,2})?/
                );

            const precio =
                coincidenciaPrecio
                    ? coincidenciaPrecio[0]
                        .replace(
                            /\s+/g,
                            ""
                        )
                    : null;

            // -----------------------------------------
            // IMAGEN
            // -----------------------------------------

            let imagen =
                buscarImagen(
                    contenedor
                );

            // -----------------------------------------
            // SI NO ENCUENTRA, BUSCAR EN PADRES
            // -----------------------------------------

            if (!imagen) {

                let padre =
                    contenedor.parentElement;

                for (
                    let nivel = 0;
                    nivel < 4 &&
                    padre;
                    nivel++
                ) {

                    imagen =
                        buscarImagen(
                            padre
                        );

                    if (imagen) {
                        break;
                    }

                    padre =
                        padre.parentElement;
                }
            }

            resultados.push({
                id,
                nombre,
                precio,
                imagen,
                url: href
            });
        }

        return resultados;
    });
}

// =====================================================
// OBTENER ITEMS LIMITED CON CHROME
// =====================================================

async function obtenerItemsLimitedConChrome() {

    console.log(
        "[RUST STORE] Abriendo Steam Limited con Chrome..."
    );

    const browser =
        await obtenerNavegador();

    let page = null;

    try {

        page =
            await browser.newPage();

        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/131.0.0.0 Safari/537.36"
        );

        await page.setViewport({
            width: 1400,
            height: 1000
        });

        console.log(
            "[RUST STORE] Cargando página Limited..."
        );

        await page.goto(
            STEAM_LIMITED_URL,
            {
                waitUntil:
                    "domcontentloaded",
                timeout:
                    REQUEST_TIMEOUT
            }
        );

        await sleep(2500);

        const todos =
            new Map();

        let pagina = 1;

        while (true) {

            await sleep(700);

            const items =
                await extraerItemsDesdePagina(
                    page
                );

            console.log(
                `[RUST STORE] Página ${pagina}: ${items.length} artículos detectados.`
            );

            for (
                const item
                of items
            ) {

                if (
                    !todos.has(item.id)
                ) {
                    todos.set(
                        item.id,
                        item
                    );
                }
            }

            console.log(
                `[RUST STORE] Total acumulado: ${todos.size}`
            );

            // -----------------------------------------
            // BUSCAR BOTÓN SIGUIENTE
            // -----------------------------------------

            const siguiente =
                await page.evaluate(() => {

                    const botones =
                        Array.from(
                            document.querySelectorAll(
                                "button, a, div"
                            )
                        );

                    const candidatos =
                        botones.filter(
                            elemento => {

                                const texto =
                                    (
                                        elemento.innerText ||
                                        elemento.textContent ||
                                        ""
                                    )
                                        .trim()
                                        .toLowerCase();

                                const aria =
                                    (
                                        elemento.getAttribute(
                                            "aria-label"
                                        ) || ""
                                    )
                                        .toLowerCase();

                                const title =
                                    (
                                        elemento.getAttribute(
                                            "title"
                                        ) || ""
                                    )
                                        .toLowerCase();

                                const clase =
                                    (
                                        elemento.className ||
                                        ""
                                    )
                                        .toString()
                                        .toLowerCase();

                                const esSiguiente =
                                    texto === ">" ||
                                    texto === "›" ||
                                    texto.includes(
                                        "next"
                                    ) ||
                                    texto.includes(
                                        "siguiente"
                                    ) ||
                                    aria.includes(
                                        "next"
                                    ) ||
                                    aria.includes(
                                        "siguiente"
                                    ) ||
                                    title.includes(
                                        "next"
                                    ) ||
                                    title.includes(
                                        "siguiente"
                                    ) ||
                                    clase.includes(
                                        "next"
                                    );

                                if (!esSiguiente) {
                                    return false;
                                }

                                const rect =
                                    elemento.getBoundingClientRect();

                                return (
                                    rect.width > 0 &&
                                    rect.height > 0
                                );
                            }
                        );

                    for (
                        const elemento
                        of candidatos
                    ) {

                        const deshabilitado =
                            elemento.disabled ||
                            elemento.getAttribute(
                                "aria-disabled"
                            ) === "true" ||
                            elemento.classList.contains(
                                "disabled"
                            );

                        if (
                            !deshabilitado
                        ) {
                            return true;
                        }
                    }

                    return false;
                });

            if (!siguiente) {

                console.log(
                    "[RUST STORE] No se encontró botón de siguiente."
                );

                break;
            }

            console.log(
                `[RUST STORE] Botón siguiente detectado. Avanzando desde página ${pagina}...`
            );

            const cantidadAntes =
                todos.size;

            await page.evaluate(() => {

                const botones =
                    Array.from(
                        document.querySelectorAll(
                            "button, a, div"
                        )
                    );

                for (
                    const elemento
                    of botones
                ) {

                    const texto =
                        (
                            elemento.innerText ||
                            elemento.textContent ||
                            ""
                        )
                            .trim()
                            .toLowerCase();

                    const aria =
                        (
                            elemento.getAttribute(
                                "aria-label"
                            ) || ""
                        )
                            .toLowerCase();

                    const title =
                        (
                            elemento.getAttribute(
                                "title"
                            ) || ""
                        )
                            .toLowerCase();

                    const clase =
                        (
                            elemento.className ||
                            ""
                        )
                            .toString()
                            .toLowerCase();

                    const esSiguiente =
                        texto === ">" ||
                        texto === "›" ||
                        texto.includes(
                            "next"
                        ) ||
                        texto.includes(
                            "siguiente"
                        ) ||
                        aria.includes(
                            "next"
                        ) ||
                        aria.includes(
                            "siguiente"
                        ) ||
                        title.includes(
                            "next"
                        ) ||
                        title.includes(
                            "siguiente"
                        ) ||
                        clase.includes(
                            "next"
                        );

                    if (!esSiguiente) {
                        continue;
                    }

                    const deshabilitado =
                        elemento.disabled ||
                        elemento.getAttribute(
                            "aria-disabled"
                        ) === "true" ||
                        elemento.classList.contains(
                            "disabled"
                        );

                    if (
                        deshabilitado
                    ) {
                        continue;
                    }

                    elemento.click();

                    break;
                }
            });

            pagina++;

            await sleep(1200);

            const cantidadDespues =
                (
                    await extraerItemsDesdePagina(
                        page
                    )
                ).length;

            if (
                cantidadDespues === 0
            ) {

                console.log(
                    "[RUST STORE] La siguiente página no entregó artículos. Deteniendo."
                );

                break;
            }

            if (
                todos.size ===
                cantidadAntes
            ) {

                console.log(
                    "[RUST STORE] No aparecieron artículos nuevos. Deteniendo."
                );

                break;
            }

            if (
                pagina > 20
            ) {

                console.log(
                    "[RUST STORE] Límite de seguridad de paginación alcanzado."
                );

                break;
            }
        }

        const items =
            Array.from(
                todos.values()
            );

        console.log(
            `[RUST STORE] TOTAL ITEMS LIMITED DETECTADOS: ${items.length}`
        );

        console.log(
            "[RUST STORE] IDS:",
            items
                .map(item => item.id)
                .join(", ")
        );

        console.log(
            "[RUST STORE] NOMBRES:",
            items
                .map(
                    item =>
                        `${item.id}=${item.nombre}`
                )
                .join(" | ")
        );

        // ------------------------------------------------
        // MOSTRAR RESULTADO DE IMÁGENES PARA DEBUG
        // ------------------------------------------------

        for (
            const item
            of items
        ) {

            console.log(
                `[RUST STORE] IMAGEN ${item.id}:`,
                item.imagen || "SIN IMAGEN"
            );
        }

        return items;

    } finally {

        if (page) {

            try {
                await page.close();
            } catch (error) {}
        }

        if (
            navegadorPropio &&
            navegadorPropio.isConnected()
        ) {

            try {
                await navegadorPropio.close();
            } catch (error) {}

            navegadorPropio = null;
        }
    }
}

// =====================================================
// FALLBACK HTML
// =====================================================

async function obtenerItemsDesdeHTML() {

    console.log(
        "[RUST STORE] Intentando respaldo HTML..."
    );

    const respuesta =
        await axios.get(
            STEAM_LIMITED_URL,
            {
                timeout:
                    REQUEST_TIMEOUT,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0"
                }
            }
        );

    const $ =
        cheerio.load(
            respuesta.data
        );

    const items =
        new Map();

    $('a[href*="/itemstore/252490/detail/"]')
        .each(
            (_, elemento) => {

                const href =
                    $(elemento)
                        .attr("href");

                if (!href) {
                    return;
                }

                const coincidencia =
                    href.match(
                        /\/detail\/(\d+)/
                    );

                if (
                    !coincidencia
                ) {
                    return;
                }

                const id =
                    coincidencia[1];

                let nombre =
                    $(elemento)
                        .text()
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();

                const contenedor =
                    $(elemento)
                        .closest(
                            "div"
                        );

                const texto =
                    contenedor
                        .text()
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();

                const precioMatch =
                    texto.match(
                        /\$\s*\d+(?:[.,]\d{1,2})?/
                    );

                const precio =
                    precioMatch
                        ? precioMatch[0]
                            .replace(
                                /\s+/g,
                                ""
                            )
                        : null;

                let imagen =
                    contenedor
                        .find("img")
                        .first()
                        .attr("src");

                if (!imagen) {

                    imagen =
                        contenedor
                            .find(
                                '[style*="background-image"]'
                            )
                            .first()
                            .attr("style");
                }

                if (imagen) {

                    const match =
                        String(imagen).match(
                            /url\(\s*["']?([^"')]+)["']?\s*\)/i
                        );

                    if (match) {
                        imagen =
                            match[1];
                    }
                }

                if (
                    imagen &&
                    imagen.startsWith("//")
                ) {
                    imagen =
                        "https:" +
                        imagen;
                }

                items.set(
                    id,
                    {
                        id,
                        nombre,
                        precio,
                        imagen:
                            imagen || null,
                        url:
                            href.startsWith(
                                "http"
                            )
                                ? href
                                : "https://store.steampowered.com" +
                                  href
                    }
                );
            }
        );

    return Array.from(
        items.values()
    );
}

// =====================================================
// AJAX
// =====================================================

async function obtenerDatosAjax() {

    try {

        console.log(
            "[RUST STORE] Consultando ajaxgetitemdefs como respaldo..."
        );

        const respuesta =
            await axios.get(
                STEAM_AJAX_URL,
                {
                    timeout:
                        REQUEST_TIMEOUT,

                    headers: {
                        "User-Agent":
                            "Mozilla/5.0",
                        "Accept":
                            "application/json,text/plain,*/*"
                    },

                    params: {
                        appid: 252490
                    }
                }
            );

        const data =
            respuesta.data;

        console.log(
            "[RUST STORE] AJAX keys:",
            Object.keys(data || {})
        );

        return data;

    } catch (error) {

        console.error(
            "[RUST STORE] Error AJAX:",
            error.message
        );

        return null;
    }
}

// =====================================================
// BUSCAR ITEM DENTRO DE AJAX
// =====================================================

function buscarItemAjax(
    objeto,
    idBuscado
) {

    if (
        !objeto ||
        typeof objeto !== "object"
    ) {
        return null;
    }

    const idString =
        String(idBuscado);

    if (
        Array.isArray(objeto)
    ) {

        for (
            const elemento
            of objeto
        ) {

            const encontrado =
                buscarItemAjax(
                    elemento,
                    idBuscado
                );

            if (encontrado) {
                return encontrado;
            }
        }

        return null;
    }

    const posiblesIds = [
        objeto.itemdefid,
        objeto.item_def_id,
        objeto.itemid,
        objeto.item_id,
        objeto.defid,
        objeto.id
    ];

    for (
        const valor
        of posiblesIds
    ) {

        if (
            valor !== undefined &&
            String(valor) ===
                idString
        ) {
            return objeto;
        }
    }

    for (
        const clave
        of Object.keys(objeto)
    ) {

        const encontrado =
            buscarItemAjax(
                objeto[clave],
                idBuscado
            );

        if (encontrado) {
            return encontrado;
        }
    }

    return null;
}

// =====================================================
// ENRIQUECER ITEM
// =====================================================

function enriquecerItem(
    item,
    ajaxData
) {

    if (!ajaxData) {
        return item;
    }

    const datos =
        buscarItemAjax(
            ajaxData,
            item.id
        );

    if (!datos) {
        return item;
    }

    const nombre =
        datos.name ||
        datos.item_name ||
        datos.itemname ||
        datos.display_name ||
        datos.localized_name;

    if (
        !item.nombre &&
        nombre
    ) {
        item.nombre =
            String(nombre).trim();
    }

    const imagen =
        datos.image ||
        datos.image_url ||
        datos.imageurl ||
        datos.icon ||
        datos.icon_url ||
        datos.iconurl ||
        datos.thumbnail ||
        datos.thumbnail_url ||
        datos.imageUrl ||
        datos.iconUrl;

    if (
        !item.imagen &&
        imagen
    ) {

        item.imagen =
            normalizarUrlImagen(
                imagen
            );
    }

    const precio =
        datos.price ||
        datos.price_text ||
        datos.formatted_price ||
        datos.localized_price;

    if (
        !item.precio &&
        precio
    ) {
        item.precio =
            String(precio).trim();
    }

    return item;
}

// =====================================================
// OBTENER TIENDA LIMITED
// =====================================================

async function obtenerTiendaLimited() {

    console.log(
        "\n[RUST STORE] ========================================"
    );

    console.log(
        "[RUST STORE] CONSULTANDO TIENDA LIMITED"
    );

    console.log(
        "[RUST STORE] ========================================\n"
    );

    let items = [];

    // -------------------------------------------------
    // PRIMERO CHROME
    // -------------------------------------------------

    try {

        items =
            await obtenerItemsLimitedConChrome();

    } catch (error) {

        console.error(
            "[RUST STORE] Error Chrome:",
            error.message
        );
    }

    // -------------------------------------------------
    // FALLBACK HTML
    // -------------------------------------------------

    if (
        !items.length
    ) {

        try {

            items =
                await obtenerItemsDesdeHTML();

        } catch (error) {

            console.error(
                "[RUST STORE] Error HTML:",
                error.message
            );
        }
    }

    // -------------------------------------------------
    // AJAX COMO ENRIQUECIMIENTO
    // -------------------------------------------------

    let ajaxData = null;

    if (
        items.length
    ) {

        ajaxData =
            await obtenerDatosAjax();

        if (ajaxData) {

            items =
                items.map(
                    item =>
                        enriquecerItem(
                            item,
                            ajaxData
                        )
                );
        }
    }

    // -------------------------------------------------
    // NORMALIZAR
    // -------------------------------------------------

    items =
        items
            .filter(
                item =>
                    item &&
                    item.id
            )
            .filter(
                item =>
                    item.nombre !==
                    "Rust Item Store"
            )
            .map(
                item => {

                    if (
                        item.imagen
                    ) {

                        item.imagen =
                            normalizarUrlImagen(
                                item.imagen
                            );
                    }

                    return item;
                }
            );

    console.log(
        `[RUST STORE] DATOS FINALES: ${items.length} artículos válidos`
    );

    for (
        const item
        of items
    ) {

        console.log(
            `[RUST STORE] ${item.id}: ${item.nombre} | ${item.precio || "SIN PRECIO"} | ${item.imagen || "SIN IMAGEN"}`
        );
    }

    console.log(
        `[RUST STORE] TOTAL FINAL: ${items.length} artículos Limited encontrados.`
    );

    return items;
}

// =====================================================
// CREAR MENSAJE
// =====================================================

function crearMensajeItem(
    item
) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                item.nombre ||
                "Item Rust"
            )
            .setURL(
                item.url ||
                `https://store.steampowered.com/itemstore/252490/detail/${item.id}`
            )
            .setDescription(
                `💰 **Precio:** ${item.precio || "No disponible"}`
            )
            .setFooter({
                text:
                    "RustLogix • Rust Item Store"
            });

    if (
        item.imagen
    ) {

        embed.setImage(
            item.imagen
        );
    }

    const boton =
        new ButtonBuilder()
            .setLabel(
                "Ver en Steam"
            )
            .setStyle(
                ButtonStyle.Link
            )
            .setURL(
                item.url ||
                `https://store.steampowered.com/itemstore/252490/detail/${item.id}`
            );

    const fila =
        new ActionRowBuilder()
            .addComponents(
                boton
            );

    return {
        embeds: [embed],
        components: [fila]
    };
}

// =====================================================
// PUBLICAR TIENDA EN CANAL
// =====================================================

async function publicarTiendaEnCanal(
    canal,
    items
) {

    if (
        !canal ||
        !items ||
        !items.length
    ) {
        return false;
    }

    console.log(
        `[RUST STORE] Publicando ${items.length} artículos...`
    );

    for (
        let i = 0;
        i < items.length;
        i++
    ) {

        const mensaje =
            crearMensajeItem(
                items[i]
            );

        await canal.send(
            mensaje
        );

        await sleep(
            REQUEST_DELAY
        );
    }

    return true;
}

// =====================================================
// PUBLICAR MANUAL
// =====================================================

async function publicarTiendaManual(
    interaction
) {

    console.log(
        "🎯 Ejecutando /tienda"
    );

    try {

        const items =
            await obtenerTiendaLimited();

        if (
            !items.length
        ) {

            return await interaction.editReply(
                "❌ No se encontraron artículos Limited en la tienda de Rust."
            );
        }

        console.log(
            `[RUST STORE] Publicando ${items.length} artículos...`
        );

        for (
            let i = 0;
            i < items.length;
            i++
        ) {

            const mensaje =
                crearMensajeItem(
                    items[i]
                );

            if (
                i === 0
            ) {

                await interaction.editReply(
                    mensaje
                );

            } else {

                await interaction.channel.send(
                    mensaje
                );
            }

            await sleep(
                REQUEST_DELAY
            );
        }

        return true;

    } catch (error) {

        console.error(
            "❌ ERROR /TIENDA:",
            error
        );

        try {

            await interaction.editReply(
                "❌ Ocurrió un error obteniendo la tienda de Rust."
            );

        } catch (error2) {}

        return false;
    }
}

// =====================================================
// FIRMA DE TIENDA
// =====================================================

function generarFirmaTienda(
    items
) {

    const ids =
        items
            .map(
                item =>
                    String(item.id)
            )
            .sort()
            .join("|");

    return crypto
        .createHash("sha256")
        .update(ids)
        .digest("hex");
}

// =====================================================
// REVISIÓN AUTOMÁTICA
// =====================================================

async function revisarTiendaAutomatica(
    client
) {

    if (
        comprobacionEnCurso
    ) {

        console.log(
            "[RUST STORE] Ya hay una comprobación en curso. Se omite esta ejecución."
        );

        return;
    }

    comprobacionEnCurso = true;

    try {

        console.log(
            "\n[RUST STORE] ========================================"
        );

        console.log(
            "[RUST STORE] COMPROBACIÓN AUTOMÁTICA"
        );

        console.log(
            "[RUST STORE] ========================================\n"
        );

        const items =
            await obtenerTiendaLimited();

        if (
            !items.length
        ) {

            console.log(
                "[RUST STORE] No se encontraron items. No se modifica la firma."
            );

            return;
        }

        const firmaActual =
            generarFirmaTienda(
                items
            );

        const configuraciones =
            await ServerConfig.find({
                rustStoreEnabled: true,
                rustStoreChannelId: {
                    $exists: true,
                    $ne: null
                }
            });

        if (
            !configuraciones.length
        ) {

            console.log(
                "[RUST STORE] No hay servidores con tienda automática activa."
            );

            return;
        }

        for (
            const config
            of configuraciones
        ) {

            try {

                const guild =
                    client.guilds.cache.get(
                        config.guildId
                    );

                if (!guild) {

                    console.log(
                        `[RUST STORE] Guild ${config.guildId} no encontrada.`
                    );

                    continue;
                }

                const canal =
                    guild.channels.cache.get(
                        config.rustStoreChannelId
                    );

                if (
                    !canal ||
                    !canal.isTextBased()
                ) {

                    console.log(
                        `[RUST STORE] Canal inválido en ${guild.name}.`
                    );

                    continue;
                }

                // -------------------------------------
                // PRIMERA EJECUCIÓN
                // -------------------------------------

                if (
                    !config.rustStoreLastSignature
                ) {

                    config.rustStoreLastSignature =
                        firmaActual;

                    await config.save();

                    console.log(
                        `[RUST STORE] Primera comprobación en ${guild.name}. Firma guardada sin publicar.`
                    );

                    continue;
                }

                // -------------------------------------
                // SIN CAMBIOS
                // -------------------------------------

                if (
                    config.rustStoreLastSignature ===
                    firmaActual
                ) {

                    console.log(
                        `[RUST STORE] Sin cambios en ${guild.name}.`
                    );

                    continue;
                }

                // -------------------------------------
                // TIENDA NUEVA
                // -------------------------------------

                console.log(
                    `[RUST STORE] 🚨 NUEVA TIENDA DETECTADA EN ${guild.name}`
                );

                const publicado =
                    await publicarTiendaEnCanal(
                        canal,
                        items
                    );

                if (
                    publicado
                ) {

                    config.rustStoreLastSignature =
                        firmaActual;

                    config.rustStoreLastPublishedWeek =
                        new Date()
                            .toISOString();

                    await config.save();

                    console.log(
                        `[RUST STORE] Nueva tienda publicada correctamente en ${guild.name}.`
                    );
                }

            } catch (error) {

                console.error(
                    `[RUST STORE] Error procesando guild ${config.guildId}:`,
                    error
                );
            }
        }

    } catch (error) {

        console.error(
            "[RUST STORE] Error en comprobación automática:",
            error
        );

    } finally {

        comprobacionEnCurso =
            false;
    }
}

// =====================================================
// INICIAR AUTOMÁTICO
// =====================================================

function iniciarTiendaAutomatica(
    client
) {

    console.log(
        "[RUST STORE] Sistema automático iniciado."
    );

    // Primera comprobación inmediata
    revisarTiendaAutomatica(
        client
    ).catch(error => {

        console.error(
            "[RUST STORE] Error primera comprobación:",
            error
        );
    });

    // Comprobación cada 10 minutos
    setInterval(
        () => {

            revisarTiendaAutomatica(
                client
            ).catch(error => {

                console.error(
                    "[RUST STORE] Error comprobación periódica:",
                    error
                );
            });

        },
        CHECK_INTERVAL
    );
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    obtenerTiendaLimited,

    publicarTiendaManual,

    publicarTiendaEnCanal,

    revisarTiendaAutomatica,

    iniciarTiendaAutomatica
};