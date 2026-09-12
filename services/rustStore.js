const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");

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

const STEAM_APP_ID = "252490";

const STEAM_STORE_URL =
    "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited";

const STEAM_BASE_URL =
    "https://store.steampowered.com";

const STEAM_ITEMDEFS_URL =
    "https://store.steampowered.com/itemstore/252490/ajaxgetitemdefs";

const TIMEZONE_CHILE =
    "America/Santiago";

const MAX_ITEMS = 100;

const STEAM_PAGE_SIZE = 12;

const MAX_PAGES = 20;

const CHECK_INTERVAL =
    10 * 60 * 1000;

const REQUEST_DELAY =
    250;

const DETAIL_DELAY =
    150;

const LOCK_DURATION =
    5 * 60 * 1000;

const LOCK_ID =
    "rust-store-global-lock";

// =====================================================
// LOCK GLOBAL
// =====================================================

let rustStoreLocks = global.__rustStoreLocks;

if (!rustStoreLocks) {
    rustStoreLocks = new Map();
    global.__rustStoreLocks = rustStoreLocks;
}

// =====================================================
// AXIOS
// =====================================================

const steamClient = axios.create({
    timeout: 30000,
    maxRedirects: 5,
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
        "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language":
            "en-US,en;q=0.9",
        "Referer":
            "https://store.steampowered.com/itemstore/252490/"
    }
});

// =====================================================
// UTILIDADES
// =====================================================

function esperar(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

function normalizarTexto(valor) {

    if (valor === undefined || valor === null) {
        return "";
    }

    return String(valor)
        .replace(/\s+/g, " ")
        .trim();
}

function limpiarPrecio(valor) {

    if (!valor) {
        return "";
    }

    let texto = String(valor)
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();

    const match = texto.match(
        /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?|€\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*€|£\s*\d+(?:[.,]\d{1,2})?|USD\s*\d+(?:[.,]\d{1,2})?|EUR\s*\d+(?:[.,]\d{1,2})?|GBP\s*\d+(?:[.,]\d{1,2})?/i
    );

    if (!match) {
        return "";
    }

    return normalizarTexto(match[0]);
}

function esUrlImagenSteam(url) {

    if (!url) {
        return false;
    }

    const texto = String(url).trim();

    if (!/^https?:\/\//i.test(texto)) {
        return false;
    }

    return (
        texto.includes("/economy/image/") ||
        texto.includes("community.fastly.steamstatic.com") ||
        texto.includes("community.cloudflare.steamstatic.com") ||
        texto.includes("steamcommunity.com/economy/image") ||
        texto.includes("images.steamusercontent.com")
    );
}

function esImagenGenerica(url) {

    if (!url) {
        return true;
    }

    const texto = String(url).toLowerCase();

    return (
        texto.includes("header.jpg") ||
        texto.includes("logo") ||
        texto.includes("capsule") ||
        texto.includes("store_home") ||
        texto.includes("library_hero")
    );
}

function normalizarImagenSteam(url) {

    if (!url) {
        return null;
    }

    let imagen = String(url).trim();

    imagen = imagen.replace(/^['"]|['"]$/g, "");

    if (
        imagen.startsWith("//")
    ) {
        imagen =
            "https:" + imagen;
    }

    if (
        imagen.startsWith("/economy/image/")
    ) {
        imagen =
            STEAM_BASE_URL + imagen;
    }

    if (
        imagen.includes("steamstatic.com/economy/image/")
    ) {
        return imagen;
    }

    if (
        imagen.includes("steamcommunity.com/economy/image/")
    ) {
        return imagen;
    }

    if (
        imagen.includes("images.steamusercontent.com")
    ) {
        return imagen;
    }

    return null;
}

// =====================================================
// EXTRAER IMAGEN REAL
// =====================================================

function buscarImagenReal($) {

    let encontrada = null;

    $("img").each((i, elemento) => {

        if (encontrada) {
            return;
        }

        const src =
            $(elemento).attr("src");

        const dataSrc =
            $(elemento).attr("data-src");

        const dataOriginal =
            $(elemento).attr("data-original");

        const srcset =
            $(elemento).attr("srcset");

        const candidatos = [
            src,
            dataSrc,
            dataOriginal,
            srcset
        ];

        for (const candidato of candidatos) {

            if (!candidato) {
                continue;
            }

            let valor =
                String(candidato)
                    .split(",")[0]
                    .trim()
                    .split(" ")[0];

            const imagen =
                normalizarImagenSteam(valor);

            if (
                imagen &&
                !esImagenGenerica(imagen)
            ) {
                encontrada = imagen;
                return;
            }
        }
    });

    if (encontrada) {
        return encontrada;
    }

    const atributos = [
        "data-src",
        "data-original",
        "data-image-url",
        "data-full-image",
        "data-large-image",
        "href",
        "content"
    ];

    for (const atributo of atributos) {

        $(`[${atributo}]`).each((i, elemento) => {

            if (encontrada) {
                return;
            }

            const valor =
                $(elemento).attr(atributo);

            const imagen =
                normalizarImagenSteam(valor);

            if (
                imagen &&
                !esImagenGenerica(imagen)
            ) {
                encontrada = imagen;
            }
        });

        if (encontrada) {
            break;
        }
    }

    return encontrada;
}

// =====================================================
// EXTRAER PRECIO
// =====================================================

function buscarPrecio($) {

    let precio = "";

    const selectores = [
        ".item_price",
        ".item_price .price",
        ".price",
        ".itemstore_item_price",
        ".store_item_price",
        ".item_purchase_price",
        ".purchase_price",
        "[class*='price']"
    ];

    for (const selector of selectores) {

        $(selector).each((i, elemento) => {

            if (precio) {
                return;
            }

            const texto =
                $(elemento).text();

            const encontrado =
                limpiarPrecio(texto);

            if (encontrado) {
                precio = encontrado;
            }
        });

        if (precio) {
            break;
        }
    }

    if (precio) {
        return precio;
    }

    const bodyText =
        $("body").text();

    return limpiarPrecio(bodyText);
}

// =====================================================
// EXTRAER PRECIO DESDE HTML RAW
// =====================================================

function buscarPrecioDesdeHTML(html) {

    if (!html) {
        return "";
    }

    const texto =
        String(html)
            .replace(/\\"/g, '"')
            .replace(/\\u0026/g, "&")
            .replace(/\\u003c/g, "<")
            .replace(/\\u003e/g, ">")
            .replace(/\\u0027/g, "'");

    const patrones = [

        /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?/gi,

        /€\s*\d+(?:[.,]\d{1,2})?/gi,

        /\d+(?:[.,]\d{1,2})?\s*€/gi,

        /£\s*\d+(?:[.,]\d{1,2})?/gi,

        /USD\s*\d+(?:[.,]\d{1,2})?/gi,

        /EUR\s*\d+(?:[.,]\d{1,2})?/gi,

        /GBP\s*\d+(?:[.,]\d{1,2})?/gi
    ];

    for (const patron of patrones) {

        const match =
            texto.match(patron);

        if (
            match &&
            match.length > 0
        ) {

            for (const candidato of match) {

                const precio =
                    limpiarPrecio(candidato);

                if (precio) {
                    return precio;
                }
            }
        }
    }

    return "";
}

// =====================================================
// DATOS DESDE DETAIL
// =====================================================

async function obtenerDatosDesdeDetail(item) {

    if (!item.url) {
        return item;
    }

    try {

        const response =
            await steamClient.get(item.url, {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
                    "Accept-Language":
                        "en-US,en;q=0.9",
                    "Referer":
                        STEAM_STORE_URL
                }
            });

        const html =
            response.data;

        const $ =
            cheerio.load(html);

        // -------------------------------------------------
        // IMAGEN
        // -------------------------------------------------

        let imagen =
            buscarImagenReal($);

        // Meta como fallback
        if (!imagen) {

            const metas = [
                $('meta[property="og:image"]').attr("content"),
                $('meta[name="twitter:image"]').attr("content"),
                $('meta[property="twitter:image"]').attr("content")
            ];

            for (const meta of metas) {

                const candidata =
                    normalizarImagenSteam(meta);

                if (
                    candidata &&
                    !esImagenGenerica(candidata)
                ) {
                    imagen = candidata;
                    break;
                }
            }
        }

        // -------------------------------------------------
        // PRECIO
        // -------------------------------------------------

        let precio =
            buscarPrecio($);

        if (!precio) {
            precio =
                buscarPrecioDesdeHTML(html);
        }

        if (imagen) {

            item.imagen =
                imagen;

            console.log(
                `[RUST STORE] Imagen encontrada: ${item.nombre} -> ${imagen}`
            );
        }

        if (precio) {
            item.precio =
                precio;
        }

        console.log(
            `[RUST STORE] Detail OK: ${item.nombre} | ${item.precio || "SIN PRECIO"} | ${item.imagen ? "IMAGEN OK" : "SIN IMAGEN"}`
        );

        return item;

    } catch (error) {

        console.error(
            `[RUST STORE] Error detail ${item.nombre}:`,
            error.message
        );

        return item;
    }
}

// =====================================================
// SEGUNDO INTENTO SOLO IMAGEN
// =====================================================

async function obtenerImagenDesdeDetailSimple(item) {

    if (!item.url) {
        return item;
    }

    try {

        const response =
            await steamClient.get(item.url, {
                timeout: 20000,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
                    "Accept-Language":
                        "en-US,en;q=0.9"
                }
            });

        const html =
            response.data;

        const $ =
            cheerio.load(html);

        const imagen =
            buscarImagenReal($);

        if (imagen) {

            item.imagen =
                imagen;

            console.log(
                `[RUST STORE] Segundo intento imagen OK: ${item.nombre}`
            );
        }

    } catch (error) {

        console.error(
            `[RUST STORE] Segundo intento imagen falló: ${item.nombre} | ${error.message}`
        );
    }

    return item;
}

// =====================================================
// SEGUNDO INTENTO PRECIO
// =====================================================

async function obtenerPrecioDesdeDetail(item) {

    if (!item.url) {
        return item;
    }

    try {

        const response =
            await steamClient.get(item.url, {
                timeout: 20000,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
                    "Accept-Language":
                        "en-US,en;q=0.9"
                }
            });

        const html =
            response.data;

        const precio =
            buscarPrecioDesdeHTML(html);

        if (precio) {

            item.precio =
                precio;

            console.log(
                `[RUST STORE] Segundo intento precio OK: ${item.nombre} -> ${precio}`
            );
        }

    } catch (error) {

        console.error(
            `[RUST STORE] Segundo intento precio falló: ${item.nombre} | ${error.message}`
        );
    }

    return item;
}

// =====================================================
// EXTRAER ITEMDEFS RECURSIVAMENTE
// =====================================================

function extraerObjetosItemDefs(obj, resultado = [], vistos = new Set()) {

    if (!obj) {
        return resultado;
    }

    if (
        typeof obj !== "object"
    ) {
        return resultado;
    }

    if (
        vistos.has(obj)
    ) {
        return resultado;
    }

    vistos.add(obj);

    if (Array.isArray(obj)) {

        for (const elemento of obj) {

            extraerObjetosItemDefs(
                elemento,
                resultado,
                vistos
            );
        }

        return resultado;
    }

    const tieneId =
        obj.itemdefid !== undefined ||
        obj.item_def_id !== undefined ||
        obj.itemDefId !== undefined;

    const tieneNombre =
        obj.name !== undefined ||
        obj.name_english !== undefined ||
        obj.item_name !== undefined ||
        obj.itemname !== undefined;

    if (
        tieneId &&
        tieneNombre
    ) {
        resultado.push(obj);
    }

    for (const key of Object.keys(obj)) {

        const valor =
            obj[key];

        if (
            valor &&
            typeof valor === "object"
        ) {

            extraerObjetosItemDefs(
                valor,
                resultado,
                vistos
            );
        }
    }

    return resultado;
}

// =====================================================
// TAGS
// =====================================================

function obtenerTagsItemDef(itemdef) {

    const posibles = [
        itemdef.store_tags,
        itemdef.storeTags,
        itemdef.tags,
        itemdef.store_tag,
        itemdef.category
    ];

    const tags = [];

    for (const valor of posibles) {

        if (!valor) {
            continue;
        }

        if (Array.isArray(valor)) {

            for (const tag of valor) {

                if (tag !== undefined && tag !== null) {
                    tags.push(String(tag));
                }
            }

        } else {

            tags.push(
                String(valor)
            );
        }
    }

    return tags;
}

function tieneTagLimited(itemdef) {

    const tags =
        obtenerTagsItemDef(itemdef);

    return tags.some(tag => {

        const normalizado =
            String(tag)
                .toLowerCase()
                .trim();

        return (
            normalizado === "limited" ||
            normalizado.includes("limited")
        );
    });
}

// =====================================================
// NOMBRE ITEMDEF
// =====================================================

function obtenerNombreItemDef(itemdef) {

    const posibles = [
        itemdef.name,
        itemdef.name_english,
        itemdef.item_name,
        itemdef.itemname,
        itemdef.localized_name,
        itemdef.display_name
    ];

    for (const valor of posibles) {

        if (
            valor !== undefined &&
            valor !== null &&
            String(valor).trim()
        ) {

            return normalizarTexto(valor);
        }
    }

    return "Item Rust";
}

// =====================================================
// ID ITEMDEF
// =====================================================

function obtenerIdItemDef(itemdef) {

    const posibles = [
        itemdef.itemdefid,
        itemdef.item_def_id,
        itemdef.itemDefId,
        itemdef.id
    ];

    for (const valor of posibles) {

        if (
            valor !== undefined &&
            valor !== null &&
            String(valor).trim()
        ) {

            return String(valor).trim();
        }
    }

    return "";
}

// =====================================================
// URL DETAIL
// =====================================================

function crearUrlDetail(itemdefid) {

    return (
        `${STEAM_BASE_URL}/itemstore/${STEAM_APP_ID}/detail/${encodeURIComponent(itemdefid)}/`
    );
}

// =====================================================
// EXTRAER ITEMDEFS DESDE JSON
// =====================================================

async function obtenerLimitedDesdeAjax() {

    console.log(
        "[RUST STORE] Consultando endpoint AJAX de Steam para obtener todos los Limited..."
    );

    const configuraciones = [

        {
            cc: "us",
            l: "english"
        },

        {
            cc: "cl",
            l: "english"
        },

        {
            cc: "us",
            l: "spanish"
        }
    ];

    for (
        const configuracion
        of configuraciones
    ) {

        try {

            const params = {
                start: 0,
                count: 100,
                json: 1,
                searchtext: "",
                cc: configuracion.cc,
                l: configuracion.l
            };

            const response =
                await steamClient.get(
                    STEAM_ITEMDEFS_URL,
                    {
                        params,
                        headers: {
                            "Accept":
                                "application/json, text/plain, */*",
                            "X-Requested-With":
                                "XMLHttpRequest",
                            "Referer":
                                STEAM_STORE_URL
                        }
                    }
                );

            const data =
                response.data;

            console.log(
                `[RUST STORE] AJAX ${configuracion.cc}/${configuracion.l}: respuesta recibida (${typeof data})`
            );

            const itemdefs =
                extraerObjetosItemDefs(
                    data
                );

            console.log(
                `[RUST STORE] AJAX ${configuracion.cc}/${configuracion.l}: ${itemdefs.length} itemdefs candidatos.`
            );

            if (
                itemdefs.length === 0
            ) {
                continue;
            }

            const unicos =
                new Map();

            for (
                const itemdef
                of itemdefs
            ) {

                const id =
                    obtenerIdItemDef(
                        itemdef
                    );

                if (!id) {
                    continue;
                }

                if (
                    !unicos.has(id)
                ) {
                    unicos.set(
                        id,
                        itemdef
                    );
                }
            }

            const todos =
                Array.from(
                    unicos.values()
                );

            console.log(
                `[RUST STORE] AJAX: ${todos.length} itemdefs únicos.`
            );

            const limited =
                todos.filter(
                    tieneTagLimited
                );

            console.log(
                `[RUST STORE] AJAX: ${limited.length} itemdefs con tag Limited.`
            );

            if (
                limited.length === 0
            ) {

                // Mostrar tags para poder detectar cambios de Steam
                console.log(
                    "[RUST STORE] No se encontraron tags Limited. Mostrando muestra de tags:"
                );

                todos
                    .slice(0, 10)
                    .forEach(itemdef => {

                        const nombre =
                            obtenerNombreItemDef(
                                itemdef
                            );

                        const tags =
                            obtenerTagsItemDef(
                                itemdef
                            );

                        console.log(
                            `[RUST STORE] TAGS: ${nombre} -> ${tags.join(", ") || "SIN TAGS"}`
                        );
                    });

                continue;
            }

            const resultado =
                limited.map(itemdef => {

                    const id =
                        obtenerIdItemDef(
                            itemdef
                        );

                    const nombre =
                        obtenerNombreItemDef(
                            itemdef
                        );

                    let precio =
                        limpiarPrecio(
                            itemdef.price
                        );

                    if (!precio) {
                        precio =
                            limpiarPrecio(
                                itemdef.price_category
                            );
                    }

                    let imagen =
                        null;

                    const imagenes = [
                        itemdef.store_images,
                        itemdef.storeImages,
                        itemdef.icon_url_large,
                        itemdef.icon_url,
                        itemdef.image_url
                    ];

                    for (
                        const posible
                        of imagenes
                    ) {

                        if (
                            typeof posible === "string"
                        ) {

                            const candidata =
                                normalizarImagenSteam(
                                    posible
                                );

                            if (
                                candidata
                            ) {

                                imagen =
                                    candidata;

                                break;
                            }
                        }

                        if (
                            Array.isArray(posible)
                        ) {

                            for (
                                const valor
                                of posible
                            ) {

                                const candidata =
                                    normalizarImagenSteam(
                                        valor
                                    );

                                if (
                                    candidata
                                ) {

                                    imagen =
                                        candidata;

                                    break;
                                }
                            }

                            if (imagen) {
                                break;
                            }
                        }
                    }

                    return {
                        id,
                        nombre,
                        precio,
                        imagen,
                        url:
                            crearUrlDetail(
                                id
                            )
                    };
                });

            console.log(
                `[RUST STORE] AJAX: ${resultado.length} Limited preparados.`
            );

            resultado.forEach(item => {

                console.log(
                    `[RUST STORE] Limited: ${item.id} | ${item.nombre}`
                );
            });

            return resultado;

        } catch (error) {

            console.error(
                `[RUST STORE] Error AJAX ${configuracion.cc}/${configuracion.l}:`,
                error.response?.status ||
                error.message
            );
        }

        await esperar(500);
    }

    return [];
}

// =====================================================
// FALLBACK HTML
// =====================================================

async function obtenerTiendaHTML() {

    console.log(
        "[RUST STORE] Usando fallback HTML de Steam..."
    );

    const resultados =
        new Map();

    let totalSteam =
        0;

    for (
        let pagina = 1;
        pagina <= MAX_PAGES;
        pagina++
    ) {

        const start =
            (pagina - 1) *
            STEAM_PAGE_SIZE;

        console.log(
            `[RUST STORE] Página ${pagina}: start=${start}`
        );

        try {

            const response =
                await steamClient.get(
                    STEAM_STORE_URL,
                    {
                        params: {
                            start,
                            count:
                                STEAM_PAGE_SIZE,
                            cc: "us",
                            l: "english"
                        }
                    }
                );

            const html =
                response.data;

            const $ =
                cheerio.load(html);

            const textoPagina =
                $("body").text();

            const totalMatch =
                textoPagina.match(
                    /(?:Showing|Mostrando)\s+\d+\s*-\s*\d+\s+(?:of|de)\s+(\d+)/i
                );

            if (
                totalMatch
            ) {

                totalSteam =
                    parseInt(
                        totalMatch[1],
                        10
                    ) || 0;

                console.log(
                    `[RUST STORE] Steam indica ${totalSteam} resultados totales.`
                );
            }

            let detectados =
                0;

            // ---------------------------------------------
            // Buscar links detail
            // ---------------------------------------------

            $("a").each((i, elemento) => {

                const href =
                    $(elemento).attr("href");

                if (!href) {
                    return;
                }

                const match =
                    href.match(
                        /\/itemstore\/252490\/detail\/(\d+)\/?/i
                    );

                if (!match) {
                    return;
                }

                const id =
                    match[1];

                if (
                    resultados.has(id)
                ) {
                    return;
                }

                let nombre =
                    normalizarTexto(
                        $(elemento).text()
                    );

                if (!nombre) {

                    const title =
                        $(elemento).attr("title");

                    if (title) {
                        nombre =
                            normalizarTexto(
                                title
                            );
                    }
                }

                if (!nombre) {
                    nombre =
                        `Item Rust ${id}`;
                }

                resultados.set(
                    id,
                    {
                        id,
                        nombre,
                        precio: "",
                        imagen: null,
                        url:
                            `${STEAM_BASE_URL}/itemstore/252490/detail/${id}/`
                    }
                );

                detectados++;
            });

            // ---------------------------------------------
            // Buscar elementos con data-itemdef
            // ---------------------------------------------

            $(
                "[data-itemdefid], [data-itemdef]"
            ).each((i, elemento) => {

                const id =
                    $(elemento).attr("data-itemdefid") ||
                    $(elemento).attr("data-itemdef");

                if (!id) {
                    return;
                }

                const idString =
                    String(id).trim();

                if (
                    resultados.has(idString)
                ) {
                    return;
                }

                let nombre =
                    normalizarTexto(
                        $(elemento).text()
                    );

                if (!nombre) {

                    nombre =
                        normalizarTexto(
                            $(elemento).attr("data-name")
                        );
                }

                if (!nombre) {
                    nombre =
                        `Item Rust ${idString}`;
                }

                resultados.set(
                    idString,
                    {
                        id:
                            idString,
                        nombre,
                        precio: "",
                        imagen: null,
                        url:
                            `${STEAM_BASE_URL}/itemstore/252490/detail/${idString}/`
                    }
                );

                detectados++;
            });

            console.log(
                `[RUST STORE] Página ${pagina}: ${detectados} nuevos. Total acumulado: ${resultados.size}`
            );

            if (
                resultados.size >= MAX_ITEMS
            ) {
                break;
            }

            if (
                totalSteam > 0 &&
                resultados.size >= totalSteam
            ) {
                break;
            }

            // ---------------------------------------------
            // Steam actualmente puede ignorar start/count
            // en determinadas respuestas.
            //
            // Si no aparece nada nuevo, no seguimos
            // martillando la misma página.
            // ---------------------------------------------

            if (
                detectados === 0
            ) {

                console.log(
                    "[RUST STORE] La página no agregó artículos nuevos."
                );

                break;
            }

            await esperar(
                REQUEST_DELAY
            );

        } catch (error) {

            console.error(
                `[RUST STORE] Error página ${pagina}:`,
                error.message
            );

            break;
        }
    }

    const items =
        Array.from(
            resultados.values()
        );

    console.log(
        `[RUST STORE] Fallback HTML: ${items.length} artículos encontrados.`
    );

    return items;
}

// =====================================================
// MÉTODO EXTRA: DESCUBRIR TODOS DESDE HTML + DETALLES
// =====================================================

async function obtenerLimitedDesdeHTMLCompleto() {

    const paginas = [
        `${STEAM_STORE_URL}&start=0&count=100`,
        `${STEAM_STORE_URL}&start=12&count=100`,
        `${STEAM_STORE_URL}&start=24&count=100`,
        `${STEAM_STORE_URL}&start=36&count=100`,
        `${STEAM_STORE_URL}&start=48&count=100`
    ];

    const resultado =
        new Map();

    for (
        const url
        of paginas
    ) {

        try {

            const response =
                await steamClient.get(
                    url
                );

            const html =
                response.data;

            const $ =
                cheerio.load(html);

            $("a").each((i, elemento) => {

                const href =
                    $(elemento).attr("href");

                if (!href) {
                    return;
                }

                const match =
                    href.match(
                        /\/itemstore\/252490\/detail\/(\d+)\/?/i
                    );

                if (!match) {
                    return;
                }

                const id =
                    match[1];

                if (
                    resultado.has(id)
                ) {
                    return;
                }

                let nombre =
                    normalizarTexto(
                        $(elemento).text()
                    );

                if (!nombre) {

                    nombre =
                        normalizarTexto(
                            $(elemento).attr("title")
                        );
                }

                if (!nombre) {
                    nombre =
                        `Item Rust ${id}`;
                }

                resultado.set(
                    id,
                    {
                        id,
                        nombre,
                        precio: "",
                        imagen: null,
                        url:
                            `${STEAM_BASE_URL}/itemstore/252490/detail/${id}/`
                    }
                );
            });

        } catch (error) {

            console.error(
                "[RUST STORE] Error HTML completo:",
                error.message
            );
        }

        await esperar(
            REQUEST_DELAY
        );
    }

    return Array.from(
        resultado.values()
    );
}

// =====================================================
// OBTENER TIENDA
// =====================================================

async function obtenerTiendaRust() {

    console.log(
        "[RUST STORE] Consultando Steam..."
    );

    // =================================================
    // PRIMERA OPCIÓN:
    // ITEMDEFS
    // =================================================

    let items =
        await obtenerLimitedDesdeAjax();

    if (
        items.length > 0
    ) {

        console.log(
            `[RUST STORE] Resultado AJAX: ${items.length} artículos.`
        );

    } else {

        console.log(
            "[RUST STORE] El endpoint no devolvió tags Limited reconocibles."
        );

        // =================================================
        // FALLBACK HTML
        // =================================================

        items =
            await obtenerTiendaHTML();

        console.log(
            `[RUST STORE] Resultado fallback HTML: ${items.length} artículos.`
        );
    }

    if (
        items.length === 0
    ) {

        console.log(
            "[RUST STORE] No se encontraron artículos."
        );

        return [];
    }

    // =================================================
    // LIMITAR
    // =================================================

    items =
        items.slice(
            0,
            MAX_ITEMS
        );

    // =================================================
    // COMPLETAR DATOS
    // =================================================

    console.log(
        `[RUST STORE] Completando datos de ${items.length} artículos desde sus páginas detail...`
    );

    const completos = [];

    for (
        const item
        of items
    ) {

        const resultado =
            await obtenerDatosDesdeDetail(
                item
            );

        completos.push(
            resultado
        );

        await esperar(
            DETAIL_DELAY
        );
    }

    // =================================================
    // SEGUNDO INTENTO PARA DATOS FALTANTES
    // =================================================

    for (
        const item
        of completos
    ) {

        if (
            !item.imagen
        ) {

            await obtenerImagenDesdeDetailSimple(
                item
            );

            await esperar(
                DETAIL_DELAY
            );
        }

        if (
            !item.precio
        ) {

            await obtenerPrecioDesdeDetail(
                item
            );

            await esperar(
                DETAIL_DELAY
            );
        }
    }

    // =================================================
    // ELIMINAR DUPLICADOS
    // =================================================

    const unicos =
        new Map();

    for (
        const item
        of completos
    ) {

        const clave =
            item.id ||
            item.url ||
            item.nombre;

        if (
            !unicos.has(clave)
        ) {

            unicos.set(
                clave,
                item
            );
        }
    }

    const finales =
        Array.from(
            unicos.values()
        );

    // =================================================
    // ORDEN ALFABÉTICO
    // =================================================

    finales.sort(
        (a, b) =>
            a.nombre.localeCompare(
                b.nombre,
                "en",
                {
                    sensitivity:
                        "base"
                }
            )
    );

    // =================================================
    // LOG FINAL
    // =================================================

    const conImagen =
        finales.filter(
            item => !!item.imagen
        ).length;

    const conPrecio =
        finales.filter(
            item => !!item.precio
        ).length;

    console.log(
        `[RUST STORE] DATOS FINALES: ${conImagen}/${finales.length} con imagen, ${conPrecio}/${finales.length} con precio.`
    );

    console.log(
        `[RUST STORE] TOTAL FINAL: ${finales.length} artículos encontrados.`
    );

    return finales;
}

// =====================================================
// FIRMA DE LA TIENDA
// =====================================================

function generarFirmaTienda(items) {

    if (
        !Array.isArray(items)
    ) {
        return "";
    }

    const datos =
        items
            .map(item =>
                [
                    item.id || "",
                    item.nombre || "",
                    item.precio || "",
                    item.imagen || "",
                    item.url || ""
                ].join("|")
            )
            .join("\n");

    return crypto
        .createHash("sha256")
        .update(datos)
        .digest("hex");
}

// =====================================================
// EMBED
// =====================================================

function crearEmbedItem(item) {

    const embed =
        new EmbedBuilder()
            .setColor(0xE67E22)
            .setTitle(
                item.nombre ||
                "Item de Rust"
            )
            .setURL(
                item.url ||
                STEAM_STORE_URL
            )
            .setDescription(
                `💰 **${item.precio || "Precio no disponible"}**`
            )
            .setFooter({
                text:
                    "Rust Store • Steam"
            })
            .setTimestamp();

    if (
        item.imagen
    ) {

        embed.setImage(
            item.imagen
        );
    }

    const row =
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
                        item.url ||
                        STEAM_STORE_URL
                    )
            );

    return {
        embeds: [
            embed
        ],
        components: [
            row
        ]
    };
}

// =====================================================
// PUBLICAR TIENDA
// =====================================================

async function publicarTienda(
    channel,
    items
) {

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        throw new Error(
            "Canal inválido para publicar la tienda."
        );
    }

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        await channel.send({
            content:
                "❌ No encontré artículos Limited en la tienda de Rust."
        });

        return;
    }

    for (
        const item
        of items
    ) {

        try {

            const mensaje =
                crearEmbedItem(
                    item
                );

            await channel.send(
                mensaje
            );

            console.log(
                `[RUST STORE] Publicado: ${item.nombre} | ${item.precio || "SIN PRECIO"} | ${item.imagen ? "IMAGEN" : "SIN IMAGEN"}`
            );

            await esperar(
                150
            );

        } catch (error) {

            console.error(
                `[RUST STORE] Error publicando ${item.nombre}:`,
                error.message
            );
        }
    }
}

// =====================================================
// PUBLICACIÓN MANUAL /TIENDA
// =====================================================

async function publicarTiendaManual(
    interaction
) {

    const items =
        await obtenerTiendaRust();

    if (
        !items ||
        items.length === 0
    ) {

        await interaction.editReply({
            content:
                "❌ No pude encontrar artículos Limited de Rust en Steam."
        });

        return;
    }

    await publicarTienda(
        interaction.channel,
        items
    );

    await interaction.editReply({
        content:
            `✅ Tienda de Rust publicada: **${items.length} artículos**.`
    });
}

// =====================================================
// LOCK
// =====================================================

function adquirirLock() {

    const ahora =
        Date.now();

    const existente =
        rustStoreLocks.get(
            LOCK_ID
        );

    if (
        existente &&
        ahora - existente <
        LOCK_DURATION
    ) {

        return false;
    }

    rustStoreLocks.set(
        LOCK_ID,
        ahora
    );

    return true;
}

function liberarLock() {

    rustStoreLocks.delete(
        LOCK_ID
    );
}

// =====================================================
// FECHA CHILE
// =====================================================

function obtenerFechaChile() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone:
                TIMEZONE_CHILE,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(
        new Date()
    );
}

function obtenerHoraChile() {

    const partes =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    TIMEZONE_CHILE,
                hour:
                    "2-digit",
                minute:
                    "2-digit",
                hour12:
                    false,
                weekday:
                    "short"
            }
        ).formatToParts(
            new Date()
        );

    const mapa = {};

    for (
        const parte
        of partes
    ) {
        mapa[
            parte.type
        ] =
            parte.value;
    }

    return {
        dia:
            mapa.weekday,
        hora:
            parseInt(
                mapa.hour,
                10
            ) || 0,
        minuto:
            parseInt(
                mapa.minute,
                10
            ) || 0
    };
}

// =====================================================
// REVISIÓN AUTOMÁTICA
// =====================================================

async function revisarTiendaAutomatica(
    client
) {

    if (
        !client
    ) {
        return;
    }

    const lock =
        adquirirLock();

    if (!lock) {

        console.log(
            "[RUST STORE] Ya hay otra revisión ejecutándose."
        );

        return;
    }

    try {

        const hora =
            obtenerHoraChile();

        // ---------------------------------------------
        // Rust Store cambia semanalmente.
        // Jueves, viernes y sábado.
        // ---------------------------------------------

        const diasPermitidos = [
            "Thu",
            "Fri",
            "Sat"
        ];

        if (
            !diasPermitidos.includes(
                hora.dia
            )
        ) {

            console.log(
                `[RUST STORE] Hoy es ${hora.dia}. No corresponde publicar automáticamente.`
            );

            return;
        }

        const items =
            await obtenerTiendaRust();

        if (
            !items ||
            items.length === 0
        ) {

            console.log(
                "[RUST STORE] No hay artículos para publicación automática."
            );

            return;
        }

        const firma =
            generarFirmaTienda(
                items
            );

        console.log(
            `[RUST STORE] Firma tienda: ${firma}`
        );

        const configs =
            await ServerConfig.find({
                planillaChannelId: {
                    $exists: true,
                    $ne: null
                }
            });

        if (
            !configs ||
            configs.length === 0
        ) {

            console.log(
                "[RUST STORE] No hay servidores configurados para tienda."
            );

            return;
        }

        for (
            const config
            of configs
        ) {

            try {

                const guild =
                    client.guilds.cache.get(
                        config.guildId
                    );

                if (
                    !guild
                ) {
                    continue;
                }

                // -----------------------------------------
                // Canal de tienda.
                //
                // Se intenta primero configurarTiendaChannelId
                // y luego tiendaChannelId.
                // -----------------------------------------

                const channelId =
                    config.tiendaChannelId ||
                    config.configurarTiendaChannelId;

                if (
                    !channelId
                ) {
                    continue;
                }

                const channel =
                    guild.channels.cache.get(
                        channelId
                    );

                if (
                    !channel ||
                    !channel.isTextBased()
                ) {
                    continue;
                }

                // -----------------------------------------
                // Evitar publicar la misma tienda
                // -----------------------------------------

                if (
                    config.rustStoreSignature ===
                    firma
                ) {

                    console.log(
                        `[RUST STORE] ${guild.name}: tienda ya publicada.`
                    );

                    continue;
                }

                console.log(
                    `[RUST STORE] Publicando tienda automática en ${guild.name}...`
                );

                await publicarTienda(
                    channel,
                    items
                );

                await ServerConfig.updateOne(
                    {
                        _id:
                            config._id
                    },
                    {
                        $set: {
                            rustStoreSignature:
                                firma,
                            rustStoreLastDate:
                                obtenerFechaChile()
                        }
                    }
                );

            } catch (error) {

                console.error(
                    `[RUST STORE] Error servidor ${config.guildId}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "[RUST STORE] Error revisión automática:",
            error
        );

    } finally {

        liberarLock();
    }
}

// =====================================================
// INICIAR AUTOMÁTICO
// =====================================================

let intervaloRustStore = null;

function iniciarTiendaAutomatica(
    client
) {

    if (
        intervaloRustStore
    ) {

        console.log(
            "[RUST STORE] La tienda automática ya estaba iniciada."
        );

        return;
    }

    console.log(
        "[RUST STORE] Tienda automática iniciada."
    );

    intervaloRustStore =
        setInterval(
            async () => {

                try {

                    await revisarTiendaAutomatica(
                        client
                    );

                } catch (error) {

                    console.error(
                        "[RUST STORE] Error en intervalo automático:",
                        error
                    );
                }

            },
            CHECK_INTERVAL
        );
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    obtenerTiendaRust,
    generarFirmaTienda,
    crearEmbedItem,
    publicarTienda,
    publicarTiendaManual,
    revisarTiendaAutomatica,
    iniciarTiendaAutomatica
};