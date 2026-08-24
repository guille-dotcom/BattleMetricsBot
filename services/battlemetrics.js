require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN API
// =====================================================

const BM_API = "https://api.battlemetrics.com";

// =====================================================
// ZONA HORARIA
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
            "Error formateando fecha Chile:",
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

    for (
        const parte of partes
    ) {

        if (
            parte.type !== "literal"
        ) {

            resultado[parte.type] =
                Number(parte.value);
        }
    }

    return resultado;
}


// =====================================================
// CHILE → UTC
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
// INICIO SEMANA
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
// INICIO MES
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
// SERVER ID DE SESIÓN
// =====================================================

function obtenerServerIdDeSesion(
    sesion
) {

    if (!sesion) {
        return null;
    }

    const relationshipServer =
        sesion
            .relationships
            ?.server
            ?.data;

    if (
        relationshipServer?.id
    ) {

        return String(
            relationshipServer.id
        );
    }

    if (
        sesion.attributes?.serverId
    ) {

        return String(
            sesion.attributes.serverId
        );
    }

    return null;
}


// =====================================================
// 1. /HORAS
// =====================================================
//
// ESTA FUNCIÓN NO SE CAMBIA.
//
// Busca solamente jugadores que estén actualmente
// asociados al servidor consultado.
//
// /horas sigue funcionando de forma independiente
// de /buscar.
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
            players.filter(
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

        if (
            encontrados.length > 1
        ) {

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
// 2. BÚSQUEDA GLOBAL POR NOMBRE
// =====================================================
//
// ESTA FUNCIÓN ES PARA /BUSCAR.
//
// NO FILTRA POR SERVIDOR.
// Primero encuentra los perfiles por nombre.
// =====================================================

async function buscarJugadoresGlobal(
    playerName
) {

    try {

        const nombre =
            playerName
                .trim();

        if (!nombre) {
            return [];
        }

        console.log(
            `🌎 Búsqueda global BM por nombre: "${nombre}"`
        );

        const encontrados = [];

        let nextUrl =
            `${BM_API}/players`;

        let pagina = 1;

        const limitePaginas = 10;

        while (
            nextUrl &&
            pagina <= limitePaginas
        ) {

            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? {
                                    "filter[search]":
                                        nombre,

                                    "page[size]":
                                        100
                                }
                                : undefined,

                        timeout: 7000
                    }
                );

            const jugadores =
                response.data?.data ||
                [];

            console.log(
                `📊 BM página ${pagina}: ${jugadores.length} resultados`
            );

            for (
                const jugador
                of jugadores
            ) {

                if (
                    jugador.type !==
                    "player"
                ) {
                    continue;
                }

                const nombreBM =
                    jugador.attributes?.name
                        ?.trim()
                        .toLowerCase();

                if (
                    nombreBM !==
                    nombre.toLowerCase()
                ) {
                    continue;
                }

                if (
                    !encontrados.some(
                        existente =>
                            String(
                                existente.id
                            ) ===
                            String(
                                jugador.id
                            )
                    )
                ) {

                    encontrados.push(
                        jugador
                    );
                }
            }

            nextUrl =
                response.data?.links?.next ||
                null;

            pagina++;
        }

        console.log(
            `🌎 Perfiles exactos encontrados: ${encontrados.length}`
        );

        return encontrados;

    } catch (error) {

        console.error(
            "❌ Error en búsqueda global BM:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// 3. OBTENER SERVIDORES DEL PERFIL
// =====================================================
//
// ESTA ES LA PARTE CLAVE DE /BUSCAR.
//
// No buscamos al jugador en la lista ONLINE.
//
// Abrimos directamente su perfil:
//
// /players/{playerId}?include=server
//
// Y revisamos los servidores asociados al perfil.
//
// Esto permite encontrar jugadores OFFLINE.
// =====================================================

async function obtenerServidoresDelPerfil(
    playerId
) {

    try {

        const response =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers:
                        getHeaders(),

                    params: {
                        include: "server"
                    },

                    timeout: 7000
                }
            );

        const player =
            response.data?.data;

        if (!player) {
            return {
                player: null,
                servidores: []
            };
        }

        const servidores =
            response.data?.included?.filter(
                item =>
                    item.type === "server"
            ) || [];

        // =================================================
        // DEDUPLICAR SERVIDORES
        // =================================================

        const mapa =
            new Map();

        for (
            const servidor
            of servidores
        ) {

            if (
                servidor?.id
            ) {

                mapa.set(
                    String(
                        servidor.id
                    ),
                    servidor
                );
            }
        }

        const lista =
            Array.from(
                mapa.values()
            );

        console.log(
            `📡 Perfil ${playerId}: ${lista.length} servidores encontrados`
        );

        return {
            player,
            servidores: lista
        };

    } catch (error) {

        console.error(
            `❌ Error obteniendo servidores del perfil ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return {
            player: null,
            servidores: []
        };
    }
}


// =====================================================
// 4. OBTENER SERVIDOR DEL PERFIL
// =====================================================

async function obtenerServidorDelPerfil(
    playerId,
    serverId
) {

    const resultado =
        await obtenerServidoresDelPerfil(
            playerId
        );

    if (
        !resultado.player
    ) {

        return null;
    }

    const servidor =
        resultado.servidores.find(
            item =>
                String(
                    item.id
                ) ===
                String(
                    serverId
                )
        );

    if (
        !servidor
    ) {

        return null;
    }

    return {

        player:
            resultado.player,

        servidor,

        timePlayedSeconds:
            Number(
                servidor.meta?.timePlayed
            ) || 0,

        firstSeen:
            servidor.meta?.firstSeen ||
            servidor.attributes?.firstSeen ||
            null,

        lastSeen:
            servidor.meta?.lastSeen ||
            servidor.attributes?.lastSeen ||
            servidor.meta?.lastSeenAt ||
            servidor.attributes?.lastSeenAt ||
            null
    };
}


// =====================================================
// 5. SESIONES DE UN SERVIDOR
// =====================================================
//
// Se mantiene para /horas y otras funciones.
// =====================================================

async function obtenerSesionesServidor(
    playerId,
    serverId
) {

    try {

        let nextUrl =
            `${BM_API}/players/${playerId}/relationships/sessions`;

        let pagina = 1;

        const limitePaginas = 50;

        const sesiones = [];

        while (
            nextUrl &&
            pagina <= limitePaginas
        ) {

            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? {
                                    "filter[servers]":
                                        String(serverId),

                                    "page[size]":
                                        100
                                }
                                : undefined,

                        timeout: 7000
                    }
                );

            const data =
                response.data?.data ||
                [];

            if (
                data.length === 0
            ) {
                break;
            }

            for (
                const sesion
                of data
            ) {

                const sessionServerId =
                    obtenerServerIdDeSesion(
                        sesion
                    );

                if (
                    sessionServerId &&
                    String(
                        sessionServerId
                    ) ===
                    String(
                        serverId
                    )
                ) {

                    sesiones.push(
                        sesion
                    );
                }
            }

            nextUrl =
                response.data?.links?.next ||
                null;

            pagina++;
        }

        sesiones.sort(
            (a, b) => {

                const fechaA =
                    new Date(
                        a.attributes?.start ||
                        0
                    );

                const fechaB =
                    new Date(
                        b.attributes?.start ||
                        0
                    );

                return (
                    fechaB -
                    fechaA
                );
            }
        );

        return sesiones;

    } catch (error) {

        console.error(
            `❌ Error obteniendo sesiones del servidor ${serverId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// 6. /BUSCAR - HISTORIAL
// =====================================================
//
// NUEVA LÓGICA:
//
// 1. Buscar "cyclops" globalmente.
// 2. Obtener perfil de cada coincidencia.
// 3. Mirar servidores asociados al perfil.
// 4. Buscar EXACTAMENTE 2788421.
// 5. Si existe:
//      -> encontrado
//      -> devolver ID BM
//      -> nombre servidor
//      -> lastSeen
//      -> firstSeen
//      -> timePlayed
//
// NO exige que esté online.
// =====================================================

async function searchBattleMetricsPlayerHistory(
    playerName,
    serverId
) {

    try {

        if (
            !playerName ||
            !playerName.trim() ||
            !serverId
        ) {

            return null;
        }

        const perfiles =
            await buscarJugadoresGlobal(
                playerName
            );

        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ No existen perfiles globales para "${playerName}".`
            );

            return null;
        }

        const candidatos = [];

        for (
            const perfil
            of perfiles
        ) {

            console.log(
                `🔎 Revisando perfil BM ${perfil.id} buscando servidor ${serverId}...`
            );

            const resultado =
                await obtenerServidorDelPerfil(
                    perfil.id,
                    serverId
                );

            if (
                !resultado
            ) {

                console.log(
                    `⛔ Perfil ${perfil.id}: no aparece servidor ${serverId}`
                );

                continue;
            }

            const servidor =
                resultado.servidor;

            const meta =
                servidor.meta || {};

            const lastSeenRaw =
                meta.lastSeen ||
                meta.lastSeenAt ||
                servidor.attributes?.lastSeen ||
                servidor.attributes?.lastSeenAt ||
                null;

            const firstSeenRaw =
                meta.firstSeen ||
                meta.firstSeenAt ||
                servidor.attributes?.firstSeen ||
                servidor.attributes?.firstSeenAt ||
                null;

            const lastSeenDate =
                lastSeenRaw
                    ? new Date(
                        lastSeenRaw
                    )
                    : null;

            const firstSeenDate =
                firstSeenRaw
                    ? new Date(
                        firstSeenRaw
                    )
                    : null;

            const timePlayedSeconds =
                Number(
                    meta.timePlayed
                ) || 0;

            const horas =
                Math.floor(
                    timePlayedSeconds /
                    3600
                );

            const minutos =
                Math.floor(
                    (
                        timePlayedSeconds %
                        3600
                    ) / 60
                );

            const tiempoJugado =
                horas > 0
                    ? `${horas}h ${minutos}m`
                    : `${minutos}m`;

            candidatos.push({

                id:
                    perfil.id,

                name:
                    perfil.attributes?.name ||
                    playerName,

                serverId:
                    String(
                        serverId
                    ),

                serverName:
                    servidor.attributes?.name ||
                    "Desconocido",

                online:
                    false,

                lastSeenDate:
                    lastSeenDate &&
                    !isNaN(
                        lastSeenDate.getTime()
                    )
                        ? lastSeenDate
                        : null,

                firstSeenDate:
                    firstSeenDate &&
                    !isNaN(
                        firstSeenDate.getTime()
                    )
                        ? firstSeenDate
                        : null,

                ultimaConexion:
                    formatearFechaChile(
                        lastSeenDate
                    ),

                primeraConexion:
                    formatearFechaChile(
                        firstSeenDate
                    ),

                horas:
                    horas,

                minutos:
                    minutos,

                tiempoJugado:
                    tiempoJugado,

                timePlayedSeconds:
                    timePlayedSeconds
            });

            console.log(
                `✅ PERFIL ${perfil.id} PERTENECE AL SERVIDOR ${serverId}`
            );

            console.log(
                `🎮 Servidor: ${servidor.attributes?.name}`
            );

            console.log(
                `🕐 Last Seen: ${lastSeenRaw}`
            );
        }


        if (
            candidatos.length === 0
        ) {

            console.log(
                `❌ "${playerName}" no tiene el servidor ${serverId} en su perfil.`
            );

            return null;
        }


        // =================================================
        // ORDENAR POR LAST SEEN
        // =================================================

        candidatos.sort(
            (a, b) => {

                const fechaA =
                    a.lastSeenDate
                        ? a.lastSeenDate.getTime()
                        : 0;

                const fechaB =
                    b.lastSeenDate
                        ? b.lastSeenDate.getTime()
                        : 0;

                return (
                    fechaB -
                    fechaA
                );
            }
        );


        const jugador =
            candidatos[0];


        console.log(
            "✅ /buscar encontró jugador:",
            {
                nombre:
                    jugador.name,

                battleMetricsId:
                    jugador.id,

                servidor:
                    jugador.serverName,

                serverId:
                    jugador.serverId,

                lastSeen:
                    jugador.ultimaConexion
            }
        );


        return {

            ...jugador,

            candidatos:
                candidatos.length > 1
                    ? candidatos
                    : []
        };


    } catch (error) {

        console.error(
            "❌ Error en búsqueda histórica BM:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// 7. DATOS COMPLETOS DEL JUGADOR
// =====================================================
//
// COMPATIBLE CON /HORAS.
// =====================================================

async function getBattleMetricsPlayerStatus(
    playerId,
    targetServerId = null
) {

    try {

        console.log(
            `🔎 Obteniendo datos BM del jugador ${playerId}` +
            (
                targetServerId
                    ? ` en servidor ${targetServerId}...`
                    : "..."
            )
        );


        const playerResponse =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers:
                        getHeaders(),

                    params: {
                        include:
                            "server"
                    },

                    timeout: 7000
                }
            );


        const player =
            playerResponse.data?.data;


        if (!player) {
            return null;
        }


        const playerAttributes =
            player.attributes || {};


        const servidoresIncluidos =
            playerResponse.data?.included?.filter(
                item =>
                    item.type === "server"
            ) || [];


        let segundosTotales = 0;


        if (
            targetServerId
        ) {

            const servidorObjetivo =
                servidoresIncluidos.find(
                    servidor =>
                        String(
                            servidor.id
                        ) ===
                        String(
                            targetServerId
                        )
                );


            if (
                servidorObjetivo
            ) {

                segundosTotales =
                    Number(
                        servidorObjetivo
                            .meta
                            ?.timePlayed
                    ) || 0;
            }

        } else {

            for (
                const servidor
                of servidoresIncluidos
            ) {

                segundosTotales +=
                    Number(
                        servidor.meta?.timePlayed
                    ) || 0;
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

                            timeout: 7000
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
                    `❌ Error obteniendo página ${pagina}:`,
                    error.response?.data ||
                    error.message
                );

                break;
            }
        }


        if (
            targetServerId
        ) {

            todasLasSesiones =
                todasLasSesiones.filter(
                    sesion =>
                        String(
                            obtenerServerIdDeSesion(
                                sesion
                            )
                        ) ===
                        String(
                            targetServerId
                        )
                );
        }


        todasLasSesiones.sort(
            (a, b) =>
                new Date(
                    b.attributes?.start || 0
                ) -
                new Date(
                    a.attributes?.start || 0
                )
        );


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


        const sesionActiva =
            todasLasSesiones.find(
                sesion =>
                    !sesion.attributes?.stop
            );


        const online =
            Boolean(
                sesionActiva
            );


        let tiempoJugando =
            "0m";


        if (
            sesionActiva
        ) {

            const inicio =
                new Date(
                    sesionActiva.attributes?.start
                );


            if (
                !isNaN(
                    inicio.getTime()
                )
            ) {

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
                        segundos /
                        3600
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
        }


        let segundosSesionesTotales = 0;

        let segundosSemana = 0;

        let segundosMes = 0;

        let ultimaConexion = null;

        let primeraConexion = null;


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


            if (
                !primeraConexion ||
                inicio < primeraConexion
            ) {

                primeraConexion =
                    inicio;
            }


            let fin =
                atributos.stop
                    ? new Date(
                        atributos.stop
                    )
                    : (
                        sesion ===
                        sesionActiva
                            ? ahora
                            : null
                    );


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


        if (
            segundosSesionesTotales >
            segundosTotales
        ) {

            segundosTotales =
                segundosSesionesTotales;
        }


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
        // SERVIDOR
        // =================================================

        let nombreServidor =
            "Desconocido";


        const servidorActual =
            targetServerId ||
            (
                sesionActiva
                    ? obtenerServerIdDeSesion(
                        sesionActiva
                    )
                    : null
            );


        if (
            servidorActual
        ) {

            const servidor =
                servidoresIncluidos.find(
                    item =>
                        String(
                            item.id
                        ) ===
                        String(
                            servidorActual
                        )
                );


            if (
                servidor
            ) {

                nombreServidor =
                    servidor.attributes?.name ||
                    "Desconocido";
            }
        }


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
                            "page[size]":
                                100
                        },

                        timeout: 5000
                    }
                );


            const identifiers =
                identifiersResponse.data?.data ||
                [];


            historialNombres =
                [
                    ...new Set(
                        identifiers
                            .map(
                                identifier =>
                                    identifier
                                        .attributes
                                        ?.identifier
                            )
                            .filter(Boolean)
                    )
                ].slice(
                    0,
                    3
                );


        } catch (error) {

            if (
                error.response?.status !==
                405
            ) {

                console.log(
                    "⚠️ No se pudo obtener historial:",
                    error.message
                );
            }
        }


        return {

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
                formatearFechaChile(
                    ultimaConexion
                ),

            primeraConexion:
                formatearFechaChile(
                    primeraConexion
                ),

            server:
                nombreServidor,

            serverId:
                servidorActual,

            historialNombres:
                historialNombres
        };


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
// 8. RANKING
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
                        include:
                            "player"
                    },

                    timeout: 5000
                }
            );


        const included =
            response.data?.included ||
            [];


        const players =
            included.filter(
                item =>
                    item.type ===
                    "player"
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
            "Error obteniendo ranking:",
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

    buscarJugadoresGlobal,

    obtenerSesionesServidor,

    obtenerServidorDelPerfil,

    searchBattleMetricsPlayerHistory,

    getBattleMetricsPlayerStatus,

    getServerLeaderboard

};