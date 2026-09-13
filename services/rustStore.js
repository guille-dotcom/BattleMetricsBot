const axios = require("axios");

const cheerio = require("cheerio");

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
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
// IDS LIMITED CONFIRMADOS
// =====================================================

const IDS_LIMITED_CONOCIDOS = new Set([

    70600,
    70601,
    70602,
    70603,
    70604,
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
    70615,
    70616

]);

// =====================================================
// NOMBRES DE RESPALDO
// =====================================================

const NOMBRES_CONOCIDOS = {

    70600: "Young Dragon Garage Door",
    70601: "Salvation SAR",
    70602: "Pirate Wood Gloves",
    70603: "Wrecker Salvaged Icepick",
    70604: "Tempered Waterpipe Shotgun",
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
    70615: "Flame Anarchy Wood Armor Helmet",
    70616: "Super Star MP5"

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

        .replace(/\u00a0/g, " ")

        .trim();

}

function esNombreGenerico(nombre) {

    if (!nombre) {

        return true;

    }

    const texto =

        limpiarTexto(nombre).toLowerCase();

    return [

        "save 50% on rust on steam",

        "save 50% on rust",

        "rust on steam",

        "rust item store",

        "rust",

        "steam"

    ].includes(texto);

}

function normalizarImagen(url) {

    if (!url) {

        return "";

    }

    let imagen =

        String(url).trim();

    if (imagen.startsWith("//")) {

        imagen =

            "https:" + imagen;

    }

    if (

        !imagen.includes(

            "/economy/image/"

        )

    ) {

        return "";

    }

    return imagen;

}

function normalizarPrecio(texto) {

    if (!texto) {

        return "";

    }

    const limpio =

        limpiarTexto(texto);

    const match =

        limpio.match(

            /(?:[$€£]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:USD|EUR|GBP)|R\$\s?\d+(?:[.,]\d{1,2})?)/i

        );

    return match

        ? limpiarTexto(match[0])

        : "";

}

function extraerIDs706(texto) {

    const ids =

        new Set();

    if (!texto) {

        return ids;

    }

    const regex =

        /\b706\d{2}\b/g;

    let match;

    while (

        (match = regex.exec(String(texto)))

    ) {

        const id =

            Number(match[0]);

        if (

            id >= 70600 &&

            id <= 70699

        ) {

            ids.add(id);

        }

    }

    return ids;

}

// =====================================================
// OBTENER HTML
// =====================================================

async function obtenerHTML(

    url,

    params = {}

) {

    const response =

        await axios.get(

            url,

            {

                params,

                headers: HEADERS,

                timeout: 30000,

                validateStatus:

                    status =>

                        status >= 200 &&

                        status < 400

            }

        );

    return response.data;

}

// =====================================================
// BUSCAR IDS EN HTML
// =====================================================

function buscarIDsEnHTML(html) {

    const ids =

        new Set();

    const $ =

        cheerio.load(html);

    $("a").each(

        (_, elemento) => {

            const $a =

                $(elemento);

            const valores = [

                $a.attr("href"),

                $a.attr("data-itemdefid"),

                $a.attr("data-item-def-id"),

                $a.attr("data-itemdef"),

                $a.attr("data-id")

            ];

            for (

                const valor of valores

            ) {

                const encontrados =

                    extraerIDs706(

                        valor

                    );

                for (

                    const id of encontrados

                ) {

                    ids.add(id);

                }

            }

        }

    );

    const encontradosHTML =

        extraerIDs706(html);

    for (

        const id of encontradosHTML

    ) {

        ids.add(id);

    }

    return ids;

}

// =====================================================
// BUSCAR DATOS DE TARJETA
// =====================================================

function buscarTarjeta(

    html,

    id

) {

    const $ =

        cheerio.load(html);

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

    for (

        const selector of selectores

    ) {

        $(selector).each(

            (_, elemento) => {

                const $elemento =

                    $(elemento);

                // =========================================
                // NOMBRE
                // =========================================

                const nombres = [

                    $elemento.attr("title"),

                    $elemento.attr("aria-label"),

                    $elemento.attr("data-title"),

                    $elemento.attr("data-item-name"),

                    $elemento.attr("data-name")

                ];

                for (

                    const candidato of nombres

                ) {

                    const nombre =

                        limpiarTexto(

                            candidato

                        );

                    if (

                        nombre &&

                        !esNombreGenerico(nombre) &&

                        nombre.length < 150

                    ) {

                        resultado.nombre =

                            nombre;

                        break;

                    }

                }

                if (

                    !resultado.nombre

                ) {

                    const texto =

                        limpiarTexto(

                            $elemento.text()

                        );

                    if (

                        texto &&

                        !esNombreGenerico(texto) &&

                        texto.length < 150

                    ) {

                        resultado.nombre =

                            texto;

                    }

                }

                // =========================================
                // IMAGEN
                // =========================================

                const imagenes = [];

                if (

                    $elemento.is("img")

                ) {

                    imagenes.push(

                        $elemento.attr("src"),

                        $elemento.attr("data-src"),

                        $elemento.attr("data-original")

                    );

                }

                $elemento

                    .find("img")

                    .each(

                        (_, img) => {

                            imagenes.push(

                                $(img).attr("src"),

                                $(img).attr("data-src"),

                                $(img).attr("data-original")

                            );

                        }

                    );

                for (

                    const url of imagenes

                ) {

                    const imagen =

                        normalizarImagen(

                            url

                        );

                    if (imagen) {

                        resultado.imagen =

                            imagen;

                        break;

                    }

                }

                // =========================================
                // PRECIO
                // =========================================

                const posiblesPrecios = [

                    $elemento.text(),

                    $elemento.attr("data-price"),

                    $elemento.attr("data-item-price")

                ];

                for (

                    const texto of posiblesPrecios

                ) {

                    const precio =

                        normalizarPrecio(

                            texto

                        );

                    if (precio) {

                        resultado.precio =

                            precio;

                        break;

                    }

                }

            }

        );

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

        const response =

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

                        "Referer":

                            STEAM_STORE_URL,

                        "X-Requested-With":

                            "XMLHttpRequest"

                    },

                    timeout: 30000

                }

            );

        const data =

            response.data;

        console.log(

            "[RUST STORE] AJAX keys:",

            Object.keys(data || {})

        );

        const ids =

            new Set();

        function recorrer(

            valor,

            profundidad = 0

        ) {

            if (

                valor === null ||

                valor === undefined ||

                profundidad > 15

            ) {

                return;

            }

            if (

                typeof valor === "string"

            ) {

                const encontrados =

                    extraerIDs706(

                        valor

                    );

                for (

                    const id of encontrados

                ) {

                    ids.add(id);

                }

                return;

            }

            if (

                typeof valor !== "object"

            ) {

                return;

            }

            if (

                Array.isArray(valor)

            ) {

                for (

                    const elemento of valor

                ) {

                    recorrer(

                        elemento,

                        profundidad + 1

                    );

                }

                return;

            }

            for (

                const [

                    clave,

                    contenido

                ]

                of Object.entries(valor)

            ) {

                const numero =

                    Number(clave);

                if (

                    Number.isInteger(numero) &&

                    numero >= 70600 &&

                    numero <= 70699

                ) {

                    ids.add(numero);

                }

                if (

                    typeof contenido ===

                    "string"

                ) {

                    const encontrados =

                        extraerIDs706(

                            contenido

                        );

                    for (

                        const id of encontrados

                    ) {

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
// OBTENER DETALLE INDIVIDUAL
// =====================================================

async function obtenerDetalle(id) {

    try {

        const url =

            `${STEAM_DETAIL_URL}${id}`;

        const html =

            await obtenerHTML(

                url,

                {

                    cc: "us",

                    l: "english"

                }

            );

        const $ =

            cheerio.load(html);

        let nombre = "";

        let imagen = "";

        let precio = "";

        // =================================================
        // NOMBRE
        // =================================================

        const selectoresNombre = [

            `[data-itemdefid="${id}"]`,

            `[data-item-def-id="${id}"]`,

            ".item_name",

            ".itemstore_item_name",

            ".item_def_name",

            ".itemstore_item_name_text"

        ];

        for (

            const selector of selectoresNombre

        ) {

            $(selector).each(

                (_, elemento) => {

                    if (nombre) {

                        return;

                    }

                    const $elemento =

                        $(elemento);

                    const candidatos = [

                        $elemento.attr("title"),

                        $elemento.attr("aria-label"),

                        $elemento.attr("data-item-name"),

                        $elemento.attr("data-name"),

                        $elemento.text()

                    ];

                    for (

                        const candidato

                        of candidatos

                    ) {

                        const texto =

                            limpiarTexto(

                                candidato

                            );

                        if (

                            texto &&

                            !esNombreGenerico(texto) &&

                            texto.length < 150

                        ) {

                            nombre =

                                texto;

                            break;

                        }

                    }

                }

            );

            if (nombre) {

                break;

            }

        }

        // =================================================
        // NOMBRE EN H1/H2/H3
        // =================================================

        if (!nombre) {

            $("h1, h2, h3").each(

                (_, elemento) => {

                    if (nombre) {

                        return;

                    }

                    const texto =

                        limpiarTexto(

                            $(elemento).text()

                        );

                    if (

                        texto &&

                        !esNombreGenerico(texto) &&

                        texto.length >= 3 &&

                        texto.length <= 150

                    ) {

                        nombre =

                            texto;

                    }

                }

            );

        }

        // =================================================
        // NOMBRE EN JSON
        // =================================================

        if (!nombre) {

            const posicion =

                html.indexOf(

                    String(id)

                );

            if (

                posicion !== -1

            ) {

                const bloque =

                    html.slice(

                        Math.max(

                            0,

                            posicion - 5000

                        ),

                        Math.min(

                            html.length,

                            posicion + 15000

                        )

                    );

                const regexNombre =

                    /"(?:name|item_name|itemname|display_name|displayname)"\s*:\s*"([^"]{1,150})"/gi;

                let match;

                while (

                    (match =

                        regexNombre.exec(

                            bloque

                        ))

                ) {

                    const candidato =

                        limpiarTexto(

                            match[1]

                        );

                    if (

                        candidato &&

                        !esNombreGenerico(candidato)

                    ) {

                        nombre =

                            candidato;

                        break;

                    }

                }

            }

        }

        // =================================================
        // IMAGEN
        // =================================================

        const regexImagen =

            /https?:\/\/[^"'\s]+\/economy\/image\/[^"'\s]+/gi;

        const imagenes =

            html.match(

                regexImagen

            ) || [];

        for (

            const url of imagenes

        ) {

            const normalizada =

                normalizarImagen(

                    url

                );

            if (normalizada) {

                imagen =

                    normalizada;

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

            html

        ];

        for (

            const bloque of bloquesPrecio

        ) {

            const encontrado =

                normalizarPrecio(

                    bloque

                );

            if (encontrado) {

                precio =

                    encontrado;

                break;

            }

        }

        // =================================================
        // RESPALDO
        // =================================================

        if (

            !nombre &&

            NOMBRES_CONOCIDOS[id]

        ) {

            nombre =

                NOMBRES_CONOCIDOS[id];

        }

        if (

            esNombreGenerico(nombre)

        ) {

            nombre =

                NOMBRES_CONOCIDOS[id] || "";

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
// OBTENER TIENDA LIMITED
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
    // CANTIDAD
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
    // IDS HTML
    // =================================================

    const ids =

        buscarIDsEnHTML(

            html

        );

    console.log(

        `[RUST STORE] IDs Limited detectados en HTML: ${ids.size}`

    );

    // =================================================
    // AGREGAR IDS CONOCIDOS
    // =================================================

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
    // FILTRAR 706XX
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
    // COMPLETAR ARTÍCULOS
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
        // DETALLE INDIVIDUAL SI FALTA INFORMACIÓN
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

        if (

            esNombreGenerico(nombre)

        ) {

            nombre =

                NOMBRES_CONOCIDOS[id] || "";

        }

        // =================================================
        // SOLO IMAGEN ECONOMY
        // =================================================

        if (

            imagen &&

            !imagen.includes(

                "/economy/image/"

            )

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

                "Precio no disponible",

            url:

                `${STEAM_DETAIL_URL}${id}`

        });

    }

    // =================================================
    // LOG FINAL
    // =================================================

    console.log(

        `[RUST STORE] DATOS FINALES: ` +

        `${items.filter(

            item =>

                item.nombre &&

                !item.nombre.startsWith(

                    "Item Rust"

                )

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

                `**Precio:** ${item.precio}\n\n` +

                `Artículo Limited de la tienda de Rust.\n\n` +

                `**${indice + 1}/${total}**`

            )

            .setFooter({

                text:

                    `Rust Store • ID ${item.id}`

            })

            .setTimestamp();

    // =================================================
    // IMAGEN INDIVIDUAL
    // =================================================

    if (

        item.imagen &&

        item.imagen.includes(

            "/economy/image/"

        )

    ) {

        embed.setImage(

            item.imagen

        );

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
// PUBLICAR TIENDA
// =====================================================

async function publicarTiendaManual(

    interaction

) {

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

    // =================================================
    // IMPORTANTE:
    //
    // NO usamos followUp() para los siguientes artículos.
    //
    // El primer mensaje es la respuesta de la interacción.
    // Los demás se envían directamente al canal.
    //
    // Así cada artículo queda como mensaje independiente
    // y no aparece como continuación/referencia del anterior.
    // =================================================

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

        const botones =

            crearBotonSteam(

                item

            );

        const mensaje = {

            content:

                `🛒 **Tienda Limited de Rust**\n` +

                `Artículo **${i + 1}/${items.length}**`,

            embeds: [

                embed

            ],

            components: [

                botones

            ]

        };

        // =================================================
        // PRIMER ARTÍCULO
        // =================================================

        if (i === 0) {

            await interaction.editReply(

                mensaje

            );

        }

        // =================================================
        // RESTO DE ARTÍCULOS
        //
        // SE ENVÍAN DIRECTAMENTE AL CANAL.
        // NO SON FOLLOW-UP.
        // =================================================

        else {

            if (

                interaction.channel &&

                typeof interaction.channel.send ===

                    "function"

            ) {

                await interaction.channel.send(

                    mensaje

                );

            } else {

                throw new Error(

                    "No se pudo obtener el canal de Discord para publicar la tienda."

                );

            }

        }

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