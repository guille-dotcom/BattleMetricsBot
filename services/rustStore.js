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

// Cantidad máxima de artículos que procesará el bot.
// La paginación permite superar los 12 de Steam.
const MAX_ITEMS = 100;

// Steam actualmente muestra 12 artículos por página.
const STEAM_PAGE_SIZE = 12;

// Seguridad para evitar un bucle infinito si Steam cambia su sistema.
const MAX_PAGES = 20;

const CHECK_INTERVAL =
    10 * 60 * 1000;

const REQUEST_DELAY =
    250;

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
        .replace(/\\u00a0/gi, " ")
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

        if (
            url.startsWith("//")
        ) {
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
// FIRMA DE LOS ARTÍCULOS
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

    const match =
        limpio.match(
            /(?:\$|€|£)\s*\d+(?:[.,]\d{1,2})?/i
        );

    if (match) {
        return match[0];
    }

    const numero =
        limpio.match(
            /\d+(?:[.,]\d{1,2})?/
        );

    if (numero) {
        return `$${numero[0]}`;
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

    url = convertirUrl(url);

    if (!url) {
        return null;
    }

    return url;
}

// =====================================================

function obtenerImagenElemento($, elemento) {

    const posibles = [
        $(elemento).attr("data-image"),
        $(elemento).attr("data-src"),
        $(elemento).attr("data-img"),
        $(elemento).attr("data-background-image"),
        $(elemento).find("img").attr("src"),
        $(elemento).find("img").attr("data-src"),
        $(elemento).find("img").attr("data-lazy-src"),
        $(elemento).find("img").attr("srcset")
    ];

    for (const valor of posibles) {

        if (!valor) {
            continue;
        }

        let url =
            String(valor).trim();

        if (url.includes(",")) {

            url =
                url
                    .split(",")[0]
                    .trim()
                    .split(" ")[0];
        }

        const imagen =
            convertirImagen(url);

        if (imagen) {
            return imagen;
        }
    }

    return null;
}

// =====================================================

function obtenerImagenMeta($) {

    const metas = [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]'
    ];

    for (const selector of metas) {

        const contenido =
            $(selector).attr("content");

        const imagen =
            convertirImagen(contenido);

        if (imagen) {
            return imagen;
        }
    }

    return null;
}

// =====================================================

function extraerImagenSteamEconomy(html) {

    if (!html) {
        return null;
    }

    const patrones = [

        /https?:\/\/[^"' ]*steamstatic\.com[^"' ]*/gi,

        /https?:\/\/[^"' ]*steamcommunity\.com[^"' ]*/gi,

        /https?:\/\/[^"' ]*steamusercontent\.com[^"' ]*/gi
    ];

    for (const regex of patrones) {

        const coincidencias =
            html.match(regex);

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
                convertirImagen(url);

            if (imagen) {
                return imagen;
            }
        }
    }

    return null;
}

// =====================================================

async function obtenerImagenDesdeDetail(url) {

    if (!url) {
        return null;
    }

    try {

        const response =
            await axios.get(
                url,
                {
                    headers: STEAM_HEADERS,
                    timeout: 30000
                }
            );

        const html =
            response.data;

        const $ =
            cheerio.load(html);

        const meta =
            obtenerImagenMeta($);

        if (meta) {
            return meta;
        }

        return extraerImagenSteamEconomy(
            html
        );

    } catch (error) {

        console.warn(
            "[RUST STORE] No se pudo obtener imagen detail:",
            error.message
        );

        return null;
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
            .replace(/^Rust\s*-\s*/i, "")
            .replace(/\s+/g, " ")
            .trim();

    if (!nombreValido(nombre)) {
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
            $(elemento)
                .attr("title")
        );

    if (title) {
        return title;
    }

    const aria =
        limpiarNombre(
            $(elemento)
                .attr("aria-label")
        );

    if (aria) {
        return aria;
    }

    return null;
}

// =====================================================
// CONTENEDOR DEL ARTÍCULO
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
        i < 5;
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
            texto.length < 1000
        ) {
            return padre;
        }
    }

    return $(elemento);
}

// =====================================================
// AGREGAR ARTÍCULO
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
            : `name:${nombre.toLowerCase()}|price:${precio}`;

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
        url: convertirUrl(item.url),
        imagen: convertirImagen(
            item.imagen
        )
    });

    return true;
}

// =====================================================
// EXTRAER ARTÍCULOS DESDE ENLACES
// =====================================================

function extraerItemsDesdeEnlaces(
    $,
    items,
    vistos
) {

    let encontrados = 0;

    $('a[href*="/itemstore/252490/detail/"]')
        .each((_, enlace) => {

            if (
                items.length >= MAX_ITEMS
            ) {
                return;
            }

            const href =
                $(enlace).attr("href");

            if (!href) {
                return;
            }

            const url =
                convertirUrl(href);

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
// EXTRAER ARTÍCULOS VISUALES
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
                    items.length >= MAX_ITEMS
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
                    enlace.attr("href");

                const url =
                    convertirUrl(href);

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
// CONTAR ARTÍCULOS ÚNICOS DE UNA PÁGINA
// =====================================================

function contarItemsPagina($) {

    const ids =
        new Set();

    $('a[href*="/itemstore/252490/detail/"]')
        .each((_, enlace) => {

            const href =
                $(enlace).attr("href");

            if (!href) {
                return;
            }

            const url =
                convertirUrl(href);

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

    for (
        const variante of variantes
    ) {

        const items = [];
        const vistos = new Set();

        try {

            console.log(
                `[RUST STORE] Probando Steam cc=${variante.cc} lang=${variante.language}`
            );

            let pagina = 0;
            let start = 0;

            while (
                pagina < MAX_PAGES &&
                items.length < MAX_ITEMS
            ) {

                const url =
                    new URL(
                        STEAM_STORE_URL
                    );

                // =====================================
                // PAGINACIÓN DE STEAM
                // =====================================

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

                console.log(
                    `[RUST STORE] Página ${pagina + 1} -> ${url.href}`
                );

                const response =
                    await axios.get(
                        url.href,
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
                    cheerio.load(html);

                const cantidadPagina =
                    contarItemsPagina($);

                const antes =
                    items.length;

                // Primero enlaces directos.
                extraerItemsDesdeEnlaces(
                    $,
                    items,
                    vistos
                );

                // Luego fallback visual.
                extraerItemsVisuales(
                    $,
                    items,
                    vistos
                );

                const nuevos =
                    items.length - antes;

                console.log(
                    `[RUST STORE] Página ${pagina + 1}: ${cantidadPagina} artículos detectados, ${nuevos} nuevos. Total: ${items.length}`
                );

                // =====================================
                // SI NO HAY NADA NUEVO, TERMINAMOS
                // =====================================

                if (
                    nuevos === 0
                ) {

                    console.log(
                        "[RUST STORE] No hay más artículos nuevos."
                    );

                    break;
                }

                // =====================================
                // SI LA PÁGINA TIENE MENOS DE 12,
                // ES LA ÚLTIMA PÁGINA
                // =====================================

                if (
                    cantidadPagina < STEAM_PAGE_SIZE
                ) {

                    console.log(
                        "[RUST STORE] Última página alcanzada."
                    );

                    break;
                }

                // =====================================
                // SIGUIENTE PÁGINA
                // =====================================

                start +=
                    STEAM_PAGE_SIZE;

                pagina++;

                if (
                    items.length < MAX_ITEMS
                ) {
                    await esperar(
                        REQUEST_DELAY
                    );
                }
            }

            // =========================================
            // BUSCAR IMÁGENES FALTANTES
            // =========================================

            const sinImagen =
                items.filter(
                    item =>
                        !item.imagen &&
                        item.url
                );

            if (
                sinImagen.length
            ) {

                console.log(
                    `[RUST STORE] Buscando ${sinImagen.length} imágenes faltantes...`
                );

                const loteSize = 3;

                for (
                    let i = 0;
                    i < sinImagen.length;
                    i += loteSize
                ) {

                    const lote =
                        sinImagen.slice(
                            i,
                            i + loteSize
                        );

                    await Promise.all(
                        lote.map(
                            async item => {

                                const imagen =
                                    await obtenerImagenDesdeDetail(
                                        item.url
                                    );

                                if (imagen) {
                                    item.imagen =
                                        imagen;
                                }
                            }
                        )
                    );

                    if (
                        i + loteSize <
                        sinImagen.length
                    ) {
                        await esperar(
                            REQUEST_DELAY
                        );
                    }
                }
            }

            // =========================================
            // RESULTADO
            // =========================================

            if (
                items.length
            ) {

                console.log(
                    `[RUST STORE] TOTAL FINAL: ${items.length} artículos encontrados.`
                );

                return items.slice(
                    0,
                    MAX_ITEMS
                );
            }

        } catch (error) {

            console.error(
                `[RUST STORE] Error con cc=${variante.cc} lang=${variante.language}:`,
                error.message
            );
        }
    }

    console.error(
        "[RUST STORE] No se pudieron obtener artículos de Steam."
    );

    return [];
}

// =====================================================
// EMBED
// =====================================================

function crearEmbedItem(item) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🎨 ${item.nombre}`
            )
            .setDescription(
                [
                    item.precio
                        ? `💰 **Precio:** ${item.precio}`
                        : null,

                    item.url
                        ? `🔗 [Ver artículo en Steam](${item.url})`
                        : null
                ]
                    .filter(Boolean)
                    .join("\n\n")
            )
            .setColor(0xff6a00)
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
            crearBotonItem(item);

        await channel.send({
            embeds: [
                crearEmbedItem(item)
            ],
            components:
                row
                    ? [row]
                    : []
        });

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

    let publicados = 0;

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

        await interaction.deferReply();

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

        let publicados = 0;

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
                    ephemeral: true
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

    tiendaRevisando = true;

    let lockAdquirido = false;

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
            ].includes(dia)
        ) {

            return;
        }

        const configs =
            await ServerConfig.find({
                rustStoreEnabled: true,
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

        // =============================================
        // LOCK GLOBAL
        // =============================================

        lockAdquirido =
            await adquirirBloqueoTienda();

        if (
            !lockAdquirido
        ) {
            return;
        }

        // =============================================
        // SERVIDORES
        // =============================================

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

                // =====================================
                // COMPROBAR SI YA SE PUBLICÓ
                // =====================================

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

                let publicados = 0;

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

    // Primera revisión después de 15 segundos.
    setTimeout(
        () => {

            revisarTiendaAutomatica(
                client
            );

        },
        15000
    );

    // Revisar cada 10 minutos.
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