const axios = require("axios");
const cheerio = require("cheerio");

// =====================================================
// URLS
// =====================================================

const BASE_URLS = [
    "https://rusthelp.com/en/items",
    "https://rusthelp.com/es-ES/items"
];

// =====================================================
// HEADERS
// =====================================================

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "Accept-Language":
        "en-US,en;q=0.9,es-ES;q=0.8,es;q=0.7"
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
        buscarExacto: [
            "explosive 5.56 rifle ammo",
            "explosive 556 rifle ammo"
        ],
        nombre: "Explosive 5.56 Rifle Ammo"
    },

    {
        buscar: [
            "salvaged icepick",
            "salvaged pickaxe",
            "salvaged pick",
            "piolet"
        ],
        nombre: "Piolet"
    },

    {
        buscar: [
            "pickaxe"
        ],
        nombre: "Pico"
    },

    {
        buscar: [
            "hatchet"
        ],
        nombre: "Hacha"
    },

    {
        buscar: [
            "machete"
        ],
        nombre: "Machete"
    },

    {
        buscar: [
            "longsword"
        ],
        nombre: "Longsword"
    },

    {
        buscar: [
            "salvaged sword"
        ],
        nombre: "Espada Salvaje"
    },

    {
        buscar: [
            "hammer"
        ],
        nombre: "Martillo"
    },

    {
        buscar: [
            "bone club"
        ],
        nombre: "Garrote de Hueso"
    },

    {
        buscar: [
            "stone spear"
        ],
        nombre: "Lanza de Piedra"
    },

    {
        buscar: [
            "wooden spear"
        ],
        nombre: "Lanza de Madera"
    },

    {
        buscar: [
            "spear"
        ],
        nombre: "Lanza"
    },

    {
        buscar: [
            "torch"
        ],
        nombre: "Antorcha"
    },

    {
        buscar: [
            "chainsaw"
        ],
        nombre: "Motosierra"
    },

    {
        buscar: [
            "jackhammer"
        ],
        nombre: "Martillo Neumático"
    },

    {
        buscar: [
            "battering ram"
        ],
        nombre: "Ariete"
    }
];

// =====================================================
// MAPA DE MATERIALES RAW
// =====================================================
//
// IMPORTANTE:
//
// RustHelp actualmente muestra los materiales mediante
// enlaces cuyo texto puede ser solamente:
//
// ×400
// ×480
// ×2
//
// El nombre real del material se encuentra asociado
// al href del enlace.
//
// Por eso NO debemos depender únicamente del texto
// visible del <a>.
//
// =====================================================

const MATERIALES_RAW = [

    {
        claves: [
            "sulfur",
            "sulphur",
            "azufre"
        ],
        nombre: "Sulfur"
    },

    {
        claves: [
            "charcoal",
            "carbon"
        ],
        nombre: "Charcoal"
    },

    {
        claves: [
            "metal-fragments",
            "metal fragments",
            "metal-fragment",
            "metal fragment",
            "fragmentos de metal"
        ],
        nombre: "Metal Fragments"
    },

    {
        claves: [
            "metal-pipe",
            "metal pipe",
            "metal-pipes",
            "tubo de metal",
            "tuberia metalica"
        ],
        nombre: "Metal Pipe"
    },

    {
        claves: [
            "low-grade-fuel",
            "low grade fuel",
            "low-grade",
            "low grade"
        ],
        nombre: "Low Grade Fuel"
    },

    {
        claves: [
            "cloth",
            "tela"
        ],
        nombre: "Cloth"
    },

    {
        claves: [
            "rope",
            "cuerda"
        ],
        nombre: "Rope"
    },

    {
        claves: [
            "tech-trash",
            "tech trash"
        ],
        nombre: "Tech Trash"
    },

    {
        claves: [
            "gears",
            "gear"
        ],
        nombre: "Gears"
    },

    {
        claves: [
            "crude-oil",
            "crude oil"
        ],
        nombre: "Crude Oil"
    },

    {
        claves: [
            "animal-fat",
            "animal fat"
        ],
        nombre: "Animal Fat"
    },

    {
        claves: [
            "leather"
        ],
        nombre: "Leather"
    },

    {
        claves: [
            "wood"
        ],
        nombre: "Wood"
    },

    {
        claves: [
            "metal-spring",
            "metal spring"
        ],
        nombre: "Metal Spring"
    },

    {
        claves: [
            "semi-automatic-body",
            "semi automatic body"
        ],
        nombre: "Semi Automatic Body"
    },

    {
        claves: [
            "rifle-body",
            "rifle body"
        ],
        nombre: "Rifle Body"
    },

    {
        claves: [
            "smg-body",
            "smg body"
        ],
        nombre: "SMG Body"
    },

    {
        claves: [
            "hq-metal",
            "high quality metal",
            "high quality metal ore"
        ],
        nombre: "High Quality Metal"
    },

    {
        claves: [
            "stone",
            "piedra"
        ],
        nombre: "Stone"
    }
];

// =====================================================
// LIMPIAR NOMBRE
// =====================================================

function limpiarNombreRust(nombre) {

    let texto = String(nombre || "")
        .replace(/\s+/g, " ")
        .trim();

    if (!texto) {
        return "";
    }

    const basura = [
        "Cost To Repair Head",
        "Cost to Repair Head",
        "Workbench Refill",
        "Workbench refill",
        "Cost To Repair",
        "Cost to Repair",
        "Repair Cost",
        "Repair cost"
    ];

    for (const parte of basura) {

        const indice =
            texto
                .toLowerCase()
                .indexOf(parte.toLowerCase());

        if (indice !== -1) {
            texto =
                texto
                    .substring(0, indice)
                    .trim();
        }
    }

    texto = texto

        .replace(
            /\s*[\(\[\-–—|]\s*lit\s*[\)\]]?/gi,
            " "
        )

        .replace(
            /\s+lit$/gi,
            ""
        )

        .replace(
            /\s+/g,
            " "
        )

        .trim();

    return texto;
}

// =====================================================
// CONVERTIR NOMBRE RUST
// =====================================================

function convertirNombreRust(nombre) {

    const original =
        limpiarNombreRust(nombre);

    if (!original) {
        return "";
    }

    const normalizado =
        normalizarTexto(original);

    // =================================================
    // MUNICIÓN
    // =================================================

    if (
        normalizado ===
            "explosive 5 56 rifle ammo" ||
        normalizado ===
            "explosive 556 rifle ammo"
    ) {

        return "Explosive 5.56 Rifle Ammo";
    }

    // =================================================
    // RESTO DE ITEMS
    // =================================================

    for (const entrada of NOMBRES_RUST) {

        if (entrada.buscarExacto) {

            if (
                entrada.buscarExacto.some(
                    palabra =>
                        normalizado ===
                        normalizarTexto(palabra)
                )
            ) {

                return entrada.nombre;
            }

            continue;
        }

        if (entrada.buscar) {

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
    }

    return original;
}

// =====================================================
// OBTENER PAGINA
// =====================================================

async function obtenerPagina(slug) {

    for (const base of BASE_URLS) {

        const url =
            `${base}/${slug}`;

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

    const sinDe =
        normalizado
            .replace(/\bde\b/g, "")
            .replace(/\s+/g, " ")
            .trim();

    if (sinDe) {

        slugs.push(
            convertirSlug(sinDe)
        );
    }

    const sinThe =
        normalizado
            .replace(/\bthe\b/g, "")
            .replace(/\s+/g, " ")
            .trim();

    if (sinThe) {

        slugs.push(
            convertirSlug(sinThe)
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

    return null;
}

// =====================================================
// EXTRAER NUMERO SEGURO
// =====================================================

function extraerNumero(texto) {

    if (
        texto === null ||
        texto === undefined
    ) {
        return 0;
    }

    const valor =
        String(texto)
            .replace(/\u00a0/g, " ")
            .replace(/,/g, "")
            .match(/\d+(?:\.\d+)?/);

    if (!valor) {
        return 0;
    }

    const numero =
        Number(valor[0]);

    return Number.isFinite(numero)
        ? numero
        : 0;
}

// =====================================================
// EXTRAER CANTIDAD RAID
// =====================================================

function extraerCantidadRaid(texto) {

    if (
        texto === null ||
        texto === undefined
    ) {
        return 0;
    }

    let limpio =
        String(texto)
            .replace(/\u00a0/g, " ")
            .replace(/,/g, "")
            .trim();

    const patrones = [

        /^\s*[x×]\s*(\d+)\b/i,

        /^\s*(\d+)\s*[x×]\b/i,

        /^\s*(\d+)\b/
    ];

    for (const patron of patrones) {

        const match =
            limpio.match(patron);

        if (match) {

            const numero =
                Number(match[1]);

            if (
                Number.isFinite(numero) &&
                numero >= 0
            ) {

                return numero;
            }
        }
    }

    return 0;
}

// =====================================================
// NORMALIZAR MATERIAL
// =====================================================

function normalizarNombreMaterial(
    nombre,
    href
) {

    let texto =
        String(nombre || "")
            .replace(/\s+/g, " ")
            .trim();

    const objetivo =
        normalizarTexto(
            `${href || ""} ${texto || ""}`
        );

    // =================================================
    // BUSCAR POR HREF + TEXTO
    // =================================================

    for (const material of MATERIALES_RAW) {

        const coincide =
            material.claves.some(
                clave =>
                    objetivo.includes(
                        normalizarTexto(clave)
                    )
            );

        if (coincide) {
            return material.nombre;
        }
    }

    // =================================================
    // FALLBACK POR HREF
    // =================================================

    if (!texto && href) {

        const partes =
            String(href)
                .split("/")
                .filter(Boolean);

        const slug =
            partes[partes.length - 1];

        if (slug) {

            return slug
                .replace(/-/g, " ")
                .replace(
                    /\b\w/g,
                    letra =>
                        letra.toUpperCase()
                );
        }
    }

    return texto;
}

// =====================================================
// IDENTIFICAR MATERIAL POR ENLACE
// =====================================================

function identificarMaterialDesdeEnlace(
    $,
    enlace
) {

    if (!enlace) {
        return null;
    }

    const href =
        $(enlace)
            .attr("href") || "";

    const texto =
        $(enlace)
            .text()
            .replace(/\s+/g, " ")
            .trim();

    const objetivo =
        normalizarTexto(
            `${href} ${texto}`
        );

    for (const material of MATERIALES_RAW) {

        const coincide =
            material.claves.some(
                clave =>
                    objetivo.includes(
                        normalizarTexto(clave)
                    )
            );

        if (coincide) {

            return {
                nombre:
                    material.nombre,

                href,

                texto
            };
        }
    }

    return null;
}

// =====================================================
// DETECTAR SI ES MATERIAL RAW
// =====================================================

function esMaterialRaw(
    href,
    texto
) {

    const objetivo =
        normalizarTexto(
            `${href || ""} ${texto || ""}`
        );

    return MATERIALES_RAW.some(
        material =>
            material.claves.some(
                clave =>
                    objetivo.includes(
                        normalizarTexto(clave)
                    )
            )
    );
}

// =====================================================
// EXTRAER CANTIDAD DESDE ELEMENTO
// =====================================================

function extraerCantidadDesdeElemento(
    $,
    elemento
) {

    if (!elemento) {
        return 0;
    }

    // =================================================
    // TEXTO DEL PROPIO ELEMENTO
    // =================================================

    const texto =
        $(elemento)
            .text()
            .replace(/\u00a0/g, " ")
            .replace(/,/g, "")
            .trim();

    let cantidad =
        extraerCantidadRaid(texto);

    if (cantidad > 0) {
        return cantidad;
    }

    // =================================================
    // ATRIBUTOS
    // =================================================

    const atributos = [
        "title",
        "aria-label",
        "data-amount",
        "data-quantity",
        "data-count",
        "value"
    ];

    for (const atributo of atributos) {

        const valor =
            $(elemento)
                .attr(atributo);

        if (!valor) {
            continue;
        }

        cantidad =
            extraerCantidadRaid(
                valor
            );

        if (cantidad > 0) {
            return cantidad;
        }
    }

    return 0;
}

// =====================================================
// EXTRAER MATERIAL DE UNA ESTRUCTURA
// =====================================================
//
// RustHelp puede estructurar el material de diferentes
// maneras dependiendo de la versión de la página.
//
// Esta función intenta:
//
// 1. Nombre dentro del enlace.
// 2. Nombre en href.
// 3. Texto alrededor del enlace.
// 4. Cantidad dentro del enlace.
// 5. Cantidad en el elemento padre.
// 6. Atributos data-*.
//
// =====================================================

function extraerMaterialDesdeNodo(
    $,
    enlace
) {

    if (!enlace) {
        return null;
    }

    const href =
        $(enlace)
            .attr("href") || "";

    const textoEnlace =
        $(enlace)
            .text()
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const material =
        identificarMaterialDesdeEnlace(
            $,
            enlace
        );

    // =================================================
    // SI EL HREF IDENTIFICA EL MATERIAL
    // =================================================

    if (material) {

        let cantidad =
            extraerCantidadDesdeElemento(
                $,
                enlace
            );

        // =================================================
        // BUSCAR CANTIDAD EN PADRES
        // =================================================

        if (cantidad <= 0) {

            let padre =
                $(enlace).parent();

            for (
                let nivel = 0;
                nivel < 3 && padre.length;
                nivel++
            ) {

                const textoPadre =
                    padre
                        .text()
                        .replace(/\u00a0/g, " ")
                        .replace(/,/g, "")
                        .replace(/\s+/g, " ")
                        .trim();

                cantidad =
                    extraerCantidadRaid(
                        textoPadre
                    );

                if (cantidad > 0) {
                    break;
                }

                padre =
                    padre.parent();
            }
        }

        // =================================================
        // BUSCAR DATA ATTRIBUTES EN PADRES
        // =================================================

        if (cantidad <= 0) {

            let padre =
                $(enlace).parent();

            for (
                let nivel = 0;
                nivel < 3 && padre.length;
                nivel++
            ) {

                const atributos = [
                    "data-amount",
                    "data-quantity",
                    "data-count",
                    "value"
                ];

                for (const atributo of atributos) {

                    const valor =
                        padre.attr(
                            atributo
                        );

                    if (!valor) {
                        continue;
                    }

                    cantidad =
                        extraerCantidadRaid(
                            valor
                        );

                    if (cantidad > 0) {
                        break;
                    }
                }

                if (cantidad > 0) {
                    break;
                }

                padre =
                    padre.parent();
            }
        }

        return {

            nombre:
                material.nombre,

            cantidad,

            href,

            texto:
                textoEnlace
        };
    }

    return null;
}

// =====================================================
// EXTRAER INGREDIENTES RAW
// =====================================================

function extraerIngredientesRaw(
    $,
    celda
) {

    const ingredientes = [];

    if (!celda) {
        return ingredientes;
    }

    // =================================================
    // 1. PRIMERA ESTRATEGIA:
    // TODOS LOS ENLACES DE LA CELDA
    // =================================================

    $(celda)
        .find("a")
        .each(
            (i, enlace) => {

                const ingrediente =
                    extraerMaterialDesdeNodo(
                        $,
                        enlace
                    );

                if (!ingrediente) {
                    return;
                }

                if (
                    ingrediente.cantidad <= 0
                ) {
                    return;
                }

                ingredientes.push(
                    ingrediente
                );
            }
        );

    // =================================================
    // 2. SEGUNDA ESTRATEGIA:
    // ELEMENTOS QUE TENGAN HREF
    // =================================================

    if (
        ingredientes.length === 0
    ) {

        $(celda)
            .find("[href]")
            .each(
                (i, elemento) => {

                    const ingrediente =
                        extraerMaterialDesdeNodo(
                            $,
                            elemento
                        );

                    if (!ingrediente) {
                        return;
                    }

                    if (
                        ingrediente.cantidad <= 0
                    ) {
                        return;
                    }

                    ingredientes.push(
                        ingrediente
                    );
                }
            );
    }

    // =================================================
    // 3. TERCERA ESTRATEGIA:
    // TEXTO COMPLETO DE LA CELDA
    // =================================================
    //
    // Esto sirve como fallback si RustHelp cambia
    // la estructura HTML.
    //
    // =================================================

    if (
        ingredientes.length === 0
    ) {

        const textoCompleto =
            $(celda)
                .text()
                .replace(/\u00a0/g, " ")
                .replace(/,/g, "")
                .replace(/\s+/g, " ")
                .trim();

        for (const material of MATERIALES_RAW) {

            const claveEncontrada =
                material.claves.find(
                    clave =>
                        normalizarTexto(
                            textoCompleto
                        ).includes(
                            normalizarTexto(
                                clave
                            )
                        )
                );

            if (!claveEncontrada) {
                continue;
            }

            const indice =
                normalizarTexto(
                    textoCompleto
                ).indexOf(
                    normalizarTexto(
                        claveEncontrada
                    )
                );

            const parte =
                textoCompleto.substring(
                    Math.max(0, indice - 20),
                    indice + 100
                );

            const cantidad =
                extraerNumero(
                    parte
                );

            if (cantidad > 0) {

                ingredientes.push({

                    nombre:
                        material.nombre,

                    cantidad,

                    href: "",

                    texto:
                        parte
                });
            }
        }
    }

    // =================================================
    // UNIFICAR MATERIALES
    // =================================================

    const mapa =
        new Map();

    for (const ingrediente of ingredientes) {

        const clave =
            normalizarTexto(
                ingrediente.nombre
            );

        if (!clave) {
            continue;
        }

        if (!mapa.has(clave)) {

            mapa.set(
                clave,
                {
                    ...ingrediente
                }
            );

        } else {

            const existente =
                mapa.get(clave);

            existente.cantidad +=
                Number(
                    ingrediente.cantidad
                ) || 0;
        }
    }

    return [
        ...mapa.values()
    ];
}

// =====================================================
// BUSCAR CELDA RAW MATERIAL COST
// =====================================================

function encontrarCeldaMaterial(
    $,
    celdas
) {

    // =================================================
    // PRIMERA OPCIÓN:
    // BUSCAR LA CELDA CON LOS MATERIALES
    // =================================================

    for (
        let indice = 3;
        indice < celdas.length;
        indice++
    ) {

        const celda =
            celdas[indice];

        const enlaces =
            $(celda)
                .find("a")
                .toArray();

        for (const enlace of enlaces) {

            if (
                esMaterialRaw(
                    $(enlace).attr("href"),
                    $(enlace).text()
                )
            ) {

                return celda;
            }
        }
    }

    // =================================================
    // SEGUNDA OPCIÓN:
    // CUALQUIER CELDA CON ALGÚN MATERIAL
    // =================================================

    for (const celda of celdas) {

        const texto =
            $(celda)
                .text()
                .replace(/\s+/g, " ")
                .trim();

        const normalizado =
            normalizarTexto(texto);

        const tieneMaterial =
            MATERIALES_RAW.some(
                material =>
                    material.claves.some(
                        clave =>
                            normalizado.includes(
                                normalizarTexto(
                                    clave
                                )
                            )
                    )
            );

        if (tieneMaterial) {
            return celda;
        }
    }

    return null;
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

function esFilaRaidExcluida(
    texto
) {

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
// EXTRAER COSTOS RAID
// =====================================================

function extraerCostosRaid(
    html
) {

    const $ =
        cheerio.load(html);

    const filas = [];

    // =================================================
    // BUSCAR TABLA RAID
    // =================================================

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

                normalizado.includes(
                    "raid tool"
                ) ||

                normalizado.includes(
                    "raiding tool"
                ) ||

                normalizado.includes(
                    "raiding cost"
                ) ||

                normalizado.includes(
                    "raid cost"
                ) ||

                normalizado.includes(
                    "herramienta de raideo"
                ) ||

                normalizado.includes(
                    "herramienta de raideos"
                ) ||

                normalizado.includes(
                    "costo de raideo"
                );

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

                        procesarFilaRaid(
                            $,
                            fila,
                            filas
                        );
                    }
                );
        }
    );

    // =================================================
    // FALLBACK
    // =================================================

    if (
        filas.length === 0
    ) {

        console.log(
            "⚠️ RustHelp: usando fallback de tablas."
        );

        $("table tr").each(
            (i, fila) => {

                procesarFilaRaid(
                    $,
                    fila,
                    filas
                );
            }
        );
    }

    return filas;
}

// =====================================================
// PROCESAR FILA RAID
// =====================================================

function procesarFilaRaid(
    $,
    fila,
    filas
) {

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

    // =================================================
    // HERRAMIENTA
    // =================================================

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

    if (!herramienta) {
        return;
    }

    // =================================================
    // CANTIDAD
    // =================================================

    const cantidadTexto =
        $(celdas[1])
            .text()
            .replace(/\s+/g, " ")
            .trim();

    const cantidadNumero =
        extraerCantidadRaid(
            cantidadTexto
        );

    const cantidadSegura =
        Number.isFinite(
            cantidadNumero
        )
            ? cantidadNumero
            : 0;

    // =================================================
    // TIEMPO
    // =================================================

    const tiempo =
        $(celdas[2])
            .text()
            .replace(/\s+/g, " ")
            .trim();

    // =================================================
    // RAW MATERIAL COST
    // =================================================

    const celdaMaterial =
        encontrarCeldaMaterial(
            $,
            celdas
        );

    const ingredientes =
        extraerIngredientesRaw(
            $,
            celdaMaterial
        );

    // =================================================
    // DEBUG RAW
    // =================================================

    if (
        ingredientes.length > 0
    ) {

        console.log(
            `🧱 Raw Material Cost — ${herramienta}:`,
            ingredientes
                .map(
                    ingrediente =>
                        `${ingrediente.nombre}=${ingrediente.cantidad}`
                )
                .join(", ")
        );
    }

    // =================================================
    // AZUFRE
    // =================================================

    let azufre = 0;

    for (
        const ingrediente
        of ingredientes
    ) {

        const nombre =
            normalizarTexto(
                ingrediente.nombre
            );

        if (
            nombre === "sulfur" ||
            nombre === "sulphur" ||
            nombre === "azufre"
        ) {

            azufre +=
                Number(
                    ingrediente.cantidad
                ) || 0;
        }
    }

    // =================================================
    // RESULTADO
    // =================================================

    filas.push({

        herramienta,

        herramientaOriginal,

        cantidad:
            cantidadSegura,

        cantidadTexto,

        cantidadNumero:
            cantidadSegura,

        tiempo,

        azufre,

        costoAzufre:
            azufre,

        polvora:
            0,

        ingredientes,

        receta:
            ingredientes
    });
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

    const explosivosPermitidos = [

        "c4",

        "timed explosive",

        "satchel charge",
        "satchel",

        "rocket",

        "hv rocket",
        "high velocity rocket",

        "propane tank",

        "beancan grenade",
        "beancan",

        "f1 grenade",
        "explosive grenade"
    ];

    const palabrasBalas = [

        "ammo",
        "ammunition",

        "municion",
        "munición",

        "bullet",
        "bala",
        "cartucho"
    ];

    const palabrasMelee = [

        "hatchet",
        "hacha",

        "pickaxe",
        "pico",

        "salvaged icepick",
        "salvaged pick",
        "salvaged pickaxe",
        "piolet",

        "hammer",
        "martillo",

        "machete",

        "sword",
        "espada",

        "spear",
        "lanza",

        "bone club",
        "garrote",

        "melee",
        "cuerpo a cuerpo",

        "ram",
        "ariete",

        "battering ram",

        "torch",
        "antorcha",

        "chainsaw",
        "motosierra",

        "jackhammer"
    ];

    const explosivosExcluidos = [

        "torpedo",

        "mine",
        "mina",

        "land mine",

        "catapult",
        "catapulta",

        "ballista",
        "balista",

        "mounted",
        "mounted weapon",

        "turret",
        "torreta",

        "vehicle",
        "vehiculo",
        "vehículo",

        "dispenser"
    ];

    for (
        const fila
        of filas
    ) {

        const texto =
            normalizarTexto(
                `${fila.herramientaOriginal || ""} ${fila.herramienta || ""}`
            );

        // =================================================
        // EXCLUIDOS
        // =================================================

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

        // =================================================
        // MUNICIÓN PRIMERO
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

            balas.push(fila);

            continue;
        }

        // =================================================
        // EXPLOSIVOS
        // =================================================

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
// DEDUPLICAR
// =====================================================

function eliminarDuplicados(
    filas
) {

    const mapa =
        new Map();

    for (
        const fila
        of filas
    ) {

        let nombre =
            fila.herramienta ||
            fila.herramientaOriginal ||
            "";

        nombre =
            limpiarNombreRust(
                nombre
            );

        const clave =
            normalizarTexto(
                nombre
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

        const azufreActual =
            Number(
                fila.azufre
            ) || 0;

        const azufreExistente =
            Number(
                existente.azufre
            ) || 0;

        const cantidadActual =
            Number(
                fila.cantidadNumero
            ) || 0;

        const cantidadExistente =
            Number(
                existente.cantidadNumero
            ) || 0;

        if (
            azufreActual <
            azufreExistente
        ) {

            mapa.set(
                clave,
                fila
            );

            continue;
        }

        if (
            azufreActual ===
                azufreExistente &&
            cantidadActual <
                cantidadExistente
        ) {

            mapa.set(
                clave,
                fila
            );
        }
    }

    return [
        ...mapa.values()
    ];
}

// =====================================================
// DEDUPLICAR MUNICIÓN
// =====================================================

function eliminarDuplicadosMunicion(
    filas
) {

    const mapa =
        new Map();

    for (
        const fila
        of filas
    ) {

        const nombre =
            limpiarNombreRust(
                fila.herramientaOriginal ||
                fila.herramienta
            );

        const clave =
            normalizarTexto(
                nombre
            );

        if (!clave) {
            continue;
        }

        if (
            !mapa.has(clave)
        ) {

            mapa.set(
                clave,
                {
                    ...fila,

                    herramienta:
                        nombre
                }
            );
        }
    }

    return [
        ...mapa.values()
    ];
}

// =====================================================
// ORDENAR ECONOMÍA
// =====================================================

function ordenarPorEconomia(
    filas
) {

    return [...filas]

        .filter(
            fila =>
                Number(fila.azufre) > 0 ||
                Number(fila.cantidadNumero) > 0
        )

        .sort(
            (a, b) => {

                const azufreA =
                    Number(a.azufre) || 0;

                const azufreB =
                    Number(b.azufre) || 0;

                if (
                    azufreA !==
                    azufreB
                ) {

                    return (
                        azufreA -
                        azufreB
                    );
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
// ORDENAR CANTIDAD
// =====================================================

function ordenarPorCantidad(
    filas
) {

    return [...filas]

        .filter(
            fila =>
                Number.isFinite(
                    Number(
                        fila.cantidadNumero
                    )
                ) &&
                Number(
                    fila.cantidadNumero
                ) > 0
        )

        .sort(
            (a, b) => {

                const cantidadA =
                    Number(
                        a.cantidadNumero
                    ) || 0;

                const cantidadB =
                    Number(
                        b.cantidadNumero
                    ) || 0;

                if (
                    cantidadA !==
                    cantidadB
                ) {

                    return (
                        cantidadA -
                        cantidadB
                    );
                }

                return (
                    Number(a.azufre) -
                    Number(b.azufre)
                );
            }
        );
}

// =====================================================
// TIEMPO
// =====================================================

function convertirTiempoASegundos(
    texto
) {

    if (!texto) {
        return Infinity;
    }

    const normalizado =
        String(texto)
            .toLowerCase();

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

async function consultarRaid(
    nombre
) {

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

        // =================================================
        // EXPLOSIVOS
        // =================================================

        const explosivosUnicos =
            eliminarDuplicados(
                clasificacion.explosivos
            );

        const economia =
            ordenarPorEconomia(
                explosivosUnicos
            );

        const cantidad =
            ordenarPorCantidad(
                explosivosUnicos
            );

        // =================================================
        // MELEE
        // =================================================

        const melee =
            ordenarMelee(
                eliminarDuplicados(
                    clasificacion.melee
                )
            );

        // =================================================
        // MUNICIÓN
        // =================================================

        const municionUnica =
            eliminarDuplicadosMunicion(
                clasificacion.balas
            );

        const balas =
            ordenarPorCantidad(
                municionUnica
            );

        // =================================================
        // RESULTADO
        // =================================================

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
                economia.slice(0, 10),

            explosivosEconomia:
                economia.slice(0, 10),

            explosivosCantidad:
                cantidad.slice(0, 10),

            melee:
                melee.slice(0, 10),

            balas:
                balas.slice(0, 10)
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

    clasificarRaid,

    extraerCantidadRaid
};