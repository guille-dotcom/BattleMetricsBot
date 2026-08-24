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

const ALIASES = {
    "tc": "tool-cupboard",
    "armario": "tool-cupboard",
    "puerta blindada": "armored-door",
    "puerta de garaje": "garage-door",
    "puerta de chapa": "sheet-metal-door",
    "puerta de madera": "wooden-door"
};

function convertirASegundos(t) {
    let total = 0;
    const minMatch = t.match(/(\d+)\s*m/);
    const segMatch = t.match(/(\d+)\s*s/);
    if (minMatch) total += parseInt(minMatch[1]) * 60;
    if (segMatch) total += parseInt(segMatch[1]);
    return total || 0;
}

async function consultarRaid(nombreQuery) {
    const queryLimpia = String(nombreQuery || "").trim();
    if (!queryLimpia) return null;

    const normalizado = normalizarTexto(queryLimpia);
    const slug = ALIASES[normalizado] || normalizado.replace(/\s+/g, "-");
    const urlFinal = `${BASE_URL}/${slug}`;

    try {
        const response = await axios.get(urlFinal, {
            headers: HEADERS,
            timeout: 8000,
            validateStatus: s => s >= 200 && s < 400
        });

        if (!response.data) return null;

        const $ = cheerio.load(response.data);
        const nombreObjeto = $("h1").first().text().trim() || queryLimpia;

        const startingItems = [];
        const raidingCost = [];
        const dondeEncontrar = [];

        // Identificar tablas en la página de RustHelp
        $("table").each((index, tabla) => {
            const tituloSeccion = $(tabla).prev("h2, h3, h4, div").text().trim();
            const esLoot = /looted from|encontrar|drop/i.test(tituloSeccion) || $(tabla).text().includes("%");

            $(tabla).find("tr").each((_, fila) => {
                const columnas = $(fila).find("td");
                if (columnas.length < 2) return;

                const col0 = $(columnas[0]).text().trim();
                const col1 = $(columnas[1]).text().trim();
                const col2 = columnas.length > 2 ? $(columnas[2]).text().trim() : "";

                if (!col0) return;

                if (esLoot) {
                    dondeEncontrar.push({ herramienta: col0, tiempo: col1 });
                } else {
                    // Verificamos si pertenece a Starting Item (suele tener cantidades explícitas o notas de tiempo cortas)
                    // En la primera tabla o si tiene formato de starting item
                    const itemData = {
                        herramienta: col0,
                        tiempo: col1 || "N/A",
                        cantidad: col2 || ""
                    };

                    // Diferenciamos las tablas por orden o estructura visual
                    if (index === 0 && startingItems.length < 3) {
                        startingItems.push(itemData);
                    } else if (index > 0 || startingItems.length >= 3) {
                        raidingCost.push(itemData);
                    }
                }
            });
        });

        // Ordenar el Raiding Cost por tiempo (de menor a mayor) y limitar a 7
        const raidingCostOrdenado = raidingCost
            .sort((a, b) => convertirASegundos(a.tiempo) - convertirASegundos(b.tiempo))
            .slice(0, 7);

        return {
            nombre: nombreObjeto,
            url: urlFinal,
            startingItems: startingItems.length > 0 ? startingItems : raidingCost.slice(0, 3),
            raidingCost: raidingCostOrdenado,
            dondeEncontrar: dondeEncontrar.length > 0 ? dondeEncontrar : [{ herramienta: "No se encontraron datos", tiempo: "" }]
        };

    } catch (error) {
        console.error("❌ Error en servicio rusthelp:", error.message);
        return null;
    }
}

module.exports = { consultarRaid };