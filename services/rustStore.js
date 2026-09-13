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

let tiendaRevisando = false;

// =====================================================
// HEADERS
// =====================================================

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36",

    "Accept-Language":
        "en-US,en;q=0.9"
};

// =====================================================
// DELAY
// =====================================================

function esperar(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// =====================================================
// OBTENER HTML
// =====================================================

async function obtenerHTML(url) {

    const response =
        await axios.get(
            url,
            {
                headers: HEADERS,
                timeout: REQUEST_TIMEOUT
            }
        );

    return response.data;
}

// =====================================================
// ENCONTRAR CHROME
// =====================================================

function buscarChromeRecursivo(
    directorio,
    profundidad = 0
) {

    if (
        profundidad > 8 ||
        !directorio ||
        !fs.existsSync(directorio)
    ) {
        return null;
    }

    let entradas;

    try {

        entradas =
            fs.readdirSync(
                directorio,
                {
                    withFileTypes: true
                }
            );

    } catch (_) {

        return null;
    }

    for (
        const entrada of entradas
    ) {

        const ruta =
            path.join(
                directorio,
                entrada.name
            );

        if (
            entrada.isFile()
        ) {

            const nombre =
                entrada.name.toLowerCase();

            if (
                process.platform ===
                "win32"
            ) {

                if (
                    nombre ===
                    "chrome.exe"
                ) {
                    return ruta;
                }

            } else {

                if (
                    nombre === "chrome" ||
                    nombre === "chrome-headless-shell"
                ) {
                    return ruta;
                }
            }

        } else if (
            entrada.isDirectory()
        ) {

            const encontrado =
                buscarChromeRecursivo(
                    ruta,
                    profundidad + 1
                );

            if (encontrado) {
                return encontrado;
            }
        }
    }

    return null;
}

// =====================================================
// OBTENER EXECUTABLE CHROME
// =====================================================

function obtenerChromeExecutable() {

    const candidatos = [];

    // Windows
    if (
        process.platform ===
        "win32"
    ) {

        candidatos.push(
            "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        );

        candidatos.push(
            "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
        );
    }

    // Linux / Render
    if (
        process.platform !==
        "win32"
    ) {

        candidatos.push(
            "/usr/bin/google-chrome"
        );

        candidatos.push(
            "/usr/bin/google-chrome-stable"
        );

        candidatos.push(
            "/usr/bin/chromium"
        );

        candidatos.push(
            "/usr/bin/chromium-browser"
        );
    }

    // PUPPETEER_CACHE_DIR
    if (
        process.env.PUPPETEER_CACHE_DIR
    ) {

        const encontrado =
            buscarChromeRecursivo(
                process.env.PUPPETEER_CACHE_DIR
            );

        if (encontrado) {
            return encontrado;
        }
    }

    // Cache del proyecto
    const cacheProyecto =
        path.join(
            process.cwd(),
            ".puppeteer-cache"
        );

    const encontradoProyecto =
        buscarChromeRecursivo(
            cacheProyecto
        );

    if (encontradoProyecto) {
        return encontradoProyecto;
    }

    // Candidatos directos
    for (
        const candidato of candidatos
    ) {

        try {

            if (
                fs.existsSync(
                    candidato
                )
            ) {
                return candidato;
            }

        } catch (_) {}
    }

    return null;
}

// =====================================================
// EXTRAER ID
// =====================================================

function extraerIDItem(href) {

    if (!href) {
        return null;
    }

    const match =
        String(href).match(
            /\/itemstore\/252490\/detail\/(\d+)/
        );

    if (!match) {
        return null;
    }

    return match[1];
}

// =====================================================
// LIMPIAR TEXTO
// =====================================================

function limpiarTexto(texto) {

    return String(
        texto || ""
    )
        .replace(
            /\s+/g,
            " "
        )
        .trim();
}

// =====================================================
// EXTRAER PRECIO
// =====================================================

function extraerPrecioTexto(texto) {

    const limpio =
        limpiarTexto(
            texto
        );

    const match =
        limpio.match(
            /\$\s*\d+(?:[.,]\d{1,2})?/
        );

    if (!match) {
        return null;
    }

    return match[0]
        .replace(
            /\s+/g,
            ""
        );
}

// =====================================================
// NORMALIZAR URL IMAGEN
// =====================================================

function normalizarImagen(url) {

    if (!url) {
        return null;
    }

    let resultado =
        String(url).trim();

    // background-image: url(...)
    resultado =
        resultado
            .replace(
                /^url\(\s*/i,
                ""
            )
            .replace(
                /\s*\)$/i,
                ""
            )
            .replace(
                /^["']/,
                ""
            )
            .replace(
                /["']$/,
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

// =====================================================
// EXTRAER URL DESDE BACKGROUND
// =====================================================

function extraerImagenBackground(valor) {

    if (!valor) {
        return null;
    }

    const texto =
        String(valor);

    const match =
        texto.match(
            /url\(\s*["']?([^"')]+)["']?\s*\)/i
        );

    if (!match) {
        return null;
    }

    return normalizarImagen(
        match[1]
    );
}

// =====================================================
// EXTRAER ITEMS DESDE PÁGINA
// =====================================================

async function extraerItemsDesdePagina(page) {

    return await page.evaluate(() => {

        function limpiar(texto) {

            return String(
                texto || ""
            )
                .replace(
                    /\s+/g,
                    " "
                )
                .trim();
        }

        function extraerPrecio(texto) {

            const limpio =
                limpiar(
                    texto
                );

            const match =
                limpio.match(
                    /\$\s*\d+(?:[.,]\d{1,2})?/
                );

            if (!match) {
                return null;
            }

            return match[0]
                .replace(
                    /\s+/g,
                    ""
                );
        }

        function normalizarUrl(url) {

            if (!url) {
                return null;
            }

            let resultado =
                String(url).trim();

            resultado =
                resultado
                    .replace(
                        /^url\(\s*/i,
                        ""
                    )
                    .replace(
                        /\s*\)$/i,
                        ""
                    )
                    .replace(
                        /^["']/,
                        ""
                    )
                    .replace(
                        /["']$/,
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

        function extraerBackground(valor) {

            if (!valor) {
                return null;
            }

            const match =
                String(valor).match(
                    /url\(\s*["']?([^"')]+)["']?\s*\)/i
                );

            if (!match) {
                return null;
            }

            return normalizarUrl(
                match[1]
            );
        }

        // =================================================
        // BUSCAR IMAGEN REAL DEL ITEM
        // =================================================

        function buscarImagen(elemento) {

            if (!elemento) {
                return null;
            }

            const elementos = [
                elemento
            ];

            if (
                elemento.querySelectorAll
            ) {

                elementos.push(
                    ...Array.from(
                        elemento.querySelectorAll("*")
                    )
                );
            }

            // ---------------------------------------------
            // 1. IMG
            // ---------------------------------------------

            for (
                const candidato of elementos
            ) {

                if (
                    candidato.tagName ===
                    "IMG"
                ) {

                    const atributos = [
                        "src",
                        "data-src",
                        "data-lazy-src",
                        "data-original",
                        "data-image",
                        "data-image-url",
                        "data-src-url",
                        "data-url"
                    ];

                    for (
                        const atributo
                        of atributos
                    ) {

                        const valor =
                            candidato.getAttribute(
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
                        candidato.getAttribute(
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
                                    parte
                                        .trim()
                                        .split(/\s+/)[0]
                                );

                            if (url) {
                                return url;
                            }
                        }
                    }
                }
            }

            // ---------------------------------------------
            // 2. STYLE INLINE
            // ---------------------------------------------

            for (
                const candidato of elementos
            ) {

                const style =
                    candidato.getAttribute
                        ? candidato.getAttribute(
                            "style"
                        )
                        : null;

                const url =
                    extraerBackground(
                        style
                    );

                if (url) {
                    return url;
                }
            }

            // ---------------------------------------------
            // 3. BACKGROUND-IMAGE COMPUTADO
            // ---------------------------------------------

            for (
                const candidato of elementos
            ) {

                try {

                    const computed =
                        window.getComputedStyle(
                            candidato
                        );

                    const background =
                        computed.backgroundImage;

                    const url =
                        extraerBackground(
                            background
                        );

                    if (url) {
                        return url;
                    }

                } catch (_) {}
            }

            // ---------------------------------------------
            // 4. ATRIBUTOS DATA-* DE IMAGEN
            // ---------------------------------------------

            for (
                const candidato of elementos
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
                        atributo.name.toLowerCase();

                    const valor =
                        atributo.value;

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
                                valor
                            );

                        if (url) {
                            return url;
                        }

                        const background =
                            extraerBackground(
                                valor
                            );

                        if (background) {
                            return background;
                        }
                    }
                }
            }

            return null;
        }

        // =================================================
        // LINKS
        // =================================================

        const links =
            Array.from(
                document.querySelectorAll(
                    'a[href*="/itemstore/252490/detail/"]'
                )
            );

        const encontrados = [];

        for (
            const link of links
        ) {

            const href =
                link.href || "";

            const match =
                href.match(
                    /\/itemstore\/252490\/detail\/(\d+)/
                );

            if (!match) {
                continue;
            }

            const id =
                match[1];

            // =================================================
            // CONTENEDOR
            // =================================================

            let contenedor =
                link;

            const candidatos = [
                ".itemstore_item",
                ".itemstore_item_block",
                ".itemstore_item_container",
                ".itemstore_item_card",
                ".itemstore_item_details",
                ".itemstore_item_info"
            ];

            for (
                const selector of candidatos
            ) {

                const padre =
                    link.closest(
                        selector
                    );

                if (padre) {

                    contenedor =
                        padre;

                    break;
                }
            }

            // =================================================
            // SI NO ENCONTRÓ CLASE, SUBIR
            // =================================================

            if (
                contenedor ===
                link
            ) {

                let padre =
                    link.parentElement;

                for (
                    let nivel = 0;
                    nivel < 6 &&
                    padre;
                    nivel++
                ) {

                    const texto =
                        limpiar(
                            padre.innerText
                        );

                    if (
                        texto.includes("$")
                    ) {

                        contenedor =
                            padre;

                        break;
                    }

                    padre =
                        padre.parentElement;
                }
            }

            // =================================================
            // NOMBRE
            // =================================================

            let nombre =
                limpiar(
                    link.innerText
                );

            if (!nombre) {

                const selectoresNombre = [
                    ".itemstore_item_name",
                    ".itemstore_item_title",
                    ".item_desc_title",
                    ".item_name"
                ];

                for (
                    const selector
                    of selectoresNombre
                ) {

                    const elemento =
                        contenedor.querySelector(
                            selector
                        );

                    if (
                        elemento &&
                        limpiar(
                            elemento.innerText
                        )
                    ) {

                        nombre =
                            limpiar(
                                elemento.innerText
                            );

                        break;
                    }
                }
            }

            // =================================================
            // PRECIO
            // =================================================

            let precioItem =
                extraerPrecio(
                    contenedor.innerText
                );

            if (!precioItem) {

                let padre =
                    contenedor.parentElement;

                let niveles = 0;

                while (
                    padre &&
                    niveles < 6 &&
                    !precioItem
                ) {

                    precioItem =
                        extraerPrecio(
                            padre.innerText
                        );

                    padre =
                        padre.parentElement;

                    niveles++;
                }
            }

            // =================================================
            // IMAGEN
            // =================================================

            let imagen =
                buscarImagen(
                    contenedor
                );

            // =================================================
            // SI NO, BUSCAR EN PADRES
            // =================================================

            if (!imagen) {

                let padre =
                    contenedor.parentElement;

                for (
                    let nivel = 0;
                    nivel < 5 &&
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

            encontrados.push({
                id,
                nombre:
                    nombre || null,
                precio:
                    precioItem || null,
                imagen:
                    imagen || null,
                url:
                    href
            });
        }

        return [
            ...new Map(
                encontrados.map(
                    item => [
                        item.id,
                        item
                    ]
                )
            ).values()
        ];
    });
}

// =====================================================
// DETECTAR BOTÓN SIGUIENTE
// =====================================================

async function buscarBotonSiguiente(page) {

    return await page.evaluate(() => {

        const elementos =
            document.querySelectorAll(
                "a, button, span, div"
            );

        for (
            const elemento of elementos
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
                    .trim()
                    .toLowerCase();

            const title =
                (
                    elemento.getAttribute(
                        "title"
                    ) || ""
                )
                    .trim()
                    .toLowerCase();

            const clase =
                (
                    elemento.className ||
                    ""
                )
                    .toString()
                    .toLowerCase();

            if (
                texto === ">" ||
                texto === "›" ||
                texto === "»" ||
                texto === "next" ||
                texto === "siguiente" ||
                aria === "next" ||
                aria === "siguiente" ||
                title === "next" ||
                title === "siguiente" ||
                clase.includes("next")
            ) {

                const disabled =
                    elemento.disabled ||
                    elemento.getAttribute(
                        "aria-disabled"
                    ) === "true" ||
                    elemento.classList.contains(
                        "disabled"
                    );

                if (!disabled) {

                    return {
                        encontrado: true,
                        texto,
                        aria,
                        title,
                        clase
                    };
                }
            }
        }

        return {
            encontrado: false
        };
    });
}

// =====================================================
// CLICK SIGUIENTE
// =====================================================

async function clickSiguiente(page) {

    return await page.evaluate(() => {

        const elementos =
            document.querySelectorAll(
                "a, button, span, div"
            );

        for (
            const elemento of elementos
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
                    .trim()
                    .toLowerCase();

            const title =
                (
                    elemento.getAttribute(
                        "title"
                    ) || ""
                )
                    .trim()
                    .toLowerCase();

            const clase =
                (
                    elemento.className ||
                    ""
                )
                    .toString()
                    .toLowerCase();

            if (
                texto === ">" ||
                texto === "›" ||
                texto === "»" ||
                texto === "next" ||
                texto === "siguiente" ||
                aria === "next" ||
                aria === "siguiente" ||
                title === "next" ||
                title === "siguiente" ||
                clase.includes("next")
            ) {

                const disabled =
                    elemento.disabled ||
                    elemento.getAttribute(
                        "aria-disabled"
                    ) === "true" ||
                    elemento.classList.contains(
                        "disabled"
                    );

                if (!disabled) {

                    elemento.click();

                    return true;
                }
            }
        }

        return false;
    });
}

// =====================================================
// OBTENER TODOS LOS ITEMS LIMITED CON CHROME
// =====================================================

async function obtenerItemsLimitedConChrome() {

    let puppeteer;

    try {

        puppeteer =
            require("puppeteer");

    } catch (error) {

        console.error(
            "[RUST STORE] ❌ No se pudo cargar Puppeteer:",
            error.message
        );

        return [];
    }

    let browser = null;
    let page = null;
    let browserPropio = false;

    try {

        console.log(
            "[RUST STORE] Abriendo Steam Limited con Chrome..."
        );

        // =================================================
        // INTENTAR CHROME EN 9222
        // =================================================

        try {

            browser =
                await puppeteer.connect({
                    browserURL:
                        "http://127.0.0.1:9222",
                    defaultViewport:
                        null
                });

            console.log(
                "[RUST STORE] Conectado al Chrome existente en 9222."
            );

        } catch (_) {

            console.log(
                "[RUST STORE] Chrome en 9222 no disponible."
            );

            // =================================================
            // BUSCAR CHROME
            // =================================================

            const executablePath =
                obtenerChromeExecutable();

            if (executablePath) {

                console.log(
                    `[RUST STORE] Chrome encontrado en: ${executablePath}`
                );

            } else {

                console.log(
                    "[RUST STORE] No se encontró Chrome instalado. Puppeteer intentará usar su instalación."
                );
            }

            const opciones = {
                headless: true,

                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-blink-features=AutomationControlled"
                ]
            };

            if (executablePath) {

                opciones.executablePath =
                    executablePath;
            }

            browser =
                await puppeteer.launch(
                    opciones
                );

            browserPropio = true;

            console.log(
                "[RUST STORE] Navegador propio iniciado."
            );
        }

        // =================================================
        // NUEVA PÁGINA
        // =================================================

        page =
            await browser.newPage();

        await page.setUserAgent(
            HEADERS["User-Agent"]
        );

        await page.setExtraHTTPHeaders({
            "Accept-Language":
                "en-US,en;q=0.9"
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
                    60000
            }
        );

        await esperar(3000);

        // =================================================
        // ITEMS
        // =================================================

        const items =
            new Map();

        let pagina = 1;

        // =================================================
        // PRIMERA PÁGINA
        // =================================================

        const primeraPagina =
            await extraerItemsDesdePagina(
                page
            );

        console.log(
            `[RUST STORE] Página ${pagina}: ${primeraPagina.length} artículos detectados.`
        );

        for (
            const item of primeraPagina
        ) {

            items.set(
                item.id,
                item
            );
        }

        // =================================================
        // PAGINACIÓN
        // =================================================

        const MAX_PAGINAS = 20;

        while (
            pagina < MAX_PAGINAS
        ) {

            const cantidadAntes =
                items.size;

            const haySiguiente =
                await buscarBotonSiguiente(
                    page
                );

            if (
                !haySiguiente.encontrado
            ) {

                console.log(
                    "[RUST STORE] No se encontró botón de siguiente."
                );

                break;
            }

            console.log(
                `[RUST STORE] Botón siguiente detectado. Avanzando desde página ${pagina}...`
            );

            const clic =
                await clickSiguiente(
                    page
                );

            if (!clic) {

                console.log(
                    "[RUST STORE] No se pudo hacer click en siguiente."
                );

                break;
            }

            await esperar(2000);

            pagina++;

            const nuevos =
                await extraerItemsDesdePagina(
                    page
                );

            console.log(
                `[RUST STORE] Página ${pagina}: ${nuevos.length} artículos detectados.`
            );

            for (
                const item of nuevos
            ) {

                items.set(
                    item.id,
                    item
                );
            }

            console.log(
                `[RUST STORE] Total acumulado: ${items.size}`
            );

            if (
                items.size ===
                cantidadAntes
            ) {

                console.log(
                    "[RUST STORE] La siguiente página no agregó artículos nuevos. Fin de paginación."
                );

                break;
            }
        }

        const resultado =
            [
                ...items.values()
            ];

        console.log(
            `[RUST STORE] TOTAL ITEMS LIMITED DETECTADOS: ${resultado.length}`
        );

        console.log(
            "[RUST STORE] IDS:",
            resultado
                .map(
                    item => item.id
                )
                .join(", ")
        );

        console.log(
            "[RUST STORE] NOMBRES:",
            resultado
                .map(
                    item =>
                        `${item.id}=${item.nombre}`
                )
                .join(" | ")
        );

        for (
            const item of resultado
        ) {

            console.log(
                `[RUST STORE] ${item.id}: ${item.nombre} | ${item.precio || "SIN PRECIO"} | ${item.imagen || "SIN IMAGEN"}`
            );
        }

        return resultado;

    } catch (error) {

        console.error(
            "[RUST STORE] ❌ Error leyendo Steam con Chrome:",
            error
        );

        return [];

    } finally {

        try {

            if (page) {
                await page.close();
            }

        } catch (_) {}

        if (
            browser &&
            browserPropio
        ) {

            try {
                await browser.close();
            } catch (_) {}
        }
    }
}

// =====================================================
// FALLBACK HTML
// =====================================================

async function obtenerItemsDesdeHTML() {

    try {

        console.log(
            "[RUST STORE] Probando HTML directo..."
        );

        const html =
            await obtenerHTML(
                STEAM_LIMITED_URL
            );

        const $ =
            cheerio.load(
                html
            );

        const items =
            new Map();

        $("a").each(
            (_, elemento) => {

                const href =
                    $(elemento).attr(
                        "href"
                    );

                const id =
                    extraerIDItem(
                        href
                    );

                if (!id) {
                    return;
                }

                let nombre =
                    limpiarTexto(
                        $(elemento).text()
                    );

                let contenedor =
                    $(elemento);

                for (
                    let i = 0;
                    i < 5;
                    i++
                ) {

                    const padre =
                        contenedor.parent();

                    if (
                        !padre.length
                    ) {
                        break;
                    }

                    contenedor =
                        padre;

                    const texto =
                        limpiarTexto(
                            contenedor.text()
                        );

                    const precio =
                        extraerPrecioTexto(
                            texto
                        );

                    const imagen =
                        contenedor
                            .find("img")
                            .first()
                            .attr("src");

                    if (
                        nombre &&
                        precio &&
                        imagen
                    ) {
                        break;
                    }
                }

                const textoContenedor =
                    limpiarTexto(
                        contenedor.text()
                    );

                const precio =
                    extraerPrecioTexto(
                        textoContenedor
                    );

                let imagen =
                    contenedor
                        .find("img")
                        .first()
                        .attr("src") ||
                    null;

                if (
                    imagen &&
                    imagen.startsWith("//")
                ) {

                    imagen =
                        "https:" +
                        imagen;
                }

                if (!nombre) {

                    const posibles = [
                        ".itemstore_item_name",
                        ".itemstore_item_title",
                        ".item_name"
                    ];

                    for (
                        const selector
                        of posibles
                    ) {

                        const encontrado =
                            contenedor
                                .find(selector)
                                .first()
                                .text();

                        if (
                            limpiarTexto(
                                encontrado
                            )
                        ) {

                            nombre =
                                limpiarTexto(
                                    encontrado
                                );

                            break;
                        }
                    }
                }

                if (
                    nombre &&
                    nombre !==
                    "Rust Item Store"
                ) {

                    items.set(
                        id,
                        {
                            id,
                            nombre,
                            precio:
                                precio || null,
                            imagen,
                            url:
                                href.startsWith(
                                    "http"
                                )
                                    ? href
                                    : `https://store.steampowered.com${href}`
                        }
                    );
                }
            }
        );

        const resultado =
            [
                ...items.values()
            ];

        console.log(
            `[RUST STORE] HTML directo encontró ${resultado.length} artículos.`
        );

        return resultado;

    } catch (error) {

        console.error(
            "[RUST STORE] ❌ Error HTML directo:",
            error.message
        );

        return [];
    }
}

// =====================================================
// AJAX
// =====================================================

async function obtenerDatosAjax() {

    try {

        console.log(
            "[RUST STORE] Consultando ajaxgetitemdefs como respaldo..."
        );

        const response =
            await axios.get(
                STEAM_AJAX_URL,
                {
                    params: {
                        start: 0,
                        count: 100,
                        json: 1,
                        searchtext: "",
                        cc: "us",
                        l: "english"
                    },

                    headers:
                        HEADERS,

                    timeout:
                        REQUEST_TIMEOUT
                }
            );

        console.log(
            "[RUST STORE] AJAX keys:",
            Object.keys(
                response.data || {}
            )
        );

        return response.data;

    } catch (error) {

        console.error(
            "[RUST STORE] Error AJAX:",
            error.message
        );

        return null;
    }
}

// =====================================================
// BUSCAR ITEM AJAX
// =====================================================

function buscarItemAjax(
    ajax,
    id
) {

    if (!ajax) {
        return null;
    }

    const objetivo =
        String(id);

    let resultado =
        null;

    function recorrer(
        valor,
        profundidad = 0
    ) {

        if (
            resultado ||
            profundidad > 10 ||
            valor == null
        ) {
            return;
        }

        if (
            Array.isArray(valor)
        ) {

            for (
                const elemento of valor
            ) {

                recorrer(
                    elemento,
                    profundidad + 1
                );

                if (resultado) {
                    return;
                }
            }

            return;
        }

        if (
            typeof valor !==
            "object"
        ) {
            return;
        }

        const camposID = [
            "itemdefid",
            "item_def_id",
            "itemid",
            "item_id",
            "defid",
            "id"
        ];

        for (
            const campo of camposID
        ) {

            if (
                String(
                    valor[campo]
                ) ===
                objetivo
            ) {

                resultado =
                    valor;

                return;
            }
        }

        for (
            const dato of Object.values(
                valor
            )
        ) {

            recorrer(
                dato,
                profundidad + 1
            );

            if (resultado) {
                return;
            }
        }
    }

    recorrer(
        ajax
    );

    return resultado;
}

// =====================================================
// ENRIQUECER ITEMS
// =====================================================

function enriquecerItem(
    item,
    ajax
) {

    const datos =
        buscarItemAjax(
            ajax,
            item.id
        );

    if (!datos) {
        return item;
    }

    if (
        !item.nombre ||
        item.nombre ===
        "Rust Item Store"
    ) {

        const posiblesNombres = [
            datos.name,
            datos.display_name,
            datos.item_name,
            datos.title,
            datos.localized_name
        ];

        for (
            const nombre of posiblesNombres
        ) {

            if (
                typeof nombre ===
                "string" &&
                nombre.trim()
            ) {

                item.nombre =
                    nombre.trim();

                break;
            }
        }
    }

    if (!item.imagen) {

        const posiblesImagenes = [
            datos.image,
            datos.image_url,
            datos.imageurl,
            datos.icon,
            datos.icon_url,
            datos.large_image,
            datos.large_image_url
        ];

        for (
            const imagen of posiblesImagenes
        ) {

            if (
                typeof imagen ===
                "string"
            ) {

                const normalizada =
                    normalizarImagen(
                        imagen
                    );

                if (normalizada) {

                    item.imagen =
                        normalizada;

                    break;
                }
            }
        }
    }

    if (!item.precio) {

        const posiblesPrecios = [
            datos.price,
            datos.price_text,
            datos.formatted_price
        ];

        for (
            const precio of posiblesPrecios
        ) {

            if (
                typeof precio ===
                "string" &&
                precio.trim()
            ) {

                item.precio =
                    precio.trim();

                break;
            }

            if (
                typeof precio ===
                "number"
            ) {

                item.precio =
                    `$${(
                        precio / 100
                    ).toFixed(2)}`;

                break;
            }
        }
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
        "[RUST STORE] ========================================"
    );

    let items =
        await obtenerItemsLimitedConChrome();

    // =================================================
    // FALLBACK HTML
    // =================================================

    if (
        !items.length
    ) {

        items =
            await obtenerItemsDesdeHTML();
    }

    if (
        !items.length
    ) {

        console.error(
            "[RUST STORE] ❌ No se detectaron artículos Limited."
        );

        return [];
    }

    // =================================================
    // AJAX
    // =================================================

    const ajax =
        await obtenerDatosAjax();

    for (
        const item of items
    ) {

        enriquecerItem(
            item,
            ajax
        );
    }

    // =================================================
    // LIMPIAR
    // =================================================

    items =
        items.filter(
            item =>
                item.nombre &&
                item.nombre !==
                "Rust Item Store"
        );

    // =================================================
    // DEDUPLICAR
    // =================================================

    items =
        [
            ...new Map(
                items.map(
                    item => [
                        item.id,
                        item
                    ]
                )
            ).values()
        ];

    console.log(
        `[RUST STORE] DATOS FINALES: ${items.length} artículos válidos`
    );

    for (
        const item of items
    ) {

        console.log(
            `[RUST STORE] ${item.id}: ${item.nombre} | ${item.precio || "SIN PRECIO"} | ${item.imagen ? "IMAGEN OK" : "SIN IMAGEN"}`
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

function crearMensajeItem(item) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🛒 ${item.nombre}`
            )
            .setURL(
                item.url
            )
            .setDescription(
                `💰 **Precio:** ${item.precio || "No disponible"}`
            )
            .setFooter({
                text:
                    "Rust Store • Steam"
            });

    if (
        item.imagen
    ) {

        embed.setImage(
            item.imagen
        );
    }

    const botones =
        new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setLabel(
                        "Ver en Steam"
                    )
                    .setStyle(
                        ButtonStyle.Link
                    )
                    .setURL(
                        item.url
                    )
            );

    return {
        embeds: [
            embed
        ],
        components: [
            botones
        ]
    };
}

// =====================================================
// PUBLICAR TIENDA EN CANAL
// =====================================================

async function publicarTiendaEnCanal(
    channel,
    items
) {

    if (
        !channel ||
        !items ||
        !items.length
    ) {
        return false;
    }

    console.log(
        `[RUST STORE] Publicando ${items.length} artículos...`
    );

    for (
        const item of items
    ) {

        try {

            await channel.send(
                crearMensajeItem(
                    item
                )
            );

            await esperar(
                500
            );

        } catch (error) {

            console.error(
                `[RUST STORE] Error publicando ${item.id}:`,
                error.message
            );

            return false;
        }
    }

    return true;
}

// =====================================================
// /TIENDA MANUAL
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
                "❌ No se pudieron encontrar artículos Limited en la tienda de Rust."
            );
        }

        console.log(
            `[RUST STORE] Publicando ${items.length} artículos...`
        );

        await interaction.editReply(
            crearMensajeItem(
                items[0]
            )
        );

        for (
            let i = 1;
            i < items.length;
            i++
        ) {

            await interaction.channel.send(
                crearMensajeItem(
                    items[i]
                )
            );

            await esperar(
                500
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

        } catch (_) {}

        return false;
    }
}

// =====================================================
// FIRMA
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
            .sort(
                (a, b) =>
                    a.localeCompare(b)
            )
            .join("|");

    return crypto
        .createHash("sha256")
        .update(ids)
        .digest("hex");
}

// =====================================================
// AUTOMÁTICO
// =====================================================

async function revisarTiendaAutomatica(
    client
) {

    if (
        tiendaRevisando
    ) {

        console.log(
            "[RUST STORE] Ya hay una revisión en curso. Saltando..."
        );

        return;
    }

    tiendaRevisando =
        true;

    try {

        console.log(
            "\n[RUST STORE] 🔎 Comprobando tienda Limited..."
        );

        const items =
            await obtenerTiendaLimited();

        if (
            !items.length
        ) {

            console.log(
                "[RUST STORE] No se obtuvieron artículos. No se modifica la firma."
            );

            return;
        }

        const firmaActual =
            generarFirmaTienda(
                items
            );

        console.log(
            `[RUST STORE] Firma actual: ${firmaActual}`
        );

        const configs =
            await ServerConfig.find({
                rustStoreEnabled:
                    true,

                rustStoreChannelId: {
                    $exists:
                        true,

                    $ne:
                        null
                }
            });

        if (
            !configs.length
        ) {

            console.log(
                "[RUST STORE] No hay servidores con tienda automática activada."
            );

            return;
        }

        for (
            const config of configs
        ) {

            try {

                const guild =
                    client.guilds.cache.get(
                        config.guildId
                    );

                if (!guild) {
                    continue;
                }

                const channel =
                    guild.channels.cache.get(
                        config.rustStoreChannelId
                    );

                if (
                    !channel ||
                    !channel.isTextBased()
                ) {

                    console.log(
                        `[RUST STORE] Canal no encontrado para ${guild.name}`
                    );

                    continue;
                }

                // Primera ejecución
                if (
                    !config.rustStoreLastSignature
                ) {

                    console.log(
                        `[RUST STORE] Primera revisión para ${guild.name}. Guardando firma sin publicar.`
                    );

                    config.rustStoreLastSignature =
                        firmaActual;

                    await config.save();

                    continue;
                }

                // Sin cambios
                if (
                    config.rustStoreLastSignature ===
                    firmaActual
                ) {

                    console.log(
                        `[RUST STORE] ${guild.name}: tienda sin cambios.`
                    );

                    continue;
                }

                // Nueva tienda
                console.log(
                    `[RUST STORE] 🚨 NUEVA TIENDA DETECTADA PARA ${guild.name}`
                );

                const publicada =
                    await publicarTiendaEnCanal(
                        channel,
                        items
                    );

                if (!publicada) {

                    console.log(
                        `[RUST STORE] ❌ No se pudo publicar completa la tienda para ${guild.name}.`
                    );

                    continue;
                }

                config.rustStoreLastSignature =
                    firmaActual;

                await config.save();

                console.log(
                    `[RUST STORE] ✅ Firma actualizada para ${guild.name}.`
                );

            } catch (error) {

                console.error(
                    `[RUST STORE] Error procesando servidor ${config.guildId}:`,
                    error
                );
            }
        }

    } catch (error) {

        console.error(
            "[RUST STORE] ❌ Error en revisión automática:",
            error
        );

    } finally {

        tiendaRevisando =
            false;
    }
}

// =====================================================
// INICIAR AUTOMATIZACIÓN
// =====================================================

function iniciarTiendaAutomatica(
    client
) {

    console.log(
        "[RUST STORE] Sistema automático iniciado."
    );

    console.log(
        `[RUST STORE] Intervalo: ${CHECK_INTERVAL / 60000} minutos`
    );

    revisarTiendaAutomatica(
        client
    ).catch(
        error =>
            console.error(
                "[RUST STORE] Error primera revisión:",
                error
            )
    );

    setInterval(
        () => {

            revisarTiendaAutomatica(
                client
            ).catch(
                error =>
                    console.error(
                        "[RUST STORE] Error revisión automática:",
                        error
                    )
            );

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