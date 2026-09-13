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

const MAX_ITEMS = 50;

const CHECK_INTERVAL = 10 * 60 * 1000;

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36",

    "Accept-Language":
        "en-US,en;q=0.9",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
};

// Evita que dos revisiones automáticas se ejecuten al mismo tiempo.
let tiendaRevisando = false;

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

// =====================================================
// OBTENER HTML
// =====================================================

async function obtenerHTML(
    url,
    params = {},
    headersExtra = {}
) {
    const response =
        await axios.get(
            url,
            {
                params,

                headers: {
                    ...HEADERS,
                    ...headersExtra
                },

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
// EXTRAER ID DE ITEM
// =====================================================

function extraerIDItem(valor) {
    if (
        valor === null ||
        valor === undefined
    ) {
        return null;
    }

    const texto =
        String(valor);

    const patrones = [
        /\/detail\/(\d+)/i,
        /itemdefid[=:\/"]+(\d+)/i,
        /item-def-id[=:\/"]+(\d+)/i,
        /itemdef[=:\/"]+(\d+)/i,
        /item_def_id[=:\/"]+(\d+)/i,
        /itemdefid=(\d+)/i,
        /itemdef=(\d+)/i,
        /item_id[=:\/"]+(\d+)/i,
        /itemid[=:\/"]+(\d+)/i
    ];

    for (
        const regex of patrones
    ) {
        const match =
            texto.match(regex);

        if (match) {
            const id =
                Number(match[1]);

            if (
                Number.isInteger(id) &&
                id > 0 &&
                id !== 252490
            ) {
                return id;
            }
        }
    }

    return null;
}

// =====================================================
// DETECTAR SI UN ELEMENTO ES UNA TARJETA DE ITEM
// =====================================================

function esPosibleTarjetaItem(
    $,
    elemento
) {
    const $elemento =
        $(elemento);

    const clases =
        String(
            $elemento.attr("class") || ""
        ).toLowerCase();

    const id =
        String(
            $elemento.attr("id") || ""
        ).toLowerCase();

    const href =
        String(
            $elemento.attr("href") || ""
        ).toLowerCase();

    const data =
        [
            $elemento.attr("data-itemdefid"),
            $elemento.attr("data-item-def-id"),
            $elemento.attr("data-itemdef"),
            $elemento.attr("data-item-id"),
            $elemento.attr("data-id")
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

    if (
        href.includes("/detail/") ||
        data ||
        clases.includes("itemstore") ||
        clases.includes("item_store") ||
        clases.includes("item-def") ||
        id.includes("item")
    ) {
        return true;
    }

    return false;
}

// =====================================================
// BUSCAR IDS DE LA PÁGINA LIMITED
//
// IMPORTANTE:
// NO usa 706xx.
// NO usa IDs conocidos.
// NO usa todo el AJAX.
// =====================================================

function buscarIDsLimitedEnHTML(html) {
    const ids =
        new Set();

    if (!html) {
        return ids;
    }

    const $ =
        cheerio.load(html);

    // -------------------------------------------------
    // 1. Enlaces directos /detail/ID
    // -------------------------------------------------

    $("a[href]").each(
        (_, elemento) => {

            const href =
                $(elemento).attr("href");

            const id =
                extraerIDItem(href);

            if (id) {
                ids.add(id);
            }
        }
    );

    // -------------------------------------------------
    // 2. Atributos data-* de las tarjetas
    // -------------------------------------------------

    $(
        "[data-itemdefid]," +
        "[data-item-def-id]," +
        "[data-itemdef]," +
        "[data-item-id]," +
        "[data-id]"
    ).each(
        (_, elemento) => {

            const valores = [
                $(elemento).attr("data-itemdefid"),
                $(elemento).attr("data-item-def-id"),
                $(elemento).attr("data-itemdef"),
                $(elemento).attr("data-item-id"),
                $(elemento).attr("data-id")
            ];

            for (
                const valor of valores
            ) {
                const id =
                    extraerIDItem(valor);

                if (id) {
                    ids.add(id);
                }
            }
        }
    );

    // -------------------------------------------------
    // 3. Buscar patrones específicos de itemstore
    // en scripts/HTML.
    //
    // No se escanean todos los números del HTML,
    // porque eso mete appid, precios, etc.
    // -------------------------------------------------

    $("script").each(
        (_, elemento) => {

            const contenido =
                $(elemento).html() || "";

            const patrones = [
                /itemdefid["'\s:=]+(\d+)/gi,
                /item_def_id["'\s:=]+(\d+)/gi,
                /itemdef["'\s:=]+(\d+)/gi,
                /itemid["'\s:=]+(\d+)/gi
            ];

            for (
                const regex of patrones
            ) {

                let match;

                while (
                    (match =
                        regex.exec(
                            contenido
                        ))
                ) {

                    const id =
                        Number(match[1]);

                    if (
                        Number.isInteger(id) &&
                        id > 0 &&
                        id !== 252490
                    ) {
                        ids.add(id);
                    }
                }
            }
        }
    );

    return ids;
}

// =====================================================
// EXTRAER INFORMACIÓN DE TARJETA
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
        `[data-itemdef="${id}"]`,
        `[data-item-id="${id}"]`,
        `a[href*="/detail/${id}"]`
    ];

    for (
        const selector of selectores
    ) {

        $(selector).each(
            (_, elemento) => {

                const $elemento =
                    $(elemento);

                // =====================================
                // NOMBRE
                // =====================================

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

                // =====================================
                // IMAGEN
                // =====================================

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

                // =====================================
                // PRECIO
                // =====================================

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
// AJAX
//
// IMPORTANTE:
// Este método NO decide qué artículos son Limited.
//
// Solo permite consultar información adicional.
// =====================================================

async function obtenerDatosAjax() {

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

                        Referer:
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

        return data;

    } catch (error) {

        console.error(
            "[RUST STORE] Error AJAX:",
            error.message
        );

        return null;
    }
}

// =====================================================
// BUSCAR DATOS DE UN ID DENTRO DEL AJAX
// =====================================================

function buscarDatosEnAjax(
    data,
    id
) {
    if (!data) {
        return {};
    }

    let encontrado = null;

    function recorrer(
        valor,
        profundidad = 0
    ) {

        if (
            encontrado ||
            valor === null ||
            valor === undefined ||
            profundidad > 15
        ) {
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

                if (encontrado) {
                    return;
                }
            }

            return;
        }

        // ---------------------------------------------
        // Si el objeto tiene una clave relacionada
        // con el ID buscado, lo consideramos candidato.
        // ---------------------------------------------

        const posiblesIds = [
            valor.id,
            valor.itemdefid,
            valor.item_def_id,
            valor.itemdef,
            valor.item_id,
            valor.itemid
        ];

        const coincide =
            posiblesIds.some(
                candidato =>
                    Number(candidato) ===
                    Number(id)
            );

        if (coincide) {

            encontrado =
                valor;

            return;
        }

        for (
            const [
                clave,
                contenido
            ]
            of Object.entries(valor)
        ) {

            if (
                Number(clave) ===
                Number(id)
            ) {

                encontrado =
                    contenido;

                return;
            }

            recorrer(
                contenido,
                profundidad + 1
            );

            if (encontrado) {
                return;
            }
        }
    }

    recorrer(data);

    return encontrado || {};
}

// =====================================================
// EXTRAER NOMBRE DE OBJETO AJAX
// =====================================================

function extraerNombreObjeto(
    objeto
) {
    if (
        !objeto ||
        typeof objeto !== "object"
    ) {
        return "";
    }

    const candidatos = [
        objeto.name,
        objeto.item_name,
        objeto.itemname,
        objeto.display_name,
        objeto.displayname,
        objeto.localized_name,
        objeto.title
    ];

    for (
        const candidato of candidatos
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
            return nombre;
        }
    }

    return "";
}

// =====================================================
// EXTRAER IMAGEN DE OBJETO AJAX
// =====================================================

function extraerImagenObjeto(
    objeto
) {
    if (
        !objeto ||
        typeof objeto !== "object"
    ) {
        return "";
    }

    const encontrados = [];

    function recorrer(
        valor,
        profundidad = 0
    ) {

        if (
            profundidad > 10 ||
            valor === null ||
            valor === undefined
        ) {
            return;
        }

        if (
            typeof valor === "string"
        ) {

            if (
                valor.includes(
                    "/economy/image/"
                )
            ) {
                encontrados.push(
                    valor
                );
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
            const contenido of Object.values(
                valor
            )
        ) {

            recorrer(
                contenido,
                profundidad + 1
            );
        }
    }

    recorrer(objeto);

    for (
        const url of encontrados
    ) {

        const imagen =
            normalizarImagen(
                url
            );

        if (imagen) {
            return imagen;
        }
    }

    return "";
}

// =====================================================
// EXTRAER PRECIO DE OBJETO AJAX
// =====================================================

function extraerPrecioObjeto(
    objeto
) {
    if (
        !objeto ||
        typeof objeto !== "object"
    ) {
        return "";
    }

    const candidatos = [
        objeto.price,
        objeto.price_text,
        objeto.priceText,
        objeto.formatted_price,
        objeto.formattedPrice,
        objeto.final_price
    ];

    for (
        const candidato of candidatos
    ) {

        const precio =
            normalizarPrecio(
                candidato
            );

        if (precio) {
            return precio;
        }
    }

    return "";
}

// =====================================================
// OBTENER DETALLE INDIVIDUAL
// =====================================================

async function obtenerDetalle(
    id,
    datosAjax = null
) {

    try {

        const url =
            `${STEAM_DETAIL_URL}${id}`;

        const html =
            await obtenerHTML(
                url,
                {
                    cc: "us",
                    l: "english"
                },
                {
                    Referer:
                        STEAM_STORE_URL
                }
            );

        const $ =
            cheerio.load(html);

        let nombre = "";
        let imagen = "";
        let precio = "";

        // =============================================
        // NOMBRE
        // =============================================

        const selectoresNombre = [
            `[data-itemdefid="${id}"]`,
            `[data-item-def-id="${id}"]`,
            ".item_name",
            ".itemstore_item_name",
            ".item_def_name",
            ".itemstore_item_name_text",
            "h1",
            "h2",
            "h3"
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
                        const candidato of candidatos
                    ) {

                        const texto =
                            limpiarTexto(
                                candidato
                            );

                        if (
                            texto &&
                            !esNombreGenerico(texto) &&
                            texto.length >= 3 &&
                            texto.length <= 150
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

        // =============================================
        // NOMBRE EN JSON
        // =============================================

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
                        !esNombreGenerico(
                            candidato
                        )
                    ) {

                        nombre =
                            candidato;

                        break;
                    }
                }
            }
        }

        // =============================================
        // IMAGEN
        // =============================================

        const regexImagen =
            /https?:\/\/[^"'\\\s]+\/economy\/image\/[^"'\\\s]+/gi;

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

        // =============================================
        // PRECIO
        // =============================================

        const bloquesPrecio = [
            $(".itemstore_item_price").text(),
            $(".item_price").text(),
            $(".price").text()
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

        // =============================================
        // AJAX COMO RESPALDO
        // =============================================

        if (
            datosAjax
        ) {

            if (!nombre) {

                nombre =
                    extraerNombreObjeto(
                        datosAjax
                    );
            }

            if (!imagen) {

                imagen =
                    extraerImagenObjeto(
                        datosAjax
                    );
            }

            if (!precio) {

                precio =
                    extraerPrecioObjeto(
                        datosAjax
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
            `[RUST STORE] Error detail ${id}:`,
            error.message
        );

        return {
            id,
            nombre: "",
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
    // CANTIDAD INDICADA POR STEAM
    // =================================================

    const textoPagina =
        limpiarTexto(
            $.text()
        );

    const posiblesConteos = [
        textoPagina.match(
            /(\d+)\s+Limited/i
        ),
        textoPagina.match(
            /Limited\s*\((\d+)\)/i
        ),
        textoPagina.match(
            /(\d+)\s+items?\s+Limited/i
        )
    ];

    for (
        const match of posiblesConteos
    ) {

        if (match) {

            console.log(
                `[RUST STORE] Steam indica aproximadamente ${match[1]} resultados Limited.`
            );

            break;
        }
    }

    // =================================================
    // IDS DESDE HTML
    // =================================================

    const idsHTML =
        buscarIDsLimitedEnHTML(
            html
        );

    console.log(
        `[RUST STORE] IDs detectados directamente en HTML: ${idsHTML.size}`
    );

    if (idsHTML.size > 0) {

        console.log(
            "[RUST STORE] IDs HTML:",
            [...idsHTML]
                .sort((a, b) => a - b)
                .join(", ")
        );
    }

    // =================================================
    // AJAX
    //
    // SOLO PARA DATOS.
    //
    // NO AGREGAMOS SUS IDS A LA LISTA LIMITED.
    // =================================================

    const datosAjax =
        await obtenerDatosAjax();

    // =================================================
    // IDS FINALES
    // =================================================

    const idsFinales =
        [...idsHTML]
            .filter(
                id =>
                    Number.isInteger(id) &&
                    id > 0 &&
                    id !== 252490
            )
            .sort(
                (a, b) =>
                    a - b
            );

    console.log(
        `[RUST STORE] TOTAL IDS LIMITED REALES DETECTADOS: ${idsFinales.length}`
    );

    console.log(
        "[RUST STORE] IDS LIMITED:",
        idsFinales.join(", ")
    );

    // =================================================
    // SI NO HAY IDS
    // =================================================

    if (
        idsFinales.length === 0
    ) {

        console.error(
            "[RUST STORE] Steam no entregó IDs Limited en el HTML."
        );

        console.error(
            "[RUST STORE] NO se utilizará el catálogo AJAX como sustituto para evitar publicar artículos incorrectos."
        );

        return [];
    }

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

        // =============================================
        // BUSCAR DATOS AJAX SOLO PARA ESTE ID
        // =============================================

        const datosItemAjax =
            buscarDatosEnAjax(
                datosAjax,
                id
            );

        if (!nombre) {

            nombre =
                extraerNombreObjeto(
                    datosItemAjax
                );
        }

        if (!imagen) {

            imagen =
                extraerImagenObjeto(
                    datosItemAjax
                );
        }

        if (!precio) {

            precio =
                extraerPrecioObjeto(
                    datosItemAjax
                );
        }

        // =============================================
        // DETALLE INDIVIDUAL SI TODAVÍA FALTA ALGO
        // =============================================

        if (
            !nombre ||
            !imagen ||
            !precio
        ) {

            const detalle =
                await obtenerDetalle(
                    id,
                    datosItemAjax
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

        // =============================================
        // VALIDAR NOMBRE
        // =============================================

        if (
            esNombreGenerico(
                nombre
            )
        ) {

            nombre = "";
        }

        // =============================================
        // SOLO AGREGAR SI TENEMOS NOMBRE REAL
        // =============================================

        if (!nombre) {

            console.warn(
                `[RUST STORE] ${id}: no se pudo obtener nombre. Se omite.`
            );

            continue;
        }

        // =============================================
        // IMAGEN
        // =============================================

        if (
            imagen &&
            !imagen.includes(
                "/economy/image/"
            )
        ) {

            imagen = "";
        }

        // =============================================
        // ITEM FINAL
        // =============================================

        items.push({
            id,

            nombre,

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
        `${items.length}/${idsFinales.length} con nombre, ` +
        `${items.filter(item => item.imagen).length}/${items.length} con imagen, ` +
        `${items.filter(item => item.precio !== "Precio no disponible").length}/${items.length} con precio.`
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
// FIRMA DE TIENDA
//
// Se basa en los IDs actuales.
// Si Steam cambia los artículos,
// la firma cambia.
// =====================================================

function generarFirmaTienda(
    items
) {
    return items
        .map(item => item.id)
        .sort(
            (a, b) =>
                a - b
        )
        .join(",");
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

    if (
        item.imagen &&
        item.imagen.includes(
            "/economy/image/"
        )
    ) {

        embed.setThumbnail(
            item.imagen
        );
    }

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
// PUBLICAR EN CANAL
// =====================================================

async function publicarTiendaEnCanal(
    channel,
    items
) {

    if (
        !channel ||
        typeof channel.send !==
            "function"
    ) {

        throw new Error(
            "El canal no permite enviar mensajes."
        );
    }

    if (
        !items ||
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

        const botones =
            crearBotonSteam(
                item
            );

        await channel.send({
            content:
                `🛒 **Tienda Limited de Rust**\n` +
                `Artículo **${i + 1}/${items.length}**`,

            embeds: [
                embed
            ],

            components: [
                botones
            ]
        });

        await esperar(
            REQUEST_DELAY
        );
    }

    console.log(
        `[RUST STORE] Publicado: ${items.length} artículos.`
    );
}

// =====================================================
// PUBLICAR TIENDA MANUAL
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

        if (i === 0) {

            await interaction.editReply(
                mensaje
            );

        } else {

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
                    "No se pudo obtener el canal de Discord."
                );
            }
        }
    }

    console.log(
        `[RUST STORE] Publicado: ${items.length} artículos.`
    );
}

// =====================================================
// REVISAR TIENDA AUTOMÁTICA
// =====================================================

async function revisarTiendaAutomatica(
    client
) {

    if (tiendaRevisando) {

        console.log(
            "[RUST STORE] Ya hay una revisión en curso. Se omite esta ejecución."
        );

        return;
    }

    tiendaRevisando = true;

    try {

        console.log(
            "🛒 [RUST STORE] Revisando tienda automática..."
        );

        const items =
            await obtenerTiendaLimited();

        if (
            !items ||
            items.length === 0
        ) {

            console.log(
                "[RUST STORE] No se detectaron artículos Limited. No se publica nada."
            );

            return;
        }

        const firmaActual =
            generarFirmaTienda(
                items
            );

        console.log(
            `[RUST STORE] Firma actual: ${firmaActual}`
        );

        const configs =
            await ServerConfig.find({
                rustStoreEnabled: true,

                rustStoreChannelId: {
                    $ne: null
                }
            });

        console.log(
            `[RUST STORE] Servidores con tienda automática: ${configs.length}`
        );

        for (
            const config of configs
        ) {

            try {

                if (
                    !config.guildId ||
                    !config.rustStoreChannelId
                ) {
                    continue;
                }

                const guild =
                    client.guilds.cache.get(
                        config.guildId
                    );

                if (!guild) {

                    console.warn(
                        `[RUST STORE] Guild ${config.guildId} no está disponible.`
                    );

                    continue;
                }

                const channel =
                    guild.channels.cache.get(
                        config.rustStoreChannelId
                    );

                if (
                    !channel ||
                    typeof channel.send !==
                        "function"
                ) {

                    console.warn(
                        `[RUST STORE] Canal ${config.rustStoreChannelId} no disponible en ${guild.name}.`
                    );

                    continue;
                }

                // =====================================
                // PRIMERA EJECUCIÓN
                //
                // Solo establece la referencia.
                // NO SPAMEA LA TIENDA ACTUAL.
                // =====================================

                if (
                    !config.rustStoreLastSignature
                ) {

                    config.rustStoreLastSignature =
                        firmaActual;

                    await config.save();

                    console.log(
                        `[RUST STORE] ${guild.name}: firma inicial guardada. No se publica la tienda actual.`
                    );

                    continue;
                }

                // =====================================
                // TIENDA SIN CAMBIOS
                // =====================================

                if (
                    config.rustStoreLastSignature ===
                    firmaActual
                ) {

                    console.log(
                        `[RUST STORE] ${guild.name}: tienda sin cambios.`
                    );

                    continue;
                }

                // =====================================
                // TIENDA NUEVA
                // =====================================

                console.log(
                    `[RUST STORE] ${guild.name}: ¡NUEVA TIENDA DETECTADA!`
                );

                console.log(
                    `[RUST STORE] Antigua: ${config.rustStoreLastSignature}`
                );

                console.log(
                    `[RUST STORE] Nueva: ${firmaActual}`
                );

                await publicarTiendaEnCanal(
                    channel,
                    items
                );

                // =====================================
                // GUARDAR SOLO DESPUÉS DE PUBLICAR
                // CORRECTAMENTE
                // =====================================

                config.rustStoreLastSignature =
                    firmaActual;

                await config.save();

                console.log(
                    `[RUST STORE] ${guild.name}: nueva tienda publicada y firma guardada.`
                );

            } catch (error) {

                console.error(
                    `[RUST STORE] Error procesando servidor ${config.guildId}:`,
                    error
                );

                // No actualizamos la firma si hubo error.
                // Así la próxima revisión vuelve a intentar.
            }
        }

    } catch (error) {

        console.error(
            "[RUST STORE] Error en revisión automática:",
            error
        );

    } finally {

        tiendaRevisando = false;
    }
}

// =====================================================
// INICIAR TIENDA AUTOMÁTICA
// =====================================================

function iniciarTiendaAutomatica(
    client
) {

    console.log(
        "🛒 [RUST STORE] Sistema automático iniciado."
    );

    // Primera revisión inmediata.
    revisarTiendaAutomatica(
        client
    );

    // Después cada 10 minutos.
    setInterval(
        () => {

            revisarTiendaAutomatica(
                client
            );

        },
        CHECK_INTERVAL
    );

    console.log(
        `🛒 [RUST STORE] Próximas comprobaciones cada ${CHECK_INTERVAL / 60000} minutos.`
    );
}

// =====================================================
// EXPORT
// =====================================================

module.exports = {

    obtenerTiendaLimited,

    publicarTiendaManual,

    publicarTiendaEnCanal,

    revisarTiendaAutomatica,

    iniciarTiendaAutomatica

};