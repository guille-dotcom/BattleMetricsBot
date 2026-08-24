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
// FORMATEAR FECHA A CHILE
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

    const serverRelationship =
        sesion
            .relationships
            ?.server
            ?.data;

    if (
        serverRelationship?.id
    ) {

        return String(
            serverRelationship.id
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
// BUSCAR PERFILES GLOBALMENTE POR NOMBRE
// =====================================================
//
// IMPORTANTE:
//
// NO buscamos en:
//
// /servers/{serverId}
//
// porque ese endpoint representa jugadores
// presentes/relacionados con el servidor.
//
// Para /buscar necesitamos encontrar primero
// los perfiles globales.
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
            `🌎 BM /players → buscando "${nombreBuscado}"`
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
                            10000
                    }
                );


            const jugadores =
                response.data?.data ||
                [];


            console.log(
                `📊 BM búsqueda "${nombreBuscado}" → página ${pagina}: ${jugadores.length} resultados`
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
                    jugador.attributes
                        ?.name
                        ?.trim()
                        .toLowerCase();


                // -----------------------------------------
                // COINCIDENCIA EXACTA
                // -----------------------------------------

                if (
                    nombreBM !==
                    nombreBuscado.toLowerCase()
                ) {

                    continue;
                }


                const yaExiste =
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
                    !yaExiste
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
            `🔎 BM → perfiles exactos encontrados para "${nombreBuscado}": ${resultados.length}`
        );


        return resultados;

    } catch (error) {

        console.error(
            "❌ Error buscando perfiles globales BM:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// OBTENER TODAS LAS SESIONES DEL PERFIL
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

            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        timeout:
                            10000
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
                        7000
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
                servidor.id,

            name:
                servidor.attributes?.name ||
                "Desconocido"

        };

    } catch (error) {

        console.error(
            `⚠️ No se pudo obtener servidor ${serverId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// CALCULAR DURACIÓN DE SESIONES
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


        let fin =
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
// FORMATEAR SEGUNDOS
// =====================================================

function formatearTiempo(
    segundos
) {

    segundos =
        Number(segundos) || 0;


    const horas =
        Math.floor(
            segundos / 3600
        );


    const minutos =
        Math.floor(
            (
                segundos %
                3600
            ) / 60
        );


    if (
        horas > 0
    ) {

        return `${horas}h ${minutos}m`;
    }


    return `${minutos}m`;
}


// =====================================================
// BUSCAR PERFIL EN HISTORIAL DEL SERVIDOR
// =====================================================
//
// FLUJO:
//
// 1. Busca "cyclops" globalmente.
// 2. Obtiene sus perfiles BM.
// 3. Consulta las sesiones de cada perfil.
// 4. Busca sesiones cuyo servidor sea 2788421.
// 5. Si encuentra una, el perfil pertenece
//    al historial del servidor.
// 6. Obtiene la última conexión.
// 7. Ordena por actividad más reciente.
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
            String(serverId);


        console.log(
            `🔎 BM HISTORIAL → "${nombre}" en servidor ${serverId}`
        );


        // =================================================
        // 1. BUSCAR PERFILES
        // =================================================

        const perfiles =
            await buscarPerfilesPorNombre(
                nombre
            );


        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ BM → no existe perfil exacto para "${nombre}"`
            );

            return null;
        }


        // =================================================
        // 2. SERVIDOR
        // =================================================

        const servidor =
            await obtenerServidor(
                serverId
            );


        const candidatos =
            [];


        // =================================================
        // 3. REVISAR CADA PERFIL
        // =================================================

        for (
            const perfil
            of perfiles
        ) {

            console.log(
                `🔎 Revisando BM ${perfil.id} → historial`
            );


            const sesiones =
                await obtenerSesionesJugador(
                    perfil.id
                );


            console.log(
                `📊 BM ${perfil.id} → ${sesiones.length} sesiones totales`
            );


            // =================================================
            // FILTRAR SESIONES DEL SERVIDOR
            // =================================================

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
                            serverId
                        );
                    }
                );


            if (
                sesionesServidor.length === 0
            ) {

                console.log(
                    `⛔ BM ${perfil.id} → sin historial en ${serverId}`
                );

                continue;
            }


            console.log(
                `✅ BM ${perfil.id} → ${sesionesServidor.length} sesiones en ${serverId}`
            );


            // =================================================
            // ORDENAR SESIONES
            // =================================================

            sesionesServidor.sort(
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
            // ÚLTIMA SESIÓN
            // =================================================

            const ultimaSesion =
                sesionesServidor[0];


            const ultimoInicio =
                ultimaSesion
                    ?.attributes
                    ?.start
                    ? new Date(
                        ultimaSesion.attributes.start
                    )
                    : null;


            const ultimoFin =
                ultimaSesion
                    ?.attributes
                    ?.stop
                    ? new Date(
                        ultimaSesion.attributes.stop
                    )
                    : null;


            // =================================================
            // ONLINE
            // =================================================

            const online =
                !ultimoFin;


            // =================================================
            // LAST SEEN
            // =================================================

            let ultimaConexion =
                online
                    ? ultimoInicio
                    : ultimoFin;


            if (
                !ultimaConexion ||
                isNaN(
                    ultimaConexion.getTime()
                )
            ) {

                ultimaConexion =
                    null;
            }


            // =================================================
            // PRIMERA CONEXIÓN
            // =================================================

            let primeraConexion =
                null;


            for (
                const sesion
                of sesionesServidor
            ) {

                const inicio =
                    sesion
                        .attributes
                        ?.start
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
            // TIEMPO JUGADO
            // =================================================

            const segundosJugados =
                calcularTiempoSesiones(
                    sesionesServidor
                );


            // =================================================
            // CANDIDATO
            // =================================================

            candidatos.push({

                id:
                    String(
                        perfil.id
                    ),

                name:
                    perfil.attributes
                        ?.name ||
                    nombre,

                serverId:
                    serverId,

                serverName:
                    servidor?.name ||
                    `Servidor ${serverId}`,

                online:
                    online,

                sesiones:
                    sesionesServidor.length,

                timePlayedSeconds:
                    segundosJugados,

                tiempoJugado:
                    formatearTiempo(
                        segundosJugados
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
                    `https://www.battlemetrics.com/players/${perfil.id}`

            });
        }


        // =================================================
        // NO HAY HISTORIAL EN EL SERVIDOR
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
        // ORDENAR POR ÚLTIMA ACTIVIDAD
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


        const jugador =
            candidatos[0];


        console.log(
            "✅ JUGADOR HISTÓRICO ENCONTRADO",
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

                ultimaConexion:
                    jugador.ultimaConexion,

                tiempoJugado:
                    jugador.tiempoJugado
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
// OBTENER HISTORIAL DIRECTAMENTE POR PLAYER ID
// =====================================================
//
// Esta función puede servir posteriormente para
// /horasbm u otros comandos.
//
// =====================================================

async function obtenerHistorialJugadorEnServidor(
    playerId,
    serverId
) {

    try {

        const sesiones =
            await obtenerSesionesJugador(
                playerId
            );


        const sesionesServidor =
            sesiones.filter(
                sesion =>
                    String(
                        obtenerServerIdDeSesion(
                            sesion
                        )
                    ) ===
                    String(
                        serverId
                    )
            );


        sesionesServidor.sort(
            (a, b) =>
                new Date(
                    b.attributes?.start ||
                    0
                ) -
                new Date(
                    a.attributes?.start ||
                    0
                )
        );


        return sesionesServidor;

    } catch (error) {

        console.error(
            "❌ Error obteniendo historial por ID:",
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

    buscarPerfilesPorNombre,

    obtenerSesionesJugador,

    obtenerServidor,

    obtenerHistorialJugadorEnServidor,

    buscarJugadorHistorico

};