const axios = require("axios");
const cheerio = fnRequiresCheerio ? fnRequiresCheerio() : require("cheerio"); // Manteniendo compatibilidad segura

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
    
    // Consultamos específicamente la sub-ruta de raideo para asegurar que devuelva los costos correctos
    const urlRaideo = `${BASE_URL}/${slug}#raiding`;
    const urlLoot = `${BASE_URL}/${slug}`;

    try {
        const [respRaideo, respLoot] = await Promise.all([
            axios.get(urlRaideo, { headers: HEADERS, timeout: 8000, validateStatus: s => s >= 200 && s < 400 }).catch(() => null),
            axios.get(urlLoot, { headers: HEADERS, timeout: 8000, validateStatus: s => s >= 200 && s < 400 }).catch(() => null)
        ]);

        const $r = respRaideo && respRaideo.data ? cheerio.load(respRaideo.data) : null;
        const $l = respLoot && respLoot.data ? cheerio.load(respLoot.data) : null;

        const nombreObjeto = ($r ? $r("h1").first().text().trim() : null) || ($l ? $l("h1").first().text().trim() : null) || queryLimpia;

        const startingItems = [];
        const raidingCost = [];
        const dondeEncontrar = [];

        // Extraer Raideo ($r)
        if ($r) {
            $r("table").each((index, tabla) => {
                const textoTabla = $r(tabla).text();
                // Omitir si es una tabla de loot o crafteo puro
                if (/looted from|crafting|reciclado/i.test(textoTabla) && !textoTabla.includes("Time to Raid")) return;

                $r(tabla).find("tr").each((_, fila) => {
                    const columnas = $r(fila).find("td");
                    if (columnas.length < 2) return;

                    const col0 = $r(columnas[0]).text().trim();
                    const col1 = $r(columnas[1]).text().trim();
                    const col2 = $r(columnas.length > 2 ? columnas[2] : columnas[1]).text().trim();

                    if (!col0 || /herramienta|starting|time|cost/i.test(col0)) return;

                    // Detectar si es un Starting Item (suele tener tiempos cortos como s o m en la columna 1)
                    if (index === 0 && (col1.includes("s") || col1.includes("m")) && startingItems.length < 3) {
                        if (!startingItems.some(i => i.herramienta === col0)) {
                            startingItems.push({
                                herramienta: col0,
                                tiempo: col1,
                                cantidad: col2 !== col1 ? col2 : ""
                            });
                        }
                    } else {
                        if (!raidingCost.some(i => i.herramienta === col0)) {
                            raidingCost.push({
                                herramienta: col0,
                                cantidad: col1,
                                tiempo: col2
                            });
                        }
                    }
                });
            });
        }

        // Extraer Dónde Encontrar ($l)
        if ($l) {
            $l("table").each((_, tabla) => {
                const textoTabla = $l(tabla).text();
                if (/looted from|encontrar|drop/i.test(textoTabla) || textoTabla.includes("%")) {
                    $l(tabla).find("tr").each((_, fila) => {
                        const columnas = $l(fila).find("td");
                        if (columnas.length < 2) return;
                        const col0 = $l(columnas[0]).text().trim();
                        const col1 = $l(columnas[1]).text().trim();
                        if (col0 && !dondeEncontrar.some(i => i.herramienta === col0)) {
                            dondeEncontrar.push({ herramienta: col0, tiempo: col1 });
                        }
                    });
                }
            });
        }

        const raidingCostOrdenado = raidingCost
            .filter(item => item.tiempo && item.tiempo !== "")
            .sort((a, b) => convertirASegundos(a.tiempo) - convertirASegundos(b.tiempo))
            .slice(0, 7);

        return {
            nombre: nombreObjeto,
            url: urlLoot,
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