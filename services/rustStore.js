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

const STEAM_BASE_URL =
    "https://store.steampowered.com";

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

    return new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone:
                TIMEZONE_CHILE,
            weekday: "short"
        }
    ).format(
        new Date()
    );
}

// =====================================================
// SEMANA DE LA TIENDA
// =====================================================

function obtenerSemanaTienda() {

    const ahora =
        new Date();

    const partes =
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
        ).formatToParts(ahora);

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

    return `${year}-${month}-${day}-${weekday}`;
}

// =====================================================
// CONVERTIR URL
// =====================================================

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
// EXTRAER PRECIO
// =====================================================

function extraerPrecio(texto) {

    if (!texto) {
        return "";
    }

    const limpio =
        texto
            .replace(/\s+/g, " ")
            .trim();

    /*
     * Steam puede devolver:
     *
     * $9.99
     * R$ 9,99
     * €9.99
     * £9.99
     * etc.
     */

    const match =
        limpio.match(
            /(?:US\$|R\$|[$€£¥₹₽])\s*\d+(?:[.,]\d{1,2})?/i
        );

    if (match) {
        return match[0].trim();
    }

    /*
     * Segundo intento:
     * buscar cualquier bloque que termine
     * en números con decimales.
     */

    const fallback =
        limpio.match(
            /\d+(?:[.,]\d{1,2})/
        );

    if (fallback) {
        return fallback[0];
    }

    return "";
}

// =====================================================
// OBTENER IMAGEN
// =====================================================

function obtenerImagen(elemento) {

    const img =
        elemento.find("img").first();

    if (!img || img.length === 0) {
        return "";
    }

    return convertirUrl(
        img.attr("src") ||
        img.attr("data-src") ||
        img.attr("data-original") ||
        img.attr("data-lazy-src") ||
        ""
    );
}

// =====================================================
// OBTENER TIENDA DESDE STEAM
// =====================================================

async function obtenerTiendaRust() {

    console.log(
        "🛒 Consultando tienda Rust en Steam..."
    );

    try {

        const response =
            await axios.get(
                STEAM_STORE_URL,
                {
                    timeout: 30000,

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

            console.log(
                "⚠️ Steam no devolvió contenido."
            );

            return [];
        }

        const $ =
            cheerio.load(
                response.data
            );

        const items = [];
        const vistos = new Set();

        // =================================================
        // MÉTODO PRINCIPAL
        //
        // Steam utiliza enlaces:
        //
        // /itemstore/252490/detail/XXXXX/
        //
        // =================================================

        $(
            'a[href*="/itemstore/252490/detail/"]'
        ).each(
            (index, element) => {

                const el =
                    $(element);

                let enlace =
                    el.attr("href") || "";

                enlace =
                    convertirUrl(
                        enlace
                    );

                let nombre =
                    el.text()
                        .replace(/\s+/g, " ")
                        .trim();

                /*
                 * Si el texto del enlace viene vacío,
                 * buscar información en el contenedor.
                 */

                if (
                    !nombre ||
                    nombre.length < 2
                ) {

                    const contenedor =
                        el.closest(
                            ".item_store_item, .itemstore_item, .item, .store_item"
                        );

                    if (
                        contenedor &&
                        contenedor.length
                    ) {

                        nombre =
                            contenedor
                                .find(
                                    ".item_store_item_name, .itemstore_item_name, .item_name, .name"
                                )
                                .first()
                                .text()
                                .replace(/\s+/g, " ")
                                .trim();
                    }
                }

                /*
                 * Buscar precio en el propio enlace
                 * y después en su contenedor.
                 */

                let precio =
                    extraerPrecio(
                        el.text()
                    );

                let contenedor =
                    el.closest(
                        ".item_store_item, .itemstore_item, .item, .store_item"
                    );

                if (
                    !precio &&
                    contenedor &&
                    contenedor.length
                ) {

                    precio =
                        extraerPrecio(
                            contenedor.text()
                        );
                }

                /*
                 * Buscar nombre mediante atributos
                 */

                if (
                    !nombre &&
                    contenedor &&
                    contenedor.length
                ) {

                    nombre =
                        contenedor.attr(
                            "data-item-name"
                        ) ||
                        contenedor.attr(
                            "data-name"
                        ) ||
                        "";
                }

                /*
                 * Imagen
                 */

                let imagen = "";

                if (
                    contenedor &&
                    contenedor.length
                ) {

                    imagen =
                        obtenerImagen(
                            contenedor
                        );
                }

                if (!imagen) {

                    imagen =
                        obtenerImagen(
                            el
                        );
                }

                nombre =
                    nombre
                        .replace(/\s+/g, " ")
                        .trim();

                precio =
                    precio
                        .replace(/\s+/g, " ")
                        .trim();

                // =================================================
                // VALIDACIÓN
                // =================================================

                if (
                    !nombre ||
                    nombre.length < 2
                ) {
                    return;
                }

                /*
                 * Ya no exigimos "$".
                 *
                 * Steam puede devolver R$, €, £, etc.
                 */

                if (!precio) {
                    return;
                }

                /*
                 * Evitar basura
                 */

                const nombreLower =
                    nombre.toLowerCase();

                const ignorar = [
                    "rust item store",
                    "featured",
                    "limited",
                    "general",
                    "new releases",
                    "cart",
                    "top sellers",
                    "all"
                ];

                if (
                    ignorar.includes(
                        nombreLower
                    )
                ) {
                    return;
                }

                // =================================================
                // DUPLICADOS
                // =================================================

                const key =
                    `${nombreLower}|${precio}`;

                if (
                    vistos.has(key)
                ) {
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
        );

        // =================================================
        // FALLBACK 2
        //
        // Buscar contenedores que tengan enlaces
        // de detalle aunque el selector anterior
        // no haya encontrado información suficiente.
        // =================================================

        if (
            items.length === 0
        ) {

            console.log(
                "⚠️ Selector principal no encontró artículos. Ejecutando fallback..."
            );

            $(
                '[class*="item_store"], [class*="itemstore"], [class*="store_item"]'
            ).each(
                (index, element) => {

                    const el =
                        $(element);

                    const link =
                        el.find(
                            'a[href*="/itemstore/252490/detail/"]'
                        ).first();

                    if (
                        !link ||
                        link.length === 0
                    ) {
                        return;
                    }

                    const enlace =
                        convertirUrl(
                            link.attr("href")
                        );

                    let nombre =
                        el.find(
                            ".item_store_item_name, .itemstore_item_name, .item_name, .name"
                        )
                            .first()
                            .text()
                            .replace(/\s+/g, " ")
                            .trim();

                    if (!nombre) {

                        nombre =
                            link.text()
                                .replace(/\s+/g, " ")
                                .trim();
                    }

                    const precio =
                        extraerPrecio(
                            el.text()
                        );

                    const imagen =
                        obtenerImagen(
                            el
                        );

                    if (
                        !nombre ||
                        !precio
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

                    vistos.add(key);

                    items.push({

                        nombre,

                        precio,

                        imagen,

                        enlace
                    });
                }
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

            items.forEach(
                (item, index) => {

                    console.log(
                        `   ${index + 1}. ${item.nombre} — ${item.precio}`
                    );

                }
            );
        }

        return items.slice(
            0,
            12
        );

    } catch (error) {

        console.error(
            "❌ Error consultando tienda Steam:",
            error.message
        );

        return [];
    }
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
// CREAR BOTÓN
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

        // =================================================
        // OBTENER SERVIDORES CONFIGURADOS
        // =================================================

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

        // =================================================
        // CONSULTAR STEAM
        // =================================================

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

        // =================================================
        // PROCESAR SERVIDORES
        // =================================================

        for (
            const config
            of configs
        ) {

            try {

                // =========================================
                // YA PUBLICADA
                // =========================================

                if (
                    config.rustStoreLastPublishedWeek ===
                    semana
                ) {

                    continue;
                }

                // =========================================
                // OBTENER CANAL
                // =========================================

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

                // =========================================
                // CREAR EMBED
                // =========================================

                const embed =
                    crearEmbed(
                        items
                    );

                const row =
                    crearBotonTienda();

                // =========================================
                // PUBLICAR
                // =========================================

                await canal.send({

                    embeds: [
                        embed
                    ],

                    components: [
                        row
                    ]
                });

                // =========================================
                // MARCAR SEMANA
                // =========================================

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

    // =================================================
    // PRIMERA COMPROBACIÓN
    // =================================================

    setTimeout(
        () => {

            revisarTiendaAutomatica(
                client
            );

        },
        15000
    );

    // =================================================
    // REVISAR CADA 10 MINUTOS
    // =================================================

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