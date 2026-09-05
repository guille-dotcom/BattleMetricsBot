const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");

// =====================================================
// CONFIGURACIÓN OPTIMIZADA
// =====================================================

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_SEARCH_PAGE = `${STEAM_BASE}/search/users/`;

const RUST_APPID = "252490";
const CONCURRENCIA_RUST = 3;

// Caché temporal en memoria para evitar repetir búsquedas idénticas a Steam
const cacheBusquedas = new Map();
const TIEMPO_CACHE = 10 * 60 * 1000; // 10 minutos

// =====================================================
// AXIOS
// =====================================================

const steam = axios.create({
    timeout: 20000,
    maxRedirects: 5,
    validateStatus: () => true,
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/139.0.0.0 Safari/537.36",
        "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
            "es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive"
    }
});

// =====================================================
// UTILIDADES
// =====================================================

function limpiarTexto(texto) {
    return String(texto || "").replace(/\s+/g, " ").trim();
}

function normalizarUrlSteam(url) {
    if (!url) return "";
    let resultado = String(url).trim();
    if (resultado.startsWith("//")) resultado = "https:" + resultado;
    if (resultado.startsWith("/")) resultado = STEAM_BASE + resultado;
    return resultado;
}

function extraerSteamID(url) {
    if (!url) return null;
    const match = String(url).match(/steamcommunity\.com\/profiles\/(\d{17})/i);
    return match ? match[1] : null;
}

function clavePerfil(perfil) {
    return perfil.steamID64 || String(perfil.url || "").toLowerCase();
}

// =====================================================
// EXTRAER RESULTADOS
// =====================================================

function extraerResultados(html) {
    const resultados = [];
    if (!html) return resultados;
    const $ = cheerio.load(html);

    $(".search_row").each((index, elemento) => {
        const row = $(elemento);
        let enlace = row.find("a.searchPersonaName").first();
        let nombre = limpiarTexto(enlace.text());
        let url = enlace.attr("href") || "";

        if (!url) {
            const cualquierEnlace = row.find("a").filter((i, el) => {
                const href = $(el).attr("href") || "";
                return href.includes("steamcommunity.com/id/") || href.includes("steamcommunity.com/profiles/");
            }).first();
            url = cualquierEnlace.attr("href") || "";
            nombre = limpiarTexto(cualquierEnlace.text());
        }

        if (!nombre || !url) return;
        url = normalizarUrlSteam(url);

        resultados.push({
            nombre,
            url,
            steamID64: extraerSteamID(url)
        });
    });

    const vistos = new Set();
    return resultados.filter(perfil => {
        const clave = clavePerfil(perfil);
        if (vistos.has(clave)) return false;
        vistos.add(clave);
        return true;
    });
}

// =====================================================
// BÚSQUEDA NORMAL (PÁGINA 1)
// =====================================================

async function buscarPaginaNormal(nombre, pagina = 1) {
    const url = `${STEAM_SEARCH_PAGE}?text=${encodeURIComponent(nombre)}&filter=users&page=${pagina}`;
    const respuesta = await steam.get(url);

    if (respuesta.status === 429) return { rateLimited: true, resultados: [] };
    if (respuesta.status !== 200) return { rateLimited: false, resultados: [] };

    return {
        rateLimited: false,
        resultados: extraerResultados(String(respuesta.data || ""))
    };
}

function filtrarNombreExacto(resultados, nombreBuscado) {
    return resultados.filter(perfil => perfil.nombre === nombreBuscado);
}

async function buscarPerfilesExactos(nombreBuscado) {
    const ahora = Date.now();
    if (cacheBusquedas.has(nombreBuscado)) {
        const datosCache = cacheBusquedas.get(nombreBuscado);
        if (ahora - datosCache.tiempo < TIEMPO_CACHE) {
            return datosCache.perfiles;
        }
    }

    const perfiles = [];
    const vistos = new Set();

    try {
        const respuesta = await buscarPaginaNormal(nombreBuscado, 1);
        
        if (!respuesta.rateLimited) {
            const exactos = filtrarNombreExacto(respuesta.resultados, nombreBuscado);
            for (const perfil of exactos) {
                const clave = clavePerfil(perfil);
                if (!vistos.has(clave)) {
                    vistos.add(clave);
                    perfiles.push(perfil);
                }
            }
        }
    } catch (error) {
        console.log(`[STEAM] Error en búsqueda: ${error.message}`);
    }

    cacheBusquedas.set(nombreBuscado, { tiempo: ahora, perfiles });
    return perfiles;
}

// =====================================================
// DEFINICIÓN DEL COMANDO DE DISCORD
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription("Busca perfiles de Steam por nombre exacto")
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription("Nombre exacto del usuario a buscar")
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const nombreBuscado = interaction.options.getString("nombre");

        try {
            const perfiles = await buscarPerfilesExactos(nombreBuscado);

            if (perfiles.length === 0) {
                return interaction.editReply(`❌ No se encontraron perfiles de Steam con el nombre exacto **${nombreBuscado}**.`);
            }

            let textoRespuesta = `✅ Se encontraron **${perfiles.length}** perfiles para **${nombreBuscado}**:\n\n`;
            perfiles.slice(0, 5).forEach((p, i) => {
                textoRespuesta += `${i + 1}. [${p.nombre}](${p.url}) (ID: \`${p.steamID64 || "N/A"}\`)\n`;
            });

            return interaction.editReply(textoRespuesta);

        } catch (error) {
            console.error(error);
            return interaction.editReply("Hubo un error al ejecutar la búsqueda en Steam.");
        }
    }
};