require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN API
// =====================================================

const BM_API = "https://api.battlemetrics.com";

// =====================================================
// ZONA HORARIA OFICIAL DEL BOT
// =====================================================

const TIMEZONE_CHILE = "America/Santiago";

// =====================================================
// HEADERS
// =====================================================

function getHeaders() {

    const token =
        process.env.BATTLEMETRICS_TOKEN;

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

        const fechaReal =
            fecha instanceof Date
                ? fecha
                : new Date(fecha);

        if (
            isNaN(
                fechaReal.getTime()
            )
        ) {

            return "No disponible";
        }

        return new Intl.DateTimeFormat(
            "es-CL",
            {
                timeZone:
                    TIMEZONE_CHILE,

                day: "2-digit",
                month: "2-digit",
                year: "numeric",

                hour: "2-digit",
                minute: "2-digit",

                hour12: false
            }
        ).format(fechaReal);

    } catch (error) {

        console.error(
            "❌ Error formateando fecha Chile:",
            error.message
        );

        return "No disponible";
    }
}


// =====================================================
// OBTENER PARTES DE UNA FECHA EN CHILE
// =====================================================

function obtenerPartesFechaChile(
    fecha
) {

    const fechaReal =
        fecha instanceof Date
            ? fecha
            : new Date(fecha);

    const partes =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone:
                    TIMEZONE_CHILE,

                year: "numeric",
                month: "2-digit",
                day: "2-digit",

                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",

                hour12: false
            }
        ).formatToParts(
            fechaReal
        );

    const resultado = {};

    for (
        const parte
        of partes
    ) {

        if (
            parte.type !== "literal"
        ) {

            resultado[parte.type] =
                Number(
                    parte.value
                );
        }
    }

    return resultado;
}


// =====================================================
// CONVERTIR CHILE LOCAL A UTC
// =====================================================

function convertirChileLocalAUTC(
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0
) {

    const aproximacion =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day,
                hour,
                minute,
                second
            )
        );

    const partes =
        obtenerPartesFechaChile(
            aproximacion
        );

    const comoUTC =
        Date.UTC(
            partes.year,
            partes.month - 1,
            partes.day,
            partes.hour,
            partes.minute,
            partes.second
        );

    const objetivo =
        Date.UTC(
            year,
            month - 1,
            day,
            hour,
            minute,
            second
        );

    const diferencia =
        objetivo -
        comoUTC;

    return new Date(
        aproximacion.getTime() +
        diferencia
    );
}


// =====================================================
// INICIO DE SEMANA EN CHILE
// =====================================================

function obtenerInicioSemanaChile(
    fechaActual
) {

    const partes =
        obtenerPartesFechaChile(
            fechaActual
        );

    const fechaChile =
        new Date(
            Date.UTC(
                partes.year,
                partes.month - 1,
                partes.day,
                0,
                0,
                0,
                0
            )
        );

    const diaSemana =
        fechaChile.getUTCDay();

    const diasDesdeLunes =
        diaSemana === 0
            ? 6
            : diaSemana - 1;

    fechaChile.setUTCDate(
        fechaChile.getUTCDate() -
        diasDesdeLunes
    );

    return convertirChileLocalAUTC(
        fechaChile.getUTCFullYear(),
        fechaChile.getUTCMonth() + 1,
        fechaChile.getUTCDate(),
        0,
        0,
        0
    );
}


// =====================================================
// INICIO DE MES EN CHILE
// =====================================================

function obtenerInicioMesChile(
    fechaActual
) {

    const partes =
        obtenerPartesFechaChile(
            fechaActual
        );

    return convertirChileLocalAUTC(
        partes.year,
        partes.month,
        1,
        0,
        0,
        0
    );
}


// =====================================================
// 1. BUSCAR JUGADOR EN UN SERVIDOR
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
                    headers:
                        getHeaders(),

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
            String(
                playerName || ""
            )
                .toLowerCase()
                .trim();

        const encontrados =
            players.filter(
                player => {

                    const nombreBM =
                        String(
                            player.attributes?.name ||
                            ""
                        )
                            .toLowerCase()
                            .trim();

                    return (
                        nombreBM ===
                        nombreBuscado
                    );
                }
            );


        // =================================================
        // NOMBRE DUPLICADO
        // =================================================

        if (
            encontrados.length > 1
        ) {

            console.log(
                `⚠️ BM | Nombre duplicado: ${playerName}`
            );

            return {
                duplicate:
                    true,

                players:
                    encontrados
            };
        }


        return encontrados[0] || null;


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
// 2. OBTENER STATUS COMPLETO
// =====================================================

async function getBattleMetricsPlayerStatus(
    playerId
) {

    try {

        console.log(
            `🔎 BM | Consultando jugador ${playerId}...`
        );


        // =================================================
        // DATOS DEL JUGADOR
        // =================================================

        const playerResponse =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers:
                        getHeaders(),

                    params: {
                        include: "server"
                    },

                    timeout: 10000
                }
            );

        const player =
            playerResponse.data?.data;

        if (!player) {

            console.log(
                "❌ BM | Jugador no encontrado."
            );

            return null;
        }

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
        // HORAS DE SERVIDORES
        // =================================================

        let segundosTotales =
            0;

        for (
            const servidor
            of servidoresIncluidos
        ) {

            const tiempo =
                Number(
                    servidor.meta?.timePlayed
                ) || 0;

            if (
                tiempo > 0
            ) {

                segundosTotales +=
                    tiempo;
            }
        }


        // =================================================
        // OBTENER TODAS LAS SESIONES
        // =================================================

        let todasLasSesiones = [];

        let pagina = 1;

        const limitePaginas = 50;

        let nextUrl =
            `${BM_API}/players/${playerId}/relationships/sessions?page[size]=100`;


        while (
            nextUrl &&
            pagina <= limitePaginas
        ) {

            try {

                const sessionResponse =
                    await axios.get(
                        nextUrl,
                        {
                            headers:
                                getHeaders(),

                            timeout: 10000
                        }
                    );

                const sesiones =
                    sessionResponse.data?.data ||
                    [];

                if (
                    sesiones.length === 0
                ) {

                    break;
                }

                todasLasSesiones.push(
                    ...sesiones
                );

                nextUrl =
                    sessionResponse.data?.links?.next ||
                    null;

                pagina++;

            } catch (error) {

                console.error(
                    `❌ BM | Error sesiones página ${pagina}:`,
                    error.response?.data ||
                    error.message
                );

                break;
            }
        }


        console.log(
            `📊 BM | Sesiones obtenidas: ${todasLasSesiones.length}`
        );


        // =================================================
        // FECHA ACTUAL
        // =================================================

        const ahora =
            new Date();


        // =================================================
        // SEMANA / MES
        // =================================================

        const inicioSemana =
            obtenerInicioSemanaChile(
                ahora
            );

        const inicioMes =
            obtenerInicioMesChile(
                ahora
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

                return (
                    fechaB -
                    fechaA
                );
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


        let online =
            false;

        let tiempoJugando =
            "0m";

        let servidorActual =
            null;


        if (
            sesionActiva
        ) {

            online =
                true;

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

            servidorActual =
                sesionActiva
                    .relationships
                    ?.server
                    ?.data
                    ?.id ||
                null;


            if (
                !servidorActual
            ) {

                servidorActual =
                    sesionActiva
                        .attributes
                        ?.serverId ||
                    null;
            }
        }


        // =================================================
        // NOMBRE DEL SERVIDOR
        // =================================================

        let nombreServidor =
            "Desconocido";


        if (
            servidorActual
        ) {

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


            // =================================================
            // CONSULTA DIRECTA
            // =================================================

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

                                timeout: 7000
                            }
                        );

                    nombreServidor =
                        serverResponse
                            .data
                            ?.data
                            ?.attributes
                            ?.name ||
                        "Desconocido";

                } catch (error) {

                    console.log(
                        "⚠️ BM | No se pudo obtener nombre del servidor:",
                        error.message
                    );
                }
            }
        }


        // =================================================
        // CALCULAR HORAS DESDE SESIONES
        // =================================================

        let segundosSesionesTotales =
            0;

        let segundosSemana =
            0;

        let segundosMes =
            0;

        let ultimaConexion =
            null;


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


            // =================================================
            // SESIÓN TERMINADA
            // =================================================

            if (
                atributos.stop
            ) {

                fin =
                    new Date(
                        atributos.stop
                    );
            }


            // =================================================
            // SESIÓN ACTIVA
            // =================================================

            else if (
                sesion ===
                sesionActiva
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
            // TOTAL
            // =================================================

            segundosSesionesTotales +=
                duracion;


            // =================================================
            // SEMANA
            // =================================================

            if (
                fin >= inicioSemana &&
                inicio <= ahora
            ) {

                const inicioReal =
                    inicio <
                    inicioSemana
                        ? inicioSemana
                        : inicio;

                const finReal =
                    fin >
                    ahora
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
            // MES
            // =================================================

            if (
                fin >= inicioMes &&
                inicio <= ahora
            ) {

                const inicioReal =
                    inicio <
                    inicioMes
                        ? inicioMes
                        : inicio;

                const finReal =
                    fin >
                    ahora
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
                    fin >
                    ultimaConexion
                ) {

                    ultimaConexion =
                        fin;
                }
            }
        }


        // =================================================
        // USAR EL MAYOR VALOR
        // =================================================

        if (
            segundosSesionesTotales >
            segundosTotales
        ) {

            segundosTotales =
                segundosSesionesTotales;
        }


        // =================================================
        // HORAS
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

                        timeout: 7000
                    }
                );

            const identifiers =
                identifiersResponse.data?.data ||
                [];

            const nombres =
                identifiers
                    .map(
                        identifier =>
                            identifier
                                .attributes
                                ?.identifier
                    )
                    .filter(Boolean);

            historialNombres =
                [
                    ...new Set(
                        nombres
                    )
                ].slice(
                    0,
                    3
                );

        } catch {

            historialNombres = [];
        }


        // =================================================
        // SERVIDORES JUGADOS
        // =================================================

        const servidoresMap =
            new Map();

        for (
            const servidor
            of servidoresIncluidos
        ) {

            if (
                servidor.id
            ) {

                servidoresMap.set(
                    servidor.id,
                    servidor.attributes?.name ||
                    "Servidor desconocido"
                );
            }
        }


        for (
            const sesion
            of todasLasSesiones
        ) {

            const serverId =
                sesion.relationships
                    ?.server
                    ?.data
                    ?.id ||
                sesion.attributes
                    ?.serverId ||
                null;

            if (
                serverId &&
                !servidoresMap.has(
                    serverId
                )
            ) {

                servidoresMap.set(
                    serverId,
                    "Servidor desconocido"
                );
            }
        }


        const servidoresEncontrados =
            servidoresMap.size;


        // =================================================
        // RESULTADO FINAL
        // =================================================

        const resultado = {

            id:
                player.id,

            nombre:
                playerAttributes.name ||
                "Desconocido",

            name:
                playerAttributes.name ||
                "Desconocido",

            online:
                online,

            jugando:
                tiempoJugando,

            horasTotalesBM:
                horasTotalesBM,

            totalHoras:
                horasTotalesBM,

            horasSemana:
                horasSemana,

            horasMes:
                horasMes,

            ultimaConexion:
                ultimaConexionTexto,

            servidor:
                nombreServidor,

            server:
                nombreServidor,

            servidoresEncontrados:
                servidoresEncontrados,

            servidores:
                {
                    rust:
                        {
                            datos:
                                {
                                    servidoresEncontrados:
                                        servidoresEncontrados
                                }
                        }
                },

            historialNombres:
                historialNombres
        };


        console.log(
            `✅ BM | ${resultado.nombre} | ${resultado.horasTotalesBM}h | Semana: ${resultado.horasSemana}h | Mes: ${resultado.horasMes}h | ${resultado.online ? "🟢 Online" : "🔴 Offline"} | ${resultado.servidor}`
        );


        return resultado;


    } catch (error) {

        console.error(
            "❌ BM | Error obteniendo status:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// 3. FUNCIÓN USADA POR /HORASBM
// =====================================================

async function getBattleMetricsHours(
    playerId
) {

    console.log(
        `⏱️ BM | Obteniendo horas del jugador ${playerId}...`
    );

    const datos =
        await getBattleMetricsPlayerStatus(
            playerId
        );

    if (!datos) {
        return null;
    }

    return datos;
}


// =====================================================
// 4. RANKING DEL SERVIDOR
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

                    timeout: 7000
                }
            );

        const included =
            response.data?.included ||
            [];

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
            "❌ Error obteniendo ranking del servidor:",
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

    getBattleMetricsHours,

    getServerLeaderboard

};