require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";

const TIMEZONE_CHILE = "America/Santiago";

// Máximo Last Seen permitido en el servidor buscado.
// 60 = 1 hora
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
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {

    return String(
        nombre || ""
    )
        .normalize("NFD")
        .replace(
            /[\u0300-\u036f]/g,
            ""
        )
        .replace(
            /\s+/g,
            " "
        )
        .trim()
        .toLowerCase();
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
// OBTENER INFORMACIÓN DEL SERVIDOR
// =====================================================

async function obtenerServidor(
    serverId
) {

    try {

        if (!serverId) {
            return null;
        }

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
// BUSCAR JUGADORES
// =====================================================

async function ejecutarBusquedaJugadores(
    termino
) {

    const resultados = [];

    let nextUrl =
        `${BM_API}/players`;

    let pagina = 1;

    const limitePaginas = 10;


    while (
        nextUrl &&
        pagina <= limitePaginas
    ) {

        console.log(
            `📄 BM /players → "${termino}" → página ${pagina}`
        );

        let response;

        try {

            response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? {

                                    "filter[search]":
                                        termino,

                                    "page[size]":
                                        100

                                }
                                : undefined,

                        timeout:
                            15000
                    }
                );

        } catch (error) {

            console.error(
                `❌ Error buscando "${termino}" en BM:`,
                error.response?.data ||
                error.message
            );

            break;
        }

        const jugadores =
            response.data?.data ||
            [];

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

    return resultados;
}


// =====================================================
// BUSCAR PERFILES POR NOMBRE
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

        const candidatos = [];


        // =================================================
        // BÚSQUEDA EXACTA
        // =================================================

        let encontrados =
            await ejecutarBusquedaJugadores(
                nombreBuscado
            );

        candidatos.push(
            ...encontrados
        );


        // =================================================
        // BÚSQUEDA POR PALABRAS
        // =================================================

        if (
            candidatos.length === 0
        ) {

            const partes =
                nombreBuscado
                    .split(/\s+/)
                    .filter(
                        parte =>
                            parte.length >= 2
                    );

            for (
                const parte
                of partes
            ) {

                const resultadosParte =
                    await ejecutarBusquedaJugadores(
                        parte
                    );

                for (
                    const jugador
                    of resultadosParte
                ) {

                    const existe =
                        candidatos.some(
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

                        candidatos.push(
                            jugador
                        );

                    }
                }
            }
        }


        // =================================================
        // FILTRO EXACTO
        // =================================================

        const resultados =
            candidatos.filter(
                jugador => {

                    const nombreBM =
                        normalizarNombre(
                            jugador.attributes?.name
                        );

                    return (
                        nombreBM ===
                        nombreNormalizado
                    );

                }
            );


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
// OBTENER TODAS LAS SESIONES
// =====================================================

async function obtenerSesionesJugador(
    playerId
) {

    try {

        const sesiones = [];

        let nextUrl =
            `${BM_API}/players/${playerId}/relationships/sessions?page[size]=100`;

        let pagina = 1;

        // Se mantiene un límite alto para evitar loops
        // infinitos, pero suficiente para perfiles grandes.
        const limitePaginas = 200;


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
                    new Date(start);

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


    return (
        [...sesionesValidas].sort(
            (a, b) =>
                new Date(
                    b.attributes.start
                ).getTime() -
                new Date(
                    a.attributes.start
                ).getTime()
        )[0]
    );
}


// =====================================================
// OBTENER ÚLTIMA SESIÓN EN SERVIDOR
// =====================================================

function obtenerUltimaSesionEnServidor(
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
        String(serverId);


    const sesionesServidor =
        sesiones.filter(
            sesion => {

                const sesionServerId =
                    obtenerServerIdDeSesion(
                        sesion
                    );

                if (
                    !sesionServerId
                ) {
                    return false;
                }

                if (
                    String(
                        sesionServerId
                    ) !==
                    serverIdString
                ) {

                    return false;
                }

                const start =
                    sesion.attributes?.start;

                if (!start) {
                    return false;
                }

                const fecha =
                    new Date(start);

                return !isNaN(
                    fecha.getTime()
                );

            }
        );


    if (
        sesionesServidor.length === 0
    ) {

        return null;
    }


    sesionesServidor.sort(
        (a, b) =>
            new Date(
                b.attributes.start
            ).getTime() -
            new Date(
                a.attributes.start
            ).getTime()
    );


    return sesionesServidor[0];
}


// =====================================================
// OBTENER TODAS LAS SESIONES DE UN SERVIDOR
// =====================================================

function obtenerSesionesEnServidor(
    sesiones,
    serverId
) {

    const serverIdString =
        String(serverId);


    return (
        sesiones || []
    ).filter(
        sesion =>
            obtenerServerIdDeSesion(
                sesion
            ) === serverIdString
    );
}


// =====================================================
// OBTENER LAST SEEN
// =====================================================

function obtenerLastSeenEnServidor(
    sesiones,
    serverId
) {

    const ultimaSesion =
        obtenerUltimaSesionEnServidor(
            sesiones,
            serverId
        );


    if (
        !ultimaSesion
    ) {

        return null;
    }


    const atributos =
        ultimaSesion.attributes ||
        {};


    if (
        atributos.stop
    ) {

        const fechaStop =
            new Date(
                atributos.stop
            );

        if (
            isNaN(
                fechaStop.getTime()
            )
        ) {

            return null;
        }

        return fechaStop;
    }


    return new Date();
}


// =====================================================
// CALCULAR MINUTOS DESDE
// =====================================================

function calcularMinutosDesde(
    fecha
) {

    if (!fecha) {
        return null;
    }


    const fechaReal =
        fecha instanceof Date
            ? fecha
            : new Date(fecha);


    if (
        isNaN(
            fechaReal.getTime()
        )
    ) {

        return null;
    }


    const ahora =
        new Date();


    return Math.max(
        0,
        Math.floor(
            (
                ahora.getTime() -
                fechaReal.getTime()
            ) / 60000
        )
    );
}


// =====================================================
// CALCULAR TIEMPO DE SESIONES
// =====================================================

function calcularTiempoSesiones(
    sesiones
) {

    let segundos = 0;

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
// CONSTRUIR RESULTADO
// =====================================================

async function construirResultadoJugador(
    jugador,
    sesiones,
    serverId,
    servidorConfigurado,
    ultimaSesionServidor,
    lastSeenServidor
) {

    const atributos =
        jugador.attributes ||
        {};


    const playerId =
        String(
            jugador.id
        );


    // =================================================
    // ÚLTIMA SESIÓN GLOBAL
    // =================================================

    const ultimaSesionGlobal =
        obtenerUltimaSesion(
            sesiones
        );


    let inicioGlobal =
        null;

    let finGlobal =
        null;


    if (
        ultimaSesionGlobal
    ) {

        inicioGlobal =
            ultimaSesionGlobal.attributes?.start
                ? new Date(
                    ultimaSesionGlobal.attributes.start
                )
                : null;


        finGlobal =
            ultimaSesionGlobal.attributes?.stop
                ? new Date(
                    ultimaSesionGlobal.attributes.stop
                )
                : null;
    }


    // =================================================
    // ESTADO REAL GLOBAL
    // =================================================

    const online =
        Boolean(
            inicioGlobal &&
            !finGlobal
        );


    // =================================================
    // SESIONES DEL SERVIDOR
    // =================================================

    const sesionesServidor =
        obtenerSesionesEnServidor(
            sesiones,
            serverId
        );


    // =================================================
    // TIEMPO TOTAL GLOBAL
    // =================================================

    const segundosTotalPerfil =
        calcularTiempoSesiones(
            sesiones
        );


    // =================================================
    // TIEMPO TOTAL EN ESTE SERVIDOR
    // =================================================

    const segundosTotalServidor =
        calcularTiempoSesiones(
            sesionesServidor
        );


    // =================================================
    // SESIÓN ACTUAL EN EL SERVIDOR
    // =================================================

    let segundosSesionActual =
        0;


    if (
        online &&
        ultimaSesionServidor &&
        !ultimaSesionServidor.attributes?.stop
    ) {

        const inicio =
            ultimaSesionServidor.attributes?.start
                ? new Date(
                    ultimaSesionServidor.attributes.start
                )
                : null;


        if (
            inicio &&
            !isNaN(
                inicio.getTime()
            )
        ) {

            segundosSesionActual =
                Math.max(
                    0,
                    Math.floor(
                        (
                            new Date() -
                            inicio
                        ) / 1000
                    )
                );

        }

    }


    // =================================================
    // PRIMERA CONEXIÓN EN SERVIDOR
    // =================================================

    let primeraConexionServidor =
        null;


    for (
        const sesion
        of sesionesServidor
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
            !primeraConexionServidor ||
            inicio <
            primeraConexionServidor
        ) {

            primeraConexionServidor =
                inicio;
        }

    }


    // =================================================
    // ÚLTIMA CONEXIÓN EN SERVIDOR
    // =================================================

    let ultimaConexionServidor =
        null;


    for (
        const sesion
        of sesionesServidor
    ) {

        const stop =
            sesion.attributes?.stop
                ? new Date(
                    sesion.attributes.stop
                )
                : null;


        if (
            !stop ||
            isNaN(
                stop.getTime()
            )
        ) {

            continue;
        }


        if (
            !ultimaConexionServidor ||
            stop >
            ultimaConexionServidor
        ) {

            ultimaConexionServidor =
                stop;
        }

    }


    // =================================================
    // SI ESTÁ ONLINE
    // =================================================

    if (
        online &&
        ultimaSesionServidor
    ) {

        const inicio =
            ultimaSesionServidor.attributes?.start
                ? new Date(
                    ultimaSesionServidor.attributes.start
                )
                : null;


        if (
            inicio &&
            !isNaN(
                inicio.getTime()
            ) &&
            (
                !ultimaConexionServidor ||
                inicio >
                ultimaConexionServidor
            )
        ) {

            ultimaConexionServidor =
                inicio;
        }

    }


    // =================================================
    // LAST SEEN
    // =================================================

    const lastSeenMinutos =
        calcularMinutosDesde(
            lastSeenServidor
        );


    // =================================================
    // SERVIDORES DEL PERFIL
    // =================================================

    const servidoresPerfil =
        obtenerServidoresDelPerfil(
            jugador
        );


    // =================================================
    // RESULTADO
    // =================================================

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

        // -------------------------------------------------
        // SESIONES EN SERVIDOR
        // -------------------------------------------------

        sesiones:
            sesionesServidor.length,

        sesionesServidor:
            sesionesServidor.length,

        // -------------------------------------------------
        // TIEMPO GLOBAL DEL PERFIL
        // -------------------------------------------------

        timePlayedSeconds:
            segundosTotalPerfil,

        tiempoJugado:
            formatearTiempo(
                segundosTotalPerfil
            ),

        tiempoTotalPerfil:
            formatearTiempo(
                segundosTotalPerfil
            ),

        // -------------------------------------------------
        // TIEMPO TOTAL EN SERVIDOR
        // -------------------------------------------------

        tiempoServidor:
            formatearTiempo(
                segundosTotalServidor
            ),

        tiempoServidorSeconds:
            segundosTotalServidor,

        // -------------------------------------------------
        // SESIÓN ACTUAL
        // -------------------------------------------------

        tiempoSesionActual:
            formatearTiempo(
                segundosSesionActual
            ),

        tiempoSesionActualSeconds:
            segundosSesionActual,

        // -------------------------------------------------
        // ÚLTIMA SESIÓN EN SERVIDOR
        // -------------------------------------------------

        ultimaSesionInicio:
            formatearFechaChile(
                ultimaSesionServidor?.attributes?.start
                    ? new Date(
                        ultimaSesionServidor.attributes.start
                    )
                    : null
            ),

        ultimaSesionFin:
            formatearFechaChile(
                ultimaSesionServidor?.attributes?.stop
                    ? new Date(
                        ultimaSesionServidor.attributes.stop
                    )
                    : null
            ),

        // -------------------------------------------------
        // LAST SEEN
        // -------------------------------------------------

        lastSeen:
            formatearFechaChile(
                lastSeenServidor
            ),

        lastSeenDate:
            lastSeenServidor,

        lastSeenMinutes:
            lastSeenMinutos,

        lastSeenHours:
            lastSeenMinutos !== null
                ? Number(
                    (
                        lastSeenMinutos /
                        60
                    ).toFixed(2)
                )
                : null,

        lastSeenWithinLimit:
            lastSeenMinutos !== null &&
            lastSeenMinutos <=
                MAX_LAST_SEEN_MINUTES,

        maxLastSeenMinutes:
            MAX_LAST_SEEN_MINUTES,

        // -------------------------------------------------
        // CONEXIONES EN SERVIDOR
        // -------------------------------------------------

        primeraConexion:
            formatearFechaChile(
                primeraConexionServidor
            ),

        ultimaConexion:
            formatearFechaChile(
                ultimaConexionServidor
            ),

        // -------------------------------------------------
        // SERVIDORES
        // -------------------------------------------------

        servidoresPerfil:
            servidoresPerfil.map(
                servidor =>
                    servidor.id
            ),

        cantidadServidoresPerfil:
            servidoresPerfil.length,

        // -------------------------------------------------
        // URL
        // -------------------------------------------------

        perfilUrl:
            `https://www.battlemetrics.com/players/${playerId}`,

        historialConfirmado:
            true,

        origen:
            "global+server-last-seen"

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
        // SERVIDOR
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

            return null;
        }


        console.log(
            `👥 BattleMetrics → ${perfiles.length} perfil(es) candidato(s)`
        );


        // =================================================
        // CACHE
        // =================================================

        const servidoresCache =
            new Map();


        servidoresCache.set(
            serverIdString,
            servidor
        );


        const candidatosDescartados =
            [];


        // =================================================
        // REVISAR PERFILES
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
                `👤 Revisando perfil ${playerId} → ${nombrePerfil}`
            );


            // =================================================
            // DETALLE
            // =================================================

            const detalle =
                await obtenerJugador(
                    playerId
                );


            let jugador =
                detalle ||
                perfilBusqueda;


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
            // SESIONES
            // =================================================

            const sesiones =
                await obtenerSesionesJugador(
                    playerId
                );


            if (
                sesiones.length === 0
            ) {

                candidatosDescartados.push({

                    id:
                        playerId,

                    name:
                        nombrePerfil,

                    motivo:
                        "Sin sesiones accesibles"

                });

                continue;
            }


            // =================================================
            // ÚLTIMA SESIÓN SERVIDOR
            // =================================================

            const ultimaSesionServidor =
                obtenerUltimaSesionEnServidor(
                    sesiones,
                    serverIdString
                );


            if (
                !ultimaSesionServidor
            ) {

                candidatosDescartados.push({

                    id:
                        playerId,

                    name:
                        nombrePerfil,

                    motivo:
                        "No tiene sesiones en el servidor configurado"

                });

                continue;
            }


            // =================================================
            // LAST SEEN
            // =================================================

            const lastSeenServidor =
                obtenerLastSeenEnServidor(
                    sesiones,
                    serverIdString
                );


            const lastSeenMinutos =
                calcularMinutosDesde(
                    lastSeenServidor
                );


            console.log(
                `🕐 Last Seen → ${formatearFechaChile(lastSeenServidor)}`
            );


            console.log(
                `⏱️ Hace → ${lastSeenMinutos ?? "?"} minutos`
            );


            // =================================================
            // COMPROBAR LAST SEEN
            // =================================================

            if (
                lastSeenMinutos === null ||
                lastSeenMinutos >
                MAX_LAST_SEEN_MINUTES
            ) {

                candidatosDescartados.push({

                    id:
                        playerId,

                    name:
                        nombrePerfil,

                    lastSeen:
                        lastSeenServidor,

                    lastSeenMinutes:
                        lastSeenMinutos,

                    motivo:
                        lastSeenMinutos === null
                            ? "Last Seen desconocido"
                            : `Last Seen superior a ${MAX_LAST_SEEN_MINUTES} minutos`

                });

                continue;
            }


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
                    servidorActividad,
                    ultimaSesionServidor,
                    lastSeenServidor
                );


            if (
                !resultado
            ) {

                continue;
            }


            // =================================================
            // DATOS FINALES
            // =================================================

            resultado.lastSeen =
                formatearFechaChile(
                    lastSeenServidor
                );


            resultado.lastSeenDate =
                lastSeenServidor;


            resultado.lastSeenMinutes =
                lastSeenMinutos;


            resultado.lastSeenHours =
                Number(
                    (
                        lastSeenMinutos /
                        60
                    ).toFixed(2)
                );


            resultado.lastSeenWithinLimit =
                true;


            resultado.maxLastSeenMinutes =
                MAX_LAST_SEEN_MINUTES;


            resultado.ultimaSesionServerId =
                serverIdString;


            resultado.ultimaSesionServerName =
                servidorActividad?.name ||
                `Servidor ${serverIdString}`;


            resultado.origen =
                "global+server-last-seen";


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
                `   Servidor: ${resultado.serverName}`
            );


            console.log(
                `   Tiempo servidor: ${resultado.tiempoServidor}`
            );


            console.log(
                `   Tiempo total perfil: ${resultado.tiempoTotalPerfil}`
            );


            console.log(
                `   Sesiones servidor: ${resultado.sesionesServidor}`
            );


            console.log(
                `   Sesión actual: ${resultado.tiempoSesionActual}`
            );


            console.log(
                "================================================="
            );


            return {

                ...resultado,

                candidatos:
                    candidatosDescartados

            };

        }


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

    obtenerUltimaSesionEnServidor,

    obtenerLastSeenEnServidor,

    calcularMinutosDesde,

    obtenerServidoresDelPerfil,

    normalizarNombre

};