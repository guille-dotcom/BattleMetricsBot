require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";

// =====================================================
// HEADERS
// =====================================================

function getHeaders() {

    const token = process.env.BATTLEMETRICS_TOKEN;

    return token
        ? {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
        : {
            "Content-Type": "application/json"
        };
}


// =====================================================
// BUSCAR JUGADOR EN SERVIDOR
// =====================================================

async function searchBattleMetricsPlayer(
    playerName,
    serverId
) {

    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers: getHeaders(),

                    params: {
                        include: "player"
                    },

                    timeout: 7000
                }
            );


        const players =
            response.data?.included?.filter(
                item =>
                    item.type === "player"
            ) || [];


        const nombreBuscado =
            playerName
                .toLowerCase()
                .trim();


        const encontrado =
            players.find(
                player => {

                    const nombreBM =
                        player.attributes?.name
                            ?.toLowerCase()
                            .trim();

                    return (
                        nombreBM ===
                        nombreBuscado
                    );
                }
            );


        return encontrado || null;


    } catch (error) {

        console.error(
            "❌ BM | Error buscando jugador:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// OBTENER ESTADO DEL JUGADOR
// =====================================================

async function getBattleMetricsPlayerStatus(
    playerId
) {

    try {

        const token =
            process.env.BATTLEMETRICS_TOKEN;


        const headers =
            token
                ? {
                    Authorization:
                        `Bearer ${token}`
                }
                : {};


        // =================================================
        // DATOS BÁSICOS
        // =================================================

        const playerResponse =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers,
                    timeout: 7000
                }
            );


        const player =
            playerResponse.data?.data;


        if (!player) {

            return null;
        }


        // =================================================
        // SESIONES
        // =================================================

        let sessionResponse = null;


        try {

            sessionResponse =
                await axios.get(
                    `${BM_API}/players/${playerId}/relationships/sessions`,
                    {
                        headers,

                        params: {
                            include: "server",

                            "page[size]": 5
                        },

                        timeout: 7000
                    }
                );

        } catch (error) {

            console.error(
                "❌ BM | Error obteniendo sesiones:",
                error.response?.data ||
                error.message
            );
        }


        const sesiones =
            sessionResponse?.data?.data ||
            [];


        const includedList =
            sessionResponse?.data?.included ||
            [];


        // =================================================
        // DATOS INICIALES
        // =================================================

        let online = false;

        let tiempoJugando = "0m";

        let nombreServidor =
            "Desconocido";

        let serverIdReal =
            null;


        // =================================================
        // SESIÓN ACTIVA
        // =================================================

        const sesionActiva =
            sesiones.find(
                sesion =>
                    sesion.attributes &&
                    (
                        sesion.attributes.stop ===
                        null
                    )
            );


        if (sesionActiva) {

            online = true;


            // =============================================
            // TIEMPO JUGANDO
            // =============================================

            const inicio =
                new Date(
                    sesionActiva.attributes.start
                );


            if (
                !isNaN(
                    inicio.getTime()
                )
            ) {

                const ahora =
                    new Date();


                const segundos =
                    Math.max(
                        0,
                        Math.floor(
                            (
                                ahora -
                                inicio
                            ) / 1000
                        )
                    );


                const horas =
                    Math.floor(
                        segundos / 3600
                    );


                const minutos =
                    Math.floor(
                        (
                            segundos %
                            3600
                        ) / 60
                    );


                tiempoJugando =
                    horas > 0
                        ? `${horas}h ${minutos}m`
                        : `${minutos}m`;
            }


            // =============================================
            // SERVIDOR ACTUAL
            // =============================================

            serverIdReal =
                sesionActiva
                    .relationships
                    ?.server
                    ?.data
                    ?.id ||
                sesionActiva
                    .attributes
                    ?.serverId ||
                null;


            if (serverIdReal) {

                const serverMatch =
                    includedList.find(
                        item =>
                            item.type === "server" &&
                            item.id === serverIdReal
                    );


                if (
                    serverMatch &&
                    serverMatch.attributes?.name
                ) {

                    nombreServidor =
                        serverMatch
                            .attributes
                            .name;
                }
            }
        }


        // =================================================
        // OFFLINE
        // =================================================

        else if (
            sesiones.length > 0
        ) {

            const ultimaSesion =
                sesiones[0];


            serverIdReal =
                ultimaSesion
                    .relationships
                    ?.server
                    ?.data
                    ?.id ||
                ultimaSesion
                    .attributes
                    ?.serverId ||
                null;


            if (serverIdReal) {

                const serverMatch =
                    includedList.find(
                        item =>
                            item.type === "server" &&
                            item.id === serverIdReal
                    );


                if (
                    serverMatch &&
                    serverMatch.attributes?.name
                ) {

                    nombreServidor =
                        serverMatch
                            .attributes
                            .name;
                }
            }
        }


        // =================================================
        // HORAS TOTALES
        // =================================================

        const horasTotalesBM =
            Math.round(
                (
                    Number(
                        player.attributes?.playtime
                    ) || 0
                ) / 3600
            );


        // =================================================
        // LOG LIMPIO
        // =================================================

        console.log(
            `🔎 BM | ${player.attributes?.name || "Desconocido"} (${player.id})`
        );


        console.log(
            `📊 BM | ${sesiones.length} sesiones | ${horasTotalesBM}h | ${
                online
                    ? `🟢 Online | ${nombreServidor}`
                    : "🔴 Offline"
            }`
        );


        // =================================================
        // RESULTADO
        // =================================================

        return {

            id:
                player.id,

            name:
                player.attributes?.name ||
                "Desconocido",

            online:
                online ||
                player.attributes?.online === true,

            jugando:
                tiempoJugando,

            server:
                nombreServidor,

            serverId:
                serverIdReal,

            horasTotalesBM:
                horasTotalesBM
        };


    } catch (error) {

        console.error(
            "❌ BM | Error obteniendo estado:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    searchBattleMetricsPlayer,

    getBattleMetricsPlayerStatus

};