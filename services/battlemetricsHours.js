require("dotenv").config();
const axios = require("axios");


// =====================================================
// 1. BUSCAR JUGADOR ONLINE/REGISTRADO EN EL SERVIDOR
// =====================================================

async function searchBattleMetricsPlayer(playerName, serverId) {
    try {
        const token = process.env.BATTLEMETRICS_TOKEN;

        const response = await axios.get(
            `https://api.battlemetrics.com/servers/${serverId}`,
            {
                headers: token
                    ? { Authorization: `Bearer ${token}` }
                    : {},

                params: {
                    include: "player"
                },

                timeout: 4000
            }
        );

        const players =
            response.data.included?.filter(
                item => item.type === "player"
            ) || [];

        const nombreBuscado =
            playerName.toLowerCase().trim();

        const encontrado = players.find(player => {
            const nombreBM =
                player.attributes?.name?.toLowerCase().trim();

            return nombreBM === nombreBuscado;
        });

        return encontrado || null;

    } catch (error) {
        console.error(
            "Error buscando en BM:",
            error.message
        );

        return null;
    }
}


// =====================================================
// 2. OBTENER ESTADO, HORAS Y ACTIVIDAD DEL JUGADOR
// =====================================================

async function getBattleMetricsPlayerStatus(playerId) {

    try {

        const token = process.env.BATTLEMETRICS_TOKEN;

        const headers = {
            "Content-Type": "application/json"
        };

        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }


        // =================================================
        // DATOS DEL JUGADOR
        // =================================================

        const playerRes = await axios.get(
            `https://api.battlemetrics.com/players/${playerId}?include=server`,
            {
                headers,
                timeout: 5000
            }
        );


        // =================================================
        // COMPROBAR JUGADOR
        // =================================================

        const player = playerRes.data.data;

        if (!player) {
            return null;
        }


        // =================================================
        // HORAS TOTALES BM
        // =================================================

        const incluidos =
            playerRes.data.included || [];

        let segundosTotales = 0;

        const servidoresContados =
            new Set();

        let nombreServidorActual =
            "Desconocido";

        let activeServerId =
            player.relationships?.server?.data?.id;


        for (const item of incluidos) {

            if (item.type !== "server") {
                continue;
            }

            const servidorId =
                item.id;


            // ---------------------------------------------
            // NOMBRE DEL SERVIDOR ACTUAL
            // ---------------------------------------------

            if (
                activeServerId &&
                servidorId === activeServerId
            ) {

                nombreServidorActual =
                    item.attributes?.name ||
                    "Desconocido";
            }


            // ---------------------------------------------
            // EVITAR DUPLICADOS
            // ---------------------------------------------

            if (
                servidoresContados.has(
                    servidorId
                )
            ) {
                continue;
            }

            servidoresContados.add(
                servidorId
            );


            // ---------------------------------------------
            // TIEMPO TOTAL DEL SERVIDOR
            // ---------------------------------------------

            segundosTotales +=
                item.meta?.timePlayed || 0;
        }


        const horasTotalesCalculadas =
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


        // =================================================
        // FECHAS PARA SABER CUÁNTO HISTORIAL NECESITAMOS
        // =================================================

        const ahora = new Date();


        // Lunes de esta semana a las 00:00
        const inicioSemana =
            new Date(ahora);

        const diaSemana =
            inicioSemana.getDay();

        const diferenciaLunes =
            diaSemana === 0
                ? 6
                : diaSemana - 1;

        inicioSemana.setDate(
            inicioSemana.getDate() -
            diferenciaLunes
        );

        inicioSemana.setHours(
            0,
            0,
            0,
            0
        );


        // Primer día del mes
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


        // La fecha que necesitamos cubrir
        const fechaMinimaNecesaria =
            inicioMes;


        // =================================================
        // PAGINACIÓN DE SESIONES
        // =================================================

        while (
            continuar &&
            pagina <= limitePaginas
        ) {

            try {

                const sessionRes =
                    await axios.get(
                        `https://api.battlemetrics.com/players/${playerId}/relationships/sessions`,
                        {
                            headers,

                            params: {
                                "page[size]": 100,
                                "page[number]": pagina
                            },

                            timeout: 5000
                        }
                    );


                const sesionesPagina =
                    sessionRes.data?.data || [];


                if (
                    sesionesPagina.length === 0
                ) {
                    break;
                }


                todasLasSesiones.push(
                    ...sesionesPagina
                );


                // -----------------------------------------
                // REVISAR SI YA TENEMOS SUFICIENTE HISTORIAL
                // -----------------------------------------

                let encontramosSesionesAntiguas =
                    false;


                for (
                    const sesion
                    of sesionesPagina
                ) {

                    const inicio =
                        sesion.attributes?.start;

                    if (!inicio) {
                        continue;
                    }

                    const fechaInicio =
                        new Date(inicio);


                    if (
                        fechaInicio <=
                        fechaMinimaNecesaria
                    ) {

                        encontramosSesionesAntiguas =
                            true;

                        break;
                    }
                }


                // -----------------------------------------
                // SI YA LLEGAMOS AL MES, PARAMOS
                // -----------------------------------------

                if (
                    encontramosSesionesAntiguas
                ) {
                    continuar = false;
                    break;
                }


                // -----------------------------------------
                // SI DEVOLVIÓ MENOS DE 100,
                // PROBABLEMENTE NO HAY MÁS
                // -----------------------------------------

                if (
                    sesionesPagina.length < 100
                ) {
                    continuar = false;
                    break;
                }


                pagina++;

            } catch (error) {

                console.error(
                    "Error obteniendo página de sesiones BM:",
                    error.message
                );

                continuar = false;
            }
        }


        // =================================================
        // ORDENAR SESIONES DE MÁS NUEVA A MÁS ANTIGUA
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


        // =================================================
        // BUSCAR SESIÓN ACTIVA
        // =================================================

        const sesionActiva =
            todasLasSesiones.find(
                sesion =>
                    sesion.attributes?.stop === null
            );


        let online = false;

        let tiempoJugando = "0m";


        if (sesionActiva) {

            online = true;


            const inicio =
                new Date(
                    sesionActiva.attributes.start
                );


            const segundosJugando =
                Math.max(
                    0,
                    Math.floor(
                        (ahora - inicio) /
                        1000
                    )
                );


            const h =
                Math.floor(
                    segundosJugando / 3600
                );

            const m =
                Math.floor(
                    (segundosJugando % 3600) /
                    60
                );


            tiempoJugando =
                h > 0
                    ? `${h}h ${m}m`
                    : `${m}m`;


            // -----------------------------------------
            // INTENTAR OBTENER EL SERVIDOR
            // DE LA SESIÓN ACTIVA
            // -----------------------------------------

            const servidorSesion =
                sesionActiva.relationships
                    ?.server
                    ?.data
                    ?.id;


            if (servidorSesion) {

                activeServerId =
                    servidorSesion;


                const servidorIncluido =
                    incluidos.find(
                        item =>
                            item.type === "server" &&
                            item.id ===
                                servidorSesion
                    );


                if (servidorIncluido) {

                    nombreServidorActual =
                        servidorIncluido
                            .attributes?.name ||
                        nombreServidorActual;
                }
            }


            // -----------------------------------------
            // SI LA API DEVUELVE serverId DIRECTAMENTE
            // -----------------------------------------

            const serverIdDirecto =
                sesionActiva.attributes?.serverId;


            if (
                serverIdDirecto &&
                !servidorSesion
            ) {

                activeServerId =
                    serverIdDirecto;


                const servidorIncluido =
                    incluidos.find(
                        item =>
                            item.type === "server" &&
                            item.id ===
                                serverIdDirecto
                    );


                if (servidorIncluido) {

                    nombreServidorActual =
                        servidorIncluido
                            .attributes?.name ||
                        nombreServidorActual;
                }
            }
        }


        // =================================================
        // HORAS ESTA SEMANA
        // =================================================

        let segundosSemana = 0;


        // =================================================
        // HORAS ESTE MES
        // =================================================

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


            const inicio =
                atributos.start
                    ? new Date(
                        atributos.start
                    )
                    : null;


            let fin = null;


            if (
                atributos.stop
            ) {

                fin =
                    new Date(
                        atributos.stop
                    );

            } else if (
                sesion === sesionActiva
            ) {

                fin = ahora;
            }


            if (
                !inicio ||
                isNaN(inicio.getTime())
            ) {
                continue;
            }


            if (
                !fin ||
                isNaN(fin.getTime())
            ) {
                continue;
            }


            // =============================================
            // DURACIÓN DE LA SESIÓN
            // =============================================

            const duracion =
                Math.max(
                    0,
                    Math.floor(
                        (fin - inicio) /
                        1000
                    )
                );


            // =============================================
            // ESTA SEMANA
            // =============================================

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


                const duracionSemana =
                    Math.max(
                        0,
                        Math.floor(
                            (finReal -
                                inicioReal) /
                            1000
                        )
                    );


                segundosSemana +=
                    duracionSemana;
            }


            // =============================================
            // ESTE MES
            // =============================================

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


                const duracionMes =
                    Math.max(
                        0,
                        Math.floor(
                            (finReal -
                                inicioReal) /
                            1000
                        )
                    );


                segundosMes +=
                    duracionMes;
            }


            // =============================================
            // ÚLTIMA CONEXIÓN
            // =============================================

            if (
                atributos.stop &&
                (
                    !ultimaConexion ||
                    fin > ultimaConexion
                )
            ) {

                ultimaConexion = fin;
            }
        }


        // =================================================
        // CONVERTIR SEGUNDOS A HORAS
        // =================================================

        const horasSemana =
            Math.floor(
                segundosSemana / 3600
            );


        const horasMes =
            Math.floor(
                segundosMes / 3600
            );


        // =================================================
        // FORMATEAR ÚLTIMA CONEXIÓN
        // =================================================

        let ultimaConexionTexto =
            "Nunca";


        if (ultimaConexion) {

            const fecha =
                ultimaConexion;


            const dia =
                String(
                    fecha.getDate()
                ).padStart(2, "0");


            const mes =
                String(
                    fecha.getMonth() + 1
                ).padStart(2, "0");


            const anio =
                fecha.getFullYear();


            const hora =
                String(
                    fecha.getHours()
                ).padStart(2, "0");


            const minutos =
                String(
                    fecha.getMinutes()
                ).padStart(2, "0");


            ultimaConexionTexto =
                `${dia}/${mes}/${anio} ${hora}:${minutos}`;
        }


        // =================================================
        // RESULTADO FINAL
        // =================================================

        return {

            id: player.id,

            name:
                player.attributes?.name ||
                "Desconocido",

            online:
                online ||
                player.attributes?.online === true,

            jugando:
                tiempoJugando,

            horasTotalesBM:
                horasTotalesCalculadas,

            horasSemana:
                horasSemana,

            horasMes:
                horasMes,

            ultimaConexion:
                ultimaConexionTexto,

            server:
                nombreServidorActual,

            historialNombres:
                []
        };


    } catch (error) {

        console.error(
            "Error obteniendo status BM:",
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

        const token =
            process.env.BATTLEMETRICS_TOKEN;

        const headers = token
            ? {
                Authorization:
                    `Bearer ${token}`
            }
            : {};


        const response =
            await axios.get(
                `https://api.battlemetrics.com/servers/${serverId}`,
                {
                    headers,

                    params: {
                        include: "player"
                    },

                    timeout: 4000
                }
            );


        const included =
            response.data.included || [];


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
                    player.meta?.timePlayed ||
                    0

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