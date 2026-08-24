require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

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
// FORMATEAR FECHA
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

                day:
                    "2-digit",

                month:
                    "2-digit",

                year:
                    "numeric",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                hour12:
                    false
            }
        ).format(fechaReal);

    } catch (error) {

        console.error(
            "❌ Error formateando fecha:",
            error.message
        );

        return "No disponible";
    }
}


// =====================================================
// OBTENER SERVIDOR
// =====================================================

async function obtenerServidor(serverId) {

    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers:
                        getHeaders(),

                    timeout:
                        10000
                }
            );


        const servidor =
            response.data?.data;


        if (!servidor) {
            return null;
        }


        return {

            id:
                String(
                    servidor.id
                ),

            name:
                servidor.attributes?.name ||
                `Servidor ${serverId}`,

            game:
                servidor.attributes?.game ||
                null,

            players:
                servidor.attributes?.players ??
                null,

            maxPlayers:
                servidor.attributes?.maxPlayers ??
                null

        };

    } catch (error) {

        console.error(
            `❌ Error obteniendo servidor ${serverId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// BUSCAR JUGADORES DEL SERVIDOR
// =====================================================
//
// IMPORTANTE:
//
// Ya NO hacemos:
// /players
//
// +
// /players/{id}/relationships/sessions
//
// Ahora intentamos obtener directamente los jugadores
// relacionados con el servidor.
//
// Esto permite encontrar jugadores que están OFFLINE
// pero que siguen teniendo historial en BattleMetrics.
//
// =====================================================

async function obtenerJugadoresServidor(serverId) {

    const resultados = [];

    let pagina = 1;

    const limitePaginas = 100;

    let nextUrl =
        `${BM_API}/servers/${serverId}/players`;


    console.log(
        `🎮 BM → buscando jugadores del servidor ${serverId}`
    );


    try {

        while (
            nextUrl &&
            pagina <= limitePaginas
        ) {

            console.log(
                `📄 BM servidor ${serverId} → página ${pagina}`
            );


            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? {
                                    "page[size]":
                                        100
                                }
                                : undefined,

                        timeout:
                            15000
                    }
                );


            const data =
                response.data?.data ||
                [];


            console.log(
                `📊 BM servidor ${serverId} → ${data.length} jugadores`
            );


            resultados.push(
                ...data
            );


            nextUrl =
                response.data?.links?.next ||
                null;


            pagina++;
        }


        // =================================================
        // ELIMINAR DUPLICADOS
        // =================================================

        const unicos =
            new Map();


        for (
            const jugador
            of resultados
        ) {

            if (
                !jugador?.id
            ) {

                continue;
            }


            unicos.set(
                String(
                    jugador.id
                ),
                jugador
            );
        }


        const lista =
            [...unicos.values()];


        console.log(
            `✅ BM → ${lista.length} jugadores únicos encontrados en servidor ${serverId}`
        );


        return lista;

    } catch (error) {

        console.error(
            `❌ Error obteniendo jugadores del servidor ${serverId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// BUSCAR JUGADOR EN EL SERVIDOR
// =====================================================
//
// Se intenta primero una búsqueda directa usando:
//
// filter[search]
//
// Si BattleMetrics no devuelve resultados,
// se recorre la lista del servidor.
//
// =====================================================

async function buscarJugadorEnServidor(
    nombre,
    serverId
) {

    const nombreBuscado =
        String(nombre)
            .trim()
            .toLowerCase();


    if (
        !nombreBuscado ||
        !serverId
    ) {

        return [];
    }


    const candidatos = [];


    // =================================================
    // MÉTODO 1
    // BÚSQUEDA DIRECTA DEL SERVIDOR
    // =================================================

    try {

        console.log(
            `🔎 BM → búsqueda directa "${nombre}" en servidor ${serverId}`
        );


        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}/players`,
                {
                    headers:
                        getHeaders(),

                    params: {

                        "filter[search]":
                            nombre,

                        "page[size]":
                            100

                    },

                    timeout:
                        15000
                }
            );


        const jugadores =
            response.data?.data ||
            [];


        console.log(
            `📊 BM → búsqueda directa devolvió ${jugadores.length} resultados`
        );


        for (
            const jugador
            of jugadores
        ) {

            const nombreJugador =
                jugador.attributes
                    ?.name
                    ?.trim()
                    ?.toLowerCase();


            if (
                nombreJugador ===
                nombreBuscado
            ) {

                candidatos.push(
                    jugador
                );
            }
        }

    } catch (error) {

        console.error(
            "⚠️ Búsqueda directa BM falló:",
            error.response?.data ||
            error.message
        );
    }


    // =================================================
    // SI ENCONTRÓ
    // =================================================

    if (
        candidatos.length > 0
    ) {

        return eliminarDuplicados(
            candidatos
        );
    }


    // =================================================
    // MÉTODO 2
    // RECORRER SERVIDOR
    // =================================================

    console.log(
        `🔎 BM → recorriendo jugadores del servidor para "${nombre}"`
    );


    const jugadores =
        await obtenerJugadoresServidor(
            serverId
        );


    for (
        const jugador
        of jugadores
    ) {

        const nombreJugador =
            jugador.attributes
                ?.name
                ?.trim()
                ?.toLowerCase();


        if (
            nombreJugador ===
            nombreBuscado
        ) {

            candidatos.push(
                jugador
            );
        }
    }


    return eliminarDuplicados(
        candidatos
    );
}


// =====================================================
// ELIMINAR DUPLICADOS
// =====================================================

function eliminarDuplicados(
    jugadores
) {

    const mapa =
        new Map();


    for (
        const jugador
        of jugadores
    ) {

        if (
            !jugador?.id
        ) {

            continue;
        }


        mapa.set(
            String(
                jugador.id
            ),
            jugador
        );
    }


    return [
        ...mapa.values()
    ];
}


// =====================================================
// OBTENER DETALLE DEL JUGADOR
// =====================================================

async function obtenerJugador(
    playerId
) {

    try {

        const response =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers:
                        getHeaders(),

                    timeout:
                        10000
                }
            );


        return (
            response.data?.data ||
            null
        );

    } catch (error) {

        console.error(
            `⚠️ Error obteniendo jugador ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// OBTENER SESIONES DEL SERVIDOR PARA EL JUGADOR
// =====================================================
//
// Esta función queda como método complementario.
// No es el método principal de búsqueda.
//
// =====================================================

async function obtenerSesionesServidorJugador(
    playerId,
    serverId
) {

    const endpoints = [

        `${BM_API}/players/${playerId}/relationships/sessions`,

        `${BM_API}/servers/${serverId}/relationships/sessions`

    ];


    for (
        const endpoint
        of endpoints
    ) {

        try {

            console.log(
                `📡 BM → sesiones: ${endpoint}`
            );


            const response =
                await axios.get(
                    endpoint,
                    {
                        headers:
                            getHeaders(),

                        params: {

                            "filter[server]":
                                serverId,

                            "page[size]":
                                100

                        },

                        timeout:
                            15000
                    }
                );


            const sesiones =
                response.data?.data ||
                [];


            if (
                sesiones.length > 0
            ) {

                const filtradas =
                    sesiones.filter(
                        sesion => {

                            const sessionServerId =
                                obtenerServerIdDeSesion(
                                    sesion
                                );


                            return (
                                !sessionServerId ||
                                String(
                                    sessionServerId
                                ) ===
                                String(
                                    serverId
                                )
                            );
                        }
                    );


                if (
                    filtradas.length > 0
                ) {

                    return filtradas;
                }
            }

        } catch (error) {

            console.log(
                `⚠️ Endpoint de sesiones no disponible: ${endpoint}`
            );

        }
    }


    return [];
}


// =====================================================
// OBTENER SERVER ID DE SESIÓN
// =====================================================

function obtenerServerIdDeSesion(
    sesion
) {

    if (!sesion) {
        return null;
    }


    const relationship =
        sesion.relationships
            ?.server
            ?.data;


    if (
        relationship?.id
    ) {

        return String(
            relationship.id
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
// CALCULAR TIEMPO
// =====================================================

function calcularTiempoSesiones(
    sesiones
) {

    let segundos = 0;


    for (
        const sesion
        of sesiones
    ) {

        const atributos =
            sesion.attributes ||
            {};


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


        const fin =
            atributos.stop
                ? new Date(
                    atributos.stop
                )
                : new Date();


        if (
            isNaN(
                fin.getTime()
            )
        ) {

            continue;
        }


        segundos +=
            Math.max(
                0,
                Math.floor(
                    (
                        fin -
                        inicio
                    ) / 1000
                )
            );
    }


    return segundos;
}


// =====================================================
// FORMATEAR TIEMPO
// =====================================================

function formatearTiempo(
    segundos
) {

    segundos =
        Number(
            segundos
        ) || 0;


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
            ) /
            60
        );


    if (
        horas > 0
    ) {

        return `${horas}h ${minutos}m`;
    }


    return `${minutos}m`;
}


// =====================================================
// BUSCAR JUGADOR HISTÓRICO
// =====================================================
//
// ESTE ES EL MÉTODO PRINCIPAL DE /BUSCAR.
//
// No depende de que el jugador esté online.
//
// =====================================================

async function buscarJugadorHistorico(
    nombre,
    serverId
) {

    try {

        if (
            !nombre ||
            !String(nombre).trim()
        ) {

            return null;
        }


        if (
            !serverId
        ) {

            return null;
        }


        serverId =
            String(
                serverId
            );


        console.log(
            `🔎 BM BUSCAR → "${nombre}" → servidor ${serverId}`
        );


        // =================================================
        // SERVIDOR
        // =================================================

        const servidor =
            await obtenerServidor(
                serverId
            );


        if (
            servidor
        ) {

            console.log(
                `🎮 BM servidor → ${servidor.name} (${servidor.id})`
            );

        } else {

            console.log(
                `⚠️ BM → no se pudo obtener nombre del servidor ${serverId}`
            );
        }


        // =================================================
        // BUSCAR DIRECTAMENTE EN EL SERVIDOR
        // =================================================

        const jugadores =
            await buscarJugadorEnServidor(
                nombre,
                serverId
            );


        if (
            jugadores.length === 0
        ) {

            console.log(
                `❌ BM → "${nombre}" no encontrado en ${serverId}`
            );

            return null;
        }


        console.log(
            `✅ BM → ${jugadores.length} perfil(es) encontrado(s) para "${nombre}" en ${serverId}`
        );


        const candidatos = [];


        // =================================================
        // PROCESAR CADA PERFIL
        // =================================================

        for (
            const jugador
            of jugadores
        ) {

            const playerId =
                String(
                    jugador.id
                );


            console.log(
                `🔎 BM → procesando ${jugador.attributes?.name || nombre} (${playerId})`
            );


            // =================================================
            // DETALLE DEL PERFIL
            // =================================================

            const detalle =
                await obtenerJugador(
                    playerId
                );


            const perfil =
                detalle ||
                jugador;


            const atributos =
                perfil.attributes ||
                {};


            // =================================================
            // SESIONES
            // =================================================

            const sesiones =
                await obtenerSesionesServidorJugador(
                    playerId,
                    serverId
                );


            console.log(
                `📊 BM ${playerId} → ${sesiones.length} sesiones del servidor`
            );


            // =================================================
            // ORDENAR
            // =================================================

            sesiones.sort(
                (a, b) => {

                    return (
                        new Date(
                            b.attributes?.start ||
                            0
                        ) -
                        new Date(
                            a.attributes?.start ||
                            0
                        )
                    );
                }
            );


            // =================================================
            // PRIMERA CONEXIÓN
            // =================================================

            let primeraConexion =
                null;


            // =================================================
            // ÚLTIMA CONEXIÓN
            // =================================================

            let ultimaConexion =
                null;


            for (
                const sesion
                of sesiones
            ) {

                const inicio =
                    sesion.attributes?.start
                        ? new Date(
                            sesion.attributes.start
                        )
                        : null;


                const fin =
                    sesion.attributes?.stop
                        ? new Date(
                            sesion.attributes.stop
                        )
                        : null;


                if (
                    inicio &&
                    !isNaN(
                        inicio.getTime()
                    )
                ) {

                    if (
                        !primeraConexion ||
                        inicio <
                        primeraConexion
                    ) {

                        primeraConexion =
                            inicio;
                    }
                }


                if (
                    fin &&
                    !isNaN(
                        fin.getTime()
                    )
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


                // Si existe una sesión sin stop,
                // consideramos al jugador online.

                if (
                    !fin &&
                    inicio
                ) {

                    ultimaConexion =
                        inicio;
                }
            }


            // =================================================
            // ESTADO
            // =================================================

            let online = false;


            // Revisar si alguna sesión sigue abierta.

            for (
                const sesion
                of sesiones
            ) {

                if (
                    sesion.attributes?.start &&
                    !sesion.attributes?.stop
                ) {

                    online =
                        true;

                    break;
                }
            }


            // =================================================
            // TIEMPO
            // =================================================

            const segundos =
                calcularTiempoSesiones(
                    sesiones
                );


            // =================================================
            // CANDIDATO
            // =================================================

            candidatos.push({

                id:
                    playerId,

                name:
                    atributos.name ||
                    jugador.attributes?.name ||
                    nombre,

                serverId:
                    serverId,

                serverName:
                    servidor?.name ||
                    `Servidor ${serverId}`,

                online:
                    online,

                sesiones:
                    sesiones.length,

                timePlayedSeconds:
                    segundos,

                tiempoJugado:
                    formatearTiempo(
                        segundos
                    ),

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

                perfilUrl:
                    `https://www.battlemetrics.com/players/${playerId}`

            });
        }


        // =================================================
        // ORDENAR CANDIDATOS
        // =================================================

        candidatos.sort(
            (a, b) => {

                // Online primero

                if (
                    a.online &&
                    !b.online
                ) {

                    return -1;
                }


                if (
                    !a.online &&
                    b.online
                ) {

                    return 1;
                }


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


        const jugador =
            candidatos[0];


        if (
            !jugador
        ) {

            return null;
        }


        console.log(
            "✅ JUGADOR ENCONTRADO",
            {
                nombre:
                    jugador.name,

                id:
                    jugador.id,

                servidor:
                    jugador.serverName,

                serverId:
                    jugador.serverId,

                sesiones:
                    jugador.sesiones,

                online:
                    jugador.online,

                tiempo:
                    jugador.tiempoJugado,

                ultimaConexion:
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
            "❌ Error buscando jugador histórico:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// COMPATIBILIDAD
// =====================================================
//
// Dejamos este alias por si otro archivo del bot
// intenta utilizar esta función.
//
// =====================================================

async function searchBattleMetricsPlayerHistory(
    nombre,
    serverId
) {

    return buscarJugadorHistorico(
        nombre,
        serverId
    );
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    obtenerServidor,

    obtenerJugadoresServidor,

    buscarJugadorEnServidor,

    buscarJugadorHistorico,

    searchBattleMetricsPlayerHistory,

    obtenerJugador,

    obtenerSesionesServidorJugador,

    formatearFechaChile,

    calcularTiempoSesiones,

    formatearTiempo

};