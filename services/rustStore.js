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

// IMPORTANTE:
// Actualmente Steam puede mostrar 14 artículos en la
// rotación que queremos publicar.
const MAX_ITEMS =
    14;

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
        .replace(/&nbsp;/gi, " ")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, " ")
        .replace(/\n/g, " ")
        .replace(/\t/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function convertirUrl(url) {

    if (!url) {
        return "";
    }

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

    if (!texto) {
        return "";
    }

    const limpio = limpiarTexto(texto);

    const patrones = [

        /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?/i,

        /R\$\s*\d+(?:[.,]\d{1,2})?/i,

        /€\s*\d+(?:[.,]\d{1,2})?/i,

        /\d+(?:[.,]\d{1,2})?\s*€/i,

        /£\s*\d+(?:[.,]\d{1,2})?/i,

        /\d+(?:[.,]\d{1,2})?\s*£/i,

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

function obtenerImagen(elemento) {

    if (!elemento || !elemento.length) {
        return "";
    }

    const img =
        elemento.find("img").first();

    if (!img || !img.length) {
        return "";
    }

    const atributos = [
        "src",
        "data-src",
        "data-original",
        "data-lazy-src",
        "data-image",
        "data-image-url",
        "srcset"
    ];

    for (const atributo of atributos) {

        let valor =
            img.attr(atributo);

        if (!valor) {
            continue;
        }

        if (atributo === "srcset") {

            valor =
                valor
                    .split(",")[0]
                    .trim()
                    .split(" ")[0];
        }

        valor =
            convertirUrl(valor);

        if (valor) {
            return valor;
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

    const ignorar = new Set([
        "rust item store",
        "item store",
        "featured",
        "limited",
        "general",
        "new releases",
        "cart",
        "top sellers",
        "all",
        "search",
        "browse",
        "loading",
        "cargando"
    ]);

    if (
        ignorar.has(
            nombre.toLowerCase()
        )
    ) {
        return false;
    }

    if (
        /^rust\s+on\s+steam$/i.test(nombre)
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

    nombre =
        limpiarTexto(nombre);

    // Quitar precios pegados al nombre
    nombre =
        nombre.replace(
            /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?/gi,
            ""
        );

    nombre =
        nombre.replace(
            /R\$\s*\d+(?:[.,]\d{1,2})?/gi,
            ""
        );

    nombre =
        nombre.replace(
            /€\s*\d+(?:[.,]\d{1,2})?/gi,
            ""
        );

    nombre =
        nombre.replace(
            /£\s*\d+(?:[.,]\d{1,2})?/gi,
            ""
        );

    nombre =
        limpiarTexto(nombre);

    return nombre;
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
        convertirUrl(
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

    const matchId =
        enlace.match(
            /\/itemstore\/252490\/detail\/(\d+)/i
        );

    const id =
        matchId
            ? matchId[1]
            : "";

    const key =
        id ||
        `${nombre.toLowerCase()}|${precio}`;

    if (vistos.has(key)) {
        return;
    }

    vistos.add(key);

    items.push({
        id,
        nombre,
        precio,
        imagen,
        enlace
    });
}

// =====================================================
// OBTENER NOMBRE DE ENLACE
// =====================================================

function obtenerNombreDesdeEnlace(
    $,
    enlace
) {

    if (!enlace || !enlace.length) {
        return "";
    }

    const candidatos = [];

    // Texto directo
    candidatos.push(
        enlace.text()
    );

    // title
    candidatos.push(
        enlace.attr("title")
    );

    // aria-label
    candidatos.push(
        enlace.attr("aria-label")
    );

    // data-name
    candidatos.push(
        enlace.attr("data-name")
    );

    // data-title
    candidatos.push(
        enlace.attr("data-title")
    );

    // data-item-name
    candidatos.push(
        enlace.attr("data-item-name")
    );

    // Elementos hijos típicos
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

        const elemento =
            enlace
                .find(selector)
                .first();

        if (
            elemento &&
            elemento.length
        ) {

            candidatos.push(
                elemento.text()
            );

            candidatos.push(
                elemento.attr("title")
            );

            candidatos.push(
                elemento.attr("data-name")
            );

            candidatos.push(
                elemento.attr("data-title")
            );
        }
    }

    for (const candidato of candidatos) {

        const nombre =
            limpiarNombre(
                candidato
            );

        if (
            nombreValido(nombre)
        ) {
            return nombre;
        }
    }

    return "";
}

// =====================================================
// OBTENER CONTENEDOR DEL ITEM
// =====================================================

function obtenerContenedorItem(
    $,
    enlace
) {

    if (!enlace || !enlace.length) {
        return enlace;
    }

    const selectores = [
        ".item_store_item",
        ".itemstore_item",
        ".item_store_item_cap",
        ".item_store_item_container",
        ".item_store_item_holder",
        ".store_item",
        ".itemstore_item_holder",
        ".item",
        ".store_item_listing",
        ".item_store_item_listing"
    ];

    for (const selector of selectores) {

        const padre =
            enlace.closest(
                selector
            );

        if (
            padre &&
            padre.length
        ) {
            return padre;
        }
    }

    // Si Steam cambia nuevamente la clase,
    // subimos algunos niveles.
    let actual =
        enlace;

    for (
        let i = 0;
        i < 6;
        i++
    ) {

        if (
            actual.parent() &&
            actual.parent().length
        ) {
            actual =
                actual.parent();
        }

        const texto =
            limpiarTexto(
                actual.text()
            );

        if (
            texto &&
            extraerPrecio(texto)
        ) {
            return actual;
        }
    }

    return enlace;
}

// =====================================================
// EXTRAER ITEMS DIRECTAMENTE DESDE LOS ENLACES DETAIL
// =====================================================

function extraerItemsDesdeEnlaces(
    $,
    items,
    vistos
) {

    const enlaces = [];

    $(
        'a[href*="/itemstore/252490/detail/"]'
    ).each(
        (index, element) => {

            if (
                enlaces.length >= MAX_ITEMS
            ) {
                return false;
            }

            enlaces.push(
                $(element)
            );
        }
    );

    console.log(
        `🛒 Enlaces detail procesables: ${enlaces.length}`
    );

    for (
        const enlace
        of enlaces
    ) {

        if (
            items.length >= MAX_ITEMS
        ) {
            break;
        }

        const href =
            convertirUrl(
                enlace.attr("href")
            );

        if (!href) {
            continue;
        }

        const contenedor =
            obtenerContenedorItem(
                $,
                enlace
            );

        let nombre =
            obtenerNombreDesdeEnlace(
                $,
                enlace
            );

        let precio =
            extraerPrecio(
                contenedor.text()
            );

        if (!precio) {
            precio =
                extraerPrecio(
                    enlace.text()
                );
        }

        if (!precio) {

            const padre =
                enlace.parent();

            if (
                padre &&
                padre.length
            ) {
                precio =
                    extraerPrecio(
                        padre.text()
                    );
            }
        }

        let imagen =
            obtenerImagen(
                contenedor
            );

        if (!imagen) {
            imagen =
                obtenerImagen(
                    enlace
                );
        }

        // -------------------------------------------------
        // FALLBACK PARA EL NOMBRE
        // -------------------------------------------------

        if (!nombre) {

            const textos =
                [];

            textos.push(
                limpiarTexto(
                    contenedor.text()
                )
            );

            textos.push(
                limpiarTexto(
                    enlace.text()
                )
            );

            for (
                const texto
                of textos
            ) {

                if (!texto) {
                    continue;
                }

                let candidato =
                    texto;

                if (precio) {

                    candidato =
                        candidato.replace(
                            precio,
                            ""
                        );
                }

                candidato =
                    limpiarNombre(
                        candidato
                    );

                if (
                    nombreValido(
                        candidato
                    )
                ) {

                    nombre =
                        candidato;

                    break;
                }
            }
        }

        if (
            nombre &&
            precio
        ) {

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
    }
}

// =====================================================
// EXTRAER ITEMS DESDE BLOQUES VISUALES
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

        if (
            items.length >= MAX_ITEMS
        ) {
            break;
        }

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

                let nombre =
                    obtenerNombreDesdeEnlace(
                        $,
                        link
                    );

                let precio =
                    extraerPrecio(
                        el.text()
                    );

                if (!precio) {
                    precio =
                        extraerPrecio(
                            link.text()
                        );
                }

                const imagen =
                    obtenerImagen(el);

                if (
                    nombre &&
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
// EXTRAER DATOS JAVASCRIPT
// =====================================================

function extraerItemsDesdeScripts(
    html,
    items,
    vistos
) {

    const patrones = [

        /(?:var\s+)?g_rg[A-Za-z0-9_]*\s*=\s*(\{[\s\S]*?\});/g,

        /(?:var\s+)?g_[A-Za-z0-9_]*\s*=\s*(\{[\s\S]*?\});/g,

        /(?:var\s+)?g_rg[A-Za-z0-9_]*\s*=\s*(\[[\s\S]*?\]);/g,

        /itemstore[A-Za-z0-9_]*\s*=\s*(\{[\s\S]*?\});/gi
    ];

    const bloques =
        [];

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

    let imagen =
        objeto.image ||
        objeto.image_url ||
        objeto.imageUrl ||
        objeto.icon ||
        objeto.icon_url ||
        objeto.iconUrl ||
        "";

    const precioFinal =
        extraerPrecio(
            String(
                precio || ""
            )
        );

    if (
        nombre &&
        precioFinal &&
        enlace
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
// OBTENER IDS DETAIL
// =====================================================

function obtenerUrlsDetail(
    html
) {

    const urls =
        new Map();

    const regex =
        /(?:https?:\/\/store\.steampowered\.com)?\/itemstore\/252490\/detail\/(\d+)\/?/gi;

    let match;

    while (
        (match =
            regex.exec(html)) !== null
    ) {

        const id =
            match[1];

        if (
            !urls.has(id)
        ) {

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
// OBTENER DETALLE
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
            return null;
        }

        const $ =
            cheerio.load(html);

        let nombre =
            "";

        const selectoresNombre = [

            "meta[property='og:title']",

            "meta[name='twitter:title']",

            "h1",

            ".item_name",

            ".itemstore_item_name",

            ".item_store_item_name",

            ".store_item_name"
        ];

        for (
            const selector
            of selectoresNombre
        ) {

            const elemento =
                $(selector).first();

            if (
                !elemento ||
                !elemento.length
            ) {
                continue;
            }

            let valor =
                elemento.attr(
                    "content"
                ) ||
                elemento.text();

            valor =
                limpiarNombre(
                    valor
                );

            if (
                nombreValido(valor)
            ) {

                nombre =
                    valor;

                break;
            }
        }

        let precio =
            "";

        const selectoresPrecio = [

            ".item_price",

            ".price",

            ".itemstore_price",

            ".item_store_price",

            ".item_purchase_price"
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

                if (precio) {
                    break;
                }
            }
        }

        if (!precio) {

            precio =
                extraerPrecio(
                    $("body").text()
                );
        }

        let imagen =
            "";

        const ogImage =
            $(
                "meta[property='og:image']"
            ).attr("content");

        if (ogImage) {

            imagen =
                convertirUrl(
                    ogImage
                );
        }

        if (!imagen) {

            imagen =
                obtenerImagen(
                    $("body")
                );
        }

        if (
            !nombre ||
            !precio
        ) {

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

            const items =
                [];

            const vistos =
                new Set();

            // =================================================
            // MÉTODO 1
            // ENLACES DIRECTOS DETAIL
            // =================================================

            extraerItemsDesdeEnlaces(
                $,
                items,
                vistos
            );

            console.log(
                `🛒 Método enlaces detail encontró: ${items.length}`
            );

            if (
                items.length >= MAX_ITEMS
            ) {

                console.log(
                    `🛒 Steam devolvió ${items.length} artículos`
                );

                return items.slice(
                    0,
                    MAX_ITEMS
                );
            }

            // =================================================
            // MÉTODO 2
            // BLOQUES VISUALES
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
            // MÉTODO 3
            // JAVASCRIPT
            // =================================================

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
            // DETAIL COMO ÚLTIMO FALLBACK
            // =================================================

            const detailUrls =
                obtenerUrlsDetail(
                    html
                );

            console.log(
                `🛒 Referencias detail encontradas en HTML: ${detailUrls.length}`
            );

            if (
                detailUrls.length > 0 &&
                items.length < MAX_ITEMS
            ) {

                const faltantes =
                    Math.min(
                        MAX_ITEMS -
                            items.length,
                        detailUrls.length
                    );

                console.log(
                    `🛒 Consultando ${faltantes} páginas detail como fallback...`
                );

                const urls =
                    detailUrls.slice(
                        0,
                        faltantes
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
            // RESULTADO
            // =================================================

            if (
                items.length > 0
            ) {

                const resultado =
                    items.slice(
                        0,
                        MAX_ITEMS
                    );

                console.log(
                    `🛒 Steam devolvió ${resultado.length} artículos`
                );

                resultado.forEach(
                    (item, index) => {

                        console.log(
                            `   ${index + 1}. ${item.nombre} — ${item.precio} — ${item.enlace}`
                        );
                    }
                );

                return resultado;
            }

            // =================================================
            // DIAGNÓSTICO
            // =================================================

            const texto =
                limpiarTexto(
                    $("body").text()
                );

            const precios =
                texto.match(
                    /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?/gi
                ) || [];

            console.log(
                `🛒 Precios encontrados en texto: ${precios.length}`
            );

            console.log(
                "⚠️ Steam todavía no entregó artículos."
            );

            if (
                /captcha/i.test(html)
            ) {

                console.log(
                    "⚠️ Steam devolvió CAPTCHA."
                );
            }

            if (
                /Access Denied/i.test(html)
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

function crearEmbed(
    items
) {

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
            inline:
                true
        });
    }

    const imagen =
        items.find(
            item =>
                item.imagen &&
                /^https?:\/\//i.test(
                    item.imagen
                )
        );

    if (imagen) {

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