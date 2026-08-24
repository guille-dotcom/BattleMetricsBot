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
// FORMATEAR FECHA CHILE
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
// OBTENER SERVER ID DE UNA SESIÓN
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
// OBTENER INFORMACIÓN DEL SERVIDOR
// =====================================================

async function obtenerServidor(
    serverId
) {

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


        if (
            !servidor
        ) {

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
// BUSCAR PERFILES GLOBALES POR NOMBRE
// =====================================================
//
// IMPORTANTE:
//
// NO usamos:
//
// /servers/{serverId}/players
//
// porque BattleMetrics devuelve:
//
// 405 GET is not allowed
//
// Buscamos primero el perfil global.
//
// =====================================================

async function buscarPerfilesPorNombre(
    nombre
) {

    try {

        const nombreBuscado =
            String(nombre)
                .trim();


        if (
            !nombreBuscado
        ) {

            return [];
        }


        console.log(
            `🌎 BM → buscando perfiles globales "${nombreBuscado}"`
        );


        const resultados =
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

            console.log(
                `📄 BM /players → página ${pagina}`
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

                                    "filter[search]":
                                        nombreBuscado,

                                    "page[size]":
                                        100

                                }
                                : undefined,

                        timeout:
                            15000
                    }
                );


            const jugadores =
                response.data?.data ||
                [];


            console.log(
                `📊 BM /players → ${jugadores.length} resultados`
            );


            for (
                const jugador
                of jugadores
            ) {

                if (
                    jugador?.type !==
                    "player"
                ) {

                    continue;
                }


                const nombreBM =
                    jugador.attributes
                        ?.name
                        ?.trim()
                        .toLowerCase();


                if (
                    nombreBM !==
                    nombreBuscado.toLowerCase()
                ) {

                    continue;
                }


                const existe =
                    resultados.some(
                        resultado =>
                            String(
                                resultado.id
                            ) ===
                            String(
                                jugador.id
                            )
                    );


                if (
                    !existe
                ) {

                    resultados.push(
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
            `🔎 BM → ${resultados.length} perfil(es) exactos encontrados para "${nombreBuscado}"`
        );


        return resultados;

    } catch (error) {

        console.error(
            "❌ Error buscando perfiles globales:",
            error.response?.data ||
            error.message
        );

        return [];
    }
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
// OBTENER TODAS LAS SESIONES DEL JUGADOR
// =====================================================
//
// Usamos el perfil global.
//
// No usamos:
//
// /servers/{id}/players
//
// porque ese endpoint está devolviendo 405.
//
// =====================================================

async function obtenerSesionesJugador(
    playerId
) {

    try {

        const sesiones =
            [];


        let nextUrl =
            `${BM_API}/players/${playerId}/relationships/sessions?page[size]=100`;


        let pagina =
            1;


        const limitePaginas =
            50;


        while (
            nextUrl &&
            pagina <= limitePaginas
        ) {

            console.log(
                `📡 BM ${playerId} → sesiones página ${pagina}`
            );


            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        timeout:
                            15000
                    }
                );


            const data =
                response.data?.data ||
                [];


            console.log(
                `📊 BM ${playerId} → ${data.length} sesiones recibidas`
            );


            if (
                data.length === 0
            ) {

                break;
            }


            sesiones.push(
                ...data
            );


            nextUrl =
                response.data?.links?.next ||
                null;


            pagina++;
        }


        return sesiones;

    } catch (error) {

        console.error(
            `❌ Error obteniendo sesiones del jugador ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// OBTENER SESIONES DEL JUGADOR PARA UN SERVIDOR
// =====================================================
//
// IMPORTANTE:
//
// Primero obtenemos las sesiones globales del jugador
// y después filtramos localmente por serverId.
//
// =====================================================

async function obtenerSesionesServidorJugador(
    playerId,
    serverId
) {

    try {

        const sesiones =
            await obtenerSesionesJugador(
                playerId
            );


        console.log(
            `📊 BM ${playerId} → ${sesiones.length} sesiones globales`
        );


        if (
            sesiones.length === 0
        ) {

            return [];
        }


        const serverIdString =
            String(
                serverId
            );


        const sesionesServidor =
            sesiones.filter(
                sesion => {

                    const sessionServerId =
                        obtenerServerIdDeSesion(
                            sesion
                        );


                    return (
                        sessionServerId &&
                        String(
                            sessionServerId
                        ) ===
                        serverIdString
                    );
                }
            );


        console.log(
            `🎮 BM ${playerId} → ${sesionesServidor.length} sesiones en servidor ${serverIdString}`
        );


        return sesionesServidor;

    } catch (error) {

        console.error(
            `❌ Error filtrando sesiones ${playerId}:`,
            error.message
        );

        return [];
    }
}


// =====================================================
// CALCULAR TIEMPO
// =====================================================

function calcularTiempoSesiones(
    sesiones
) {

    let segundos =
        0;


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


        let fin;


        if (
            atributos.stop
        ) {

            fin =
                new Date(
                    atributos.stop
                );

        } else {

            fin =
                new Date();
        }


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
// FLUJO:
//
// 1. Busca perfiles globales por nombre.
// 2. Obtiene el servidor configurado.
// 3. Para cada perfil:
//      - obtiene sus sesiones
//      - filtra las del servidor
//      - calcula tiempo
//      - calcula primera/última conexión
//      - calcula estado online
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
                `⚠️ BM → no se pudo obtener servidor ${serverId}`
            );
        }


        // =================================================
        // PERFILES GLOBALES
        // =================================================

        const perfiles =
            await buscarPerfilesPorNombre(
                nombre
            );


        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ BM → no se encontró perfil global para "${nombre}"`
            );

            return null;
        }


        console.log(
            `👥 BM → ${perfiles.length} perfil(es) global(es) para "${nombre}"`
        );


        const candidatos =
            [];


        // =================================================
        // REVISAR PERFILES
        // =================================================

        for (
            const jugador
            of perfiles
        ) {

            const playerId =
                String(
                    jugador.id
                );


            console.log(
                `🔎 Revisando BM ${playerId} → historial`
            );


            // =================================================
            // DETALLE
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
            // SESIONES DEL SERVIDOR
            // =================================================

            const sesiones =
                await obtenerSesionesServidorJugador(
                    playerId,
                    serverId
                );


            console.log(
                `📊 BM ${playerId} → ${sesiones.length} sesiones en ${serverId}`
            );


            // =================================================
            // SIN HISTORIAL
            // =================================================

            if (
                sesiones.length === 0
            ) {

                console.log(
                    `⛔ BM ${playerId} → sin historial en ${serverId}`
                );

                continue;
            }


            // =================================================
            // ORDENAR SESIONES
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


                if (
                    !inicio ||
                    isNaN(
                        inicio.getTime()
                    )
                ) {

                    continue;
                }


                if (
                    !primeraConexion ||
                    inicio <
                    primeraConexion
                ) {

                    primeraConexion =
                        inicio;
                }
            }


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

                } else if (
                    inicio &&
                    !isNaN(
                        inicio.getTime()
                    )
                ) {

                    if (
                        !ultimaConexion ||
                        inicio >
                        ultimaConexion
                    ) {

                        ultimaConexion =
                            inicio;
                    }
                }
            }


            // =================================================
            // ONLINE
            // =================================================

            let online =
                false;


            for (
                const sesion
                of sesiones
            ) {

                const atributosSesion =
                    sesion.attributes ||
                    {};


                if (
                    atributosSesion.start &&
                    !atributosSesion.stop
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
        // NINGÚN PERFIL CON HISTORIAL
        // =================================================

        if (
            candidatos.length === 0
        ) {

            console.log(
                `❌ "${nombre}" tiene perfiles BM, pero ninguno tiene historial en ${serverId}.`
            );

            return null;
        }


        // =================================================
        // ORDENAR
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
// Mantiene compatibilidad con versiones anteriores
// del comando /buscar.
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

    buscarPerfilesPorNombre,

    obtenerJugador,

    obtenerServidor,

    obtenerSesionesJugador,

    obtenerSesionesServidorJugador,

    buscarJugadorHistorico,

    searchBattleMetricsPlayerHistory,

    formatearFechaChile,

    calcularTiempoSesiones,

    formatearTiempo,

    obtenerServerIdDeSesion

};