const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://rusthelp.com/es-ES/items";

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};


// =====================================================
// NORMALIZAR TEXTO
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
// CONVERTIR NOMBRE A SLUG
// =====================================================

function convertirSlug(nombre) {

    return normalizarTexto(nombre)
        .replace(/\s+/g, "-");
}


// =====================================================
// ALIAS DE ITEMS COMUNES
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

    "pared de madera": "wooden-wall",

    "porton": "armored-garage-door",

    "porton blindado": "armored-garage-door"
};


// =====================================================
// OBTENER PAGINA
// =====================================================

async function obtenerPagina(slug) {

    const url =
        `${BASE_URL}/${slug}`;

    try {

        const response =
            await axios.get(
                url,
                {
                    headers: HEADERS,
                    timeout: 10000
                }
            );

        return {
            url,
            html: response.data
        };

    } catch (error) {

        return null;
    }
}


// =====================================================
// BUSCAR ITEM
// =====================================================

async function buscarItemRustHelp(nombre) {

    const original =
        String(nombre || "")
            .trim();

    if (!original) {
        return null;
    }

    const normalizado =
        normalizarTexto(original);


    // =================================================
    // 1. ALIAS
    // =================================================

    let slug =
        ALIASES[normalizado];


    // =================================================
    // 2. SLUG DIRECTO
    // =================================================

    if (!slug) {

        slug =
            convertirSlug(original);

    }


    // =================================================
    // INTENTAR URL DIRECTA
    // =================================================

    let pagina =
        await obtenerPagina(slug);


    if (pagina) {

        const $ =
            cheerio.load(
                pagina.html
            );

        const titulo =
            $("h1")
                .first()
                .text()
                .trim();

        if (titulo) {

            return {
                nombre: titulo,
                url: pagina.url,
                html: pagina.html
            };

        }

    }


    // =================================================
    // 3. VARIANTES
    // =================================================

    const variantes = [

        normalizado.replace(
            /\bde\b/g,
            ""
        ),

        normalizado.replace(
            /\bthe\b/g,
            ""
        ),

        normalizado
            .replace(
                /\bnivel\s+[123]\b/g,
                ""
            )
            .trim(),

        normalizado
            .replace(
                /\blvl\s*[123]\b/g,
                ""
            )
            .trim()

    ];


    const slugsProbados =
        new Set();


    for (
        const variante
        of variantes
    ) {

        const varianteSlug =
            convertirSlug(
                variante
            );

        if (
            slugsProbados.has(
                varianteSlug
            )
        ) {
            continue;
        }

        slugsProbados.add(
            varianteSlug
        );


        pagina =
            await obtenerPagina(
                varianteSlug
            );


        if (pagina) {

            const $ =
                cheerio.load(
                    pagina.html
                );

            const titulo =
                $("h1")
                    .first()
                    .text()
                    .trim();

            if (titulo) {

                return {
                    nombre: titulo,
                    url: pagina.url,
                    html: pagina.html
                };

            }

        }

    }


    return null;
}


// =====================================================
// EXTRAER COSTOS DE RAID
// =====================================================

function extraerCostosRaid(
    html
) {

    const $ =
        cheerio.load(
            html
        );


    const filas = [];


    // =================================================
    // BUSCAR TABLAS
    // =================================================

    $("table").each(
        (indice, tabla) => {

            const textoTabla =
                $(tabla)
                    .text()
                    .replace(
                        /\s+/g,
                        " "
                    )
                    .trim();


            const textoNormalizado =
                normalizarTexto(
                    textoTabla
                );


            // Solo tablas de Raiding Cost
            if (
                !textoNormalizado.includes(
                    "herramienta de raideos"
                ) &&
                !textoNormalizado.includes(
                    "raid tool"
                )
            ) {

                return;
            }


            $(tabla)
                .find("tbody tr")
                .each(
                    (i, fila) => {

                        const columnas = [];


                        $(fila)
                            .find("td")
                            .each(
                                (j, celda) => {

                                    columnas.push(
                                        $(celda)
                                            .text()
                                            .replace(
                                                /\s+/g,
                                                " "
                                            )
                                            .trim()
                                    );

                                }
                            );


                        if (
                            columnas.length >= 3
                        ) {

                            filas.push({

                                herramienta:
                                    columnas[0],

                                cantidad:
                                    columnas[1],

                                tiempo:
                                    columnas[2],

                                costo:
                                    columnas[3] ||
                                    "",

                                material:
                                    columnas[4] ||
                                    ""

                            });

                        }

                    }
                );

        }
    );


    return filas;
}


// =====================================================
// CLASIFICAR RAID
// =====================================================

function clasificarRaid(
    filas
) {

    const explosivos = [];
    const melee = [];
    const balas = [];


    const palabrasExplosivos = [

        "torpedo",
        "misil",
        "rocket",
        "cohete",

        "carga explosiva",
        "timed explosive",

        "bolsa explosiva",
        "satchel",

        "mina terrestre",
        "minas",

        "bomba explosiva",
        "granada",

        "explosivo"

    ];


    const palabrasMelee = [

        "hacha",
        "pico",
        "martillo",
        "machete",
        "espada",
        "lanza",
        "arma cuerpo",
        "melee"

    ];


    const palabrasBalas = [

        "municion",
        "munición",
        "bala",
        "ammo",
        "cartucho"

    ];


    for (
        const fila
        of filas
    ) {

        const texto =
            normalizarTexto(
                fila.herramienta
            );


        if (
            palabrasExplosivos.some(
                palabra =>
                    texto.includes(
                        normalizarTexto(
                            palabra
                        )
                    )
            )
        ) {

            explosivos.push(
                fila
            );

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

            melee.push(
                fila
            );

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

            balas.push(
                fila
            );

        }

    }


    return {
        explosivos,
        melee,
        balas
    };
}


// =====================================================
// CONSULTAR RAID
// =====================================================

async function consultarRaid(
    nombre
) {

    try {

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


        const filas =
            extraerCostosRaid(
                item.html
            );


        const clasificacion =
            clasificarRaid(
                filas
            );


        return {

            nombre:
                item.nombre,

            url:
                item.url,

            todos:
                filas,

            explosivos:
                clasificacion.explosivos,

            melee:
                clasificacion.melee,

            balas:
                clasificacion.balas

        };

    } catch (error) {

        console.error(
            "❌ Error consultando RustHelp:",
            error.message
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