const axios = require("axios");
const cheerio = require("cheerio");

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

// NO LIMITAR A 12.
// La tienda puede tener 14, 15, 16, etc.
const MAX_ITEMS = 50;

const CHECK_INTERVAL =
    10 * 60 * 1000;

const REQUEST_DELAY =
    250;

// =====================================================
// HEADERS
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
        .replace(/\\u0022/gi, '"')
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\n/g, " ")
        .replace(/\\r/g, " ")
        .replace(/\\t/g, " ")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&amp;/gi, "&")
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function convertirUrl(url) {
    if (!url) {
        return "";
    }

    url = String(url).trim();

    if (!url) {
        return "";
    }

    if (url.startsWith("//")) {
        return `https:${url}`;
    }

    if (url.startsWith("/")) {
        return `${STEAM_BASE_URL}${url}`;
    }

    return url;
}

function esperar(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

// =====================================================
// PRECIO
// =====================================================

function extraerPrecio(texto) {
    if (!texto) {
        return "";
    }

    const limpio =
        limpiarTexto(texto);

    const patrones = [
        /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?/i,
        /R\$\s*\d+(?:[.,]\d{1,2})?/i,
        /€\s*\d+(?:[.,]\d{1,2})?/i,
        /£\s*\d+(?:[.,]\d{1,2})?/i,
        /¥\s*\d+(?:[.,]\d{1,2})?/i,
        /₹\s*\d+(?:[.,]\d{1,2})?/i,
        /₽\s*\d+(?:[.,]\d{1,2})?/i
    ];

    for (const regex of patrones) {
        const match =
            limpio.match(regex);

        if (match) {
            return match[0].trim();
        }
    }

    return "";
}

// =====================================================
// IMAGEN
// =====================================================

function convertirImagen(url) {
    if (!url) {
        return "";
    }

    url =
        convertirUrl(url);

    if (!url) {
        return "";
    }

    // Steam puede devolver URLs con parámetros.
    // Las dejamos intactas porque Discord las acepta.
    if (
        /^https?:\/\//i.test(url)
    ) {
        return url;
    }

    return "";
}

function obtenerImagenElemento(elemento) {
    if (
        !elemento ||
        !elemento.length
    ) {
        return "";
    }

    const imagenes =
        elemento.find("img");

    for (
        let i = 0;
        i < imagenes.length;
        i++
    ) {
        const img =
            imagenes.eq(i);

        const atributos = [
            "src",
            "data-src",
            "data-original",
            "data-lazy-src",
            "data-image",
            "data-image-url",
            "data-original-src",
            "data-full",
            "data-srcset"
        ];

        for (
            const atributo
            of atributos
        ) {
            const valor =
                img.attr(atributo);

            if (valor) {
                const url =
                    convertirImagen(valor);

                if (url) {
                    return url;
                }
            }
        }

        const srcset =
            img.attr("srcset");

        if (srcset) {
            const primero =
                srcset
                    .split(",")[0]
                    .trim()
                    .split(/\s+/)[0];

            const url =
                convertirImagen(
                    primero
                );

            if (url) {
                return url;
            }
        }
    }

    return "";
}

function obtenerImagenMeta($) {
    const selectores = [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[name="twitter:image"]',
        'meta[itemprop="image"]'
    ];

    for (
        const selector
        of selectores
    ) {
        const valor =
            $(selector)
                .attr("content");

        if (valor) {
            const imagen =
                convertirImagen(valor);

            if (imagen) {
                return imagen;
            }
        }
    }

    return "";
}

// =====================================================
// NOMBRE VÁLIDO
// =====================================================

function nombreValido(nombre) {
    if (!nombre) {
        return false;
    }

    nombre =
        limpiarTexto(nombre);

    if (
        nombre.length < 2 ||
        nombre.length > 200
    ) {
        return false;
    }

    const ignorar = [
        "rust item store",
        "rust on steam",
        "featured",
        "limited",
        "general",
        "new releases",
        "cart",
        "top sellers",
        "all",
        "search",
        "browse",
        "steam",
        "rust"
    ];

    const lower =
        nombre.toLowerCase();

    if (
        ignorar.includes(lower)
    ) {
        return false;
    }

    // Evitar títulos que claramente no son items.
    if (
        lower.includes("sign in") ||
        lower.includes("log in") ||
        lower.includes("store page") ||
        lower.includes("steam store")
    ) {
        return false;
    }

    return true;
}

// =====================================================
// LIMPIAR NOMBRE
// =====================================================

function limpiarNombre(nombre) {
    if (!nombre) {
        return "";
    }

    let resultado =
        limpiarTexto(nombre);

    resultado =
        resultado
            .replace(/\s*-\s*Steam.*$/i, "")
            .replace(/\s*\|\s*Steam.*$/i, "")
            .replace(/^Rust\s*-\s*/i, "")
            .trim();

    return resultado;
}

// =====================================================
// EXTRAER NOMBRE DESDE JSON/HTML
// =====================================================

function buscarNombreEnTexto(html) {
    if (!html) {
        return "";
    }

    const patrones = [

        // item_name
        /["']item_name["']\s*:\s*["']([^"']{2,200})["']/i,

        // display_name
        /["']display_name["']\s*:\s*["']([^"']{2,200})["']/i,

        // itemName
        /["']itemName["']\s*:\s*["']([^"']{2,200})["']/i,

        // data-item-name
        /data-item-name\s*=\s*["']([^"']{2,200})["']/i,

        // data-name
        /data-name\s*=\s*["']([^"']{2,200})["']/i,

        // name
        /["']name["']\s*:\s*["']([^"']{2,200})["']/i,

        // title
        /["']title["']\s*:\s*["']([^"']{2,200})["']/i
    ];

    for (
        const regex
        of patrones
    ) {
        const match =
            html.match(regex);

        if (
            match &&
            match[1]
        ) {
            const nombre =
                limpiarNombre(
                    match[1]
                );

            if (
                nombreValido(nombre)
            ) {
                return nombre;
            }
        }
    }

    return "";
}

// =====================================================
// EXTRAER NOMBRE DEL DETAIL
// =====================================================

function extraerNombreDetail($, html) {

    // -------------------------------------------------
    // 1. SELECTORES ESPECÍFICOS
    // -------------------------------------------------

    const selectores = [
        ".itemstore_item_name",
        ".item_store_item_name",
        ".item_name",
        ".store_item_name",
        ".itemstore_item_title",
        ".item_store_item_title",
        ".item_title",
        "[data-item-name]",
        "[data-name]"
    ];

    for (
        const selector
        of selectores
    ) {
        const elementos =
            $(selector);

        for (
            let i = 0;
            i < elementos.length;
            i++
        ) {
            const elemento =
                elementos.eq(i);

            let nombre =
                limpiarNombre(
                    elemento.text()
                );

            if (
                nombreValido(nombre)
            ) {
                return nombre;
            }

            const atributos = [
                "data-item-name",
                "data-name",
                "data-title",
                "title"
            ];

            for (
                const atributo
                of atributos
            ) {
                const valor =
                    elemento.attr(
                        atributo
                    );

                if (!valor) {
                    continue;
                }

                nombre =
                    limpiarNombre(
                        valor
                    );

                if (
                    nombreValido(nombre)
                ) {
                    return nombre;
                }
            }
        }
    }

    // -------------------------------------------------
    // 2. H1
    // -------------------------------------------------

    const h1 =
        limpiarNombre(
            $("h1")
                .first()
                .text()
        );

    if (
        nombreValido(h1)
    ) {
        return h1;
    }

    // -------------------------------------------------
    // 3. META OG TITLE
    // -------------------------------------------------

    const ogTitle =
        limpiarNombre(
            $('meta[property="og:title"]')
                .attr("content")
        );

    if (
        nombreValido(ogTitle)
    ) {
        return ogTitle;
    }

    // -------------------------------------------------
    // 4. TITLE
    // -------------------------------------------------

    const title =
        limpiarNombre(
            $("title")
                .first()
                .text()
        );

    if (
        nombreValido(title)
    ) {
        return title;
    }

    // -------------------------------------------------
    // 5. JSON-LD
    // -------------------------------------------------

    const scripts =
        $('script[type="application/ld+json"]');

    for (
        let i = 0;
        i < scripts.length;
        i++
    ) {
        try {
            const texto =
                $(scripts[i]).html();

            if (!texto) {
                continue;
            }

            const data =
                JSON.parse(texto);

            const encontrados = [];

            function recorrer(objeto) {
                if (!objeto) {
                    return;
                }

                if (
                    Array.isArray(objeto)
                ) {
                    for (
                        const item
                        of objeto
                    ) {
                        recorrer(item);
                    }

                    return;
                }

                if (
                    typeof objeto !== "object"
                ) {
                    return;
                }

                if (
                    typeof objeto.name ===
                    "string"
                ) {
                    const nombre =
                        limpiarNombre(
                            objeto.name
                        );

                    if (
                        nombreValido(
                            nombre
                        )
                    ) {
                        encontrados.push(
                            nombre
                        );
                    }
                }

                for (
                    const key
                    of Object.keys(objeto)
                ) {
                    const valor =
                        objeto[key];

                    if (
                        valor &&
                        typeof valor ===
                        "object"
                    ) {
                        recorrer(valor);
                    }
                }
            }

            recorrer(data);

            if (
                encontrados.length > 0
            ) {
                return encontrados[0];
            }

        } catch {
            // JSON-LD inválido.
        }
    }

    // -------------------------------------------------
    // 6. BUSCAR EN HTML CRUDO
    // -------------------------------------------------

    const nombreHtml =
        buscarNombreEnTexto(
            html
        );

    if (
        nombreValido(
            nombreHtml
        )
    ) {
        return nombreHtml;
    }

    return "";
}

// =====================================================
// EXTRAER PRECIO DEL DETAIL
// =====================================================

function extraerPrecioDetail($, html) {

    const selectores = [
        ".item_price",
        ".price",
        ".itemstore_price",
        ".item_store_price",
        ".item_purchase_price",
        ".itemstore_item_price",
        "[class*='price']"
    ];

    for (
        const selector
        of selectores
    ) {
        const elementos =
            $(selector);

        for (
            let i = 0;
            i < elementos.length;
            i++
        ) {
            const precio =
                extraerPrecio(
                    $(elementos[i]).text()
                );

            if (precio) {
                return precio;
            }
        }
    }

    // Buscar en atributos.
    const atributosPrecio = [
        "data-price",
        "data-item-price",
        "data-final-price"
    ];

    for (
        const atributo
        of atributosPrecio
    ) {
        const elemento =
            $(`[${atributo}]`)
                .first();

        if (
            elemento &&
            elemento.length
        ) {
            const precio =
                extraerPrecio(
                    elemento.attr(
                        atributo
                    )
                );

            if (precio) {
                return precio;
            }
        }
    }

    // HTML crudo.
    if (html) {
        const precio =
            extraerPrecio(html);

        if (precio) {
            return precio;
        }
    }

    // Texto completo.
    const body =
        limpiarTexto(
            $("body").text()
        );

    return extraerPrecio(
        body
    );
}

// =====================================================
// EXTRAER ITEM VISUAL
// =====================================================

function extraerItemsVisuales(
    $,
    items,
    vistos
) {
    const selectores = [
        ".item_store_item",
        ".itemstore_item",
        ".item_store_item_cap",
        ".item_store_item_container",
        ".item_store_item_holder",
        ".store_item",
        ".itemstore_item_holder"
    ];

    for (
        const selector
        of selectores
    ) {
        $(selector).each(
            (index, element) => {

                if (
                    items.length >=
                    MAX_ITEMS
                ) {
                    return false;
                }

                const el =
                    $(element);

                const link =
                    el.find(
                        'a[href*="/itemstore/252490/detail/"]'
                    ).first();

                if (
                    !link ||
                    !link.length
                ) {
                    return;
                }

                const enlace =
                    convertirUrl(
                        link.attr("href")
                    );

                if (!enlace) {
                    return;
                }

                let nombre = "";

                const selectoresNombre = [
                    ".item_store_item_name",
                    ".itemstore_item_name",
                    ".item_name",
                    ".store_item_name",
                    ".name",
                    ".title"
                ];

                for (
                    const selectorNombre
                    of selectoresNombre
                ) {
                    const encontrado =
                        el.find(
                            selectorNombre
                        ).first();

                    if (
                        encontrado &&
                        encontrado.length
                    ) {
                        nombre =
                            limpiarNombre(
                                encontrado.text()
                            );

                        if (
                            nombreValido(
                                nombre
                            )
                        ) {
                            break;
                        }
                    }
                }

                if (
                    !nombre
                ) {
                    nombre =
                        limpiarNombre(
                            link.attr(
                                "title"
                            ) ||
                            link.text()
                        );
                }

                const precio =
                    extraerPrecio(
                        el.text()
                    );

                const imagen =
                    obtenerImagenElemento(
                        el
                    );

                if (
                    nombreValido(nombre) &&
                    precio
                ) {
                    agregarItem(
                        items,
                        vistos,
                        {
                            nombre,
                            precio,
                            imagen,
                            enlace
                        }
                    );
                }
            }
        );
    }
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
        return;
    }

    let nombre =
        limpiarNombre(
            item.nombre
        );

    const precio =
        limpiarTexto(
            item.precio
        );

    const enlace =
        convertirUrl(
            item.enlace
        );

    const imagen =
        convertirImagen(
            item.imagen
        );

    if (
        !nombreValido(nombre)
    ) {
        return;
    }

    if (!precio) {
        return;
    }

    if (!enlace) {
        return;
    }

    const match =
        enlace.match(
            /\/detail\/(\d+)\/?/i
        );

    const key =
        match
            ? `id:${match[1]}`
            : `${nombre.toLowerCase()}|${precio}`;

    if (
        vistos.has(key)
    ) {
        return;
    }

    vistos.add(key);

    items.push({
        id:
            match
                ? match[1]
                : "",
        nombre,
        precio,
        imagen,
        enlace
    });
}

// =====================================================
// OBTENER TODAS LAS URL DETAIL
// =====================================================

function obtenerUrlsDetail(html) {
    const urls =
        new Map();

    if (!html) {
        return [];
    }

    const patrones = [

        // URL completa
        /https?:\\?\/\\?\/store\.steampowered\.com\\?\/itemstore\\?\/252490\\?\/detail\\?\/(\d+)\\?\/?/gi,

        // URL normal
        /https?:\/\/store\.steampowered\.com\/itemstore\/252490\/detail\/(\d+)\/?/gi,

        // Relativa
        /\/itemstore\/252490\/detail\/(\d+)\/?/gi,

        // Escapada
        /\\\/itemstore\\\/252490\\\/detail\\\/(\d+)\\\/?/gi
    ];

    for (
        const regex
        of patrones
    ) {
        let match;

        while (
            (match =
                regex.exec(html)) !== null
        ) {
            const id =
                match[1];

            if (!id) {
                continue;
            }

            urls.set(
                id,
                `${STEAM_BASE_URL}/itemstore/252490/detail/${id}/`
            );
        }
    }

    return [
        ...urls.values()
    ];
}

// =====================================================
// DETECTAR IMAGEN DESDE HTML CRUDO
// =====================================================

function buscarImagenEnHtml(html) {
    if (!html) {
        return "";
    }

    const patrones = [
        /["']image["']\s*:\s*["']([^"']+)["']/i,
        /["']image_url["']\s*:\s*["']([^"']+)["']/i,
        /["']imageUrl["']\s*:\s*["']([^"']+)["']/i,
        /["']icon_url["']\s*:\s*["']([^"']+)["']/i,
        /["']iconUrl["']\s*:\s*["']([^"']+)["']/i
    ];

    for (
        const regex
        of patrones
    ) {
        const match =
            html.match(regex);

        if (
            match &&
            match[1]
        ) {
            const imagen =
                convertirImagen(
                    match[1]
                );

            if (imagen) {
                return imagen;
            }
        }
    }

    return "";
}

// =====================================================
// OBTENER DETAIL
// =====================================================

async function obtenerDetalleItem(
    url
) {
    try {
        const response =
            await axios.get(
                url,
                {
                    timeout: 25000,
                    maxRedirects: 5,
                    validateStatus:
                        status =>
                            status >= 200 &&
                            status < 400,
                    headers:
                        STEAM_HEADERS
                }
            );

        const html =
            String(
                response.data || ""
            );

        if (!html) {
            console.log(
                `⚠️ Detail vacío: ${url}`
            );

            return null;
        }

        const $ =
            cheerio.load(html);

        const match =
            url.match(
                /\/detail\/(\d+)\/?/i
            );

        const itemId =
            match
                ? match[1]
                : "";

        // -------------------------------------------------
        // NOMBRE
        // -------------------------------------------------

        const nombre =
            extraerNombreDetail(
                $,
                html
            );

        // -------------------------------------------------
        // PRECIO
        // -------------------------------------------------

        const precio =
            extraerPrecioDetail(
                $,
                html
            );

        // -------------------------------------------------
        // IMAGEN
        // -------------------------------------------------

        let imagen =
            obtenerImagenMeta(
                $
            );

        if (!imagen) {
            imagen =
                obtenerImagenElemento(
                    $("body")
                );
        }

        if (!imagen) {
            imagen =
                buscarImagenEnHtml(
                    html
                );
        }

        // -------------------------------------------------
        // RESULTADO
        // -------------------------------------------------

        if (
            !nombreValido(nombre)
        ) {
            console.log(
                `⚠️ Detail ${itemId}: no se pudo obtener nombre.`
            );

            return null;
        }

        if (!precio) {
            console.log(
                `⚠️ Detail ${itemId}: no se pudo obtener precio.`
            );

            return null;
        }

        console.log(
            `✅ Detail ${itemId}: ${nombre} — ${precio}`
        );

        return {
            id:
                itemId,
            nombre,
            precio,
            imagen,
            enlace:
                url
        };

    } catch (error) {
        console.log(
            `⚠️ No se pudo consultar detail ${url}: ${error.message}`
        );

        return null;
    }
}

// =====================================================
// EXTRAER DATOS EMBEBIDOS
// =====================================================

function extraerDatosEmbebidos(
    html,
    items,
    vistos
) {
    if (!html) {
        return;
    }

    const nombres = [];

    const patrones = [
        /["']item_name["']\s*:\s*["']([^"']+)["']/gi,
        /["']display_name["']\s*:\s*["']([^"']+)["']/gi,
        /["']itemName["']\s*:\s*["']([^"']+)["']/gi
    ];

    for (
        const regex
        of patrones
    ) {
        let match;

        while (
            (match =
                regex.exec(html)) !== null
        ) {
            const nombre =
                limpiarNombre(
                    match[1]
                );

            if (
                nombreValido(nombre)
            ) {
                nombres.push(
                    nombre
                );
            }
        }
    }

    return nombres;
}

// =====================================================
// OBTENER TIENDA RUST
// =====================================================

async function obtenerTiendaRust() {

    console.log(
        "🛒 Consultando tienda Rust en Steam..."
    );

    const urls = [
        `${STEAM_STORE_URL}&cc=us&l=english`,
        `${STEAM_STORE_URL}&l=english`,
        `${STEAM_STORE_URL}&cc=cl&l=spanish`
    ];

    for (
        let intento = 0;
        intento < urls.length;
        intento++
    ) {
        const url =
            urls[intento];

        console.log(
            `🛒 Intento ${intento + 1}/${urls.length}: ${url}`
        );

        try {

            const response =
                await axios.get(
                    url,
                    {
                        timeout: 30000,
                        maxRedirects: 5,
                        validateStatus:
                            status =>
                                status >= 200 &&
                                status < 400,
                        headers:
                            STEAM_HEADERS
                    }
                );

            console.log(
                `🛒 Steam respondió HTTP ${response.status}`
            );

            const html =
                String(
                    response.data || ""
                );

            console.log(
                `🛒 HTML recibido: ${html.length} caracteres`
            );

            if (!html) {
                continue;
            }

            const $ =
                cheerio.load(html);

            const items = [];
            const vistos = new Set();

            // =================================================
            // MÉTODO 1
            // HTML VISUAL
            // =================================================

            extraerItemsVisuales(
                $,
                items,
                vistos
            );

            console.log(
                `🛒 Método visual encontró: ${items.length}`
            );

            // =================================================
            // MÉTODO 2
            // TODOS LOS DETAIL
            // =================================================

            const detailUrls =
                obtenerUrlsDetail(
                    html
                );

            console.log(
                `🛒 Referencias detail encontradas en HTML: ${detailUrls.length}`
            );

            // =================================================
            // CONSULTAR TODOS LOS DETAIL
            // =================================================

            if (
                detailUrls.length > 0
            ) {

                const cantidad =
                    Math.min(
                        detailUrls.length,
                        MAX_ITEMS
                    );

                console.log(
                    `🛒 Consultando ${cantidad} páginas detail...`
                );

                const urlsDetail =
                    detailUrls.slice(
                        0,
                        MAX_ITEMS
                    );

                for (
                    let i = 0;
                    i < urlsDetail.length;
                    i += 3
                ) {

                    const grupo =
                        urlsDetail.slice(
                            i,
                            i + 3
                        );

                    const resultados =
                        await Promise.all(
                            grupo.map(
                                obtenerDetalleItem
                            )
                        );

                    for (
                        const item
                        of resultados
                    ) {

                        if (!item) {
                            continue;
                        }

                        agregarItem(
                            items,
                            vistos,
                            item
                        );
                    }

                    if (
                        i + 3 <
                        urlsDetail.length
                    ) {
                        await esperar(
                            REQUEST_DELAY
                        );
                    }
                }
            }

            console.log(
                `🛒 Después de consultar detail: ${items.length}`
            );

            // =================================================
            // MÉTODO 3
            // DATOS EMBEBIDOS
            // =================================================

            if (
                items.length === 0
            ) {

                const nombres =
                    extraerDatosEmbebidos(
                        html,
                        items,
                        vistos
                    );

                console.log(
                    `🛒 Nombres embebidos encontrados: ${nombres.length}`
                );
            }

            // =================================================
            // ORDENAR POR ORDEN DE APARICIÓN
            // =================================================

            // No hacemos sort.
            // Steam ya entrega los IDs en el orden
            // de la tienda.

            // =================================================
            // RESULTADO
            // =================================================

            if (
                items.length > 0
            ) {

                console.log(
                    `🛒 Steam devolvió ${items.length} artículos`
                );

                items.forEach(
                    (item, index) => {

                        console.log(
                            `   ${index + 1}. ${item.nombre} — ${item.precio} — ${item.imagen ? "CON IMAGEN" : "SIN IMAGEN"}`
                        );
                    }
                );

                return items.slice(
                    0,
                    MAX_ITEMS
                );
            }

            // =================================================
            // DIAGNÓSTICO
            // =================================================

            console.log(
                "⚠️ Steam todavía no entregó artículos."
            );

            const htmlLower =
                html.toLowerCase();

            if (
                htmlLower.includes(
                    "captcha"
                )
            ) {
                console.log(
                    "⚠️ Steam devolvió CAPTCHA."
                );
            }

            if (
                htmlLower.includes(
                    "access denied"
                )
            ) {
                console.log(
                    "⚠️ Steam devolvió Access Denied."
                );
            }

        } catch (error) {

            console.error(
                `❌ Error en intento ${intento + 1}:`,
                error.message
            );

            if (
                error.response
            ) {
                console.error(
                    `❌ HTTP: ${error.response.status}`
                );
            }
        }
    }

    console.log(
        "❌ Todos los intentos de Steam terminaron sin artículos."
    );

    return [];
}

// =====================================================
// CREAR EMBED INDIVIDUAL
// =====================================================

function crearEmbedItem(
    item
) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🎨 ${item.nombre}`
            )
            .setDescription(
                "🔥 **Artículo disponible esta semana en la tienda Limited de Rust.**"
            )
            .addFields({
                name:
                    "💰 Precio",
                value:
                    `**${item.precio}**`,
                inline:
                    true
            })
            .setColor(
                0xE67E22
            )
            .setURL(
                item.enlace ||
                STEAM_STORE_URL
            )
            .setTimestamp()
            .setFooter({
                text:
                    "RustLogix • Rust Item Store"
            });

    // =================================================
    // IMAGEN INDIVIDUAL
    // =================================================

    if (
        item.imagen &&
        /^https?:\/\//i.test(
            item.imagen
        )
    ) {

        embed.setImage(
            item.imagen
        );
    }

    return embed;
}

// =====================================================
// BOTÓN INDIVIDUAL
// =====================================================

function crearBotonItem(
    item
) {

    if (
        !item ||
        !item.enlace
    ) {
        return null;
    }

    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel(
                    "Ver en Steam"
                )
                .setEmoji(
                    "🛒"
                )
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    item.enlace
                )
        );
}

// =====================================================
// PUBLICAR ITEM
// =====================================================

async function publicarItem(
    channel,
    item
) {

    const embed =
        crearEmbedItem(
            item
        );

    const row =
        crearBotonItem(
            item
        );

    const mensaje = {
        embeds: [
            embed
        ]
    };

    if (row) {
        mensaje.components = [
            row
        ];
    }

    await channel.send(
        mensaje
    );
}

// =====================================================
// PUBLICAR TODA LA TIENDA
// =====================================================

async function publicarTienda(
    channel
) {

    const items =
        await obtenerTiendaRust();

    if (
        !items ||
        items.length === 0
    ) {
        throw new Error(
            "Steam no devolvió artículos de la tienda."
        );
    }

    console.log(
        `🛒 Publicando ${items.length} artículos individuales...`
    );

    let publicados = 0;

    for (
        const item
        of items
    ) {

        try {

            await publicarItem(
                channel,
                item
            );

            publicados++;

            await esperar(
                350
            );

        } catch (error) {

            console.error(
                `❌ Error publicando ${item.nombre}: ${error.message}`
            );
        }
    }

    console.log(
        `✅ Se publicaron ${publicados}/${items.length} artículos.`
    );

    return items;
}

// =====================================================
// PUBLICAR MANUALMENTE /TIENDA
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
        throw new Error(
            "Steam no devolvió artículos."
        );
    }

    console.log(
        `🛒 Publicando ${items.length} artículos individuales...`
    );

    const channel =
        interaction.channel;

    if (
        !channel ||
        !channel.isTextBased()
    ) {
        throw new Error(
            "No se pudo obtener el canal donde se ejecutó /tienda."
        );
    }

    // =================================================
    // RESPUESTA INICIAL
    // =================================================

    await interaction.editReply({
        content:
            `🛒 Se encontraron **${items.length} artículos** en la tienda semanal.\n\nPublicando artículos...`,
        embeds: [],
        components: []
    });

    let publicados = 0;

    // =================================================
    // 1 MENSAJE POR ITEM
    // =================================================

    for (
        const item
        of items
    ) {

        try {

            await publicarItem(
                channel,
                item
            );

            publicados++;

            await esperar(
                350
            );

        } catch (error) {

            console.error(
                `❌ Error publicando ${item.nombre}:`,
                error.message
            );
        }
    }

    // =================================================
    // ACTUALIZAR RESPUESTA
    // =================================================

    try {

        await interaction.editReply({
            content:
                `✅ Tienda publicada correctamente.\n🛒 **${publicados}/${items.length} artículos** publicados.`
        });

    } catch {
        // La interacción puede haber expirado.
    }

    return items;
}

// =====================================================
// REVISIÓN AUTOMÁTICA
// =====================================================

let tiendaRevisando =
    false;

async function revisarTiendaAutomatica(
    client
) {

    if (
        tiendaRevisando
    ) {
        return;
    }

    tiendaRevisando =
        true;

    try {

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
                new Date()
            );

        // Solo jueves, viernes y sábado.
        if (
            ![
                "Thu",
                "Fri",
                "Sat"
            ].includes(dia)
        ) {
            return;
        }

        const configs =
            await ServerConfig.find({
                rustStoreEnabled:
                    true,

                rustStoreChannelId: {
                    $ne:
                        null
                }
            });

        if (
            configs.length === 0
        ) {
            return;
        }

        console.log(
            `🛒 Revisando tienda automática para ${configs.length} servidor(es)...`
        );

        const items =
            await obtenerTiendaRust();

        if (
            !items ||
            items.length === 0
        ) {

            console.log(
                "⚠️ Steam todavía no entregó artículos."
            );

            return;
        }

        // =================================================
        // FECHA CHILE
        // =================================================

        const ahora =
            new Date();

        const partes =
            new Intl.DateTimeFormat(
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
            ).formatToParts(
                ahora
            );

        const year =
            partes.find(
                p =>
                    p.type ===
                    "year"
            )?.value;

        const month =
            partes.find(
                p =>
                    p.type ===
                    "month"
            )?.value;

        const day =
            partes.find(
                p =>
                    p.type ===
                    "day"
            )?.value;

        const semana =
            `${year}-${month}-${day}`;

        // =================================================
        // PUBLICAR EN SERVIDORES
        // =================================================

        for (
            const config
            of configs
        ) {

            try {

                if (
                    config.rustStoreLastPublishedWeek ===
                    semana
                ) {
                    continue;
                }

                const canal =
                    await client.channels.fetch(
                        config.rustStoreChannelId
                    );

                if (
                    !canal ||
                    !canal.isTextBased()
                ) {

                    console.log(
                        `⚠️ Canal de tienda inválido en ${config.guildId}`
                    );

                    continue;
                }

                console.log(
                    `🛒 Publicando ${items.length} artículos en ${config.guildId}...`
                );

                let publicados =
                    0;

                // =================================================
                // 1 MENSAJE POR ITEM
                // =================================================

                for (
                    const item
                    of items
                ) {

                    try {

                        await publicarItem(
                            canal,
                            item
                        );

                        publicados++;

                        await esperar(
                            350
                        );

                    } catch (error) {

                        console.error(
                            `❌ Error publicando ${item.nombre} en ${config.guildId}:`,
                            error.message
                        );
                    }
                }

                // =================================================
                // GUARDAR PUBLICACIÓN
                // =================================================

                config.rustStoreLastPublishedWeek =
                    semana;

                await config.save();

                console.log(
                    `✅ Tienda Rust publicada en ${config.guildId}: ${publicados}/${items.length} artículos`
                );

            } catch (error) {

                console.error(
                    `❌ Error publicando tienda en ${config.guildId}:`,
                    error.message
                );
            }
        }

    } catch (error) {

        console.error(
            "❌ ERROR EN REVISIÓN AUTOMÁTICA TIENDA:",
            error.message
        );

    } finally {

        tiendaRevisando =
            false;
    }
}

// =====================================================
// INICIAR SISTEMA AUTOMÁTICO
// =====================================================

function iniciarTiendaAutomatica(
    client
) {

    console.log(
        "🛒 Sistema automático de tienda Rust iniciado correctamente."
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
    crearEmbedItem,
    publicarTienda,
    publicarTiendaManual,
    revisarTiendaAutomatica,
    iniciarTiendaAutomatica
};