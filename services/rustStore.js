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

const STEAM_LIMITED_URL =
    "https://store.steampowered.com/itemstore/252490/browse/?filter=Limited";

const STEAM_AJAX_URL =
    "https://store.steampowered.com/itemstore/252490/ajaxgetitemdefs";

const STEAM_DETAIL_URL =
    "https://store.steampowered.com/itemstore/252490/detail/";

const CHECK_INTERVAL =
    10 * 60 * 1000;

const REQUEST_DELAY =
    250;

const REQUEST_TIMEOUT =
    30000;

let tiendaRevisando = false;

// =====================================================
// HEADERS
// =====================================================

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36",
    "Accept-Language":
        "en-US,en;q=0.9"
};

// =====================================================
// DELAY
// =====================================================

function esperar(ms) {
    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}

// =====================================================
// OBTENER HTML
// =====================================================

async function obtenerHTML(url) {

    const response =
        await axios.get(
            url,
            {
                headers: HEADERS,
                timeout: REQUEST_TIMEOUT
            }
        );

    return response.data;
}

// =====================================================
// EXTRAER ID DESDE LINK
// =====================================================

function extraerIDItem(href) {

    if (!href) {
        return null;
    }

    const match =
        String(href).match(
            /\/itemstore\/252490\/detail\/(\d+)/
        );

    if (!match) {
        return null;
    }

    return match[1];
}

// =====================================================
// EXTRAER IDS DESDE HTML
// =====================================================

function extraerIDsDesdeHTML(html) {

    const $ =
        cheerio.load(html);

    const ids =
        new Set();

    $("a").each(
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

    // También buscamos IDs en atributos/data por si Steam
    // cambia la estructura de los enlaces.
    $("[data-itemid], [data-item-id], [data-defid], [data-item]").each(
        (_, elemento) => {

            const atributos = [
                "data-itemid",
                "data-item-id",
                "data-defid",
                "data-item"
            ];

            for (const atributo of atributos) {

                const valor =
                    $(elemento).attr(atributo);

                if (!valor) {
                    continue;
                }

                const match =
                    String(valor).match(
                        /\b(\d{3,})\b/
                    );

                if (match) {
                    ids.add(match[1]);
                }
            }
        }
    );

    return [...ids];
}

// =====================================================
// PAGINACIÓN REAL DE STEAM CON CHROME
// =====================================================

async function obtenerIDsLimitedConChrome() {

    let puppeteer;

    try {
        puppeteer =
            require("puppeteer");
    } catch (error) {

        console.error(
            "[RUST STORE] ❌ Puppeteer no está disponible."
        );

        return [];
    }

    let browser = null;
    let page = null;

    try {

        console.log(
            "[RUST STORE] Abriendo Steam Limited con Chrome..."
        );

        // =================================================
        // CONECTAR AL CHROME EXISTENTE
        // =================================================

        try {

            browser =
                await puppeteer.connect({
                    browserURL:
                        "http://127.0.0.1:9222",
                    defaultViewport: null
                });

        } catch (error) {

            console.log(
                "[RUST STORE] Chrome en 9222 no disponible. Lanzando navegador propio..."
            );

            browser =
                await puppeteer.launch({
                    headless: true,
                    args: [
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage"
                    ]
                });
        }

        page =
            await browser.newPage();

        await page.setUserAgent(
            HEADERS["User-Agent"]
        );

        await page.setExtraHTTPHeaders({
            "Accept-Language":
                "en-US,en;q=0.9"
        });

        await page.goto(
            STEAM_LIMITED_URL,
            {
                waitUntil:
                    "networkidle2",
                timeout:
                    60000
            }
        );

        await esperar(2000);

        const ids =
            new Set();

        // =================================================
        // FUNCIÓN PARA OBTENER IDS DEL DOM
        // =================================================

        async function recogerIDsDOM() {

            const encontrados =
                await page.evaluate(() => {

                    const resultado =
                        new Set();

                    // Links normales de detalle
                    document
                        .querySelectorAll(
                            'a[href*="/itemstore/252490/detail/"]'
                        )
                        .forEach(elemento => {

                            const href =
                                elemento.href || "";

                            const match =
                                href.match(
                                    /\/itemstore\/252490\/detail\/(\d+)/
                                );

                            if (match) {
                                resultado.add(
                                    match[1]
                                );
                            }
                        });

                    // Data attributes
                    document
                        .querySelectorAll(
                            "[data-itemid], [data-item-id], [data-defid]"
                        )
                        .forEach(elemento => {

                            const valores = [
                                elemento.getAttribute(
                                    "data-itemid"
                                ),
                                elemento.getAttribute(
                                    "data-item-id"
                                ),
                                elemento.getAttribute(
                                    "data-defid"
                                )
                            ];

                            for (
                                const valor
                                of valores
                            ) {

                                if (!valor) {
                                    continue;
                                }

                                const match =
                                    String(valor).match(
                                        /\b(\d{3,})\b/
                                    );

                                if (match) {
                                    resultado.add(
                                        match[1]
                                    );
                                }
                            }
                        });

                    return [...resultado];
                });

            for (const id of encontrados) {
                ids.add(id);
            }

            console.log(
                `[RUST STORE] IDs acumulados en Chrome: ${ids.size}`
            );

            if (encontrados.length) {

                console.log(
                    `[RUST STORE] IDs encontrados en esta página: ${encontrados.join(", ")}`
                );
            }
        }

        // =================================================
        // PRIMERA PÁGINA
        // =================================================

        await recogerIDsDOM();

        // =================================================
        // DESCUBRIR BOTONES DE PAGINACIÓN
        // =================================================

        const paginas =
            await page.evaluate(() => {

                const resultado = [];

                const elementos =
                    document.querySelectorAll(
                        "a, button, div"
                    );

                for (const elemento of elementos) {

                    const texto =
                        (elemento.innerText || "")
                            .trim();

                    const href =
                        elemento.getAttribute(
                            "href"
                        ) || "";

                    // Detectamos anchors tipo #p1, #p2...
                    const match =
                        href.match(
                            /#p(\d+)$/i
                        );

                    if (match) {

                        resultado.push({
                            tipo: "anchor",
                            pagina:
                                Number(match[1]),
                            texto,
                            href
                        });

                        continue;
                    }

                    // Detectamos botones numerados
                    if (
                        /^\d+$/.test(texto) &&
                        Number(texto) >= 1 &&
                        Number(texto) <= 100
                    ) {

                        resultado.push({
                            tipo: "numero",
                            pagina:
                                Number(texto),
                            texto,
                            href
                        });
                    }
                }

                return resultado;
            });

        const paginasUnicas =
            [
                ...new Map(
                    paginas.map(
                        pagina => [
                            pagina.pagina,
                            pagina
                        ]
                    )
                ).values()
            ]
                .sort(
                    (a, b) =>
                        a.pagina - b.pagina
                );

        console.log(
            "[RUST STORE] Paginación detectada:",
            paginasUnicas
        );

        // =================================================
        // INTENTAR PAGINACIÓN
        // =================================================

        const visitadas =
            new Set();

        visitadas.add(1);

        for (
            const pagina
            of paginasUnicas
        ) {

            if (
                pagina.pagina <= 1 ||
                visitadas.has(
                    pagina.pagina
                )
            ) {
                continue;
            }

            try {

                console.log(
                    `[RUST STORE] Intentando abrir página ${pagina.pagina}...`
                );

                const antes =
                    [...ids];

                // -----------------------------------------
                // PRIMERO: buscar href #pN
                // -----------------------------------------

                let selector =
                    `a[href$="#p${pagina.pagina}"]`;

                let elemento =
                    await page.$(selector);

                // -----------------------------------------
                // SEGUNDO: buscar elemento con texto
                // -----------------------------------------

                if (!elemento) {

                    const candidatos =
                        await page.$$("a, button");

                    for (
                        const candidato
                        of candidatos
                    ) {

                        const texto =
                            await candidato.evaluate(
                                el =>
                                    (el.innerText || "")
                                        .trim()
                            );

                        if (
                            texto ===
                            String(
                                pagina.pagina
                            )
                        ) {

                            elemento =
                                candidato;

                            break;
                        }
                    }
                }

                if (!elemento) {

                    console.log(
                        `[RUST STORE] No se encontró botón para página ${pagina.pagina}.`
                    );

                    continue;
                }

                await elemento.click();

                await esperar(1500);

                // Esperamos a que cambie el DOM
                try {

                    await page.waitForFunction(
                        (idsAntes) => {

                            const actual =
                                [
                                    ...document.querySelectorAll(
                                        'a[href*="/itemstore/252490/detail/"]'
                                    )
                                ]
                                    .map(
                                        el => {

                                            const match =
                                                (
                                                    el.href ||
                                                    ""
                                                ).match(
                                                    /\/itemstore\/252490\/detail\/(\d+)/
                                                );

                                            return match
                                                ? match[1]
                                                : null;
                                        }
                                    )
                                    .filter(Boolean);

                            return actual.some(
                                id =>
                                    !idsAntes.includes(
                                        id
                                    )
                            );
                        },
                        {
                            timeout: 5000
                        },
                        antes
                    );

                } catch (_) {
                    // No pasa nada: igual recogemos DOM
                }

                await recogerIDsDOM();

                visitadas.add(
                    pagina.pagina
                );

            } catch (error) {

                console.error(
                    `[RUST STORE] Error abriendo página ${pagina.pagina}:`,
                    error.message
                );
            }
        }

        // =================================================
        // SEGUNDO INTENTO: BUSCAR "NEXT"
        // =================================================

        let intentosNext = 0;

        while (
            intentosNext < 20
        ) {

            intentosNext++;

            const idsAntes =
                [...ids];

            const siguiente =
                await page.evaluate(() => {

                    const elementos =
                        document.querySelectorAll(
                            "a, button"
                        );

                    for (
                        const elemento
                        of elementos
                    ) {

                        const texto =
                            (
                                elemento.innerText ||
                                elemento.textContent ||
                                ""
                            )
                                .trim()
                                .toLowerCase();

                        const aria =
                            (
                                elemento.getAttribute(
                                    "aria-label"
                                ) || ""
                            )
                                .trim()
                                .toLowerCase();

                        const title =
                            (
                                elemento.getAttribute(
                                    "title"
                                ) || ""
                            )
                                .trim()
                                .toLowerCase();

                        if (
                            texto === ">" ||
                            texto === "›" ||
                            texto === "»" ||
                            texto === "next" ||
                            texto === "siguiente" ||
                            aria === "next" ||
                            aria === "siguiente" ||
                            title === "next" ||
                            title === "siguiente"
                        ) {

                            return true;
                        }
                    }

                    return false;
                });

            if (!siguiente) {
                break;
            }

            const elemento =
                await page.evaluateHandle(() => {

                    const elementos =
                        document.querySelectorAll(
                            "a, button"
                        );

                    for (
                        const elemento
                        of elementos
                    ) {

                        const texto =
                            (
                                elemento.innerText ||
                                elemento.textContent ||
                                ""
                            )
                                .trim()
                                .toLowerCase();

                        const aria =
                            (
                                elemento.getAttribute(
                                    "aria-label"
                                ) || ""
                            )
                                .trim()
                                .toLowerCase();

                        const title =
                            (
                                elemento.getAttribute(
                                    "title"
                                ) || ""
                            )
                                .trim()
                                .toLowerCase();

                        if (
                            texto === ">" ||
                            texto === "›" ||
                            texto === "»" ||
                            texto === "next" ||
                            texto === "siguiente" ||
                            aria === "next" ||
                            aria === "siguiente" ||
                            title === "next" ||
                            title === "siguiente"
                        ) {
                            return elemento;
                        }
                    }

                    return null;
                });

            const elementoJS =
                elemento.asElement();

            if (!elementoJS) {
                break;
            }

            try {

                await elementoJS.click();

            } catch (_) {

                break;
            }

            await esperar(1500);

            await recogerIDsDOM();

            const cambiaron =
                ids.size >
                idsAntes.length;

            if (!cambiaron) {
                break;
            }
        }

        console.log(
            `[RUST STORE] TOTAL IDS DETECTADOS CON CHROME: ${ids.size}`
        );

        console.log(
            `[RUST STORE] IDS LIMITED: ${[...ids].join(", ")}`
        );

        return [...ids];

    } catch (error) {

        console.error(
            "[RUST STORE] ❌ Error leyendo Steam con Chrome:",
            error
        );

        return [];

    } finally {

        try {

            if (page) {
                await page.close();
            }

        } catch (_) {}

        // Si nos conectamos al Chrome existente NO lo cerramos.
        // Si se lanzó uno propio, tampoco es crítico mantenerlo.
    }
}

// =====================================================
// AJAX - SOLO PARA ENRIQUECER
// =====================================================

async function obtenerDatosAjax() {

    try {

        console.log(
            "[RUST STORE] Consultando ajaxgetitemdefs..."
        );

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
                    headers: HEADERS,
                    timeout: REQUEST_TIMEOUT
                }
            );

        console.log(
            "[RUST STORE] AJAX keys:",
            Object.keys(
                response.data || {}
            )
        );

        return response.data;

    } catch (error) {

        console.error(
            "[RUST STORE] ❌ Error AJAX:",
            error.message
        );

        return null;
    }
}

// =====================================================
// BUSCAR DATOS AJAX DE UN ID
// =====================================================

function buscarDatosEnAjax(
    ajax,
    id
) {

    if (!ajax) {
        return null;
    }

    const objetivo =
        String(id);

    const posibles =
        [];

    function recorrer(
        valor,
        profundidad = 0
    ) {

        if (
            profundidad > 8 ||
            valor == null
        ) {
            return;
        }

        if (
            typeof valor ===
            "object"
        ) {

            if (
                !Array.isArray(valor)
            ) {

                for (
                    const [clave, dato]
                    of Object.entries(
                        valor
                    )
                ) {

                    if (
                        String(clave) ===
                        objetivo
                    ) {

                        posibles.push(
                            dato
                        );
                    }

                    recorrer(
                        dato,
                        profundidad + 1
                    );
                }

            } else {

                for (
                    const dato
                    of valor
                ) {

                    recorrer(
                        dato,
                        profundidad + 1
                    );
                }
            }
        }
    }

    recorrer(ajax);

    return posibles[0] || null;
}

// =====================================================
// EXTRAER NOMBRE
// =====================================================

function extraerNombreObjeto(
    objeto
) {

    if (!objeto) {
        return null;
    }

    const campos = [
        "name",
        "display_name",
        "item_name",
        "title",
        "localized_name"
    ];

    for (
        const campo
        of campos
    ) {

        if (
            typeof objeto[campo] ===
            "string" &&
            objeto[campo].trim()
        ) {

            return objeto[campo]
                .trim();
        }
    }

    return null;
}

// =====================================================
// EXTRAER IMAGEN
// =====================================================

function extraerImagenObjeto(
    objeto
) {

    if (!objeto) {
        return null;
    }

    const campos = [
        "image",
        "image_url",
        "imageurl",
        "icon",
        "icon_url",
        "large_image",
        "large_image_url"
    ];

    for (
        const campo
        of campos
    ) {

        if (
            typeof objeto[campo] ===
            "string" &&
            /^https?:\/\//i.test(
                objeto[campo]
            )
        ) {

            return objeto[campo];
        }
    }

    return null;
}

// =====================================================
// EXTRAER PRECIO
// =====================================================

function extraerPrecioObjeto(
    objeto
) {

    if (!objeto) {
        return null;
    }

    const campos = [
        "price",
        "price_text",
        "formatted_price",
        "final_price"
    ];

    for (
        const campo
        of campos
    ) {

        if (
            typeof objeto[campo] ===
            "string" &&
            objeto[campo].trim()
        ) {

            return objeto[campo]
                .trim();
        }

        if (
            typeof objeto[campo] ===
            "number"
        ) {

            return `$${(
                objeto[campo] /
                100
            ).toFixed(2)}`;
        }
    }

    return null;
}

// =====================================================
// DETALLE DEL ITEM
// =====================================================

async function obtenerDetalle(
    id,
    ajax
) {

    const url =
        `${STEAM_DETAIL_URL}${id}/`;

    try {

        const html =
            await obtenerHTML(
                url
            );

        const $ =
            cheerio.load(html);

        let nombre = null;
        let imagen = null;
        let precio = null;

        // -------------------------------------------------
        // NOMBRE
        // -------------------------------------------------

        const selectoresNombre = [
            ".itemstore_item_name",
            ".itemstore_item_title",
            ".item_desc_title",
            ".item_name",
            "h1",
            "h2"
        ];

        for (
            const selector
            of selectoresNombre
        ) {

            const texto =
                $(selector)
                    .first()
                    .text()
                    .trim();

            if (texto) {

                nombre =
                    texto;

                break;
            }
        }

        // -------------------------------------------------
        // IMAGEN
        // -------------------------------------------------

        const imagenes =
            $("img");

        imagenes.each(
            (_, elemento) => {

                if (imagen) {
                    return;
                }

                const src =
                    $(elemento)
                        .attr("src");

                const dataSrc =
                    $(elemento)
                        .attr(
                            "data-src"
                        );

                const candidata =
                    src ||
                    dataSrc;

                if (
                    candidata &&
                    /^https?:\/\//i.test(
                        candidata
                    )
                ) {

                    if (
                        !/avatar/i.test(
                            candidata
                        ) &&
                        !/logo/i.test(
                            candidata
                        )
                    ) {

                        imagen =
                            candidata;
                    }
                }
            }
        );

        // -------------------------------------------------
        // PRECIO
        // -------------------------------------------------

        const selectoresPrecio = [
            ".itemstore_item_price",
            ".item_price",
            ".price",
            ".purchase_item_price"
        ];

        for (
            const selector
            of selectoresPrecio
        ) {

            const texto =
                $(selector)
                    .first()
                    .text()
                    .trim();

            if (texto) {

                precio =
                    texto;

                break;
            }
        }

        // -------------------------------------------------
        // JSON / AJAX COMO RESPALDO
        // -------------------------------------------------

        const datosAjax =
            buscarDatosEnAjax(
                ajax,
                id
            );

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

        // -------------------------------------------------
        // FALLBACK DE META
        // -------------------------------------------------

        if (!nombre) {

            const metaNombre =
                $('meta[property="og:title"]')
                    .attr("content");

            if (metaNombre) {
                nombre =
                    metaNombre
                        .replace(
                            /\s*-\s*Rust.*$/i,
                            ""
                        )
                        .trim();
            }
        }

        if (!imagen) {

            const metaImagen =
                $('meta[property="og:image"]')
                    .attr("content");

            if (
                metaImagen &&
                /^https?:\/\//i.test(
                    metaImagen
                )
            ) {

                imagen =
                    metaImagen;
            }
        }

        if (!precio) {

            const textoCompleto =
                $("body")
                    .text();

            const match =
                textoCompleto.match(
                    /\$\s*\d+(?:[.,]\d{2})?/
                );

            if (match) {
                precio =
                    match[0]
                        .replace(
                            /\s+/g,
                            ""
                        );
            }
        }

        return {
            id,
            nombre:
                nombre || null,
            imagen:
                imagen || null,
            precio:
                precio || null,
            url
        };

    } catch (error) {

        console.error(
            `[RUST STORE] Error obteniendo detail ${id}:`,
            error.message
        );

        return {
            id,
            nombre: null,
            imagen: null,
            precio: null,
            url
        };
    }
}

// =====================================================
// OBTENER TIENDA LIMITED COMPLETA
// =====================================================

async function obtenerTiendaLimited() {

    console.log(
        "\n[RUST STORE] ========================================"
    );

    console.log(
        "[RUST STORE] CONSULTANDO TIENDA LIMITED"
    );

    console.log(
        "[RUST STORE] ========================================"
    );

    // =================================================
    // 1. CHROME ES LA FUENTE DE VERDAD
    // =================================================

    let ids =
        await obtenerIDsLimitedConChrome();

    // =================================================
    // FALLBACK HTML SI CHROME NO OBTUVO NADA
    // =================================================

    if (
        !ids.length
    ) {

        console.log(
            "[RUST STORE] Chrome no devolvió IDs. Probando HTML directo..."
        );

        try {

            const html =
                await obtenerHTML(
                    STEAM_LIMITED_URL
                );

            ids =
                extraerIDsDesdeHTML(
                    html
                );

            console.log(
                `[RUST STORE] IDs detectados en HTML directo: ${ids.length}`
            );

        } catch (error) {

            console.error(
                "[RUST STORE] Error obteniendo HTML:",
                error.message
            );
        }
    }

    ids =
        [
            ...new Set(
                ids
                    .filter(Boolean)
                    .map(
                        id => String(id)
                    )
            )
        ];

    if (
        !ids.length
    ) {

        console.error(
            "[RUST STORE] ❌ NO SE DETECTARON ITEMS LIMITED."
        );

        return [];
    }

    console.log(
        `[RUST STORE] TOTAL IDS LIMITED REALES DETECTADOS: ${ids.length}`
    );

    console.log(
        `[RUST STORE] IDS LIMITED: ${ids.join(", ")}`
    );

    // =================================================
    // 2. AJAX SOLO COMO ENRIQUECIMIENTO
    // =================================================

    const ajax =
        await obtenerDatosAjax();

    // =================================================
    // 3. OBTENER DETALLES
    // =================================================

    const items =
        [];

    for (
        const id
        of ids
    ) {

        const item =
            await obtenerDetalle(
                id,
                ajax
            );

        console.log(
            `[RUST STORE] Detail ${id}: ` +
            `${item.nombre || "SIN NOMBRE"} | ` +
            `${item.precio || "SIN PRECIO"} | ` +
            `${item.imagen ? "IMAGEN OK" : "SIN IMAGEN"}`
        );

        if (
            item.nombre
        ) {

            items.push(
                item
            );
        }

        await esperar(
            REQUEST_DELAY
        );
    }

    // =================================================
    // 4. ELIMINAR DUPLICADOS
    // =================================================

    const finales =
        [
            ...new Map(
                items.map(
                    item => [
                        item.id,
                        item
                    ]
                )
            ).values()
        ];

    console.log(
        `[RUST STORE] DATOS FINALES: ` +
        `${finales.length}/${ids.length} con nombre, ` +
        `${finales.filter(i => i.imagen).length}/${ids.length} con imagen, ` +
        `${finales.filter(i => i.precio).length}/${ids.length} con precio.`
    );

    console.log(
        `[RUST STORE] TOTAL FINAL: ${finales.length} artículos Limited encontrados.`
    );

    return finales;
}

// =====================================================
// EMBED
// =====================================================

function crearMensajeItem(
    item
) {

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🛒 ${item.nombre}`
            )
            .setURL(
                item.url
            )
            .setDescription(
                `💰 **Precio:** ${item.precio || "No disponible"}`
            )
            .setFooter({
                text:
                    "Rust Store • Steam"
            });

    if (item.imagen) {

        embed.setImage(
            item.imagen
        );
    }

    const botones =
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
                        item.url
                    )
            );

    return {
        embeds: [
            embed
        ],
        components: [
            botones
        ]
    };
}

// =====================================================
// PUBLICAR TIENDA
// =====================================================

async function publicarTiendaEnCanal(
    channel,
    items
) {

    if (
        !channel ||
        !items ||
        !items.length
    ) {

        return false;
    }

    console.log(
        `[RUST STORE] Publicando ${items.length} artículos...`
    );

    for (
        const item
        of items
    ) {

        try {

            await channel.send(
                crearMensajeItem(
                    item
                )
            );

            await esperar(
                500
            );

        } catch (error) {

            console.error(
                `[RUST STORE] Error publicando ${item.id}:`,
                error.message
            );

            return false;
        }
    }

    return true;
}

// =====================================================
// PUBLICACIÓN MANUAL /TIENDA
// =====================================================

async function publicarTiendaManual(
    interaction
) {

    console.log(
        "🎯 Ejecutando /tienda"
    );

    try {

        const items =
            await obtenerTiendaLimited();

        if (
            !items.length
        ) {

            return await interaction.editReply(
                "❌ No se pudieron encontrar artículos Limited en la tienda de Rust."
            );
        }

        console.log(
            `[RUST STORE] Publicando ${items.length} artículos...`
        );

        // Primer mensaje: respuesta del comando
        await interaction.editReply(
            crearMensajeItem(
                items[0]
            )
        );

        // Resto: mensajes normales
        for (
            let i = 1;
            i < items.length;
            i++
        ) {

            await interaction.channel.send(
                crearMensajeItem(
                    items[i]
                )
            );

            await esperar(
                500
            );
        }

        return true;

    } catch (error) {

        console.error(
            "❌ ERROR /TIENDA:",
            error
        );

        try {

            await interaction.editReply(
                "❌ Ocurrió un error obteniendo la tienda de Rust."
            );

        } catch (_) {}

        return false;
    }
}

// =====================================================
// FIRMA DE LA TIENDA
// =====================================================

function generarFirmaTienda(
    items
) {

    const ids =
        items
            .map(
                item =>
                    String(item.id)
            )
            .sort(
                (a, b) =>
                    a.localeCompare(
                        b
                    )
            )
            .join("|");

    return crypto
        .createHash("sha256")
        .update(ids)
        .digest("hex");
}

// =====================================================
// REVISIÓN AUTOMÁTICA
// =====================================================

async function revisarTiendaAutomatica(
    client
) {

    if (tiendaRevisando) {

        console.log(
            "[RUST STORE] Ya hay una revisión en curso. Saltando..."
        );

        return;
    }

    tiendaRevisando = true;

    try {

        console.log(
            "\n[RUST STORE] 🔎 Comprobando tienda Limited..."
        );

        const items =
            await obtenerTiendaLimited();

        if (
            !items.length
        ) {

            console.log(
                "[RUST STORE] No se obtuvieron artículos. No se modifica la firma."
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
                    $exists: true,
                    $ne: null
                }
            });

        if (
            !configs.length
        ) {

            console.log(
                "[RUST STORE] No hay servidores con tienda automática activada."
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
                        config.rustStoreChannelId
                    );

                if (
                    !channel ||
                    !channel.isTextBased()
                ) {

                    console.log(
                        `[RUST STORE] Canal no encontrado para ${guild.name}`
                    );

                    continue;
                }

                // =========================================
                // PRIMERA EJECUCIÓN
                // =========================================

                if (
                    !config.rustStoreLastSignature
                ) {

                    console.log(
                        `[RUST STORE] Primera revisión para ${guild.name}. Guardando firma sin publicar.`
                    );

                    config.rustStoreLastSignature =
                        firmaActual;

                    await config.save();

                    continue;
                }

                // =========================================
                // TIENDA SIN CAMBIOS
                // =========================================

                if (
                    config.rustStoreLastSignature ===
                    firmaActual
                ) {

                    console.log(
                        `[RUST STORE] ${guild.name}: tienda sin cambios.`
                    );

                    continue;
                }

                // =========================================
                // NUEVA TIENDA
                // =========================================

                console.log(
                    `[RUST STORE] 🚨 NUEVA TIENDA DETECTADA PARA ${guild.name}`
                );

                const publicada =
                    await publicarTiendaEnCanal(
                        channel,
                        items
                    );

                if (!publicada) {

                    console.log(
                        `[RUST STORE] ❌ No se pudo publicar completa la tienda para ${guild.name}.`
                    );

                    continue;
                }

                // Guardar firma SOLO después de publicar
                config.rustStoreLastSignature =
                    firmaActual;

                await config.save();

                console.log(
                    `[RUST STORE] ✅ Firma actualizada para ${guild.name}.`
                );

            } catch (error) {

                console.error(
                    `[RUST STORE] Error procesando servidor ${config.guildId}:`,
                    error
                );
            }
        }

    } catch (error) {

        console.error(
            "[RUST STORE] ❌ Error en revisión automática:",
            error
        );

    } finally {

        tiendaRevisando = false;
    }
}

// =====================================================
// INICIAR AUTOMATIZACIÓN
// =====================================================

function iniciarTiendaAutomatica(
    client
) {

    console.log(
        "[RUST STORE] Sistema automático iniciado."
    );

    console.log(
        `[RUST STORE] Intervalo: ${CHECK_INTERVAL / 60000} minutos`
    );

    // Primera comprobación
    revisarTiendaAutomatica(
        client
    ).catch(
        error =>
            console.error(
                "[RUST STORE] Error en primera revisión:",
                error
            )
    );

    // Revisiones periódicas
    setInterval(
        () => {

            revisarTiendaAutomatica(
                client
            ).catch(
                error =>
                    console.error(
                        "[RUST STORE] Error en revisión automática:",
                        error
                    )
            );

        },
        CHECK_INTERVAL
    );
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
    obtenerTiendaLimited,
    publicarTiendaManual,
    publicarTiendaEnCanal,
    revisarTiendaAutomatica,
    iniciarTiendaAutomatica
};