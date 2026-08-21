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
        String(nombre || "").trim();

    if (!original) {
        return null;
    }

    const normalizado =
        normalizarTexto(original);


    // =================================================
    // ALIAS
    // =================================================

    let slug =
        ALIASES[normalizado];


    // =================================================
    // SLUG DIRECTO
    // =================================================

    if (!slug) {

        slug =
            convertirSlug(original);

    }


    // =================================================
    // URL DIRECTA
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
    // VARIANTES
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
// EXTRAER NUMERO
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
// EXTRAER COSTO DE AZUFRE
// =====================================================
//
// RustHelp identifica el material mediante el href
// de los enlaces.
//
// /items/sulfur = azufre
// /items/charcoal = carbon
// etc.
//
// =====================================================

function obtenerAzufreDeCelda($, celda) {

    let azufre = 0;

    $(celda)
        .find("a")
        .each((i, enlace) => {

            const href =
                $(enlace)
                    .attr("href") || "";

            const texto =
                $(enlace)
                    .text()
                    .trim();

            const objetivo =
                normalizarTexto(
                    `${href} ${texto}`
                );


            const esAzufre =
                objetivo.includes("sulfur") ||
                objetivo.includes("azufre") ||
                objetivo.includes("sulphur");


            if (!esAzufre) {
                return;
            }


            const cantidad =
                extraerNumero(
                    $(enlace).text()
                );


            if (cantidad > azufre) {
                azufre = cantidad;
            }

        });


    return azufre;
}


// =====================================================
// EXTRAER FILAS DE RAID
// =====================================================

function extraerCostosRaid(html) {

    const $ =
        cheerio.load(
            html
        );


    const filas = [];


    // =================================================
    // BUSCAR TABLA "RAIDING COST"
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


            if (
                !textoNormalizado.includes(
                    "herramienta de raideos"
                ) &&
                !textoNormalizado.includes(
                    "raid tool"
                ) &&
                !textoNormalizado.includes(
                    "costo de raideo"
                ) &&
                !textoNormalizado.includes(
                    "raiding cost"
                )
            ) {

                return;
            }


            // =================================================
            // CABECERAS
            // =================================================

            const headers =
                [];

            $(tabla)
                .find("thead th")
                .each((i, th) => {

                    headers.push(
                        normalizarTexto(
                            $(th).text()
                        )
                    );

                });


            // =================================================
            // FILAS
            // =================================================

            $(tabla)
                .find("tbody tr")
                .each(
                    (i, fila) => {

                        const celdas =
                            $(fila)
                                .find("td")
                                .toArray();


                        if (
                            celdas.length < 3
                        ) {
                            return;
                        }


                        const herramienta =
                            $(celdas[0])
                                .text()
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                        const cantidad =
                            $(celdas[1])
                                .text()
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                        const tiempo =
                            $(celdas[2])
                                .text()
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                        const costoRaid =
                            celdas[3]
                                ? $(celdas[3])
                                    .text()
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                                    .trim()
                                : "";


                        const costoMaterial =
                            celdas[4]
                                ? $(celdas[4])
                                    .text()
                                    .replace(
                                        /\s+/g,
                                        " "
                                    )
                                    .trim()
                                : "";


                        const azufre =
                            celdas[4]
                                ? obtenerAzufreDeCelda(
                                    $,
                                    celdas[4]
                                )
                                : 0;


                        if (
                            !herramienta
                        ) {
                            return;
                        }


                        filas.push({

                            herramienta,

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

                            azufre

                        });

                    }
                );

        }
    );


    return filas;
}


// =====================================================
// CLASIFICAR RAID
// =====================================================

function clasificarRaid(filas) {

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
        "melee",
        "cuerpo a cuerpo",
        "ariete",
        "balista",
        "antorcha"

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


        // =================================================
        // EXPLOSIVOS
        // =================================================

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


        // =================================================
        // BALAS
        // =================================================

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

            continue;
        }


        // =================================================
        // MELEE
        // =================================================

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

        }

    }


    return {
        explosivos,
        melee,
        balas
    };
}


// =====================================================
// ORDENAR POR AZUFRE
// =====================================================

function ordenarPorAzufre(filas) {

    return [...filas]
        .filter(
            fila =>
                Number(fila.azufre) > 0
        )
        .sort(
            (a, b) => {

                if (
                    a.azufre !==
                    b.azufre
                ) {

                    return (
                        a.azufre -
                        b.azufre
                    );

                }


                return (
                    a.cantidadNumero -
                    b.cantidadNumero
                );

            }
        );
}


// =====================================================
// ORDENAR MELEE
// =====================================================

function convertirTiempoASegundos(texto) {

    if (!texto) {
        return Infinity;
    }

    const normalizado =
        normalizarTexto(
            texto
        );

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


function ordenarMelee(filas) {

    return [...filas]
        .sort(
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


        const explosivosOrdenados =
            ordenarPorAzufre(
                clasificacion.explosivos
            );


        const meleeOrdenado =
            ordenarMelee(
                clasificacion.melee
            );


        return {

            nombre:
                item.nombre,

            url:
                item.url,

            todos:
                filas,

            explosivos:
                explosivosOrdenados.slice(
                    0,
                    5
                ),

            melee:
                meleeOrdenado.slice(
                    0,
                    5
                ),

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