require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";

const TIMEZONE_CHILE = "America/Santiago";

// Máximo tiempo permitido desde el último Last Seen
// 1 hora = 60 minutos
const MAX_LAST_SEEN_MINUTES = 60;


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
// OBTENER SERVIDORES DEL PERFIL
// =====================================================

function obtenerServidoresDelPerfil(
    jugador
) {

    if (!jugador) {
        return [];
    }

    const servidores =
        jugador.relationships
            ?.servers
            ?.data;

    if (
        !Array.isArray(
            servidores
        )
    ) {
        return [];
    }

    return servidores
        .filter(
            servidor =>
                servidor &&
                servidor.id
        )
        .map(
            servidor => ({

                id:
                    String(
                        servidor.id
                    ),

                type:
                    servidor.type ||
                    "server",

                meta:
                    servidor.meta ||
                    {}
            })
        );
}


// =====================================================
// OBTENER PRIMER SERVER DEL PERFIL
// =====================================================

function obtenerPrimerServerIdDelPerfil(
    jugador
) {

    const servidores =
        obtenerServidoresDelPerfil(
            jugador
        );

    if (
        servidores.length === 0
    ) {
        return null;
    }

    return String(
        servidores[0].id
    );
}


// =====================================================
// OBTENER LAST SEEN DESDE META DEL SERVIDOR
// =====================================================
//
// BattleMetrics puede entregar información dentro de:
//
// relationships.servers.data[].meta
//
// Dependiendo de la respuesta/API puede aparecer como:
//
// lastSeen
// last_seen
// lastSeenAt
// last_seen_at
//
// También puede aparecer como fecha en attributes.
// =====================================================

function obtenerLastSeenDeServidorRelacion(
    servidor
) {

    if (!servidor) {
        return null;
    }

    const meta =
        servidor.meta ||
        {};

    const atributos =
        servidor.attributes ||
        {};

    const posiblesFechas = [

        meta.lastSeen,

        meta.last_seen,

        meta.lastSeenAt,

        meta.last_seen_at,

        meta.lastseen,

        atributos.lastSeen,

        atributos.last_seen,

        atributos.lastSeenAt,

        atributos.last_seen_at

    ];

    for (
        const fecha
        of posiblesFechas
    ) {

        if (!fecha) {
            continue;
        }

        const fechaReal =
            new Date(
                fecha
            );

        if (
            !isNaN(
                fechaReal.getTime()
            )
        ) {

            return fechaReal;
        }
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
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(
    nombre
) {

    return String(
        nombre || ""
    )
        .trim()
        .toLowerCase();
}


// =====================================================
// BUSCAR PERFILES GLOBALES POR NOMBRE
// =====================================================

async function buscarPerfilesPorNombre(
    nombre
) {

    try {

        const nombreBuscado =
            String(
                nombre || ""
            ).trim();

        if (
            !nombreBuscado
        ) {

            return [];
        }

        const nombreNormalizado =
            normalizarNombre(
                nombreBuscado
            );

        console.log(
            `🌎 BM → buscando perfiles globales para "${nombreBuscado}"`
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
                                        100,

                                    include:
                                        "server"

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
                `📊 BM /players → ${jugadores.length} perfiles recibidos`
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
                    normalizarNombre(
                        jugador.attributes?.name
                    );


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


        for (
            const perfil
            of resultados
        ) {

            const servidores =
                obtenerServidoresDelPerfil(
                    perfil
                );

            const primerServidor =
                servidores[0];


            console.log(
                `👤 Perfil ${perfil.id} → ${servidores.length} servidor(es) relacionados`
            );


            console.log(
                `   🥇 Primer servidor → ${
                    primerServidor?.id ||
                    "DESCONOCIDO"
                }`
            );


            const lastSeen =
                obtenerLastSeenDeServidorRelacion(
                    primerServidor
                );


            console.log(
                `   🕐 Last Seen → ${
                    lastSeen
                        ? formatearFechaChile(lastSeen)
                        : "NO DISPONIBLE"
                }`
            );
        }


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
                `📡 BM ${playerId} → obteniendo sesiones página ${pagina}`
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
                `📊 BM ${playerId} → página ${pagina}: ${data.length} sesiones`
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


        console.log(
            `📊 BM ${playerId} → ${sesiones.length} sesiones totales`
        );


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
// OBTENER ÚLTIMA ACTIVIDAD EN UN SERVIDOR
// =====================================================
//
// Esta función es MUY importante.
//
// Busca solamente las sesiones del servidor indicado.
//
// Para cada sesión:
//
// ONLINE:
//     no tiene stop
//     → la actividad es ahora
//
// OFFLINE:
//     tiene stop
//     → Last Seen = stop
//
// Luego se queda con la actividad más reciente.
// =====================================================

function obtenerUltimaActividadServidor(
    sesiones,
    serverId
) {

    if (
        !Array.isArray(
            sesiones
        ) ||
        sesiones.length === 0 ||
        !serverId
    ) {

        return null;
    }


    const serverIdString =
        String(
            serverId
        );


    let ultimaActividad =
        null;


    let sesionCorrespondiente =
        null;


    let online =
        false;


    for (
        const sesion
        of sesiones
    ) {

        const sesionServerId =
            obtenerServerIdDeSesion(
                sesion
            );


        if (
            !sesionServerId ||
            String(
                sesionServerId
            ) !==
            serverIdString
        ) {

            continue;
        }


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


        let actividad;


        let estaOnline =
            false;


        if (
            atributos.stop
        ) {

            actividad =
                new Date(
                    atributos.stop
                );

        } else {

            actividad =
                new Date();

            estaOnline =
                true;
        }


        if (
            isNaN(
                actividad.getTime()
            )
        ) {

            continue;
        }


        if (
            !ultimaActividad ||
            actividad >
            ultimaActividad
        ) {

            ultimaActividad =
                actividad;

            sesionCorrespondiente =
                sesion;

            online =
                estaOnline;
        }
    }


    if (
        !ultimaActividad
    ) {

        return null;
    }


    const ahora =
        new Date();


    const minutosDesdeLastSeen =
        Math.max(
            0,
            Math.floor(
                (
                    ahora -
                    ultimaActividad
                ) / 60000
            )
        );


    return {

        fecha:
            ultimaActividad,

        minutos:
            minutosDesdeLastSeen,

        online,

        sesion:
            sesionCorrespondiente
    };
}


// =====================================================
// COMPROBAR LAST SEEN <= 1 HORA
// =====================================================

function actividadDentroDeUnaHora(
    actividad
) {

    if (
        !actividad ||
        !actividad.fecha
    ) {

        return false;
    }


    return (
        actividad.minutos <=
        MAX_LAST_SEEN_MINUTES
    );
}


// =====================================================
// CALCULAR TIEMPO DE SESIONES
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
        of sesiones || []
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
            segundos / 3600
        );


    const minutos =
        Math.floor(
            (
                segundos % 3600
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
// OBTENER SERVIDOR DE UNA SESIÓN
// =====================================================

async function obtenerServidorDeSesion(
    sesion,
    servidoresCache
) {

    const serverId =
        obtenerServerIdDeSesion(
            sesion
        );


    if (
        !serverId
    ) {

        return null;
    }


    if (
        servidoresCache &&
        servidoresCache.has(serverId)
    ) {

        return servidoresCache.get(
            serverId
        );
    }


    const servidor =
        await obtenerServidor(
            serverId
        );


    if (
        servidoresCache
    ) {

        servidoresCache.set(
            serverId,
            servidor
        );
    }


    return servidor;
}


// =====================================================
// CONSTRUIR RESULTADO
// =====================================================

async function construirResultadoJugador(
    jugador,
    sesiones,
    serverId,
    servidorConfigurado,
    servidorActividad,
    actividadServidor
) {

    const atributos =
        jugador.attributes ||
        {};


    const playerId =
        String(
            jugador.id
        );


    const sesionesOrdenadas =
        [...sesiones].sort(
            (a, b) => {

                const fechaA =
                    new Date(
                        a.attributes?.start ||
                        0
                    ).getTime();


                const fechaB =
                    new Date(
                        b.attributes?.start ||
                        0
                    ).getTime();


                return (
                    fechaB -
                    fechaA
                );
            }
        );


    const ultimaSesion =
        obtenerUltimaSesion(
            sesionesOrdenadas
        );


    let ultimaSesionServerId =
        null;

    let inicio =
        null;

    let fin =
        null;

    let segundosUltimaSesion =
        0;


    if (
        ultimaSesion
    ) {

        const ultimaAtributos =
            ultimaSesion.attributes ||
            {};


        ultimaSesionServerId =
            obtenerServerIdDeSesion(
                ultimaSesion
            );


        inicio =
            ultimaAtributos.start
                ? new Date(
                    ultimaAtributos.start
                )
                : null;


        fin =
            ultimaAtributos.stop
                ? new Date(
                    ultimaAtributos.stop
                )
                : null;


        if (
            inicio &&
            !isNaN(
                inicio.getTime()
            )
        ) {

            const finReal =
                fin &&
                !isNaN(
                    fin.getTime()
                )
                    ? fin
                    : new Date();


            segundosUltimaSesion =
                Math.max(
                    0,
                    Math.floor(
                        (
                            finReal -
                            inicio
                        ) / 1000
                    )
                );
        }
    }


    const online =
        Boolean(
            actividadServidor?.online
        );


    let primeraConexion =
        null;


    let ultimaConexion =
        null;


    for (
        const sesion
        of sesiones
    ) {

        const inicioSesion =
            sesion.attributes?.start
                ? new Date(
                    sesion.attributes.start
                )
                : null;


        const stopSesion =
            sesion.attributes?.stop
                ? new Date(
                    sesion.attributes.stop
                )
                : null;


        if (
            inicioSesion &&
            !isNaN(
                inicioSesion.getTime()
            )
        ) {

            if (
                !primeraConexion ||
                inicioSesion <
                primeraConexion
            ) {

                primeraConexion =
                    inicioSesion;
            }
        }


        if (
            stopSesion &&
            !isNaN(
                stopSesion.getTime()
            )
        ) {

            if (
                !ultimaConexion ||
                stopSesion >
                ultimaConexion
            ) {

                ultimaConexion =
                    stopSesion;
            }
        }
    }


    if (
        !ultimaConexion &&
        actividadServidor?.fecha
    ) {

        ultimaConexion =
            actividadServidor.fecha;
    }


    const segundos =
        calcularTiempoSesiones(
            sesiones
        );


    const servidoresPerfil =
        obtenerServidoresDelPerfil(
            jugador
        );


    const servidorActividadId =
        servidorActividad?.id ||
        null;


    const servidorActividadNombre =
        servidorActividad?.name ||
        "Desconocido";


    return {

        id:
            playerId,

        name:
            atributos.name ||
            "Desconocido",

        serverId:
            String(
                serverId
            ),

        serverName:
            servidorConfigurado?.name ||
            `Servidor ${serverId}`,

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
                inicio
            ),

        ultimaSesionFin:
            formatearFechaChile(
                fin
            ),

        ultimaSesionServerId:
            servidorActividadId ||
            ultimaSesionServerId ||
            String(
                serverId
            ),

        ultimaSesionServerName:
            servidorActividadNombre,

        servidorActividadId,

        servidorActividadNombre,

        // ---------------------------------------------
        // NUEVO
        // ---------------------------------------------

        lastSeen:
            actividadServidor?.fecha
                ? formatearFechaChile(
                    actividadServidor.fecha
                )
                : "No disponible",

        lastSeenDate:
            actividadServidor?.fecha ||
            null,

        lastSeenMinutes:
            actividadServidor?.minutos ??
            null,

        lastSeenDentroDeUnaHora:
            actividadDentroDeUnaHora(
                actividadServidor
            ),

        servidoresPerfil:
            servidoresPerfil.map(
                servidor =>
                    servidor.id
            ),

        cantidadServidoresPerfil:
            servidoresPerfil.length,

        perfilUrl:
            `https://www.battlemetrics.com/players/${playerId}`,

        historialConfirmado:
            true,

        origen:
            "global+servers-profile+last-seen"
    };
}


// =====================================================
// BUSCAR JUGADOR HISTÓRICO
// =====================================================
//
// LÓGICA:
//
// 1. Busca CUALQUIER nombre.
// 2. Obtiene todos los perfiles coincidentes.
// 3. Revisa cada perfil.
// 4. Obtiene "Servers seen on".
// 5. El primer servidor debe ser el configurado.
// 6. Obtiene sesiones.
// 7. Calcula el Last Seen REAL de ese servidor.
// 8. Last Seen debe ser <= 1 hora.
// 9. Si no cumple, prueba el siguiente perfil.
// 10. Si cumple, devuelve el perfil.
//
// =====================================================

async function buscarJugadorHistorico(
    nombre,
    serverId
) {

    try {

        if (
            !nombre ||
            !String(
                nombre
            ).trim()
        ) {

            return null;
        }


        if (
            !serverId
        ) {

            return null;
        }


        const serverIdString =
            String(
                serverId
            );


        const nombreBuscado =
            String(
                nombre
            ).trim();


        console.log(
            "================================================="
        );

        console.log(
            `🔎 /BUSCAR → "${nombreBuscado}"`
        );

        console.log(
            `🎯 Servidor configurado → ${serverIdString}`
        );

        console.log(
            `⏱️ Last Seen máximo permitido → ${MAX_LAST_SEEN_MINUTES} minutos`
        );

        console.log(
            "================================================="
        );


        // =================================================
        // SERVIDOR CONFIGURADO
        // =================================================

        const servidor =
            await obtenerServidor(
                serverIdString
            );


        if (
            servidor
        ) {

            console.log(
                `🎮 Servidor configurado → ${servidor.name} (${servidor.id})`
            );

        } else {

            console.log(
                `⚠️ No se pudo obtener información del servidor ${serverIdString}`
            );
        }


        // =================================================
        // BUSCAR PERFILES
        // =================================================

        const perfiles =
            await buscarPerfilesPorNombre(
                nombreBuscado
            );


        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ No existen perfiles para "${nombreBuscado}"`
            );

            return null;
        }


        console.log(
            `👥 BattleMetrics devolvió ${perfiles.length} perfil(es)`
        );


        const servidoresCache =
            new Map();


        servidoresCache.set(
            serverIdString,
            servidor
        );


        // =================================================
        // REVISAR PERFIL POR PERFIL
        // =================================================

        for (
            let indice = 0;
            indice < perfiles.length;
            indice++
        ) {

            const perfilBusqueda =
                perfiles[indice];


            const playerId =
                String(
                    perfilBusqueda.id
                );


            const nombrePerfil =
                perfilBusqueda.attributes?.name ||
                nombreBuscado;


            console.log(
                "-------------------------------------------------"
            );

            console.log(
                `👤 PERFIL ${indice + 1}/${perfiles.length}`
            );

            console.log(
                `   Nombre: ${nombrePerfil}`
            );

            console.log(
                `   ID: ${playerId}`
            );

            console.log(
                `   URL: https://www.battlemetrics.com/players/${playerId}`
            );


            // =================================================
            // PERFIL COMPLETO
            // =================================================

            const detalle =
                await obtenerJugador(
                    playerId
                );


            let jugador =
                detalle ||
                perfilBusqueda;


            // =================================================
            // CONSERVAR SERVERS DEL SEARCH
            // =================================================

            if (
                !jugador.relationships?.servers?.data?.length &&
                perfilBusqueda.relationships?.servers?.data?.length
            ) {

                jugador = {

                    ...jugador,

                    relationships: {

                        ...(jugador.relationships || {}),

                        servers:
                            perfilBusqueda.relationships.servers

                    }
                };
            }


            // =================================================
            // SERVERS SEEN ON
            // =================================================

            const servidoresPerfil =
                obtenerServidoresDelPerfil(
                    jugador
                );


            console.log(
                `🌐 Perfil ${playerId} → ${servidoresPerfil.length} servidor(es)`
            );


            if (
                servidoresPerfil.length === 0
            ) {

                console.log(
                    `⛔ Perfil ${playerId} → sin servidores relacionados`
                );

                continue;
            }


            const primerServidor =
                servidoresPerfil[0];


            const primerServerId =
                String(
                    primerServidor.id
                );


            console.log(
                `🥇 Primer servidor de "Servers seen on" → ${primerServerId}`
            );


            console.log(
                `🎯 Servidor buscado → ${serverIdString}`
            );


            // =================================================
            // EL PRIMER SERVIDOR DEBE SER EL CONFIGURADO
            // =================================================

            if (
                primerServerId !==
                serverIdString
            ) {

                console.log(
                    `❌ Perfil ${playerId} DESCARTADO → primer servidor diferente`
                );


                let servidorPrimerPerfil =
                    servidoresCache.get(
                        primerServerId
                    );


                if (
                    !servidorPrimerPerfil
                ) {

                    servidorPrimerPerfil =
                        await obtenerServidor(
                            primerServerId
                        );


                    servidoresCache.set(
                        primerServerId,
                        servidorPrimerPerfil
                    );
                }


                console.log(
                    `   🏠 Primer servidor real → ${
                        servidorPrimerPerfil?.name ||
                        `Servidor ${primerServerId}`
                    }`
                );


                continue;
            }


            console.log(
                `✅ Perfil ${playerId} → primer servidor CORRECTO`
            );


            // =================================================
            // OBTENER SESIONES
            // =================================================

            console.log(
                `📥 Perfil ${playerId} → cargando sesiones...`
            );


            const sesiones =
                await obtenerSesionesJugador(
                    playerId
                );


            if (
                sesiones.length === 0
            ) {

                console.log(
                    `⛔ Perfil ${playerId} → no tiene sesiones accesibles`
                );

                continue;
            }


            // =================================================
            // LAST SEEN DEL SERVIDOR CONFIGURADO
            // =================================================

            const actividadServidor =
                obtenerUltimaActividadServidor(
                    sesiones,
                    serverIdString
                );


            if (
                !actividadServidor
            ) {

                console.log(
                    `⛔ Perfil ${playerId} → no hay actividad registrada en ${serverIdString}`
                );

                continue;
            }


            console.log(
                `🕐 Last Seen ${serverIdString} → ${formatearFechaChile(actividadServidor.fecha)}`
            );


            console.log(
                `⏱️ Hace → ${actividadServidor.minutos} minuto(s)`
            );


            console.log(
                `${actividadServidor.online ? "🟢 ONLINE" : "🔴 OFFLINE"}`
            );


            // =================================================
            // REGLA DE 1 HORA
            // =================================================

            if (
                !actividadDentroDeUnaHora(
                    actividadServidor
                )
            ) {

                console.log(
                    `❌ Perfil ${playerId} DESCARTADO → Last Seen supera 1 hora`
                );

                console.log(
                    `   ⏱️ Última actividad: hace ${actividadServidor.minutos} minutos`
                );

                console.log(
                    `   📌 Máximo permitido: ${MAX_LAST_SEEN_MINUTES} minutos`
                );

                continue;
            }


            // =================================================
            // PERFIL VÁLIDO
            // =================================================

            console.log(
                `🎯 PERFIL ${playerId} → Last Seen dentro de la última hora`
            );


            // =================================================
            // SERVIDOR
            // =================================================

            let servidorActividad =
                servidoresCache.get(
                    serverIdString
                );


            if (
                !servidorActividad
            ) {

                servidorActividad =
                    await obtenerServidor(
                        serverIdString
                    );


                servidoresCache.set(
                    serverIdString,
                    servidorActividad
                );
            }


            // =================================================
            // CONSTRUIR RESULTADO
            // =================================================

            const resultado =
                await construirResultadoJugador(
                    jugador,
                    sesiones,
                    serverIdString,
                    servidor,
                    servidorActividad,
                    actividadServidor
                );


            if (
                !resultado
            ) {

                console.log(
                    `⚠️ Perfil ${playerId} → error construyendo resultado`
                );

                continue;
            }


            // =================================================
            // FORZAR DATOS CORRECTOS
            // =================================================

            resultado.ultimaSesionServerId =
                serverIdString;


            resultado.ultimaSesionServerName =
                servidorActividad?.name ||
                `Servidor ${serverIdString}`;


            resultado.servidorActividadId =
                serverIdString;


            resultado.servidorActividadNombre =
                servidorActividad?.name ||
                `Servidor ${serverIdString}`;


            resultado.lastSeen =
                formatearFechaChile(
                    actividadServidor.fecha
                );


            resultado.lastSeenDate =
                actividadServidor.fecha;


            resultado.lastSeenMinutes =
                actividadServidor.minutos;


            resultado.lastSeenDentroDeUnaHora =
                true;


            resultado.online =
                actividadServidor.online;


            resultado.origen =
                "global+servers-profile+last-seen";


            // =================================================
            // LOG FINAL
            // =================================================

            console.log(
                "================================================="
            );

            console.log(
                `🎯 PERFIL CORRECTO ENCONTRADO`
            );

            console.log(
                `   Nombre: ${resultado.name}`
            );

            console.log(
                `   ID: ${resultado.id}`
            );

            console.log(
                `   Servidor: ${resultado.ultimaSesionServerName}`
            );

            console.log(
                `   Servidor ID: ${resultado.ultimaSesionServerId}`
            );

            console.log(
                `   Last Seen: ${resultado.lastSeen}`
            );

            console.log(
                `   Hace: ${resultado.lastSeenMinutes} minuto(s)`
            );

            console.log(
                `   Estado: ${
                    resultado.online
                        ? "ONLINE"
                        : "OFFLINE"
                }`
            );

            console.log(
                `   Sesiones: ${resultado.sesiones}`
            );

            console.log(
                `   Tiempo: ${resultado.tiempoJugado}`
            );

            console.log(
                `   Perfil: ${resultado.perfilUrl}`
            );

            console.log(
                "================================================="
            );


            return {

                ...resultado,

                candidatos:
                    []
            };
        }


        // =================================================
        // NINGÚN PERFIL COINCIDE
        // =================================================

        console.log(
            "================================================="
        );


        console.log(
            `❌ NINGÚN PERFIL PARA "${nombreBuscado}" CUMPLE LAS CONDICIONES`
        );


        console.log(
            `🎯 Servidor requerido → ${serverIdString}`
        );


        console.log(
            `⏱️ Last Seen máximo → ${MAX_LAST_SEEN_MINUTES} minutos`
        );


        console.log(
            "================================================="
        );


        return null;


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

    buscarJugadorHistorico,

    searchBattleMetricsPlayerHistory,

    formatearFechaChile,

    calcularTiempoSesiones,

    formatearTiempo,

    obtenerServerIdDeSesion,

    obtenerUltimaSesion,

    obtenerPrimerServerIdDelPerfil,

    obtenerServidoresDelPerfil,

    obtenerLastSeenDeServidorRelacion,

    obtenerUltimaActividadServidor,

    actividadDentroDeUnaHora

};