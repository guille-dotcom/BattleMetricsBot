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


        const nombreNormalizado =
            nombreBuscado
                .toLowerCase();


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
                    nombreNormalizado
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
// OBTENER SESIONES DEL JUGADOR
// =====================================================
//
// BattleMetrics puede no devolver sesiones mediante
// esta relación aunque el perfil sí tenga actividad.
//
// Por eso esta función NO debe utilizarse como única
// prueba de que el jugador nunca estuvo en el servidor.
//

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


            let response;


            try {

                response =
                    await axios.get(
                        nextUrl,
                        {
                            headers:
                                getHeaders(),

                            timeout:
                                15000
                        }
                    );

            } catch (error) {

                console.error(
                    `⚠️ BM ${playerId} → error obteniendo sesiones:`,
                    error.response?.status ||
                    error.message
                );

                break;
            }


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
// OBTENER RELACIONES DEL JUGADOR
// =====================================================
//
// Intentamos obtener las relaciones disponibles del
// perfil. BattleMetrics puede exponer información del
// servidor mediante relationships aunque la relación
// directa de sessions esté vacía.
//

async function obtenerRelacionesJugador(
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

                        include:
                            "servers"

                    },

                    timeout:
                        15000
                }
            );


        return {

            data:
                response.data?.data ||
                null,

            included:
                response.data?.included ||
                []

        };

    } catch (error) {

        console.error(
            `⚠️ Error obteniendo relaciones del jugador ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return {

            data:
                null,

            included:
                []

        };
    }
}


// =====================================================
// EXTRAER SERVIDORES RELACIONADOS
// =====================================================

function obtenerServidoresRelacionados(
    respuesta
) {

    const servidores =
        [];


    if (!respuesta) {
        return servidores;
    }


    const data =
        respuesta.data;


    const included =
        respuesta.included ||
        [];


    // =================================================
    // RELATIONSHIPS DEL PERFIL
    // =================================================

    const relationships =
        data?.relationships ||
        {};


    const posiblesRelaciones = [

        relationships.server,

        relationships.servers,

        relationships.sessions

    ];


    for (
        const relacion
        of posiblesRelaciones
    ) {

        const datos =
            relacion?.data;


        if (
            Array.isArray(
                datos
            )
        ) {

            for (
                const item
                of datos
            ) {

                if (
                    item?.type ===
                    "server"
                ) {

                    servidores.push(
                        String(
                            item.id
                        )
                    );
                }
            }

        } else if (
            datos?.type ===
            "server"
        ) {

            servidores.push(
                String(
                    datos.id
                )
            );
        }
    }


    // =================================================
    // INCLUDED
    // =================================================

    for (
        const item
        of included
    ) {

        if (
            item?.type !==
            "server"
        ) {

            continue;
        }


        if (
            item.id
        ) {

            servidores.push(
                String(
                    item.id
                )
            );
        }
    }


    return [
        ...new Set(
            servidores
        )
    ];
}


// =====================================================
// OBTENER SESIONES DEL JUGADOR PARA UN SERVIDOR
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


    const ahora =
        new Date();


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
                ahora;
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
// OBTENER ÚLTIMA SESIÓN
// =====================================================

function obtenerUltimaSesion(
    sesiones
) {

    if (
        !Array.isArray(
            sesiones
        ) ||
        sesiones.length === 0
    ) {

        return null;
    }


    const sesionesValidas =
        sesiones.filter(
            sesion => {

                const start =
                    sesion.attributes?.start;


                if (!start) {
                    return false;
                }


                const fecha =
                    new Date(
                        start
                    );


                return !isNaN(
                    fecha.getTime()
                );
            }
        );


    if (
        sesionesValidas.length === 0
    ) {

        return null;
    }


    sesionesValidas.sort(
        (a, b) => {

            const fechaA =
                new Date(
                    a.attributes.start
                ).getTime();


            const fechaB =
                new Date(
                    b.attributes.start
                ).getTime();


            return (
                fechaB -
                fechaA
            );
        }
    );


    return sesionesValidas[0];
}


// =====================================================
// CREAR CANDIDATO
// =====================================================

function crearCandidatoDesdeSesiones(
    jugador,
    perfil,
    sesiones,
    serverId,
    servidor,
    nombreBuscado
) {

    if (
        !Array.isArray(
            sesiones
        ) ||
        sesiones.length === 0
    ) {

        return null;
    }


    const atributos =
        perfil?.attributes ||
        jugador?.attributes ||
        {};


    const sesionesOrdenadas =
        [...sesiones].sort(
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


    const ultimaSesion =
        obtenerUltimaSesion(
            sesionesOrdenadas
        );


    if (
        !ultimaSesion
    ) {

        return null;
    }


    const atributosUltimaSesion =
        ultimaSesion.attributes ||
        {};


    const inicio =
        atributosUltimaSesion.start
            ? new Date(
                atributosUltimaSesion.start
            )
            : null;


    const stop =
        atributosUltimaSesion.stop
            ? new Date(
                atributosUltimaSesion.stop
            )
            : null;


    const online =
        Boolean(
            atributosUltimaSesion.start &&
            !atributosUltimaSesion.stop
        );


    let ultimaConexion =
        null;


    if (
        stop &&
        !isNaN(
            stop.getTime()
        )
    ) {

        ultimaConexion =
            stop;

    } else if (
        inicio &&
        !isNaN(
            inicio.getTime()
        )
    ) {

        ultimaConexion =
            inicio;
    }


    let primeraConexion =
        null;


    for (
        const sesion
        of sesionesOrdenadas
    ) {

        const fechaInicio =
            sesion.attributes?.start
                ? new Date(
                    sesion.attributes.start
                )
                : null;


        if (
            !fechaInicio ||
            isNaN(
                fechaInicio.getTime()
            )
        ) {

            continue;
        }


        if (
            !primeraConexion ||
            fechaInicio <
            primeraConexion
        ) {

            primeraConexion =
                fechaInicio;
        }
    }


    const segundos =
        calcularTiempoSesiones(
            sesionesOrdenadas
        );


    let segundosUltimaSesion =
        0;


    if (
        inicio &&
        !isNaN(
            inicio.getTime()
        )
    ) {

        const fin =
            stop &&
            !isNaN(
                stop.getTime()
            )
                ? stop
                : new Date();


        segundosUltimaSesion =
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


    const playerId =
        String(
            jugador.id
        );


    return {

        id:
            playerId,

        name:
            atributos.name ||
            jugador.attributes?.name ||
            nombreBuscado,

        serverId:
            String(
                serverId
            ),

        serverName:
            servidor?.name ||
            `Servidor ${serverId}`,

        online:

            online,

        sesiones:
            sesionesOrdenadas.length,

        timePlayedSeconds:
            segundos,

        tiempoJugado:
            formatearTiempo(
                segundos
            ),

        ultimaSesionSegundos:
            segundosUltimaSesion,

        tiempoUltimaSesion:
            formatearTiempo(
                segundosUltimaSesion
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

        ultimaSesionInicio:
            formatearFechaChile(
                inicio
            ),

        ultimaSesionFin:
            formatearFechaChile(
                stop
            ),

        perfilUrl:
            `https://www.battlemetrics.com/players/${playerId}`

    };
}


// =====================================================
// BUSCAR JUGADOR HISTÓRICO
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


        const nombreBuscado =
            String(
                nombre
            ).trim();


        console.log(
            `🔎 BM BUSCAR → "${nombreBuscado}" → servidor ${serverId}`
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
        // PERFILES
        // =================================================

        const perfiles =
            await buscarPerfilesPorNombre(
                nombreBuscado
            );


        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ BM → no se encontró perfil global para "${nombreBuscado}"`
            );

            return null;
        }


        console.log(
            `👥 BM → ${perfiles.length} perfil(es) global(es)`
        );


        const candidatos =
            [];


        // =================================================
        // REVISAR CADA PERFIL
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
                `🔎 Revisando BM ${playerId} → servidor ${serverId}`
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


            // =================================================
            // SESIONES
            // =================================================

            const sesiones =
                await obtenerSesionesServidorJugador(
                    playerId,
                    serverId
                );


            console.log(
                `📊 BM ${playerId} → ${sesiones.length} sesiones accesibles en ${serverId}`
            );


            // =================================================
            // SI HAY SESIONES → USAR HISTORIAL REAL
            // =================================================

            if (
                sesiones.length > 0
            ) {

                const candidato =
                    crearCandidatoDesdeSesiones(
                        jugador,
                        perfil,
                        sesiones,
                        serverId,
                        servidor,
                        nombreBuscado
                    );


                if (
                    candidato
                ) {

                    candidatos.push(
                        candidato
                    );


                    console.log(
                        `✅ BM ${playerId} → historial encontrado`
                    );

                    continue;
                }
            }


            // =================================================
            // SIN SESIONES ACCESIBLES
            // =================================================
            //
            // IMPORTANTE:
            //
            // NO devolvemos automáticamente "no encontrado".
            //
            // Primero inspeccionamos las relaciones del perfil.
            //

            console.log(
                `⚠️ BM ${playerId} → no hay sesiones accesibles en ${serverId}`
            );


            const relaciones =
                await obtenerRelacionesJugador(
                    playerId
                );


            const servidoresRelacionados =
                obtenerServidoresRelacionados(
                    relaciones
                );


            console.log(
                `📡 BM ${playerId} → servidores relacionados:`,
                servidoresRelacionados
            );


            // =================================================
            // SI EL SERVIDOR APARECE EN LAS RELACIONES
            // =================================================

            if (
                servidoresRelacionados.includes(
                    serverId
                )
            ) {

                console.log(
                    `🎯 BM ${playerId} → servidor ${serverId} aparece relacionado con el perfil`
                );


                const atributos =
                    perfil.attributes ||
                    jugador.attributes ||
                    {};


                candidatos.push({

                    id:
                        playerId,

                    name:
                        atributos.name ||
                        nombreBuscado,

                    serverId:
                        serverId,

                    serverName:
                        servidor?.name ||
                        `Servidor ${serverId}`,

                    online:
                        false,

                    sesiones:
                        0,

                    timePlayedSeconds:
                        0,

                    tiempoJugado:
                        "0m",

                    ultimaSesionSegundos:
                        0,

                    tiempoUltimaSesion:
                        "0m",

                    primeraConexion:
                        "No disponible",

                    ultimaConexion:
                        "No disponible",

                    ultimaConexionDate:
                        null,

                    ultimaSesionInicio:
                        "No disponible",

                    ultimaSesionFin:
                        "No disponible",

                    perfilUrl:
                        `https://www.battlemetrics.com/players/${playerId}`,

                    historialDetectado:
                        true

                });


                continue;
            }


            // =================================================
            // SI NO HAY SESIONES NI RELACIÓN
            // =================================================

            console.log(
                `⛔ BM ${playerId} → no se pudo confirmar historial accesible en ${serverId}`
            );
        }


        // =================================================
        // NINGÚN CANDIDATO
        // =================================================

        if (
            candidatos.length === 0
        ) {

            console.log(
                `❌ "${nombreBuscado}" → ningún perfil pudo vincularse al servidor ${serverId}`
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


                // Luego historial real

                if (
                    a.sesiones > 0 &&
                    b.sesiones === 0
                ) {

                    return -1;
                }


                if (
                    a.sesiones === 0 &&
                    b.sesiones > 0
                ) {

                    return 1;
                }


                // Luego última conexión

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