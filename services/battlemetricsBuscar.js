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
            nombreBuscado.toLowerCase();

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
// OBTENER SERVIDORES RELACIONADOS AL JUGADOR
// =====================================================
//
// IMPORTANTE:
//
// BattleMetrics permite incluir "server" en las
// relaciones del jugador.
//
// NO usamos includes inválidos.
//
// Esta función es el respaldo principal cuando la
// relación /sessions no devuelve datos.
//
// =====================================================

async function obtenerServidoresJugador(
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
                            "server"

                    },

                    timeout:
                        15000
                }
            );

        const data =
            response.data?.data;

        const incluidos =
            response.data?.included ||
            [];

        const servidores =
            [];

        const vistos =
            new Set();


        // =================================================
        // RELATIONSHIP SERVER
        // =================================================

        const relationshipServer =
            data?.relationships
                ?.server
                ?.data;


        if (
            Array.isArray(
                relationshipServer
            )
        ) {

            for (
                const relacion
                of relationshipServer
            ) {

                if (
                    relacion?.id
                ) {

                    const id =
                        String(
                            relacion.id
                        );

                    if (
                        !vistos.has(id)
                    ) {

                        vistos.add(id);

                        servidores.push({
                            id
                        });
                    }
                }
            }

        } else if (
            relationshipServer?.id
        ) {

            const id =
                String(
                    relationshipServer.id
                );

            if (
                !vistos.has(id)
            ) {

                vistos.add(id);

                servidores.push({
                    id
                });
            }
        }


        // =================================================
        // INCLUDED
        // =================================================

        for (
            const recurso
            of incluidos
        ) {

            if (
                recurso?.type !==
                "server"
            ) {

                continue;
            }

            if (
                !recurso?.id
            ) {

                continue;
            }

            const id =
                String(
                    recurso.id
                );

            const existente =
                servidores.find(
                    servidor =>
                        String(
                            servidor.id
                        ) === id
                );

            if (
                existente
            ) {

                existente.name =
                    recurso.attributes?.name ||
                    null;

                existente.game =
                    recurso.attributes?.game ||
                    null;

            } else {

                servidores.push({

                    id,

                    name:
                        recurso.attributes?.name ||
                        null,

                    game:
                        recurso.attributes?.game ||
                        null
                });
            }
        }


        // =================================================
        // TAMBIÉN REVISAR RELACIONES DEL PERFIL
        // =================================================

        const relaciones =
            data?.relationships ||
            {};

        for (
            const [clave, valor]
            of Object.entries(
                relaciones
            )
        ) {

            if (
                !clave
                    .toLowerCase()
                    .includes("server")
            ) {

                continue;
            }

            const datos =
                valor?.data;

            if (
                Array.isArray(datos)
            ) {

                for (
                    const item
                    of datos
                ) {

                    if (
                        item?.id
                    ) {

                        const id =
                            String(
                                item.id
                            );

                        if (
                            !vistos.has(id)
                        ) {

                            vistos.add(id);

                            servidores.push({
                                id
                            });
                        }
                    }
                }

            } else if (
                datos?.id
            ) {

                const id =
                    String(
                        datos.id
                    );

                if (
                    !vistos.has(id)
                ) {

                    vistos.add(id);

                    servidores.push({
                        id
                    });
                }
            }
        }


        console.log(
            `📡 BM ${playerId} → servidores del perfil:`,
            servidores.map(
                servidor =>
                    servidor.id
            )
        );

        return servidores;

    } catch (error) {

        console.error(
            `⚠️ Error obteniendo servidores del jugador ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// COMPROBAR SI EL JUGADOR ESTÁ ASOCIADO AL SERVIDOR
// =====================================================

async function jugadorTieneServidor(
    playerId,
    serverId
) {

    const servidores =
        await obtenerServidoresJugador(
            playerId
        );

    const serverIdString =
        String(
            serverId
        );

    const encontrado =
        servidores.some(
            servidor =>
                String(
                    servidor.id
                ) ===
                serverIdString
        );

    return {

        encontrado,

        servidores
    };
}


// =====================================================
// OBTENER TODAS LAS SESIONES DEL JUGADOR
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

            console.log(
                `⚠️ BM ${playerId} → no hay sesiones accesibles en ${serverId}`
            );

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

                if (
                    !start
                ) {

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
            `👥 BM → ${perfiles.length} perfil(es) global(es) para "${nombreBuscado}"`
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

            const atributos =
                perfil.attributes ||
                {};


            // =================================================
            // SERVIDORES ASOCIADOS
            // =================================================

            const relacionServidor =
                await jugadorTieneServidor(
                    playerId,
                    serverId
                );


            const tieneServidor =
                relacionServidor.encontrado;


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
            // CASO 1:
            // TENEMOS SESIONES
            // =================================================

            if (
                sesiones.length > 0
            ) {

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

                const ultimaSesion =
                    obtenerUltimaSesion(
                        sesiones
                    );

                if (
                    !ultimaSesion
                ) {

                    continue;
                }

                const atributosUltimaSesion =
                    ultimaSesion.attributes ||
                    {};

                const ultimaSesionInicio =
                    atributosUltimaSesion.start
                        ? new Date(
                            atributosUltimaSesion.start
                        )
                        : null;

                const ultimaSesionFin =
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
                    ultimaSesionFin &&
                    !isNaN(
                        ultimaSesionFin.getTime()
                    )
                ) {

                    ultimaConexion =
                        ultimaSesionFin;

                } else if (
                    ultimaSesionInicio &&
                    !isNaN(
                        ultimaSesionInicio.getTime()
                    )
                ) {

                    ultimaConexion =
                        ultimaSesionInicio;
                }

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

                const segundos =
                    calcularTiempoSesiones(
                        sesiones
                    );

                let segundosUltimaSesion =
                    0;

                if (
                    ultimaSesionInicio &&
                    !isNaN(
                        ultimaSesionInicio.getTime()
                    )
                ) {

                    const finUltimaSesion =
                        ultimaSesionFin &&
                        !isNaN(
                            ultimaSesionFin.getTime()
                        )
                            ? ultimaSesionFin
                            : new Date();

                    segundosUltimaSesion =
                        Math.max(
                            0,
                            Math.floor(
                                (
                                    finUltimaSesion -
                                    ultimaSesionInicio
                                ) / 1000
                            )
                        );
                }

                candidatos.push({

                    id:
                        playerId,

                    name:
                        atributos.name ||
                        jugador.attributes?.name ||
                        nombreBuscado,

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
                            ultimaSesionInicio
                        ),

                    ultimaSesionFin:
                        formatearFechaChile(
                            ultimaSesionFin
                        ),

                    perfilUrl:
                        `https://www.battlemetrics.com/players/${playerId}`,

                    historialConfirmado:
                        true

                });

                console.log(
                    `✅ BM ${playerId} → historial confirmado mediante sesiones`
                );

                continue;
            }


            // =================================================
            // CASO 2:
            // NO HAY SESIONES ACCESIBLES
            //
            // PERO EL PERFIL ESTÁ ASOCIADO AL SERVIDOR
            // =================================================

            if (
                tieneServidor
            ) {

                console.log(
                    `✅ BM ${playerId} → servidor ${serverId} encontrado en relaciones del perfil`
                );

                candidatos.push({

                    id:
                        playerId,

                    name:
                        atributos.name ||
                        jugador.attributes?.name ||
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

                    historialConfirmado:
                        true,

                    sesionesNoAccesibles:
                        true

                });

                continue;
            }


            // =================================================
            // NO HAY NINGUNA FORMA DE VINCULARLO
            // =================================================

            console.log(
                `⛔ BM ${playerId} → no se pudo confirmar historial accesible en ${serverId}`
            );
        }


        // =================================================
        // NINGÚN PERFIL VÁLIDO
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


        // =================================================
        // JUGADOR PRINCIPAL
        // =================================================

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
                    jugador.tiempoJugado
            }
        );


        // =================================================
        // RESULTADO
        // =================================================

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

    obtenerServidoresJugador,

    jugadorTieneServidor,

    obtenerSesionesJugador,

    obtenerSesionesServidorJugador,

    buscarJugadorHistorico,

    searchBattleMetricsPlayerHistory,

    formatearFechaChile,

    calcularTiempoSesiones,

    formatearTiempo,

    obtenerServerIdDeSesion

};