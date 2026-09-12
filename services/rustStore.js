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

const STEAM_STORE_URL =
    "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited";

const STEAM_BASE_URL =
    "https://store.steampowered.com";

const TIMEZONE_CHILE =
    "America/Santiago";

const MAX_ITEMS =
    100;

const STEAM_PAGE_SIZE =
    12;

const MAX_PAGES =
    20;

const CHECK_INTERVAL =
    10 * 60 * 1000;

const REQUEST_DELAY =
    250;

const DETAIL_DELAY =
    150;

// =====================================================
// PROTECCIÓN CONTRA DUPLICADOS
// =====================================================

let tiendaRevisando = false;
let tiendaAutomaticaIniciada = false;

const INSTANCE_ID =
    `${process.pid}-${crypto.randomUUID()}`;

const LOCK_ID =
    "rust-store-global-lock";

const LOCK_DURATION =
    5 * 60 * 1000;

// =====================================================
// HEADERS STEAM
// =====================================================

const STEAM_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "Accept-Language":
        "en-US,en;q=0.9",

    "Cache-Control":
        "no-cache",

    "Pragma":
        "no-cache",

    "Upgrade-Insecure-Requests":
        "1"
};

// =====================================================
// UTILIDADES
// =====================================================

function limpiarTexto(texto) {

    if (!texto) {
        return "";
    }

    return String(texto)
        .replace(/\u00a0/gi, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// =====================================================

function convertirUrl(url) {

    if (!url) {
        return null;
    }

    url = String(url).trim();

    if (!url) {
        return null;
    }

    try {

        if (url.startsWith("//")) {
            return `https:${url}`;
        }

        if (
            url.startsWith("http://") ||
            url.startsWith("https://")
        ) {
            return url;
        }

        return new URL(
            url,
            STEAM_BASE_URL
        ).href;

    } catch {

        return null;
    }
}

// =====================================================

function esperar(ms) {

    return new Promise(
        resolve => setTimeout(resolve, ms)
    );
}

// =====================================================
// LOCK GLOBAL MONGODB
// =====================================================

async function adquirirBloqueoTienda() {

    try {

        const collection =
            ServerConfig.db.collection(
                "rustStoreLocks"
            );

        const ahora =
            Date.now();

        const expiracion =
            ahora + LOCK_DURATION;

        try {

            await collection.deleteMany({
                lockId: LOCK_ID,
                expiresAt: {
                    $lte: ahora
                }
            });

        } catch (error) {

            console.warn(
                "[RUST STORE] No se pudo limpiar lock anterior:",
                error.message
            );
        }

        try {

            await collection.insertOne({
                lockId: LOCK_ID,
                instanceId: INSTANCE_ID,
                createdAt: ahora,
                expiresAt: expiracion
            });

            console.log(
                "[RUST STORE] Lock global adquirido."
            );

            return true;

        } catch (error) {

            if (
                error &&
                error.code === 11000
            ) {

                console.log(
                    "[RUST STORE] Otra instancia ya está publicando."
                );

                return false;
            }

            throw error;
        }

    } catch (error) {

        console.error(
            "[RUST STORE] Error adquiriendo lock:",
            error
        );

        return false;
    }
}

// =====================================================

async function liberarBloqueoTienda() {

    try {

        const collection =
            ServerConfig.db.collection(
                "rustStoreLocks"
            );

        await collection.deleteOne({
            lockId: LOCK_ID,
            instanceId: INSTANCE_ID
        });

        console.log(
            "[RUST STORE] Lock global liberado."
        );

    } catch (error) {

        console.error(
            "[RUST STORE] Error liberando lock:",
            error
        );
    }
}

// =====================================================
// FIRMA
// =====================================================

function generarFirmaTienda(items) {

    const contenido =
        items
            .map(item => {

                return [
                    item.id || "",
                    item.nombre || "",
                    item.precio || ""
                ].join("|");

            })
            .join("||");

    return crypto
        .createHash("sha256")
        .update(contenido)
        .digest("hex");
}

// =====================================================
// PRECIO
// =====================================================

function extraerPrecio(texto) {

    if (!texto) {
        return null;
    }

    const limpio =
        limpiarTexto(texto);

    // USD
    let match =
        limpio.match(
            /\$\s*\d+(?:[.,]\d{1,2})?/i
        );

    if (match) {

        return match[0]
            .replace(/\s+/g, "");
    }

    // EUR
    match =
        limpio.match(
            /€\s*\d+(?:[.,]\d{1,2})?/i
        );

    if (match) {

        return match[0]
            .replace(/\s+/g, "");
    }

    // GBP
    match =
        limpio.match(
            /£\s*\d+(?:[.,]\d{1,2})?/i
        );

    if (match) {

        return match[0]
            .replace(/\s+/g, "");
    }

    // Precio con palabra USD
    match =
        limpio.match(
            /\d+(?:[.,]\d{1,2})?\s*(?:USD|EUR|GBP)/i
        );

    if (match) {
        return match[0];
    }

    return null;
}

// =====================================================
// PRECIO DESDE HTML STEAM
// =====================================================

function extraerPrecioDesdeHtml($, html) {

    const selectores = [

        ".itemstore_item_price",
        ".itemstore_item_price_amount",
        ".itemstore_item_cost",
        ".itemstore_price",
        ".price",
        ".item_price",
        ".purchase_area",
        ".game_purchase_price",
        ".discount_final_price",
        ".final_price",
        ".price_box",
        "[class*='price']",
        "[class*='Price']"
    ];

    for (const selector of selectores) {

        try {

            const elementos =
                $(selector);

            for (
                let i = 0;
                i < elementos.length;
                i++
            ) {

                const texto =
                    limpiarTexto(
                        $(elementos[i]).text()
                    );

                const precio =
                    extraerPrecio(texto);

                if (precio) {
                    return precio;
                }
            }

        } catch {
            // continuar
        }
    }

    const precioTexto =
        extraerPrecio(
            $("body").text()
        );

    if (precioTexto) {
        return precioTexto;
    }

    if (html) {

        const precioHtml =
            extraerPrecio(
                String(html)
                    .replace(/<[^>]+>/g, " ")
            );

        if (precioHtml) {
            return precioHtml;
        }
    }

    return null;
}

// =====================================================
// IMÁGENES
// =====================================================

function convertirImagen(url) {

    if (!url) {
        return null;
    }

    url =
        convertirUrl(url);

    if (!url) {
        return null;
    }

    return url;
}

// =====================================================

function limpiarUrlImagen(url) {

    if (!url) {
        return null;
    }

    let resultado =
        String(url)
            .trim()
            .replace(/&amp;/g, "&")
            .replace(/\\u0026/g, "&")
            .replace(/\\\//g, "/")
            .replace(/^["']|["']$/g, "");

    // srcset
    if (resultado.includes(",")) {

        resultado =
            resultado
                .split(",")[0]
                .trim()
                .split(/\s+/)[0];
    }

    return convertirImagen(
        resultado
    );
}

// =====================================================
// DETECTAR SI ES UNA IMAGEN REAL DE ITEM
// =====================================================

function esImagenItemSteam(url) {

    if (!url) {
        return false;
    }

    const texto =
        String(url).toLowerCase();

    return (
        texto.includes("/economy/image/") ||
        texto.includes("community.fastly.steamstatic.com") ||
        texto.includes("community.cloudflare.steamstatic.com") ||
        texto.includes("steamcommunity.com/economy/image") ||
        texto.includes("images.steamusercontent.com")
    );
}

// =====================================================
// IMAGEN DESDE ELEMENTO
// =====================================================

function obtenerImagenElemento(
    $,
    elemento
) {

    const posibles = [

        // IMPORTANTE:
        // Primero buscamos imágenes reales del item.

        $(elemento)
            .find('img[src*="/economy/image/"]')
            .first()
            .attr("src"),

        $(elemento)
            .find('img[data-src*="/economy/image/"]')
            .first()
            .attr("data-src"),

        $(elemento)
            .find('img[data-image*="/economy/image/"]')
            .first()
            .attr("data-image"),

        $(elemento)
            .find('img[src*="community.fastly.steamstatic.com"]')
            .first()
            .attr("src"),

        $(elemento)
            .find('img[data-src*="community.fastly.steamstatic.com"]')
            .first()
            .attr("data-src"),

        $(elemento)
            .find('img[src*="images.steamusercontent.com"]')
            .first()
            .attr("src"),

        $(elemento)
            .find('img[data-src*="images.steamusercontent.com"]')
            .first()
            .attr("data-src"),

        // Después atributos generales.

        $(elemento).attr(
            "data-image"
        ),

        $(elemento).attr(
            "data-src"
        ),

        $(elemento).attr(
            "data-img"
        ),

        $(elemento).attr(
            "data-background-image"
        ),

        $(elemento).attr(
            "data-image-url"
        ),

        $(elemento).attr(
            "data-lazy-src"
        ),

        $(elemento)
            .find("img")
            .attr("src"),

        $(elemento)
            .find("img")
            .attr("data-src"),

        $(elemento)
            .find("img")
            .attr("data-lazy-src"),

        $(elemento)
            .find("img")
            .attr("data-image"),

        $(elemento)
            .find("img")
            .attr("srcset"),

        $(elemento)
            .find("source")
            .attr("src"),

        $(elemento)
            .find("source")
            .attr("srcset")
    ];

    // Primero intentar imágenes específicas
    // del item.

    for (const valor of posibles) {

        if (!valor) {
            continue;
        }

        const imagen =
            limpiarUrlImagen(valor);

        if (
            imagen &&
            esImagenItemSteam(imagen)
        ) {

            return imagen;
        }
    }

    // Luego cualquier imagen válida.

    for (const valor of posibles) {

        if (!valor) {
            continue;
        }

        const imagen =
            limpiarUrlImagen(valor);

        if (imagen) {
            return imagen;
        }
    }

    // Background-image

    const style =
        $(elemento)
            .attr("style");

    if (style) {

        const matches =
            style.matchAll(
                /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi
            );

        for (const match of matches) {

            const imagen =
                limpiarUrlImagen(
                    match[1]
                );

            if (
                imagen &&
                esImagenItemSteam(imagen)
            ) {

                return imagen;
            }
        }
    }

    return null;
}

// =====================================================
// IMAGEN META
// =====================================================

function obtenerImagenMeta($) {

    const metas = [

        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image:secure_url"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]'
    ];

    for (const selector of metas) {

        const contenido =
            $(selector).attr(
                "content"
            );

        const imagen =
            limpiarUrlImagen(
                contenido
            );

        if (
            imagen &&
            esImagenItemSteam(imagen)
        ) {

            return imagen;
        }
    }

    return null;
}

// =====================================================
// EXTRAER IMAGEN STEAM ECONOMY
// =====================================================

function extraerImagenSteamEconomy(
    html
) {

    if (!html) {
        return null;
    }

    const texto =
        String(html)
            .replace(/\\u0026/g, "&")
            .replace(/\\\//g, "/")
            .replace(/&amp;/g, "&");

    const patrones = [

        // NUEVO:
        // Steam actualmente entrega imágenes así.
        /https?:\/\/community\.fastly\.steamstatic\.com\/economy\/image\/[^"'\\\s<]+/gi,

        /https?:\/\/community\.cloudflare\.steamstatic\.com\/economy\/image\/[^"'\\\s<]+/gi,

        /https?:\/\/steamcommunity\.com\/economy\/image\/[^"'\\\s<]+/gi,

        /https?:\/\/[^"'\\\s<]+steamstatic\.com\/economy\/image\/[^"'\\\s<]+/gi,

        /https?:\/\/images\.steamusercontent\.com\/[^"'\\\s<]+/gi
    ];

    const candidatas = [];

    for (const regex of patrones) {

        const coincidencias =
            texto.match(regex);

        if (!coincidencias) {
            continue;
        }

        for (let url of coincidencias) {

            url =
                url
                    .replace(/\\u0026/g, "&")
                    .replace(/\\\//g, "/")
                    .replace(/&amp;/g, "&")
                    .replace(/["']/g, "");

            const imagen =
                limpiarUrlImagen(url);

            if (
                imagen &&
                esImagenItemSteam(imagen)
            ) {

                candidatas.push(
                    imagen
                );
            }
        }
    }

    if (candidatas.length) {

        // Preferimos la imagen 512x512
        // o la primera imagen economy.

        const grande =
            candidatas.find(
                url =>
                    url.includes("512fx512f")
            );

        if (grande) {
            return grande;
        }

        return candidatas[0];
    }

    return null;
}

// =====================================================
// BUSCAR IMAGEN REAL DIRECTAMENTE EN HTML
// =====================================================

function obtenerImagenItemDesdeHtml(
    $,
    html
) {

    // =================================================
    // 1. IMG economy
    // =================================================

    const selectoresEconomy = [

        'img[src*="/economy/image/"]',
        'img[data-src*="/economy/image/"]',
        'img[data-image*="/economy/image/"]',

        'img[src*="community.fastly.steamstatic.com"]',
        'img[data-src*="community.fastly.steamstatic.com"]',

        'img[src*="community.cloudflare.steamstatic.com"]',
        'img[data-src*="community.cloudflare.steamstatic.com"]',

        'img[src*="images.steamusercontent.com"]',
        'img[data-src*="images.steamusercontent.com"]'
    ];

    for (const selector of selectoresEconomy) {

        const elementos =
            $(selector);

        for (
            let i = 0;
            i < elementos.length;
            i++
        ) {

            const elemento =
                $(elementos[i]);

            const posibles = [

                elemento.attr("src"),
                elemento.attr("data-src"),
                elemento.attr("data-image"),
                elemento.attr("data-lazy-src"),
                elemento.attr("srcset")
            ];

            for (const valor of posibles) {

                const imagen =
                    limpiarUrlImagen(
                        valor
                    );

                if (
                    imagen &&
                    esImagenItemSteam(imagen)
                ) {

                    return imagen;
                }
            }
        }
    }

    // =================================================
    // 2. Buscar directamente en todo el HTML
    // =================================================

    const imagenEconomy =
        extraerImagenSteamEconomy(
            html
        );

    if (imagenEconomy) {
        return imagenEconomy;
    }

    // =================================================
    // 3. Buscar imágenes del body
    // =================================================

    const bodyImagen =
        obtenerImagenElemento(
            $,
            $("body")
        );

    if (
        bodyImagen &&
        esImagenItemSteam(bodyImagen)
    ) {

        return bodyImagen;
    }

    return null;
}

// =====================================================
// OBTENER DATOS DESDE DETAIL
// =====================================================

async function obtenerDatosDesdeDetail(
    item
) {

    if (
        !item ||
        !item.url
    ) {
        return;
    }

    try {

        const response =
            await axios.get(
                item.url,
                {
                    headers:
                        STEAM_HEADERS,

                    timeout:
                        30000
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

        if (!item.imagen) {

            // IMPORTANTE:
            // Primero imagen REAL del artículo.
            let imagen =
                obtenerImagenItemDesdeHtml(
                    $,
                    html
                );

            // Meta solamente como último recurso.
            if (!imagen) {

                imagen =
                    obtenerImagenMeta(
                        $
                    );
            }

            if (imagen) {

                item.imagen =
                    imagen;

                console.log(
                    `[RUST STORE] Imagen encontrada: ${item.nombre} -> ${imagen}`
                );
            }
        }

        // ---------------------------------------------
        // PRECIO
        // ---------------------------------------------

        if (!item.precio) {

            const precio =
                extraerPrecioDesdeHtml(
                    $,
                    html
                );

            if (precio) {

                item.precio =
                    precio;
            }
        }

        // ---------------------------------------------
        // NOMBRE
        // ---------------------------------------------

        if (!item.nombre) {

            const posiblesNombres = [

                'meta[property="og:title"]',
                ".itemstore_item_name",
                ".item_name",
                "h1",
                "h2",
                "title"
            ];

            for (
                const selector of posiblesNombres
            ) {

                let nombre;

                if (
                    selector.startsWith(
                        "meta"
                    )
                ) {

                    nombre =
                        $(selector).attr(
                            "content"
                        );

                } else {

                    nombre =
                        $(selector)
                            .first()
                            .text();
                }

                nombre =
                    limpiarNombre(
                        nombre
                    );

                if (nombre) {

                    item.nombre =
                        nombre;

                    break;
                }
            }
        }

        console.log(
            `[RUST STORE] Detail OK: ${item.nombre} | ${item.precio || "SIN PRECIO"} | ${item.imagen ? "IMAGEN OK" : "SIN IMAGEN"}`
        );

    } catch (error) {

        console.warn(
            `[RUST STORE] No se pudo consultar detail de ${item.nombre || item.id}:`,
            error.message
        );
    }
}

// =====================================================
// NOMBRES
// =====================================================

function nombreValido(nombre) {

    if (!nombre) {
        return false;
    }

    nombre =
        limpiarTexto(nombre);

    if (!nombre) {
        return false;
    }

    if (
        nombre.length < 2 ||
        nombre.length > 200
    ) {
        return false;
    }

    const prohibidos = [

        "rust item store",
        "cart",
        "shopping cart",
        "view cart",
        "add to cart",
        "buy now",
        "limited"
    ];

    const minusculas =
        nombre.toLowerCase();

    for (const prohibido of prohibidos) {

        if (
            minusculas === prohibido ||
            minusculas.includes(
                prohibido
            )
        ) {
            return false;
        }
    }

    return true;
}

// =====================================================

function limpiarNombre(nombre) {

    if (!nombre) {
        return null;
    }

    nombre =
        limpiarTexto(nombre);

    nombre =
        nombre
            .replace(
                /^Rust\s*-\s*/i,
                ""
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    if (
        !nombreValido(nombre)
    ) {
        return null;
    }

    return nombre;
}

// =====================================================

function obtenerNombreDesdeElemento(
    $,
    elemento
) {

    const selectores = [

        ".item_name",
        ".itemstore_item_name",
        ".item_title",
        ".item_name_block",
        ".name",
        "[class*='item_name']",
        "[class*='item_title']",
        "h1",
        "h2",
        "h3",
        "h4"
    ];

    for (const selector of selectores) {

        const texto =
            limpiarNombre(
                $(elemento)
                    .find(selector)
                    .first()
                    .text()
            );

        if (texto) {
            return texto;
        }
    }

    const title =
        limpiarNombre(
            $(elemento).attr(
                "title"
            )
        );

    if (title) {
        return title;
    }

    const aria =
        limpiarNombre(
            $(elemento).attr(
                "aria-label"
            )
        );

    if (aria) {
        return aria;
    }

    return null;
}

// =====================================================
// CONTENEDOR
// =====================================================

function obtenerContenedorItem(
    $,
    elemento
) {

    const selectores = [

        ".itemstore_item",
        ".itemstore_item_block",
        ".itemstore_item_area",
        ".item",
        "[class*='itemstore_item']",
        "[class*='item_block']",
        "[class*='item_area']"
    ];

    for (const selector of selectores) {

        const padre =
            $(elemento)
                .closest(selector)
                .first();

        if (
            padre.length
        ) {
            return padre;
        }
    }

    let padre =
        $(elemento);

    for (
        let i = 0;
        i < 6;
        i++
    ) {

        padre =
            padre.parent();

        if (
            !padre.length
        ) {
            break;
        }

        const texto =
            limpiarTexto(
                padre.text()
            );

        if (
            texto &&
            texto.length < 1500
        ) {
            return padre;
        }
    }

    return $(elemento);
}

// =====================================================
// AGREGAR ITEM
// =====================================================

function agregarItem(
    items,
    vistos,
    item
) {

    if (!item) {
        return false;
    }

    const nombre =
        limpiarNombre(
            item.nombre
        );

    if (!nombre) {
        return false;
    }

    const id =
        item.id
            ? String(item.id)
            : null;

    const precio =
        item.precio || "";

    const clave =
        id
            ? `id:${id}`
            : `name:${nombre.toLowerCase()}`;

    if (
        vistos.has(clave)
    ) {
        return false;
    }

    vistos.add(clave);

    items.push({

        id,

        nombre,

        precio,

        url:
            convertirUrl(
                item.url
            ),

        imagen:
            convertirImagen(
                item.imagen
            )
    });

    return true;
}

// =====================================================
// EXTRAER DESDE ENLACES
// =====================================================

function extraerItemsDesdeEnlaces(
    $,
    items,
    vistos
) {

    let encontrados = 0;

    $(
        'a[href*="/itemstore/252490/detail/"]'
    ).each((_, enlace) => {

        if (
            items.length >=
            MAX_ITEMS
        ) {
            return;
        }

        const href =
            $(enlace).attr(
                "href"
            );

        if (!href) {
            return;
        }

        const url =
            convertirUrl(
                href
            );

        if (!url) {
            return;
        }

        const match =
            url.match(
                /\/itemstore\/252490\/detail\/([^/?#]+)/i
            );

        const id =
            match
                ? match[1]
                : null;

        const contenedor =
            obtenerContenedorItem(
                $,
                enlace
            );

        let nombre =
            obtenerNombreDesdeElemento(
                $,
                contenedor
            );

        if (!nombre) {

            nombre =
                limpiarNombre(
                    $(enlace).text()
                );
        }

        if (!nombre) {
            return;
        }

        const textoContenedor =
            limpiarTexto(
                contenedor.text()
            );

        const precio =
            extraerPrecio(
                textoContenedor
            );

        const imagen =
            obtenerImagenElemento(
                $,
                contenedor
            ) ||
            obtenerImagenElemento(
                $,
                enlace
            );

        const agregado =
            agregarItem(
                items,
                vistos,
                {
                    id,
                    nombre,
                    precio,
                    url,
                    imagen
                }
            );

        if (agregado) {
            encontrados++;
        }
    });

    return encontrados;
}

// =====================================================
// EXTRAER VISUALES
// =====================================================

function extraerItemsVisuales(
    $,
    items,
    vistos
) {

    const selectores = [

        ".itemstore_item",
        ".itemstore_item_block",
        ".itemstore_item_area",
        "[class*='itemstore_item']",
        "[class*='item_block']",
        "[class*='item_area']"
    ];

    let encontrados = 0;

    for (
        const selector of selectores
    ) {

        $(selector)
            .each((_, elemento) => {

                if (
                    items.length >=
                    MAX_ITEMS
                ) {
                    return;
                }

                const contenedor =
                    $(elemento);

                const enlace =
                    contenedor
                        .find(
                            'a[href*="/itemstore/252490/detail/"]'
                        )
                        .first();

                if (
                    !enlace.length
                ) {
                    return;
                }

                const href =
                    enlace.attr(
                        "href"
                    );

                const url =
                    convertirUrl(
                        href
                    );

                if (!url) {
                    return;
                }

                const match =
                    url.match(
                        /\/itemstore\/252490\/detail\/([^/?#]+)/i
                    );

                const id =
                    match
                        ? match[1]
                        : null;

                const nombre =
                    obtenerNombreDesdeElemento(
                        $,
                        contenedor
                    );

                if (!nombre) {
                    return;
                }

                const precio =
                    extraerPrecio(
                        limpiarTexto(
                            contenedor.text()
                        )
                    );

                const imagen =
                    obtenerImagenElemento(
                        $,
                        contenedor
                    );

                const agregado =
                    agregarItem(
                        items,
                        vistos,
                        {
                            id,
                            nombre,
                            precio,
                            url,
                            imagen
                        }
                    );

                if (agregado) {
                    encontrados++;
                }
            });

        if (
            encontrados > 0
        ) {
            break;
        }
    }

    return encontrados;
}

// =====================================================
// CONTAR ARTÍCULOS DE UNA PÁGINA
// =====================================================

function contarItemsPagina($) {

    const ids =
        new Set();

    $(
        'a[href*="/itemstore/252490/detail/"]'
    ).each((_, enlace) => {

        const href =
            $(enlace).attr(
                "href"
            );

        if (!href) {
            return;
        }

        const url =
            convertirUrl(
                href
            );

        if (!url) {
            return;
        }

        const match =
            url.match(
                /\/itemstore\/252490\/detail\/([^/?#]+)/i
            );

        if (match) {

            ids.add(
                match[1]
            );
        }
    });

    return ids.size;
}

// =====================================================
// TOTAL DE RESULTADOS DE STEAM
// =====================================================

function extraerTotalResultados($) {

    const texto =
        limpiarTexto(
            $("body").text()
        );

    const patrones = [

        /Showing\s+\d+\s*-\s*\d+\s+of\s+(\d+)\s+results?/i,

        /Mostrando\s+\d+\s*-\s*\d+\s+de\s+(\d+)\s+resultados?/i
    ];

    for (
        const patron of patrones
    ) {

        const match =
            texto.match(
                patron
            );

        if (match) {

            const total =
                parseInt(
                    match[1],
                    10
                );

            if (
                Number.isFinite(total) &&
                total > 0 &&
                total <= 1000
            ) {
                return total;
            }
        }
    }

    return null;
}

// =====================================================
// PAGINACIÓN REAL
// =====================================================

function obtenerEnlacesPaginacion($) {

    const urls =
        new Set();

    $("a").each((_, enlace) => {

        const href =
            $(enlace).attr(
                "href"
            );

        if (!href) {
            return;
        }

        if (
            !href.includes(
                "/itemstore/252490/browse/"
            )
        ) {
            return;
        }

        if (
            !/[?&]start=\d+/i.test(
                href
            )
        ) {
            return;
        }

        const url =
            convertirUrl(
                href
            );

        if (url) {
            urls.add(url);
        }
    });

    return [...urls];
}

// =====================================================
// OBTENER SIGUIENTE START
// =====================================================

function obtenerSiguienteStart(
    $,
    startActual
) {

    const candidatos =
        [];

    const enlaces =
        obtenerEnlacesPaginacion(
            $
        );

    for (
        const url of enlaces
    ) {

        const match =
            url.match(
                /[?&]start=(\d+)/i
            );

        if (!match) {
            continue;
        }

        const numero =
            parseInt(
                match[1],
                10
            );

        if (
            Number.isFinite(numero) &&
            numero > startActual
        ) {
            candidatos.push(
                numero
            );
        }
    }

    if (
        !candidatos.length
    ) {
        return null;
    }

    candidatos.sort(
        (a, b) => a - b
    );

    return candidatos[0];
}

// =====================================================
// OBTENER TIENDA RUST
// =====================================================

async function obtenerTiendaRust() {

    console.log(
        "[RUST STORE] Consultando Steam..."
    );

    const variantes = [

        {
            cc: "us",
            language: "english"
        },

        {
            cc: "cl",
            language: "english"
        },

        {
            cc: "cl",
            language: "spanish"
        }
    ];

    let mejorResultado =
        [];

    for (
        const variante of variantes
    ) {

        const items =
            [];

        const vistos =
            new Set();

        try {

            console.log(
                `[RUST STORE] Probando Steam cc=${variante.cc} lang=${variante.language}`
            );

            let pagina =
                0;

            let start =
                0;

            const startsVisitados =
                new Set();

            let totalSteam =
                null;

            while (
                pagina < MAX_PAGES &&
                items.length < MAX_ITEMS
            ) {

                if (
                    startsVisitados.has(
                        start
                    )
                ) {
                    break;
                }

                startsVisitados.add(
                    start
                );

                const url =
                    new URL(
                        STEAM_STORE_URL
                    );

                url.searchParams.set(
                    "start",
                    String(start)
                );

                url.searchParams.set(
                    "count",
                    String(STEAM_PAGE_SIZE)
                );

                url.searchParams.set(
                    "cc",
                    variante.cc
                );

                url.searchParams.set(
                    "l",
                    variante.language
                );

                const urlFinal =
                    url.href;

                console.log(
                    `[RUST STORE] Página ${pagina + 1}: start=${start}`
                );

                const response =
                    await axios.get(
                        urlFinal,
                        {
                            headers:
                                STEAM_HEADERS,

                            timeout:
                                30000
                        }
                    );

                const html =
                    response.data;

                const $ =
                    cheerio.load(
                        html
                    );

                const totalPagina =
                    extraerTotalResultados(
                        $
                    );

                if (
                    totalPagina &&
                    (
                        !totalSteam ||
                        totalPagina > totalSteam
                    )
                ) {

                    totalSteam =
                        totalPagina;

                    console.log(
                        `[RUST STORE] Steam indica ${totalSteam} resultados totales.`
                    );
                }

                const antes =
                    items.length;

                const cantidadPagina =
                    contarItemsPagina(
                        $
                    );

                extraerItemsDesdeEnlaces(
                    $,
                    items,
                    vistos
                );

                extraerItemsVisuales(
                    $,
                    items,
                    vistos
                );

                const nuevos =
                    items.length -
                    antes;

                console.log(
                    `[RUST STORE] Página ${pagina + 1}: ${cantidadPagina} detectados, ${nuevos} nuevos. Total acumulado: ${items.length}`
                );

                if (
                    totalSteam &&
                    items.length >=
                    totalSteam
                ) {

                    console.log(
                        `[RUST STORE] Se alcanzó el total de Steam: ${items.length}/${totalSteam}.`
                    );

                    break;
                }

                if (
                    nuevos === 0
                ) {

                    console.log(
                        "[RUST STORE] La página no agregó artículos nuevos."
                    );

                    const siguienteReal =
                        obtenerSiguienteStart(
                            $,
                            start
                        );

                    if (
                        siguienteReal === null
                    ) {
                        break;
                    }

                    start =
                        siguienteReal;

                    pagina++;

                    continue;
                }

                let siguienteStart =
                    obtenerSiguienteStart(
                        $,
                        start
                    );

                if (
                    siguienteStart === null
                ) {

                    siguienteStart =
                        start +
                        STEAM_PAGE_SIZE;
                }

                if (
                    siguienteStart <=
                    start
                ) {
                    break;
                }

                start =
                    siguienteStart;

                pagina++;

                await esperar(
                    REQUEST_DELAY
                );
            }

            console.log(
                `[RUST STORE] Variante ${variante.cc}/${variante.language}: ${items.length} artículos encontrados.`
            );

            if (
                items.length >
                mejorResultado.length
            ) {

                mejorResultado =
                    items;
            }

        } catch (error) {

            console.error(
                `[RUST STORE] Error con cc=${variante.cc} lang=${variante.language}:`,
                error.message
            );
        }
    }

    if (
        !mejorResultado.length
    ) {

        console.error(
            "[RUST STORE] No se pudieron obtener artículos de Steam."
        );

        return [];
    }

    console.log(
        `[RUST STORE] Mejor resultado inicial: ${mejorResultado.length} artículos.`
    );

    // =================================================
    // COMPLETAR DATOS
    // =================================================

    const faltanDatos =
        mejorResultado.filter(
            item =>
                item.url &&
                (
                    !item.imagen ||
                    !item.precio
                )
        );

    if (
        faltanDatos.length
    ) {

        console.log(
            `[RUST STORE] Completando datos de ${faltanDatos.length} artículos desde sus páginas detail...`
        );

        const loteSize =
            3;

        for (
            let i = 0;
            i < faltanDatos.length;
            i += loteSize
        ) {

            const lote =
                faltanDatos.slice(
                    i,
                    i + loteSize
                );

            await Promise.all(
                lote.map(
                    item =>
                        obtenerDatosDesdeDetail(
                            item
                        )
                )
            );

            if (
                i + loteSize <
                faltanDatos.length
            ) {

                await esperar(
                    DETAIL_DELAY
                );
            }
        }
    }

    // =================================================
    // SEGUNDO INTENTO SOLO PARA IMÁGENES
    // =================================================

    const sinImagen =
        mejorResultado.filter(
            item =>
                !item.imagen &&
                item.url
        );

    if (
        sinImagen.length
    ) {

        console.log(
            `[RUST STORE] Segundo intento de imágenes: ${sinImagen.length}`
        );

        for (
            const item of sinImagen
        ) {

            try {

                const imagen =
                    await obtenerImagenDesdeDetailSimple(
                        item.url
                    );

                if (imagen) {

                    item.imagen =
                        imagen;

                    console.log(
                        `[RUST STORE] Segunda búsqueda de imagen OK: ${item.nombre}`
                    );
                }

            } catch {
                // ignorar
            }

            await esperar(
                DETAIL_DELAY
            );
        }
    }

    // =================================================
    // SEGUNDO INTENTO PARA PRECIOS
    // =================================================

    const sinPrecio =
        mejorResultado.filter(
            item =>
                !item.precio &&
                item.url
        );

    if (
        sinPrecio.length
    ) {

        console.log(
            `[RUST STORE] Segundo intento de precios: ${sinPrecio.length}`
        );

        for (
            const item of sinPrecio
        ) {

            try {

                const precio =
                    await obtenerPrecioDesdeDetail(
                        item.url
                    );

                if (precio) {

                    item.precio =
                        precio;
                }

            } catch {
                // ignorar
            }

            await esperar(
                DETAIL_DELAY
            );
        }
    }

    // =================================================
    // RESUMEN FINAL
    // =================================================

    let conImagen =
        0;

    let conPrecio =
        0;

    for (
        const item of mejorResultado
    ) {

        if (item.imagen) {
            conImagen++;
        }

        if (item.precio) {
            conPrecio++;
        }
    }

    console.log(
        `[RUST STORE] DATOS FINALES: ${conImagen}/${mejorResultado.length} con imagen, ${conPrecio}/${mejorResultado.length} con precio.`
    );

    console.log(
        `[RUST STORE] TOTAL FINAL: ${mejorResultado.length} artículos encontrados.`
    );

    return mejorResultado.slice(
        0,
        MAX_ITEMS
    );
}

// =====================================================
// OBTENER IMAGEN SIMPLE DESDE DETAIL
// =====================================================

async function obtenerImagenDesdeDetailSimple(
    url
) {

    const response =
        await axios.get(
            url,
            {
                headers:
                    STEAM_HEADERS,

                timeout:
                    30000
            }
        );

    const html =
        response.data;

    const $ =
        cheerio.load(
            html
        );

    // PRIMERO imagen real
    let imagen =
        obtenerImagenItemDesdeHtml(
            $,
            html
        );

    if (imagen) {
        return imagen;
    }

    // META como último recurso
    imagen =
        obtenerImagenMeta(
            $
        );

    if (imagen) {
        return imagen;
    }

    return null;
}

// =====================================================
// OBTENER PRECIO SIMPLE DESDE DETAIL
// =====================================================

async function obtenerPrecioDesdeDetail(
    url
) {

    const response =
        await axios.get(
            url,
            {
                headers:
                    STEAM_HEADERS,

                timeout:
                    30000
            }
        );

    const html =
        response.data;

    const $ =
        cheerio.load(
            html
        );

    return extraerPrecioDesdeHtml(
        $,
        html
    );
}

// =====================================================
// EMBED
// =====================================================

function crearEmbedItem(item) {

    const descripcion =
        [];

    if (
        item.precio
    ) {

        descripcion.push(
            `💰 **Precio:** ${item.precio}`
        );

    } else {

        descripcion.push(
            "💰 **Precio:** No disponible"
        );
    }

    if (
        item.url
    ) {

        descripcion.push(
            `🔗 [Ver artículo en Steam](${item.url})`
        );
    }

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🎨 ${item.nombre}`
            )
            .setDescription(
                descripcion.join(
                    "\n\n"
                )
            )
            .setColor(
                0xff6a00
            )
            .setFooter({
                text:
                    "RustLogix • Rust Item Store"
            });

    if (
        item.url
    ) {

        embed.setURL(
            item.url
        );
    }

    if (
        item.imagen
    ) {

        embed.setImage(
            item.imagen
        );
    }

    return embed;
}

// =====================================================
// BOTÓN
// =====================================================

function crearBotonItem(item) {

    if (
        !item.url
    ) {
        return null;
    }

    return new ActionRowBuilder()
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
}

// =====================================================
// PUBLICAR UN ARTÍCULO
// =====================================================

async function publicarItem(
    channel,
    item
) {

    try {

        const row =
            crearBotonItem(
                item
            );

        await channel.send({

            embeds: [
                crearEmbedItem(
                    item
                )
            ],

            components:
                row
                    ? [row]
                    : []
        });

        console.log(
            `[RUST STORE] Publicado: ${item.nombre} | ${item.precio || "SIN PRECIO"} | ${item.imagen ? "IMAGEN" : "SIN IMAGEN"}`
        );

        return true;

    } catch (error) {

        console.error(
            "[RUST STORE] Error publicando artículo:",
            error.message
        );

        return false;
    }
}

// =====================================================
// PUBLICAR TIENDA COMPLETA
// =====================================================

async function publicarTienda(
    channel
) {

    if (!channel) {
        return 0;
    }

    const items =
        await obtenerTiendaRust();

    if (
        !items.length
    ) {

        console.warn(
            "[RUST STORE] No hay artículos para publicar."
        );

        return 0;
    }

    let publicados =
        0;

    for (
        const item of items
    ) {

        const publicado =
            await publicarItem(
                channel,
                item
            );

        if (publicado) {
            publicados++;
        }

        await esperar(
            350
        );
    }

    console.log(
        `[RUST STORE] Publicados ${publicados}/${items.length} artículos.`
    );

    return publicados;
}

// =====================================================
// PUBLICACIÓN MANUAL /TIENDA
// =====================================================

async function publicarTiendaManual(
    interaction
) {

    try {

        if (
            !interaction.deferred &&
            !interaction.replied
        ) {

            await interaction.deferReply();
        }

        const items =
            await obtenerTiendaRust();

        if (
            !items.length
        ) {

            await interaction.editReply(
                "❌ No se pudieron obtener los artículos de la tienda de Rust."
            );

            return;
        }

        await interaction.editReply(
            `🔎 Se encontraron **${items.length} artículos**. Publicando...`
        );

        let publicados =
            0;

        for (
            const item of items
        ) {

            const publicado =
                await publicarItem(
                    interaction.channel,
                    item
                );

            if (publicado) {
                publicados++;
            }

            await esperar(
                350
            );
        }

        await interaction.editReply(
            `✅ Tienda publicada correctamente.\n\n🎨 **${publicados}/${items.length} artículos publicados.**`
        );

    } catch (error) {

        console.error(
            "[RUST STORE] Error en /tienda:",
            error
        );

        try {

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply(
                    "❌ Ocurrió un error al publicar la tienda."
                );

            } else {

                await interaction.reply({
                    content:
                        "❌ Ocurrió un error al publicar la tienda.",

                    ephemeral:
                        true
                });
            }

        } catch (replyError) {

            console.error(
                "[RUST STORE] No se pudo responder el error:",
                replyError.message
            );
        }
    }
}

// =====================================================
// REVISIÓN AUTOMÁTICA
// =====================================================

async function revisarTiendaAutomatica(
    client
) {

    if (
        tiendaRevisando
    ) {

        console.log(
            "[RUST STORE] Ya hay una revisión en curso."
        );

        return;
    }

    tiendaRevisando =
        true;

    let lockAdquirido =
        false;

    try {

        const ahora =
            new Date();

        const dia =
            new Intl.DateTimeFormat(
                "en-US",
                {
                    timeZone:
                        TIMEZONE_CHILE,

                    weekday:
                        "short"
                }
            ).format(
                ahora
            );

        // Solo jueves, viernes y sábado.
        if (
            ![
                "Thu",
                "Fri",
                "Sat"
            ].includes(
                dia
            )
        ) {
            return;
        }

        const configs =
            await ServerConfig.find({
                rustStoreEnabled:
                    true,

                planillaChannelId: {
                    $ne: null
                }
            });

        if (
            !configs.length
        ) {

            console.log(
                "[RUST STORE] No hay servidores configurados."
            );

            return;
        }

        const items =
            await obtenerTiendaRust();

        if (
            !items.length
        ) {
            return;
        }

        const firma =
            generarFirmaTienda(
                items
            );

        // =================================================
        // LOCK GLOBAL
        // =================================================

        lockAdquirido =
            await adquirirBloqueoTienda();

        if (
            !lockAdquirido
        ) {
            return;
        }

        // =================================================
        // SERVIDORES
        // =================================================

        for (
            const config of configs
        ) {

            try {

                const guild =
                    await client.guilds.fetch(
                        config.guildId
                    );

                if (!guild) {
                    continue;
                }

                const canalId =
                    config.rustStoreChannelId ||
                    config.planillaChannelId;

                if (!canalId) {
                    continue;
                }

                const canal =
                    await guild.channels.fetch(
                        canalId
                    );

                if (
                    !canal ||
                    !canal.isTextBased()
                ) {
                    continue;
                }

                // =================================================
                // COMPROBAR SI YA SE PUBLICÓ
                // =================================================

                if (
                    config.rustStoreSignature ===
                    firma
                ) {

                    console.log(
                        `[RUST STORE] ${guild.name}: tienda sin cambios, no se publica.`
                    );

                    continue;
                }

                console.log(
                    `[RUST STORE] ${guild.name}: publicando ${items.length} artículos...`
                );

                let publicados =
                    0;

                for (
                    const item of items
                ) {

                    const publicado =
                        await publicarItem(
                            canal,
                            item
                        );

                    if (publicado) {
                        publicados++;
                    }

                    await esperar(
                        350
                    );
                }

                if (
                    publicados > 0
                ) {

                    config.rustStoreSignature =
                        firma;

                    config.rustStoreLastUpdate =
                        new Date();

                    await config.save();

                    console.log(
                        `[RUST STORE] ${guild.name}: ${publicados}/${items.length} artículos publicados.`
                    );
                }

            } catch (error) {

                console.error(
                    `[RUST STORE] Error en servidor ${config.guildId}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "[RUST STORE] Error en revisión automática:",
            error
        );

    } finally {

        if (
            lockAdquirido
        ) {

            await liberarBloqueoTienda();
        }

        tiendaRevisando =
            false;
    }
}

// =====================================================
// INICIAR AUTOMÁTICO
// =====================================================

function iniciarTiendaAutomatica(
    client
) {

    if (
        tiendaAutomaticaIniciada
    ) {

        console.log(
            "[RUST STORE] Sistema automático ya estaba iniciado."
        );

        return;
    }

    tiendaAutomaticaIniciada =
        true;

    console.log(
        "[RUST STORE] Sistema automático iniciado."
    );

    setTimeout(
        () => {

            revisarTiendaAutomatica(
                client
            );

        },
        15000
    );

    setInterval(
        () => {

            revisarTiendaAutomatica(
                client
            );

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