const axios = require("axios");
const cheerio = require("cheerio");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BASE_URL = "https://rusthelp.com/es-ES/items";

const HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",

    "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9," +
        "image/avif,image/webp,image/apng,*/*;q=0.8",

    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",

    "Cache-Control": "no-cache",

    "Pragma": "no-cache"
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

// =====================================================
// ALIAS
// =====================================================

const ALIASES = {
    "tc": "tool-cupboard",
    "tool cupboard": "tool-cupboard",
    "tool-cupboard": "tool-cupboard",

    "armario": "tool-cupboard",
    "armario de herramientas": "tool-cupboard",

    "puerta blindada": "armored-door",
    "puerta blindada de metal": "armored-door",

    "puerta de garaje": "garage-door",

    "puerta de chapa": "sheet-metal-door",
    "puerta metalica": "sheet-metal-door",
    "puerta metálica": "sheet-metal-door",

    "puerta de madera": "wooden-door"
};

// =====================================================
// UTILIDADES
// =====================================================

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
}

function convertirASegundos(tiempo) {
    const texto = normalizarTexto(tiempo);

    if (!texto) return 0;

    let total = 0;

    // Horas
    const horas = texto.match(/(\d+)\s*h/);

    // Minutos
    const minutos = texto.match(/(\d+)\s*m/);

    // Segundos
    const segundos = texto.match(/(\d+)\s*s/);

    if (horas) {
        total += parseInt(horas[1], 10) * 3600;
    }

    if (minutos) {
        total += parseInt(minutos[1], 10) * 60;
    }

    if (segundos) {
        total += parseInt(segundos[1], 10);
    }

    return total;
}

function pareceTiempo(texto) {
    return /\d+\s*(?:h|m|s)\b/i.test(String(texto || ""));
}

function pareceCantidad(texto) {
    return /\d/.test(String(texto || ""));
}

// =====================================================
// CONSTRUIR SLUG
// =====================================================

function obtenerSlug(nombre) {
    const normalizado = normalizarTexto(nombre);

    if (!normalizado) {
        return null;
    }

    if (ALIASES[normalizado]) {
        return ALIASES[normalizado];
    }

    return normalizado
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

// =====================================================
// EXTRAER CELDAS
// =====================================================

function obtenerColumnas($, fila) {
    const columnas = [];

    $(fila)
        .find("th, td")
        .each((_, elemento) => {
            const texto = limpiarTexto($(elemento).text());

            if (texto) {
                columnas.push(texto);
            }
        });

    return columnas;
}

// =====================================================
// CONSULTAR RAID
// =====================================================

async function consultarRaid(nombreQuery) {
    const queryLimpia = limpiarTexto(nombreQuery);

    if (!queryLimpia) {
        return null;
    }

    const slug = obtenerSlug(queryLimpia);

    if (!slug) {
        return null;
    }

    const urlLoot = `${BASE_URL}/${slug}`;
    const urlRaideo = `${BASE_URL}/${slug}#raiding`;

    try {
        console.log(`🔎 Consultando RustHelp: ${slug}`);

        const response = await axios.get(urlLoot, {
            headers: HEADERS,
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 400
        });

        if (!response || !response.data) {
            console.log(`⚠️ RustHelp no devolvió contenido para ${slug}`);
            return null;
        }

        const $ = cheerio.load(response.data);

        // =================================================
        // NOMBRE DEL OBJETO
        // =================================================

        let nombreObjeto =
            limpiarTexto($("h1").first().text()) ||
            limpiarTexto($("title").first().text()) ||
            queryLimpia;

        // El title puede traer texto adicional
        nombreObjeto = nombreObjeto
            .replace(/\s*\|\s*RustHelp.*$/i, "")
            .replace(/\s*-\s*RustHelp.*$/i, "")
            .trim();

        // =================================================
        // ARRAYS DE RESULTADOS
        // =================================================

        const startingItems = [];
        const raidingCost = [];
        const dondeEncontrar = [];

        // =================================================
        // RECORRER TABLAS
        // =================================================

        $("table").each((index, tabla) => {
            const textoTabla = limpiarTexto($(tabla).text());

            const textoNormalizado = normalizarTexto(textoTabla);

            const esLoot =
                /loot|looted|drop|encontrar|found|obtain/.test(
                    textoNormalizado
                );

            const esRaid =
                /raid|raiding|destroy|destruir|time to raid/.test(
                    textoNormalizado
                );

            // ---------------------------------------------
            // FILAS
            // ---------------------------------------------

            $(tabla)
                .find("tr")
                .each((_, fila) => {
                    const columnas = obtenerColumnas($, fila);

                    if (columnas.length < 2) {
                        return;
                    }

                    const primeraColumna = columnas[0];
                    const segundaColumna = columnas[1];
                    const terceraColumna =
                        columnas.length >= 3 ? columnas[2] : "";

                    if (!primeraColumna || !segundaColumna) {
                        return;
                    }

                    const primeraNormalizada =
                        normalizarTexto(primeraColumna);

                    // -----------------------------------------
                    // IGNORAR HEADERS
                    // -----------------------------------------

                    if (
                        /^(item|items|herramienta|tool|starting item|start|time|tiempo|cost|costo|quantity|cantidad)$/i.test(
                            primeraNormalizada
                        )
                    ) {
                        return;
                    }

                    if (
                        /^(item|items|herramienta|tool|starting item|start|time|tiempo|cost|costo|quantity|cantidad)$/i.test(
                            normalizarTexto(segundaColumna)
                        )
                    ) {
                        return;
                    }

                    // -----------------------------------------
                    // TABLAS DE LOOT / DÓNDE ENCONTRAR
                    // -----------------------------------------

                    if (esLoot && !esRaid) {
                        if (
                            primeraColumna &&
                            !dondeEncontrar.some(
                                item =>
                                    normalizarTexto(item.herramienta) ===
                                    normalizarTexto(primeraColumna)
                            )
                        ) {
                            dondeEncontrar.push({
                                herramienta: primeraColumna,
                                tiempo: terceraColumna || segundaColumna
                            });
                        }

                        return;
                    }

                    // -----------------------------------------
                    // DETECTAR TABLAS DE RAID
                    // -----------------------------------------

                    if (esRaid || index === 0) {
                        let herramienta = primeraColumna;
                        let cantidad = segundaColumna;
                        let tiempo = terceraColumna;

                        // Caso de tabla con solamente 2 columnas:
                        // Item | Time
                        if (
                            columnas.length === 2 &&
                            pareceTiempo(segundaColumna)
                        ) {
                            tiempo = segundaColumna;
                            cantidad = "";
                        }

                        // Caso:
                        // Item | Quantity | Time
                        if (
                            columnas.length >= 3 &&
                            !pareceTiempo(tiempo) &&
                            pareceTiempo(cantidad)
                        ) {
                            tiempo = cantidad;
                            cantidad = terceraColumna;
                        }

                        // -------------------------------------
                        // STARTING ITEMS
                        // -------------------------------------

                        if (
                            pareceTiempo(tiempo) &&
                            convertirASegundos(tiempo) > 0 &&
                            convertirASegundos(tiempo) <= 120 &&
                            startingItems.length < 3
                        ) {
                            const yaExiste = startingItems.some(
                                item =>
                                    normalizarTexto(item.herramienta) ===
                                    normalizarTexto(herramienta)
                            );

                            if (!yaExiste) {
                                startingItems.push({
                                    herramienta,
                                    cantidad: cantidad || "",
                                    tiempo
                                });
                            }

                            return;
                        }

                        // -------------------------------------
                        // RAID COST
                        // -------------------------------------

                        if (
                            herramienta &&
                            (pareceCantidad(cantidad) ||
                                pareceTiempo(tiempo))
                        ) {
                            const yaExiste = raidingCost.some(
                                item =>
                                    normalizarTexto(item.herramienta) ===
                                    normalizarTexto(herramienta)
                            );

                            if (!yaExiste) {
                                raidingCost.push({
                                    herramienta,
                                    cantidad: cantidad || "",
                                    tiempo: tiempo || ""
                                });
                            }
                        }
                    }
                });
        });

        // =================================================
        // FALLBACK: BUSCAR FILAS DE RAID EN TODA LA PÁGINA
        // =================================================

        if (raidingCost.length === 0) {
            $("tr").each((_, fila) => {
                const columnas = obtenerColumnas($, fila);

                if (columnas.length < 2) {
                    return;
                }

                const herramienta = columnas[0];
                const segunda = columnas[1];
                const tercera = columnas[2] || "";

                if (!herramienta) {
                    return;
                }

                if (
                    /^(item|items|herramienta|tool|time|tiempo|cost|costo|quantity|cantidad)$/i.test(
                        normalizarTexto(herramienta)
                    )
                ) {
                    return;
                }

                let cantidad = segunda;
                let tiempo = tercera;

                if (
                    columnas.length === 2 &&
                    pareceTiempo(segunda)
                ) {
                    tiempo = segunda;
                    cantidad = "";
                }

                if (
                    columnas.length >= 3 &&
                    pareceTiempo(cantidad) &&
                    !pareceTiempo(tiempo)
                ) {
                    tiempo = cantidad;
                    cantidad = tercera;
                }

                if (!pareceTiempo(tiempo)) {
                    return;
                }

                const yaExiste = raidingCost.some(
                    item =>
                        normalizarTexto(item.herramienta) ===
                        normalizarTexto(herramienta)
                );

                if (!yaExiste) {
                    raidingCost.push({
                        herramienta,
                        cantidad: cantidad || "",
                        tiempo: tiempo || ""
                    });
                }
            });
        }

        // =================================================
        // FILTRAR RESULTADOS INVÁLIDOS
        // =================================================

        const palabrasExcluir = [
            "raw material",
            "material cost",
            "sulfur",
            "charcoal",
            "cloth",
            "wood",
            "metal fragments",
            "stone",
            "low grade fuel",
            "scrap",
            "fuel",
            "ammo cost",
            "recurso",
            "recursos",
            "material",
            "materiales"
        ];

        const raidingCostFiltrado = raidingCost.filter(item => {
            const nombre = normalizarTexto(item.herramienta);

            if (!nombre) {
                return false;
            }

            return !palabrasExcluir.some(palabra =>
                nombre.includes(normalizarTexto(palabra))
            );
        });

        // =================================================
        // ORDENAR RAID
        // =================================================

        const raidingCostOrdenado = raidingCostFiltrado
            .filter(item => item.tiempo)
            .sort((a, b) => {
                return (
                    convertirASegundos(a.tiempo) -
                    convertirASegundos(b.tiempo)
                );
            })
            .slice(0, 7);

        // =================================================
        // DEDUPLICAR STARTING ITEMS
        // =================================================

        const startingItemsFinales = [];

        for (const item of startingItems) {
            const existe = startingItemsFinales.some(
                existente =>
                    normalizarTexto(existente.herramienta) ===
                    normalizarTexto(item.herramienta)
            );

            if (!existe) {
                startingItemsFinales.push(item);
            }
        }

        // =================================================
        // DEDUPLICAR DÓNDE ENCONTRAR
        // =================================================

        const dondeEncontrarFinal = [];

        for (const item of dondeEncontrar) {
            const existe = dondeEncontrarFinal.some(
                existente =>
                    normalizarTexto(existente.herramienta) ===
                    normalizarTexto(item.herramienta)
            );

            if (!existe) {
                dondeEncontrarFinal.push(item);
            }
        }

        // =================================================
        // LOG
        // =================================================

        console.log(
            `✅ RustHelp: ${nombreObjeto} | ` +
            `Raid: ${raidingCostOrdenado.length} | ` +
            `Starting: ${startingItemsFinales.length} | ` +
            `Loot: ${dondeEncontrarFinal.length}`
        );

        // =================================================
        // RESULTADO
        // =================================================

        return {
            nombre: nombreObjeto,

            url: urlLoot,

            urlRaideo,

            startingItems:
                startingItemsFinales.slice(0, 3),

            raidingCost:
                raidingCostOrdenado,

            dondeEncontrar:
                dondeEncontrarFinal.length > 0
                    ? dondeEncontrarFinal
                    : [
                        {
                            herramienta: "No disponible",
                            tiempo: ""
                        }
                    ]
        };

    } catch (error) {
        console.error(
            "❌ Error en servicio rusthelp:",
            error.message
        );

        if (error.response) {
            console.error(
                `❌ HTTP ${error.response.status} al consultar ${slug}`
            );
        }

        return null;
    }
}

// =====================================================
// EXPORT
// =====================================================

module.exports = {
    consultarRaid
};