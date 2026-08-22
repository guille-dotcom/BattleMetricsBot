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
        "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7"
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
        const indice = texto
            .toLowerCase()
            .indexOf(parte.toLowerCase());

        if (indice !== -1) {
            texto = texto
                .substring(0, indice)
                .trim();
        }
    }

    texto = texto
        .replace(/\s+lit$/i, "")
        .replace(/\s+/g, " ")
        .trim();

    return texto;
}

// =====================================================
// CONVERTIR NOMBRE RUST
// =====================================================

function convertirNombreRust(nombre) {
    const original = limpiarNombreRust(nombre);

    if (!original) {
        return "";
    }

    const normalizado = normalizarTexto(original);

    if (
        normalizado === "explosive 5 56 rifle ammo" ||
        normalizado === "explosive 556 rifle ammo"
    ) {
        return "Explosive 5.56 Rifle Ammo";
    }

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
            const coincide = entrada.buscar.some(
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
        const url = `${base}/${slug}`;

        try {
            console.log(
                `🌐 RustHelp: intentando ${url}`
            );

            const response = await axios.get(
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
    const original = String(nombre || "").trim();

    if (!original) {
        return null;
    }

    const normalizado = normalizarTexto(original);

    let slug =
        ALIASES[normalizado] ||
        convertirSlug(original);

    const slugs = [slug];

    const sinDe = normalizado
        .replace(/\bde\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (sinDe) {
        slugs.push(convertirSlug(sinDe));
    }

    const sinThe = normalizado
        .replace(/\bthe\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (sinThe) {
        slugs.push(convertirSlug(sinThe));
    }

    const slugsUnicos = [...new Set(slugs)];

    for (const slugActual of slugsUnicos) {
        const pagina =
            await obtenerPagina(slugActual);

        if (!pagina) {
            continue;
        }

        const $ = cheerio.load(pagina.html);

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
                convertirNombreRust(titulo),

            url: pagina.url,

            html: pagina.html
        };
    }

    return null;
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

    const limpio = String(texto)
        .replace(/\u00a0/g, " ")
        .replace(/,/g, "")
        .trim();

    const patrones = [
        /^\s*[x×]\s*(\d+)\b/i,
        /^\s*(\d+)\s*[x×]\b/i,
        /^\s*(\d+)\b/
    ];

    for (const patron of patrones) {
        const match = limpio.match(patron);

        if (!match) {
            continue;
        }

        const numero = Number(match[1]);

        if (
            Number.isFinite(numero) &&
            numero >= 0
        ) {
            return numero;
        }
    }

    return 0;
}

// =====================================================
// EXTRAER NUMERO DE UN TEXTO
// =====================================================

function extraerPrimerNumero(texto) {
    if (
        texto === null ||
        texto === undefined
    ) {
        return 0;
    }

    const limpio = String(texto)
        .replace(/\u00a0/g, " ")
        .replace(/,/g, "")
        .trim();

    const match =
        limpio.match(/(\d+(?:\.\d+)?)/);

    if (!match) {
        return 0;
    }

    const numero = Number(match[1]);

    return Number.isFinite(numero)
        ? numero
        : 0;
}

// =====================================================
// FILAS RAID EXCLUIDAS
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
// EXTRAER NOMBRE DE HERRAMIENTA
// =====================================================

function extraerNombreHerramienta($, celda) {
    if (!celda) {
        return "";
    }

    let nombre = $(celda)
        .text()
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const enlaces = $(celda)
        .find("a")
        .toArray();

    for (const enlace of enlaces) {
        const textoEnlace = $(enlace)
            .text()
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        if (textoEnlace) {
            nombre = textoEnlace;
            break;
        }
    }

    return limpiarNombreRust(nombre);
}

// =====================================================
// EXTRAER TIEMPO
// =====================================================

function extraerTiempo($, celda) {
    if (!celda) {
        return "";
    }

    const texto = $(celda)
        .text()
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!texto) {
        return "";
    }

    return texto;
}

// =====================================================
// EXTRAER COMPONENTES DE AMOUNT
// =====================================================
//
// RustHelp puede mostrar:
//
// Rocket
// ×1 Rocket
// ×1 Rocket + ×8 Explosive 5.56
//
// Aquí intentamos conservar TODOS los componentes.
//
// =====================================================

function extraerComponentesAmount($, celda) {
    if (!celda) {
        return [];
    }

    const componentes = [];

    // -------------------------------------------------
    // Primero buscamos elementos que puedan representar
    // ítems individuales dentro de Amount.
    // -------------------------------------------------

    const candidatos = $(celda)
        .find("a, img")
        .toArray();

    for (const elemento of candidatos) {
        let nombre = "";

        if (elemento.name === "img") {
            nombre =
                $(elemento).attr("alt") ||
                $(elemento).attr("title") ||
                "";
        } else {
            nombre = $(elemento).text();
        }

        nombre = limpiarNombreRust(nombre);

        if (!nombre) {
            continue;
        }

        // Buscamos la cantidad cerca del elemento.
        let contenedor =
            $(elemento).closest("div, span, li");

        let textoContenedor =
            contenedor.text();

        let cantidad =
            extraerCantidadRaid(
                textoContenedor
            );

        if (cantidad <= 0) {
            cantidad =
                extraerCantidadRaid(
                    $(celda).text()
                );
        }

        componentes.push({
            nombre:
                convertirNombreRust(nombre),

            cantidad:
                cantidad > 0
                    ? cantidad
                    : 1
        });
    }

    // -------------------------------------------------
    // Si los elementos HTML no permiten detectar los
    // componentes, usamos el texto completo.
    // -------------------------------------------------

    if (componentes.length === 0) {
        const texto =
            $(celda)
                .text()
                .replace(/\u00a0/g, " ")
                .replace(/\s+/g, " ")
                .trim();

        if (texto) {
            const regex =
                /(?:^|\s|\+)\s*[x×]?\s*(\d+)?\s*([A-Za-zÀ-ÿ0-9.'-]+(?:\s+[A-Za-zÀ-ÿ0-9.'-]+){0,8})/gi;

            let match;

            while (
                (match = regex.exec(texto)) !== null
            ) {
                const cantidad =
                    match[1]
                        ? Number(match[1])
                        : 1;

                const nombre =
                    limpiarNombreRust(
                        match[2]
                    );

                if (!nombre) {
                    continue;
                }

                componentes.push({
                    nombre:
                        convertirNombreRust(
                            nombre
                        ),

                    cantidad:
                        Number.isFinite(cantidad)
                            ? cantidad
                            : 1
                });
            }
        }
    }

    // -------------------------------------------------
    // Eliminar duplicados.
    // -------------------------------------------------

    const mapa = new Map();

    for (const componente of componentes) {
        const clave =
            normalizarTexto(
                componente.nombre
            );

        if (!clave) {
            continue;
        }

        if (!mapa.has(clave)) {
            mapa.set(
                clave,
                componente
            );
        }
    }

    return [
        ...mapa.values()
    ];
}

// =====================================================
// TEXTO COMPLETO DE AMOUNT
// =====================================================

function extraerTextoAmount($, celda) {
    if (!celda) {
        return "";
    }

    return $(celda)
        .text()
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// =====================================================
// EXTRAER COSTO RAW MATERIAL
// =====================================================
//
// Se guarda internamente SOLO para ordenar Economía.
// Nunca se devuelve para mostrarlo en Discord.
//
// =====================================================

function extraerRawMaterialCost($, celda) {
    if (!celda) {
        return 0;
    }

    const texto =
        $(celda)
            .text()
            .replace(/\u00a0/g, " ")
            .replace(/,/g, "")
            .replace(/\s+/g, " ")
            .trim();

    if (!texto) {
        return 0;
    }

    // Intentamos obtener el primer número.
    return extraerPrimerNumero(texto);
}

// =====================================================
// DETECTAR COLUMNAS POR ENCABEZADO
// =====================================================

function obtenerIndicesColumnas($, tabla) {
    const indices = {
        herramienta: 0,
        amount: 1,
        tiempo: 2,
        costo: -1
    };

    const encabezados =
        $(tabla)
            .find("thead tr")
            .first()
            .find("th")
            .toArray();

    if (encabezados.length === 0) {
        return indices;
    }

    encabezados.forEach(
        (th, index) => {
            const texto =
                normalizarTexto(
                    $(th).text()
                );

            if (
                texto.includes("raid tool") ||
                texto.includes("raiding tool") ||
                texto.includes("tool") ||
                texto.includes("herramienta")
            ) {
                indices.herramienta = index;
            }

            if (
                texto.includes("amount") ||
                texto.includes("cantidad")
            ) {
                indices.amount = index;
            }

            if (
                texto.includes("time to raid") ||
                texto.includes("raid time") ||
                texto.includes("tiempo de raid") ||
                texto.includes("tiempo de raideo")
            ) {
                indices.tiempo = index;
            }

            if (
                texto.includes("raw material cost") ||
                texto.includes("raw cost") ||
                texto.includes("material cost") ||
                texto.includes("costo de materia prima") ||
                texto.includes("coste de materia prima")
            ) {
                indices.costo = index;
            }
        }
    );

    return indices;
}

// =====================================================
// PROCESAR FILA RAID
// =====================================================

function procesarFilaRaid(
    $,
    fila,
    filas,
    indices = null
) {
    const celdas =
        $(fila)
            .find("> td")
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
        !textoFila ||
        esFilaRaidExcluida(textoFila)
    ) {
        return;
    }

    const columnas =
        indices || {
            herramienta: 0,
            amount: 1,
            tiempo: 2,
            costo: -1
        };

    // =================================================
    // HERRAMIENTA
    // =================================================

    const herramientaOriginal =
        extraerNombreHerramienta(
            $,
            celdas[columnas.herramienta]
        );

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
    // AMOUNT
    // =================================================

    const celdaAmount =
        celdas[columnas.amount];

    const cantidadTexto =
        extraerTextoAmount(
            $,
            celdaAmount
        );

    const componentes =
        extraerComponentesAmount(
            $,
            celdaAmount
        );

    let cantidad =
        extraerCantidadRaid(
            cantidadTexto
        );

    // Si no encontramos cantidad en el texto,
    // usamos el primer componente.
    if (
        cantidad <= 0 &&
        componentes.length > 0
    ) {
        cantidad =
            Number(
                componentes[0].cantidad
            ) || 0;
    }

    // =================================================
    // TIEMPO
    // =================================================

    const tiempo =
        extraerTiempo(
            $,
            celdas[columnas.tiempo]
        );

    // =================================================
    // RAW MATERIAL COST
    // =================================================

    let rawMaterialCost = 0;

    if (
        columnas.costo >= 0 &&
        celdas[columnas.costo]
    ) {
        rawMaterialCost =
            extraerRawMaterialCost(
                $,
                celdas[columnas.costo]
            );
    } else {
        // Si no encontramos encabezados, intentamos
        // detectar una columna posterior al tiempo.
        const posibleCosto =
            celdas[columnas.tiempo + 1];

        if (posibleCosto) {
            rawMaterialCost =
                extraerRawMaterialCost(
                    $,
                    posibleCosto
                );
        }
    }

    // =================================================
    // VALIDACIÓN
    // =================================================

    if (
        cantidad <= 0 &&
        !tiempo &&
        componentes.length === 0
    ) {
        return;
    }

    // =================================================
    // RESULTADO
    // =================================================

    filas.push({
        herramienta,
        herramientaOriginal,

        cantidad,
        cantidadTexto,

        cantidadNumero:
            cantidad,

        // TODOS los componentes de Amount.
        componentes,

        // Alias útil para compatibilidad.
        amount:
            componentes,

        tiempo,

        // Solo interno.
        rawMaterialCost,

        // Compatibilidad.
        azufre: 0,
        costoAzufre: rawMaterialCost,
        polvora: 0,
        ingredientes: componentes,
        receta: componentes
    });
}

// =====================================================
// EXTRAER TODAS LAS OPCIONES RAID
// =====================================================

function extraerCostosRaid(html) {
    const $ = cheerio.load(html);

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
                ) ||
                normalizado.includes(
                    "coste de raideo"
                );

            if (!esTablaRaid) {
                return;
            }

            console.log(
                "🔎 RustHelp: tabla de raid encontrada"
            );

            const indices =
                obtenerIndicesColumnas(
                    $,
                    tabla
                );

            // -------------------------------------------------
            // tbody
            // -------------------------------------------------

            $(tabla)
                .find("tbody tr")
                .each(
                    (i, fila) => {
                        procesarFilaRaid(
                            $,
                            fila,
                            filas,
                            indices
                        );
                    }
                );

            // -------------------------------------------------
            // tr directos
            // -------------------------------------------------

            $(tabla)
                .find("> tr")
                .each(
                    (i, fila) => {
                        procesarFilaRaid(
                            $,
                            fila,
                            filas,
                            indices
                        );
                    }
                );
        }
    );

    // =====================================================
    // FALLBACK
    // =====================================================

    if (filas.length === 0) {
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

    return eliminarDuplicadosRaid(
        filas
    );
}

// =====================================================
// DEDUPLICAR OPCIONES RAID
// =====================================================

function eliminarDuplicadosRaid(filas) {
    const mapa = new Map();

    for (const fila of filas) {
        const nombre =
            limpiarNombreRust(
                fila.herramientaOriginal ||
                fila.herramienta
            );

        const clave =
            normalizarTexto(nombre);

        if (!clave) {
            continue;
        }

        if (!mapa.has(clave)) {
            mapa.set(
                clave,
                {
                    ...fila,

                    herramienta:
                        convertirNombreRust(
                            nombre
                        )
                }
            );
        }
    }

    return [
        ...mapa.values()
    ];
}

// =====================================================
// CLASIFICAR RAID
// =====================================================

function clasificarRaid(filas) {
    const explosivos = [];
    const melee = [];
    const balas = [];

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

    for (const fila of filas) {
        const texto =
            normalizarTexto(
                `${fila.herramientaOriginal || ""} ${fila.herramienta || ""}`
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

        // =================================================
        // MUNICIÓN
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
            continue;
        }

        // =================================================
        // EXPLOSIVOS
        // =================================================

        explosivos.push(fila);
    }

    return {
        explosivos,
        melee,
        balas
    };
}

// =====================================================
// ORDENAR POR ECONOMÍA
// =====================================================
//
// Ordena por Raw Material Cost.
// NO elimina ni modifica las 3 recomendadas.
//
// =====================================================

function ordenarPorEconomia(filas) {
    return [...filas].sort(
        (a, b) => {
            const costoA =
                Number(a.rawMaterialCost);

            const costoB =
                Number(b.rawMaterialCost);

            const validoA =
                Number.isFinite(costoA) &&
                costoA > 0;

            const validoB =
                Number.isFinite(costoB) &&
                costoB > 0;

            if (!validoA && !validoB) {
                return 0;
            }

            if (!validoA) {
                return 1;
            }

            if (!validoB) {
                return -1;
            }

            return costoA - costoB;
        }
    );
}

// =====================================================
// CALCULAR CANTIDAD TOTAL DE COMPONENTES
// =====================================================
//
// Para el botón Cantidad:
//
// Rocket ×1 + Explosive 5.56 ×8
//
// = 9 unidades.
//
// Se utiliza únicamente para ordenar.
// Los valores originales de Amount se conservan.
//
// =====================================================

function obtenerCantidadTotal(fila) {
    if (
        Array.isArray(
            fila.componentes
        ) &&
        fila.componentes.length > 0
    ) {
        const total =
            fila.componentes.reduce(
                (suma, componente) => {
                    const cantidad =
                        Number(
                            componente.cantidad
                        );

                    if (
                        !Number.isFinite(
                            cantidad
                        )
                    ) {
                        return suma;
                    }

                    return suma + cantidad;
                },
                0
            );

        if (total > 0) {
            return total;
        }
    }

    const cantidad =
        Number(
            fila.cantidadNumero
        );

    return Number.isFinite(cantidad)
        ? cantidad
        : Infinity;
}

// =====================================================
// ORDENAR POR CANTIDAD
// =====================================================

function ordenarPorCantidad(filas) {
    return [...filas]
        .filter(
            fila =>
                obtenerCantidadTotal(
                    fila
                ) !== Infinity
        )
        .sort(
            (a, b) =>
                obtenerCantidadTotal(a) -
                obtenerCantidadTotal(b)
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
            Number(horas[1]) * 3600;
    }

    if (minutos) {
        segundos +=
            Number(minutos[1]) * 60;
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
// ORDENAR MELEE POR TIEMPO
// =====================================================

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
// OBTENER RECOMENDADAS
// =====================================================
//
// RustHelp coloca las opciones recomendadas primero.
// Conservamos exactamente las primeras 3.
//
// =====================================================

function obtenerRecomendadas(filas) {
    return [...filas].slice(0, 3);
}

// =====================================================
// OBTENER 7 OPCIONES ADICIONALES
// =====================================================
//
// Importante:
//
// Las 7 opciones NO deben repetir las 3
// recomendadas.
//
// =====================================================

function obtenerSieteAdicionales(
    filas,
    recomendadas
) {
    const clavesRecomendadas =
        new Set(
            recomendadas.map(
                fila =>
                    normalizarTexto(
                        fila.herramienta
                    )
            )
        );

    return filas
        .filter(
            fila =>
                !clavesRecomendadas.has(
                    normalizarTexto(
                        fila.herramienta
                    )
                )
        )
        .slice(0, 7);
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
            `📊 RustHelp: ${filas.length} opciones de raid encontradas`
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
        //
        // Las primeras 3 son las recomendadas de RustHelp.
        //
        // ECONOMÍA:
        // 3 recomendadas + 7 adicionales por costo.
        //
        // CANTIDAD:
        // 3 recomendadas + 7 adicionales por cantidad.
        //
        // =================================================

        const explosivosOriginales =
            [...clasificacion.explosivos];

        const explosivosRecomendados =
            obtenerRecomendadas(
                explosivosOriginales
            );

        // -------------------------------------------------
        // ECONOMÍA
        // -------------------------------------------------

        const explosivosPorEconomia =
            ordenarPorEconomia(
                explosivosOriginales
            );

        const sieteEconomia =
            obtenerSieteAdicionales(
                explosivosPorEconomia,
                explosivosRecomendados
            );

        const explosivosEconomia = [
            ...explosivosRecomendados,
            ...sieteEconomia
        ];

        // -------------------------------------------------
        // CANTIDAD
        // -------------------------------------------------

        const explosivosPorCantidad =
            ordenarPorCantidad(
                explosivosOriginales
            );

        const sieteCantidad =
            obtenerSieteAdicionales(
                explosivosPorCantidad,
                explosivosRecomendados
            );

        const explosivosCantidad = [
            ...explosivosRecomendados,
            ...sieteCantidad
        ];

        // =================================================
        // MELEE
        // =================================================
        //
        // AQUÍ NO mostramos las 3 recomendadas.
        //
        // Directamente las 7 opciones más rápidas.
        //
        // =================================================

        const meleeOrdenado =
            ordenarMelee(
                clasificacion.melee
            );

        const melee =
            meleeOrdenado.slice(0, 7);

        // =================================================
        // MUNICIÓN
        // =================================================

        const balas =
            ordenarPorCantidad(
                clasificacion.balas
            );

        // =================================================
        // TODAS LAS OPCIONES
        // =================================================

        const todasLasOpciones =
            filas;

        // =================================================
        // LOG DE DEBUG
        // =================================================

        console.log(
            `💥 Recomendadas: ${explosivosRecomendados
                .map(
                    x =>
                        `${x.herramienta} (${x.tiempo})`
                )
                .join(" | ")}`
        );

        console.log(
            `💰 Economía: ${explosivosEconomia
                .map(
                    x =>
                        `${x.herramienta} [${x.rawMaterialCost}]`
                )
                .join(" | ")}`
        );

        console.log(
            `📦 Cantidad: ${explosivosCantidad
                .map(
                    x =>
                        `${x.herramienta} [${obtenerCantidadTotal(x)}]`
                )
                .join(" | ")}`
        );

        console.log(
            `⚔️ Melee: ${melee
                .map(
                    x =>
                        `${x.herramienta} (${x.tiempo})`
                )
                .join(" | ")}`
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

            // Todas las opciones.
            todos:
                todasLasOpciones,

            // =================================================
            // RECOMENDADAS
            // =================================================

            explosivosRecomendados,

            // =================================================
            // ECONOMÍA
            // =================================================
            //
            // 3 recomendadas + 7 por costo.
            //
            // =================================================

            explosivosEconomia,

            // =================================================
            // CANTIDAD
            // =================================================
            //
            // 3 recomendadas + 7 por cantidad.
            //
            // =================================================

            explosivosCantidad,

            // =================================================
            // COMPATIBILIDAD
            // =================================================

            explosivos:
                explosivosEconomia,

            // =================================================
            // MELEE
            // =================================================
            //
            // Solo 7 por tiempo.
            //
            // =================================================

            melee,

            // =================================================
            // MUNICIÓN
            // =================================================

            balas
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