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

        // Buscar tablas en la página
        const tablas = $("table");

        // 1. Extraer Starting Items (generalmente la primera tabla o la que contiene el encabezado Starting Item)
        tablas.each((index, tabla) => {
            const textoTabla = $(tabla).text();
            const esLoot = /looted from|encontrar|drop/i.test(textoTabla) && textoTabla.includes("%");

            if (esLoot) {
                $(tabla).find("tr").each((_, fila) => {
                    const columnas = $(fila).find("td");
                    if (columnas.length < 2) return;
                    const col0 = $(columnas[0]).text().trim();
                    const col1 = $(columnas[1]).text().trim();
                    if (col0) dondeEncontrar.push({ herramienta: col0, tiempo: col1 });
                });
                return;
            }

            // Analizamos filas de la tabla de raideo
            $(tabla).find("tr").each((filaIndex, fila) => {
                const columnas = $(fila).find("td");
                if (columnas.length < 2) return;

                const col0 = $(columnas[0]).text().trim(); // Nombre del explosivo / herramienta
                const col1 = $(columnas[1]).text().trim(); // Tiempo (ej: 11s)
                const col2 = $(columnas[2]).text().trim(); // Cantidad (ej: x1, x3, etc.)

                if (!col0 || /herramienta|starting|time/i.test(col0)) return;

                // Las primeras filas de la sección superior suelen ser los Starting Items (tienen el tiempo en la segunda columna y cantidades al lado)
                if (index === 0 && filaIndex <= 3 && col1.includes("s") || col1.includes("m")) {
                    // Verificamos que no esté duplicado
                    if (!startingItems.some(i => i.herramienta === col0)) {
                        startingItems.push({
                            herramienta: col0,
                            tiempo: col1,
                            cantidad: col2 || ""
                        });
                    }
                } else {
                    // El resto va para Raiding Cost
                    if (!raidingCost.some(i => i.herramienta === col0)) {
                        raidingCost.push({
                            herramienta: col0,
                            cantidad: col1, // En tablas inferiores, la columna 1 suele ser la cantidad
                            tiempo: col2    // La columna 2 suele ser el tiempo
                        });
                    }
                }
            });
        });

        // Ordenar Raiding Cost por tiempo real de menor a mayor y tomar 7
        const raidingCostOrdenado = raidingCost
            .filter(item => item.tiempo && item.tiempo !== "")
            .sort((a, b) => convertirASegundos(a.tiempo) - convertirASegundos(b.tiempo))
            .slice(0, 7);

        return {
            nombre: nombreObjeto,
            url: urlFinal,
            startingItems: startingItems.slice(0, 3),
            raidingCost: raidingCostOrdenado,
            dondeEncontrar: dondeEncontrar.length > 0 ? dondeEncontrar : [{ herramienta: "No disponible", tiempo: "" }]
        };

    } catch (error) {
        console.error("❌ Error en servicio rusthelp:", error.message);
        return null;
    }
}

module.exports = { consultarRaid };