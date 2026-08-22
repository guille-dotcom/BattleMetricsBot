const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URLS = [
    "https://rusthelp.com/en/items",
    "https://rusthelp.com/es-ES/items"
];

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "Accept-Language":
        "en-US,en;q=0.9,es-ES;q=0.8,es;q=0.7"
};

// =====================================================
// NORMALIZAR
// =====================================================

function normalizarTexto(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// =====================================================
// SLUG
// =====================================================

function convertirSlug(nombre) {
    return normalizarTexto(nombre)
        .replace(/\s+/g, "-");
}

// =====================================================
// ALIAS
// =====================================================

const ALIASES = {
    "tc": "tool-cupboard",
    "armario": "tool-cupboard",
    "armario de herramientas": "tool-cupboard",

    "puerta blindada": "armored-door",

    "puerta de garaje": "garage-door",
    "puerta garaje": "garage-door",

    "puerta de chapa": "sheet-metal-door",
    "puerta chapa": "sheet-metal-door",
    "puerta de metal": "sheet-metal-door",

    "puerta de madera": "wooden-door",
    "puerta madera": "wooden-door",

    "doble puerta de chapa": "sheet-metal-double-door",
    "puerta doble de chapa": "sheet-metal-double-door",

    "puerta doble blindada": "armored-double-door",

    "muro blindado": "armored-wall",
    "pared blindada": "armored-wall",

    "pared de chapa": "sheet-metal-wall",
    "pared metalica": "sheet-metal-wall",

    "pared de piedra": "stone-wall",
    "pared de madera": "wooden-wall",

    "porton": "armored-garage-door",
    "porton blindado": "armored-garage-door"
};

// =====================================================
// NOMBRES RUST
// =====================================================

const NOMBRES_RUST = [
    {
        buscar: [
            "timed explosive charge",
            "timed explosive",
            "c4"
        ],
        nombre: "C4"
    },

    {
        buscar: [
            "satchel charge",
            "satchel"
        ],
        nombre: "Satchel Charge"
    },

    {
        buscar: [
            "high velocity rocket",
            "hv rocket"
        ],
        nombre: "HV Rocket"
    },

    {
        buscar: [
            "rocket"
        ],
        nombre: "Rocket"
    },

    {
        buscar: [
            "propane tank"
        ],
        nombre: "Propane Tank"
    },

    {
        buscar: [
            "beancan grenade",
            "beancan"
        ],
        nombre: "Beancan Grenade"
    },

    {
        buscar: [
            "explosive grenade",
            "f1 grenade"
        ],
        nombre: "F1 Grenade"
    },

    {
        buscar: [
            "explosive 5.56",
            "explosive ammo",
            "explosive ammunition"
        ],
        nombre: "Explosive 5.56 Rifle Ammo"
    }
];

// =====================================================
// CONVERTIR NOMBRE RUST
// =====================================================

function convertirNombreRust(nombre) {

    const original =
        String(nombre || "").trim();

    if (!original) {
        return "";
    }

    const normalizado =
        normalizarTexto(original);

    for (const entrada of NOMBRES_RUST) {

        const coincide =
            entrada.buscar.some(
                palabra =>
                    normalizado.includes(
                        normalizarTexto(palabra)
                    )
            );

        if (coincide) {
            return entrada.nombre;
        }
    }

    return original;
}

// =====================================================
// OBTENER PÁGINA
// =====================================================

async function obtenerPagina(slug) {

    for (const base of BASE_URLS) {

        const url = `${base}/${slug}`;

        try {

            console.log(
                `🌐 RustHelp: intentando ${url}`
            );

            const response =
                await axios.get(
                    url,
                    {
                        headers: HEADERS,
                        timeout: 15000,

                        validateStatus:
                            status =>
                                status >= 200 &&
                                status < 400
                    }
                );

            if (
                !response.data ||
                typeof response.data !== "string"
            ) {
                continue;
            }

            return {
                url,
                html: response.data
            };

        } catch (error) {

            console.log(
                `⚠️ RustHelp no pudo abrir ${url}: ${error.message}`
            );
        }
    }

    return null;
}

// =====================================================
// BUSCAR ITEM
// =====================================================

async function buscarItemRustHelp(nombre) {

    const original =
        String(nombre || "").trim();

    if (!original) {
        return null;
    }

    const normalizado =
        normalizarTexto(original);

    let slug =
        ALIASES[normalizado] ||
        convertirSlug(original);

    const slugs = [
        slug
    ];

    if (normalizado !== slug) {

        slugs.push(
            convertirSlug(
                normalizado.replace(
                    /\bde\b/g,
                    ""
                )
            )
        );

        slugs.push(
            convertirSlug(
                normalizado.replace(
                    /\bthe\b/g,
                    ""
                )
            )
        );
    }

    const slugsUnicos =
        [...new Set(slugs)];

    for (const slugActual of slugsUnicos) {

        const pagina =
            await obtenerPagina(
                slugActual
            );

        if (!pagina) {
            continue;
        }

        const $ =
            cheerio.load(
                pagina.html
            );

        const titulo =
            $("h1")
                .first()
                .text()
                .replace(/\s+/g, " ")
                .trim();

        if (!titulo) {
            continue;
        }

        console.log(
            `✅ RustHelp encontró: ${titulo}`
        );

        return {
            nombre: titulo,

            nombreRust:
                convertirNombreRust(
                    titulo
                ),

            url:
                pagina.url,

            html:
                pagina.html
        };
    }

    return null;
}

// =====================================================
// EXTRAER NÚMERO
// =====================================================

function extraerNumero(texto) {

    if (!texto) {
        return 0;
    }

    const limpio =
        String(texto)
            .replace(/[×x]/gi, "")
            .replace(/\./g, "")
            .replace(/,/g, "")
            .replace(/[^\d]/g, "");

    return Number(limpio) || 0;
}

// =====================================================
// POLVORA
// =====================================================

function esPolvora(href, texto) {

    const objetivo =
        normalizarTexto(
            `${href || ""} ${texto || ""}`
        );

    return (
        objetivo.includes("gun powder") ||
        objetivo.includes("gunpowder") ||
        objetivo.includes("polvora")
    );
}

// =====================================================
// AZUFRE
// =====================================================

function esAzufre(href, texto) {

    const objetivo =
        normalizarTexto(
            `${href || ""} ${texto || ""}`
        );

    return (
        objetivo.includes("sulfur") ||
        objetivo.includes("sulphur") ||
        objetivo.includes("azufre")
    );
}

// =====================================================
// OBTENER POLVORA
// =====================================================

function obtenerPolvoraDeCelda($, celda) {

    let polvora = 0;

    $(celda)
        .find("a")
        .each((i, enlace) => {

            const href =
                $(enlace).attr("href") || "";

            const texto =
                $(enlace)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();

            if (!esPolvora(href, texto)) {
                return;
            }

            const cantidad =
                extraerNumero(texto);

            if (cantidad > polvora) {
                polvora = cantidad;
            }
        });

    return polvora;
}

// =====================================================
// OBTENER AZUFRE
// =====================================================

function obtenerAzufreDeCelda($, celda) {

    let azufre = 0;

    $(celda)
        .find("a")
        .each((i, enlace) => {

            const href =
                $(enlace).attr("href") || "";

            const texto =
                $(enlace)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();

            if (!esAzufre(href, texto)) {
                return;
            }

            const cantidad =
                extraerNumero(texto);

            if (cantidad > azufre) {
                azufre = cantidad;
            }
        });

    return azufre;
}

// =====================================================
// FILAS EXCLUIDAS
// =====================================================

const VARIANTES_RAID_EXCLUIDAS = [

    "launched from catapult",
    "launched from catapulta",
    "catapult",
    "catapulta",

    "launched from ballista",
    "ballista",
    "balista",

    "mounted",
    "mounted weapon",

    "turret",
    "torreta",

    "vehicle",
    "vehiculo",
    "vehículo",
    "from vehicle",

    "dispenser"
];

function esFilaRaidExcluida(texto) {

    const normalizado =
        normalizarTexto(texto);

    return VARIANTES_RAID_EXCLUIDAS.some(
        variante =>
            normalizado.includes(
                normalizarTexto(variante)
            )
    );
}

// =====================================================
// EXTRAER INGREDIENTES
// =====================================================

function extraerIngredientesReceta($) {

    const ingredientes = [];
    const mapa = new Map();

    $("a[href*='/items/']")
        .each((i, enlace) => {

            const href =
                $(enlace).attr("href") || "";

            const texto =
                $(enlace)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();

            if (!texto) {
                return;
            }

            const cantidad =
                extraerNumero(texto);

            if (!cantidad) {
                return;
            }

            const nombre =
                texto
                    .replace(/[×x]\s*\d+/gi, "")
                    .replace(/^\d+\s*/g, "")
                    .trim();

            if (!nombre) {
                return;
            }

            const nombreNormalizado =
                normalizarTexto(nombre);

            if (!nombreNormalizado) {
                return;
            }

            const clave =
                `${nombreNormalizado}|${cantidad}`;

            if (!mapa.has(clave)) {

                mapa.set(
                    clave,
                    {
                        nombre,
                        cantidad,
                        href
                    }
                );
            }
        });

    for (const ingrediente of mapa.values()) {
        ingredientes.push(ingrediente);
    }

    return ingredientes;
}

// =====================================================
// FORMATEAR RECETA
// =====================================================

function formatearReceta(ingredientes) {

    if (
        !ingredientes ||
        ingredientes.length === 0
    ) {
        return "";
    }

    return ingredientes
        .map(
            ingrediente =>
                `×${ingrediente.cantidad} ${ingrediente.nombre}`
        )
        .join(" • ");
}

// =====================================================
// EXTRAER COSTOS RAID
// =====================================================

function extraerCostosRaid(html) {

    const $ =
        cheerio.load(html);

    const filas = [];

    $("table").each(
        (indice, tabla) => {

            const textoTabla =
                $(tabla)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();

            const normalizado =
                normalizarTexto(
                    textoTabla
                );

            const esTablaRaid =
                normalizado.includes("raid tool") ||
                normalizado.includes("raiding tool") ||
                normalizado.includes("raiding cost") ||
                normalizado.includes("raid cost") ||
                normalizado.includes("herramienta de raideo") ||
                normalizado.includes("herramienta de raideos") ||
                normalizado.includes("costo de raideo");

            if (!esTablaRaid) {
                return;
            }

            console.log(
                "🔎 RustHelp: tabla de raid encontrada"
            );

            $(tabla)
                .find("tbody tr")
                .each(
                    (i, fila) => {

                        const celdas =
                            $(fila)
                                .find("td")
                                .toArray();

                        if (celdas.length < 3) {
                            return;
                        }

                        const textoFila =
                            $(fila)
                                .text()
                                .replace(/\s+/g, " ")
                                .trim();

                        if (
                            esFilaRaidExcluida(
                                textoFila
                            )
                        ) {
                            return;
                        }

                        const herramientaOriginal =
                            $(celdas[0])
                                .text()
                                .replace(/\s+/g, " ")
                                .trim();

                        if (!herramientaOriginal) {
                            return;
                        }

                        const herramienta =
                            convertirNombreRust(
                                herramientaOriginal
                            );

                        const cantidad =
                            $(celdas[1])
                                .text()
                                .replace(/\s+/g, " ")
                                .trim();

                        const tiempo =
                            $(celdas[2])
                                .text()
                                .replace(/\s+/g, " ")
                                .trim();

                        /*
                         * IMPORTANTE:
                         * RustHelp no siempre mantiene exactamente
                         * las mismas columnas.
                         *
                         * Buscamos la celda que realmente contiene
                         * pólvora/azufre en lugar de asumir siempre
                         * que es celdas[4].
                         */

                        let celdaMaterial = null;

                        for (
                            let indiceCelda = 3;
                            indiceCelda < celdas.length;
                            indiceCelda++
                        ) {

                            const textoCelda =
                                $(celdas[indiceCelda])
                                    .text()
                                    .replace(/\s+/g, " ")
                                    .trim();

                            const tienePolvora =
                                $(celdas[indiceCelda])
                                    .find("a")
                                    .toArray()
                                    .some(enlace =>
                                        esPolvora(
                                            $(enlace).attr("href"),
                                            $(enlace).text()
                                        )
                                    );

                            const tieneAzufre =
                                $(celdas[indiceCelda])
                                    .find("a")
                                    .toArray()
                                    .some(enlace =>
                                        esAzufre(
                                            $(enlace).attr("href"),
                                            $(enlace).text()
                                        )
                                    );

                            const pareceMaterial =
                                normalizarTexto(
                                    textoCelda
                                ).includes("gun powder") ||
                                normalizarTexto(
                                    textoCelda
                                ).includes("sulfur") ||
                                tienePolvora ||
                                tieneAzufre;

                            if (pareceMaterial) {
                                celdaMaterial =
                                    celdas[indiceCelda];

                                break;
                            }
                        }

                        /*
                         * Si no detectamos la celda por enlaces,
                         * usamos la última celda como respaldo.
                         */

                        if (!celdaMaterial) {
                            celdaMaterial =
                                celdas[celdas.length - 1];
                        }

                        const costoRaid =
                            celdas[3]
                                ? $(celdas[3])
                                    .text()
                                    .replace(/\s+/g, " ")
                                    .trim()
                                : "";

                        const costoMaterial =
                            celdaMaterial
                                ? $(celdaMaterial)
                                    .text()
                                    .replace(/\s+/g, " ")
                                    .trim()
                                : "";

                        const polvora =
                            celdaMaterial
                                ? obtenerPolvoraDeCelda(
                                    $,
                                    celdaMaterial
                                )
                                : 0;

                        const azufre =
                            celdaMaterial
                                ? obtenerAzufreDeCelda(
                                    $,
                                    celdaMaterial
                                )
                                : 0;

                        filas.push({

                            herramienta,

                            herramientaOriginal,

                            cantidad,

                            cantidadNumero:
                                extraerNumero(
                                    cantidad
                                ),

                            tiempo,

                            costo:
                                costoRaid,

                            material:
                                costoMaterial,

                            azufre,

                            polvora,

                            ingredientes: [],

                            receta: ""
                        });
                    }
                );
        }
    );

    /*
     * =================================================
     * FALLBACK
     * =================================================
     */

    if (filas.length === 0) {

        console.log(
            "⚠️ RustHelp: usando fallback de tablas."
        );

        $("table tr").each(
            (i, fila) => {

                const celdas =
                    $(fila)
                        .find("td")
                        .toArray();

                if (celdas.length < 3) {
                    return;
                }

                const textoFila =
                    $(fila)
                        .text()
                        .replace(/\s+/g, " ")
                        .trim();

                if (
                    esFilaRaidExcluida(
                        textoFila
                    )
                ) {
                    return;
                }

                const herramientaOriginal =
                    $(celdas[0])
                        .text()
                        .replace(/\s+/g, " ")
                        .trim();

                if (!herramientaOriginal) {
                    return;
                }

                const herramienta =
                    convertirNombreRust(
                        herramientaOriginal
                    );

                const cantidad =
                    $(celdas[1])
                        .text()
                        .replace(/\s+/g, " ")
                        .trim();

                const tiempo =
                    $(celdas[2])
                        .text()
                        .replace(/\s+/g, " ")
                        .trim();

                let celdaMaterial =
                    celdas[celdas.length - 1];

                const polvora =
                    obtenerPolvoraDeCelda(
                        $,
                        celdaMaterial
                    );

                const azufre =
                    obtenerAzufreDeCelda(
                        $,
                        celdaMaterial
                    );

                filas.push({

                    herramienta,

                    herramientaOriginal,

                    cantidad,

                    cantidadNumero:
                        extraerNumero(
                            cantidad
                        ),

                    tiempo,

                    costo: "",

                    material:
                        $(celdaMaterial)
                            .text()
                            .replace(/\s+/g, " ")
                            .trim(),

                    azufre,

                    polvora,

                    ingredientes: [],

                    receta: ""
                });
            }
        );
    }

    return filas;
}

// =====================================================
// CLASIFICAR RAID
// =====================================================

function clasificarRaid(filas) {

    const explosivos = [];
    const melee = [];
    const balas = [];

    const explosivosPermitidos = [
        "c4",
        "satchel charge",
        "satchel",
        "rocket",
        "hv rocket",
        "propane tank",
        "beancan grenade",
        "f1 grenade"
    ];

    const explosivosExcluidos = [
        "torpedo",
        "mina",
        "land mine",
        "catapult",
        "catapulta",
        "ballista",
        "balista",
        "mounted",
        "turret",
        "torreta",
        "vehicle",
        "vehiculo"
    ];

    const palabrasMelee = [
        "hatchet",
        "hacha",
        "pickaxe",
        "pico",
        "hammer",
        "martillo",
        "machete",
        "sword",
        "espada",
        "spear",
        "lanza",
        "melee",
        "cuerpo a cuerpo",
        "ram",
        "ariete",
        "torch",
        "antorcha"
    ];

    const palabrasBalas = [
        "ammo",
        "ammunition",
        "municion",
        "bullet",
        "bala",
        "cartucho"
    ];

    for (const fila of filas) {

        const texto =
            normalizarTexto(
                fila.herramienta
            );

        if (
            explosivosExcluidos.some(
                palabra =>
                    texto.includes(
                        normalizarTexto(
                            palabra
                        )
                    )
            )
        ) {
            continue;
        }

        if (
            explosivosPermitidos.some(
                palabra =>
                    texto.includes(
                        normalizarTexto(
                            palabra
                        )
                    )
            )
        ) {

            explosivos.push(fila);

            continue;
        }

        if (
            palabrasBalas.some(
                palabra =>
                    texto.includes(
                        normalizarTexto(
                            palabra
                        )
                    )
            )
        ) {

            balas.push(fila);

            continue;
        }

        if (
            palabrasMelee.some(
                palabra =>
                    texto.includes(
                        normalizarTexto(
                            palabra
                        )
                    )
            )
        ) {

            melee.push(fila);
        }
    }

    return {
        explosivos,
        melee,
        balas
    };
}

// =====================================================
// DUPLICADOS
// =====================================================

function eliminarDuplicadosExplosivos(filas) {

    const mapa = new Map();

    for (const fila of filas) {

        const clave =
            normalizarTexto(
                fila.herramienta
            );

        if (!clave) {
            continue;
        }

        const existente =
            mapa.get(clave);

        if (!existente) {

            mapa.set(
                clave,
                fila
            );

            continue;
        }

        if (
            Number(fila.polvora) <
            Number(existente.polvora)
        ) {

            mapa.set(
                clave,
                fila
            );

            continue;
        }

        if (
            Number(fila.polvora) ===
            Number(existente.polvora)
        ) {

            if (
                Number(
                    fila.cantidadNumero
                ) <
                Number(
                    existente.cantidadNumero
                )
            ) {

                mapa.set(
                    clave,
                    fila
                );
            }
        }
    }

    return [
        ...mapa.values()
    ];
}

// =====================================================
// ORDENAR ECONOMIA
// =====================================================

function ordenarPorEconomia(filas) {

    return [...filas]
        .filter(
            fila =>
                Number(fila.polvora) > 0
        )
        .sort(
            (a, b) => {

                const diferencia =
                    Number(a.polvora) -
                    Number(b.polvora);

                if (diferencia !== 0) {
                    return diferencia;
                }

                return (
                    Number(a.cantidadNumero) -
                    Number(b.cantidadNumero)
                );
            }
        );
}

// =====================================================
// ORDENAR CANTIDAD
// =====================================================

function ordenarPorCantidad(filas) {

    return [...filas]
        .filter(
            fila =>
                Number(
                    fila.cantidadNumero
                ) > 0
        )
        .sort(
            (a, b) => {

                const diferencia =
                    Number(a.cantidadNumero) -
                    Number(b.cantidadNumero);

                if (diferencia !== 0) {
                    return diferencia;
                }

                return (
                    Number(a.polvora) -
                    Number(b.polvora)
                );
            }
        );
}

// =====================================================
// TIEMPO
// =====================================================

function convertirTiempoASegundos(texto) {

    if (!texto) {
        return Infinity;
    }

    const normalizado =
        normalizarTexto(texto);

    let segundos = 0;

    const horas =
        normalizado.match(
            /(\d+)\s*h/
        );

    const minutos =
        normalizado.match(
            /(\d+)\s*m/
        );

    const segundosMatch =
        normalizado.match(
            /(\d+)\s*s/
        );

    if (horas) {
        segundos +=
            Number(horas[1]) * 3600;
    }

    if (minutos) {
        segundos +=
            Number(minutos[1]) * 60;
    }

    if (segundosMatch) {
        segundos +=
            Number(segundosMatch[1]);
    }

    return segundos;
}

// =====================================================
// MELEE
// =====================================================

function ordenarMelee(filas) {

    return [...filas].sort(
        (a, b) =>
            convertirTiempoASegundos(
                a.tiempo
            ) -
            convertirTiempoASegundos(
                b.tiempo
            )
    );
}

// =====================================================
// CONSULTAR RAID
// =====================================================

async function consultarRaid(nombre) {

    try {

        console.log(
            `🔎 RustHelp: consultando "${nombre}"`
        );

        const item =
            await buscarItemRustHelp(
                nombre
            );

        if (!item) {

            console.log(
                `❌ RustHelp: no se encontró "${nombre}"`
            );

            return null;
        }

        console.log(
            `📄 RustHelp URL: ${item.url}`
        );

        const filas =
            extraerCostosRaid(
                item.html
            );

        console.log(
            `📊 RustHelp: ${filas.length} filas encontradas`
        );

        const clasificacion =
            clasificarRaid(
                filas
            );

        console.log(
            `💣 Explosivos detectados: ${clasificacion.explosivos.length}`
        );

        console.log(
            `🔨 Melee detectados: ${clasificacion.melee.length}`
        );

        console.log(
            `🔫 Balas detectadas: ${clasificacion.balas.length}`
        );

        const sinDuplicados =
            eliminarDuplicadosExplosivos(
                clasificacion.explosivos
            );

        const economia =
            ordenarPorEconomia(
                sinDuplicados
            );

        const cantidad =
            ordenarPorCantidad(
                sinDuplicados
            );

        const melee =
            ordenarMelee(
                clasificacion.melee
            );

        return {

            nombre:
                item.nombre,

            nombreRust:
                item.nombreRust,

            url:
                item.url,

            todos:
                filas,

            explosivos:
                economia.slice(0, 5),

            explosivosEconomia:
                economia.slice(0, 5),

            explosivosCantidad:
                cantidad.slice(0, 5),

            melee:
                melee.slice(0, 5),

            balas:
                clasificacion.balas
        };

    } catch (error) {

        console.error(
            "❌ Error consultando RustHelp:",
            error
        );

        return null;
    }
}

// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    buscarItemRustHelp,

    consultarRaid,

    extraerCostosRaid,

    clasificarRaid
};