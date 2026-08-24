const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://rusthelp.com/es-ES/items";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};

function normalizarTexto(texto) {
    return String(texto || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function convertirSlug(nombre) {
    return normalizarTexto(nombre).replace(/\s+/g, "-");
}

const ALIASES = {
    "tc": "tool-cupboard",
    "armario": "tool-cupboard",
    "puerta blindada": "armored-door",
    "puerta de garaje": "garage-door",
    "puerta de chapa": "sheet-metal-door",
    "puerta de madera": "wooden-door"
};

async function consultarRaid(nombreQuery) {
    const queryLimpia = String(nombreQuery || "").trim();
    if (!queryLimpia) return null;

    const normalizado = normalizarTexto(queryLimpia);
    const slug = ALIASES[normalizado] || convertirSlug(queryLimpia);
    const urlFinal = `${BASE_URL}/${slug}`;

    try {
        const response = await axios.get(urlFinal, {
            headers: HEADERS,
            timeout: 10000,
            validateStatus: s => s >= 200 && s < 400
        });

        if (!response.data) return null;

        const $ = cheerio.load(response.data);
        const nombreObjeto = $("h1").first().text().trim() || queryLimpia;

        const startingItems = [];
        const raidingCost = [];
        const dondeEncontrar = [];

        // Buscar tablas específicamente dentro de la calculadora de raid o por estructura de filas
        // RustHelp suele usar tablas para las costos de raid
        $("table").each((tablaIndex, tabla) => {
            const tituloTabla = $(tabla).prev("h2, h3, h4").text().trim();
            
            $(tabla).find("tbody tr, tr").each((_, fila) => {
                const columnas = $(fila).find("td");
                if (columnas.length < 2) return;

                const herramienta = $(columnas[0]).text().trim();
                const tiempo = columnas.length > 1 ? $(columnas[1]).text().trim() : "";
                const cantidadTexto = columnas.length > 2 ? $(columnas[2]).text().trim() : "";

                if (!herramienta) return;

                // Si es la tabla de dónde se encuentra (loot drops)
                if (normalizarTexto(tituloTabla).includes("encontrar") || normalizarTexto(tituloTabla).includes("drop") || columnas.length === 2) {
                    dondeEncontrar.push({ herramienta, tiempo });
                    return;
                }

                const itemRaid = {
                    herramienta: herramienta,
                    tiempo: tiempo || "N/A",
                    componentes: [{ nombre: herramienta, cantidad: 1 }]
                };

                if (startingItems.length < 3) {
                    startingItems.push(itemRaid);
                } else {
                    raidingCost.push(itemRaid);
                }
            });
        });

        const convertirASegundos = (t) => {
            let total = 0;
            const minMatch = t.match(/(\d+)\s*m/);
            const segMatch = t.match(/(\d+)\s*s/);
            if (minMatch) total += parseInt(minMatch[1]) * 60;
            if (segMatch) total += parseInt(segMatch[1]);
            return total || 0;
        };

        const raidingCostOrdenado = raidingCost
            .sort((a, b) => convertirASegundos(a.tiempo) - convertirASegundos(b.tiempo))
            .slice(0, 7);

        const listaCompleta = [...startingItems, ...raidingCostOrdenado];

        return {
            nombre: nombreObjeto,
            url: urlFinal,
            explosivosEconomia: listaCompleta.length > 0 ? listaCompleta : startingItems,
            explosivosCantidad: listaCompleta,
            melee: raidingCostOrdenado,
            balas: raidingCostOrdenado,
            dondeEncontrar: dondeEncontrar.length > 0 ? dondeEncontrar : [{ herramienta: "Información disponible en la web oficial", tiempo: "" }]
        };

    } catch (error) {
        console.error("❌ Error en servicio rusthelp:", error.message);
        return null;
    }
}

module.exports = { consultarRaid };