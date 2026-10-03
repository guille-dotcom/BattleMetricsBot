// services/battlemetricsSearch.js

const axios = require("axios");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const BM_API = "https://api.battlemetrics.com";

// ============================================================
// HEADERS
// ============================================================

function getHeaders() {
    return {
        Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json"
    };
}

// ============================================================
// FORMATEAR DURACIÓN
// ============================================================

function formatoDuracion(ms) {

    if (!ms || ms < 0) {
        return "0m";
    }

    const segundos =
        Math.floor(ms / 1000);

    const dias =
        Math.floor(
            segundos / 86400
        );

    const horas =
        Math.floor(
            (segundos % 86400) / 3600
        );

    const minutos =
        Math.floor(
            (segundos % 3600) / 60
        );

    const partes = [];

    if (dias > 0) {
        partes.push(`${dias}d`);
    }

    if (horas > 0) {
        partes.push(`${horas}h`);
    }

    if (
        minutos > 0 ||
        partes.length === 0
    ) {
        partes.push(`${minutos}m`);
    }

    return partes.join(" ");
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
// NORMALIZAR NOMBRES
// ============================================================

function normalizarNombre(nombre) {

    if (!nombre) {
        return "";
    }

    return String(nombre)
        .normalize("NFKC")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

// ============================================================
// BUSCAR JUGADOR DENTRO DE UN SERVIDOR
// ============================================================

async function searchBattleMetricsPlayer(
    playerName,
    serverId
) {

    if (!playerName || !serverId) {
        return null;
    }

    try {

        console.log(
            `[BM] Buscando "${playerName}" en servidor ${serverId}`
        );

        const response = await axios.get(
            `${BM_API}/servers/${serverId}`,
            {
                headers: getHeaders(),
                params: {
                    include: "player"
                },
                timeout: 10000
            }
        );

        const data =
            response.data?.data;

        const included =
            response.data?.included || [];

        console.log(
            `[BM DEBUG] Servidor recibido:`,
            {
                id: data?.id,
                nombre: data?.attributes?.name,
                included: included.length
            }
        );

        // --------------------------------------------------------
        // Buscar players dentro de included
        // --------------------------------------------------------

        const jugadores =
            included.filter(
                item =>
                    item.type === "player"
            );

        console.log(
            `[BM DEBUG] Jugadores encontrados en included: ${jugadores.length}`
        );

        console.log(
            "[BM DEBUG] Primeros jugadores:",
            jugadores
                .slice(0, 20)
                .map(player => ({
                    id: player.id,
                    name: player.attributes?.name
                }))
        );

        // --------------------------------------------------------
        // Comparación exacta normalizada
        // --------------------------------------------------------

        const nombreBuscado =
            normalizarNombre(playerName);

        const jugadorEncontrado =
            jugadores.find(player => {

                const nombreJugador =
                    normalizarNombre(
                        player.attributes?.name
                    );

                return (
                    nombreJugador ===
                    nombreBuscado
                );
            });

        if (jugadorEncontrado) {

            console.log(
                `[BM] Jugador encontrado: ${jugadorEncontrado.attributes?.name} (${jugadorEncontrado.id})`
            );

            return jugadorEncontrado;
        }

        // --------------------------------------------------------
        // Segunda comparación: nombre sin espacios extra
        // --------------------------------------------------------

        const nombreSinEspacios =
            nombreBuscado.replace(
                /\s+/g,
                ""
            );

        const jugadorEncontradoFlexible =
            jugadores.find(player => {

                const nombreJugador =
                    normalizarNombre(
                        player.attributes?.name
                    ).replace(
                        /\s+/g,
                        ""
                    );

                return (
                    nombreJugador ===
                    nombreSinEspacios
                );
            });

        if (jugadorEncontradoFlexible) {

            console.log(
                `[BM] Jugador encontrado por comparación flexible: ${jugadorEncontradoFlexible.attributes?.name} (${jugadorEncontradoFlexible.id})`
            );

            return jugadorEncontradoFlexible;
        }

        // --------------------------------------------------------
        // No encontrado
        // --------------------------------------------------------

        console.log(
            `[BM] No se encontró "${playerName}" en el servidor ${serverId}`
        );

        console.log(
            "[BM DEBUG] Nombres disponibles:",
            jugadores
                .slice(0, 100)
                .map(
                    player =>
                        player.attributes?.name
                )
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

async function getBattleMetricsPlayerStatus(
    playerId
) {

    try {

        // --------------------------------------------------------
        // Información básica
        // --------------------------------------------------------

        const playerResponse =
            await axios.get(
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
                tiempoJugando: "0m",
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

        const sessionsResponse =
            await axios.get(
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
        // Calcular horas totales
        // --------------------------------------------------------

        let horasTotalesBM = 0;

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

        // --------------------------------------------------------
        // OFFLINE
        // --------------------------------------------------------

        if (!sesionActiva) {

            return {
                id: String(playerId),
                name: nombre,
                online: false,
                jugando: false,
                tiempoJugando: "0m",
                server: null,
                serverId: null,
                horasTotalesBM,
                horasTotales:
                    horasTotalesBM
            };
        }

        // --------------------------------------------------------
        // TIEMPO DE LA SESIÓN ACTUAL
        // --------------------------------------------------------

        const inicioSesion =
            sesionActiva.attributes?.start;

        let tiempoJugando =
            "0m";

        if (inicioSesion) {

            const inicioMs =
                new Date(
                    inicioSesion
                ).getTime();

            if (
                Number.isFinite(inicioMs)
            ) {

                tiempoJugando =
                    formatoDuracion(
                        Date.now() -
                        inicioMs
                    );
            }
        }

        // --------------------------------------------------------
        // Servidor actual
        // --------------------------------------------------------

        let serverId = null;
        let serverName = null;

        const serverRelationship =
            sesionActiva.relationships?.server;

        if (
            serverRelationship?.data?.id
        ) {

            serverId =
                String(
                    serverRelationship.data.id
                );

            const serverIncluido =
                included.find(
                    item =>
                        item.type === "server" &&
                        String(item.id) ===
                            serverId
                );

            if (serverIncluido) {

                serverName =
                    serverIncluido.attributes?.name ||
                    null;
            }
        }

        // --------------------------------------------------------
        // Si no vino incluido, obtener servidor
        // --------------------------------------------------------

        if (
            serverId &&
            !serverName
        ) {

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

            // Tiempo REAL de la sesión actual
            tiempoJugando,

            server: serverName,
            serverId,

            horasTotalesBM,
            horasTotales:
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
            tiempoJugando: "0m",
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