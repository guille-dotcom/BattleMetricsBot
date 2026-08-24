const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://rusthelp.com/es-ES/items";

const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"
};

// =====================================================
// UTILIDADES Y ALIASES
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

function convertirSlug(nombre) {
    return normalizarTexto(nombre).replace(/\s+/g, "-");
}

const ALIASES = {
    "tc": "tool-cupboard",
    "armario": "tool-cupboard",
    "armario de herramientas": "tool-cupboard",
    "puerta blindada": "armored-door",
    "puerta de garaje": "garage-door",
    "puerta garaje": "garage-door",
    "puerta de chapa": "sheet-metal-door",
    "puerta de madera": "wooden-door",
    "pared blindada": "armored-wall",
    "pared de piedra": "stone-wall",
    "pared de chapa": "sheet-metal-wall",
    "pared de madera": "wooden-wall"
};

// =====================================================
// EXTRACCIÓN DE COMPONENTES DE UNA FILA
// =====================================================

function extraerComponentesFila($, filaElemento) {
    const componentes = [];
    
    $(filaElemento).find("td").eq(2).find("img, span, div").each((_, el) => {
        // Lógica para extraer los ítems y cantidades de la columna 'Amount'
        const textoItem = $(el).attr("alt") || $(el).text().trim();
        const cantidadTexto = $(el).next().text().trim() || $(el).text().trim();
        const cantidadMatch = cantidadTexto.match(/×\s*(\d+)/) || cantidadTexto.match(/(\d+)/);
        
        if (textoItem && cantidadMatch) {
            componentes.push({
                nombre: textoItem,
                cantidad: parseInt(cantidadMatch[1], 10) || 1
            });
        }
    });

    // Fallback por si la estructura de columnas varía en texto plano
    if (componentes.length === 0) {
        const textoCeldaAmount = $(filaElemento).find("td").eq(2).text().trim();
        if (textoCeldaAmount) {
            componentes.push({
                nombre: "Cantidad",
                cantidad: 1
            });
        }
    }

    return componentes;
}

// =====================================================
// CONSULTAR RUSTHELP
// =====================================================

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

        // Parsear las tablas de la página de RustHelp
        $("table").each((tablaIndex, tabla) => {
            $(tabla).find("tbody tr, tr").each((_, fila) => {
                const columnas = $(fila).find("td");
                if (columnas.length < 3) return;

                const herramienta = $(columnas[0]).text().trim();
                const tiempo = $(columnas[1]).text().trim();
                
                // Extraer cantidad principal de la celda amount
                const cantidadTexto = $(columnas[2]).text().trim();
                const cantidadNum = parseInt(cantidadTexto.replace(/\D/g, "")) || 1;

                if (!herramienta) return;

                const itemRaid = {
                    herramienta: herramienta,
                    tiempo: tiempo || "N/A",
                    componentes: [
                        { nombre: herramienta, cantidad: cantidadNum }
                    ]
                };

                // Determinamos si pertenece a Starting Item (primeras 3 opciones) o Raiding Cost
                if (tablaIndex === 0 && startingItems.length < 3) {
                    startingItems.push(itemRaid);
                } else {
                    raidingCost.push(itemRaid);
                }
            });
        });

        // Ordenar las 7 alternativas de Raiding Cost por tiempo (menor a mayor)
        const raidingCostOrdenado = raidingCost
            .sort((a, b) => {
                // Convertir tiempos tipo "11s", "1m 7s" a segundos para ordenar bien
                const convertirA segundos = (t) => {
                    let total = 0;
                    const minMatch = t.match(/(\d+)\s*m/);
                    const segMatch = t.match(/(\d+)\s*s/);
                    if (minMatch) total += parseInt(minMatch[1]) * 60;
                    if (segMatch) total += parseInt(segMatch[1]);
                    return total || 0;
                };
                return convertirA segundos(a.tiempo) - convertirA segundos(b.tiempo);
            })
            .slice(0, 7);

        // Combinar para las vistas que pide tu comando
        // Economía y Cantidad usan las 3 de starting + 7 alternativas
        const listaCompleta = [...startingItems, ...raidingCostOrdenado];

        // Filtrar Melee y Munición de la lista completa
        const meleeKeywords = ["pico", "hacha", "pickaxe", "hatchet", "chainsaw", "jackhammer", "motosierra", "martillo"];
        const ammoKeywords = ["5.56", "ammo", "bullet", "balas", "explosive 5"];

        const melee = listaCompleta.filter(m => meleeKeywords.some(k => normalizarTexto(m.herramienta).includes(k)));
        const balas = listaCompleta.filter(m => ammoKeywords.some(k => normalizarTexto(m.herramienta).includes(k)));

        return {
            nombre: nombreObjeto,
            url: urlFinal,
            // Las 3 recomendadas de Starting Item + alternativas de Raiding Cost
            explosivosEconomia: listaCompleta,
            explosivosCantidad: listaCompleta,
            melee: melee.length > 0 ? melee : raidingCostOrdenado.slice(0, 7),
            balas: balas.length > 0 ? balas : raidingCostOrdenado.slice(0, 7)
        };

    } catch (error) {
        console.error("❌ Error al consultar RustHelp:", error.message);
        return null;
    }
}

module.exports = {
    consultarRaid
};