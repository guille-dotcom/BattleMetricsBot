
require("dotenv").config();

const axios = require("axios");

const API = "https://api.battlemetrics.com";
const PLAYER_ID = "974273763";
const TOKEN = process.env.BATTLEMETRICS_TOKEN;

const HEADERS = {
    Authorization: `Bearer ${TOKEN}`,
    Accept: "application/json"
};

const sleep = (ms) =>
    new Promise(resolve => setTimeout(resolve, ms));

async function obtener(url) {
    const response = await axios.get(url, {
        headers: HEADERS,
        timeout: 30000
    });

    return response.data;
}

async function obtenerSesiones() {
    const sesiones = [];
    let url =
        `${API}/players/${PLAYER_ID}/relationships/sessions?page[size]=100`;

    while (url) {
        const respuesta = await obtener(url);

        sesiones.push(...(respuesta.data || []));

        const siguiente = respuesta.links?.next;

        if (!siguiente) {
            url = null;
        } else if (siguiente.startsWith("http")) {
            url = siguiente;
        } else {
            url = `${API}${siguiente}`;
        }
    }

    return sesiones;
}

async function comprobarServidor(serverId) {
    try {
        const respuesta = await obtener(
            `${API}/players/${PLAYER_ID}/servers/${serverId}`
        );

        const datos = respuesta.data;
        const atributos = datos?.attributes || {};

        return {
            serverId,
            online: atributos.online,
            lastSeen: atributos.lastSeen,
            firstSeen: atributos.firstSeen,
            timePlayed: atributos.timePlayed
        };
    } catch (error) {
        return {
            serverId,
            error:
                error.response?.status
                    ? `HTTP ${error.response.status}`
                    : error.message
        };
    }
}

async function main() {
    if (!TOKEN) {
        console.error(
            "ERROR: no se encontró BATTLEMETRICS_TOKEN en el archivo .env"
        );
        process.exitCode = 1;
        return;
    }

    try {
        console.log("Consultando el perfil de Shaper...");

        const perfil = await obtener(
            `${API}/players/${PLAYER_ID}?include=server`
        );

        const nombre =
            perfil.data?.attributes?.name || "Nombre desconocido";

        console.log(`Jugador: ${nombre}`);
        console.log(`BattleMetrics ID: ${PLAYER_ID}`);

        const ids = new Set();

        // Servidores incluidos en la respuesta del perfil.
        for (const item of perfil.included || []) {
            if (item.type === "server" && item.id) {
                ids.add(String(item.id));
            }
        }

        // Relaciones de servidores, si la API las devuelve.
        const relaciones =
            perfil.data?.relationships || {};

        for (const clave of ["servers", "server"]) {
            const relacion = relaciones[clave]?.data;

            if (Array.isArray(relacion)) {
                for (const item of relacion) {
                    if (item?.id) ids.add(String(item.id));
                }
            } else if (relacion?.id) {
                ids.add(String(relacion.id));
            }
        }

        console.log("Consultando historial de sesiones...");

        const sesiones = await obtenerSesiones();

        for (const sesion of sesiones) {
            const relacion = sesion.relationships?.server?.data;

            if (relacion?.id) {
                ids.add(String(relacion.id));
            }
        }

        console.log(`Servidores únicos encontrados: ${ids.size}`);

        if (ids.size === 0) {
            console.log(
                "No se encontraron IDs de servidores para comprobar."
            );
            return;
        }

        const lista = [...ids];
        const resultados = [];
        const concurrencia = 4;

        for (let i = 0; i < lista.length; i += concurrencia) {
            const grupo = lista.slice(i, i + concurrencia);

            const comprobaciones = await Promise.all(
                grupo.map(id => comprobarServidor(id))
            );

            resultados.push(...comprobaciones);

            console.log(
                `Comprobados ${Math.min(i + grupo.length, lista.length)} / ${lista.length}`
            );

            await sleep(250);
        }

        const conectados = resultados.filter(
            resultado => resultado.online === true
        );

        console.log("\n========== RESULTADO ==========");

        if (conectados.length > 0) {
            console.log("BattleMetrics marca estos servidores como ONLINE:");

            for (const servidor of conectados) {
                console.log(`Servidor ID: ${servidor.serverId}`);
                console.log(`Última actividad: ${servidor.lastSeen || "No disponible"}`);
                console.log("------------------------------");
            }
        } else {
            console.log(
                "Ninguno de los servidores consultados aparece como online."
            );
            console.log(
                "Esto no demuestra por sí solo que el jugador esté desconectado."
            );
        }

        const errores = resultados.filter(r => r.error);

        console.log(`\nConsultas completadas: ${resultados.length}`);
        console.log(`Consultas con error: ${errores.length}`);
        console.log(`Sesiones del historial: ${sesiones.length}`);

        if (errores.length > 0) {
            console.log(
                "Primeros errores:",
                errores.slice(0, 10)
            );
        }
    } catch (error) {
        console.error(
            "Error consultando BattleMetrics:",
            error.response?.status || error.message
        );
    }
}

main();