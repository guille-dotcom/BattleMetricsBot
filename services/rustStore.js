const axios = require("axios");
const cheerio = require("cheerio");

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const ServerConfig =
    require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const STEAM_STORE_URL =
    "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited";

const TIMEZONE_CHILE =
    "America/Santiago";

const CHECK_INTERVAL =
    10 * 60 * 1000;

// =====================================================
// FECHA CHILE
// =====================================================

function obtenerFechaChile() {

    const ahora =
        new Date();

    const partes =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    TIMEZONE_CHILE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        ).formatToParts(ahora);

    const year =
        partes.find(
            p => p.type === "year"
        )?.value;

    const month =
        partes.find(
            p => p.type === "month"
        )?.value;

    const day =
        partes.find(
            p => p.type === "day"
        )?.value;

    return {
        year,
        month,
        day,
        fecha:
            `${year}-${month}-${day}`
    };
}

// =====================================================
// DÍA DE LA SEMANA EN CHILE
// =====================================================

function obtenerDiaChile() {

    const fecha =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    TIMEZONE_CHILE,
                weekday: "short"
            }
        ).format(
            new Date()
        );

    return fecha;
}

// =====================================================
// SEMANA DE LA TIENDA
// =====================================================

function obtenerSemanaTienda() {

    const ahora =
        new Date();

    const formatter =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    TIMEZONE_CHILE,
                weekday: "short",
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }
        );

    const partes =
        formatter.formatToParts(
            ahora
        );

    const weekday =
        partes.find(
            p => p.type === "weekday"
        )?.value;

    const year =
        partes.find(
            p => p.type === "year"
        )?.value;

    const month =
        partes.find(
            p => p.type === "month"
        )?.value;

    const day =
        partes.find(
            p => p.type === "day"
        )?.value;

    // ==========================================
    // La rotación comienza el jueves.
    //
    // Si todavía estamos miércoles,
    // utilizamos la última rotación.
    // ==========================================

    return `${year}-${month}-${day}-${weekday}`;
}

// =====================================================
// OBTENER TIENDA DESDE STEAM
// =====================================================

async function obtenerTiendaRust() {

    console.log(
        "🛒 Consultando tienda Rust en Steam..."
    );

    const response =
        await axios.get(
            STEAM_STORE_URL,
            {
                timeout: 30000,

                headers: {

                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",

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

    const $ =
        cheerio.load(
            response.data
        );

    const items = [];

    const vistos =
        new Set();

    // =================================================
    // SELECTORES PRINCIPALES DE STEAM
    // =================================================

    const elementos =
        $(
            ".item_store_item, " +
            ".itemstore_item, " +
            ".item"
        );

    elementos.each(
        (index, element) => {

            const el =
                $(element);

            let nombre =
                "";

            let precio =
                "";

            let imagen =
                "";

            let enlace =
                "";

            // -----------------------------------------
            // NOMBRE
            // -----------------------------------------

            nombre =
                el.find(
                    ".item_store_item_name, " +
                    ".itemstore_item_name, " +
                    ".item_name"
                )
                    .first()
                    .text()
                    .trim();

            if (!nombre) {

                nombre =
                    el.attr(
                        "data-item-name"
                    ) ||
                    el.attr(
                        "data-name"
                    ) ||
                    "";

            }

            // -----------------------------------------
            // PRECIO
            // -----------------------------------------

            precio =
                el.find(
                    ".item_store_item_price, " +
                    ".itemstore_item_price, " +
                    ".item_price, " +
                    ".price"
                )
                    .first()
                    .text()
                    .trim();

            // -----------------------------------------
            // IMAGEN
            // -----------------------------------------

            const img =
                el.find(
                    "img"
                )
                    .first();

            imagen =
                img.attr(
                    "src"
                ) ||
                img.attr(
                    "data-src"
                ) ||
                img.attr(
                    "data-original"
                ) ||
                "";

            // -----------------------------------------
            // ENLACE
            // -----------------------------------------

            enlace =
                el.attr(
                    "href"
                ) ||
                el.find(
                    "a"
                )
                    .first()
                    .attr(
                        "href"
                    ) ||
                "";

            if (
                enlace &&
                enlace.startsWith("/")
            ) {

                enlace =
                    "https://store.steampowered.com" +
                    enlace;

            }

            // -----------------------------------------
            // FALLBACK: BUSCAR PRECIO EN TEXTO
            // -----------------------------------------

            if (
                !precio
            ) {

                const texto =
                    el.text()
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();

                const match =
                    texto.match(
                        /\$[\d.,]+/
                    );

                if (
                    match
                ) {

                    precio =
                        match[0];

                }

            }

            // -----------------------------------------
            // LIMPIEZA
            // -----------------------------------------

            nombre =
                nombre
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            precio =
                precio
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();

            // -----------------------------------------
            // VALIDACIÓN
            // -----------------------------------------

            if (
                !nombre ||
                nombre.length < 2
            ) {
                return;
            }

            if (
                !precio ||
                !precio.includes("$")
            ) {
                return;
            }

            // -----------------------------------------
            // EVITAR BASURA
            // -----------------------------------------

            const nombreLower =
                nombre.toLowerCase();

            const ignorar = [

                "rust item store",
                "featured",
                "limited",
                "general",
                "new releases",
                "cart",
                "top sellers"

            ];

            if (
                ignorar.includes(
                    nombreLower
                )
            ) {
                return;
            }

            // -----------------------------------------
            // DUPLICADOS
            // -----------------------------------------

            const key =
                `${nombreLower}|${precio}`;

            if (
                vistos.has(key)
            ) {
                return;
            }

            vistos.add(
                key
            );

            items.push({

                nombre,
                precio,
                imagen,
                enlace

            });

        }
    );

    // =================================================
    // FALLBACK POR TEXTO
    // =================================================

    if (
        items.length === 0
    ) {

        console.log(
            "⚠️ Steam no entregó elementos con los selectores principales."
        );

        // Buscar enlaces /detail/
        $(
            'a[href*="/itemstore/252490/detail/"]'
        ).each(
            (index, element) => {

                const el =
                    $(element);

                const enlace =
                    el.attr(
                        "href"
                    );

                const texto =
                    el.text()
                        .replace(
                            /\s+/g,
                            " "
                        )
                        .trim();

                const precioMatch =
                    texto.match(
                        /\$[\d.,]+/
                    );

                if (
                    !texto ||
                    !precioMatch
                ) {
                    return;
                }

                const precio =
                    precioMatch[0];

                const nombre =
                    texto
                        .replace(
                            precio,
                            ""
                        )
                        .trim();

                if (
                    !nombre
                ) {
                    return;
                }

                const key =
                    `${nombre.toLowerCase()}|${precio}`;

                if (
                    vistos.has(key)
                ) {
                    return;
                }

                vistos.add(
                    key
                );

                items.push({

                    nombre,
                    precio,

                    imagen:
                        "",

                    enlace:
                        enlace.startsWith(
                            "http"
                        )
                            ? enlace
                            : `https://store.steampowered.com${enlace}`

                });

            }
        );

    }

    console.log(
        `🛒 Steam devolvió ${items.length} artículos`
    );

    return items.slice(
        0,
        12
    );
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

    // =================================================
    // ARTÍCULOS
    // =================================================

    for (
        const item of items
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

    // =================================================
    // IMAGEN
    // =================================================

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
        new ActionRowBuilder()
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
// PUBLICAR TIENDA MANUALMENTE
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
        new ActionRowBuilder()
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
// REVISAR TIENDA AUTOMÁTICA
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
            obtenerDiaChile();

        // Solo comprobamos automáticamente
        // jueves, viernes y sábado.
        //
        // Esto permite que si Steam tarda en
        // actualizar la tienda el jueves,
        // el bot pueda detectarla después.

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

        const semana =
            obtenerSemanaTienda();

        for (
            const config
            of configs
        ) {

            try {

                // =====================================
                // YA PUBLICADA
                // =====================================

                if (
                    config.rustStoreLastPublishedWeek ===
                    semana
                ) {

                    continue;

                }

                // =====================================
                // OBTENER CANAL
                // =====================================

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

                // =====================================
                // CREAR EMBED
                // =====================================

                const embed =
                    crearEmbed(
                        items
                    );

                const row =
                    new ActionRowBuilder()
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

                // =====================================
                // PUBLICAR
                // =====================================

                await canal.send({

                    embeds: [
                        embed
                    ],

                    components: [
                        row
                    ]

                });

                // =====================================
                // MARCAR COMO PUBLICADA
                // =====================================

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
        "🛒 Sistema de tienda Rust iniciado."
    );

    // Primera comprobación
    // al iniciar el bot.

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

    crearEmbed,

    publicarTienda,

    publicarTiendaManual,

    revisarTiendaAutomatica,

    iniciarTiendaAutomatica

};