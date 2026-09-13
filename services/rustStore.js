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

const STEAM_AJAX_URL =
    "https://store.steampowered.com/itemstore/252490/ajaxgetitemdefs";

const STEAM_DETAIL_URL =
    "https://store.steampowered.com/itemstore/252490/detail/";

const REQUEST_DELAY = 250;

const MAX_ITEMS = 100;

// Comprobar Steam cada 10 minutos
const CHECK_INTERVAL = 10 * 60 * 1000;

let tiendaRevisando = false;

// =====================================================
// HEADERS
// =====================================================

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36",

    "Accept-Language":
        "en-US,en;q=0.9",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
};

// =====================================================
// UTILIDADES
// =====================================================

function esperar(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

function limpiarTexto(texto) {

    if (!texto) {
        return "";
    }

    return String(texto)
        .replace(/\s+/g, " ")
        .trim();
}

function esNombreGenerico(nombre) {

    if (!nombre) {
        return true;
    }

    const texto =
        limpiarTexto(nombre).toLowerCase();

    return (
        texto === "item" ||
        texto === "rust item" ||
        texto === "item definition" ||
        texto === "unknown" ||
        texto === "unknown item"
    );
}

function normalizarImagen(imagen) {

    if (!imagen) {
        return null;
    }

    let url =
        String(imagen).trim();

    if (
        url.startsWith("//")
    ) {
        url =
            "https:" + url;
    }

    if (
        url.startsWith("/")
    ) {
        url =
            "https://store.steampowered.com" + url;
    }

    return url;
}

function normalizarPrecio(precio) {

    if (
        precio === null ||
        precio === undefined
    ) {
        return null;
    }

    let texto =
        limpiarTexto(precio);

    if (!texto) {
        return null;
    }

    const match =
        texto.match(
            /(?:US\$|\$)?\s*\d+(?:[.,]\d{1,2})?/
        );

    if (!match) {
        return null;
    }

    let resultado =
        match[0]
            .replace(/\s+/g, "")
            .replace(",", ".");

    if (
        !resultado.startsWith("$") &&
        !resultado.startsWith("US$")
    ) {
        resultado =
            "$" + resultado;
    }

    if (
        resultado.startsWith("US$")
    ) {
        resultado =
            "$" +
            resultado.substring(3);
    }

    return resultado;
}

// =====================================================
// EXTRAER IDS DE ITEMS
// =====================================================

function extraerIDsItems(texto) {

    if (!texto) {
        return [];
    }

    const encontrados =
        String(texto).match(
            /\b\d{4,6}\b/g
        ) || [];

    return [
        ...new Set(encontrados)
    ];
}

// =====================================================
// OBTENER HTML
// =====================================================

async function obtenerHTML(url) {

    const respuesta =
        await axios.get(
            url,
            {
                headers: HEADERS,
                timeout: 30000,
                responseType: "text"
            }
        );

    return respuesta.data;
}

// =====================================================
// BUSCAR IDS EN HTML
// =====================================================

function buscarIDsEnHTML(html) {

    if (!html) {
        return [];
    }

    const $ =
        cheerio.load(html);

    const ids =
        new Set();

    // Buscar atributos relacionados con item definitions
    $("[data-itemdefid]").each(
        (index, elemento) => {

            const id =
                $(elemento)
                    .attr("data-itemdefid");

            if (
                id &&
                /^\d+$/.test(id)
            ) {
                ids.add(id);
            }
        }
    );

    $("[data-item-def-id]").each(
        (index, elemento) => {

            const id =
                $(elemento)
                    .attr("data-item-def-id");

            if (
                id &&
                /^\d+$/.test(id)
            ) {
                ids.add(id);
            }
        }
    );

    $("[data-itemid]").each(
        (index, elemento) => {

            const id =
                $(elemento)
                    .attr("data-itemid");

            if (
                id &&
                /^\d+$/.test(id)
            ) {
                ids.add(id);
            }
        }
    );

    $("[data-item-id]").each(
        (index, elemento) => {

            const id =
                $(elemento)
                    .attr("data-item-id");

            if (
                id &&
                /^\d+$/.test(id)
            ) {
                ids.add(id);
            }
        }
    );

    // Buscar también patrones de itemdefid dentro del HTML
    const patrones = [

        /itemdefid["'\s:=]+(\d+)/gi,

        /item_def_id["'\s:=]+(\d+)/gi,

        /itemid["'\s:=]+(\d+)/gi,

        /item_id["'\s:=]+(\d+)/gi
    ];

    for (
        const regex of patrones
    ) {

        let match;

        while (
            (match = regex.exec(html)) !== null
        ) {

            if (
                match[1] &&
                /^\d+$/.test(match[1])
            ) {
                ids.add(match[1]);
            }
        }
    }

    const resultado =
        [...ids];

    console.log(
        "[RUST STORE] IDs detectados en HTML:",
        resultado.length
    );

    return resultado;
}

// =====================================================
// OBTENER IDS DESDE AJAX
// =====================================================

async function obtenerIDsDesdeAjax() {

    console.log(
        "[RUST STORE] Consultando ajaxgetitemdefs..."
    );

    try {

        const respuesta =
            await axios.get(
                STEAM_AJAX_URL,
                {
                    params: {
                        start: 0,
                        count: 100,
                        json: 1,
                        searchtext: "",
                        cc: "us",
                        l: "english"
                    },

                    headers: {
                        ...HEADERS,

                        Referer:
                            STEAM_STORE_URL,

                        "X-Requested-With":
                            "XMLHttpRequest",

                        Accept:
                            "application/json,text/javascript,*/*;q=0.01"
                    },

                    timeout: 30000
                }
            );

        const data =
            respuesta.data;

        console.log(
            "[RUST STORE] AJAX keys:",
            Object.keys(data || {})
        );

        const ids =
            new Set();

        // =================================================
        // ANALIZAR MATCHES
        // =================================================

        if (
            Array.isArray(data?.matches)
        ) {

            for (
                const match of data.matches
            ) {

                if (
                    match === null ||
                    match === undefined
                ) {
                    continue;
                }

                // Si matches trae directamente un número
                if (
                    typeof match === "number"
                ) {

                    ids.add(
                        String(match)
                    );

                    continue;
                }

                // Si trae un string
                if (
                    typeof match === "string"
                ) {

                    const encontrados =
                        match.match(
                            /\b\d{4,6}\b/g
                        ) || [];

                    for (
                        const id of encontrados
                    ) {
                        ids.add(id);
                    }

                    continue;
                }

                // Si trae un objeto
                if (
                    typeof match === "object"
                ) {

                    const posiblesCampos = [
                        "itemdefid",
                        "item_def_id",
                        "itemid",
                        "item_id",
                        "id",
                        "itemDefId",
                        "itemId"
                    ];

                    for (
                        const campo of posiblesCampos
                    ) {

                        if (
                            match[campo] !== undefined &&
                            match[campo] !== null
                        ) {

                            const valor =
                                String(
                                    match[campo]
                                );

                            if (
                                /^\d+$/.test(valor)
                            ) {
                                ids.add(valor);
                            }
                        }
                    }

                    // Buscar IDs dentro del objeto
                    const texto =
                        JSON.stringify(
                            match
                        );

                    const encontrados =
                        texto.match(
                            /\b\d{4,6}\b/g
                        ) || [];

                    for (
                        const id of encontrados
                    ) {
                        ids.add(id);
                    }
                }
            }
        }

        // =================================================
        // FALLBACK: BUSCAR EN TODA LA RESPUESTA
        // =================================================

        if (
            ids.size === 0
        ) {

            const texto =
                JSON.stringify(data);

            const encontrados =
                texto.match(
                    /\b\d{4,6}\b/g
                ) || [];

            for (
                const id of encontrados
            ) {
                ids.add(id);
            }
        }

        const resultado =
            [...ids];

        console.log(
            "[RUST STORE] IDs encontrados en AJAX:",
            resultado.length
        );

        return resultado;

    } catch (error) {

        console.error(
            "[RUST STORE] Error consultando AJAX:",
            error.message
        );

        return [];
    }
}

// =====================================================
// OBTENER DETALLE
// =====================================================

async function obtenerDetalle(id) {

    const url =
        STEAM_DETAIL_URL + id;

    try {

        const html =
            await obtenerHTML(url);

        const $ =
            cheerio.load(html);

        let nombre =
            "";

        let imagen =
            null;

        let precio =
            null;

        // =================================================
        // NOMBRE
        // =================================================

        const posiblesNombres = [

            "h1",

            ".item_name",

            ".item_def_name",

            ".itemstore_item_name",

            ".item_title",

            ".market_listing_item_name",

            "[class*='item_name']",

            "[class*='item-title']",

            "[class*='item_title']"
        ];

        for (
            const selector of posiblesNombres
        ) {

            const valor =
                limpiarTexto(
                    $(selector)
                        .first()
                        .text()
                );

            if (
                valor &&
                !esNombreGenerico(valor)
            ) {

                nombre =
                    valor;

                break;
            }
        }

        // =================================================
        // IMAGEN
        // =================================================

        const posiblesImagenes = [

            ".itemstore_item_image img",

            ".item_image img",

            ".itemstore_item img",

            ".item_preview img",

            ".item_details img",

            "img"
        ];

        for (
            const selector of posiblesImagenes
        ) {

            let src =
                $(selector)
                    .first()
                    .attr("src");

            if (!src) {

                src =
                    $(selector)
                        .first()
                        .attr("data-src");
            }

            if (!src) {
                continue;
            }

            const normalizada =
                normalizarImagen(src);

            if (
                normalizada &&
                (
                    normalizada.includes(
                        "steamstatic"
                    ) ||
                    normalizada.includes(
                        "steamcommunity"
                    ) ||
                    normalizada.includes(
                        "steampowered"
                    ) ||
                    normalizada.includes(
                        "economy"
                    )
                )
            ) {

                imagen =
                    normalizada;

                break;
            }
        }

        // =================================================
        // FALLBACK IMAGEN
        // =================================================

        if (!imagen) {

            const matches =
                html.match(
                    /https?:\/\/[^"'\\\s]+(?:economy|steamstatic)[^"'\\\s]+/gi
                ) || [];

            for (
                const match of matches
            ) {

                const candidata =
                    normalizarImagen(
                        match
                    );

                if (
                    candidata
                ) {

                    imagen =
                        candidata;

                    break;
                }
            }
        }

        // =================================================
        // PRECIO
        // =================================================

        const posiblesPrecios = [

            ".item_price",

            ".price",

            ".itemstore_item_price",

            ".item_purchase_price",

            "[class*='price']"
        ];

        for (
            const selector of posiblesPrecios
        ) {

            const valor =
                limpiarTexto(
                    $(selector)
                        .first()
                        .text()
                );

            const normalizado =
                normalizarPrecio(
                    valor
                );

            if (
                normalizado
            ) {

                precio =
                    normalizado;

                break;
            }
        }

        // =================================================
        // FALLBACK PRECIO
        // =================================================

        if (!precio) {

            const matches =
                html.match(
                    /(?:US\$|\$)\s*\d+(?:[.,]\d{1,2})?/g
                ) || [];

            if (
                matches.length
            ) {

                precio =
                    normalizarPrecio(
                        matches[0]
                    );
            }
        }

        console.log(
            `[RUST STORE] Detail ${id}: ` +
            `${nombre || "SIN NOMBRE"} | ` +
            `${precio || "SIN PRECIO"} | ` +
            `${imagen ? "IMAGEN OK" : "SIN IMAGEN"}`
        );

        return {
            id,
            nombre,
            imagen,
            precio
        };

    } catch (error) {

        console.error(
            `[RUST STORE] Error obteniendo detalle ${id}:`,
            error.message
        );

        return {
            id,
            nombre: "",
            imagen: null,
            precio: null
        };
    }
}

// =====================================================
// OBTENER TIENDA LIMITED
// =====================================================

async function obtenerTiendaLimited() {

    console.log(
        "\n[RUST STORE] Consultando página Limited de Steam..."
    );

    // =================================================
    // HTML
    // =================================================

    let html;

    try {

        html =
            await obtenerHTML(
                STEAM_STORE_URL
            );

    } catch (error) {

        console.error(
            "[RUST STORE] Error obteniendo página Limited:",
            error.message
        );

        throw error;
    }

    let idsHTML =
        buscarIDsEnHTML(
            html
        );

    // =================================================
    // AJAX
    // =================================================

    const idsAjax =
        await obtenerIDsDesdeAjax();

    // =================================================
    // UNIR RESULTADOS
    // =================================================

    const idsSet =
        new Set();

    for (
        const id of idsHTML
    ) {
        idsSet.add(
            String(id)
        );
    }

    for (
        const id of idsAjax
    ) {
        idsSet.add(
            String(id)
        );
    }

    // =================================================
    // IMPORTANTE:
    //
    // NO HAY IDS FIJOS.
    //
    // No agregamos los 70600-70616 anteriores.
    // Steam decide cuáles están actualmente disponibles.
    // =================================================

    let ids =
        [...idsSet];

    // =================================================
    // FILTRAR IDS VÁLIDOS
    // =================================================

    ids =
        ids.filter(
            id =>
                /^\d+$/.test(id)
        );

    // =================================================
    // ORDENAR
    // =================================================

    ids.sort(
        (a, b) =>
            Number(a) - Number(b)
    );

    console.log(
        "[RUST STORE] IDs Limited actuales detectados:",
        ids.length
    );

    console.log(
        "[RUST STORE] IDs:",
        ids.join(", ")
    );

    // =================================================
    // LIMITAR
    // =================================================

    ids =
        ids.slice(
            0,
            MAX_ITEMS
        );

    // =================================================
    // SI NO HAY IDS
    // =================================================

    if (
        ids.length === 0
    ) {

        console.log(
            "[RUST STORE] No se detectaron artículos."
        );

        return [];
    }

    // =================================================
    // DETALLES
    // =================================================

    const items = [];

    for (
        const id of ids
    ) {

        const detalle =
            await obtenerDetalle(
                id
            );

        // Si Steam no pudo entregar nombre,
        // no inventamos un nombre de otro artículo.
        if (
            !detalle.nombre
        ) {

            console.log(
                `[RUST STORE] ${id}: sin nombre, se omite.`
            );

            continue;
        }

        const item = {

            id,

            nombre:
                detalle.nombre,

            imagen:
                detalle.imagen,

            precio:
                detalle.precio,

            url:
                `https://store.steampowered.com/itemstore/252490/detail/${id}/`
        };

        items.push(
            item
        );

        await esperar(
            REQUEST_DELAY
        );
    }

    // =================================================
    // RESUMEN
    // =================================================

    const conNombre =
        items.filter(
            item =>
                !!item.nombre
        ).length;

    const conImagen =
        items.filter(
            item =>
                !!item.imagen
        ).length;

    const conPrecio =
        items.filter(
            item =>
                !!item.precio
        ).length;

    console.log(
        `[RUST STORE] DATOS FINALES: ` +
        `${conNombre}/${items.length} con nombre, ` +
        `${conImagen}/${items.length} con imagen, ` +
        `${conPrecio}/${items.length} con precio.`
    );

    console.log(
        `[RUST STORE] TOTAL FINAL: ${items.length} artículos Limited encontrados.`
    );

    return items;
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    item,
    indice,
    total
) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🛒 ${item.nombre}`
            )
            .setDescription(
                `**Tienda Limited de Rust**\n\n` +
                `💰 **Precio:** ${item.precio || "No disponible"}\n\n` +
                `🛍️ Artículo **${indice + 1}/${total}**`
            )
            .setURL(
                item.url
            );

    if (
        item.imagen
    ) {

        embed.setImage(
            item.imagen
        );
    }

    embed.setFooter({
        text:
            "RustLogix • Rust Store"
    });

    return embed;
}

// =====================================================
// BOTÓN STEAM
// =====================================================

function crearBotonSteam(
    item
) {

    return new ActionRowBuilder()
        .addComponents(

            new ButtonBuilder()
                .setLabel(
                    "Ver artículo en Steam"
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
// GENERAR FIRMA
// =====================================================
//
// La cantidad de artículos NO importa.
// La firma se genera con los IDs que existan
// actualmente.
//
// Ejemplos:
//
// 12 artículos -> firma de 12 IDs
// 17 artículos -> firma de 17 IDs
// 20 artículos -> firma de 20 IDs
//
// Si cambia cualquiera de los IDs o la cantidad,
// cambia la firma.
// =====================================================

function generarFirmaTienda(
    items
) {

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        return null;
    }

    return items
        .map(
            item =>
                String(item.id)
        )
        .sort(
            (a, b) =>
                Number(a) - Number(b)
        )
        .join(",");
}

// =====================================================
// PUBLICAR TIENDA EN CANAL
// =====================================================

async function publicarTiendaEnCanal(
    canal,
    items
) {

    if (
        !canal ||
        !canal.isTextBased()
    ) {

        throw new Error(
            "El canal de la tienda no es válido."
        );
    }

    if (
        !Array.isArray(items) ||
        items.length === 0
    ) {

        throw new Error(
            "No hay artículos para publicar."
        );
    }

    console.log(
        `[RUST STORE] Publicando ${items.length} artículos...`
    );

    for (
        let i = 0;
        i < items.length;
        i++
    ) {

        const item =
            items[i];

        const embed =
            crearEmbed(
                item,
                i,
                items.length
            );

        const row =
            crearBotonSteam(
                item
            );

        await canal.send({
            embeds: [
                embed
            ],
            components: [
                row
            ]
        });

        console.log(
            `[RUST STORE] Publicado: ${item.nombre}`
        );

        if (
            i <
            items.length - 1
        ) {

            await esperar(
                300
            );
        }
    }

    console.log(
        `[RUST STORE] Publicado: ${items.length} artículos.`
    );
}

// =====================================================
// /TIENDA MANUAL
// =====================================================

async function publicarTiendaManual(
    interaction
) {

    console.log(
        "\n🎯 Ejecutando /tienda"
    );

    try {

        const items =
            await obtenerTiendaLimited();

        if (
            !items.length
        ) {

            return await interaction.editReply(
                "❌ No se encontraron artículos Limited en la tienda de Rust."
            );
        }

        console.log(
            `[RUST STORE] Publicando ${items.length} artículos...`
        );

        // =================================================
        // PRIMER ARTÍCULO
        // =================================================

        const primerItem =
            items[0];

        const primerEmbed =
            crearEmbed(
                primerItem,
                0,
                items.length
            );

        const primerRow =
            crearBotonSteam(
                primerItem
            );

        await interaction.editReply({
            embeds: [
                primerEmbed
            ],
            components: [
                primerRow
            ]
        });

        console.log(
            `[RUST STORE] Publicado: ${primerItem.nombre}`
        );

        // =================================================
        // RESTO
        // =================================================

        for (
            let i = 1;
            i < items.length;
            i++
        ) {

            const item =
                items[i];

            const embed =
                crearEmbed(
                    item,
                    i,
                    items.length
                );

            const row =
                crearBotonSteam(
                    item
                );

            await interaction.channel.send({
                embeds: [
                    embed
                ],
                components: [
                    row
                ]
            });

            console.log(
                `[RUST STORE] Publicado: ${item.nombre}`
            );

            await esperar(
                300
            );
        }

        console.log(
            `[RUST STORE] Publicado: ${items.length} artículos.`
        );

        console.log(
            "✅ /tienda terminado"
        );

    } catch (error) {

        console.error(
            "❌ ERROR PUBLICANDO TIENDA MANUAL:",
            error
        );

        try {

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply(
                    "❌ Ocurrió un error obteniendo la tienda de Rust."
                );

            } else {

                await interaction.reply({
                    content:
                        "❌ Ocurrió un error obteniendo la tienda de Rust.",
                    ephemeral: true
                });
            }

        } catch (
            errorRespuesta
        ) {

            console.error(
                "❌ ERROR RESPONDIENDO INTERACCIÓN:",
                errorRespuesta
            );
        }
    }
}

// =====================================================
// REVISAR TIENDA AUTOMÁTICA
// =====================================================

async function revisarTiendaAutomatica(
    client
) {

    if (
        tiendaRevisando
    ) {

        console.log(
            "[RUST STORE] Ya hay una revisión en curso. Se omite."
        );

        return;
    }

    tiendaRevisando =
        true;

    try {

        console.log(
            "\n====================================================="
        );

        console.log(
            "[RUST STORE] Comprobación automática..."
        );

        console.log(
            "====================================================="
        );

        // =================================================
        // CONFIGURACIONES ACTIVAS
        // =================================================

        const configs =
            await ServerConfig.find({
                rustStoreEnabled: true,

                rustStoreChannelId: {
                    $exists: true,
                    $ne: null
                }
            });

        if (
            !configs.length
        ) {

            console.log(
                "[RUST STORE] No hay servidores con tienda automática configurada."
            );

            return;
        }

        console.log(
            `[RUST STORE] Servidores activos: ${configs.length}`
        );

        // =================================================
        // OBTENER TIENDA ACTUAL
        // =================================================

        let items;

        try {

            items =
                await obtenerTiendaLimited();

        } catch (error) {

            console.error(
                "[RUST STORE] Error consultando Steam:",
                error.message
            );

            return;
        }

        if (
            !items ||
            !items.length
        ) {

            console.log(
                "[RUST STORE] Steam no devolvió artículos."
            );

            return;
        }

        // =================================================
        // FIRMA ACTUAL
        // =================================================

        const firmaActual =
            generarFirmaTienda(
                items
            );

        if (
            !firmaActual
        ) {

            console.log(
                "[RUST STORE] No se pudo generar firma."
            );

            return;
        }

        console.log(
            "[RUST STORE] Firma actual:",
            firmaActual
        );

        // =================================================
        // CADA SERVIDOR
        // =================================================

        for (
            const config of configs
        ) {

            try {

                const guild =
                    client.guilds.cache.get(
                        config.guildId
                    );

                if (
                    !guild
                ) {

                    console.log(
                        `[RUST STORE] Guild ${config.guildId} no disponible.`
                    );

                    continue;
                }

                // =================================================
                // CANAL
                // =================================================

                let canal =
                    guild.channels.cache.get(
                        config.rustStoreChannelId
                    );

                if (
                    !canal
                ) {

                    try {

                        canal =
                            await guild.channels.fetch(
                                config.rustStoreChannelId
                            );

                    } catch (errorCanal) {

                        console.error(
                            `[RUST STORE] No se pudo obtener canal ${config.rustStoreChannelId}:`,
                            errorCanal.message
                        );

                        continue;
                    }
                }

                if (
                    !canal ||
                    !canal.isTextBased()
                ) {

                    console.log(
                        `[RUST STORE] Canal inválido en ${guild.name}.`
                    );

                    continue;
                }

                // =================================================
                // PRIMERA VEZ
                // =================================================
                //
                // Guardamos una referencia.
                // No publicamos una tienda que ya estaba activa
                // antes de configurar la automatización.
                // =================================================

                if (
                    !config.rustStoreLastSignature
                ) {

                    config.rustStoreLastSignature =
                        firmaActual;

                    config.rustStoreLastPublishedWeek =
                        new Date().toISOString();

                    await config.save();

                    console.log(
                        `[RUST STORE] ${guild.name}: firma inicial guardada.`
                    );

                    continue;
                }

                // =================================================
                // SIN CAMBIOS
                // =================================================

                if (
                    config.rustStoreLastSignature ===
                    firmaActual
                ) {

                    console.log(
                        `[RUST STORE] ${guild.name}: sin cambios.`
                    );

                    continue;
                }

                // =================================================
                // NUEVA TIENDA
                // =================================================

                console.log(
                    `[RUST STORE] ${guild.name}: ¡NUEVA TIENDA DETECTADA!`
                );

                console.log(
                    `[RUST STORE] Artículos nuevos: ${items.length}`
                );

                console.log(
                    "[RUST STORE] Firma anterior:",
                    config.rustStoreLastSignature
                );

                console.log(
                    "[RUST STORE] Firma nueva:",
                    firmaActual
                );

                // =================================================
                // PUBLICAR
                // =================================================

                await publicarTiendaEnCanal(
                    canal,
                    items
                );

                // =================================================
                // GUARDAR NUEVA FIRMA
                // =================================================

                config.rustStoreLastSignature =
                    firmaActual;

                config.rustStoreLastPublishedWeek =
                    new Date().toISOString();

                await config.save();

                console.log(
                    `[RUST STORE] ${guild.name}: nueva tienda guardada en MongoDB.`
                );

            } catch (errorGuild) {

                console.error(
                    `[RUST STORE] Error procesando guild ${config.guildId}:`,
                    errorGuild
                );
            }
        }

    } catch (error) {

        console.error(
            "[RUST STORE] ERROR EN REVISIÓN AUTOMÁTICA:",
            error
        );

    } finally {

        tiendaRevisando =
            false;
    }
}

// =====================================================
// INICIAR AUTOMÁTICA
// =====================================================

function iniciarTiendaAutomatica(
    client
) {

    console.log(
        "[RUST STORE] Iniciando sistema automático..."
    );

    // Comprobación inmediata
    revisarTiendaAutomatica(
        client
    ).catch(
        error =>
            console.error(
                "[RUST STORE] Error comprobación inicial:",
                error
            )
    );

    // Comprobación periódica
    const intervalo =
        setInterval(
            () => {

                revisarTiendaAutomatica(
                    client
                ).catch(
                    error =>
                        console.error(
                            "[RUST STORE] Error comprobación automática:",
                            error
                        )
                );

            },
            CHECK_INTERVAL
        );

    if (
        intervalo &&
        typeof intervalo.unref === "function"
    ) {

        intervalo.unref();
    }

    console.log(
        `[RUST STORE] Comprobación automática cada ${CHECK_INTERVAL / 60000} minutos.`
    );

    return intervalo;
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    obtenerTiendaLimited,

    publicarTiendaManual,

    iniciarTiendaAutomatica

};