require("dotenv").config();
const axios = require("axios");


// =====================================================
// CONFIGURACIÓN API
// =====================================================

const BM_API = "https://api.battlemetrics.com";

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
// 1. BUSCAR JUGADOR EN EL SERVIDOR
// =====================================================

async function searchBattleMetricsPlayer(playerName, serverId) {

    try {

        const response = await axios.get(
            `${BM_API}/servers/${serverId}`,
            {
                headers: getHeaders(),

                params: {
                    include: "player"
                },

                timeout: 5000
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


        const encontrados =
            players.filter(player => {

                const nombreBM =
                    player.attributes?.name
                        ?.toLowerCase()
                        .trim();

                return (
                    nombreBM ===
                    nombreBuscado
                );
            });


        // =================================================
        // SI HAY MÁS DE UN JUGADOR CON EL MISMO NOMBRE
        // =================================================

        if (encontrados.length > 1) {

            console.log(
                `⚠️ Nombre duplicado en BM: ${playerName}`
            );

            return {
                duplicate: true,
                players: encontrados
            };
        }


        return encontrados[0] || null;


    } catch (error) {

        console.error(
            "Error buscando jugador en BM:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// 2. OBTENER DATOS COMPLETOS DEL JUGADOR
// =====================================================

async function getBattleMetricsPlayerStatus(playerId) {

    try {

        console.log(
            `🔎 Obteniendo datos BM del jugador ${playerId}...`
        );


        // =================================================
        // DATOS DEL JUGADOR
        // =================================================

        const playerResponse =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers: getHeaders(),

                    timeout: 7000
                }
            );


        // =================================================
        // DEBUG TEMPORAL
        // =================================================

        console.log(
            "================ BM PLAYER DATA ================"
        );

        console.log(
            JSON.stringify(
                playerResponse.data,
                null,
                2
            )
        );

        console.log(
            "================================================="
        );


        const player =
            playerResponse.data?.data;


        if (!player) {

            console.log(
                "❌ BattleMetrics no devolvió el jugador."
            );

            return null;
        }


        const playerAttributes =
            player.attributes || {};


        // =================================================
        // HORAS TOTALES
        // =================================================

        let segundosTotales =
            Number(
                player.meta?.timePlayed
            ) || 0;


        /*
         * IMPORTANTE:
         *
         * Por ahora NO hacemos consultas adicionales
         * a relationships/servers para las horas.
         *
         * BattleMetrics está devolviendo 405 en ese endpoint.
         *
         * Primero necesitamos comprobar mediante el debug
         * exactamente dónde está entregando el tiempo.
         */


        const horasTotalesBM =
            Math.floor(
                segundosTotales / 3600
            );


        // =================================================
        // SESIONES
        // =================================================

        let todasLasSesiones = [];

        let pagina = 1;

        const limitePaginas = 20;

        let continuar = true;


        while (
            continuar &&
            pagina <= limitePaginas
        ) {

            try {

                console.log(
                    `📥 Obteniendo sesiones BM página ${pagina}...`
                );


                /*
                 * IMPORTANTE:
                 *
                 * BattleMetrics está rechazando
                 * "page[number]".
                 *
                 * Lo dejamos temporalmente sin ese parámetro
                 * para comprobar la respuesta real de la API.
                 */

                const sessionResponse =
                    await axios.get(
                        `${BM_API}/players/${playerId}/relationships/sessions`,
                        {
                            headers: getHeaders(),

                            params: {
                                "page[size]": 100
                            },

                            timeout: 7000
                        }
                    );


                const sesiones =
                    sessionResponse.data?.data || [];


                console.log(
                    `📊 Página ${pagina}: ${sesiones.length} sesiones`
                );


                if (
                    sesiones.length === 0
                ) {

                    break;
                }


                todasLasSesiones.push(
                    ...sesiones
                );


                /*
                 * Como no estamos utilizando page[number],
                 * no debemos pedir repetidamente la misma página.
                 *
                 * Por ahora obtenemos solamente la primera respuesta.
                 */

                continuar = false;


            } catch (error) {

                console.error(
                    `❌ Error obteniendo sesiones página ${pagina}:`,
                    error.response?.data ||
                    error.message
                );

                continuar = false;
            }
        }


        // =================================================
        // ORDENAR SESIONES
        // =================================================

        todasLasSesiones.sort(
            (a, b) => {

                const fechaA =
                    new Date(
                        a.attributes?.start || 0
                    );

                const fechaB =
                    new Date(
                        b.attributes?.start || 0
                    );

                return fechaB - fechaA;
            }
        );


        console.log(
            `📊 Sesiones obtenidas: ${todasLasSesiones.length}`
        );


        // =================================================
        // FECHAS
        // =================================================

        const ahora =
            new Date();


        // =================================================
        // INICIO DE SEMANA
        // =================================================

        const inicioSemana =
            new Date(ahora);


        const diaSemana =
            inicioSemana.getDay();


        const diasDesdeLunes =
            diaSemana === 0
                ? 6
                : diaSemana - 1;


        inicioSemana.setDate(
            inicioSemana.getDate() -
            diasDesdeLunes
        );


        inicioSemana.setHours(
            0,
            0,
            0,
            0
        );


        // =================================================
        // INICIO DE MES
        // =================================================

        const inicioMes =
            new Date(
                ahora.getFullYear(),
                ahora.getMonth(),
                1,
                0,
                0,
                0,
                0
            );


        // =================================================
        // SESIÓN ACTIVA
        // =================================================

        const sesionActiva =
            todasLasSesiones.find(
                sesion => {

                    const stop =
                        sesion.attributes?.stop;

                    return (
                        stop === null ||
                        stop === undefined
                    );
                }
            );


        let online = false;

        let tiempoJugando = "0m";

        let servidorActual = null;


        if (sesionActiva) {

            online = true;


            const inicio =
                new Date(
                    sesionActiva.attributes?.start
                );


            if (
                !isNaN(
                    inicio.getTime()
                )
            ) {

                const segundosJugando =
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
                        segundosJugando /
                        3600
                    );


                const minutos =
                    Math.floor(
                        (
                            segundosJugando %
                            3600
                        ) / 60
                    );


                tiempoJugando =
                    horas > 0
                        ? `${horas}h ${minutos}m`
                        : `${minutos}m`;
            }


            // =================================================
            // SERVIDOR DE LA SESIÓN ACTIVA
            // =================================================

            const serverRelationship =
                sesionActiva.relationships?.server?.data;


            if (serverRelationship?.id) {

                servidorActual =
                    serverRelationship.id;
            }


            // Algunas respuestas pueden traerlo directamente

            if (!servidorActual) {

                servidorActual =
                    sesionActiva.attributes?.serverId ||
                    null;
            }
        }


        // =================================================
        // OBTENER NOMBRE DEL SERVIDOR
        // =================================================

        let nombreServidor =
            "Desconocido";


        if (servidorActual) {

            try {

                const serverResponse =
                    await axios.get(
                        `${BM_API}/servers/${servidorActual}`,
                        {
                            headers: getHeaders(),

                            timeout: 5000
                        }
                    );


                nombreServidor =
                    serverResponse.data?.data?.attributes?.name ||
                    "Desconocido";


            } catch (error) {

                console.log(
                    "⚠️ No se pudo obtener nombre del servidor:",
                    error.message
                );
            }
        }


        // =================================================
        // HORAS SEMANA / MES
        // =================================================

        let segundosSemana = 0;

        let segundosMes = 0;


        // =================================================
        // ÚLTIMA CONEXIÓN
        // =================================================

        let ultimaConexion = null;


        for (
            const sesion
            of todasLasSesiones
        ) {

            const atributos =
                sesion.attributes || {};


            if (!atributos.start) {

                continue;
            }


            const inicio =
                new Date(
                    atributos.start
                );


            if (
                isNaN(
                    inicio.getTime()
                )
            ) {

                continue;
            }


            let fin;


            if (atributos.stop) {

                fin =
                    new Date(
                        atributos.stop
                    );

            } else if (
                sesion === sesionActiva
            ) {

                fin =
                    ahora;

            } else {

                continue;
            }


            if (
                isNaN(
                    fin.getTime()
                )
            ) {

                continue;
            }


            // =================================================
            // DURACIÓN
            // =================================================

            const duracion =
                Math.max(
                    0,
                    Math.floor(
                        (
                            fin -
                            inicio
                        ) / 1000
                    )
                );


            // Evitar advertencia de variable no utilizada
            if (duracion < 0) {
                continue;
            }


            // =================================================
            // ESTA SEMANA
            // =================================================

            if (
                fin >= inicioSemana &&
                inicio <= ahora
            ) {

                const inicioReal =
                    inicio < inicioSemana
                        ? inicioSemana
                        : inicio;


                const finReal =
                    fin > ahora
                        ? ahora
                        : fin;


                segundosSemana +=
                    Math.max(
                        0,
                        Math.floor(
                            (
                                finReal -
                                inicioReal
                            ) / 1000
                        )
                    );
            }


            // =================================================
            // ESTE MES
            // =================================================

            if (
                fin >= inicioMes &&
                inicio <= ahora
            ) {

                const inicioReal =
                    inicio < inicioMes
                        ? inicioMes
                        : inicio;


                const finReal =
                    fin > ahora
                        ? ahora
                        : fin;


                segundosMes +=
                    Math.max(
                        0,
                        Math.floor(
                            (
                                finReal -
                                inicioReal
                            ) / 1000
                        )
                    );
            }


            // =================================================
            // ÚLTIMA CONEXIÓN
            // =================================================

            if (
                atributos.stop
            ) {

                if (
                    !ultimaConexion ||
                    fin > ultimaConexion
                ) {

                    ultimaConexion =
                        fin;
                }
            }
        }


        // =================================================
        // CONVERTIR HORAS
        // =================================================

        const horasSemana =
            Math.floor(
                segundosSemana /
                3600
            );


        const horasMes =
            Math.floor(
                segundosMes /
                3600
            );


        // =================================================
        // FORMATEAR ÚLTIMA CONEXIÓN
        // =================================================

        let ultimaConexionTexto =
            "Nunca";


        if (ultimaConexion) {

            const dia =
                String(
                    ultimaConexion.getDate()
                ).padStart(2, "0");


            const mes =
                String(
                    ultimaConexion.getMonth() + 1
                ).padStart(2, "0");


            const anio =
                ultimaConexion.getFullYear();


            const hora =
                String(
                    ultimaConexion.getHours()
                ).padStart(2, "0");


            const minutos =
                String(
                    ultimaConexion.getMinutes()
                ).padStart(2, "0");


            ultimaConexionTexto =
                `${dia}/${mes}/${anio} ${hora}:${minutos}`;
        }


        // =================================================
        // HISTORIAL DE NOMBRES
        // =================================================

        let historialNombres = [];


        /*
         * Temporalmente no consultamos identifiers porque
         * BattleMetrics está devolviendo 405.
         */

        historialNombres = [];


        // =================================================
        // RESULTADO
        // =================================================

        const resultado = {

            id:
                player.id,

            name:
                playerAttributes.name ||
                "Desconocido",

            online:
                online,

            jugando:
                tiempoJugando,

            horasTotalesBM:
                horasTotalesBM,

            horasSemana:
                horasSemana,

            horasMes:
                horasMes,

            ultimaConexion:
                ultimaConexionTexto,

            server:
                nombreServidor,

            historialNombres:
                historialNombres
        };


        console.log(
            "✅ Datos BM obtenidos:",
            {
                id: resultado.id,
                nombre: resultado.name,
                online: resultado.online,
                servidor: resultado.server,
                horas: resultado.horasTotalesBM,
                semana: resultado.horasSemana,
                mes: resultado.horasMes,
                ultimaConexion:
                    resultado.ultimaConexion
            }
        );


        return resultado;


    } catch (error) {

        console.error(
            "❌ Error obteniendo status BM:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// 3. RANKING DEL SERVIDOR
// =====================================================

async function getServerLeaderboard(serverId) {

    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers: getHeaders(),

                    params: {
                        include: "player"
                    },

                    timeout: 5000
                }
            );


        const included =
            response.data?.included || [];


        const players =
            included.filter(
                item =>
                    item.type === "player"
            );


        if (
            players.length === 0
        ) {

            return [];
        }


        const validResults =
            players.map(player => ({

                id:
                    player.id,

                name:
                    player.attributes?.name ||
                    "Desconocido",

                timePlayedSeconds:
                    Number(
                        player.meta?.timePlayed
                    ) || 0

            }));


        validResults.sort(
            (a, b) =>
                b.timePlayedSeconds -
                a.timePlayedSeconds
        );


        return validResults;


    } catch (error) {

        console.error(
            "Error obteniendo ranking del servidor:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    searchBattleMetricsPlayer,

    getBattleMetricsPlayerStatus,

    getServerLeaderboard

};