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
    "https://store.steampowered.com/itemstore/252490/browse/";

const REQUEST_DELAY = 250;
const MAX_ITEMS = 50;

// =====================================================
// IDS LIMITED CONOCIDOS
// =====================================================

const IDS_LIMITED_CONOCIDOS = [
    "70600",
    "70601",
    "70602",
    "70603",
    "70604",
    "70605",
    "70606",
    "70607",
    "70608",
    "70609",
    "70610",
    "70611",
    "70612",
    "70613",
    "70614",
    "70615",
    "70616"
];

// =====================================================
// NOMBRES CONOCIDOS
// =====================================================

const NOMBRES_CONOCIDOS = {
    "70600": "Young Dragon Garage Door",
    "70601": "Salvation SAR",
    "70602": "Pirate Wood Gloves",
    "70603": "Wrecker Salvaged Icepick",
    "70604": "Tempered Waterpipe Shotgun",
    "70605": "Apotheosis of War Locker",
    "70606": "Project Nova Bed",
    "70607": "No Mercy Wood Pants",
    "70608": "No Mercy Wood Jacket",
    "70609": "No Mercy Wooden Helmet",
    "70610": "All Seeing Eye Electric Furnace",
    "70611": "Devourer Facemask",
    "70612": "Devourer Metal Chest Plate",
    "70613": "Flame Anarchy Wood Armor Pants",
    "70614": "Flame Anarchy Wood Armor Jacket",
    "70615": "Flame Anarchy Wood Armor Helmet",
    "70616": "Super Star MP5"
};

// =====================================================
// HELPERS
// =====================================================

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function limpiarTexto(texto) {
    if (!texto) return "";

    return String(texto)
        .replace(/<[^>]*>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function esNombreGenerico(nombre) {
    if (!nombre) return true;

    const n = limpiarTexto(nombre).toLowerCase();

    return (
        n === "rust item" ||
        n === "item" ||
        n === "rust" ||
        n === "unknown" ||
        n === "undefined" ||
        n === "null"
    );
}

function normalizarImagen(imagen) {
    if (!imagen) return null;

    let url = String(imagen).trim();

    if (!url) return null;

    if (url.startsWith("//")) {
        url = "https:" + url;
    }

    if (url.startsWith("/")) {
        url = "https://store.steampowered.com" + url;
    }

    return url;
}

function normalizarPrecio(precio) {
    if (!precio) return null;

    let texto = limpiarTexto(precio);

    if (!texto) return null;

    const match = texto.match(
        /(?:US\$|\$|USD)?\s*(\d+(?:[.,]\d{1,2})?)/
    );

    if (!match) return null;

    let numero = match[1].replace(",", ".");

    const valor = Number(numero);

    if (!Number.isFinite(valor)) {
        return null;
    }

    return `$${valor.toFixed(2)}`;
}

// =====================================================
// EXTRAER IDS 706XX
// =====================================================

function extraerIDs706(texto) {
    if (!texto) return [];

    const encontrados = String(texto).match(/\b706\d{2}\b/g) || [];

    return [
        ...new Set(
            encontrados.filter(id => {
                const numero = Number(id);

                return numero >= 70600 && numero <= 70699;
            })
        )
    ];
}

// =====================================================
// OBTENER HTML
// =====================================================

async function obtenerHTML(url) {
    const response = await axios.get(url, {
        timeout: 30000,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9"
        }
    });

    return response.data;
}

// =====================================================
// BUSCAR IDS EN HTML
// =====================================================

function buscarIDsEnHTML(html) {
    const ids = [];

    const $ = cheerio.load(html);

    $("[data-itemdefid]").each((_, el) => {
        const id = $(el).attr("data-itemdefid");

        if (!id) return;

        const numero = Number(id);

        if (numero >= 70600 && numero <= 70699) {
            ids.push(String(id));
        }
    });

    const textoCompleto = html;

    ids.push(...extraerIDs706(textoCompleto));

    return [...new Set(ids)];
}

// =====================================================
// BUSCAR TARJETA
// =====================================================

function buscarTarjeta(html, id) {
    const $ = cheerio.load(html);

    let tarjeta = null;

    $("[data-itemdefid]").each((_, el) => {
        const itemId = $(el).attr("data-itemdefid");

        if (String(itemId) === String(id)) {
            tarjeta = $(el);
        }
    });

    return tarjeta;
}

// =====================================================
// AJAX STEAM
// =====================================================

async function obtenerIDsDesdeAjax() {
    try {
        console.log("[RUST STORE] Consultando ajaxgetitemdefs...");

        const response = await axios.get(STEAM_AJAX_URL, {
            timeout: 30000,
            params: {
                start: 0,
                count: 100,
                json: 1,
                searchtext: "",
                cc: "us",
                l: "english"
            },
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/139.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept": "application/json,text/plain,*/*",
                "Referer": STEAM_STORE_URL
            }
        });

        const data = response.data;

        console.log(
            "[RUST STORE] AJAX keys:",
            Object.keys(data || {})
        );

        let texto = "";

        try {
            texto = JSON.stringify(data);
        } catch {
            texto = String(data);
        }

        const ids = extraerIDs706(texto);

        console.log(
            `[RUST STORE] IDs 706xx encontrados en AJAX: ${ids.length}`
        );

        return ids;
    } catch (error) {
        console.error(
            "[RUST STORE] Error AJAX:",
            error.response?.status || error.message
        );

        return [];
    }
}

// =====================================================
// OBTENER DETALLE DE ITEM
// =====================================================

async function obtenerDetalle(id, htmlPrincipal) {
    try {
        let nombre = NOMBRES_CONOCIDOS[id] || null;
        let imagen = null;
        let precio = null;

        // =================================================
        // BUSCAR EN HTML PRINCIPAL
        // =================================================

        const tarjeta = buscarTarjeta(htmlPrincipal, id);

        if (tarjeta) {
            const textoTarjeta = limpiarTexto(
                tarjeta.text()
            );

            // -----------------------------
            // NOMBRE
            // -----------------------------

            const candidatosNombre = [
                tarjeta.find(".item_name").first().text(),
                tarjeta.find(".item_def_name").first().text(),
                tarjeta.find(".item_name_text").first().text(),
                tarjeta.find(".item_title").first().text(),
                tarjeta.find("[class*='name']").first().text(),
                tarjeta.find("[class*='title']").first().text()
            ];

            for (const candidato of candidatosNombre) {
                const limpio = limpiarTexto(candidato);

                if (
                    limpio &&
                    !esNombreGenerico(limpio)
                ) {
                    nombre = limpio;
                    break;
                }
            }

            // -----------------------------
            // IMAGEN
            // -----------------------------

            const imagenes = tarjeta.find("img");

            imagenes.each((_, img) => {
                if (imagen) return;

                const src =
                    $(img).attr("src") ||
                    $(img).attr("data-src") ||
                    $(img).attr("data-original") ||
                    $(img).attr("data-lazy-src");

                const normalizada =
                    normalizarImagen(src);

                if (normalizada) {
                    imagen = normalizada;
                }
            });

            // -----------------------------
            // PRECIO
            // -----------------------------

            const candidatosPrecio = [
                tarjeta.find(".item_price").first().text(),
                tarjeta.find(".price").first().text(),
                tarjeta.find("[class*='price']").first().text()
            ];

            for (const candidato of candidatosPrecio) {
                const limpio =
                    normalizarPrecio(candidato);

                if (limpio) {
                    precio = limpio;
                    break;
                }
            }

            // Si no encontró precio en selectores
            if (!precio) {
                precio =
                    normalizarPrecio(textoTarjeta);
            }
        }

        // =================================================
        // IMAGEN DIRECTA STEAM ECONOMY
        // =================================================

        if (!imagen) {
            const posibles = [
                `https://community.cloudflare.steamstatic.com/economy/image/`,
                `https://steamcommunity-a.akamaihd.net/economy/image/`
            ];

            // Se intenta encontrar la imagen desde el HTML
            const regexImagenes = [
                new RegExp(
                    `https?:\\/\\/[^"'\\s]+economy\\/image\\/[^"'\\s]+`,
                    "gi"
                ),
                new RegExp(
                    `\\/economy\\/image\\/[^"'\\s]+`,
                    "gi"
                )
            ];

            for (const regex of regexImagenes) {
                const matches =
                    htmlPrincipal.match(regex) || [];

                for (const match of matches) {
                    if (
                        match.includes(id) ||
                        matches.length === 1
                    ) {
                        imagen =
                            normalizarImagen(match);

                        if (imagen) break;
                    }
                }

                if (imagen) break;
            }
        }

        // =================================================
        // FALLBACK IMAGEN
        // =================================================

        if (!imagen) {
            imagen =
                `https://community.cloudflare.steamstatic.com/economy/image/`;
        }

        // =================================================
        // PRECIO DESDE HTML GENERAL
        // =================================================

        if (!precio) {
            const patronPrecio =
                new RegExp(
                    `706${String(id).slice(-2)}[^$]{0,500}\\$\\s*(\\d+[.,]\\d{1,2})`,
                    "i"
                );

            const match =
                htmlPrincipal.match(patronPrecio);

            if (match) {
                precio =
                    normalizarPrecio(
                        `$${match[1]}`
                    );
            }
        }

        // =================================================
        // DATOS CONOCIDOS
        // =================================================

        if (!nombre) {
            nombre =
                NOMBRES_CONOCIDOS[id] ||
                `Rust Item ${id}`;
        }

        if (!precio) {
            precio = "Precio no disponible";
        }

        // =================================================
        // LOG
        // =================================================

        console.log(
            `[RUST STORE] Detail ${id}: ${nombre} | ${precio} | ` +
            `${imagen ? "IMAGEN OK" : "SIN IMAGEN"}`
        );

        return {
            id: String(id),
            nombre,
            imagen,
            precio,
            url:
                `https://store.steampowered.com/itemstore/252490/detail/${id}/`
        };

    } catch (error) {
        console.error(
            `[RUST STORE] Error obteniendo detalle ${id}:`,
            error.message
        );

        return {
            id: String(id),
            nombre:
                NOMBRES_CONOCIDOS[id] ||
                `Rust Item ${id}`,
            imagen: null,
            precio: "Precio no disponible",
            url:
                `https://store.steampowered.com/itemstore/252490/detail/${id}/`
        };
    }
}

// =====================================================
// OBTENER TIENDA LIMITED
// =====================================================

async function obtenerTiendaLimited() {
    console.log(
        "[RUST STORE] Consultando página Limited de Steam..."
    );

    const html =
        await obtenerHTML(STEAM_STORE_URL);

    // =================================================
    // IDS DEL HTML
    // =================================================

    const idsHTML =
        buscarIDsEnHTML(html);

    console.log(
        `[RUST STORE] IDs Limited detectados en HTML: ${idsHTML.length}`
    );

    // =================================================
    // IDS AJAX
    // =================================================

    const idsAJAX =
        await obtenerIDsDesdeAjax();

    // =================================================
    // UNIR IDS
    // =================================================

    let ids = [
        ...new Set([
            ...idsHTML,
            ...idsAJAX
        ])
    ];

    // =================================================
    // FILTRAR SOLO 706XX
    // =================================================

    ids = ids.filter(id => {
        const numero = Number(id);

        return (
            numero >= 70600 &&
            numero <= 70699
        );
    });

    // =================================================
    // AGREGAR IDS CONOCIDOS
    // =================================================

    for (const id of IDS_LIMITED_CONOCIDOS) {
        if (!ids.includes(id)) {
            ids.push(id);
        }
    }

    // Orden numérico
    ids.sort(
        (a, b) => Number(a) - Number(b)
    );

    console.log(
        `[RUST STORE] IDs Limited después de AJAX: ${ids.length}`
    );

    // =================================================
    // LIMITAR
    // =================================================

    ids = ids.slice(0, MAX_ITEMS);

    console.log(
        `[RUST STORE] TOTAL IDs Limited finales: ${ids.length}`
    );

    console.log(
        `[RUST STORE] IDs: ${ids.join(", ")}`
    );

    // =================================================
    // OBTENER DETALLES
    // =================================================

    const items = [];

    for (const id of ids) {
        const item =
            await obtenerDetalle(
                id,
                html
            );

        if (item) {
            items.push(item);
        }

        await esperar(
            REQUEST_DELAY
        );
    }

    // =================================================
    // FILTRO FINAL
    // =================================================

    const itemsFinales =
        items.filter(item => {
            if (!item) return false;

            const numero =
                Number(item.id);

            return (
                numero >= 70600 &&
                numero <= 70699
            );
        });

    console.log(
        `[RUST STORE] DATOS FINALES: ` +
        `${itemsFinales.length}/${ids.length} con nombre, ` +
        `${itemsFinales.filter(i => i.imagen).length}/${ids.length} con imagen, ` +
        `${itemsFinales.filter(i => i.precio && i.precio !== "Precio no disponible").length}/${ids.length} con precio.`
    );

    console.log(
        `[RUST STORE] TOTAL FINAL: ${itemsFinales.length} artículos Limited encontrados.`
    );

    return itemsFinales;
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(item, index, total) {
    const embed = new EmbedBuilder()
        .setTitle(item.nombre)
        .setDescription(
            `💰 **Precio:** ${item.precio}\n\n` +
            `🛒 **Artículo Limited de Rust**`
        )
        .setFooter({
            text:
                `Rust Store • ${index + 1}/${total}`
        })
        .setTimestamp();

    // =================================================
    // IMAGEN GRANDE
    // =================================================

    if (item.imagen) {
        embed.setImage(item.imagen);
    }

    return embed;
}

// =====================================================
// BOTÓN STEAM
// =====================================================

function crearBotonSteam(item) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel("Ver en Steam")
                .setStyle(ButtonStyle.Link)
                .setURL(item.url)
        );
}

// =====================================================
// PUBLICAR TIENDA MANUAL
// =====================================================

async function publicarTiendaManual(interaction) {
    console.log(
        "[RUST STORE] Ejecutando /tienda"
    );

    try {
        await interaction.deferReply();

        const items =
            await obtenerTiendaLimited();

        if (!items.length) {
            await interaction.editReply(
                "❌ No se encontraron artículos Limited en la tienda de Rust."
            );

            return;
        }

        console.log(
            `[RUST STORE] Publicando ${items.length} artículos...`
        );

        // =================================================
        // PUBLICAR UNO POR UNO
        // =================================================

        for (let i = 0; i < items.length; i++) {
            const item = items[i];

            const embed =
                crearEmbed(
                    item,
                    i,
                    items.length
                );

            const botones =
                crearBotonSteam(item);

            const mensaje = {
                content:
                    `🛒 **Tienda Limited de Rust**\n` +
                    `Artículo **${i + 1}/${items.length}**`,
                embeds: [embed],
                components: [botones]
            };

            // =================================================
            // PRIMER MENSAJE
            // =================================================

            if (i === 0) {
                await interaction.editReply(
                    mensaje
                );
            }

            // =================================================
            // RESTO DE MENSAJES
            // =================================================

            else {
                await interaction.channel.send(
                    mensaje
                );
            }

            await esperar(500);
        }

        console.log(
            `[RUST STORE] Publicado: ${items.length} artículos.`
        );

    } catch (error) {
        console.error(
            "[RUST STORE] Error publicando tienda:",
            error
        );

        try {
            if (interaction.deferred) {
                await interaction.editReply(
                    "❌ Ocurrió un error al publicar la tienda de Rust."
                );
            }
        } catch (errorRespuesta) {
            console.error(
                "[RUST STORE] Error enviando respuesta:",
                errorRespuesta
            );
        }
    }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    obtenerTiendaLimited,
    publicarTiendaManual
};