require("dotenv").config();

const axios = require("axios");

const BM_API = "https://api.battlemetrics.com";
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
// FECHA CHILE
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

        if (isNaN(fechaReal.getTime())) {
            return "No disponible";
        }

        return new Intl.DateTimeFormat(
            "es-CL",
            {
                timeZone: TIMEZONE_CHILE,
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
// PARTES FECHA CHILE
// =====================================================

function obtenerPartesFechaChile(fecha) {

    const fechaReal =
        fecha instanceof Date
            ? fecha
            : new Date(fecha);

    const partes =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone: TIMEZONE_CHILE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            }
        ).formatToParts(fechaReal);

    const resultado = {};

    for (const parte of partes) {

        if (parte.type !== "literal") {

            resultado[parte.type] =
                Number(parte.value);
        }
    }

    return resultado;
}


// =====================================================
// CHILE LOCAL → UTC
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
        objetivo - comoUTC;

    return new Date(
        aproximacion.getTime() +
        diferencia
    );
}


// =====================================================
// INICIO SEMANA
// =====================================================

function obtenerInicioSemanaChile(fechaActual) {

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
// INICIO MES
// =====================================================

function obtenerInicioMesChile(fechaActual) {

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
            String(playerName || "")
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

        if (encontrados.length > 1) {

            console.log(
                `⚠️ BM | Nombre duplicado: ${playerName}`
            );

            return {
                duplicate: true,
                players: encontrados
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
// NORMALIZAR TEXTO
// =====================================================

function normalizarTexto(valor) {

    return String(valor || "")
        .trim()
        .toLowerCase();
}


// =====================================================
// DETECTAR RUST
// =====================================================

function detectarRust(
    serverData,
    included = []
) {

    if (!serverData) {
        return false;
    }

    const attributes =
        serverData.attributes || {};


    // -------------------------------------------------
    // MÉTODO 1
    // attributes.game
    // -------------------------------------------------

    const game =
        normalizarTexto(
            attributes.game
        );

    if (
        game === "rust" ||
        game.includes("rust")
    ) {

        return true;
    }


    // -------------------------------------------------
    // MÉTODO 2
    // attributes.gameId
    // -------------------------------------------------

    const gameId =
        normalizarTexto(
            attributes.gameId
        );

    if (
        gameId === "rust" ||
        gameId.includes("rust")
    ) {

        return true;
    }


    // -------------------------------------------------
    // MÉTODO 3
    // attributes.gameName
    // -------------------------------------------------

    const gameName =
        normalizarTexto(
            attributes.gameName
        );

    if (
        gameName === "rust" ||
        gameName.includes("rust")
    ) {

        return true;
    }


    // -------------------------------------------------
    // MÉTODO 4
    // relationships.game
    // -------------------------------------------------

    const relationshipGame =
        serverData.relationships
            ?.game
            ?.data;


    if (relationshipGame) {

        const relationId =
            normalizarTexto(
                relationshipGame.id
            );

        if (
            relationId === "rust" ||
            relationId.includes("rust")
        ) {

            return true;
        }
    }


    // -------------------------------------------------
    // MÉTODO 5
    // RESOURCE GAME INCLUIDO
    // -------------------------------------------------

    const gameResource =
        included.find(
            item =>
                item.type === "game"
        );


    if (gameResource) {

        const gameAttributes =
            gameResource.attributes || {};

        const nombreJuego =
            normalizarTexto(
                gameAttributes.name ||
                gameAttributes.slug ||
                gameAttributes.identifier ||
                gameResource.id
            );

        if (
            nombreJuego === "rust" ||
            nombreJuego.includes("rust")
        ) {

            return true;
        }
    }


    // -------------------------------------------------
    // MÉTODO 6
    // META
    // -------------------------------------------------

    const metaGame =
        normalizarTexto(
            serverData.meta?.game ||
            serverData.meta?.gameId
        );

    if (
        metaGame === "rust" ||
        metaGame.includes("rust")
    ) {

        return true;
    }


    return false;
}


// =====================================================
// OBTENER INFO SERVIDOR
// =====================================================

async function obtenerInfoServidor(
    serverId,
    cache
) {

    if (!serverId) {
        return null;
    }

    if (cache.has(serverId)) {
        return cache.get(serverId);
    }


    try {

        /*
         * IMPORTANTE:
         *
         * Ahora pedimos también "game".
         * Antes solamente pedíamos el servidor.
         */

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers:
                        getHeaders(),

                    params: {
                        include: "game"
                    },

                    timeout: 7000
                }
            );


        const data =
            response.data?.data;

        const included =
            response.data?.included || [];


        if (!data) {

            cache.set(
                serverId,
                null
            );

            return null;
        }


        const attributes =
            data.attributes || {};


        // =================================================
        // BUSCAR JUEGO
        // =================================================

        let game =
            attributes.game ||
            attributes.gameId ||
            attributes.gameName ||
            data.relationships
                ?.game
                ?.data
                ?.id ||
            null;


        // -------------------------------------------------
        // Buscar resource game incluido
        // -------------------------------------------------

        const gameResource =
            included.find(
                item =>
                    item.type === "game"
            );


        if (
            !game &&
            gameResource
        ) {

            game =
                gameResource.attributes?.name ||
                gameResource.attributes?.slug ||
                gameResource.attributes?.identifier ||
                gameResource.id ||
                null;
        }


        const esRust =
            detectarRust(
                data,
                included
            );


        const info = {

            id:
                data.id ||
                serverId,

            name:
                attributes.name ||
                "Servidor desconocido",

            game:
                String(
                    game || ""
                ).toLowerCase(),

            esRust:
                esRust,

            ip:
                attributes.ip ||
                null,

            port:
                attributes.port ||
                null
        };


        console.log(
            `🖥️ BM | Servidor ${serverId} | ${info.name} | game=${info.game || "N/A"} | Rust=${info.esRust}`
        );


        cache.set(
            serverId,
            info
        );


        return info;


    } catch (error) {

        console.log(
            `⚠️ BM | No se pudo obtener servidor ${serverId}:`,
            error.response?.status ||
            error.message
        );

        cache.set(
            serverId,
            null
        );

        return null;
    }
}


// =====================================================
// FORMATEAR HORAS
// =====================================================

function segundosAHorasTexto(segundos) {

    const horas =
        Math.floor(
            segundos / 3600
        );

    const minutos =
        Math.floor(
            (
                segundos % 3600
            ) / 60
        );

    if (horas <= 0) {

        return `${minutos}m`;
    }

    return `${horas}h ${minutos}m`;
}


// =====================================================
// TOP 5 SERVIDORES RUST
// =====================================================

async function obtenerTopServidoresRust(
    todasLasSesiones,
    servidoresIncluidos,
    ahora
) {

    const servidorCache =
        new Map();


    // =================================================
    // GUARDAR SERVIDORES YA INCLUIDOS
    // =================================================

    for (
        const servidor
        of servidoresIncluidos
    ) {

        if (!servidor?.id) {
            continue;
        }


        const attributes =
            servidor.attributes || {};


        let game =
            attributes.game ||
            attributes.gameId ||
            attributes.gameName ||
            servidor.relationships
                ?.game
                ?.data
                ?.id ||
            null;


        const esRust =
            detectarRust(
                servidor,
                []
            );


        servidorCache.set(
            servidor.id,
            {

                id:
                    servidor.id,

                name:
                    attributes.name ||
                    "Servidor desconocido",

                game:
                    String(
                        game || ""
                    ).toLowerCase(),

                esRust:
                    esRust,

                ip:
                    attributes.ip ||
                    null,

                port:
                    attributes.port ||
                    null
            }
        );
    }


    // =================================================
    // IDS DE SERVIDORES DESDE SESIONES
    // =================================================

    const serverIds =
        [
            ...new Set(
                todasLasSesiones
                    .map(
                        sesion =>
                            sesion.relationships
                                ?.server
                                ?.data
                                ?.id ||
                            sesion.attributes
                                ?.serverId ||
                            null
                    )
                    .filter(Boolean)
            )
        ];


    console.log(
        `🖥️ BM | Servidores únicos en sesiones: ${serverIds.length}`
    );


    // =================================================
    // CONSULTAR SERVIDORES FALTANTES
    // =================================================

    const faltantes =
        serverIds.filter(
            id =>
                !servidorCache.has(id)
        );


    const CONCURRENCIA = 5;


    for (
        let i = 0;
        i < faltantes.length;
        i += CONCURRENCIA
    ) {

        const grupo =
            faltantes.slice(
                i,
                i + CONCURRENCIA
            );


        await Promise.all(
            grupo.map(
                async id => {

                    await obtenerInfoServidor(
                        id,
                        servidorCache
                    );
                }
            )
        );
    }


    // =================================================
    // ACUMULAR HORAS
    // =================================================

    const tiempoPorServidor =
        new Map();


    for (
        const sesion
        of todasLasSesiones
    ) {

        const atributos =
            sesion.attributes || {};


        if (!atributos.start) {
            continue;
        }


        const serverId =
            sesion.relationships
                ?.server
                ?.data
                ?.id ||
            atributos.serverId ||
            null;


        if (!serverId) {
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

        } else {

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


        if (duracion <= 0) {
            continue;
        }


        const anterior =
            tiempoPorServidor.get(
                serverId
            ) || 0;


        tiempoPorServidor.set(
            serverId,
            anterior + duracion
        );
    }


    // =================================================
    // FILTRAR RUST
    // =================================================

    const resultados = [];


    for (
        const [
            serverId,
            segundos
        ]
        of tiempoPorServidor
    ) {

        const servidor =
            servidorCache.get(
                serverId
            );


        if (!servidor) {
            continue;
        }


        /*
         * AQUÍ ESTÁ EL CAMBIO PRINCIPAL:
         *
         * Ya no dependemos solamente de attributes.game.
         */

        if (
            !servidor.esRust
        ) {

            continue;
        }


        resultados.push({

            id:
                serverId,

            nombre:
                servidor.name ||
                "Servidor desconocido",

            horas:
                Math.floor(
                    segundos / 3600
                ),

            segundos:
                segundos,

            tiempo:
                segundosAHorasTexto(
                    segundos
                ),

            game:
                "rust"
        });
    }


    // =================================================
    // ORDENAR
    // =================================================

    resultados.sort(
        (a, b) =>
            b.segundos -
            a.segundos
    );


    console.log(
        `🏆 BM | Servidores Rust encontrados: ${resultados.length}`
    );


    for (
        const servidor
        of resultados.slice(0, 5)
    ) {

        console.log(
            `🏆 ${servidor.nombre} | ${servidor.tiempo}`
        );
    }


    return resultados.slice(
        0,
        5
    );
}


// =====================================================
// STATUS JUGADOR
// =====================================================

async function getBattleMetricsPlayerStatus(
    playerId
) {

    try {

        console.log(
            `🔎 BM | Consultando jugador ${playerId}...`
        );


        // =================================================
        // JUGADOR
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
        // HORAS TOTALES BM
        // =================================================

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

                segundosTotales +=
                    tiempo;
            }
        }


        // =================================================
        // SESIONES
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
        // FECHAS
        // =================================================

        const ahora =
            new Date();

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
        // CACHE SERVIDORES
        // =================================================

        const serverInfoCache =
            new Map();


        // =================================================
        // SESIÓN ACTIVA RUST
        // =================================================

        let sesionActivaRust = null;

        let servidorActualRust = null;


        const sesionesActivas =
            todasLasSesiones.filter(
                sesion => {

                    const stop =
                        sesion.attributes?.stop;

                    return (
                        stop === null ||
                        stop === undefined
                    );
                }
            );


        for (
            const sesion
            of sesionesActivas
        ) {

            const serverId =
                sesion.relationships
                    ?.server
                    ?.data
                    ?.id ||
                sesion.attributes
                    ?.serverId ||
                null;


            if (!serverId) {
                continue;
            }


            const info =
                await obtenerInfoServidor(
                    serverId,
                    serverInfoCache
                );


            if (!info) {
                continue;
            }


            if (!info.esRust) {
                continue;
            }


            sesionActivaRust =
                sesion;

            servidorActualRust =
                info;

            break;
        }


        // =================================================
        // ESTADO
        // =================================================

        let online = false;

        let tiempoJugando = "0m";

        let servidorActual = null;


        if (
            sesionActivaRust &&
            servidorActualRust
        ) {

            online = true;


            const inicio =
                new Date(
                    sesionActivaRust
                        .attributes?.start
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


            servidorActual =
                servidorActualRust.name;
        }


        // =================================================
        // TOTALES DE SESIONES
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


            let fin = null;


            if (atributos.stop) {

                fin =
                    new Date(
                        atributos.stop
                    );

            } else {

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


            segundosSesionesTotales +=
                duracion;


            // ---------------------------------------------
            // SEMANA
            // ---------------------------------------------

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


            // ---------------------------------------------
            // MES
            // ---------------------------------------------

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


            // ---------------------------------------------
            // ÚLTIMA CONEXIÓN
            // ---------------------------------------------

            if (atributos.stop) {

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
        // TOMAR MAYOR VALOR
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


        const ultimaConexionTexto =
            formatearFechaChile(
                ultimaConexion
            );


        // =================================================
        // HISTORIAL NOMBRES
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
        // TOP 5 RUST
        // =================================================

        let topServidoresRust = [];


        try {

            topServidoresRust =
                await obtenerTopServidoresRust(
                    todasLasSesiones,
                    servidoresIncluidos,
                    ahora
                );

        } catch (error) {

            console.error(
                "❌ BM | Error obteniendo Top 5 Rust:",
                error.message
            );

            topServidoresRust = [];
        }


        // =================================================
        // MAPA SERVIDORES
        // =================================================

        const servidoresMap =
            new Map();


        for (
            const servidor
            of servidoresIncluidos
        ) {

            if (servidor.id) {

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
        // RESULTADO
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
                servidorActual ||
                "Desconocido",

            server:
                servidorActual ||
                "Desconocido",

            servidorActualRust:
                servidorActualRust
                    ? {
                        id:
                            servidorActualRust.id,

                        nombre:
                            servidorActualRust.name,

                        game:
                            servidorActualRust.game
                    }
                    : null,

            topServidoresRust:
                topServidoresRust,

            servidoresEncontrados:
                servidoresEncontrados,

            servidores: {

                rust: {

                    datos: {

                        servidoresEncontrados:
                            servidoresEncontrados
                    }
                }
            },

            historialNombres:
                historialNombres
        };


        console.log(
            `✅ BM | ${resultado.nombre} | ` +
            `${resultado.horasTotalesBM}h | ` +
            `Semana: ${resultado.horasSemana}h | ` +
            `Mes: ${resultado.horasMes}h | ` +
            `${resultado.online ? "🟢 Online" : "🔴 Offline"} | ` +
            `${resultado.servidor}`
        );


        console.log(
            `🏆 BM | Top Rust encontrados: ${resultado.topServidoresRust.length}`
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
// GET HOURS
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
// SERVER LEADERBOARD
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