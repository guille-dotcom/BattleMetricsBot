const axios = require("axios");
const cheerio = fnRequiresCheerio(); // o simplemente require("cheerio")
const cheerioLoader = require("cheerio");

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

        const $ = cheerioLoader.load(response.data);
        const nombreObjeto = $("h1").first().text().trim() || queryLimpia;

        const startingItems = [];
        const raidingCost = [];
        const dondeEncontrar = [];

        // En RustHelp, las tablas de la calculadora suelen estar precedidas por textos específicos o contenedores de raid
        // Vamos a buscar filas de tablas que tengan celdas con tiempos o costes de raid válidos
        $("table").each((_, tabla) => {
            const tituloSeccion = $(tabla).prev("h2, h3, h4, div").text().trim();
            const esLoot = /encontrar|drop|loot/i.test(tituloSeccion);

            $(tabla).find("tr").each((_, fila) => {
                const columnas = $(fila).find("td");
                if (columnas.length < 2) return;

                const textoCol0 = $(columnas[0]).text().trim();
                const textoCol1 = $(columnas[1]).text().trim();
                const textoCol2 = columnas.length > 2 ? $(columnas[2]).text().trim() : "";

                if (!textoCol0) return;

                if (esLoot || /%/.test(textoCol1)) {
                    dondeEncontrar.push({
                        herramienta: textoCol0,
                        tiempo: textoCol1
                    });
                } else {
                    // Es un item de raid
                    const itemData = {
                        herramienta: textoCol0,
                        tiempo: textoCol1 || "N/A",
                        componentes: [{ nombre: textoCol0, cantidad: 1 }]
                    };

                    // Las primeras filas de la calculadora suelen ser las de Starting Item
                    if (startingItems.length < 3 && !/min|s/i.test(textoCol1) === false) {
                        startingItems.push(itemData);
                    } else {
                        raidingCost.push(itemData);
                    }
                }
            });
        });

        // Asegurar que si startingItems quedó vacío, tomemos los primeros de raidingCost
        const principales = startingItems.length > 0 ? startingItems : raidingCost.slice(0, 3);
        const alternativas = raidingCost.slice(3, 10);

        return {
            nombre: nombreObjeto,
            url: urlFinal,
            explosivosEconomia: principales,
            explosivosCantidad: principales,
            melee: alternativas.length > 0 ? alternativas : raidingCost.slice(0, 5),
            balas: alternativas,
            dondeEncontrar: dondeEncontrar.length > 0 ? dondeEncontrar : [{ herramienta: "No se encontraron datos de loot directo", tiempo: "" }]
        };

    } catch (error) {
        console.error("❌ Error en servicio rusthelp:", error.message);
        return null;
    }
}

module.exports = { consultarRaid };