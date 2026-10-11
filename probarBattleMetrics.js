
require("dotenv").config();

const axios = require("axios");

const TOKEN = process.env.BATTLEMETRICS_TOKEN;
const PLAYER_ID = process.argv[2];
const API = "https://api.battlemetrics.com";

const api = axios.create({
    baseURL: API,
    timeout: 30000,
    headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: "application/vnd.api+json"
    }
});

function titulo(texto) {
    console.log("\n" + "=".repeat(55));
    console.log(texto);
    console.log("=".repeat(55));
}

function mostrarError(error) {
    console.log(
        `HTTP ${error.response?.status || "?"}:`,
        error.response?.data?.errors?.[0]?.detail ||
        error.response?.data?.message ||
        error.message
    );
}

async function ejecutar() {
    titulo("DIAGNÓSTICO DE ACTIVIDAD BATTLEMETRICS");

    console.log("Jugador:", PLAYER_ID);
    console.log("Token configurado:", Boolean(TOKEN));

    if (!TOKEN || !PLAYER_ID || !/^\d+$/.test(PLAYER_ID)) {
        console.log(
            "Comprueba el .env y ejecuta: " +
            "node probarBattleMetrics.js 974273763"
        );
        return;
    }

    // 1. Consultar sesiones recientes.
    titulo("1. SESIONES RECIENTES");

    let sesiones = [];

    try {
        const response = await api.get(
            `/players/${PLAYER_ID}/relationships/sessions`,
            { params: { "page[size]": 100 } }
        );

        sesiones = response.data?.data || [];

        console.log("Sesiones recibidas:", sesiones.length);

        for (const sesion of sesiones.slice(0, 5)) {
            const a = sesion.attributes || {};
            const r = sesion.relationships || {};

            console.log({
                inicio: a.start || null,
                fin: a.stop ?? null,
                servidor:
                    r.server?.data?.id ||
                    r.servers?.data?.[0]?.id ||
                    null
            });
        }
    } catch (error) {
        mostrarError(error);
        return;
    }

    // 2. Consultar información del jugador en sus últimos servidores.
    titulo("2. INFORMACIÓN JUGADOR + SERVIDOR");

    const servidores = [];

    for (const sesion of sesiones) {
        const r = sesion.relationships || {};

        const serverId =
            r.server?.data?.id ||
            r.servers?.data?.[0]?.id;

        if (serverId && !servidores.includes(serverId)) {
            servidores.push(serverId);
        }

        if (servidores.length >= 5) break;
    }

    // Añadimos el servidor más reciente que vimos en el diagnóstico.
    if (!servidores.includes("36365112")) {
        servidores.unshift("36365112");
    }

    for (const serverId of servidores.slice(0, 5)) {
        console.log(`\n--- Servidor ${serverId} ---`);

        try {
            const response = await api.get(
                `/players/${PLAYER_ID}/servers/${serverId}`
            );

            const resultado = response.data?.data;

            if (!resultado) {
                console.log("La API no devolvió datos del jugador.");
                continue;
            }

            console.log("Tipo:", resultado.type);
            console.log("ID:", resultado.id);
            console.log(
                "Atributos:",
                JSON.stringify(
                    resultado.attributes || {},
                    null,
                    2
                )
            );

            console.log(
                "Relaciones:",
                JSON.stringify(
                    resultado.relationships || {},
                    null,
                    2
                )
            );

            console.log(
                "Metadatos:",
                JSON.stringify(
                    resultado.meta || {},
                    null,
                    2
                )
            );
        } catch (error) {
            mostrarError(error);
        }
    }

    // 3. Consultar el perfil con la relación de servidor.
    titulo("3. PERFIL Y RELACIÓN SERVER");

    try {
        const response = await api.get(`/players/${PLAYER_ID}`, {
            params: { include: "server" }
        });

        const jugador = response.data?.data;

        console.log(
            "Nombre:",
            jugador?.attributes?.name || "Desconocido"
        );

        console.log(
            "Relación server:",
            JSON.stringify(
                jugador?.relationships?.server || null,
                null,
                2
            )
        );

        console.log(
            "Servidores incluidos:",
            (response.data?.included || [])
                .filter(item => item.type === "server")
                .map(item => ({
                    id: item.id,
                    nombre: item.attributes?.name
                }))
        );
    } catch (error) {
        mostrarError(error);
    }

    titulo("DIAGNÓSTICO TERMINADO");

    console.log(
        "No se ha modificado ningún archivo del funcionamiento del bot."
    );
}

ejecutar().catch(error => {
    console.log("Error inesperado:", error.message);
});