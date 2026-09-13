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

const TIMEZONE_CHILE =
    "America/Santiago";

const MAX_ITEMS = 100;

const CHECK_INTERVAL =
    10 * 60 * 1000;

const DETAIL_DELAY =
    200;

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
// CLIENTE STEAM
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

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
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

// =====================================================
// PRECIO
// =====================================================

function limpiarPrecio(valor) {

    if (!valor) {
        return "";
    }

    const texto =
        String(valor)
            .replace(
                /&nbsp;/gi,
                " "
            )
            .replace(
                /\s+/g,
                " "
            )
            .trim();

    const patrones = [
        /(?:US\s*)?\$\s*\d+(?:[.,]\d{1,2})?/i,
        /€\s*\d+(?:[.,]\d{1,2})?/i,
        /\d+(?:[.,]\d{1,2})?\s*€/i,
        /£\s*\d+(?:[.,]\d{1,2})?/i,
        /USD\s*\d+(?:[.,]\d{1,2})?/i,
        /EUR\s*\d+(?:[.,]\d{1,2})?/i,
        /GBP\s*\d+(?:[.,]\d{1,2})?/i
    ];

    for (
        const patron
        of patrones
    ) {

        const match =
            texto.match(
                patron
            );

        if (match) {
            return normalizarTexto(
                match[0]
            );
        }
    }

    return "";
}

// =====================================================
// IMAGEN STEAM
// =====================================================

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
        imagen.includes(
            "/economy/image/"
        )
    ) {

        return imagen;
    }

    if (
        imagen.includes(
            "steamstatic.com"
        )
    ) {

        return imagen;
    }

    return null;
}

// =====================================================
// BUSCAR IMAGEN
// =====================================================

function buscarImagen($) {

    let imagen =
        null;

    // -------------------------------------------------
    // META OG IMAGE
    // -------------------------------------------------

    const metas = [
        $('meta[property="og:image"]').attr(
            "content"
        ),

        $('meta[name="twitter:image"]').attr(
            "content"
        ),

        $('meta[property="twitter:image"]').attr(
            "content"
        )
    ];

    for (
        const meta
        of metas
    ) {

        const encontrada =
            normalizarImagenSteam(
                meta
            );

        if (encontrada) {

            imagen =
                encontrada;

            break;
        }
    }

    if (imagen) {
        return imagen;
    }

    // -------------------------------------------------
    // IMÁGENES
    // -------------------------------------------------

    $("img").each(
        (i, elemento) => {

            if (imagen) {
                return;
            }

            const atributos = [
                "src",
                "data-src",
                "data-original",
                "data-image",
                "data-image-url",
                "data-full-image",
                "data-large-image"
            ];

            for (
                const atributo
                of atributos
            ) {

                const valor =
                    $(elemento).attr(
                        atributo
                    );

                if (!valor) {
                    continue;
                }

                const encontrada =
                    normalizarImagenSteam(
                        String(valor)
                            .split(",")[0]
                            .trim()
                            .split(" ")[0]
                    );

                if (encontrada) {

                    imagen =
                        encontrada;

                    break;
                }
            }
        }
    );

    return imagen;
}

// =====================================================
// BUSCAR NOMBRE REAL
// =====================================================

function limpiarNombre(nombre) {

    if (!nombre) {
        return "";
    }

    let texto =
        normalizarTexto(
            nombre
        );

    // Elimina títulos típicos de Steam
    texto =
        texto
            .replace(
                /\s*[-|]\s*Steam\s*$/i,
                ""
            )
            .trim();

    if (
        !texto ||
        texto.length < 2
    ) {
        return "";
    }

    // Evitar nombres genéricos
    if (
        /^Item Rust \d+$/i.test(
            texto
        )
    ) {
        return "";
    }

    if (
        /^Rust Item Store$/i.test(
            texto
        )
    ) {
        return "";
    }

    return texto;
}

// =====================================================
// EXTRAER NOMBRE DEL DETAIL
// =====================================================

function buscarNombre($) {

    const selectores = [

        // H1 / títulos principales
        "h1",

        ".item_name",

        ".itemstore_item_name",

        ".itemstore_item_name_container",

        ".itemstore_item_details_name",

        ".store_item_name",

        ".item_name_holder",

        // Selectores relacionados
        "[class*='item_name']",

        "[class*='itemname']",

        "[class*='itemName']",

        "[class*='store_item']"
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

            const texto =
                limpiarNombre(
                    $(elementos[i])
                        .text()
                );

            if (texto) {

                return texto;
            }
        }
    }

    // -------------------------------------------------
    // META OG TITLE
    // -------------------------------------------------

    const metas = [

        $('meta[property="og:title"]').attr(
            "content"
        ),

        $('meta[name="twitter:title"]').attr(
            "content"
        )
    ];

    for (
        const meta
        of metas
    ) {

        const texto =
            limpiarNombre(
                meta
            );

        if (texto) {

            return texto;
        }
    }

    // -------------------------------------------------
    // TITLE
    // -------------------------------------------------

    const title =
        limpiarNombre(
            $("title").first().text()
        );

    if (title) {

        return title;
    }

    return "";
}

// =====================================================
// BUSCAR PRECIO EN DETAIL
// =====================================================

function buscarPrecio($) {

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

        const elementos =
            $(selector);

        for (
            let i = 0;
            i < elementos.length;
            i++
        ) {

            const precio =
                limpiarPrecio(
                    $(elementos[i])
                        .text()
                );

            if (precio) {

                return precio;
            }
        }
    }

    return limpiarPrecio(
        $("body").text()
    );
}

// =====================================================
// PRECIO DESDE HTML
// =====================================================

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
// OBTENER DETAIL
// =====================================================

async function obtenerDatosDesdeDetail(
    item
) {

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

        // -------------------------------------------------
        // NOMBRE
        // -------------------------------------------------

        const nombre =
            buscarNombre($);

        if (nombre) {

            item.nombre =
                nombre;
        }

        // -------------------------------------------------
        // IMAGEN
        // -------------------------------------------------

        const imagen =
            buscarImagen($);

        if (imagen) {

            item.imagen =
                imagen;

            console.log(
                `[RUST STORE] Imagen encontrada: ${item.nombre} -> ${imagen}`
            );
        }

        // -------------------------------------------------
        // PRECIO
        // -------------------------------------------------

        let precio =
            buscarPrecio($);

        if (!precio) {

            precio =
                buscarPrecioDesdeHTML(
                    html
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
// EXTRAER IDs DE LA PÁGINA LIMITED
// =====================================================

function extraerIDsDesdeHTML(
    html
) {

    const ids =
        new Set();

    if (!html) {
        return ids;
    }

    const texto =
        String(html);

    // -------------------------------------------------
    // LINKS DIRECTOS DETAIL
    // -------------------------------------------------

    const patrones = [

        /\/itemstore\/252490\/detail\/(\d+)\/?/gi,

        /itemdefid["'\s:=\\]+(\d{4,})/gi,

        /item_def_id["'\s:=\\]+(\d{4,})/gi,

        /itemdef_id["'\s:=\\]+(\d{4,})/gi
    ];

    for (
        const patron
        of patrones
    ) {

        let match;

        while (
            (match =
                patron.exec(
                    texto
                )) !== null
        ) {

            const id =
                String(
                    match[1]
                );

            if (
                /^\d+$/.test(
                    id
                )
            ) {

                ids.add(
                    id
                );
            }
        }
    }

    return ids;
}

// =====================================================
// EXTRAER NOMBRE DESDE EL ENLACE
// =====================================================

function buscarNombreEnlace(
    $,
    id
) {

    const enlaces =
        $(
            `a[href*="/itemstore/252490/detail/${id}"]`
        );

    for (
        let i = 0;
        i < enlaces.length;
        i++
    ) {

        const enlace =
            $(enlaces[i]);

        const candidatos = [

            enlace.text(),

            enlace.attr(
                "title"
            ),

            enlace.attr(
                "aria-label"
            )
        ];

        for (
            const candidato
            of candidatos
        ) {

            const nombre =
                limpiarNombre(
                    candidato
                );

            if (nombre) {

                return nombre;
            }
        }
    }

    return "";
}

// =====================================================
// OBTENER LIMITED DESDE HTML
// =====================================================

async function obtenerTiendaHTML() {

    console.log(
        "[RUST STORE] Consultando página Limited de Steam..."
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

        // -------------------------------------------------
        // TOTAL
        // -------------------------------------------------

        const texto =
            $("body").text();

        const totalMatch =
            texto.match(
                /(?:Showing|Mostrando)\s+\d+\s*-\s*\d+\s+(?:of|de)\s+(\d+)/i
            );

        if (totalMatch) {

            console.log(
                `[RUST STORE] Steam indica ${totalMatch[1]} resultados Limited.`
            );
        }

        // -------------------------------------------------
        // IDS VISIBLES
        // -------------------------------------------------

        const ids =
            extraerIDsDesdeHTML(
                html
            );

        console.log(
            `[RUST STORE] IDs Limited detectados en HTML: ${ids.size}`
        );

        // -------------------------------------------------
        // CREAR ITEMS
        // -------------------------------------------------

        for (
            const id
            of ids
        ) {

            if (
                resultado.has(id)
            ) {
                continue;
            }

            const nombre =
                buscarNombreEnlace(
                    $,
                    id
                );

            resultado.set(
                id,
                {
                    id,

                    nombre:
                        nombre ||
                        `Item Rust ${id}`,

                    precio:
                        "",

                    imagen:
                        null,

                    url:
                        `${STEAM_BASE_URL}/itemstore/${STEAM_APP_ID}/detail/${encodeURIComponent(id)}/`
                }
            );
        }

    } catch (error) {

        console.error(
            "[RUST STORE] Error página Limited:",
            error.message
        );
    }

    const items =
        Array.from(
            resultado.values()
        );

    console.log(
        `[RUST STORE] Limited encontrados en esta página: ${items.length}`
    );

    return items;
}

// =====================================================
// OBTENER TIENDA
// =====================================================

async function obtenerTiendaRust() {

    console.log(
        "[RUST STORE] Consultando Steam..."
    );

    let items =
        await obtenerTiendaHTML();

    if (
        !items ||
        items.length === 0
    ) {

        console.log(
            "[RUST STORE] No se encontraron artículos Limited."
        );

        return [];
    }

    // -------------------------------------------------
    // ELIMINAR DUPLICADOS
    // -------------------------------------------------

    const unicos =
        new Map();

    for (
        const item
        of items
    ) {

        if (
            !unicos.has(
                String(
                    item.id
                )
            )
        ) {

            unicos.set(
                String(
                    item.id
                ),
                item
            );
        }
    }

    items =
        Array.from(
            unicos.values()
        );

    // -------------------------------------------------
    // LIMITE
    // -------------------------------------------------

    items =
        items.slice(
            0,
            MAX_ITEMS
        );

    console.log(
        `[RUST STORE] Total de artículos Limited a completar: ${items.length}`
    );

    // -------------------------------------------------
    // DETAILS
    // -------------------------------------------------

    const completos =
        [];

    for (
        const item
        of items
    ) {

        const completo =
            await obtenerDatosDesdeDetail(
                item
            );

        completos.push(
            completo
        );

        await esperar(
            DETAIL_DELAY
        );
    }

    // -------------------------------------------------
    // ELIMINAR ITEMS SIN DATOS VÁLIDOS
    // -------------------------------------------------

    const finales =
        completos.filter(
            item =>
                item &&
                /^\d+$/.test(
                    String(
                        item.id
                    )
                )
        );

    // -------------------------------------------------
    // ORDENAR
    // -------------------------------------------------

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

    // -------------------------------------------------
    // ESTADÍSTICAS
    // -------------------------------------------------

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

    const conNombreReal =
        finales.filter(
            item =>
                item.nombre &&
                !/^Item Rust \d+$/i.test(
                    item.nombre
                )
        ).length;

    console.log(
        `[RUST STORE] DATOS FINALES: ${conNombreReal}/${finales.length} con nombre, ${conImagen}/${finales.length} con imagen, ${conPrecio}/${finales.length} con precio.`
    );

    console.log(
        `[RUST STORE] TOTAL FINAL: ${finales.length} artículos Limited encontrados.`
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
            `✅ Tienda de Rust publicada: **${items.length} artículos Limited**.`
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

// =====================================================
// HORA CHILE
// =====================================================

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

    const mapa =
        {};

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