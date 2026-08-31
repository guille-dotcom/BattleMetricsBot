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

function limpiarTexto(texto) {
    return String(texto || "")
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
    "puerta de madera": "wooden-door"
};

// =====================================================
// SLUG
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
// TIEMPO
// =====================================================

function convertirASegundos(tiempo) {
    const texto = String(tiempo || "")
        .toLowerCase()
        .replace(/,/g, ".");

    if (!texto) {
        return 0;
    }

    let total = 0;

    const horas = texto.match(/(\d+(?:\.\d+)?)\s*h/);
    const minutos = texto.match(/(\d+(?:\.\d+)?)\s*m/);
    const segundos = texto.match(/(\d+(?:\.\d+)?)\s*s/);

    if (horas) {
        total += parseFloat(horas[1]) * 3600;
    }

    if (minutos) {
        total += parseFloat(minutos[1]) * 60;
    }

    if (segundos) {
        total += parseFloat(segundos[1]);
    }

    return total;
}

function pareceTiempo(texto) {
    return /\d+\s*(?:h|m|s)\b/i.test(
        String(texto || "")
    );
}

// =====================================================
// COLUMNAS
// =====================================================

function obtenerColumnas($, fila) {
    const columnas = [];

    $(fila)
        .find("th, td")
        .each((_, elemento) => {
            const texto = limpiarTexto($(elemento).text());
            columnas.push(texto);
        });

    return columnas;
}

function obtenerHeaderTabla($, tabla) {
    const primeraFila = $(tabla).find("tr").first();

    if (!primeraFila.length) {
        return [];
    }

    return obtenerColumnas($, primeraFila).map(normalizarTexto);
}

function esTablaLoot($, tabla) {
    const headers = obtenerHeaderTabla($, tabla);
    const texto = normalizarTexto($(tabla).text().slice(0, 500));

    const tieneDe = headers.includes("de");
    const tienePosibilidad = headers.includes("posibilidad");
    const tieneCantidad = headers.includes("cantidad");
    const tieneEstado = headers.includes("estado");

    return (
        (tieneDe && tienePosibilidad && tieneCantidad) ||
        (tienePosibilidad && tieneCantidad && tieneEstado) ||
        /looted from/.test(texto)
    );
}

function esTablaStarting($, tabla) {
    const headers = obtenerHeaderTabla($, tabla);

    return (
        headers.includes("starting item") ||
        (
            headers.includes("time to raid") &&
            headers.includes("amount")
        )
    );
}

function esTablaRaidingCost($, tabla) {
    const headers = obtenerHeaderTabla($, tabla);

    return (
        headers.includes("herramienta de raideos") ||
        (
            headers.includes("cantidad") &&
            headers.some(header =>
                header.includes("tiempo para raideo")
            )
        )
    );
}

function limpiarNombreHerramienta(nombre) {
    let limpio = limpiarTexto(nombre)
        .replace(/\s+Using\s+.+$/i, "")
        .replace(/\s+Launched From\s+.+$/i, "")
        .replace(/\s+Deployed$/i, "")
        .replace(/\s+Right Click Stuck$/i, "")
        .replace(/\s+Left Click Throw$/i, "")
        .replace(/\s+Lit$/i, "")
        .replace(/\s+Cost To Repair Head$/i, "")
        .trim();

    // Si es munición explosiva con cualquier arma, unificamos el nombre para que no se repita el arma
    if (/Munici[oó]n explosiva del calibre 5\.56/i.test(limpio)) {
        return "Munición explosiva del calibre 5.56";
    }

    return limpio;
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
        const response = await axios.get(urlLoot, {
            headers: HEADERS,
            timeout: 15000,
            maxRedirects: 5,
            validateStatus: status => status >= 200 && status < 400
        });

        if (!response || !response.data) {
            return null;
        }

        const $ = cheerio.load(response.data);

        let nombreObjeto =
            limpiarTexto($("h1").first().text()) ||
            limpiarTexto($("title").first().text()) ||
            queryLimpia;

        nombreObjeto = nombreObjeto
            .replace(/\s*\|\s*RustHelp.*$/i, "")
            .replace(/\s*-\s*RustHelp.*$/i, "")
            .trim();

        const startingItems = [];
        const raidingCost = [];
        const dondeEncontrar = [];

        $("table").each((index, tabla) => {
            if (esTablaLoot($, tabla)) {
                $(tabla)
                    .find("tr")
                    .each((_, fila) => {
                        const columnas = obtenerColumnas($, fila);
                        if (columnas.length < 2) return;
                        const primera = columnas[0];
                        if (normalizarTexto(primera) === "de") return;
                        const posibilidad = columnas[1] || "";
                        const cantidad = columnas[2] || "";
                        if (!primera) return;

                        const textoLoot = [posibilidad, cantidad].filter(Boolean).join(" ");
                        const existe = dondeEncontrar.some(
                            item => normalizarTexto(item.herramienta) === normalizarTexto(primera)
                        );

                        if (!existe) {
                            dondeEncontrar.push({
                                herramienta: limpiarTexto(primera),
                                tiempo: limpiarTexto(textoLoot)
                            });
                        }
                    });
                return;
            }

            if (esTablaStarting($, tabla)) {
                $(tabla)
                    .find("tr")
                    .each((_, fila) => {
                        const columnas = obtenerColumnas($, fila);
                        if (columnas.length < 2) return;
                        const primera = columnas[0];
                        const segunda = columnas[1] || "";
                        const tercera = columnas[2] || "";

                        if (normalizarTexto(primera).includes("starting item")) return;
                        if (!primera || !pareceTiempo(segunda)) return;

                        if (
                            startingItems.some(
                                item => normalizarTexto(item.herramienta) === normalizarTexto(primera)
                            )
                        ) {
                            return;
                        }

                        startingItems.push({
                            herramienta: limpiarNombreHerramienta(primera),
                            tiempo: limpiarTexto(segunda),
                            cantidad: limpiarTexto(tercera)
                        });
                    });
                return;
            }

            if (esTablaRaidingCost($, tabla)) {
                $(tabla)
                    .find("tr")
                    .each((_, fila) => {
                        const columnas = obtenerColumnas($, fila);
                        if (columnas.length < 3) return;

                        const herramienta = columnas[0] || "";
                        const cantidad = columnas[1] || "";
                        const tiempo = columnas[2] || "";

                        if (!herramienta) return;
                        if (normalizarTexto(herramienta) === "herramienta de raideos") return;
                        if (!pareceTiempo(tiempo)) return;

                        const nombreLimpio = limpiarNombreHerramienta(herramienta);
                        if (!nombreLimpio) return;

                        raidingCost.push({
                            herramienta: nombreLimpio,
                            cantidad: limpiarTexto(cantidad),
                            tiempo: limpiarTexto(tiempo)
                        });
                    });
            }
        });

        const palabrasExcluir = [
            "raw material", "material cost", "costo de material",
            "costo de raideo", "sulfur", "azufre", "charcoal",
            "carbon", "cloth", "tela", "wood", "madera",
            "metal fragments", "fragmentos de metal", "stone",
            "piedra", "low grade fuel", "combustible de baja calidad",
            "scrap", "chatarra", "fuel", "combustible",
            "recurso", "recursos", "material", "materiales"
        ];

        const raidingCostFiltrado = raidingCost.filter(item => {
            const nombre = normalizarTexto(item.herramienta);
            return !palabrasExcluir.some(palabra =>
                nombre.includes(normalizarTexto(palabra))
            );
        });

        // Eliminar duplicados exactos (misma munición y cantidad) para evitar spam de armas
        const unicosMap = new Map();
        for (const item of raidingCostFiltrado) {
            const clave = `${normalizarTexto(item.herramienta)}_${normalizarTexto(item.cantidad)}`;
            if (!unicosMap.has(clave)) {
                unicosMap.set(clave, item);
            }
        }

        const raidingCostSinDuplicados = Array.from(unicosMap.values());

        const raidingCostOrdenado = raidingCostSinDuplicados
            .sort((a, b) => convertirASegundos(a.tiempo) - convertirASegundos(b.tiempo))
            .slice(0, 15);

        const startingItemsFinales = startingItems.slice(0, 3);
        const dondeEncontrarFinal = dondeEncontrar.length > 0
            ? dondeEncontrar
            : [{ herramienta: "No disponible", tiempo: "" }];

        return {
            nombre: nombreObjeto,
            url: urlLoot,
            urlRaideo,
            startingItems: startingItemsFinales,
            raidingCost: raidingCostOrdenado,
            dondeEncontrar: dondeEncontrarFinal
        };

    } catch (error) {
        console.error("❌ Error en servicio rusthelp:", error.message);
        return null;
    }
}

module.exports = {
    consultarRaid
};