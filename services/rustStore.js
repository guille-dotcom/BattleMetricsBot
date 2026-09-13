const axios = require("axios");
const cheerio = require("cheerio");

const {
    EmbedBuilder
} = require("discord.js");

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
const MAX_ITEMS = 50;

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36",

    "Accept-Language":
        "en-US,en;q=0.9"
};

// =====================================================
// IDS LIMITED QUE YA CONFIRMAMOS
// =====================================================

const IDS_LIMITED_CONOCIDOS = new Set([
    70602,
    70605,
    70606,
    70607,
    70608,
    70609,
    70610,
    70611,
    70612,
    70613,
    70614,
    70615
]);

// =====================================================
// NOMBRES CONFIRMADOS
// =====================================================

const NOMBRES_CONOCIDOS = {
    70602: "Pirate Wood Gloves",
    70605: "Apotheosis of War Locker",
    70606: "Project Nova Bed",
    70607: "No Mercy Wood Pants",
    70608: "No Mercy Wood Jacket",
    70609: "No Mercy Wooden Helmet",
    70610: "All Seeing Eye Electric Furnace",
    70611: "Devourer Facemask",
    70612: "Devourer Metal Chest Plate",
    70613: "Flame Anarchy Wood Armor Pants",
    70614: "Flame Anarchy Wood Armor Jacket",
    70615: "Flame Anarchy Wood Armor Helmet"
};

// =====================================================
// UTILIDADES
// =====================================================

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function limpiarTexto(texto) {
    if (!texto) {
        return "";
    }

    return String(texto)
        .replace(/\s+/g, " ")
        .replace(/\u00a0/g, " ")
        .trim();
}

function esNombreGenerico(nombre) {
    if (!nombre) {
        return true;
    }

    const texto = limpiarTexto(nombre).toLowerCase();

    return [
        "save 50% on rust on steam",
        "save 50% on rust",
        "rust on steam",
        "rust",
        "steam"
    ].includes(texto);
}

function normalizarImagen(url) {
    if (!url) {
        return "";
    }

    let imagen = String(url).trim();

    if (imagen.startsWith("//")) {
        imagen = "https:" + imagen;
    }

    // MUY IMPORTANTE:
    // solamente aceptamos imágenes individuales
    // de Steam Economy.
    if (!imagen.includes("/economy/image/")) {
        return "";
    }

    return imagen;
}

function normalizarPrecio(texto) {
    if (!texto) {
        return "";
    }

    const limpio = limpiarTexto(texto);

    const match = limpio.match(
        /(?:[$€£]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:USD|EUR|GBP))/i
    );

    return match
        ? limpiarTexto(match[0])
        : "";
}

function extraerIDs706(texto) {
    const ids = new Set();

    if (!texto) {
        return ids;
    }

    const regex = /\b706\d{2}\b/g;

    let match;

    while ((match = regex.exec(String(texto))) !== null) {
        const id = Number(match[0]);

        if (id >= 70600 && id <= 70699) {
            ids.add(id);
        }
    }

    return ids;
}

// =====================================================
// OBTENER HTML
// =====================================================

async function obtenerHTML(url, params = {}) {
    const response = await axios.get(url, {
        params,
        headers: HEADERS,
        timeout: 30000,
        validateStatus: status =>
            status >= 200 && status < 400
    });

    return response.data;
}

// =====================================================
// BUSCAR IDS EN EL HTML
// =====================================================

function buscarIDsEnHTML(html) {
    const ids = new Set();

    const $ = cheerio.load(html);

    $("a").each((_, elemento) => {
        const $a = $(elemento);

        const valores = [
            $a.attr("href"),
            $a.attr("data-itemdefid"),
            $a.attr("data-item-def-id"),
            $a.attr("data-itemdef"),
            $a.attr("data-id")
        ];

        for (const valor of valores) {
            const encontrados = extraerIDs706(valor);

            for (const id of encontrados) {
                ids.add(id);
            }
        }
    });

    const encontradosHTML = extraerIDs706(html);

    for (const id of encontradosHTML) {
        ids.add(id);
    }

    return ids;
}

// =====================================================
// BUSCAR DATOS DE LAS TARJETAS
// =====================================================

function buscarTarjeta(html, id) {
    const $ = cheerio.load(html);

    const resultado = {
        nombre: "",
        imagen: "",
        precio: ""
    };

    const selectores = [
        `[data-itemdefid="${id}"]`,
        `[data-item-def-id="${id}"]`,
        `a[href*="/detail/${id}"]`
    ];

    for (const selector of selectores) {
        $(selector).each((_, elemento) => {
            const $elemento = $(elemento);

            // -----------------------------
            // Nombre
            // -----------------------------

            const nombres = [
                $elemento.attr("title"),
                $elemento.attr("aria-label"),
                $elemento.attr("data-title"),
                $elemento.attr("data-item-name"),
                $elemento.attr("data-name")
            ];

            for (const nombre of nombres) {
                const limpio = limpiarTexto(nombre);

                if (
                    limpio &&
                    !esNombreGenerico(limpio) &&
                    limpio.length < 150
                ) {
                    resultado.nombre = limpio;
                    break;
                }
            }

            if (!resultado.nombre) {
                const texto = limpiarTexto(
                    $elemento.text()
                );

                if (
                    texto &&
                    !esNombreGenerico(texto) &&
                    texto.length < 150
                ) {
                    resultado.nombre = texto;
                }
            }

            // -----------------------------
            // Imagen individual
            // -----------------------------

            const imagenes = [];

            if ($elemento.is("img")) {
                imagenes.push(
                    $elemento.attr("src"),
                    $elemento.attr("data-src"),
                    $elemento.attr("data-original")
                );
            }

            $elemento.find("img").each((_, img) => {
                imagenes.push(
                    $(img).attr("src"),
                    $(img).attr("data-src"),
                    $(img).attr("data-original")
                );
            });

            for (const url of imagenes) {
                const imagen = normalizarImagen(url);

                if (imagen) {
                    resultado.imagen = imagen;
                    break;
                }
            }

            // -----------------------------
            // Precio
            // -----------------------------

            const textosPrecio = [
                $elemento.text(),
                $elemento.attr("data-price"),
                $elemento.attr("data-item-price")
            ];

            for (const texto of textosPrecio) {
                const precio = normalizarPrecio(texto);

                if (precio) {
                    resultado.precio = precio;
                    break;
                }
            }
        });

        if (
            resultado.nombre ||
            resultado.imagen ||
            resultado.precio
        ) {
            break;
        }
    }

    return resultado;
}

// =====================================================
// AJAX DE STEAM
// =====================================================

async function obtenerIDsDesdeAjax() {
    console.log(
        "[RUST STORE] Consultando ajaxgetitemdefs..."
    );

    try {
        const response = await axios.get(
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
                    "Referer": STEAM_STORE_URL,
                    "X-Requested-With": "XMLHttpRequest"
                },

                timeout: 30000
            }
        );

        const data = response.data;

        console.log(
            "[RUST STORE] AJAX keys:",
            Object.keys(data || {})
        );

        const ids = new Set();

        // Buscar IDs dentro de TODO el JSON.
        function recorrer(valor, profundidad = 0) {
            if (
                valor === null ||
                valor === undefined ||
                profundidad > 15
            ) {
                return;
            }

            if (typeof valor === "string") {
                const encontrados =
                    extraerIDs706(valor);

                for (const id of encontrados) {
                    ids.add(id);
                }

                return;
            }

            if (typeof valor !== "object") {
                return;
            }

            if (Array.isArray(valor)) {
                for (const elemento of valor) {
                    recorrer(
                        elemento,
                        profundidad + 1
                    );
                }

                return;
            }

            for (const [clave, contenido] of Object.entries(valor)) {
                const numero = Number(clave);

                if (
                    Number.isInteger(numero) &&
                    numero >= 70600 &&
                    numero <= 70699
                ) {
                    ids.add(numero);
                }

                if (
                    typeof contenido === "string"
                ) {
                    const encontrados =
                        extraerIDs706(contenido);

                    for (const id of encontrados) {
                        ids.add(id);
                    }
                }

                recorrer(
                    contenido,
                    profundidad + 1
                );
            }
        }

        recorrer(data);

        console.log(
            `[RUST STORE] IDs 706xx encontrados en AJAX: ${ids.size}`
        );

        return ids;

    } catch (error) {
        console.error(
            "[RUST STORE] Error AJAX:",
            error.message
        );

        return new Set();
    }
}

// =====================================================
// DETALLE DE UN ITEM
// =====================================================

async function obtenerDetalle(id) {
    try {
        const url =
            `${STEAM_DETAIL_URL}${id}`;

        const html = await obtenerHTML(
            url,
            {
                cc: "us",
                l: "english"
            }
        );

        const $ = cheerio.load(html);

        let nombre = "";
        let imagen = "";
        let precio = "";

        // =================================================
        // NOMBRE
        // =================================================

        const selectoresNombre = [
            `[data-itemdefid="${id}"]`,
            `[data-item-def-id="${id}"]`,
            `.item_name`,
            `.itemstore_item_name`,
            `.item_def_name`
        ];

        for (const selector of selectoresNombre) {
            $(selector).each((_, elemento) => {
                if (nombre) {
                    return;
                }

                const $elemento = $(elemento);

                const candidatos = [
                    $elemento.attr("title"),
                    $elemento.attr("aria-label"),
                    $elemento.attr("data-item-name"),
                    $elemento.attr("data-name"),
                    $elemento.text()
                ];

                for (const candidato of candidatos) {
                    const texto =
                        limpiarTexto(candidato);

                    if (
                        texto &&
                        !esNombreGenerico(texto) &&
                        texto.length < 150
                    ) {
                        nombre = texto;
                        break;
                    }
                }
            });

            if (nombre) {
                break;
            }
        }

        // =================================================
        // BUSCAR NOMBRE EN JSON / HTML
        // =================================================

        if (!nombre) {
            const posicion =
                html.indexOf(String(id));

            if (posicion !== -1) {
                const bloque =
                    html.slice(
                        Math.max(0, posicion - 5000),
                        Math.min(
                            html.length,
                            posicion + 15000
                        )
                    );

                const regexNombre =
                    /"(?:name|item_name|itemname|display_name|displayname)"\s*:\s*"([^"]{1,150})"/gi;

                let match;

                while (
                    (match = regexNombre.exec(bloque))
                ) {
                    const candidato =
                        limpiarTexto(match[1]);

                    if (
                        candidato &&
                        !esNombreGenerico(candidato)
                    ) {
                        nombre = candidato;
                        break;
                    }
                }
            }
        }

        // =================================================
        // IMAGEN
        // =================================================

        const regexImagen =
            /https?:\/\/[^"'\\\s]+\/economy\/image\/[^"'\\\s]+/gi;

        const imagenes =
            html.match(regexImagen) || [];

        for (const url of imagenes) {
            const normalizada =
                normalizarImagen(url);

            if (normalizada) {
                imagen = normalizada;
                break;
            }
        }

        // =================================================
        // PRECIO
        // =================================================

        const bloquesPrecio = [
            $(".itemstore_item_price").text(),
            $(".item_price").text(),
            $(".price").text(),
            html.slice(
                Math.max(
                    0,
                    html.indexOf(String(id)) - 3000
                ),
                Math.min(
                    html.length,
                    html.indexOf(String(id)) + 10000
                )
            )
        ];

        for (const bloque of bloquesPrecio) {
            const precio =
                normalizarPrecio(bloque);

            if (precio) {
                precio && (precio);
                break;
            }
        }

        // Rehacer precio correctamente
        let precioFinal = "";

        for (const bloque of bloquesPrecio) {
            const encontrado =
                normalizarPrecio(bloque);

            if (encontrado) {
                precioFinal = encontrado;
                break;
            }
        }

        if (
            !nombre &&
            NOMBRES_CONOCIDOS[id]
        ) {
            nombre =
                NOMBRES_CONOCIDOS[id];
        }

        if (esNombreGenerico(nombre)) {
            nombre =
                NOMBRES_CONOCIDOS[id] || "";
        }

        console.log(
            `[RUST STORE] Detail ${id}: ` +
            `${nombre || "SIN NOMBRE"} | ` +
            `${precioFinal || "SIN PRECIO"} | ` +
            `${imagen ? "IMAGEN OK" : "SIN IMAGEN"}`
        );

        return {
            id,
            nombre,
            imagen,
            precio: precioFinal
        };

    } catch (error) {
        console.error(
            `[RUST STORE] Error detail ${id}:`,
            error.message
        );

        return {
            id,
            nombre:
                NOMBRES_CONOCIDOS[id] || "",
            imagen: "",
            precio: ""
        };
    }
}

// =====================================================
// BUSCAR IDS FALTANTES
//
// NO USA start=12.
// NO HACE PAGINACIÓN.
// Comprueba únicamente IDs cercanos al bloque actual.
// =====================================================

async function buscarIDsFaltantes(ids) {
    console.log(
        "[RUST STORE] Buscando Limited faltantes sin paginación..."
    );

    const faltantes = [];

    for (
        let id = 70602;
        id <= 70630;
        id++
    ) {
        if (ids.has(id)) {
            continue;
        }

        const detalle =
            await obtenerDetalle(id);

        await esperar(
            REQUEST_DELAY
        );

        if (
            detalle.nombre ||
            detalle.imagen ||
            detalle.precio
        ) {
            console.log(
                `[RUST STORE] Posible Limited adicional: ${id}`
            );

            faltantes.push(detalle);
        }
    }

    return faltantes;
}

// =====================================================
// OBTENER TIENDA
// =====================================================

async function obtenerTiendaLimited() {
    console.log(
        "[RUST STORE] Consultando página Limited de Steam..."
    );

    const html =
        await obtenerHTML(
            STEAM_STORE_URL
        );

    const $ =
        cheerio.load(html);

    // =================================================
    // CANTIDAD QUE STEAM MUESTRA
    // =================================================

    const texto =
        $.text();

    const match =
        texto.match(
            /(\d+)\s+Limited/i
        );

    if (match) {
        console.log(
            `[RUST STORE] Steam indica ${match[1]} resultados Limited.`
        );
    }

    // =================================================
    // IDS DEL HTML
    // =================================================

    const ids =
        buscarIDsEnHTML(html);

    console.log(
        `[RUST STORE] IDs Limited detectados en HTML: ${ids.size}`
    );

    // Agregar los conocidos
    for (
        const id of IDS_LIMITED_CONOCIDOS
    ) {
        ids.add(id);
    }

    // =================================================
    // AJAX
    // =================================================

    const idsAjax =
        await obtenerIDsDesdeAjax();

    for (
        const id of idsAjax
    ) {
        ids.add(id);
    }

    // =================================================
    // SOLO 706xx
    // =================================================

    for (
        const id of [...ids]
    ) {
        if (
            id < 70600 ||
            id > 70699
        ) {
            ids.delete(id);
        }
    }

    console.log(
        `[RUST STORE] IDs Limited después de AJAX: ${ids.size}`
    );

    // =================================================
    // SI SIGUEN SIENDO MENOS DE 17
    //
    // Buscamos candidatos por detalle.
    // Esto NO usa start=12.
    // =================================================

    if (ids.size < 17) {
        const faltantes =
            await buscarIDsFaltantes(
                ids
            );

        for (
            const item of faltantes
        ) {
            ids.add(item.id);
        }
    }

    // =================================================
    // IDS FINALES
    // =================================================

    const idsFinales =
        [...ids]
            .filter(
                id =>
                    id >= 70600 &&
                    id <= 70699
            )
            .sort(
                (a, b) =>
                    a - b
            );

    console.log(
        `[RUST STORE] TOTAL IDs Limited finales: ${idsFinales.length}`
    );

    console.log(
        "[RUST STORE] IDs:",
        idsFinales.join(", ")
    );

    // =================================================
    // COMPLETAR CADA ITEM
    // =================================================

    const items = [];

    for (
        const id of idsFinales
    ) {
        const tarjeta =
            buscarTarjeta(
                html,
                id
            );

        let nombre =
            tarjeta.nombre;

        let imagen =
            normalizarImagen(
                tarjeta.imagen
            );

        let precio =
            normalizarPrecio(
                tarjeta.precio
            );

        // =================================================
        // DETALLE SI FALTA ALGO
        // =================================================

        if (
            !nombre ||
            !imagen ||
            !precio
        ) {
            const detalle =
                await obtenerDetalle(
                    id
                );

            if (
                !nombre &&
                detalle.nombre
            ) {
                nombre =
                    detalle.nombre;
            }

            if (
                !imagen &&
                detalle.imagen
            ) {
                imagen =
                    detalle.imagen;
            }

            if (
                !precio &&
                detalle.precio
            ) {
                precio =
                    detalle.precio;
            }

            await esperar(
                REQUEST_DELAY
            );
        }

        // =================================================
        // RESPALDO NOMBRE
        // =================================================

        if (
            !nombre &&
            NOMBRES_CONOCIDOS[id]
        ) {
            nombre =
                NOMBRES_CONOCIDOS[id];
        }

        if (esNombreGenerico(nombre)) {
            nombre =
                NOMBRES_CONOCIDOS[id] || "";
        }

        // =================================================
        // NO PERMITIR HEADER DE RUST
        // =================================================

        if (
            imagen &&
            !imagen.includes("/economy/image/")
        ) {
            imagen = "";
        }

        items.push({
            id,
            nombre:
                nombre ||
                `Item Rust ${id}`,
            imagen:
                imagen || null,
            precio:
                precio ||
                "Precio no disponible"
        });
    }

    console.log(
        `[RUST STORE] DATOS FINALES: ` +
        `${items.filter(
            item =>
                item.nombre &&
                !item.nombre.startsWith("Item Rust")
        ).length}/${items.length} con nombre, ` +
        `${items.filter(
            item => item.imagen
        ).length}/${items.length} con imagen, ` +
        `${items.filter(
            item =>
                item.precio !==
                "Precio no disponible"
        ).length}/${items.length} con precio.`
    );

    console.log(
        `[RUST STORE] TOTAL FINAL: ${items.length} artículos Limited encontrados.`
    );

    return items.slice(
        0,
        MAX_ITEMS
    );
}

// =====================================================
// EMBED
// =====================================================

function crearEmbed(item, indice, total) {
    const embed =
        new EmbedBuilder()
            .setTitle(
                `🛒 ${item.nombre}`
            )
            .setDescription(
                `**Precio:** ${item.precio}\n\n` +
                `Artículo Limited de la tienda de Rust.\n\n` +
                `**${indice + 1}/${total}**`
            )
            .setFooter({
                text:
                    `Rust Store • ID ${item.id}`
            })
            .setTimestamp();

    // SOLO imagen individual
    if (
        item.imagen &&
        item.imagen.includes("/economy/image/")
    ) {
        embed.setThumbnail(
            item.imagen
        );
    }

    return embed;
}

// =====================================================
// PUBLICAR
// =====================================================

async function publicarTiendaManual(interaction) {
    console.log(
        "🎯 Ejecutando /tienda"
    );

    const items =
        await obtenerTiendaLimited();

    if (
        !items ||
        items.length === 0
    ) {
        throw new Error(
            "No se encontraron artículos Limited."
        );
    }

    console.log(
        `[RUST STORE] Publicando ${items.length} artículos...`
    );

    const embeds =
        items.map(
            (item, indice) =>
                crearEmbed(
                    item,
                    indice,
                    items.length
                )
        );

    // Discord permite máximo 10 embeds
    // por mensaje.

    const bloques = [];

    for (
        let i = 0;
        i < embeds.length;
        i += 10
    ) {
        bloques.push(
            embeds.slice(
                i,
                i + 10
            )
        );
    }

    await interaction.editReply({
        content:
            `🛒 **Tienda Limited de Rust**\n` +
            `Se encontraron **${items.length} artículos**.`,
        embeds:
            bloques[0]
    });

    for (
        let i = 1;
        i < bloques.length;
        i++
    ) {
        await interaction.followUp({
            embeds:
                bloques[i]
        });
    }

    console.log(
        `[RUST STORE] Publicado: ${items.length} artículos.`
    );
}

// =====================================================
// EXPORT
// =====================================================

module.exports = {
    obtenerTiendaLimited,
    publicarTiendaManual
};