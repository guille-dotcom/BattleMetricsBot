const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://rusthelp.com/es-ES";

async function buscarItemRustHelp(nombre) {
    try {
        const busqueda = encodeURIComponent(nombre.trim());

        const response = await axios.get(
            `${BASE_URL}/search?q=${busqueda}`,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36"
                },
                timeout: 10000
            }
        );

        const $ = cheerio.load(response.data);

        const resultados = [];

        $("a").each((i, el) => {

            const texto = $(el)
                .text()
                .trim();

            const href = $(el)
                .attr("href");

            if (
                texto &&
                href &&
                href.includes("/items/")
            ) {

                resultados.push({
                    nombre: texto,
                    url: href.startsWith("http")
                        ? href
                        : `https://rusthelp.com${href}`
                });

            }

        });

        const buscado =
            nombre
                .toLowerCase()
                .trim();

        const exacto =
            resultados.find(
                item =>
                    item.nombre
                        .toLowerCase()
                        .trim() === buscado
            );

        return exacto || resultados[0] || null;

    } catch (error) {

        console.error(
            "❌ RustHelp búsqueda:",
            error.message
        );

        return null;
    }
}


// =====================================================
// OBTENER COSTO DE RAID
// =====================================================

async function obtenerCostoRaid(url) {

    try {

        const response = await axios.get(
            url,
            {
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36"
                },
                timeout: 10000
            }
        );

        const $ = cheerio.load(response.data);

        let nombreItem =
            $("h1").first().text().trim();

        if (!nombreItem) {
            nombreItem = "Desconocido";
        }

        const resultados = [];

        // Buscar la tabla de Raiding Cost
        $("table").each((tablaIndex, tabla) => {

            const encabezados = [];

            $(tabla)
                .find("thead th")
                .each((i, el) => {

                    encabezados.push(
                        $(el)
                            .text()
                            .trim()
                            .toLowerCase()
                    );

                });

            const textoTabla =
                $(tabla)
                    .text()
                    .toLowerCase();

            // Solo nos interesa la tabla que contiene
            // herramientas de raideo
            if (
                textoTabla.includes("herramienta") ||
                textoTabla.includes("cantidad") ||
                textoTabla.includes("costo")
            ) {

                $(tabla)
                    .find("tbody tr")
                    .each((i, fila) => {

                        const columnas = [];

                        $(fila)
                            .find("td")
                            .each((j, celda) => {

                                columnas.push(
                                    $(celda)
                                        .text()
                                        .replace(/\s+/g, " ")
                                        .trim()
                                );

                            });

                        if (
                            columnas.length >= 2
                        ) {

                            resultados.push(
                                columnas
                            );

                        }

                    });

            }

        });

        // =================================================
        // SEPARAR MELEE / EXPLOSIVOS
        // =================================================

        const melee = [];
        const explosivos = [];

        const nombresExplosivos = [
            "carga explosiva",
            "misil",
            "munición explosiva",
            "cohete",
            "cohetes",
            "satchel",
            "explosivo",
            "granada f1",
            "mina terrestre",
            "bomba"
        ];

        for (const fila of resultados) {

            const herramienta =
                fila[0] || "";

            const cantidad =
                fila[1] || "";

            const tiempo =
                fila[2] || "";

            const costo =
                fila[3] || "";

            const texto =
                herramienta.toLowerCase();

            const esExplosivo =
                nombresExplosivos.some(
                    nombre =>
                        texto.includes(nombre)
                );

            const dato = {
                herramienta,
                cantidad,
                tiempo,
                costo
            };

            if (esExplosivo) {
                explosivos.push(dato);
            } else {
                melee.push(dato);
            }

        }

        return {
            nombre: nombreItem,
            url,
            melee,
            explosivos
        };

    } catch (error) {

        console.error(
            "❌ RustHelp raid:",
            error.message
        );

        return null;
    }
}


// =====================================================
// FUNCIÓN PRINCIPAL
// =====================================================

async function consultarRaid(nombre) {

    const item =
        await buscarItemRustHelp(nombre);

    if (!item) {
        return null;
    }

    return await obtenerCostoRaid(
        item.url
    );
}


module.exports = {
    buscarItemRustHelp,
    obtenerCostoRaid,
    consultarRaid
};