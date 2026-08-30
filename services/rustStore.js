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
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",

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

    const limpio = limpiarTexto(texto);

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
        const match = limpio.match(regex);

        if (match) {
            return match[0].trim();
        }
    }

    return "";
}

// =====================================================
// IMÁGENES
// =====================================================

function convertirImagen(url) {
    if (!url) {
        return "";
    }

    url = String(url)
        .trim()
        .replace(/&amp;/gi, "&")
        .replace(/\\\//g, "/")
        .replace(/\\"/g, '"');

    if (!url) {
        return "";
    }

    if (url.startsWith("//")) {
        url = `https:${url}`;
    }

    if (url.startsWith("/")) {
        url = `${STEAM_BASE_URL}${url}`;
    }

    if (!/^https?:\/\//i.test(url)) {
        return "";
    }

    // Evitar URLs que claramente no sean imágenes.
    if (
        /favicon|avatar|logo_steam|header\.jpg/i.test(url)
    ) {
        return "";
    }

    return url;
}

// =====================================================
// OBTENER IMAGEN DESDE ELEMENTO
// =====================================================

function obtenerImagenElemento(elemento) {
    if (!elemento || !elemento.length) {
        return "";
    }

    const atributos = [
        "src",
        "data-src",
        "data-original",
        "data-lazy-src",
        "data-image",
        "data-image-url",
        "data-original-src",
        "data-full",
        "data-bg",
        "data-background-image"
    ];

    const imagenes = elemento.find("img");

    for (let i = 0; i < imagenes.length; i++) {
        const img = imagenes.eq(i);

        for (const atributo of atributos) {
            const valor = img.attr(atributo);

            if (!valor) {
                continue;
            }

            const imagen = convertirImagen(valor);

            if (imagen) {
                return imagen;
            }
        }

        const srcset =
            img.attr("srcset") ||
            img.attr("data-srcset");

        if (srcset) {
            const candidatos = srcset
                .split(",")
                .map(x => x.trim())
                .reverse();

            for (const candidato of candidatos) {
                const url = candidato
                    .split(/\s+/)[0];

                const imagen =
                    convertirImagen(url);

                if (imagen) {
                    return imagen;
                }
            }
        }
    }

    // Buscar backgrounds.
    const elementosConBackground =
        elemento.find("[style]");

    for (
        let i = 0;
        i < elementosConBackground.length;
        i++
    ) {
        const el =
            elementosConBackground.eq(i);

        const style =
            el.attr("style") || "";

        const match =
            style.match(
                /url\(\s*['"]?([^'")]+)['"]?\s*\)/i
            );

        if (match && match[1]) {
            const imagen =
                convertirImagen(match[1]);

            if (imagen) {
                return imagen;
            }
        }
    }

    return "";
}

// =====================================================
// OBTENER IMAGEN DESDE META
// =====================================================

function obtenerImagenMeta($) {
    const selectores = [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[property="og:image:secure_url"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
        'meta[itemprop="image"]'
    ];

    for (const selector of selectores) {
        const valor =
            $(selector)
                .first()
                .attr("content");

        if (!valor) {
            continue;
        }

        const imagen =
            convertirImagen(valor);

        if (imagen) {
            return imagen;
        }
    }

    return "";
}

// =====================================================
// BUSCAR IMAGEN EN HTML
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
        /["']iconUrl["']\s*:\s*["']([^"']+)["']/i,
        /["']image_large["']\s*:\s*["']([^"']+)["']/i,
        /["']image_small["']\s*:\s*["']([^"']+)["']/i,
        /["']image_medium["']\s*:\s*["']([^"']+)["']/i,
        /["']image_large_url["']\s*:\s*["']([^"']+)["']/i,
        /["']image_small_url["']\s*:\s*["']([^"']+)["']/i
    ];

    for (const regex of patrones) {
        const match =
            html.match(regex);

        if (
            match &&
            match[1]
        ) {
            const imagen =
                convertirImagen(match[1]);

            if (imagen) {
                return imagen;
            }
        }
    }

    return "";
}

// =====================================================
// BUSCAR IMAGEN STEAM CDN
// =====================================================

function buscarImagenSteamCdn(
    html,
    itemId
) {
    if (!html || !itemId) {
        return "";
    }

    /*
     * Steam suele utilizar URLs CDN como:
     *
     * https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/252490/...
     *
     * o:
     *
     * https://community.cloudflare.steamstatic.com/economy/image/...
     *
     * Buscamos cualquier imagen cercana al ID del artículo.
     */

    const patrones = [
        new RegExp(
            `https?:\\\\?/\\\\?/[^"'\\s<>]+${itemId}[^"'\\s<>]+`,
            "gi"
        ),

        /https?:\\?\/\\?\/shared\.cloudflare\.steamstatic\.com\/[^"'<> ]+/gi,

        /https?:\\?\/\\?\/community\.cloudflare\.steamstatic\.com\/[^"'<> ]+/gi,

        /https?:\\?\/\\?\/steamcdn-a\.akamaihd\.net\/[^"'<> ]+/gi,

        /https?:\\?\/\\?\/cdn\.akamai\.steamstatic\.com\/[^"'<> ]+/gi
    ];

    for (const regex of patrones) {
        const matches =
            html.match(regex);

        if (!matches) {
            continue;
        }

        for (const rawUrl of matches) {
            const imagen =
                convertirImagen(
                    rawUrl
                        .replace(/\\\//g, "/")
                        .replace(/\\"/g, "")
                );

            if (
                imagen &&
                /\.(jpg|jpeg|png|webp)(\?|$)/i.test(
                    imagen
                )
            ) {
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

    resultado = resultado
        .replace(/\s*-\s*Steam.*$/i, "")
        .replace(/\s*\|\s*Steam.*$/i, "")
        .replace(/^Rust\s*-\s*/i, "")
        .trim();

    return resultado;
}

// =====================================================
// OBTENER NOMBRE DESDE ELEMENTO
// =====================================================

function obtenerNombreDesdeElemento(
    $,
    elemento,
    link
) {
    if (
        !elemento ||
        !elemento.length
    ) {
        return "";
    }

    const selectores = [
        ".item_store_item_name",
        ".itemstore_item_name",
        ".item_name",
        ".store_item_name",
        ".item_title",
        ".itemstore_item_title",
        ".name",
        ".title"
    ];

    for (const selector of selectores) {
        const encontrado =
            elemento
                .find(selector)
                .first();

        if (
            encontrado &&
            encontrado.length
        ) {
            const nombre =
                limpiarNombre(
                    encontrado.text()
                );

            if (
                nombreValido(nombre)
            ) {
                return nombre;
            }
        }
    }

    const atributos = [
        "data-item-name",
        "data-name",
        "data-title",
        "title",
        "aria-label"
    ];

    const elementosParaBuscar = [
        link,
        elemento
    ];

    for (
        const elementoBusqueda
        of elementosParaBuscar
    ) {
        if (
            !elementoBusqueda ||
            !elementoBusqueda.length
        ) {
            continue;
        }

        for (
            const atributo
            of atributos
        ) {
            const valor =
                elementoBusqueda.attr(
                    atributo
                );

            if (!valor) {
                continue;
            }

            const nombre =
                limpiarNombre(valor);

            if (
                nombreValido(nombre)
            ) {
                return nombre;
            }
        }
    }

    if (
        link &&
        link.length
    ) {
        const textoLink =
            limpiarNombre(
                link.text()
            );

        if (
            nombreValido(textoLink)
        ) {
            return textoLink;
        }
    }

    return "";
}

// =====================================================
// OBTENER CONTENEDOR
// =====================================================

function obtenerContenedorItem(
    $,
    link
) {
    if (
        !link ||
        !link.length
    ) {
        return null;
    }

    const selectores = [
        ".item_store_item",
        ".itemstore_item",
        ".item_store_item_cap",
        ".item_store_item_container",
        ".item_store_item_holder",
        ".store_item",
        ".itemstore_item_holder"
    ];

    for (const selector of selectores) {
        const padre =
            link.closest(selector);

        if (
            padre &&
            padre.length
        ) {
            return padre;
        }
    }

    let actual =
        link;

    for (
        let i = 0;
        i < 8;
        i++
    ) {
        actual =
            actual.parent();

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

        const precio =
            extraerPrecio(texto);

        if (precio) {
            return actual;
        }
    }

    return link.parent();
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

    const nombre =
        limpiarNombre(item.nombre);

    const precio =
        limpiarTexto(item.precio);

    const enlace =
        convertirUrl(item.enlace);

    const imagen =
        convertirImagen(item.imagen);

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
            /\/itemstore\/252490\/detail\/(\d+)\/?/i
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
// EXTRAER ITEMS DESDE LINKS
// =====================================================

function extraerItemsDesdeEnlaces(
    $,
    items,
    vistos
) {
    const enlaces =
        $('a[href*="/itemstore/252490/detail/"]');

    console.log(
        `🛒 Enlaces de artículos encontrados: ${enlaces.length}`
    );

    enlaces.each(
        (index, element) => {
            if (
                items.length >= MAX_ITEMS
            ) {
                return false;
            }

            const link =
                $(element);

            const href =
                link.attr("href");

            const enlace =
                convertirUrl(href);

            if (!enlace) {
                return;
            }

            const match =
                enlace.match(
                    /\/itemstore\/252490\/detail\/(\d+)\/?/i
                );

            if (!match) {
                return;
            }

            const contenedor =
                obtenerContenedorItem(
                    $,
                    link
                );

            if (
                !contenedor ||
                !contenedor.length
            ) {
                return;
            }

            const nombre =
                obtenerNombreDesdeElemento(
                    $,
                    contenedor,
                    link
                );

            if (
                !nombreValido(nombre)
            ) {
                console.log(
                    `⚠️ No se pudo obtener nombre para detail ${match[1]}`
                );
                return;
            }

            let precio =
                extraerPrecio(
                    contenedor.text()
                );

            if (!precio) {
                precio =
                    extraerPrecio(
                        link.text()
                    );
            }

            if (!precio) {
                const atributosPrecio = [
                    "data-price",
                    "data-item-price",
                    "data-final-price"
                ];

                for (
                    const atributo
                    of atributosPrecio
                ) {
                    const valor =
                        contenedor.attr(
                            atributo
                        );

                    if (valor) {
                        precio =
                            extraerPrecio(
                                valor
                            );

                        if (precio) {
                            break;
                        }
                    }
                }
            }

            if (!precio) {
                console.log(
                    `⚠️ ${nombre}: no se encontró precio`
                );
                return;
            }

            let imagen =
                obtenerImagenElemento(
                    contenedor
                );

            if (!imagen) {
                imagen =
                    obtenerImagenElemento(
                        link
                    );
            }

            if (!imagen) {
                imagen =
                    obtenerImagenMeta(
                        $
                    );
            }

            if (!imagen) {
                imagen =
                    buscarImagenEnHtml(
                        $.html()
                    );
            }

            if (!imagen) {
                imagen =
                    buscarImagenSteamCdn(
                        $.html(),
                        match[1]
                    );
            }

            console.log(
                `🖼️ ${nombre}: ${imagen ? "IMAGEN ENCONTRADA" : "SIN IMAGEN"}`
            );

            agregarItem(
                items,
                vistos,
                {
                    id: match[1],
                    nombre,
                    precio,
                    imagen,
                    enlace
                }
            );
        }
    );
}

// =====================================================
// EXTRAER ITEMS VISUALES - FALLBACK
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

    for (const selector of selectores) {
        $(selector).each(
            (index, element) => {
                if (
                    items.length >= MAX_ITEMS
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

                const match =
                    enlace.match(
                        /\/itemstore\/252490\/detail\/(\d+)\/?/i
                    );

                const nombre =
                    obtenerNombreDesdeElemento(
                        $,
                        el,
                        link
                    );

                const precio =
                    extraerPrecio(
                        el.text()
                    );

                let imagen =
                    obtenerImagenElemento(
                        el
                    );

                if (!imagen) {
                    imagen =
                        obtenerImagenElemento(
                            link
                        );
                }

                if (
                    !imagen &&
                    match
                ) {
                    imagen =
                        buscarImagenSteamCdn(
                            $.html(),
                            match[1]
                        );
                }

                if (
                    nombreValido(nombre) &&
                    precio
                ) {
                    agregarItem(
                        items,
                        vistos,
                        {
                            id:
                                match
                                    ? match[1]
                                    : "",

                            nombre,

                            precio,

                            imagen,

                            enlace
                        }
                    );
                }
            }
        );

        if (
            items.length >= MAX_ITEMS
        ) {
            break;
        }
    }
}

// =====================================================
// OBTENER TODAS LAS URL DETAIL
// =====================================================

function obtenerUrlsDetail(
    html
) {
    const urls =
        new Map();

    if (!html) {
        return [];
    }

    const patrones = [
        /https?:\/\/store\.steampowered\.com\/itemstore\/252490\/detail\/(\d+)\/?/gi,
        /\/itemstore\/252490\/detail\/(\d+)\/?/gi,
        /\\\/itemstore\\\/252490\\\/detail\\\/(\d+)\\\/?/gi
    ];

    for (const regex of patrones) {
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
// BUSCAR NOMBRE EN HTML
// =====================================================

function buscarNombreEnTexto(
    html
) {
    if (!html) {
        return "";
    }

    const patrones = [
        /["']item_name["']\s*:\s*["']([^"']{2,200})["']/i,
        /["']display_name["']\s*:\s*["']([^"']{2,200})["']/i,
        /["']itemName["']\s*:\s*["']([^"']{2,200})["']/i,
        /data-item-name\s*=\s*["']([^"']{2,200})["']/i,
        /data-name\s*=\s*["']([^"']{2,200})["']/i
    ];

    for (const regex of patrones) {
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
                /\/itemstore\/252490\/detail\/(\d+)\/?/i
            );

        const itemId =
            match
                ? match[1]
                : "";

        // =================================================
        // NOMBRE
        // =================================================

        let nombre = "";

        const selectoresNombre = [
            ".itemstore_item_name",
            ".item_store_item_name",
            ".item_name",
            ".store_item_name",
            "[data-item-name]",
            "[data-name]"
        ];

        for (
            const selector
            of selectoresNombre
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

                const candidatos = [
                    elemento.text(),
                    elemento.attr(
                        "data-item-name"
                    ),
                    elemento.attr(
                        "data-name"
                    ),
                    elemento.attr(
                        "data-title"
                    ),
                    elemento.attr(
                        "title"
                    ),
                    elemento.attr(
                        "aria-label"
                    )
                ];

                for (
                    const candidato
                    of candidatos
                ) {
                    const posible =
                        limpiarNombre(
                            candidato
                        );

                    if (
                        nombreValido(
                            posible
                        )
                    ) {
                        nombre =
                            posible;

                        break;
                    }
                }

                if (nombre) {
                    break;
                }
            }

            if (nombre) {
                break;
            }
        }

        if (!nombre) {
            nombre =
                buscarNombreEnTexto(
                    html
                );
        }

        // =================================================
        // PRECIO
        // =================================================

        let precio =
            extraerPrecio(
                $("body").text()
            );

        if (!precio) {
            precio =
                extraerPrecio(
                    html
                );
        }

        // =================================================
        // IMAGEN
        // =================================================

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

        if (!imagen) {
            imagen =
                buscarImagenSteamCdn(
                    html,
                    itemId
                );
        }

        // =================================================
        // VALIDACIÓN
        // =================================================

        if (
            !nombreValido(nombre)
        ) {
            console.log(
                `⚠️ Detail ${itemId}: nombre inválido o genérico`
            );

            return null;
        }

        if (!precio) {
            console.log(
                `⚠️ Detail ${itemId}: no se encontró precio`
            );

            return null;
        }

        console.log(
            `✅ Detail ${itemId}: ${nombre} — ${precio} — ${imagen ? "CON IMAGEN" : "SIN IMAGEN"}`
        );

        return {
            id: itemId,
            nombre,
            precio,
            imagen,
            enlace: url
        };
    } catch (error) {
        console.log(
            `⚠️ No se pudo consultar detail ${url}: ${error.message}`
        );

        return null;
    }
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
        `${STEAM_STORE_URL}&cc=cl&l=english`,
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
            const vistos =
                new Set();

            // =================================================
            // MÉTODO 1
            // =================================================

            extraerItemsDesdeEnlaces(
                $,
                items,
                vistos
            );

            console.log(
                `🛒 Método enlaces encontró: ${items.length}`
            );

            // =================================================
            // MÉTODO 2
            // =================================================

            if (
                items.length < MAX_ITEMS
            ) {
                extraerItemsVisuales(
                    $,
                    items,
                    vistos
                );
            }

            console.log(
                `🛒 Después del método visual: ${items.length}`
            );

            // =================================================
            // MÉTODO 3
            // =================================================

            const detailUrls =
                obtenerUrlsDetail(
                    html
                );

            console.log(
                `🛒 Referencias detail encontradas: ${detailUrls.length}`
            );

            if (
                items.length === 0 &&
                detailUrls.length > 0
            ) {
                const urlsDetail =
                    detailUrls.slice(
                        0,
                        MAX_ITEMS
                    );

                console.log(
                    `🛒 Fallback: consultando ${urlsDetail.length} páginas detail...`
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

            // =================================================
            // RECUPERAR IMAGEN INDIVIDUAL
            // =================================================
            //
            // Si el listado encontró el artículo pero
            // no encontró imagen, consultamos SU detail.
            //
            // Esto es importante porque Steam puede poner
            // el nombre/precio en la página principal pero
            // la imagen solamente en el detail.
            // =================================================

            const itemsSinImagen =
                items.filter(
                    item =>
                        !item.imagen &&
                        item.enlace
                );

            if (
                itemsSinImagen.length > 0
            ) {
                console.log(
                    `🖼️ ${itemsSinImagen.length} artículos no tienen imagen. Consultando sus páginas detail...`
                );

                for (
                    let i = 0;
                    i < itemsSinImagen.length;
                    i += 3
                ) {
                    const grupo =
                        itemsSinImagen.slice(
                            i,
                            i + 3
                        );

                    const resultados =
                        await Promise.all(
                            grupo.map(
                                item =>
                                    obtenerDetalleItem(
                                        item.enlace
                                    )
                            )
                        );

                    for (
                        let j = 0;
                        j < resultados.length;
                        j++
                    ) {
                        const detalle =
                            resultados[j];

                        const original =
                            grupo[j];

                        if (
                            detalle &&
                            detalle.imagen
                        ) {
                            original.imagen =
                                detalle.imagen;

                            console.log(
                                `🖼️ Imagen recuperada: ${original.nombre}`
                            );
                        }
                    }

                    if (
                        i + 3 <
                        itemsSinImagen.length
                    ) {
                        await esperar(
                            REQUEST_DELAY
                        );
                    }
                }
            }

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

    await interaction.editReply({
        content:
            `🛒 Se encontraron **${items.length} artículos** en la tienda semanal.\n\nPublicando artículos...`,

        embeds: [],

        components: []
    });

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
                `❌ Error publicando ${item.nombre}:`,
                error.message
            );
        }
    }

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