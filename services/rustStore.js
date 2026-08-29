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

const CHECK_INTERVAL =
    10 * 60 * 1000;

const MAX_ITEMS =
    12;

// =====================================================
// UTILIDADES
// =====================================================

function limpiarTexto(texto) {
    if (!texto) return "";

    return String(texto)
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function convertirUrl(url) {
    if (!url) return "";

    url = String(url).trim();

    if (url.startsWith("//")) {
        return `https:${url}`;
    }

    if (url.startsWith("/")) {
        return `${STEAM_BASE_URL}${url}`;
    }

    return url;
}

// =====================================================
// PRECIO
// =====================================================

function extraerPrecio(texto) {
    if (!texto) return "";

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
// IMAGEN
// =====================================================

function obtenerImagen(elemento) {
    if (!elemento || !elemento.length) {
        return "";
    }

    const img = elemento.find("img").first();

    if (!img || !img.length) {
        return "";
    }

    return convertirUrl(
        img.attr("src") ||
        img.attr("data-src") ||
        img.attr("data-original") ||
        img.attr("data-lazy-src") ||
        img.attr("data-image") ||
        img.attr("data-image-url") ||
        ""
    );
}

// =====================================================
// NOMBRE
// =====================================================

function obtenerNombre(elemento) {
    if (!elemento || !elemento.length) {
        return "";
    }

    const selectores = [
        ".item_store_item_name",
        ".itemstore_item_name",
        ".item_name",
        ".store_item_name",
        ".itemstore_item_title",
        ".item_store_item_title",
        ".name",
        ".title",
        "[data-item-name]",
        "[data-name]"
    ];

    for (const selector of selectores) {
        const encontrado =
            elemento.find(selector).first();

        if (
            encontrado &&
            encontrado.length
        ) {
            let nombre =
                limpiarTexto(
                    encontrado.text()
                );

            if (nombre) {
                return nombre;
            }

            nombre =
                encontrado.attr("data-item-name") ||
                encontrado.attr("data-name") ||
                encontrado.attr("title") ||
                "";

            if (nombre) {
                return limpiarTexto(nombre);
            }
        }
    }

    const atributos = [
        "data-item-name",
        "data-name",
        "data-title",
        "title"
    ];

    for (const atributo of atributos) {
        const valor =
            elemento.attr(atributo);

        if (valor) {
            return limpiarTexto(valor);
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

    if (nombre.length < 2) {
        return false;
    }

    const ignorar = [
        "rust on steam",
        "rust item store",
        "rust item store - limited",
        "featured",
        "limited",
        "general",
        "new releases",
        "cart",
        "top sellers",
        "all",
        "search",
        "browse"
    ];

    if (
        ignorar.includes(
            nombre.toLowerCase()
        )
    ) {
        return false;
    }

    return true;
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
        limpiarTexto(item.nombre);

    const precio =
        limpiarTexto(item.precio);

    const enlace =
        convertirUrl(item.enlace);

    const imagen =
        convertirUrl(item.imagen);

    if (!nombreValido(nombre)) {
        return;
    }

    if (!precio) {
        return;
    }

    const key =
        `${nombre.toLowerCase()}|${precio}`;

    if (vistos.has(key)) {
        return;
    }

    vistos.add(key);

    items.push({
        nombre,
        precio,
        imagen,
        enlace
    });
}

// =====================================================
// EXTRAER NOMBRE REAL DESDE ELEMENTO
// =====================================================

function obtenerNombreRealDesdeElemento(
    $,
    elemento
) {
    const el =
        $(elemento);

    const selectores = [
        ".item_store_item_name",
        ".itemstore_item_name",
        ".item_store_item_title",
        ".itemstore_item_title",
        ".item_name",
        ".store_item_name",
        "[data-item-name]",
        "[data-name]"
    ];

    for (
        const selector
        of selectores
    ) {
        const encontrado =
            el.find(selector).first();

        if (
            encontrado &&
            encontrado.length
        ) {
            let nombre =
                limpiarTexto(
                    encontrado.text()
                );

            if (
                nombreValido(nombre)
            ) {
                return nombre;
            }

            nombre =
                limpiarTexto(
                    encontrado.attr(
                        "data-item-name"
                    ) ||
                    encontrado.attr(
                        "data-name"
                    ) ||
                    encontrado.attr(
                        "title"
                    ) ||
                    ""
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
                        link.attr("href") ||
                        ""
                    );

                let nombre =
                    obtenerNombreRealDesdeElemento(
                        $,
                        element
                    );

                if (
                    !nombre
                ) {
                    nombre =
                        limpiarTexto(
                            link.attr(
                                "data-item-name"
                            ) ||
                            link.attr(
                                "data-name"
                            ) ||
                            link.attr(
                                "title"
                            ) ||
                            ""
                        );
                }

                let precio =
                    extraerPrecio(
                        el.text()
                    );

                if (
                    !precio
                ) {
                    precio =
                        extraerPrecio(
                            link.text()
                        );
                }

                const imagen =
                    obtenerImagen(el);

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
        );
    }
}

// =====================================================
// EXTRAER ITEMS DESDE ATRIBUTOS HTML
// =====================================================

function extraerItemsDesdeAtributos(
    $,
    items,
    vistos
) {
    $('a[href*="/itemstore/252490/detail/"]').each(
        (index, element) => {
            if (
                items.length >= MAX_ITEMS
            ) {
                return false;
            }

            const link =
                $(element);

            const href =
                convertirUrl(
                    link.attr("href") ||
                    ""
                );

            if (!href) {
                return;
            }

            let nombre =
                limpiarTexto(
                    link.attr(
                        "data-item-name"
                    ) ||
                    link.attr(
                        "data-name"
                    ) ||
                    link.attr(
                        "data-title"
                    ) ||
                    ""
                );

            let contenedor =
                link.closest(
                    ".item_store_item"
                );

            if (
                !contenedor ||
                !contenedor.length
            ) {
                contenedor =
                    link.closest(
                        ".itemstore_item"
                    );
            }

            if (
                !contenedor ||
                !contenedor.length
            ) {
                contenedor =
                    link.parent();
            }

            if (
                !nombre
            ) {
                nombre =
                    obtenerNombreRealDesdeElemento(
                        $,
                        contenedor
                    );
            }

            let precio =
                extraerPrecio(
                    contenedor.text()
                );

            if (
                !precio
            ) {
                precio =
                    extraerPrecio(
                        link.text()
                    );
            }

            const imagen =
                obtenerImagen(
                    contenedor
                );

            agregarItem(
                items,
                vistos,
                {
                    nombre,
                    precio,
                    imagen,
                    enlace: href
                }
            );
        }
    );
}

// =====================================================
// EXTRAER DATOS DE JAVASCRIPT
// =====================================================

function extraerItemsDesdeScripts(
    html,
    items,
    vistos
) {
    const bloques = [];

    const patrones = [
        /var\s+g_rg[A-Za-z0-9_]+\s*=\s*(\{[\s\S]*?\});/g,
        /var\s+g_[A-Za-z0-9_]+\s*=\s*(\{[\s\S]*?\});/g,
        /g_rg[A-Za-z0-9_]+\s*=\s*(\[[\s\S]*?\]);/g
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
            bloques.push(
                match[1]
            );
        }
    }

    for (
        const bloque
        of bloques
    ) {
        if (
            items.length >= MAX_ITEMS
        ) {
            break;
        }

        let data;

        try {
            data =
                JSON.parse(
                    bloque
                );
        } catch {
            continue;
        }

        recorrerObjetoSteam(
            data,
            items,
            vistos
        );
    }
}

// =====================================================
// RECORRER OBJETO STEAM
// =====================================================

function recorrerObjetoSteam(
    objeto,
    items,
    vistos
) {
    if (
        !objeto ||
        items.length >= MAX_ITEMS
    ) {
        return;
    }

    if (
        Array.isArray(objeto)
    ) {
        for (
            const valor
            of objeto
        ) {
            recorrerObjetoSteam(
                valor,
                items,
                vistos
            );

            if (
                items.length >= MAX_ITEMS
            ) {
                return;
            }
        }

        return;
    }

    if (
        typeof objeto !== "object"
    ) {
        return;
    }

    const nombre =
        objeto.name ||
        objeto.item_name ||
        objeto.itemName ||
        objeto.title ||
        objeto.display_name ||
        objeto.displayName ||
        "";

    const precio =
        objeto.price ||
        objeto.price_text ||
        objeto.priceText ||
        objeto.final_price ||
        objeto.finalPrice ||
        objeto.formatted_price ||
        objeto.formattedPrice ||
        "";

    let enlace =
        objeto.url ||
        objeto.link ||
        objeto.href ||
        "";

    const itemId =
        objeto.item_id ||
        objeto.itemid ||
        objeto.itemId ||
        objeto.id ||
        "";

    if (
        !enlace &&
        itemId &&
        /^\d+$/.test(
            String(itemId)
        )
    ) {
        enlace =
            `${STEAM_BASE_URL}/itemstore/252490/detail/${itemId}/`;
    }

    const imagen =
        objeto.image ||
        objeto.image_url ||
        objeto.imageUrl ||
        objeto.icon ||
        objeto.icon_url ||
        objeto.iconUrl ||
        "";

    const precioTexto =
        typeof precio === "string"
            ? precio
            : String(
                precio || ""
            );

    const precioFinal =
        extraerPrecio(
            precioTexto
        );

    if (
        nombre &&
        precioFinal &&
        nombreValido(nombre)
    ) {
        agregarItem(
            items,
            vistos,
            {
                nombre,
                precio: precioFinal,
                enlace,
                imagen
            }
        );
    }

    for (
        const key
        of Object.keys(objeto)
    ) {
        const valor =
            objeto[key];

        if (
            valor &&
            typeof valor === "object"
        ) {
            recorrerObjetoSteam(
                valor,
                items,
                vistos
            );

            if (
                items.length >= MAX_ITEMS
            ) {
                return;
            }
        }
    }
}

// =====================================================
// OBTENER URLS DETAIL
// =====================================================

function obtenerUrlsDetail(
    html
) {
    const urls =
        new Set();

    const regex =
        /(?:https?:\/\/store\.steampowered\.com)?\/itemstore\/252490\/detail\/(\d+)\/?/gi;

    let match;

    while (
        (match =
            regex.exec(html)) !== null
    ) {
        urls.add(
            `${STEAM_BASE_URL}/itemstore/252490/detail/${match[1]}/`
        );
    }

    return [
        ...urls
    ];
}

// =====================================================
// EXTRAER NOMBRE DE DETAIL
// =====================================================

function extraerNombreDetail(
    $
) {
    const selectores = [
        "[data-item-name]",
        "[data-name]",
        ".itemstore_item_name",
        ".item_store_item_name",
        ".itemstore_item_title",
        ".item_store_item_title",
        ".item_name",
        ".store_item_name"
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
                limpiarTexto(
                    elemento.text()
                );

            if (
                !nombre
            ) {
                nombre =
                    limpiarTexto(
                        elemento.attr(
                            "data-item-name"
                        ) ||
                        elemento.attr(
                            "data-name"
                        ) ||
                        elemento.attr(
                            "title"
                        ) ||
                        ""
                    );
            }

            if (
                nombreValido(nombre)
            ) {
                return nombre;
            }
        }
    }

    // Buscar nombres dentro de scripts inline.
    const scripts =
        $("script");

    for (
        let i = 0;
        i < scripts.length;
        i++
    ) {
        const contenido =
            scripts.eq(i).html() ||
            "";

        const patrones = [
            /"item_name"\s*:\s*"([^"]+)"/i,
            /"itemName"\s*:\s*"([^"]+)"/i,
            /"display_name"\s*:\s*"([^"]+)"/i,
            /"displayName"\s*:\s*"([^"]+)"/i,
            /"name"\s*:\s*"([^"]+)"/i
        ];

        for (
            const regex
            of patrones
        ) {
            const match =
                contenido.match(
                    regex
                );

            if (
                match &&
                nombreValido(
                    match[1]
                )
            ) {
                return limpiarTexto(
                    match[1]
                );
            }
        }
    }

    return "";
}

// =====================================================
// OBTENER DETALLE DE ITEM
// =====================================================

async function obtenerDetalleItem(
    url
) {
    try {
        const response =
            await axios.get(
                url,
                {
                    timeout: 20000,
                    maxRedirects: 5,
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

                        "Accept":
                            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

                        "Accept-Language":
                            "en-US,en;q=0.9",

                        "Cache-Control":
                            "no-cache",

                        "Pragma":
                            "no-cache"
                    }
                }
            );

        if (
            !response ||
            !response.data
        ) {
            return null;
        }

        const html =
            String(
                response.data
            );

        const $ =
            cheerio.load(
                html
            );

        // =================================================
        // NOMBRE
        // =================================================

        const nombre =
            extraerNombreDetail(
                $
            );

        // =================================================
        // PRECIO
        // =================================================

        let precio = "";

        const selectoresPrecio = [
            ".item_price",
            ".price",
            ".itemstore_price",
            ".item_store_price",
            ".item_purchase_price",
            "[data-price]"
        ];

        for (
            const selector
            of selectoresPrecio
        ) {
            const elemento =
                $(selector).first();

            if (
                elemento &&
                elemento.length
            ) {
                precio =
                    extraerPrecio(
                        elemento.text()
                    );

                if (
                    !precio
                ) {
                    precio =
                        extraerPrecio(
                            elemento.attr(
                                "data-price"
                            )
                        );
                }

                if (
                    precio
                ) {
                    break;
                }
            }
        }

        if (
            !precio
        ) {
            precio =
                extraerPrecio(
                    $("body").text()
                );
        }

        // =================================================
        // IMAGEN
        // =================================================

        let imagen = "";

        const ogImage =
            $("meta[property='og:image']")
                .attr("content");

        if (
            ogImage
        ) {
            imagen =
                convertirUrl(
                    ogImage
                );
        }

        if (
            !imagen
        ) {
            imagen =
                obtenerImagen(
                    $("body")
                );
        }

        // =================================================
        // VALIDACIÓN
        // =================================================

        if (
            !nombreValido(
                nombre
            )
        ) {
            console.log(
                `⚠️ Detail descartado: nombre inválido en ${url}`
            );

            return null;
        }

        if (
            !precio
        ) {
            console.log(
                `⚠️ Detail descartado: precio no encontrado en ${url}`
            );

            return null;
        }

        return {
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
// OBTENER TIENDA DESDE STEAM
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

                        headers: {
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
                        }
                    }
                );

            console.log(
                `🛒 Steam respondió HTTP ${response.status}`
            );

            const html =
                String(
                    response.data ||
                    ""
                );

            console.log(
                `🛒 HTML recibido: ${html.length} caracteres`
            );

            if (
                !html
            ) {
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
            // SELECTORES VISUALES
            // =================================================

            extraerItemsVisuales(
                $,
                items,
                vistos
            );

            console.log(
                `🛒 Método visual encontró: ${items.length}`
            );

            if (
                items.length >= MAX_ITEMS
            ) {
                return items.slice(
                    0,
                    MAX_ITEMS
                );
            }

            // =================================================
            // MÉTODO 2
            // ATRIBUTOS / ENLACES
            // =================================================

            if (
                items.length === 0
            ) {
                console.log(
                    "⚠️ Método visual sin resultados. Analizando enlaces y atributos..."
                );
            }

            extraerItemsDesdeAtributos(
                $,
                items,
                vistos
            );

            console.log(
                `🛒 Método atributos encontró: ${items.length}`
            );

            if (
                items.length >= MAX_ITEMS
            ) {
                return items.slice(
                    0,
                    MAX_ITEMS
                );
            }

            // =================================================
            // MÉTODO 3
            // JAVASCRIPT
            // =================================================

            if (
                items.length === 0
            ) {
                console.log(
                    "⚠️ Sin resultados HTML. Analizando datos JavaScript..."
                );
            }

            extraerItemsDesdeScripts(
                html,
                items,
                vistos
            );

            console.log(
                `🛒 Método JavaScript encontró: ${items.length}`
            );

            if (
                items.length >= MAX_ITEMS
            ) {
                return items.slice(
                    0,
                    MAX_ITEMS
                );
            }

            // =================================================
            // MÉTODO 4
            // DETAIL
            // =================================================

            const detailUrls =
                obtenerUrlsDetail(
                    html
                );

            console.log(
                `🛒 Referencias detail encontradas en HTML: ${detailUrls.length}`
            );

            if (
                detailUrls.length > 0
            ) {
                console.log(
                    `🛒 Consultando hasta ${Math.min(
                        detailUrls.length,
                        MAX_ITEMS
                    )} páginas detail...`
                );

                const urls =
                    detailUrls.slice(
                        0,
                        MAX_ITEMS
                    );

                for (
                    let i = 0;
                    i < urls.length;
                    i += 4
                ) {
                    const grupo =
                        urls.slice(
                            i,
                            i + 4
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
                        if (
                            !item
                        ) {
                            continue;
                        }

                        agregarItem(
                            items,
                            vistos,
                            item
                        );
                    }

                    if (
                        items.length >= MAX_ITEMS
                    ) {
                        break;
                    }
                }
            }

            console.log(
                `🛒 Después de consultar detail: ${items.length}`
            );

            // =================================================
            // MÉTODO 5
            // TEXTO PLANO
            // =================================================

            if (
                items.length === 0
            ) {
                console.log(
                    "⚠️ No se pudieron extraer artículos. Ejecutando extractor de texto..."
                );

                const texto =
                    limpiarTexto(
                        $("body").text()
                    );

                const precios =
                    texto.match(
                        /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?/g
                    ) || [];

                console.log(
                    `🛒 Precios encontrados en texto: ${precios.length}`
                );
            }

            // =================================================
            // RESULTADO
            // =================================================

            console.log(
                `🛒 Steam devolvió ${items.length} artículos`
            );

            if (
                items.length > 0
            ) {
                items
                    .slice(
                        0,
                        MAX_ITEMS
                    )
                    .forEach(
                        (
                            item,
                            index
                        ) => {
                            console.log(
                                `   ${index + 1}. ${item.nombre} — ${item.precio}`
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

            if (
                html
                    .toLowerCase()
                    .includes(
                        "captcha"
                    )
            ) {
                console.log(
                    "⚠️ Steam devolvió CAPTCHA."
                );
            }

            if (
                html.includes(
                    "Access Denied"
                )
            ) {
                console.log(
                    "⚠️ Steam devolvió Access Denied."
                );
            }

            if (
                html.includes(
                    "Steam Community"
                )
            ) {
                console.log(
                    "⚠️ Steam parece haber devuelto una página de bloqueo/redirección."
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

function crearEmbed(items) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🛒 TIENDA SEMANAL DE RUST"
            )
            .setDescription(
                "🔥 **Nuevos artículos disponibles esta semana.**\n\n" +
                "Estos son los artículos de la rotación **Limited** de la tienda oficial de Rust en Steam."
            )
            .setColor(
                0xE67E22
            )
            .setURL(
                STEAM_STORE_URL
            )
            .setTimestamp()
            .setFooter({
                text:
                    "RustLogix • Rust Item Store"
            });

    for (
        const item
        of items
    ) {
        let value =
            `💰 **${item.precio}**`;

        if (
            item.enlace
        ) {
            value +=
                `\n[🛒 Ver en Steam](${item.enlace})`;
        }

        embed.addFields({
            name:
                `🎨 ${item.nombre}`,
            value,
            inline: true
        });
    }

    const imagen =
        items.find(
            item =>
                item.imagen &&
                item.imagen.startsWith(
                    "http"
                )
        );

    if (
        imagen
    ) {
        embed.setThumbnail(
            imagen.imagen
        );
    }

    return embed;
}

// =====================================================
// BOTÓN
// =====================================================

function crearBotonTienda() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel(
                    "Ver tienda completa"
                )
                .setEmoji(
                    "🛒"
                )
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    STEAM_STORE_URL
                )
        );
}

// =====================================================
// PUBLICAR EN CANAL
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

    const embed =
        crearEmbed(
            items
        );

    const row =
        crearBotonTienda();

    await channel.send({
        embeds: [
            embed
        ],
        components: [
            row
        ]
    });

    return items;
}

// =====================================================
// PUBLICAR MANUALMENTE
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

    const embed =
        crearEmbed(
            items
        );

    const row =
        crearBotonTienda();

    return interaction.editReply({
        embeds: [
            embed
        ],
        components: [
            row
        ]
    });
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

        // Solo jueves, viernes y sábado
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
                    $ne: null
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

                const embed =
                    crearEmbed(
                        items
                    );

                const row =
                    crearBotonTienda();

                await canal.send({
                    embeds: [
                        embed
                    ],
                    components: [
                        row
                    ]
                });

                config.rustStoreLastPublishedWeek =
                    semana;

                await config.save();

                console.log(
                    `✅ Tienda Rust publicada en ${config.guildId}`
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
    crearEmbed,
    publicarTienda,
    publicarTiendaManual,
    revisarTiendaAutomatica,
    iniciarTiendaAutomatica
};