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
// MAPA DE MATERIALES
// =====================================================

const MATERIALES_RUST = [
    {
        nombre: "Sulfur",

        variantes: [
            "sulfur",
            "sulphur",
            "azufre"
        ],

        slugs: [
            "sulfur",
            "sulphur"
        ]
    },

    {
        nombre: "Charcoal",

        variantes: [
            "charcoal",
            "carbon"
        ],

        slugs: [
            "charcoal"
        ]
    },

    {
        nombre: "Metal Fragments",

        variantes: [
            "metal fragments",
            "metal fragment",
            "fragmentos de metal"
        ],

        slugs: [
            "metal-fragments",
            "metal-fragment"
        ]
    },

    {
        nombre: "Metal Pipe",

        variantes: [
            "metal pipe",
            "tubo de metal",
            "tuberia metalica",
            "tuberia de metal"
        ],

        slugs: [
            "metal-pipe"
        ]
    },

    {
        nombre: "Low Grade Fuel",

        variantes: [
            "low grade fuel",
            "low grade",
            "low-grade fuel",
            "combustible de baja calidad"
        ],

        slugs: [
            "low-grade-fuel",
            "low-grade"
        ]
    },

    {
        nombre: "Cloth",

        variantes: [
            "cloth",
            "tela"
        ],

        slugs: [
            "cloth"
        ]
    },

    {
        nombre: "Rope",

        variantes: [
            "rope",
            "cuerda"
        ],

        slugs: [
            "rope"
        ]
    },

    {
        nombre: "Tech Trash",

        variantes: [
            "tech trash",
            "tech-trash"
        ],

        slugs: [
            "tech-trash"
        ]
    },

    {
        nombre: "Gears",

        variantes: [
            "gears",
            "gear"
        ],

        slugs: [
            "gears",
            "gear"
        ]
    },

    {
        nombre: "Crude Oil",

        variantes: [
            "crude oil",
            "petroleo crudo"
        ],

        slugs: [
            "crude-oil"
        ]
    },

    {
        nombre: "Animal Fat",

        variantes: [
            "animal fat",
            "grasa animal"
        ],

        slugs: [
            "animal-fat"
        ]
    },

    {
        nombre: "Leather",

        variantes: [
            "leather",
            "cuero"
        ],

        slugs: [
            "leather"
        ]
    },

    {
        nombre: "Wood",

        variantes: [
            "wood",
            "madera"
        ],

        slugs: [
            "wood"
        ]
    },

    {
        nombre: "Metal Blade",

        variantes: [
            "metal blade"
        ],

        slugs: [
            "metal-blade"
        ]
    },

    {
        nombre: "Metal Spring",

        variantes: [
            "metal spring"
        ],

        slugs: [
            "metal-spring"
        ]
    },

    {
        nombre: "Semi Automatic Body",

        variantes: [
            "semi automatic body"
        ],

        slugs: [
            "semi-automatic-body"
        ]
    },

    {
        nombre: "SMG Body",

        variantes: [
            "smg body"
        ],

        slugs: [
            "smg-body"
        ]
    },

    {
        nombre: "Rifle Body",

        variantes: [
            "rifle body"
        ],

        slugs: [
            "rifle-body"
        ]
    },

    {
        nombre: "HQM",

        variantes: [
            "high quality metal",
            "hq metal",
            "hqm"
        ],

        slugs: [
            "high-quality-metal",
            "hq-metal"
        ]
    }
];

// =====================================================
// RECETAS DE RESPALDO DE RAID
// =====================================================
//
// RustHelp puede cambiar ocasionalmente la estructura
// HTML de la celda "Raw Material Cost".
//
// Estos valores SOLO se utilizan cuando RustHelp no
// entrega correctamente los materiales.
//
// IMPORTANTE:
// Rocket:
// - Low Grade Fuel: 75
// - Metal Pipe: 2
//
// =====================================================

const RECETAS_RAID_RESPALDO = {
    "rocket": [
        {
            nombre: "Low Grade Fuel",
            cantidad: 75
        },
        {
            nombre: "Metal Pipe",
            cantidad: 2
        }
    ],

    "hv rocket": [
        {
            nombre: "Metal Pipe",
            cantidad: 1
        }
    ],

    "satchel charge": [
        {
            nombre: "Cloth",
            cantidad: 10
        },
        {
            nombre: "Rope",
            cantidad: 1
        }
    ],

    "beancan grenade": [
        {
            nombre: "Metal Fragments",
            cantidad: 20
        }
    ]
};

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
        .replace(/\s*\[lit\]\s*/gi, " ")
        .replace(/\s+lit$/gi, "")
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

                    validateStatus: status =>
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
        slugs.push(
            convertirSlug(sinDe)
        );
    }

    const sinThe = normalizado
        .replace(/\bthe\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (sinThe) {
        slugs.push(
            convertirSlug(sinThe)
        );
    }

    const slugsUnicos = [
        ...new Set(slugs)
    ];

    for (const slugActual of slugsUnicos) {
        const pagina =
            await obtenerPagina(slugActual);

        if (!pagina) {
            continue;
        }

        const $ =
            cheerio.load(pagina.html);

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
            .match(/\d[\d.]*/);

    if (!valor) {
        return 0;
    }

    const numero =
        Number(
            valor[0].replace(/\./g, "")
        );

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

    const limpio =
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
// OBTENER SLUG DESDE HREF
// =====================================================

function obtenerSlugHref(href) {
    if (!href) {
        return "";
    }

    try {
        const limpio =
            String(href)
                .split("?")[0]
                .split("#")[0]
                .replace(/\/+$/, "");

        const partes =
            limpio
                .split("/")
                .filter(Boolean);

        if (!partes.length) {
            return "";
        }

        return normalizarTexto(
            partes[partes.length - 1]
                .replace(/-/g, " ")
        );

    } catch (error) {
        return "";
    }
}

// =====================================================
// DETECTAR MATERIAL
// =====================================================

function detectarMaterial(href, texto) {
    const textoNormalizado =
        normalizarTexto(texto);

    const slugNormalizado =
        obtenerSlugHref(href);

    const combinado =
        `${textoNormalizado} ${slugNormalizado}`;

    for (const material of MATERIALES_RUST) {
        const coincideTexto =
            material.variantes.some(
                variante =>
                    combinado.includes(
                        normalizarTexto(variante)
                    )
            );

        if (coincideTexto) {
            return material.nombre;
        }

        const coincideSlug =
            material.slugs.some(
                slug =>
                    slugNormalizado ===
                    normalizarTexto(
                        slug.replace(/-/g, " ")
                    )
            );

        if (coincideSlug) {
            return material.nombre;
        }
    }

    return null;
}

// =====================================================
// MATERIAL DESDE HREF
// =====================================================

function materialDesdeHref(href) {
    const slug =
        obtenerSlugHref(href);

    if (!slug) {
        return null;
    }

    for (const material of MATERIALES_RUST) {
        const coincide =
            material.slugs.some(
                candidato =>
                    slug ===
                    normalizarTexto(
                        candidato.replace(
                            /-/g,
                            " "
                        )
                    )
            );

        if (coincide) {
            return material.nombre;
        }
    }

    return null;
}

// =====================================================
// LIMPIAR TEXTO DE CANTIDAD
// =====================================================

function limpiarCantidadMaterial(texto) {
    return String(texto || "")
        .replace(/\u00a0/g, " ")
        .replace(/,/g, "")
        .trim();
}

// =====================================================
// EXTRAER CANTIDAD DE UN ELEMENTO
// =====================================================

function extraerCantidadDeElemento($, elemento) {
    const valores = [
        $(elemento).attr("data-amount"),
        $(elemento).attr("data-quantity"),
        $(elemento).attr("data-count"),
        $(elemento).attr("data-value"),
        $(elemento).attr("aria-label"),
        $(elemento).attr("title"),
        $(elemento).text()
    ];

    for (const valor of valores) {
        if (!valor) {
            continue;
        }

        const limpio =
            String(valor)
                .replace(/\u00a0/g, " ")
                .replace(/,/g, " ")
                .trim();

        let match =
            limpio.match(
                /[x×]\s*(\d[\d.]*)/i
            );

        if (!match) {
            match =
                limpio.match(
                    /\b(\d[\d.]*)\b/
                );
        }

        if (match) {
            const numero =
                Number(
                    match[1].replace(/\./g, "")
                );

            if (
                Number.isFinite(numero) &&
                numero > 0
            ) {
                return numero;
            }
        }
    }

    return 0;
}

// =====================================================
// EXTRAER CANTIDAD DE UN ENLACE
// =====================================================

function extraerCantidadDeEnlace($, enlace) {
    return extraerCantidadDeElemento(
        $,
        enlace
    );
}

// =====================================================
// EXTRAER INGREDIENTES RAW
// =====================================================

function extraerIngredientesRaw($, celda) {
    const ingredientes = [];

    if (!celda) {
        return ingredientes;
    }

    // =================================================
    // 1. ENLACES
    // =================================================

    $(celda)
        .find("a")
        .each((i, enlace) => {
            const href =
                $(enlace)
                    .attr("href") || "";

            const texto =
                $(enlace)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();

            const nombreDetectado =
                detectarMaterial(
                    href,
                    texto
                ) ||
                materialDesdeHref(
                    href
                );

            if (!nombreDetectado) {
                return;
            }

            const cantidad =
                extraerCantidadDeEnlace(
                    $,
                    enlace
                );

            if (
                !Number.isFinite(cantidad) ||
                cantidad <= 0
            ) {
                return;
            }

            ingredientes.push({
                nombre:
                    nombreDetectado,

                cantidad,

                href
            });
        });

    // =================================================
    // 2. ELEMENTOS DATA
    // =================================================

    $(celda)
        .find(
            "[data-item], [data-resource], [data-material], [data-amount], [data-quantity], [data-count]"
        )
        .each((i, elemento) => {
            const texto =
                $(elemento)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();

            const href =
                $(elemento)
                    .attr("href") ||

                $(elemento)
                    .find("a")
                    .first()
                    .attr("href") ||

                "";

            const nombreDetectado =
                detectarMaterial(
                    href,
                    texto
                ) ||
                materialDesdeHref(
                    href
                );

            if (!nombreDetectado) {
                return;
            }

            const cantidad =
                extraerCantidadDeElemento(
                    $,
                    elemento
                );

            if (
                !Number.isFinite(cantidad) ||
                cantidad <= 0
            ) {
                return;
            }

            ingredientes.push({
                nombre:
                    nombreDetectado,

                cantidad,

                href
            });
        });

    // =================================================
    // 3. ANALIZAR BLOQUES DE TEXTO
    // =================================================

    const textoCelda =
        $(celda)
            .text()
            .replace(/\u00a0/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    for (const material of MATERIALES_RUST) {
        for (const variante of material.variantes) {
            const regex =
                new RegExp(
                    `${escaparRegex(variante)}\\s*(?:[:x×]|\\s)\\s*(\\d[\\d,.]*)`,
                    "i"
                );

            const match =
                textoCelda.match(regex);

            if (!match) {
                continue;
            }

            const cantidad =
                Number(
                    match[1]
                        .replace(/,/g, "")
                        .replace(/\./g, "")
                );

            if (
                !Number.isFinite(cantidad) ||
                cantidad <= 0
            ) {
                continue;
            }

            ingredientes.push({
                nombre:
                    material.nombre,

                cantidad,

                href: ""
            });

            break;
        }
    }

    // =================================================
    // 4. DETECCIÓN POR NOMBRE + NÚMERO
    // =================================================
    //
    // Algunas versiones de RustHelp pueden tener:
    //
    // Low Grade Fuel
    // 75
    //
    // en nodos separados.
    //
    // Aquí analizamos los elementos internos.
    // =================================================

    $(celda)
        .find("*")
        .each((i, elemento) => {
            const texto =
                $(elemento)
                    .clone()
                    .children()
                    .remove()
                    .end()
                    .text()
                    .replace(/\u00a0/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

            if (!texto) {
                return;
            }

            const nombreDetectado =
                detectarMaterial(
                    $(elemento).attr("href") || "",
                    texto
                );

            if (!nombreDetectado) {
                return;
            }

            const cantidad =
                extraerCantidadDeElemento(
                    $,
                    elemento
                );

            if (
                Number.isFinite(cantidad) &&
                cantidad > 0
            ) {
                ingredientes.push({
                    nombre:
                        nombreDetectado,

                    cantidad,

                    href:
                        $(elemento)
                            .attr("href") || ""
                });
            }
        });

    // =================================================
    // UNIFICAR
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

            existente.cantidad =
                Math.max(
                    Number(
                        existente.cantidad
                    ) || 0,

                    Number(
                        ingrediente.cantidad
                    ) || 0
                );
        }
    }

    return [
        ...mapa.values()
    ];
}

// =====================================================
// ESCAPAR REGEX
// =====================================================

function escaparRegex(texto) {
    return String(texto || "")
        .replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
        );
}

// =====================================================
// ES MATERIAL RAW
// =====================================================

function esMaterialRaw(href, texto) {
    return Boolean(
        detectarMaterial(
            href,
            texto
        )
    );
}

// =====================================================
// NORMALIZAR MATERIAL
// =====================================================

function normalizarNombreMaterial(
    nombre,
    href
) {
    const detectado =
        detectarMaterial(
            href,
            nombre
        );

    if (detectado) {
        return detectado;
    }

    let texto =
        String(nombre || "")
            .replace(/\s+/g, " ")
            .trim();

    if (!texto && href) {
        const slug =
            obtenerSlugHref(href);

        if (slug) {
            return slug.replace(
                /\b\w/g,
                letra =>
                    letra.toUpperCase()
            );
        }
    }

    return texto;
}

// =====================================================
// BUSCAR CELDA RAW MATERIAL COST
// =====================================================

function encontrarCeldaMaterial(
    $,
    celdas
) {
    let mejorCelda = null;
    let mayorCantidadMateriales = 0;

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

        let cantidadMateriales = 0;

        for (const enlace of enlaces) {
            const href =
                $(enlace)
                    .attr("href") || "";

            const texto =
                $(enlace)
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();

            if (
                esMaterialRaw(
                    href,
                    texto
                )
            ) {
                cantidadMateriales++;
            }
        }

        // También analizamos texto completo.
        const texto =
            $(celda)
                .text()
                .replace(/\s+/g, " ")
                .trim();

        const normalizado =
            normalizarTexto(texto);

        const contieneMaterial =
            MATERIALES_RUST.some(
                material =>
                    material.variantes.some(
                        variante =>
                            normalizado.includes(
                                normalizarTexto(
                                    variante
                                )
                            )
                    )
            );

        if (contieneMaterial) {
            cantidadMateriales++;
        }

        if (
            cantidadMateriales >
            mayorCantidadMateriales
        ) {
            mayorCantidadMateriales =
                cantidadMateriales;

            mejorCelda =
                celda;
        }
    }

    return mejorCelda;
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
                normalizarTexto(
                    variante
                )
            )
    );
}

// =====================================================
// APLICAR RECETA DE RESPALDO
// =====================================================

function aplicarRecetaRespaldo(
    herramienta,
    ingredientes
) {
    const clave =
        normalizarTexto(herramienta);

    const receta =
        RECETAS_RAID_RESPALDO[clave];

    if (!receta) {
        return ingredientes;
    }

    // Si RustHelp ya entregó ingredientes,
    // NO los reemplazamos.
    if (
        Array.isArray(ingredientes) &&
        ingredientes.length > 0
    ) {
        return ingredientes;
    }

    console.log(
        `🛠️ RustHelp: aplicando receta de respaldo para ${herramienta}`
    );

    return receta.map(
        ingrediente => ({
            ...ingrediente,
            href: ""
        })
    );
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
                .each((i, fila) => {
                    procesarFilaRaid(
                        $,
                        fila,
                        filas
                    );
                });
        }
    );

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

    let ingredientes =
        extraerIngredientesRaw(
            $,
            celdaMaterial
        );

    // =================================================
    // RESPALDO
    // =================================================

    ingredientes =
        aplicarRecetaRespaldo(
            herramienta,
            ingredientes
        );

    // =================================================
    // DEBUG
    // =================================================

    if (ingredientes.length > 0) {
        console.log(
            `🧪 ${herramienta}:`,
            ingredientes
                .map(
                    material =>
                        `${material.nombre}=${material.cantidad}`
                )
                .join(", ")
        );
    } else {
        console.log(
            `⚠️ ${herramienta}: no se detectaron materias primas`
        );
    }

    // =================================================
    // AZUFRE
    // =================================================

    let azufre = 0;

    for (const ingrediente of ingredientes) {
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

        polvora: 0,

        ingredientes,

        receta:
            ingredientes
    });
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

function eliminarDuplicados(filas) {
    const mapa =
        new Map();

    for (const fila of filas) {
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

    for (const fila of filas) {
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

        if (!mapa.has(clave)) {
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

function ordenarPorEconomia(filas) {
    return [...filas]
        .filter(
            fila =>
                Number(fila.azufre) > 0 ||
                Number(fila.cantidadNumero) > 0
        )
        .sort((a, b) => {
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
        });
}

// =====================================================
// ORDENAR CANTIDAD
// =====================================================

function ordenarPorCantidad(filas) {
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
        .sort((a, b) => {
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
        });
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