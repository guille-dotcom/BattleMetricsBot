const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL =
    "https://rusthelp.com/es-ES/items";

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",

    "Accept-Language":
        "es-ES,es;q=0.9,en;q=0.8"
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

    "tc":
        "tool-cupboard",

    "armario":
        "tool-cupboard",

    "armario de herramientas":
        "tool-cupboard",

    "puerta blindada":
        "armored-door",

    "puerta de garaje":
        "garage-door",

    "puerta garaje":
        "garage-door",

    "puerta de chapa":
        "sheet-metal-door",

    "puerta chapa":
        "sheet-metal-door",

    "puerta de metal":
        "sheet-metal-door",

    "puerta de madera":
        "wooden-door",

    "puerta madera":
        "wooden-door",

    "doble puerta de chapa":
        "sheet-metal-double-door",

    "puerta doble de chapa":
        "sheet-metal-double-door",

    "puerta doble blindada":
        "armored-double-door",

    "muro blindado":
        "armored-wall",

    "pared blindada":
        "armored-wall",

    "pared de chapa":
        "sheet-metal-wall",

    "pared metalica":
        "sheet-metal-wall",

    "pared de piedra":
        "stone-wall",

    "pared de madera":
        "wooden-wall",

    "porton":
        "armored-garage-door",

    "porton blindado":
        "armored-garage-door"

};


// =====================================================
// NOMBRES CONOCIDOS DE RUST
// =====================================================

const NOMBRES_RUST = [

    {
        buscar: [
            "carga explosiva con temporizador",
            "timed explosive charge",
            "timed explosive",
            "c4"
        ],

        nombre:
            "C4"
    },

    {
        buscar: [
            "bolsa explosiva",
            "satchel charge",
            "satchel"
        ],

        nombre:
            "Satchel Charge"
    },

    {
        buscar: [
            "misil de alta velocidad",
            "high velocity rocket",
            "hv rocket"
        ],

        nombre:
            "HV Rocket"
    },

    {
        buscar: [
            "misil",
            "rocket",
            "cohete"
        ],

        nombre:
            "Rocket"
    },

    {
        buscar: [
            "bomba explosiva de propano",
            "propane explosive bomb",
            "propane tank",
            "propanedeployed"
        ],

        nombre:
            "Propane Tank"
    },

    {
        buscar: [
            "granada de lata",
            "beancan grenade",
            "beancan"
        ],

        nombre:
            "Beancan Grenade"
    },

    {
        buscar: [
            "granada explosiva",
            "explosive grenade"
        ],

        nombre:
            "F1 Grenade"
    },

    {
        buscar: [
            "municion explosiva",
            "munición explosiva",
            "explosive ammo",
            "explosive 5.56"
        ],

        nombre:
            "Explosive 5.56 Rifle Ammo"
    }

];


// =====================================================
// CONVERTIR A NOMBRE CONOCIDO DE RUST
// =====================================================

function convertirNombreRust(nombre) {

    const original =
        String(nombre || "").trim();

    if (!original) {
        return original;
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

    const url =
        `${BASE_URL}/${slug}`;

    try {

        const response =
            await axios.get(
                url,
                {
                    headers:
                        HEADERS,

                    timeout:
                        10000
                }
            );

        return {

            url,

            html:
                response.data

        };

    } catch {

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

    let slug =
        ALIASES[normalizado];

    if (!slug) {

        slug =
            convertirSlug(
                original
            );

    }


    // =================================================
    // PRIMER INTENTO
    // =================================================

    let pagina =
        await obtenerPagina(
            slug
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

                nombre:
                    titulo,

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

    }


    // =================================================
    // VARIANTES
    // =================================================

    const variantes = [

        normalizado
            .replace(
                /\bde\b/g,
                ""
            ),

        normalizado
            .replace(
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
        const variante of variantes
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

                    nombre:
                        titulo,

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

        }

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

            .replace(
                /[×x]/gi,
                ""
            )

            .replace(
                /\./g,
                ""
            )

            .replace(
                /,/g,
                ""
            )

            .replace(
                /[^\d]/g,
                ""
            );


    return Number(limpio) || 0;

}


// =====================================================
// EXTRAER AZUFRE
// =====================================================

function obtenerAzufreDeCelda(
    $,
    celda
) {

    let azufre = 0;


    $(celda)
        .find("a")
        .each(
            (i, enlace) => {

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
                    objetivo.includes(
                        "sulfur"
                    ) ||

                    objetivo.includes(
                        "azufre"
                    ) ||

                    objetivo.includes(
                        "sulphur"
                    );


                if (!esAzufre) {

                    return;

                }


                const cantidad =
                    extraerNumero(
                        texto
                    );


                if (
                    cantidad > azufre
                ) {

                    azufre =
                        cantidad;

                }

            }
        );


    return azufre;

}


// =====================================================
// VARIANTES DE RAID QUE NO QUEREMOS
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


// =====================================================
// COMPROBAR SI UNA FILA ESTÁ EXCLUIDA
// =====================================================

function esFilaRaidExcluida(
    texto
) {

    const normalizado =
        normalizarTexto(
            texto
        );


    return VARIANTES_RAID_EXCLUIDAS.some(
        variante =>
            normalizado.includes(
                normalizarTexto(
                    variante
                )
            )
    );

}


// =====================================================
// EXTRAER COSTOS
// =====================================================

function extraerCostosRaid(html) {

    const $ =
        cheerio.load(
            html
        );

    const filas = [];


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


            // =========================================
            // IDENTIFICAR TABLAS DE RAID
            // =========================================

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


                        // =====================================
                        // TEXTO COMPLETO DE LA FILA
                        //
                        // IMPORTANTE:
                        // Aquí todavía está presente
                        // "Launched From Catapult".
                        // =====================================

                        const textoFila =
                            $(fila)
                                .text()
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                        // =====================================
                        // EXCLUIR VARIANTES
                        // =====================================

                        if (
                            esFilaRaidExcluida(
                                textoFila
                            )
                        ) {

                            console.log(
                                `🚫 RustHelp: variante excluida → ${textoFila}`
                            );

                            return;

                        }


                        // =====================================
                        // HERRAMIENTA ORIGINAL
                        // =====================================

                        const herramientaOriginal =
                            $(celdas[0])
                                .text()
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                        // =====================================
                        // CONVERTIR NOMBRE
                        // =====================================

                        const herramienta =
                            convertirNombreRust(
                                herramientaOriginal
                            );


                        // =====================================
                        // CANTIDAD
                        // =====================================

                        const cantidad =
                            $(celdas[1])
                                .text()
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                        // =====================================
                        // TIEMPO
                        // =====================================

                        const tiempo =
                            $(celdas[2])
                                .text()
                                .replace(
                                    /\s+/g,
                                    " "
                                )
                                .trim();


                        // =====================================
                        // COSTO RAID
                        // =====================================

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


                        // =====================================
                        // COSTO MATERIAL
                        // =====================================

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


                        // =====================================
                        // AZUFRE
                        // =====================================

                        const azufre =
                            celdas[4]
                                ? obtenerAzufreDeCelda(
                                    $,
                                    celdas[4]
                                )
                                : 0;


                        if (!herramienta) {

                            return;

                        }


                        // =====================================
                        // GUARDAR FILA
                        // =====================================

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

function clasificarRaid(
    filas
) {

    const explosivos = [];

    const melee = [];

    const balas = [];


    // =========================================
    // EXPLOSIVOS VÁLIDOS
    // =========================================

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


    // =========================================
    // EXPLOSIVOS / MÉTODOS EXCLUIDOS
    // =========================================

    const explosivosExcluidos = [

        "torpedo",

        "mina",

        "mina terrestre",

        "catapult",

        "catapulta",

        "launched from catapult",

        "ballista",

        "balista",

        "mounted",

        "turret",

        "vehicle",

        "vehiculo",

        "vehículo"

    ];


    // =========================================
    // MELEE
    // =========================================

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

        "antorcha"

    ];


    // =========================================
    // BALAS
    // =========================================

    const palabrasBalas = [

        "municion",

        "munición",

        "bala",

        "ammo",

        "cartucho"

    ];


    // =========================================
    // RECORRER FILAS
    // =========================================

    for (
        const fila of filas
    ) {

        const texto =
            normalizarTexto(
                fila.herramienta
            );


        // =========================================
        // EXCLUIDO
        // =========================================

        const estaExcluido =
            explosivosExcluidos.some(
                palabra =>
                    texto.includes(
                        normalizarTexto(
                            palabra
                        )
                    )
            );


        if (estaExcluido) {

            continue;

        }


        // =========================================
        // EXPLOSIVO
        // =========================================

        const esExplosivo =
            explosivosPermitidos.some(
                palabra =>
                    texto.includes(
                        normalizarTexto(
                            palabra
                        )
                    )
            );


        if (esExplosivo) {

            explosivos.push(
                fila
            );

            continue;

        }


        // =========================================
        // BALAS
        // =========================================

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


        // =========================================
        // MELEE
        // =========================================

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
// ELIMINAR EXPLOSIVOS DUPLICADOS
// =====================================================

function eliminarDuplicadosExplosivos(
    filas
) {

    const mapa =
        new Map();


    for (
        const fila of filas
    ) {

        const clave =
            normalizarTexto(
                fila.herramienta
            );


        if (!clave) {

            continue;

        }


        const existente =
            mapa.get(
                clave
            );


        if (!existente) {

            mapa.set(
                clave,
                fila
            );

            continue;

        }


        // =========================================
        // MENOR AZUFRE
        // =========================================

        if (

            Number(fila.azufre) <
            Number(existente.azufre)

        ) {

            mapa.set(
                clave,
                fila
            );

            continue;

        }


        // =========================================
        // MISMO AZUFRE → MENOR CANTIDAD
        // =========================================

        if (

            Number(fila.azufre) ===
            Number(existente.azufre)

        ) {

            if (

                Number(fila.cantidadNumero) <
                Number(existente.cantidadNumero)

            ) {

                mapa.set(
                    clave,
                    fila
                );

            }

        }

    }


    return Array.from(
        mapa.values()
    );

}


// =====================================================
// ORDENAR POR ECONOMÍA
// =====================================================

function ordenarPorEconomia(
    filas
) {

    return [...filas]

        .filter(
            fila =>
                Number(
                    fila.azufre
                ) > 0
        )

        .sort(
            (a, b) => {

                const diferencia =
                    Number(a.azufre) -
                    Number(b.azufre);


                if (
                    diferencia !== 0
                ) {

                    return diferencia;

                }


                return (

                    Number(
                        a.cantidadNumero
                    ) -

                    Number(
                        b.cantidadNumero
                    )

                );

            }
        );

}


// =====================================================
// ORDENAR POR CANTIDAD
// =====================================================

function ordenarPorCantidad(
    filas
) {

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
                    Number(
                        a.cantidadNumero
                    ) -

                    Number(
                        b.cantidadNumero
                    );


                if (
                    diferencia !== 0
                ) {

                    return diferencia;

                }


                return (

                    Number(a.azufre) -
                    Number(b.azufre)

                );

            }
        );

}


// =====================================================
// CONVERTIR TIEMPO A SEGUNDOS
// =====================================================

function convertirTiempoASegundos(
    texto
) {

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
            Number(
                horas[1]
            ) * 3600;

    }


    if (minutos) {

        segundos +=
            Number(
                minutos[1]
            ) * 60;

    }


    if (segundosMatch) {

        segundos +=
            Number(
                segundosMatch[1]
            );

    }


    return segundos;

}


// =====================================================
// ORDENAR MELEE
// =====================================================

function ordenarMelee(
    filas
) {

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

async function consultarRaid(
    nombre
) {

    try {

        // =============================================
        // BUSCAR ITEM
        // =============================================

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


        // =============================================
        // EXTRAER COSTOS
        // =============================================

        const filas =
            extraerCostosRaid(
                item.html
            );


        // =============================================
        // CLASIFICAR
        // =============================================

        const clasificacion =
            clasificarRaid(
                filas
            );


        // =============================================
        // ELIMINAR DUPLICADOS
        // =============================================

        const explosivosSinDuplicados =
            eliminarDuplicadosExplosivos(
                clasificacion.explosivos
            );


        // =============================================
        // ORDENAR ECONOMÍA
        // =============================================

        const explosivosEconomia =
            ordenarPorEconomia(
                explosivosSinDuplicados
            );


        // =============================================
        // ORDENAR CANTIDAD
        // =============================================

        const explosivosCantidad =
            ordenarPorCantidad(
                explosivosSinDuplicados
            );


        // =============================================
        // ORDENAR MELEE
        // =============================================

        const meleeOrdenado =
            ordenarMelee(
                clasificacion.melee
            );


        // =============================================
        // RESULTADO
        // =============================================

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
                explosivosEconomia.slice(
                    0,
                    5
                ),

            explosivosEconomia:
                explosivosEconomia.slice(
                    0,
                    5
                ),

            explosivosCantidad:
                explosivosCantidad.slice(
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