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
        buscar: [
            "explosive 5.56",
            "explosive ammo",
            "explosive ammunition"
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
            texto = texto.substring(0, indice).trim();
        }
    }

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

    for (const entrada of NOMBRES_RUST) {
        const coincide = entrada.buscar.some((palabra) =>
            normalizado.includes(normalizarTexto(palabra))
        );

        if (coincide) {
            return entrada.nombre;
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
            console.log(`🌐 RustHelp: intentando ${url}`);

            const response = await axios.get(url, {
                headers: HEADERS,
                timeout: 15000,
                validateStatus: (status) =>
                    status >= 200 && status < 400
            });

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
        const pagina = await obtenerPagina(slugActual);

        if (!pagina) {
            continue;
        }

        const $ = cheerio.load(pagina.html);

        const titulo = $("h1")
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
            nombreRust: convertirNombreRust(titulo),
            url: pagina.url,
            html: pagina.html
        };
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

    let limpio = String(texto)
        .replace(/[×x]/gi, "")
        .trim();

    limpio = limpio.replace(/[^\d]/g, "");

    return Number(limpio) || 0;
}

// =====================================================
// MATERIALES RAW MATERIAL COST
// =====================================================

function esMaterialRaw(href, texto) {
    const objetivo = normalizarTexto(
        `${href || ""} ${texto || ""}`
    );

    const materiales = [
        "sulfur",
        "sulphur",
        "azufre",

        "charcoal",
        "carbon",

        "metal fragments",
        "metal fragment",
        "fragmentos de metal",

        "metal pipe",
        "tubo de metal",
        "tuberia metalica",

        "low grade fuel",
        "low grade",

        "cloth",
        "tela",

        "rope",
        "cuerda",

        "tech trash",
        "tech-trash",

        "gears",
        "gear",

        "crude oil",

        "animal fat",

        "leather",

        "wood"
    ];

    return materiales.some((material) =>
        objetivo.includes(normalizarTexto(material))
    );
}

// =====================================================
// NORMALIZAR NOMBRE MATERIAL
// =====================================================

function normalizarNombreMaterial(nombre, href) {
    let texto = String(nombre || "")
        .replace(/\s+/g, " ")
        .trim();

    const normalizado = normalizarTexto(texto);

    if (
        normalizado === "sulfur" ||
        normalizado === "sulphur" ||
        normalizado === "azufre"
    ) {
        return "Sulfur";
    }

    if (
        normalizado === "charcoal" ||
        normalizado === "carbon"
    ) {
        return "Charcoal";
    }

    if (
        normalizado === "metal fragments" ||
        normalizado === "metal fragment" ||
        normalizado === "fragmentos de metal"
    ) {
        return "Metal Fragments";
    }

    if (
        normalizado === "metal pipe" ||
        normalizado === "tubo de metal" ||
        normalizado === "tuberia metalica"
    ) {
        return "Metal Pipe";
    }

    if (
        normalizado === "low grade fuel" ||
        normalizado === "low grade"
    ) {
        return "Low Grade Fuel";
    }

    if (
        normalizado === "cloth" ||
        normalizado === "tela"
    ) {
        return "Cloth";
    }

    if (
        normalizado === "rope" ||
        normalizado === "cuerda"
    ) {
        return "Rope";
    }

    if (
        normalizado === "tech trash" ||
        normalizado === "tech-trash"
    ) {
        return "Tech Trash";
    }

    if (!texto && href) {
        const partes = String(href)
            .split("/")
            .filter(Boolean);

        const slug = partes[partes.length - 1];

        if (slug) {
            return slug
                .replace(/-/g, " ")
                .replace(/\b\w/g, (letra) =>
                    letra.toUpperCase()
                );
        }
    }

    return texto;
}

// =====================================================
// EXTRAER INGREDIENTES RAW
// =====================================================

function extraerIngredientesRaw($, celda) {
    const ingredientes = [];

    if (!celda) {
        return ingredientes;
    }

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

            if (!texto) {
                return;
            }

            if (!esMaterialRaw(href, texto)) {
                return;
            }

            /*
             * IMPORTANTE:
             *
             * NO multiplicamos por la cantidad
             * del explosivo.
             *
             * RustHelp ya muestra aquí el
             * RAW MATERIAL COST TOTAL.
             *
             * Ejemplo HV Rocket x4:
             *
             * Sulfur ×800
             * Charcoal ×1,200
             * Metal Pipe ×4
             */

            const cantidad = extraerNumero(texto);

            if (cantidad <= 0) {
                return;
            }

            let nombre = texto
                .replace(/[×x]\s*[\d,.]+/gi, "")
                .replace(/[\d,.]+/g, "")
                .replace(/\s+/g, " ")
                .trim();

            if (!nombre) {
                nombre =
                    href
                        .split("/")
                        .filter(Boolean)
                        .pop() || "Material";
            }

            nombre = normalizarNombreMaterial(
                nombre,
                href
            );

            ingredientes.push({
                nombre,
                cantidad,
                href
            });
        });

    // =================================================
    // ELIMINAR DUPLICADOS
    // =================================================

    const mapa = new Map();

    for (const ingrediente of ingredientes) {
        const clave = normalizarTexto(
            ingrediente.nombre
        );

        if (!clave) {
            continue;
        }

        if (!mapa.has(clave)) {
            mapa.set(clave, {
                ...ingrediente
            });
        } else {
            mapa.get(clave).cantidad +=
                ingrediente.cantidad;
        }
    }

    return [...mapa.values()];
}

// =====================================================
// BUSCAR CELDA RAW MATERIAL COST
// =====================================================

function encontrarCeldaMaterial($, celdas) {
    for (
        let indice = 3;
        indice < celdas.length;
        indice++
    ) {
        const celda = celdas[indice];

        const texto =
            $(celda)
                .text()
                .replace(/\s+/g, " ")
                .trim();

        const normalizado =
            normalizarTexto(texto);

        /*
         * Preferimos una celda que contenga
         * materiales RAW.
         */

        const tieneMaterial =
            $(celda)
                .find("a")
                .toArray()
                .some((enlace) =>
                    esMaterialRaw(
                        $(enlace).attr("href"),
                        $(enlace).text()
                    )
                );

        if (tieneMaterial) {
            return celda;
        }

        if (
            normalizado.includes("sulfur") ||
            normalizado.includes("charcoal") ||
            normalizado.includes("metal pipe") ||
            normalizado.includes("metal fragments") ||
            normalizado.includes("low grade") ||
            normalizado.includes("cloth") ||
            normalizado.includes("rope") ||
            normalizado.includes("tech trash")
        ) {
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

function esFilaRaidExcluida(texto) {
    const normalizado =
        normalizarTexto(texto);

    return VARIANTES_RAID_EXCLUIDAS.some(
        (variante) =>
            normalizado.includes(
                normalizarTexto(variante)
            )
    );
}

// =====================================================
// EXTRAER COSTOS RAID
// =====================================================

function extraerCostosRaid(html) {
    const $ = cheerio.load(html);

    const filas = [];

    $("table").each((indice, tabla) => {
        const textoTabla =
            $(tabla)
                .text()
                .replace(/\s+/g, " ")
                .trim();

        const normalizado =
            normalizarTexto(textoTabla);

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
            .each((i, fila) => {
                procesarFilaRaid(
                    $,
                    fila,
                    filas
                );
            });
    });

    if (filas.length === 0) {
        console.log(
            "⚠️ RustHelp: usando fallback de tablas."
        );

        $("table tr").each((i, fila) => {
            procesarFilaRaid(
                $,
                fila,
                filas
            );
        });
    }

    return filas;
}

// =====================================================
// PROCESAR FILA RAID
// =====================================================

function procesarFilaRaid($, fila, filas) {
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

    if (esFilaRaidExcluida(textoFila)) {
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

    const cantidadNumero =
        extraerNumero(cantidad);

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

    /*
     * AQUÍ ESTÁ EL CAMBIO IMPORTANTE:
     *
     * Solo extraemos los materiales que RustHelp
     * muestra en Raw Material Cost.
     *
     * No calculamos gunpowder.
     * No multiplicamos por cantidad.
     */

    const ingredientes =
        extraerIngredientesRaw(
            $,
            celdaMaterial
        );

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

    filas.push({
        herramienta,
        herramientaOriginal,

        cantidad,
        cantidadNumero,

        tiempo,

        azufre,

        costoAzufre: azufre,

        /*
         * Se conserva por compatibilidad.
         * Ya NO representa pólvora de fabricación.
         */
        polvora: 0,

        ingredientes,

        receta: ingredientes
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
                (palabra) =>
                    texto.includes(
                        normalizarTexto(palabra)
                    )
            )
        ) {
            continue;
        }

        if (
            palabrasBalas.some(
                (palabra) =>
                    texto.includes(
                        normalizarTexto(palabra)
                    )
            )
        ) {
            balas.push(fila);
            continue;
        }

        if (
            explosivosPermitidos.some(
                (palabra) =>
                    texto.includes(
                        normalizarTexto(palabra)
                    )
            )
        ) {
            explosivos.push(fila);
            continue;
        }

        if (
            palabrasMelee.some(
                (palabra) =>
                    texto.includes(
                        normalizarTexto(palabra)
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
// ELIMINAR DUPLICADOS
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
            mapa.set(clave, fila);
            continue;
        }

        const azufreActual =
            Number(fila.azufre) || 0;

        const azufreExistente =
            Number(existente.azufre) || 0;

        if (
            azufreActual <
            azufreExistente
        ) {
            mapa.set(clave, fila);
            continue;
        }

        if (
            azufreActual ===
            azufreExistente
        ) {
            if (
                Number(fila.cantidadNumero) <
                Number(existente.cantidadNumero)
            ) {
                mapa.set(clave, fila);
            }
        }
    }

    return [...mapa.values()];
}

// =====================================================
// ORDENAR ECONOMIA
// =====================================================

function ordenarPorEconomia(filas) {
    return [...filas]
        .filter(
            (fila) =>
                Number(fila.azufre) > 0 ||
                Number(fila.cantidadNumero) > 0
        )
        .sort((a, b) => {
            const azufreA =
                Number(a.azufre) || 0;

            const azufreB =
                Number(b.azufre) || 0;

            if (azufreA !== azufreB) {
                return azufreA - azufreB;
            }

            return (
                Number(a.cantidadNumero) -
                Number(b.cantidadNumero)
            );
        });
}

// =====================================================
// ORDENAR CANTIDAD
// =====================================================

function ordenarPorCantidad(filas) {
    return [...filas]
        .filter(
            (fila) =>
                Number(fila.cantidadNumero) > 0
        )
        .sort((a, b) => {
            const diferencia =
                Number(a.cantidadNumero) -
                Number(b.cantidadNumero);

            if (diferencia !== 0) {
                return diferencia;
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

function convertirTiempoASegundos(texto) {
    if (!texto) {
        return Infinity;
    }

    const normalizado =
        String(texto).toLowerCase();

    let segundos = 0;

    const horas =
        normalizado.match(/(\d+)\s*h/);

    const minutos =
        normalizado.match(/(\d+)\s*m/);

    const segundosMatch =
        normalizado.match(/(\d+)\s*s/);

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
// ORDENAR MELEE
// =====================================================

function ordenarMelee(filas) {
    return [...filas].sort(
        (a, b) =>
            convertirTiempoASegundos(a.tiempo) -
            convertirTiempoASegundos(b.tiempo)
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
            await buscarItemRustHelp(nombre);

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
            clasificarRaid(filas);

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

        const balas =
            ordenarPorCantidad(
                clasificacion.balas
            );

        return {
            nombre: item.nombre,

            nombreRust:
                item.nombreRust,

            url: item.url,

            todos: filas,

            explosivos:
                economia.slice(0, 10),

            explosivosEconomia:
                economia.slice(0, 10),

            explosivosCantidad:
                cantidad.slice(0, 10),

            melee:
                melee.slice(0, 10),

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
    clasificarRaid
};