const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const cheerio = require("cheerio");
const puppeteer = require("puppeteer-core");
const { spawn } = require("child_process");

// =====================================================
// CONFIGURACIÓN OPTIMIZADA
// =====================================================

const STEAM_BASE = "https://steamcommunity.com";
const STEAM_SEARCH_PAGE = `${STEAM_BASE}/search/users/`;
const STEAM_SEARCH_AJAX = `${STEAM_BASE}/search/SearchCommunityAjax`;

const RESULTADOS_POR_PAGINA = 10;
const MAX_PAGINAS = 1; // Reducido a 1 para evitar bloqueos y acelerar la búsqueda
const DELAY_PAGINAS = 1500;

const RUST_APPID = "252490";
const CONCURRENCIA_RUST = 3;

// Caché temporal en memoria para evitar repetir búsquedas idénticas a Steam
const cacheBusquedas = new Map();
const TIEMPO_CACHE = 10 * 60 * 1000; // 10 minutos

// =====================================================
// CHROME
// =====================================================

const CHROME_PATH =
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const CHROME_PROFILE =
    "C:\\BattleMetricsBotProfile";

const CHROME_DEBUG_PORT = 9222;

const CHROME_DEBUG_URL =
    `http://localhost:${CHROME_DEBUG_PORT}`;

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

function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/\s+/g, " ")
        .trim();
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
// OBTENER SESIÓN DE STEAM
// =====================================================

async function obtenerSesionSteam(nombre) {
    const url = `${STEAM_SEARCH_PAGE}?text=${encodeURIComponent(nombre)}&filter=users`;
    const respuesta = await steam.get(url);
    const cookies = {};
    const setCookie = respuesta.headers["set-cookie"];

    if (Array.isArray(setCookie)) {
        for (const cookie of setCookie) {
            const parte = cookie.split(";")[0];
            const indice = parte.indexOf("=");
            if (indice !== -1) {
                cookies[parte.substring(0, indice)] = parte.substring(indice + 1);
            }
        }
    }

    const html = String(respuesta.data || "");
    let sessionId = html.match(/g_sessionID\s*=\s*["']([^"']+)["']/i)?.[1] || cookies.sessionid || "";

    return { sessionId, cookies };
}

function construirCookieHeader(cookies, sessionId) {
    const lista = [];
    for (const [key, value] of Object.entries(cookies || {})) {
        if (value !== undefined) lista.push(`${key}=${value}`);
    }
    if (sessionId && !cookies.sessionid) lista.push(`sessionid=${sessionId}`);
    return lista.join("; ");
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
// BÚSQUEDA NORMAL
// =====================================================

async function buscarPaginaNormal(nombre, pagina) {
    const url = `${STEAM_SEARCH_PAGE}?text=${encodeURIComponent(nombre)}&filter=users&page=${pagina}`;
    const respuesta = await steam.get(url);

    if (respuesta.status === 429) return { rateLimited: true, resultados: [] };
    if (respuesta.status !== 200) return { rateLimited: false, resultados: [] };

    return {
        rateLimited: false,
        resultados: extraerResultados(String(respuesta.data || ""))
    };
}

// =====================================================
// NOMBRE EXACTO
// =====================================================

function filtrarNombreExacto(resultados, nombreBuscado) {
    return resultados.filter(perfil => perfil.nombre === nombreBuscado);
}

// =====================================================
// BUSCAR TODOS LOS PERFILES EXACTOS (CON CACHÉ)
// =====================================================

async function buscarPerfilesExactos(nombreBuscado) {
    const ahora = Date.now();
    if (cacheBusquedas.has(nombreBuscado)) {
        const datosCache = cacheBusquedas.get(nombreBuscado);
        if (ahora - datosCache.tiempo < TIEMPO_CACHE) {
            console.log(`[STEAM] Devolviendo resultados desde la caché para: ${nombreBuscado}`);
            return datosCache.perfiles;
        }
    }

    console.log(`[STEAM] Buscando perfiles con nombre exacto: ${nombreBuscado}`);
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

    // Guardar en caché
    cacheBusquedas.set(nombreBuscado, {
        tiempo: ahora,
        perfiles
    });

    return perfiles;
}

// =====================================================
// COMPROBAR RUST
// =====================================================

function analizarRustHTML(html) {
    if (!html) return { rust: false, inventario: false };
    const texto = String(html).toLowerCase();
    
    const inventario = texto.includes(`#${RUST_APPID}_`) || texto.includes(`/inventory/${RUST_APPID}`);
    const rust = inventario || texto.includes("appid=252490") || texto.includes("rust");

    return { rust, inventario };
}

async function comprobarRust(perfil) {
    try {
        const respuesta = await steam.get(perfil.url, { timeout: 10000, validateStatus: () => true });
        if (respuesta.status !== 200) return { ...perfil, rust: null, inventarioRust: null };

        const resultado = analizarRustHTML(String(respuesta.data || ""));
        return {
            ...perfil,
            rust: resultado.rust,
            inventarioRust: resultado.inventario
        };
    } catch {
        return { ...perfil, rust: null, inventarioRust: null };
    }
}

async function comprobarRustTodos(perfiles) {
    const resultadosFinales = [];
    for (let i = 0; i < perfiles.length; i += CONCURRENCIA_RUST) {
        const bloque = perfiles.slice(i, i + CONCURRENCIA_RUST);
        const promesas = bloque.map(perfil => comprobarRust(perfil));
        const resultadosBloque = await Promise.all(promesas);
        resultadosFinales.push(...resultadosBloque);
    }
    return resultadosFinales;
}

module.exports = {
    buscarPerfilesExactos,
    comprobarRustTodos
};