// services/battlemetricsSearch.js

const axios = require("axios");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const BM_API = "https://api.battlemetrics.com";

function getHeaders() {
    return {
        Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json"
    };
}

// ============================================================
// OBTENER NOMBRE ACTUAL DE STEAM
// ============================================================

async function obtenerNombreSteam(steamId) {

    try {

        const steamApiKey =
            process.env.STEAM_API_KEY ||
            process.env.STEAM_WEB_API_KEY ||
            process.env.STEAMID_API_KEY;

        if (!steamApiKey) {
            console.error(
                "[STEAM] No existe STEAM_API_KEY, STEAM_WEB_API_KEY ni STEAMID_API_KEY"
            );

            return null;
        }

        console.log(
            `[STEAM] Buscando nombre para Steam ID ${steamId}`
        );

        const response = await axios.get(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
            {
                params: {
                    key: steamApiKey,
                    steamids: steamId
                },
                timeout: 10000
            }
        );

        const jugadores =
            response.data?.response?.players || [];

        if (!jugadores.length) {

            console.log(
                `[STEAM] No se encontró el Steam ID ${steamId}`
            );

            return null;
        }

        const jugador =
            jugadores[0];

        const nombre =
            jugador.personaname;

        console.log(
            `[STEAM] Steam ID ${steamId} -> ${nombre}`
        );

        return nombre || null;

    } catch (error) {

        console.error(
            "[STEAM] Error obteniendo nombre:",
            error.response?.status,
            error.response?.data || error.message
        );

        return null;
    }
}

// ============================================================
// BUSCAR JUGADOR POR NOMBRE DENTRO DE UN SERVIDOR
// ============================================================

async function searchBattleMetricsPlayer(playerName, serverId) {

    if (!playerName || !serverId) {
        return null;
    }

    try {

        console.log(
            `[BM] Buscando "${playerName}" en servidor ${serverId}`
        );

        // --------------------------------------------------------
        // Obtener jugadores relacionados con el servidor
        // --------------------------------------------------------

        const response = await axios.get(
            `${BM_API}/servers/${serverId}/relationships/players`,
            {
                headers: getHeaders(),
                params: {
                    "page[size]": 100
                },
                timeout: 10000
            }
        );

        const jugadores =
            response.data?.data || [];

        console.log(
            `[BM DEBUG] Servidor ${serverId} devolvió ${jugadores.length} jugadores`
        );

        console.log(
            "[BM DEBUG] Primeros jugadores:",
            jugadores.slice(0, 20).map(player => ({
                id: player.id,
                name: player.attributes?.name
            }))
        );

        // --------------------------------------------------------
        // Normalizar nombres
        // --------------------------------------------------------

        const normalizarNombre = nombre => {

            if (!nombre) {
                return "";
            }

            return String(nombre)
                .normalize("NFKC")
                .trim()
                .replace(/\s+/g, " ")
                .toLowerCase();
        };

        const nombreBuscado =
            normalizarNombre(playerName);

        // --------------------------------------------------------
        // Coincidencia exacta
        // --------------------------------------------------------

        const jugadorEncontrado =
            jugadores.find(player => {

                const nombreJugador =
                    normalizarNombre(
                        player.attributes?.name
                    );

                return nombreJugador === nombreBuscado;
            });

        if (jugadorEncontrado) {

            console.log(
                `[BM] Jugador encontrado: ${jugadorEncontrado.attributes?.name} (${jugadorEncontrado.id})`
            );

            return jugadorEncontrado;
        }

        // --------------------------------------------------------
        // DEBUG
        // --------------------------------------------------------

        console.log(
            `[BM] No se encontró "${playerName}" en el servidor ${serverId}`
        );

        console.log(
            "[BM DEBUG] Nombres disponibles:",
            jugadores
                .slice(0, 50)
                .map(player => player.attributes?.name)
                .filter(Boolean)
        );

        return null;

    } catch (error) {

        console.error(
            "[BM] Error buscando jugador:",
            error.response?.status,
            error.response?.data || error.message
        );

        return null;
    }
}

// ============================================================
// OBTENER ESTADO ACTUAL DEL JUGADOR
// ============================================================

async function getBattleMetricsPlayerStatus(playerId) {

    try {

        // --------------------------------------------------------
        // Información básica del jugador
        // --------------------------------------------------------

        const playerResponse = await axios.get(
            `${BM_API}/players/${playerId}`,
            {
                headers: getHeaders(),
                timeout: 10000
            }
        );

        const playerData =
            playerResponse.data?.data;

        if (!playerData) {

            return {
                id: String(playerId),
                name: "Desconocido",
                online: false,
                jugando: false,
                server: null,
                serverId: null,
                horasTotalesBM: 0
            };
        }

        const nombre =
            playerData.attributes?.name ||
            "Desconocido";

        // --------------------------------------------------------
        // Sesiones
        // --------------------------------------------------------

        const sessionsResponse = await axios.get(
            `${BM_API}/players/${playerId}/relationships/sessions`,
            {
                headers: getHeaders(),
                params: {
                    include: "server",
                    "page[size]": 5
                },
                timeout: 10000
            }
        );

        const sessions =
            sessionsResponse.data?.data || [];

        const included =
            sessionsResponse.data?.included || [];

        // --------------------------------------------------------
        // Buscar sesión activa
        // --------------------------------------------------------

        const sesionActiva =
            sessions.find(session => {

                const stop =
                    session.attributes?.stop;

                return (
                    stop === null ||
                    stop === undefined
                );
            });

        // --------------------------------------------------------
        // Calcular horas
        // --------------------------------------------------------

        let horasTotalesBM = 0;

        if (Array.isArray(sessions)) {

            let segundosTotales = 0;

            for (const session of sessions) {

                const inicio =
                    session.attributes?.start;

                const fin =
                    session.attributes?.stop;

                if (!inicio) {
                    continue;
                }

                const inicioMs =
                    new Date(inicio).getTime();

                const finMs =
                    fin
                        ? new Date(fin).getTime()
                        : Date.now();

                if (
                    Number.isFinite(inicioMs) &&
                    Number.isFinite(finMs) &&
                    finMs >= inicioMs
                ) {

                    segundosTotales +=
                        (finMs - inicioMs) / 1000;
                }
            }

            horasTotalesBM =
                segundosTotales / 3600;
        }

        // --------------------------------------------------------
        // Offline
        // --------------------------------------------------------

        if (!sesionActiva) {

            return {
                id: String(playerId),
                name: nombre,
                online: false,
                jugando: false,
                server: null,
                serverId: null,
                horasTotalesBM
            };
        }

        // --------------------------------------------------------
        // Servidor de la sesión
        // --------------------------------------------------------

        let serverId = null;
        let serverName = null;

        const serverRelationship =
            sesionActiva.relationships?.server;

        if (serverRelationship?.data?.id) {

            serverId =
                String(
                    serverRelationship.data.id
                );

            const serverIncluido =
                included.find(
                    item =>
                        item.type === "server" &&
                        String(item.id) === serverId
                );

            if (serverIncluido) {

                serverName =
                    serverIncluido.attributes?.name ||
                    null;
            }
        }

        // --------------------------------------------------------
        // Si no vino incluido, pedir servidor
        // --------------------------------------------------------

        if (serverId && !serverName) {

            try {

                const serverResponse =
                    await axios.get(
                        `${BM_API}/servers/${serverId}`,
                        {
                            headers: getHeaders(),
                            timeout: 10000
                        }
                    );

                serverName =
                    serverResponse.data?.data?.attributes?.name ||
                    null;

            } catch (error) {

                console.warn(
                    `[BM] No se pudo obtener nombre del servidor ${serverId}`
                );
            }
        }

        // --------------------------------------------------------
        // Resultado
        // --------------------------------------------------------

        return {
            id: String(playerId),
            name: nombre,
            online: true,
            jugando: true,
            server: serverName,
            serverId,
            horasTotalesBM
        };

    } catch (error) {

        console.error(
            `[BM] Error obteniendo estado del jugador ${playerId}:`,
            error.response?.status,
            error.response?.data || error.message
        );

        return {
            id: String(playerId),
            name: "Desconocido",
            online: false,
            jugando: false,
            server: null,
            serverId: null,
            horasTotalesBM: 0
        };
    }
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    obtenerNombreSteam,
    searchBattleMetricsPlayer,
    getBattleMetricsPlayerStatus
};