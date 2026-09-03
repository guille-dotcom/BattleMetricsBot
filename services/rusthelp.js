const axios = require("axios");
const cheerio = require("cheerio");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BASE_URL = "https://rusthelp.com/es-ES/items";

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/120.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9," +
        "image/avif,image/webp,image/apng,*/*;q=0.8",

    "Accept-Language":
        "es-ES,es;q=0.9,en;q=0.8",

    "Cache-Control":
        "no-cache",

    "Pragma":
        "no-cache"
};

// =====================================================
// NORMALIZACIÓN
// =====================================================

function normalizarTexto(texto) {

    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function limpiarTexto(texto) {

    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

// =====================================================
// ALIAS
// =====================================================

const ALIASES = {

    // ==========================================
    // TOOL CUPBOARD
    // ==========================================

    "tc": "tool-cupboard",
    "tool cupboard": "tool-cupboard",
    "tool-cupboard": "tool-cupboard",
    "armario": "tool-cupboard",
    "armario de herramientas": "tool-cupboard",

    // ==========================================
    // PUERTAS
    // ==========================================

    "wood door": "wooden-door",
    "wooden door": "wooden-door",
    "wood door rust": "wooden-door",
    "puerta de madera": "wooden-door",
    "puerta simple de madera": "wooden-door",

    "sheet metal door": "sheet-metal-door",
    "sheet metal": "sheet-metal-door",
    "puerta de chapa": "sheet-metal-door",
    "puerta metalica": "sheet-metal-door",
    "puerta metálica": "sheet-metal-door",
    "puerta simple de chapa": "sheet-metal-door",

    "armored door": "armored-door",
    "puerta blindada": "armored-door",
    "puerta blindada de metal": "armored-door",

    "garage door": "garage-door",
    "puerta de garaje": "garage-door",

    // ==========================================
    // OTRAS
    // ==========================================

    "small wood box": "small-wood-box",
    "caja pequeña de madera": "small-wood-box",

    "large wood box": "large-wood-box",
    "caja grande de madera": "large-wood-box",

    "tool cupboard": "tool-cupboard"
};

// =====================================================
// SLUG
// =====================================================

function obtenerSlug(nombre) {

    const normalizado =
        normalizarTexto(nombre);

    if (!normalizado) {
        return null;
    }

    if (
        ALIASES[normalizado]
    ) {
        return ALIASES[normalizado];
    }

    return normalizado
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

// =====================================================
// IMAGEN
// =====================================================

function convertirUrlImagen(url) {

    if (!url) {
        return "";
    }

    let resultado =
        String(url).trim();

    if (!resultado) {
        return "";
    }

    // Quitar posibles comillas
    resultado =
        resultado
            .replace(/^["']+/, "")
            .replace(/["']+$/, "");

    // URL protocol-relative
    if (
        resultado.startsWith("//")
    ) {
        resultado =
            "https:" + resultado;
    }

    // URL relativa
    if (
        resultado.startsWith("/")
    ) {
        resultado =
            "https://rusthelp.com" +
            resultado;
    }

    if (
        !/^https?:\/\//i.test(
            resultado
        )
    ) {
        return "";
    }

    return resultado;
}

function obtenerImagenRustHelp(
    $,
    html
) {

    // =================================================
    // 1. OG IMAGE
    // =================================================

    const ogImage =
        $('meta[property="og:image"]')
            .first()
            .attr("content");

    if (ogImage) {

        const imagen =
            convertirUrlImagen(
                ogImage
            );

        if (imagen) {
            return imagen;
        }
    }

    // =================================================
    // 2. TWITTER IMAGE
    // =================================================

    const twitterImage =
        $('meta[name="twitter:image"]')
            .first()
            .attr("content");

    if (twitterImage) {

        const imagen =
            convertirUrlImagen(
                twitterImage
            );

        if (imagen) {
            return imagen;
        }
    }

    // =================================================
    // 3. META ITEMPROP IMAGE
    // =================================================

    const metaImage =
        $('meta[itemprop="image"]')
            .first()
            .attr("content");

    if (metaImage) {

        const imagen =
            convertirUrlImagen(
                metaImage
            );

        if (imagen) {
            return imagen;
        }
    }

    // =================================================
    // 4. JSON-LD
    // =================================================

    let imagenJsonLd = "";

    $('script[type="application/ld+json"]').each(
        (_, elemento) => {

            if (imagenJsonLd) {
                return;
            }

            const contenido =
                $(elemento).html();

            if (!contenido) {
                return;
            }

            try {

                const datos =
                    JSON.parse(
                        contenido
                    );

                const revisarObjeto =
                    objeto => {

                        if (
                            !objeto ||
                            typeof objeto !== "object"
                        ) {
                            return;
                        }

                        if (
                            typeof objeto.image === "string"
                        ) {

                            imagenJsonLd =
                                objeto.image;

                            return;
                        }

                        if (
                            Array.isArray(
                                objeto.image
                            ) &&
                            objeto.image.length
                        ) {

                            imagenJsonLd =
                                objeto.image[0];

                            return;
                        }

                        if (
                            objeto["@graph"] &&
                            Array.isArray(
                                objeto["@graph"]
                            )
                        ) {

                            for (
                                const item
                                of objeto["@graph"]
                            ) {

                                if (
                                    item &&
                                    item.image
                                ) {

                                    if (
                                        typeof item.image === "string"
                                    ) {

                                        imagenJsonLd =
                                            item.image;

                                        return;
                                    }

                                    if (
                                        Array.isArray(
                                            item.image
                                        ) &&
                                        item.image.length
                                    ) {

                                        imagenJsonLd =
                                            item.image[0];

                                        return;
                                    }
                                }
                            }
                        }
                    };

                if (Array.isArray(datos)) {

                    for (
                        const dato
                        of datos
                    ) {

                        revisarObjeto(
                            dato
                        );

                        if (
                            imagenJsonLd
                        ) {
                            break;
                        }
                    }

                } else {

                    revisarObjeto(
                        datos
                    );
                }

            } catch {
                // JSON-LD inválido, continuar
            }
        }
    );

    if (imagenJsonLd) {

        const imagen =
            convertirUrlImagen(
                imagenJsonLd
            );

        if (imagen) {
            return imagen;
        }
    }

    // =================================================
    // 5. IMÁGENES DE LA PÁGINA
    // =================================================

    const selectoresImagen = [
        'img[itemprop="image"]',
        'img[class*="item"]',
        'img[class*="Item"]',
        'img[class*="image"]',
        'img[class*="Image"]',
        "main img",
        "article img"
    ];

    for (
        const selector
        of selectoresImagen
    ) {

        const imagenes =
            $(selector);

        for (
            let i = 0;
            i < imagenes.length;
            i++
        ) {

            const img =
                imagenes.eq(i);

            const atributos = [
                "src",
                "data-src",
                "data-lazy-src",
                "data-original",
                "data-image",
                "data-image-url"
            ];

            for (
                const atributo
                of atributos
            ) {

                const valor =
                    img.attr(
                        atributo
                    );

                if (!valor) {
                    continue;
                }

                const imagen =
                    convertirUrlImagen(
                        valor
                    );

                if (imagen) {
                    return imagen;
                }
            }

            // srcset
            const srcset =
                img.attr("srcset") ||
                img.attr("data-srcset");

            if (srcset) {

                const partes =
                    srcset.split(",");

                for (
                    const parte
                    of partes
                ) {

                    const valor =
                        parte
                            .trim()
                            .split(/\s+/)[0];

                    const imagen =
                        convertirUrlImagen(
                            valor
                        );

                    if (imagen) {
                        return imagen;
                    }
                }
            }
        }
    }

    // =================================================
    // 6. BUSCAR IMAGEN EN HTML
    // =================================================

    if (html) {

        const patrones = [

            /https?:\/\/[^"'\\\s]+?\.(?:png|jpg|jpeg|webp)(?:\?[^"'\\\s]*)?/gi,

            /https?:\/\/[^"'\\\s]+\/[^"'\\\s]*image[^"'\\\s]*/gi

        ];

        for (
            const regex
            of patrones
        ) {

            const encontrados =
                html.match(
                    regex
                );

            if (!encontrados) {
                continue;
            }

            for (
                const encontrada
                of encontrados
            ) {

                const imagen =
                    convertirUrlImagen(
                        encontrada
                    );

                if (
                    imagen &&
                    !imagen.includes(
                        "favicon"
                    ) &&
                    !imagen.includes(
                        "logo"
                    )
                ) {

                    return imagen;
                }
            }
        }
    }

    return "";
}

// =====================================================
// TIEMPO
// =====================================================

function convertirASegundos(
    tiempo
) {

    const texto =
        String(tiempo || "")
            .toLowerCase()
            .replace(/,/g, ".");

    if (!texto) {
        return 0;
    }

    let total = 0;

    const horas =
        texto.match(
            /(\d+(?:\.\d+)?)\s*h/
        );

    const minutos =
        texto.match(
            /(\d+(?:\.\d+)?)\s*m/
        );

    const segundos =
        texto.match(
            /(\d+(?:\.\d+)?)\s*s/
        );

    if (horas) {
        total +=
            parseFloat(
                horas[1]
            ) * 3600;
    }

    if (minutos) {
        total +=
            parseFloat(
                minutos[1]
            ) * 60;
    }

    if (segundos) {
        total +=
            parseFloat(
                segundos[1]
            );
    }

    return total;
}

function pareceTiempo(
    texto
) {

    return /\d+\s*(?:h|m|s)\b/i.test(
        String(texto || "")
    );
}

// =====================================================
// COLUMNAS Y TABLAS
// =====================================================

function obtenerColumnas(
    $,
    fila
) {

    const columnas = [];

    $(fila)
        .find("th, td")
        .each(
            (_, elemento) => {

                columnas.push(
                    limpiarTexto(
                        $(elemento).text()
                    )
                );
            }
        );

    return columnas;
}

function obtenerHeaderTabla(
    $,
    tabla
) {

    const primeraFila =
        $(tabla)
            .find("tr")
            .first();

    if (
        !primeraFila.length
    ) {
        return [];
    }

    return obtenerColumnas(
        $,
        primeraFila
    ).map(
        normalizarTexto
    );
}

function esTablaLoot(
    $,
    tabla
) {

    const headers =
        obtenerHeaderTabla(
            $,
            tabla
        );

    const texto =
        normalizarTexto(
            $(tabla)
                .text()
                .slice(0, 500)
        );

    return (

        (
            headers.includes("de") &&
            headers.includes("posibilidad") &&
            headers.includes("cantidad")
        ) ||

        (
            headers.includes("posibilidad") &&
            headers.includes("cantidad") &&
            headers.includes("estado")
        ) ||

        /looted from/.test(
            texto
        )
    );
}

function esTablaStarting(
    $,
    tabla
) {

    const headers =
        obtenerHeaderTabla(
            $,
            tabla
        );

    return (

        headers.includes(
            "starting item"
        ) ||

        (
            headers.includes(
                "time to raid"
            ) &&
            headers.includes(
                "amount"
            )
        )
    );
}

function esTablaRaidingCost(
    $,
    tabla
) {

    const headers =
        obtenerHeaderTabla(
            $,
            tabla
        );

    return (

        headers.includes(
            "herramienta de raideos"
        ) ||

        (
            headers.includes(
                "cantidad"
            ) &&
            headers.some(
                header =>
                    header.includes(
                        "tiempo para raideo"
                    )
            )
        )
    );
}

// =====================================================
// FORMATEAR HERRAMIENTA
// =====================================================

function formatearHerramienta(
    nombre
) {

    let limpio =
        limpiarTexto(nombre)
            .replace(
                /\s+Using\s+.+$/i,
                ""
            )
            .replace(
                /\s+Launched From\s+.+$/i,
                ""
            )
            .replace(
                /\s+Deployed$/i,
                ""
            )
            .replace(
                /\s+Catapult$/i,
                ""
            )
            .replace(
                /\s+Right Click Stuck$/i,
                ""
            )
            .replace(
                /\s+Left Click Throw$/i,
                ""
            )
            .replace(
                /\s+Lit$/i,
                ""
            )
            .replace(
                /\s+Cost To Repair Head$/i,
                ""
            )
            .trim();

    if (
        /5\.56|explosiva.*5\.56|calibre 5\.56/i.test(
            limpio
        )
    ) {

        return "Munición explosiva del calibre 5.56";
    }

    if (
        /40mm|lanzagranadas/i.test(
            limpio
        )
    ) {

        return "Lanzagranadas Granada explosiva de 40mm";
    }

    return limpio;
}

// =====================================================
// CATEGORÍA
// =====================================================

function obtenerCategoriaHerramienta(
    nombre
) {

    const norm =
        normalizarTexto(
            nombre
        );

    if (
        norm.includes("balista") ||
        norm.includes("proyectil")
    ) {

        return "bullet";
    }

    const esMelee =

        norm.includes("martillo") ||
        norm.includes("lucero") ||
        norm.includes("remo") ||
        norm.includes("porra") ||
        norm.includes("hacha") ||
        norm.includes("roca") ||
        norm.includes("pico") ||
        norm.includes("machete") ||
        norm.includes("cuchillo") ||
        norm.includes("espada") ||
        norm.includes("boomerang") ||
        norm.includes("antorcha");

    const esBullet =

        norm.includes("munici") ||
        norm.includes("5.56") ||
        norm.includes("pistola") ||
        norm.includes("rifle");

    if (esMelee) {
        return "melee";
    }

    if (esBullet) {
        return "bullet";
    }

    return "explosive";
}

// =====================================================
// CONSULTAR RAID
// =====================================================

async function consultarRaid(
    nombreQuery
) {

    const queryLimpia =
        limpiarTexto(
            nombreQuery
        );

    if (!queryLimpia) {
        return null;
    }

    const slug =
        obtenerSlug(
            queryLimpia
        );

    if (!slug) {
        return null;
    }

    const urlLoot =
        `${BASE_URL}/${slug}`;

    const urlRaideo =
        `${BASE_URL}/${slug}#raiding`;

    console.log(
        `🔎 RustHelp buscando: ${queryLimpia}`
    );

    console.log(
        `🔗 URL: ${urlLoot}`
    );

    try {

        const response =
            await axios.get(
                urlLoot,
                {
                    headers:
                        HEADERS,

                    timeout:
                        15000,

                    maxRedirects:
                        5,

                    validateStatus:
                        status =>
                            status >= 200 &&
                            status < 400
                }
            );

        if (
            !response ||
            !response.data
        ) {
            return null;
        }

        const html =
            String(
                response.data
            );

        const $ =
            cheerio.load(
                html
            );

        // =================================================
        // NOMBRE
        // =================================================

        let nombreObjeto =

            limpiarTexto(
                $("h1")
                    .first()
                    .text()
            ) ||

            limpiarTexto(
                $("title")
                    .first()
                    .text()
            ) ||

            queryLimpia;

        nombreObjeto =
            nombreObjeto
                .replace(
                    /\s*\|\s*RustHelp.*$/i,
                    ""
                )
                .replace(
                    /\s*-\s*RustHelp.*$/i,
                    ""
                )
                .trim();

        // =================================================
        // IMAGEN
        // =================================================

        const imagen =
            obtenerImagenRustHelp(
                $,
                html
            );

        console.log(
            imagen
                ? `🖼️ Imagen encontrada: ${imagen}`
                : "⚠️ No se encontró imagen para este objeto."
        );

        // =================================================
        // DATOS
        // =================================================

        const startingItems = [];
        const raidingCost = [];
        const dondeEncontrar = [];

        $("table").each(
            (index, tabla) => {

                // =============================================
                // LOOT
                // =============================================

                if (
                    esTablaLoot(
                        $,
                        tabla
                    )
                ) {

                    $(tabla)
                        .find("tr")
                        .each(
                            (_, fila) => {

                                const columnas =
                                    obtenerColumnas(
                                        $,
                                        fila
                                    );

                                if (
                                    columnas.length < 2
                                ) {
                                    return;
                                }

                                const primera =
                                    columnas[0];

                                if (
                                    normalizarTexto(
                                        primera
                                    ) === "de"
                                ) {
                                    return;
                                }

                                const posibilidad =
                                    columnas[1] || "";

                                const cantidad =
                                    columnas[2] || "";

                                if (!primera) {
                                    return;
                                }

                                const textoLoot =
                                    [
                                        posibilidad,
                                        cantidad
                                    ]
                                        .filter(Boolean)
                                        .join(" ");

                                const existe =
                                    dondeEncontrar.some(
                                        item =>
                                            normalizarTexto(
                                                item.herramienta
                                            ) ===
                                            normalizarTexto(
                                                primera
                                            )
                                    );

                                if (!existe) {

                                    dondeEncontrar.push({

                                        herramienta:
                                            limpiarTexto(
                                                primera
                                            ),

                                        tiempo:
                                            limpiarTexto(
                                                textoLoot
                                            )
                                    });
                                }
                            }
                        );

                    return;
                }

                // =============================================
                // STARTING ITEMS
                // =============================================

                if (
                    esTablaStarting(
                        $,
                        tabla
                    )
                ) {

                    $(tabla)
                        .find("tr")
                        .each(
                            (_, fila) => {

                                const columnas =
                                    obtenerColumnas(
                                        $,
                                        fila
                                    );

                                if (
                                    columnas.length < 2
                                ) {
                                    return;
                                }

                                const primera =
                                    columnas[0];

                                const segunda =
                                    columnas[1] || "";

                                const tercera =
                                    columnas[2] || "";

                                if (
                                    normalizarTexto(
                                        primera
                                    ).includes(
                                        "starting item"
                                    )
                                ) {
                                    return;
                                }

                                if (
                                    !primera ||
                                    !pareceTiempo(
                                        segunda
                                    )
                                ) {
                                    return;
                                }

                                if (
                                    startingItems.some(
                                        item =>
                                            normalizarTexto(
                                                item.herramienta
                                            ) ===
                                            normalizarTexto(
                                                primera
                                            )
                                    )
                                ) {
                                    return;
                                }

                                startingItems.push({

                                    herramienta:
                                        formatearHerramienta(
                                            primera
                                        ),

                                    tiempo:
                                        limpiarTexto(
                                            segunda
                                        ),

                                    cantidad:
                                        limpiarTexto(
                                            tercera
                                        )
                                });
                            }
                        );

                    return;
                }

                // =============================================
                // RAIDING COST
                // =============================================

                if (
                    esTablaRaidingCost(
                        $,
                        tabla
                    )
                ) {

                    $(tabla)
                        .find("tr")
                        .each(
                            (_, fila) => {

                                const columnas =
                                    obtenerColumnas(
                                        $,
                                        fila
                                    );

                                if (
                                    columnas.length < 3
                                ) {
                                    return;
                                }

                                const herramienta =
                                    columnas[0] || "";

                                const cantidad =
                                    columnas[1] || "";

                                const tiempo =
                                    columnas[2] || "";

                                if (!herramienta) {
                                    return;
                                }

                                if (
                                    normalizarTexto(
                                        herramienta
                                    ) ===
                                    "herramienta de raideos"
                                ) {
                                    return;
                                }

                                if (
                                    !pareceTiempo(
                                        tiempo
                                    )
                                ) {
                                    return;
                                }

                                const nombreCrudo =
                                    limpiarTexto(
                                        herramienta
                                    );

                                const nombreLimpio =
                                    formatearHerramienta(
                                        herramienta
                                    );

                                if (!nombreLimpio) {
                                    return;
                                }

                                raidingCost.push({

                                    herramienta:
                                        nombreLimpio,

                                    nombreCrudo,

                                    cantidad:
                                        limpiarTexto(
                                            cantidad
                                        ),

                                    tiempo:
                                        limpiarTexto(
                                            tiempo
                                        ),

                                    categoria:
                                        obtenerCategoriaHerramienta(
                                            nombreLimpio
                                        )
                                });
                            }
                        );
                }
            }
        );

        // =================================================
        // FILTRO
        // =================================================

        const palabrasExcluir = [

            "raw material",
            "material cost",
            "costo de material",
            "costo de raideo",
            "sulfur",
            "azufre",
            "charcoal",
            "carbon",
            "cloth",
            "tela",
            "wood",
            "madera",
            "metal fragments",
            "fragmentos de metal",
            "stone",
            "piedra",
            "low grade fuel",
            "combustible de baja calidad",
            "scrap",
            "fuel",
            "combustible"
        ];

        const raidingCostFiltrado =
            raidingCost.filter(
                item => {

                    const nombre =
                        normalizarTexto(
                            item.herramienta
                        );

                    return !palabrasExcluir.some(
                        palabra =>
                            nombre.includes(
                                normalizarTexto(
                                    palabra
                                )
                            )
                    );
                }
            );

        // =================================================
        // ELIMINAR DUPLICADOS
        // =================================================

        const unicosMap =
            new Map();

        for (
            const item
            of raidingCostFiltrado
        ) {

            const nombreBase =
                normalizarTexto(
                    item.herramienta
                );

            if (
                !unicosMap.has(
                    nombreBase
                )
            ) {

                unicosMap.set(
                    nombreBase,
                    item
                );

            } else {

                const actual =
                    unicosMap.get(
                        nombreBase
                    );

                if (
                    convertirASegundos(
                        item.tiempo
                    ) <
                    convertirASegundos(
                        actual.tiempo
                    )
                ) {

                    unicosMap.set(
                        nombreBase,
                        item
                    );
                }
            }
        }

        const raidingCostSinDuplicados =
            Array.from(
                unicosMap.values()
            );

        // =================================================
        // ORDENAR
        // =================================================

        const raidingCostOrdenado =
            raidingCostSinDuplicados.sort(
                (a, b) =>
                    convertirASegundos(
                        a.tiempo
                    ) -
                    convertirASegundos(
                        b.tiempo
                    )
            );

        // =================================================
        // RESULTADO
        // =================================================

        return {

            nombre:
                nombreObjeto,

            url:
                urlLoot,

            urlRaideo,

            // NUEVO
            imagen:

                imagen || null,

            startingItems:
                startingItems.slice(
                    0,
                    3
                ),

            raidingCost:
                raidingCostOrdenado,

            dondeEncontrar:
                dondeEncontrar.length > 0
                    ? dondeEncontrar
                    : [
                        {
                            herramienta:
                                "No disponible",

                            tiempo:
                                ""
                        }
                    ]
        };

    } catch (error) {

        console.error(
            "❌ Error en servicio rusthelp:",
            error.message
        );

        if (
            error.response
        ) {

            console.error(
                "❌ HTTP:",
                error.response.status
            );
        }

        return null;
    }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    consultarRaid

};