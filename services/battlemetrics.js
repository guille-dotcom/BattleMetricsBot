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
// OBTENER PARTES DE UNA FECHA EN HORA CHILE
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
// CONVERTIR FECHA/HORA DE CHILE A UTC
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
// OBTENER INICIO DE SEMANA EN CHILE
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
// OBTENER INICIO DEL MES EN CHILE
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
// OBTENER SERVER ID DE UNA SESIÓN
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
// 1. BUSCAR JUGADOR EN EL SERVIDOR
// =====================================================
//
// ESTA FUNCIÓN SE MANTIENE PARA /HORAS.
//
// NO SE CAMBIA SU COMPORTAMIENTO.
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
// 2. BUSCAR PERFILES GLOBALMENTE POR NOMBRE
// =====================================================
//
// ESTA FUNCIÓN ES PARA /BUSCAR.
//
// IMPORTANTE:
// Aquí NO filtramos por servidor.
//
// Primero encontramos los perfiles globalmente.
// Después comprobamos cuáles tienen historial
// en el servidor configurado.
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


        const encontrados =
            [];

        let nextUrl =
            `${BM_API}/players`;

        let pagina =
            1;

        const limitePaginas =
            10;


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
                `📊 Búsqueda global BM página ${pagina}: ${jugadores.length} resultados`
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


                // -----------------------------------------
                // COINCIDENCIA EXACTA
                // -----------------------------------------

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
            `🌎 Perfiles globales exactos encontrados: ${encontrados.length}`
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
// 3. OBTENER SESIONES DE UN JUGADOR EN UN SERVIDOR
// =====================================================
//
// Esta es la parte importante.
//
// Ejemplo:
//
// playerId = 1179425969
// serverId = 2788421
//
// Se obtiene solamente:
//
// /players/1179425969/relationships/sessions
// filter[servers]=2788421
//
// Así NO mezclamos sesiones de otros servidores.
// =====================================================

async function obtenerSesionesServidor(
    playerId,
    serverId
) {

    try {

        let nextUrl =
            `${BM_API}/players/${playerId}/relationships/sessions`;

        let pagina =
            1;

        const limitePaginas =
            50;

        const sesiones =
            [];


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
// 4. OBTENER SERVIDOR DENTRO DEL PERFIL
// =====================================================

async function obtenerServidorDelPerfil(
    playerId,
    serverId
) {

    try {

        const response =
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
            response.data?.data;


        if (!player) {
            return null;
        }


        const servidores =
            response.data?.included?.filter(
                item =>
                    item.type === "server"
            ) || [];


        const servidor =
            servidores.find(
                item =>
                    String(
                        item.id
                    ) ===
                    String(
                        serverId
                    )
            );


        if (!servidor) {
            return null;
        }


        return {

            player,

            servidor,

            timePlayedSeconds:
                Number(
                    servidor.meta?.timePlayed
                ) || 0

        };


    } catch (error) {

        console.error(
            `❌ Error obteniendo perfil BM ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// 5. BUSCAR JUGADOR HISTÓRICO
// =====================================================
//
// FLUJO:
//
// 1. Buscar nombre GLOBALMENTE.
// 2. Revisar cada perfil.
// 3. Buscar el servidor configurado dentro
//    del perfil.
// 4. Obtener las sesiones de ESE servidor.
// 5. Si no tiene sesiones en ese servidor,
//    DESCARTAR.
// 6. Si tiene sesiones, guardar last seen.
// 7. Ordenar por actividad más reciente.
// =====================================================

async function searchBattleMetricsPlayerHistory(
    playerName,
    serverId
) {

    try {

        if (
            !playerName ||
            !playerName.trim()
        ) {

            return null;
        }


        if (
            !serverId
        ) {

            return null;
        }


        // =================================================
        // BUSCAR GLOBALMENTE
        // =================================================

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


        // =================================================
        // CANDIDATOS DEL SERVIDOR
        // =================================================

        const candidatos =
            [];


        for (
            const perfil
            of perfiles
        ) {

            console.log(
                `🔎 Revisando perfil BM ${perfil.id} para servidor ${serverId}...`
            );


            // ---------------------------------------------
            // VERIFICAR QUE EL SERVIDOR EXISTA EN EL PERFIL
            // ---------------------------------------------

            const servidorPerfil =
                await obtenerServidorDelPerfil(
                    perfil.id,
                    serverId
                );


            if (
                !servidorPerfil
            ) {

                console.log(
                    `⛔ Perfil ${perfil.id} descartado: nunca encontrado en servidor ${serverId}.`
                );

                continue;
            }


            // ---------------------------------------------
            // OBTENER SESIONES DEL SERVIDOR
            // ---------------------------------------------

            const sesiones =
                await obtenerSesionesServidor(
                    perfil.id,
                    serverId
                );


            if (
                sesiones.length === 0
            ) {

                console.log(
                    `⛔ Perfil ${perfil.id} descartado: no hay sesiones para ${serverId}.`
                );

                continue;
            }


            // ---------------------------------------------
            // ÚLTIMA SESIÓN
            // ---------------------------------------------

            const ultimaSesion =
                sesiones[0];


            const ultimoInicio =
                ultimaSesion.attributes?.start
                    ? new Date(
                        ultimaSesion.attributes.start
                    )
                    : null;


            const ultimoFin =
                ultimaSesion.attributes?.stop
                    ? new Date(
                        ultimaSesion.attributes.stop
                    )
                    : null;


            // ---------------------------------------------
            // SI LA SESIÓN ESTÁ ACTIVA
            // ---------------------------------------------

            const online =
                !ultimoFin;


            // ---------------------------------------------
            // LAST SEEN
            // ---------------------------------------------

            let ultimaConexion =
                ultimoFin ||
                ultimoInicio ||
                null;


            if (
                !ultimaConexion ||
                isNaN(
                    ultimaConexion.getTime()
                )
            ) {

                ultimaConexion =
                    null;
            }


            // ---------------------------------------------
            // PRIMERA SESIÓN
            // ---------------------------------------------

            const primeraSesion =
                sesiones[
                    sesiones.length - 1
                ];


            const primeraConexion =
                primeraSesion?.attributes?.start
                    ? new Date(
                        primeraSesion.attributes.start
                    )
                    : null;


            // ---------------------------------------------
            // TIME PLAYED
            // ---------------------------------------------

            let segundosJugados =
                servidorPerfil.timePlayedSeconds;


            // ---------------------------------------------
            // SUMAR SESIONES SI SON MAYORES
            // ---------------------------------------------

            let segundosSesiones =
                0;


            for (
                const sesion
                of sesiones
            ) {

                const start =
                    sesion.attributes?.start
                        ? new Date(
                            sesion.attributes.start
                        )
                        : null;


                if (
                    !start ||
                    isNaN(
                        start.getTime()
                    )
                ) {

                    continue;
                }


                let end =
                    sesion.attributes?.stop
                        ? new Date(
                            sesion.attributes.stop
                        )
                        : null;


                if (
                    !end
                ) {

                    end =
                        new Date();
                }


                if (
                    isNaN(
                        end.getTime()
                    )
                ) {

                    continue;
                }


                segundosSesiones +=
                    Math.max(
                        0,
                        Math.floor(
                            (
                                end -
                                start
                            ) / 1000
                        )
                    );
            }


            if (
                segundosSesiones >
                segundosJugados
            ) {

                segundosJugados =
                    segundosSesiones;
            }


            // ---------------------------------------------
            // HORAS
            // ---------------------------------------------

            const horas =
                Math.floor(
                    segundosJugados /
                    3600
                );


            const minutos =
                Math.floor(
                    (
                        segundosJugados %
                        3600
                    ) / 60
                );


            const tiempoJugadoTexto =
                horas > 0
                    ? `${horas}h ${minutos}m`
                    : `${minutos}m`;


            // ---------------------------------------------
            // GUARDAR CANDIDATO
            // ---------------------------------------------

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
                    servidorPerfil
                        .servidor
                        .attributes
                        ?.name ||
                    "Desconocido",

                online:
                    online,

                horas:
                    horas,

                tiempoJugado:
                    tiempoJugadoTexto,

                primeraConexion:
                    formatearFechaChile(
                        primeraConexion
                    ),

                ultimaConexion:
                    formatearFechaChile(
                        ultimaConexion
                    ),

                ultimaConexionDate:
                    ultimaConexion,

                timePlayedSeconds:
                    segundosJugados

            });
        }


        // =================================================
        // NINGÚN PERFIL PERTENECE AL SERVIDOR
        // =================================================

        if (
            candidatos.length === 0
        ) {

            console.log(
                `❌ "${playerName}" existe globalmente, pero ningún perfil tiene historial en ${serverId}.`
            );

            return null;
        }


        // =================================================
        // ORDENAR POR ÚLTIMA ACTIVIDAD EN EL SERVIDOR
        // =================================================

        candidatos.sort(
            (a, b) => {

                const fechaA =
                    a.ultimaConexionDate
                        ? a.ultimaConexionDate.getTime()
                        : 0;

                const fechaB =
                    b.ultimaConexionDate
                        ? b.ultimaConexionDate.getTime()
                        : 0;

                return (
                    fechaB -
                    fechaA
                );
            }
        );


        // =================================================
        // RESULTADO
        // =================================================

        const jugador =
            candidatos[0];


        console.log(
            "✅ Jugador encontrado en servidor:",
            {
                nombre:
                    jugador.name,

                playerId:
                    jugador.id,

                servidor:
                    jugador.serverName,

                serverId:
                    jugador.serverId,

                online:
                    jugador.online,

                ultimaConexion:
                    jugador.ultimaConexion,

                horas:
                    jugador.horas
            }
        );


        return {

            ...jugador,

            // Para permitir al comando saber si
            // había varios perfiles que coincidían.
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
// 6. OBTENER DATOS COMPLETOS DEL JUGADOR
// =====================================================
//
// ESTA FUNCIÓN SE MANTIENE COMPATIBLE CON /HORAS.
//
// targetServerId es opcional.
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


        // =================================================
        // HORAS
        // =================================================

        let segundosTotales =
            0;


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

        let todasLasSesiones =
            [];

        let pagina =
            1;

        const limitePaginas =
            50;

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


        // =================================================
        // FILTRAR POR SERVIDOR SI SE SOLICITÓ
        // =================================================

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


        // =================================================
        // ORDENAR
        // =================================================

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


        // =================================================
        // SESIÓN ACTIVA
        // =================================================

        const sesionActiva =
            todasLasSesiones.find(
                sesion =>
                    !sesion.attributes?.stop
            );


        let online =
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


        // =================================================
        // CALCULAR SESIONES
        // =================================================

        let segundosSesionesTotales =
            0;

        let segundosSemana =
            0;

        let segundosMes =
            0;

        let ultimaConexion =
            null;

        let primeraConexion =
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


            // Semana

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


            // Mes

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


            // Última conexión

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
        // HISTORIAL DE NOMBRES
        // =================================================

        let historialNombres =
            [];


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
                    "⚠️ No se pudo obtener historial de nombres:",
                    error.message
                );
            }
        }


        // =================================================
        // RESULTADO
        // =================================================

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
// 7. RANKING DEL SERVIDOR
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

    buscarJugadoresGlobal,

    obtenerSesionesServidor,

    obtenerServidorDelPerfil,

    searchBattleMetricsPlayerHistory,

    getBattleMetricsPlayerStatus,

    getServerLeaderboard

};