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

let rustStoreLocks =
    global.__rustStoreLocks;

if (!rustStoreLocks) {
    rustStoreLocks = new Map();
    global.__rustStoreLocks =
        rustStoreLocks;
}

// =====================================================
// AXIOS
// =====================================================

const steamClient =
    axios.create({
        timeout: 30000,
        maxRedirects: 5,

        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",

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

    if (
        valor === undefined ||
        valor === null
    ) {
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

    const texto =
        String(valor)
            .replace(/&nbsp;/gi, " ")
            .replace(/\s+/g, " ")
            .trim();

    const match =
        texto.match(
            /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?|€\s*\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s*€|£\s*\d+(?:[.,]\d{1,2})?|USD\s*\d+(?:[.,]\d{1,2})?|EUR\s*\d+(?:[.,]\d{1,2})?|GBP\s*\d+(?:[.,]\d{1,2})?/i
        );

    if (!match) {
        return "";
    }

    return normalizarTexto(
        match[0]
    );
}

// =====================================================
// IMÁGENES
// =====================================================

function esImagenSteam(url) {

    if (!url) {
        return false;
    }

    const texto =
        String(url).trim();

    if (
        !/^https?:\/\//i.test(
            texto
        )
    ) {
        return false;
    }

    return (
        texto.includes(
            "/economy/image/"
        ) ||
        texto.includes(
            "steamstatic.com/economy/image"
        ) ||
        texto.includes(
            "steamcommunity.com/economy/image"
        ) ||
        texto.includes(
            "images.steamusercontent.com"
        )
    );
}

function normalizarImagenSteam(url) {

    if (!url) {
        return null;
    }

    let imagen =
        String(url)
            .trim()
            .replace(
                /^['"]|['"]$/g,
                ""
            );

    if (
        imagen.startsWith("//")
    ) {
        imagen =
            "https:" +
            imagen;
    }

    if (
        imagen.startsWith(
            "/economy/image/"
        )
    ) {
        imagen =
            STEAM_BASE_URL +
            imagen;
    }

    if (
        esImagenSteam(imagen)
    ) {
        return imagen;
    }

    return null;
}

function buscarImagenReal($) {

    let encontrada =
        null;

    $("img").each(
        (i, elemento) => {

            if (encontrada) {
                return;
            }

            const candidatos = [
                $(elemento).attr("src"),
                $(elemento).attr("data-src"),
                $(elemento).attr("data-original"),
                $(elemento).attr("data-image"),
                $(elemento).attr("data-image-url"),
                $(elemento).attr("data-full-image"),
                $(elemento).attr("data-large-image")
            ];

            for (
                const candidato
                of candidatos
            ) {

                if (!candidato) {
                    continue;
                }

                const valor =
                    String(candidato)
                        .split(",")[0]
                        .trim()
                        .split(" ")[0];

                const imagen =
                    normalizarImagenSteam(
                        valor
                    );

                if (imagen) {
                    encontrada =
                        imagen;
                    return;
                }
            }
        }
    );

    if (encontrada) {
        return encontrada;
    }

    const atributos = [
        "data-src",
        "data-original",
        "data-image-url",
        "data-full-image",
        "data-large-image",
        "content"
    ];

    for (
        const atributo
        of atributos
    ) {

        $(
            `[${atributo}]`
        ).each(
            (i, elemento) => {

                if (encontrada) {
                    return;
                }

                const valor =
                    $(elemento).attr(
                        atributo
                    );

                const imagen =
                    normalizarImagenSteam(
                        valor
                    );

                if (imagen) {
                    encontrada =
                        imagen;
                }
            }
        );

        if (encontrada) {
            break;
        }
    }

    return encontrada;
}

// =====================================================
// PRECIO
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

    for (
        const selector
        of selectores
    ) {

        $(selector).each(
            (i, elemento) => {

                if (precio) {
                    return;
                }

                const encontrado =
                    limpiarPrecio(
                        $(elemento).text()
                    );

                if (encontrado) {
                    precio =
                        encontrado;
                }
            }
        );

        if (precio) {
            break;
        }
    }

    if (precio) {
        return precio;
    }

    return limpiarPrecio(
        $("body").text()
    );
}

function buscarPrecioDesdeHTML(html) {

    if (!html) {
        return "";
    }

    const texto =
        String(html)
            .replace(
                /\\"/g,
                '"'
            )
            .replace(
                /\\u0026/g,
                "&"
            )
            .replace(
                /\\u003c/g,
                "<"
            )
            .replace(
                /\\u003e/g,
                ">"
            )
            .replace(
                /\\u0027/g,
                "'"
            );

    const patrones = [
        /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?/gi,
        /€\s*\d+(?:[.,]\d{1,2})?/gi,
        /\d+(?:[.,]\d{1,2})?\s*€/gi,
        /£\s*\d+(?:[.,]\d{1,2})?/gi,
        /USD\s*\d+(?:[.,]\d{1,2})?/gi,
        /EUR\s*\d+(?:[.,]\d{1,2})?/gi,
        /GBP\s*\d+(?:[.,]\d{1,2})?/gi
    ];

    for (
        const patron
        of patrones
    ) {

        const matches =
            texto.match(
                patron
            );

        if (!matches) {
            continue;
        }

        for (
            const candidato
            of matches
        ) {

            const precio =
                limpiarPrecio(
                    candidato
                );

            if (precio) {
                return precio;
            }
        }
    }

    return "";
}

// =====================================================
// DETAIL
// =====================================================

async function obtenerDatosDesdeDetail(item) {

    if (!item.url) {
        return item;
    }

    try {

        const response =
            await steamClient.get(
                item.url,
                {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",

                        "Accept-Language":
                            "en-US,en;q=0.9",

                        "Referer":
                            STEAM_STORE_URL
                    }
                }
            );

        const html =
            response.data;

        const $ =
            cheerio.load(
                html
            );

        // ---------------------------------------------
        // IMAGEN
        // ---------------------------------------------

        let imagen =
            buscarImagenReal($);

        if (!imagen) {

            const metas = [
                $('meta[property="og:image"]').attr("content"),
                $('meta[name="twitter:image"]').attr("content"),
                $('meta[property="twitter:image"]').attr("content")
            ];

            for (
                const meta
                of metas
            ) {

                const candidata =
                    normalizarImagenSteam(
                        meta
                    );

                if (candidata) {
                    imagen =
                        candidata;
                    break;
                }
            }
        }

        // ---------------------------------------------
        // NOMBRE
        // ---------------------------------------------

        if (
            !item.nombre ||
            item.nombre.startsWith(
                "Item Rust "
            )
        ) {

            const posiblesNombres = [
                $("h1").first().text(),
                $(".item_name").first().text(),
                $(".itemstore_item_name").first().text(),
                $('meta[property="og:title"]').attr("content"),
                $("title").first().text()
            ];

            for (
                const nombre
                of posiblesNombres
            ) {

                const limpio =
                    normalizarTexto(
                        nombre
                    );

                if (
                    limpio &&
                    !limpio.toLowerCase().includes(
                        "steam"
                    )
                ) {

                    item.nombre =
                        limpio;

                    break;
                }
            }
        }

        // ---------------------------------------------
        // PRECIO
        // ---------------------------------------------

        let precio =
            buscarPrecio($);

        if (!precio) {
            precio =
                buscarPrecioDesdeHTML(
                    html
                );
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
            `[RUST STORE] Error detail ${item.id}:`,
            error.message
        );

        return item;
    }
}

// =====================================================
// EXTRAER CUALQUIER ID ITEMDEF
// =====================================================

function pareceItemDef(obj) {

    if (
        !obj ||
        typeof obj !== "object"
    ) {
        return false;
    }

    const claves =
        Object.keys(obj)
            .map(
                key =>
                    key.toLowerCase()
            );

    return (
        claves.includes(
            "name"
        ) ||
        claves.includes(
            "name_english"
        ) ||
        claves.includes(
            "store_tags"
        ) ||
        claves.includes(
            "price"
        ) ||
        claves.includes(
            "price_category"
        ) ||
        claves.includes(
            "icon_url"
        ) ||
        claves.includes(
            "store_images"
        )
    );
}

// =====================================================
// RECOLECTAR ITEMDEFS
//
// Steam puede devolver:
// 1. array de objetos
// 2. objeto con itemdefid
// 3. objeto indexado por "70610"
// 4. objetos anidados
// =====================================================

function recolectarItemDefs(
    data
) {

    const resultado =
        new Map();

    const vistos =
        new Set();

    function recorrer(
        nodo,
        clavePadre = ""
    ) {

        if (
            nodo === null ||
            nodo === undefined
        ) {
            return;
        }

        if (
            typeof nodo !== "object"
        ) {
            return;
        }

        if (
            vistos.has(nodo)
        ) {
            return;
        }

        vistos.add(
            nodo
        );

        // ---------------------------------------------
        // Objeto que contiene itemdefid
        // ---------------------------------------------

        let id = "";

        const posiblesIds = [
            nodo.itemdefid,
            nodo.item_def_id,
            nodo.itemDefId,
            nodo.itemdef_id,
            nodo.id
        ];

        for (
            const posible
            of posiblesIds
        ) {

            if (
                posible !== undefined &&
                posible !== null &&
                /^\d+$/.test(
                    String(posible)
                )
            ) {

                id =
                    String(posible);

                break;
            }
        }

        // ---------------------------------------------
        // Si la clave padre es un ID numérico,
        // también sirve.
        // ---------------------------------------------

        if (
            !id &&
            /^\d+$/.test(
                String(clavePadre)
            ) &&
            pareceItemDef(nodo)
        ) {

            id =
                String(clavePadre);
        }

        if (id) {

            if (
                !resultado.has(id)
            ) {

                resultado.set(
                    id,
                    nodo
                );
            }
        }

        // ---------------------------------------------
        // Recorrer propiedades
        // ---------------------------------------------

        if (
            Array.isArray(nodo)
        ) {

            for (
                const elemento
                of nodo
            ) {

                recorrer(
                    elemento,
                    ""
                );
            }

        } else {

            for (
                const [clave, valor]
                of Object.entries(
                    nodo
                )
            ) {

                if (
                    valor &&
                    typeof valor ===
                    "object"
                ) {

                    recorrer(
                        valor,
                        clave
                    );
                }
            }
        }
    }

    recorrer(
        data
    );

    return resultado;
}

// =====================================================
// TAGS
// =====================================================

function obtenerTags(itemdef) {

    if (!itemdef) {
        return [];
    }

    const resultado = [];

    const posibles = [
        itemdef.store_tags,
        itemdef.storeTags,
        itemdef.store_tag,
        itemdef.tags,
        itemdef.tag
    ];

    for (
        const valor
        of posibles
    ) {

        if (!valor) {
            continue;
        }

        if (
            Array.isArray(valor)
        ) {

            for (
                const tag
                of valor
            ) {

                resultado.push(
                    String(tag)
                );
            }

        } else {

            const texto =
                String(valor);

            texto
                .split(/[;,|]/)
                .forEach(
                    tag => {

                        if (
                            tag.trim()
                        ) {

                            resultado.push(
                                tag.trim()
                            );
                        }
                    }
                );
        }
    }

    return resultado;
}

function esLimited(itemdef) {

    const tags =
        obtenerTags(
            itemdef
        );

    return tags.some(
        tag =>
            String(tag)
                .toLowerCase()
                .includes(
                    "limited"
                )
    );
}

// =====================================================
// NOMBRE ITEMDEF
// =====================================================

function obtenerNombre(itemdef) {

    if (!itemdef) {
        return "";
    }

    const posibles = [
        itemdef.name,
        itemdef.name_english,
        itemdef.item_name,
        itemdef.itemname,
        itemdef.display_name,
        itemdef.localized_name
    ];

    for (
        const valor
        of posibles
    ) {

        if (
            valor !== undefined &&
            valor !== null
        ) {

            const texto =
                normalizarTexto(
                    valor
                );

            if (texto) {
                return texto;
            }
        }
    }

    return "";
}

// =====================================================
// PRECIO ITEMDEF
// =====================================================

function obtenerPrecioItemDef(itemdef) {

    if (!itemdef) {
        return "";
    }

    const posibles = [
        itemdef.price,
        itemdef.price_category,
        itemdef.localized_price,
        itemdef.formatted_price
    ];

    for (
        const valor
        of posibles
    ) {

        const precio =
            limpiarPrecio(
                valor
            );

        if (precio) {
            return precio;
        }
    }

    return "";
}

// =====================================================
// CREAR ITEM
// =====================================================

function crearItemDesdeDef(
    id,
    itemdef
) {

    const nombre =
        obtenerNombre(
            itemdef
        ) ||
        `Item Rust ${id}`;

    const precio =
        obtenerPrecioItemDef(
            itemdef
        );

    return {
        id:
            String(id),

        nombre,

        precio,

        imagen:
            null,

        url:
            `${STEAM_BASE_URL}/itemstore/${STEAM_APP_ID}/detail/${encodeURIComponent(id)}/`
    };
}

// =====================================================
// AJAX ITEMDEFS
// =====================================================

async function obtenerItemDefsAjax() {

    console.log(
        "[RUST STORE] Consultando endpoint AJAX de Steam..."
    );

    const variantes = [

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

    let todos =
        new Map();

    for (
        const variante
        of variantes
    ) {

        try {

            const response =
                await steamClient.get(
                    STEAM_ITEMDEFS_URL,
                    {
                        params: {
                            start: 0,
                            count: 100,
                            json: 1,
                            searchtext: "",
                            cc:
                                variante.cc,
                            l:
                                variante.l
                        },

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
                `[RUST STORE] AJAX ${variante.cc}/${variante.l}: respuesta recibida (${typeof data})`
            );

            // -----------------------------------------
            // Mostrar estructura superior
            // -----------------------------------------

            if (
                data &&
                typeof data ===
                "object"
            ) {

                console.log(
                    `[RUST STORE] AJAX claves principales: ${Object.keys(data).slice(0, 20).join(", ")}`
                );
            }

            const encontrados =
                recolectarItemDefs(
                    data
                );

            console.log(
                `[RUST STORE] AJAX ${variante.cc}/${variante.l}: ${encontrados.size} ItemDefs detectados.`
            );

            for (
                const [id, itemdef]
                of encontrados
            ) {

                if (
                    !todos.has(id)
                ) {

                    todos.set(
                        id,
                        itemdef
                    );
                }
            }

            console.log(
                `[RUST STORE] AJAX acumulado: ${todos.size} ItemDefs.`
            );

        } catch (error) {

            console.error(
                `[RUST STORE] Error AJAX ${variante.cc}/${variante.l}:`,
                error.response?.status ||
                error.message
            );
        }

        await esperar(
            500
        );
    }

    return todos;
}

// =====================================================
// OBTENER LIMITED DESDE AJAX
// =====================================================

async function obtenerLimitedDesdeAjax() {

    const defs =
        await obtenerItemDefsAjax();

    if (
        defs.size === 0
    ) {

        console.log(
            "[RUST STORE] AJAX no entregó ItemDefs reconocibles."
        );

        return [];
    }

    let limited =
        [];

    for (
        const [id, itemdef]
        of defs
    ) {

        if (
            esLimited(
                itemdef
            )
        ) {

            limited.push(
                crearItemDesdeDef(
                    id,
                    itemdef
                )
            );
        }
    }

    console.log(
        `[RUST STORE] ItemDefs con tag Limited: ${limited.length}.`
    );

    // ---------------------------------------------
    // Diagnóstico
    // ---------------------------------------------

    if (
        limited.length === 0
    ) {

        console.log(
            "[RUST STORE] No se encontró tag Limited. Mostrando muestra de ItemDefs:"
        );

        let contador =
            0;

        for (
            const [id, itemdef]
            of defs
        ) {

            const tags =
                obtenerTags(
                    itemdef
                );

            const nombre =
                obtenerNombre(
                    itemdef
                );

            console.log(
                `[RUST STORE] DEF ${id} | ${nombre || "SIN NOMBRE"} | TAGS: ${tags.join(", ") || "SIN TAGS"}`
            );

            contador++;

            if (
                contador >= 15
            ) {
                break;
            }
        }
    }

    return limited;
}

// =====================================================
// HTML FALLBACK
// =====================================================

async function obtenerTiendaHTML() {

    console.log(
        "[RUST STORE] Usando fallback HTML de Steam..."
    );

    const resultado =
        new Map();

    try {

        const response =
            await steamClient.get(
                STEAM_STORE_URL,
                {
                    params: {
                        cc: "us",
                        l: "english"
                    }
                }
            );

        const html =
            response.data;

        const $ =
            cheerio.load(
                html
            );

        const texto =
            $("body").text();

        const totalMatch =
            texto.match(
                /(?:Showing|Mostrando)\s+\d+\s*-\s*\d+\s+(?:of|de)\s+(\d+)/i
            );

        if (totalMatch) {

            console.log(
                `[RUST STORE] Steam indica ${totalMatch[1]} resultados totales.`
            );
        }

        // ---------------------------------------------
        // Buscar todos los IDs que aparezcan en HTML
        // ---------------------------------------------

        const htmlTexto =
            String(html);

        const patrones = [
            /itemdef(?:id)?["':=\\\s]+(\d{4,})/gi,
            /itemstore\/252490\/detail\/(\d+)/gi,
            /itemdefid[^\d]{0,20}(\d{4,})/gi
        ];

        const ids =
            new Set();

        for (
            const patron
            of patrones
        ) {

            let match;

            while (
                (match =
                    patron.exec(
                        htmlTexto
                    )) !== null
            ) {

                ids.add(
                    match[1]
                );
            }
        }

        // ---------------------------------------------
        // Links detail
        // ---------------------------------------------

        $("a").each(
            (i, elemento) => {

                const href =
                    $(elemento).attr(
                        "href"
                    );

                if (!href) {
                    return;
                }

                const match =
                    href.match(
                        /\/itemstore\/252490\/detail\/(\d+)\/?/i
                    );

                if (match) {
                    ids.add(
                        match[1]
                    );
                }
            }
        );

        console.log(
            `[RUST STORE] IDs detectados en HTML: ${ids.size}`
        );

        // ---------------------------------------------
        // Crear items
        // ---------------------------------------------

        for (
            const id
            of ids
        ) {

            if (
                resultado.has(id)
            ) {
                continue;
            }

            let nombre =
                "";

            const enlace =
                $(
                    `a[href*="/itemstore/252490/detail/${id}"]`
                ).first();

            if (
                enlace.length
            ) {

                nombre =
                    normalizarTexto(
                        enlace.text()
                    );

                if (!nombre) {

                    nombre =
                        normalizarTexto(
                            enlace.attr(
                                "title"
                            )
                        );
                }
            }

            resultado.set(
                id,
                {
                    id,
                    nombre:
                        nombre ||
                        `Item Rust ${id}`,
                    precio: "",
                    imagen: null,
                    url:
                        `${STEAM_BASE_URL}/itemstore/252490/detail/${id}/`
                }
            );
        }

    } catch (error) {

        console.error(
            "[RUST STORE] Error fallback HTML:",
            error.message
        );
    }

    const items =
        Array.from(
            resultado.values()
        );

    console.log(
        `[RUST STORE] Fallback HTML: ${items.length} artículos encontrados.`
    );

    return items;
}

// =====================================================
// BUSCAR IDs ADICIONALES DESDE LA PÁGINA
// =====================================================

async function buscarIDsAdicionales() {

    console.log(
        "[RUST STORE] Buscando IDs adicionales en respuestas alternativas de Steam..."
    );

    const resultado =
        new Map();

    const urls = [

        "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited&cc=us&l=english",

        "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited&cc=cl&l=english",

        "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited&cc=us&l=spanish"
    ];

    for (
        const url
        of urls
    ) {

        try {

            const response =
                await steamClient.get(
                    url
                );

            const html =
                String(
                    response.data
                );

            // -----------------------------------------
            // IDs numéricos asociados a itemdefs
            // -----------------------------------------

            const patrones = [

                /itemdefid["'\s:=\\]+(\d{4,})/gi,

                /item_def_id["'\s:=\\]+(\d{4,})/gi,

                /itemdef_id["'\s:=\\]+(\d{4,})/gi,

                /detail\/(\d{4,})/gi,

                /"(\d{5,})"\s*:\s*\{[^{}]{0,2000}(?:store_tags|price|name)/gi
            ];

            for (
                const patron
                of patrones
            ) {

                let match;

                while (
                    (match =
                        patron.exec(
                            html
                        )) !== null
                ) {

                    const id =
                        match[1];

                    if (
                        id &&
                        /^\d+$/.test(
                            id
                        )
                    ) {

                        resultado.set(
                            id,
                            true
                        );
                    }
                }
            }

        } catch (error) {

            console.error(
                "[RUST STORE] Error buscando IDs adicionales:",
                error.message
            );
        }

        await esperar(
            250
        );
    }

    console.log(
        `[RUST STORE] IDs adicionales detectados: ${resultado.size}`
    );

    return Array.from(
        resultado.keys()
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
    // 1. AJAX
    // =================================================

    let items =
        await obtenerLimitedDesdeAjax();

    // =================================================
    // 2. FALLBACK HTML
    // =================================================

    if (
        items.length === 0
    ) {

        console.log(
            "[RUST STORE] AJAX no pudo identificar Limited. Usando fallback HTML."
        );

        items =
            await obtenerTiendaHTML();
    }

    // =================================================
    // 3. IDs ADICIONALES
    // =================================================

    const idsAdicionales =
        await buscarIDsAdicionales();

    // Agregar los que todavía no estén
    const existentes =
        new Set(
            items.map(
                item =>
                    String(item.id)
            )
        );

    for (
        const id
        of idsAdicionales
    ) {

        if (
            existentes.has(
                String(id)
            )
        ) {
            continue;
        }

        items.push({
            id:
                String(id),

            nombre:
                `Item Rust ${id}`,

            precio:
                "",

            imagen:
                null,

            url:
                `${STEAM_BASE_URL}/itemstore/252490/detail/${encodeURIComponent(id)}/`
        });

        existentes.add(
            String(id)
        );
    }

    // =================================================
    // 4. ELIMINAR IDS QUE NO SEAN ITEMDEFS VÁLIDOS
    // =================================================

    items =
        items.filter(
            item =>
                item &&
                /^\d+$/.test(
                    String(item.id)
                )
        );

    // =================================================
    // 5. LIMITAR
    // =================================================

    items =
        items.slice(
            0,
            MAX_ITEMS
        );

    console.log(
        `[RUST STORE] Total de candidatos antes de detalles: ${items.length}`
    );

    if (
        items.length === 0
    ) {

        console.log(
            "[RUST STORE] No se encontraron artículos."
        );

        return [];
    }

    // =================================================
    // 6. COMPLETAR DETALLES
    // =================================================

    console.log(
        `[RUST STORE] Completando datos de ${items.length} artículos desde sus páginas detail...`
    );

    const completos =
        [];

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
    // 7. ELIMINAR DUPLICADOS
    // =================================================

    const unicos =
        new Map();

    for (
        const item
        of completos
    ) {

        const clave =
            String(
                item.id
            );

        if (
            !unicos.has(
                clave
            )
        ) {

            unicos.set(
                clave,
                item
            );
        }
    }

    let finales =
        Array.from(
            unicos.values()
        );

    // =================================================
    // 8. ORDENAR
    // =================================================

    finales.sort(
        (a, b) =>
            String(
                a.nombre
            ).localeCompare(
                String(
                    b.nombre
                ),
                "en",
                {
                    sensitivity:
                        "base"
                }
            )
    );

    // =================================================
    // 9. DATOS FINALES
    // =================================================

    const conImagen =
        finales.filter(
            item =>
                !!item.imagen
        ).length;

    const conPrecio =
        finales.filter(
            item =>
                !!item.precio
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
// FIRMA
// =====================================================

function generarFirmaTienda(
    items
) {

    if (
        !Array.isArray(items)
    ) {
        return "";
    }

    const datos =
        items
            .map(
                item =>
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
        .createHash(
            "sha256"
        )
        .update(
            datos
        )
        .digest(
            "hex"
        );
}

// =====================================================
// EMBED
// =====================================================

function crearEmbedItem(
    item
) {

    const embed =
        new EmbedBuilder()
            .setColor(
                0xE67E22
            )
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
// PUBLICAR
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

            await channel.send(
                crearEmbedItem(
                    item
                )
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
// /TIENDA
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

            year:
                "numeric",

            month:
                "2-digit",

            day:
                "2-digit"
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
        )
        .formatToParts(
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
// AUTOMÁTICO
// =====================================================

async function revisarTiendaAutomatica(
    client
) {

    if (!client) {
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

            return;
        }

        const items =
            await obtenerTiendaRust();

        if (
            !items ||
            items.length === 0
        ) {
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
                tiendaChannelId: {
                    $exists:
                        true,

                    $ne:
                        null
                }
            });

        if (
            !configs ||
            configs.length === 0
        ) {

            console.log(
                "[RUST STORE] No hay canales configurados para tienda."
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

                if (!guild) {
                    continue;
                }

                const channel =
                    guild.channels.cache.get(
                        config.tiendaChannelId
                    );

                if (
                    !channel ||
                    !channel.isTextBased()
                ) {
                    continue;
                }

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

let intervaloRustStore =
    null;

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
                        "[RUST STORE] Error intervalo automático:",
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