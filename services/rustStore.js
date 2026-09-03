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

const MAX_ITEMS = 50;

// Revisar Steam cada 10 minutos
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
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\n/g, " ")
        .replace(/\\\r/g, " ")
        .replace(/\\\t/g, " ")
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
// FIRMA DE LA TIENDA
// =====================================================

function generarFirmaTienda(items) {

    if (
        !items ||
        !Array.isArray(items) ||
        items.length === 0
    ) {
        return "";
    }

    const datos =
        items
            .map(item => {

                return {
                    id:
                        String(
                            item.id || ""
                        ),

                    nombre:
                        limpiarTexto(
                            item.nombre || ""
                        ).toLowerCase(),

                    precio:
                        limpiarTexto(
                            item.precio || ""
                        ).toLowerCase()
                };

            })
            .sort((a, b) => {

                const idA =
                    a.id || a.nombre;

                const idB =
                    b.id || b.nombre;

                return idA.localeCompare(
                    idB
                );
            });

    const contenido =
        JSON.stringify(datos);

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

    for (
        const regex
        of patrones
    ) {

        const match =
            limpio.match(regex);

        if (match) {
            return match[0].trim();
        }
    }

    return "";
}

// =====================================================
// VALIDAR IMAGEN
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

    if (
        !/^https?:\/\//i.test(url)
    ) {
        return "";
    }

    if (
        url.includes("/public/shared/") &&
        !url.includes("/economy/image/")
    ) {
        return "";
    }

    return url;
}

// =====================================================
// OBTENER IMAGEN DESDE ELEMENTO
// =====================================================

function obtenerImagenElemento(
    elemento
) {

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
            "data-full"
        ];

        for (
            const atributo
            of atributos
        ) {

            const valor =
                img.attr(
                    atributo
                );

            if (!valor) {
                continue;
            }

            const url =
                convertirImagen(
                    valor
                );

            if (url) {
                return url;
            }
        }

        const srcset =
            img.attr("srcset") ||
            img.attr("data-srcset");

        if (srcset) {

            const partes =
                srcset.split(",");

            for (
                const parte
                of partes
            ) {

                const urlCandidata =
                    parte
                        .trim()
                        .split(/\s+/)[0];

                const url =
                    convertirImagen(
                        urlCandidata
                    );

                if (url) {
                    return url;
                }
            }
        }
    }

    const enlacesImagen =
        elemento.find(
            'a[href*="/economy/image/"]'
        );

    for (
        let i = 0;
        i < enlacesImagen.length;
        i++
    ) {

        const enlace =
            enlacesImagen.eq(i);

        const href =
            enlace.attr("href");

        const url =
            convertirImagen(
                href
            );

        if (
            url &&
            url.includes(
                "/economy/image/"
            )
        ) {
            return url;
        }
    }

    const elementosStyle =
        elemento.find("[style]");

    for (
        let i = 0;
        i < elementosStyle.length;
        i++
    ) {

        const style =
            elementosStyle
                .eq(i)
                .attr("style");

        if (!style) {
            continue;
        }

        const match =
            style.match(
                /url\(["']?(https?:\/\/[^"')]+)["']?\)/i
            );

        if (
            match &&
            match[1]
        ) {

            const url =
                convertirImagen(
                    match[1]
                );

            if (url) {
                return url;
            }
        }
    }

    return "";
}

// =====================================================
// IMAGEN META
// =====================================================

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
                .first()
                .attr("content");

        if (!valor) {
            continue;
        }

        const imagen =
            convertirImagen(
                valor
            );

        if (imagen) {
            return imagen;
        }
    }

    return "";
}

// =====================================================
// IMAGEN STEAM ECONOMY
// =====================================================

function extraerImagenSteamEconomy(
    $,
    html
) {

    const enlaces =
        $('a[href*="/economy/image/"]');

    for (
        let i = 0;
        i < enlaces.length;
        i++
    ) {

        const href =
            enlaces
                .eq(i)
                .attr("href");

        if (!href) {
            continue;
        }

        const imagen =
            convertirImagen(
                href
            );

        if (
            imagen &&
            imagen.includes(
                "/economy/image/"
            )
        ) {
            return imagen;
        }
    }

    const imagenes =
        $("img");

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
            "data-image-url"
        ];

        for (
            const atributo
            of atributos
        ) {

            const valor =
                img.attr(
                    atributo
                );

            if (!valor) {
                continue;
            }

            const imagen =
                convertirImagen(
                    valor
                );

            if (
                imagen &&
                imagen.includes(
                    "/economy/image/"
                )
            ) {
                return imagen;
            }
        }
    }

    if (html) {

        const regex =
            /https?:\/\/(?:community|store|shared)\.(?:akamai\.)?steamstatic\.com\/economy\/image\/[^"'\\\s<]+/gi;

        const encontrados =
            html.match(regex);

        if (encontrados) {

            for (
                const encontrada
                of encontrados
            ) {

                const imagen =
                    convertirImagen(
                        encontrada
                    );

                if (
                    imagen &&
                    imagen.includes(
                        "/economy/image/"
                    )
                ) {
                    return imagen;
                }
            }
        }
    }

    return "";
}

// =====================================================
// IMAGEN DETAIL
// =====================================================

async function obtenerImagenDesdeDetail(
    url
) {

    try {

        console.log(
            `🖼️ Consultando imagen detail: ${url}`
        );

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
            return "";
        }

        const $ =
            cheerio.load(html);

        let imagen =
            extraerImagenSteamEconomy(
                $,
                html
            );

        if (imagen) {
            return imagen;
        }

        imagen =
            obtenerImagenMeta($);

        if (imagen) {
            return imagen;
        }

        imagen =
            obtenerImagenElemento(
                $("body")
            );

        if (imagen) {
            return imagen;
        }

        return "";

    } catch (error) {

        console.log(
            `⚠️ Error obteniendo imagen detail ${url}: ${error.message}`
        );

        return "";
    }
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
        ignorar.includes(
            lower
        )
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

    resultado =
        resultado
            .replace(
                /\s*-\s*Steam.*$/i,
                ""
            )
            .replace(
                /\s*\|\s*Steam.*$/i,
                ""
            )
            .replace(
                /^Rust\s*-\s*/i,
                ""
            )
            .trim();

    return resultado;
}

// =====================================================
// OBTENER NOMBRE
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

    for (
        const selector
        of selectores
    ) {

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
                nombreValido(
                    nombre
                )
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
                limpiarNombre(
                    valor
                );

            if (
                nombreValido(
                    nombre
                )
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
            nombreValido(
                textoLink
            )
        ) {
            return textoLink;
        }
    }

    return "";
}

// =====================================================
// CONTENEDOR ITEM
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

    for (
        const selector
        of selectores
    ) {

        const padre =
            link.closest(
                selector
            );

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
            extraerPrecio(
                texto
            );

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

    if (!nombreValido(nombre)) {
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
// EXTRAER ITEMS DESDE ENLACES
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
                items.length >=
                MAX_ITEMS
            ) {
                return false;
            }

            const link =
                $(element);

            const href =
                link.attr("href");

            const enlace =
                convertirUrl(
                    href
                );

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
                !nombreValido(
                    nombre
                )
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

            const imagen =
                obtenerImagenElemento(
                    contenedor
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
// EXTRAER ITEMS VISUALES
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

                const imagen =
                    obtenerImagenElemento(
                        el
                    );

                if (
                    nombreValido(
                        nombre
                    ) &&
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

        if (
            items.length >=
            MAX_ITEMS
        ) {
            break;
        }
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
                cheerio.load(
                    html
                );

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
                items.length <
                MAX_ITEMS
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
            // IMÁGENES FALTANTES
            // =================================================

            const itemsSinImagen =
                items.filter(
                    item =>
                        !item.imagen
                );

            console.log(
                `🖼️ ${itemsSinImagen.length} artículos necesitan obtener su imagen desde detail...`
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
                            async item => {

                                const imagen =
                                    await obtenerImagenDesdeDetail(
                                        item.enlace
                                    );

                                return {
                                    item,
                                    imagen
                                };
                            }
                        )
                    );

                for (
                    const resultado
                    of resultados
                ) {

                    if (
                        resultado.imagen
                    ) {

                        resultado.item.imagen =
                            resultado.imagen;
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
// CREAR EMBED
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
// BOTÓN
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

    let publicados =
        0;

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
// /TIENDA MANUAL
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

    let publicados =
        0;

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
        // Interacción expirada
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

        console.log(
            "⏳ Ya hay una revisión de tienda en curso."
        );

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

        // =================================================
        // SOLO JUEVES, VIERNES Y SÁBADO
        // =================================================

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

        // =================================================
        // OBTENER TIENDA ACTUAL
        // =================================================

        const items =
            await obtenerTiendaRust();

        if (
            !items ||
            items.length === 0
        ) {

            console.log(
                "⚠️ Steam no devolvió artículos. No se hará ninguna publicación."
            );

            return;
        }

        // =================================================
        // GENERAR FIRMA
        // =================================================

        const firmaActual =
            generarFirmaTienda(
                items
            );

        if (!firmaActual) {

            console.log(
                "⚠️ No se pudo generar la firma."
            );

            return;
        }

        console.log(
            `🔐 Firma actual: ${firmaActual}`
        );

        // =================================================
        // SERVIDORES
        // =================================================

        for (
            const config
            of configs
        ) {

            try {

                const firmaAnterior =
                    config.rustStoreLastSignature
                        ? String(
                            config.rustStoreLastSignature
                        )
                        : "";

                // =================================================
                // NO CAMBIÓ
                // =================================================

                if (
                    firmaAnterior &&
                    firmaAnterior ===
                    firmaActual
                ) {

                    console.log(
                        `🛒 ${config.guildId}: tienda sin cambios.`
                    );

                    continue;
                }

                // =================================================
                // CAMBIÓ
                // =================================================

                if (!firmaAnterior) {

                    console.log(
                        `🆕 ${config.guildId}: primera tienda detectada.`
                    );

                } else {

                    console.log(
                        `🔄 ${config.guildId}: ¡CAMBIO DE TIENDA DETECTADO!`
                    );
                }

                // =================================================
                // CANAL
                // =================================================

                const canal =
                    await client.channels.fetch(
                        config.rustStoreChannelId
                    );

                if (
                    !canal ||
                    !canal.isTextBased()
                ) {

                    console.log(
                        `⚠️ Canal inválido en ${config.guildId}`
                    );

                    continue;
                }

                // =================================================
                // PUBLICAR
                // =================================================

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
                            `❌ Error publicando ${item.nombre}:`,
                            error.message
                        );
                    }
                }

                // =================================================
                // GUARDAR FIRMA
                // =================================================

                config.rustStoreLastSignature =
                    firmaActual;

                await config.save();

                console.log(
                    `✅ Nueva tienda guardada en ${config.guildId}: ${publicados}/${items.length} artículos.`
                );

            } catch (error) {

                console.error(
                    `❌ Error procesando tienda en ${config.guildId}:`,
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

    console.log(
        "🕐 Comprobación automática cada 10 minutos."
    );

    console.log(
        "📅 Detección activa jueves, viernes y sábado."
    );

    // Primera revisión 15 segundos después
    // de iniciar el bot.

    setTimeout(
        () => {

            revisarTiendaAutomatica(
                client
            );

        },
        15000
    );

    // Después cada 10 minutos.

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