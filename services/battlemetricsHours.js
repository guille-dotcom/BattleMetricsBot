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
// FORMATEAR FECHA A HORA DE CHILE
// =====================================================

function formatearFechaChile(fecha) {

    if (!fecha) {
        return "Nunca";
    }

    try {

        return new Intl.DateTimeFormat(
            "es-CL",
            {
                timeZone: "America/Santiago",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }
        ).format(fecha);

    } catch (error) {

        console.error(
            "Error formateando fecha Chile:",
            error.message
        );

        return "No disponible";
    }
}


// =====================================================
// 1. BUSCAR JUGADOR EN EL SERVIDOR
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
        // NOMBRE DUPLICADO
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

async function getBattleMetricsPlayerStatus(
    playerId
) {

    try {

        console.log(
            `🔎 Obteniendo datos BM del jugador ${playerId}...`
        );


        // =================================================
        // DATOS DEL JUGADOR
        // =================================================

        let playerResponse =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers: getHeaders(),

                    params: {
                        include: "server"
                    },

                    timeout: 7000
                }
            );


        const player =
            playerResponse.data?.data;


        if (!player) {

            console.log(
                "❌ BattleMetrics no devolvió el jugador."
            );

            return null;
        }


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


        const playerAttributes =
            player.attributes || {};


        // =================================================
        // SERVIDORES INCLUIDOS
        // =================================================

        const servidoresIncluidos =
            playerResponse.data?.included?.filter(
                item =>
                    item.type === "server"
            ) || [];


        // =================================================
        // HORAS TOTALES
        // =================================================

        /*
         * IMPORTANTE:
         *
         * BattleMetrics no siempre entrega
         * player.meta.timePlayed.
         *
         * Por eso primero intentamos obtener
         * el tiempo desde los servidores incluidos.
         */

        let segundosTotales = 0;


        for (
            const servidor
            of servidoresIncluidos
        ) {

            const tiempo =
                Number(
                    servidor.meta?.timePlayed
                ) || 0;


            if (tiempo > 0) {

                segundosTotales += tiempo;

            }

        }


        /*
         * Si BattleMetrics no entregó tiempo
         * mediante los servidores incluidos,
         * utilizamos las sesiones.
         *
         * Esto permite calcular las horas reales
         * sumando las sesiones.
         */

        let todasLasSesiones = [];

        let pagina = 1;

        const limitePaginas = 50;

        let continuar = true;


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
        // INICIO DEL MES
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
        // SESIONES
        // =================================================

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
                 * BattleMetrics rechaza page[number].
                 *
                 * Utilizamos solamente page[size]
                 * y seguimos el enlace "next" que devuelve
                 * la API.
                 */

                const params = {
                    "page[size]": 100
                };


                const sessionResponse =
                    await axios.get(
                        `${BM_API}/players/${playerId}/relationships/sessions`,
                        {
                            headers: getHeaders(),

                            params,

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


                // =================================================
                // PAGINACIÓN MEDIANTE LINKS DE BATTLEMETRICS
                // =================================================

                const siguiente =
                    sessionResponse.data?.links?.next;


                if (
                    siguiente &&
                    pagina < limitePaginas
                ) {

                    /*
                     * BattleMetrics puede devolver una URL
                     * completa para la siguiente página.
                     */

                    pagina++;


                    // Guardamos la URL para la siguiente petición
                    // mediante una variable especial.
                    sessionResponse._nextUrl =
                        siguiente;


                    // Continuamos abajo utilizando nextUrl
                    continuar = true;


                } else {

                    continuar = false;
                }


                // =================================================
                // GUARDAR URL NEXT
                // =================================================

                if (
                    continuar &&
                    sessionResponse._nextUrl
                ) {

                    let nextUrl =
                        sessionResponse._nextUrl;


                    /*
                     * Hacemos las siguientes páginas directamente
                     * utilizando la URL proporcionada por BM.
                     */

                    while (
                        nextUrl &&
                        pagina <= limitePaginas
                    ) {

                        try {

                            console.log(
                                `📥 Obteniendo sesiones BM página ${pagina}...`
                            );


                            const nextResponse =
                                await axios.get(
                                    nextUrl,
                                    {
                                        headers:
                                            getHeaders(),

                                        timeout: 7000
                                    }
                                );


                            const siguientesSesiones =
                                nextResponse.data?.data ||
                                [];


                            console.log(
                                `📊 Página ${pagina}: ${siguientesSesiones.length} sesiones`
                            );


                            if (
                                siguientesSesiones.length === 0
                            ) {

                                nextUrl = null;
                                break;
                            }


                            todasLasSesiones.push(
                                ...siguientesSesiones
                            );


                            nextUrl =
                                nextResponse.data?.links?.next ||
                                null;


                            pagina++;


                        } catch (error) {

                            console.error(
                                `❌ Error obteniendo página ${pagina}:`,
                                error.response?.data ||
                                error.message
                            );

                            nextUrl = null;
                        }
                    }


                    continuar = false;
                }


            } catch (error) {

                console.error(
                    `❌ Error obteniendo sesiones página ${pagina}:`,
                    error.response?.data ||
                    error.message
                );

                continuar = false;
            }
        }


        console.log(
            `📊 Sesiones obtenidas: ${todasLasSesiones.length}`
        );


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
            // SERVIDOR DE LA SESIÓN
            // =================================================

            const serverRelationship =
                sesionActiva.relationships
                    ?.server
                    ?.data;


            if (
                serverRelationship?.id
            ) {

                servidorActual =
                    serverRelationship.id;
            }


            if (
                !servidorActual
            ) {

                servidorActual =
                    sesionActiva.attributes?.serverId ||
                    null;
            }
        }


        // =================================================
        // OBTENER NOMBRE SERVIDOR
        // =================================================

        let nombreServidor =
            "Desconocido";


        if (servidorActual) {

            const servidorEncontrado =
                servidoresIncluidos.find(
                    servidor =>
                        servidor.id ===
                        servidorActual
                );


            if (
                servidorEncontrado
            ) {

                nombreServidor =
                    servidorEncontrado
                        .attributes?.name ||
                    "Desconocido";
            }


            // Si no estaba incluido, consultar directamente
            if (
                nombreServidor ===
                "Desconocido"
            ) {

                try {

                    const serverResponse =
                        await axios.get(
                            `${BM_API}/servers/${servidorActual}`,
                            {
                                headers:
                                    getHeaders(),

                                timeout: 5000
                            }
                        );


                    nombreServidor =
                        serverResponse.data?.data
                            ?.attributes?.name ||
                        "Desconocido";


                } catch (error) {

                    console.log(
                        "⚠️ No se pudo obtener nombre del servidor:",
                        error.message
                    );
                }
            }
        }


        // =================================================
        // CALCULAR HORAS DESDE SESIONES
        // =================================================

        let segundosSesionesTotales = 0;

        let segundosSemana = 0;

        let segundosMes = 0;

        let ultimaConexion = null;


        for (
            const sesion
            of todasLasSesiones
        ) {

            const atributos =
                sesion.attributes || {};


            if (
                !atributos.start
            ) {

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

                fin =
                    ahora;
            }


            if (
                !fin ||
                isNaN(
                    fin.getTime()
                )
            ) {

                continue;
            }


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


            // =================================================
            // TOTAL SESIONES
            // =================================================

            segundosSesionesTotales +=
                duracion;


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


        /*
         * Si no conseguimos horas mediante
         * los servidores pero sí mediante sesiones,
         * utilizamos las sesiones.
         */

        if (
            segundosTotales <= 0 &&
            segundosSesionesTotales > 0
        ) {

            segundosTotales =
                segundosSesionesTotales;
        }


        // =================================================
        // CONVERTIR HORAS
        // =================================================

        const horasTotalesBM =
            Math.floor(
                segundosTotales /
                3600
            );


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
        // ÚLTIMA CONEXIÓN
        // =================================================

        const ultimaConexionTexto =
            formatearFechaChile(
                ultimaConexion
            );


        // =================================================
        // HISTORIAL DE NOMBRES
        // =================================================

        let historialNombres = [];


        try {

            const identifiersResponse =
                await axios.get(
                    `${BM_API}/players/${playerId}/relationships/identifiers`,
                    {
                        headers:
                            getHeaders(),

                        params: {
                            "page[size]": 100
                        },

                        timeout: 5000
                    }
                );


            const identifiers =
                identifiersResponse.data?.data ||
                [];


            const nombres =
                identifiers
                    .map(
                        identifier =>
                            identifier.attributes
                                ?.identifier
                    )
                    .filter(Boolean);


            historialNombres =
                [
                    ...new Set(
                        nombres
                    )
                ].slice(0, 3);


        } catch (error) {

            console.log(
                "⚠️ No se pudo obtener historial de nombres:",
                error.message
            );
        }


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
                id:
                    resultado.id,

                nombre:
                    resultado.name,

                online:
                    resultado.online,

                servidor:
                    resultado.server,

                horas:
                    resultado.horasTotalesBM,

                semana:
                    resultado.horasSemana,

                mes:
                    resultado.horasMes,

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

async function getServerLeaderboard(
    serverId
) {

    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers:
                        getHeaders(),

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
            players.map(
                player => ({

                    id:
                        player.id,

                    name:
                        player.attributes?.name ||
                        "Desconocido",

                    timePlayedSeconds:
                        Number(
                            player.meta?.timePlayed
                        ) || 0
                })
            );


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