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
    "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited&cc=us&l=english";

const STEAM_STORE_URL_FALLBACK =
    "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited&l=english";

const STEAM_BASE_URL =
    "https://store.steampowered.com";

const TIMEZONE_CHILE =
    "America/Santiago";

const CHECK_INTERVAL =
    10 * 60 * 1000;

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
// LIMPIAR TEXTO
// =====================================================

function limpiarTexto(texto) {
    if (!texto) {
        return "";
    }

    return String(texto)
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
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
// FECHA CHILE
// =====================================================

function obtenerFechaChile() {
    const ahora = new Date();

    const partes =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone: TIMEZONE_CHILE,
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
        fecha: `${year}-${month}-${day}`
    };
}

// =====================================================
// DÍA DE LA SEMANA CHILE
// =====================================================

function obtenerDiaChile() {
    return new Intl.DateTimeFormat(
        "en-US",
        {
            timeZone: TIMEZONE_CHILE,
            weekday: "short"
        }
    ).format(new Date());
}

// =====================================================
// SEMANA TIENDA
// =====================================================

function obtenerSemanaTienda() {
    const fecha =
        obtenerFechaChile();

    return `${fecha.fecha}`;
}

// =====================================================
// EXTRAER PRECIO
// =====================================================

function extraerPrecio(texto) {
    if (!texto) {
        return "";
    }

    const limpio =
        limpiarTexto(texto);

    // =================================================
    // PRECIOS CON MONEDA
    // =================================================

    const patrones = [
        /US\s*\$\s*\d+(?:[.,]\d{1,2})?/i,
        /R\$\s*\d+(?:[.,]\d{1,2})?/i,
        /\$\s*\d+(?:[.,]\d{1,2})?/i,
        /€\s*\d+(?:[.,]\d{1,2})?/i,
        /£\s*\d+(?:[.,]\d{1,2})?/i,
        /¥\s*\d+(?:[.,]\d{1,2})?/i,
        /₹\s*\d+(?:[.,]\d{1,2})?/i,
        /₽\s*\d+(?:[.,]\d{1,2})?/i
    ];

    for (const patron of patrones) {
        const match =
            limpio.match(patron);

        if (match) {
            return limpiarTexto(
                match[0]
            );
        }
    }

    // =================================================
    // FORMATO INVERSO
    // Ejemplo: 2.99 $
    // =================================================

    const inverso =
        limpio.match(
            /\d+(?:[.,]\d{1,2})?\s*(?:USD|EUR|BRL|R\$|\$|€|£|¥)/i
        );

    if (inverso) {
        return limpiarTexto(
            inverso[0]
        );
    }

    return "";
}

// =====================================================
// OBTENER IMAGEN
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

    return convertirUrl(
        img.attr("src") ||
        img.attr("data-src") ||
        img.attr("data-original") ||
        img.attr("data-lazy-src") ||
        img.attr("data-image") ||
        ""
    );
}

// =====================================================
// VALIDAR NOMBRE
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
        "rust item store",
        "featured",
        "limited",
        "general",
        "new releases",
        "cart",
        "top sellers",
        "all",
        "search",
        "browse",
        "next",
        "previous",
        "showing",
        "input"
    ];

    const lower =
        nombre.toLowerCase();

    if (ignorar.includes(lower)) {
        return false;
    }

    if (
        lower.includes("rust item store")
    ) {
        return false;
    }

    if (
        lower.startsWith("showing ")
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
// EXTRAER ITEM DESDE ENLACE
// =====================================================

function extraerItemDesdeEnlace(
    $,
    elemento
) {
    const el =
        $(elemento);

    const href =
        el.attr("href") || "";

    if (
        !href.includes(
            "/itemstore/252490/detail/"
        )
    ) {
        return null;
    }

    const enlace =
        convertirUrl(href);

    // =================================================
    // CONTENEDOR
    // =================================================

    let contenedor =
        el.closest(
            [
                ".item_store_item",
                ".itemstore_item",
                ".item_store",
                ".store_item",
                ".item",
                ".store_item_listing",
                ".itemstore_item"
            ].join(", ")
        );

    if (
        !contenedor ||
        !contenedor.length
    ) {
        contenedor =
            el.parent();
    }

    // =================================================
    // NOMBRE
    // =================================================

    let nombre = "";

    const selectoresNombre = [
        ".item_store_item_name",
        ".itemstore_item_name",
        ".item_name",
        ".store_item_name",
        ".item_name_title",
        ".name",
        ".title"
    ];

    for (
        const selector
        of selectoresNombre
    ) {
        const encontrado =
            contenedor
                .find(selector)
                .first();

        if (
            encontrado &&
            encontrado.length
        ) {
            nombre =
                limpiarTexto(
                    encontrado.text()
                );

            if (nombre) {
                break;
            }
        }
    }

    // =================================================
    // ATRIBUTOS
    // =================================================

    if (!nombre) {
        nombre =
            limpiarTexto(
                el.attr("title")
            );
    }

    if (!nombre) {
        nombre =
            limpiarTexto(
                el.attr(
                    "data-item-name"
                )
            );
    }

    if (!nombre) {
        nombre =
            limpiarTexto(
                el.attr("data-name")
            );
    }

    // =================================================
    // TEXTO DEL ENLACE
    // =================================================

    if (!nombre) {
        nombre =
            limpiarTexto(
                el.text()
            );
    }

    // =================================================
    // PRECIO
    // =================================================

    let precio =
        extraerPrecio(
            el.text()
        );

    if (!precio) {
        precio =
            extraerPrecio(
                contenedor.text()
            );
    }

    // =================================================
    // IMAGEN
    // =================================================

    let imagen =
        obtenerImagen(
            contenedor
        );

    if (!imagen) {
        imagen =
            obtenerImagen(el);
    }

    return {
        nombre,
        precio,
        imagen,
        enlace
    };
}

// =====================================================
// MÉTODO ESPECIAL:
// BUSCAR BLOQUES ALREDEDOR DE URL DETAIL
// =====================================================

function buscarItemsPorHtmlPlano(
    html,
    items,
    vistos
) {
    console.log(
        "🛒 Ejecutando extractor HTML plano..."
    );

    // =================================================
    // BUSCAR TODAS LAS URL DETAIL
    // =================================================

    const regex =
        /(?:https?:\/\/store\.steampowered\.com)?\/itemstore\/252490\/detail\/(\d+)\/?/gi;

    const encontrados = [];

    let match;

    while (
        (match = regex.exec(html)) !== null
    ) {
        const id =
            match[1];

        if (
            !encontrados.includes(id)
        ) {
            encontrados.push(id);
        }
    }

    console.log(
        `🛒 URLs detail encontradas: ${encontrados.length}`
    );

    // =================================================
    // INTENTAR EXTRAER BLOQUES
    // =================================================

    for (
        const id
        of encontrados
    ) {
        const url =
            `https://store.steampowered.com/itemstore/252490/detail/${id}/`;

        const posicion =
            html.indexOf(
                `/itemstore/252490/detail/${id}`
            );

        if (posicion === -1) {
            continue;
        }

        const inicio =
            Math.max(
                0,
                posicion - 2500
            );

        const fin =
            Math.min(
                html.length,
                posicion + 5000
            );

        const bloque =
            html.substring(
                inicio,
                fin
            );

        // =================================================
        // SACAR TEXTO
        // =================================================

        const texto =
            limpiarTexto(
                bloque
                    .replace(
                        /<script[\s\S]*?<\/script>/gi,
                        " "
                    )
                    .replace(
                        /<style[\s\S]*?<\/style>/gi,
                        " "
                    )
                    .replace(
                        /<[^>]+>/g,
                        " "
                    )
            );

        const precio =
            extraerPrecio(texto);

        if (!precio) {
            continue;
        }

        // =================================================
        // BUSCAR POSIBLE NOMBRE
        // =================================================

        let nombre = "";

        const nombresExcluidos = [
            "Rust Item Store",
            "Featured",
            "Limited",
            "General",
            "New Releases",
            "Cart",
            "All",
            "Browse"
        ];

        const partes =
            texto
                .split(/\s{2,}/)
                .map(
                    x => limpiarTexto(x)
                )
                .filter(Boolean);

        for (
            const parte
            of partes
        ) {
            if (
                parte.length < 3 ||
                parte.length > 100
            ) {
                continue;
            }

            if (
                nombresExcluidos.some(
                    x =>
                        parte.toLowerCase() ===
                        x.toLowerCase()
                )
            ) {
                continue;
            }

            if (
                extraerPrecio(parte)
            ) {
                continue;
            }

            if (
                /showing\s+\d+/i.test(
                    parte
                )
            ) {
                continue;
            }

            if (
                /itemstore/i.test(
                    parte
                )
            ) {
                continue;
            }

            nombre = parte;
            break;
        }

        if (!nombre) {
            continue;
        }

        agregarItem(
            items,
            vistos,
            {
                nombre,
                precio,
                imagen: "",
                enlace: url
            }
        );
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
        STEAM_STORE_URL,
        STEAM_STORE_URL_FALLBACK
    ];

    for (
        let intento = 0;
        intento < urls.length;
        intento++
    ) {
        const url =
            urls[intento];

        try {
            console.log(
                `🛒 Intento ${intento + 1}/${urls.length}: ${url}`
            );

            const response =
                await axios.get(
                    url,
                    {
                        timeout: 30000,
                        maxRedirects: 10,
                        responseType: "text",
                        validateStatus:
                            status =>
                                status >= 200 &&
                                status < 400,
                        headers:
                            STEAM_HEADERS
                    }
                );

            if (
                !response ||
                !response.data
            ) {
                console.log(
                    "⚠️ Steam no devolvió contenido."
                );

                continue;
            }

            console.log(
                `🛒 Steam respondió HTTP ${response.status}`
            );

            const html =
                String(
                    response.data
                );

            console.log(
                `🛒 HTML recibido: ${html.length} caracteres`
            );

            // =================================================
            // DIAGNÓSTICO
            // =================================================

            const cantidadDetail =
                (
                    html.match(
                        /\/itemstore\/252490\/detail\//gi
                    ) || []
                ).length;

            console.log(
                `🛒 Referencias detail encontradas en HTML: ${cantidadDetail}`
            );

            // =================================================
            // CHEERIO
            // =================================================

            const $ =
                cheerio.load(html);

            const items = [];
            const vistos = new Set();

            // =================================================
            // MÉTODO 1
            // TODOS LOS ENLACES DETAIL
            // =================================================

            $(
                'a[href*="/itemstore/252490/detail/"]'
            ).each(
                (index, element) => {
                    const item =
                        extraerItemDesdeEnlace(
                            $,
                            element
                        );

                    agregarItem(
                        items,
                        vistos,
                        item
                    );
                }
            );

            console.log(
                `🛒 Método 1 encontró: ${items.length}`
            );

            // =================================================
            // MÉTODO 2
            // CUALQUIER ELEMENTO CON HREF DETAIL
            // =================================================

            if (
                items.length === 0
            ) {
                console.log(
                    "⚠️ Método 1 sin resultados. Ejecutando método 2..."
                );

                $("a").each(
                    (index, element) => {
                        const href =
                            $(element).attr(
                                "href"
                            ) || "";

                        if (
                            !href.includes(
                                "/itemstore/252490/detail/"
                            )
                        ) {
                            return;
                        }

                        const item =
                            extraerItemDesdeEnlace(
                                $,
                                element
                            );

                        agregarItem(
                            items,
                            vistos,
                            item
                        );
                    }
                );
            }

            // =================================================
            // MÉTODO 3
            // SELECTORES GENERALES
            // =================================================

            if (
                items.length === 0
            ) {
                console.log(
                    "⚠️ Método 2 sin resultados. Ejecutando método 3..."
                );

                const selectores = [
                    "[class*='itemstore']",
                    "[class*='item_store']",
                    "[class*='store_item']",
                    "[class*='storeitem']",
                    "[id*='itemstore']",
                    "[id*='item_store']"
                ];

                $(
                    selectores.join(",")
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
                            !link.length
                        ) {
                            return;
                        }

                        const item =
                            extraerItemDesdeEnlace(
                                $,
                                link[0]
                            );

                        agregarItem(
                            items,
                            vistos,
                            item
                        );
                    }
                );
            }

            // =================================================
            // MÉTODO 4
            // HTML PLANO
            // =================================================

            if (
                items.length === 0
            ) {
                console.log(
                    "⚠️ Método 3 sin resultados. Ejecutando extractor HTML plano..."
                );

                buscarItemsPorHtmlPlano(
                    html,
                    items,
                    vistos
                );
            }

            // =================================================
            // MÉTODO 5
            // EXTRAER NOMBRES/PRECIOS VISIBLES
            // =================================================

            if (
                items.length === 0
            ) {
                console.log(
                    "⚠️ No se encontraron URLs detail. Ejecutando extractor de texto..."
                );

                const texto =
                    limpiarTexto(
                        $("body").text()
                    );

                const lineas =
                    texto
                        .split("\n")
                        .map(
                            x =>
                                limpiarTexto(x)
                        )
                        .filter(Boolean);

                for (
                    let i = 0;
                    i < lineas.length;
                    i++
                ) {
                    const linea =
                        lineas[i];

                    const precio =
                        extraerPrecio(
                            linea
                        );

                    if (!precio) {
                        continue;
                    }

                    let nombre = "";

                    // Buscar texto cercano antes del precio
                    for (
                        let j = i - 1;
                        j >= 0 &&
                        j >= i - 4;
                        j--
                    ) {
                        const posible =
                            limpiarTexto(
                                lineas[j]
                            );

                        if (
                            nombreValido(
                                posible
                            ) &&
                            !extraerPrecio(
                                posible
                            )
                        ) {
                            nombre =
                                posible;

                            break;
                        }
                    }

                    if (!nombre) {
                        continue;
                    }

                    agregarItem(
                        items,
                        vistos,
                        {
                            nombre,
                            precio,
                            imagen: "",
                            enlace:
                                STEAM_STORE_URL
                        }
                    );
                }
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
                    .slice(0, 12)
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
                    12
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

            if (
                htmlLower.includes(
                    "steam community"
                )
            ) {
                console.log(
                    "⚠️ Steam parece haber devuelto una página de bloqueo/redirección."
                );
            }

        } catch (error) {
            console.error(
                `❌ Error intento ${intento + 1}:`,
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

    // =================================================
    // ARTÍCULOS
    // =================================================

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
        crearEmbed(items);

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
        crearEmbed(items);

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
            obtenerDiaChile();

        // =================================================
        // SOLO JUEVES, VIERNES Y SÁBADO
        // =================================================

        if (
            ![
                "Thu",
                "Fri",
                "Sat"
            ].includes(dia)
        ) {
            return;
        }

        // =================================================
        // SERVIDORES CONFIGURADOS
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
        // SERVIDORES
        // =================================================

        for (
            const config
            of configs
        ) {
            try {
                // =================================================
                // YA PUBLICADA
                // =================================================

                if (
                    config.rustStoreLastPublishedWeek ===
                    semana
                ) {
                    console.log(
                        `ℹ️ Tienda ya publicada esta semana en ${config.guildId}`
                    );

                    continue;
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
                        `⚠️ Canal de tienda inválido en ${config.guildId}`
                    );

                    continue;
                }

                // =================================================
                // EMBED
                // =================================================

                const embed =
                    crearEmbed(items);

                const row =
                    crearBotonTienda();

                // =================================================
                // PUBLICAR
                // =================================================

                await canal.send({
                    embeds: [
                        embed
                    ],
                    components: [
                        row
                    ]
                });

                // =================================================
                // GUARDAR SEMANA
                // =================================================

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
    // CADA 10 MINUTOS
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