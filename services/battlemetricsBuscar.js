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
// BUSCAR JUGADORES DIRECTAMENTE EN EL SERVIDOR
// =====================================================
//
// ESTA ES LA PARTE IMPORTANTE.
//
// En vez de buscar primero globalmente y después intentar
// descubrir si el jugador pertenece al servidor, buscamos
// directamente:
//
// GET /servers/:serverId/players
//
// Así BattleMetrics hace la asociación servidor/jugador.
// =====================================================

async function buscarJugadoresEnServidor(
    nombre,
    serverId
) {

    try {

        const nombreBuscado =
            String(
                nombre || ""
            ).trim();

        if (
            !nombreBuscado ||
            !serverId
        ) {

            return [];
        }

        const serverIdString =
            String(
                serverId
            );

        console.log(
            `🎯 BM → buscando "${nombreBuscado}" directamente en servidor ${serverIdString}`
        );

        const resultados =
            [];

        let nextUrl =
            `${BM_API}/servers/${serverIdString}/players`;

        let pagina =
            1;

        const limitePaginas =
            10;

        while (
            nextUrl &&
            pagina <= limitePaginas
        ) {

            console.log(
                `📡 BM servidor ${serverIdString} → jugadores página ${pagina}`
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
                `📊 BM servidor ${serverIdString} → ${jugadores.length} jugadores encontrados`
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

                const nombreObjetivo =
                    normalizarNombre(
                        nombreBuscado
                    );

                if (
                    nombreBM !==
                    nombreObjetivo
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
            `🎯 BM servidor ${serverIdString} → ${resultados.length} coincidencia(s) exacta(s) para "${nombreBuscado}"`
        );

        return resultados;

    } catch (error) {

        console.error(
            `❌ Error buscando jugador en servidor ${serverId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// BUSCAR PERFILES GLOBALES POR NOMBRE
// =====================================================
//
// Se mantiene como FALLBACK.
//
// No será el método principal.
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
// OBTENER SERVIDORES RELACIONADOS
// =====================================================
//
// Se mantiene solamente como información auxiliar.
// NO se utiliza para decidir si un jugador tiene
// historial en el servidor.
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
                        include: "server"
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


        const agregarServidor =
            (id, atributos = {}) => {

                if (!id) {
                    return;
                }

                const serverId =
                    String(id);

                if (
                    vistos.has(
                        serverId
                    )
                ) {
                    return;
                }

                vistos.add(
                    serverId
                );

                servidores.push({

                    id:
                        serverId,

                    name:
                        atributos.name ||
                        null,

                    game:
                        atributos.game ||
                        null
                });
            };


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

                agregarServidor(
                    relacion?.id
                );
            }

        } else if (
            relationshipServer?.id
        ) {

            agregarServidor(
                relationshipServer.id
            );
        }


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

            agregarServidor(
                recurso.id,
                recurso.attributes || {}
            );
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
// COMPROBAR SI TIENE SERVIDOR
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
// OBTENER SESIONES DE SERVIDOR
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
// ÚLTIMA SESIÓN
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
// CONSTRUIR RESULTADO DESDE JUGADOR DEL SERVIDOR
// =====================================================

function construirResultadoServidor(
    jugador,
    serverId,
    servidor,
    nombreBuscado
) {

    const atributos =
        jugador.attributes ||
        {};

    const playerId =
        String(
            jugador.id
        );

    /*
     * Dependiendo del endpoint/API, BattleMetrics puede
     * devolver estos datos directamente en attributes.
     */

    const primeraConexionRaw =
        atributos.firstSeen ||
        atributos.firstSeenAt ||
        atributos.first_seen ||
        null;

    const ultimaConexionRaw =
        atributos.lastSeen ||
        atributos.lastSeenAt ||
        atributos.last_seen ||
        null;

    const tiempoJugadoRaw =
        atributos.timePlayed ??
        atributos.timePlayedSeconds ??
        atributos.playTime ??
        atributos.playTimeSeconds ??
        0;

    let tiempoJugadoSeconds =
        Number(
            tiempoJugadoRaw
        ) || 0;

    /*
     * Algunos resultados pueden entregar tiempo en
     * minutos. Si aparece un valor pequeño y existe
     * timePlayed como string, no hacemos conversiones
     * agresivas: solamente usamos segundos si BM
     * realmente lo entrega como número.
     */

    const online =
        Boolean(
            atributos.online === true ||
            atributos.status === "online"
        );

    return {

        id:
            playerId,

        name:
            atributos.name ||
            nombreBuscado,

        serverId:
            String(
                serverId
            ),

        serverName:
            servidor?.name ||
            `Servidor ${serverId}`,

        online,

        sesiones:
            0,

        timePlayedSeconds:
            tiempoJugadoSeconds,

        tiempoJugado:
            formatearTiempo(
                tiempoJugadoSeconds
            ),

        ultimaSesionSegundos:
            0,

        tiempoUltimaSesion:
            "0m",

        primeraConexion:
            formatearFechaChile(
                primeraConexionRaw
            ),

        ultimaConexion:
            formatearFechaChile(
                ultimaConexionRaw
            ),

        ultimaConexionDate:
            ultimaConexionRaw
                ? new Date(
                    ultimaConexionRaw
                )
                : null,

        ultimaSesionInicio:
            "No disponible",

        ultimaSesionFin:
            "No disponible",

        perfilUrl:
            `https://www.battlemetrics.com/players/${playerId}`,

        historialConfirmado:
            true,

        origen:
            "servidor"
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

        const serverIdString =
            String(
                serverId
            );

        const nombreBuscado =
            String(
                nombre
            ).trim();

        console.log(
            `🔎 BM BUSCAR → "${nombreBuscado}" → servidor ${serverIdString}`
        );


        // =================================================
        // OBTENER SERVIDOR
        // =================================================

        const servidor =
            await obtenerServidor(
                serverIdString
            );

        if (
            servidor
        ) {

            console.log(
                `🎮 BM servidor → ${servidor.name} (${servidor.id})`
            );

        } else {

            console.log(
                `⚠️ BM → no se pudo obtener servidor ${serverIdString}`
            );
        }


        // =================================================
        // PASO 1
        // BUSCAR DIRECTAMENTE EN EL SERVIDOR
        // =================================================

        const jugadoresServidor =
            await buscarJugadoresEnServidor(
                nombreBuscado,
                serverIdString
            );


        // =================================================
        // SI ENCONTRAMOS JUGADORES EN EL SERVIDOR
        // =================================================

        if (
            jugadoresServidor.length > 0
        ) {

            console.log(
                `✅ BM → ${jugadoresServidor.length} perfil(es) encontrado(s) DIRECTAMENTE en ${serverIdString}`
            );

            const candidatos =
                [];

            for (
                const jugadorServidor
                of jugadoresServidor
            ) {

                const playerId =
                    String(
                        jugadorServidor.id
                    );

                console.log(
                    `🎯 BM ${playerId} → encontrado directamente en servidor ${serverIdString}`
                );

                /*
                 * Intentamos obtener el perfil completo.
                 * Si falla, utilizamos el resultado del
                 * endpoint del servidor.
                 */

                const detalle =
                    await obtenerJugador(
                        playerId
                    );

                const jugador =
                    detalle ||
                    jugadorServidor;

                /*
                 * Intentamos obtener sesiones únicamente
                 * DESPUÉS de haber confirmado que el jugador
                 * pertenece al servidor.
                 *
                 * Si BM no permite las sesiones, NO
                 * descartamos al jugador.
                 */

                let sesiones =
                    [];

                try {

                    sesiones =
                        await obtenerSesionesServidorJugador(
                            playerId,
                            serverIdString
                        );

                } catch {

                    sesiones =
                        [];
                }


                // =============================================
                // TENEMOS SESIONES
                // =============================================

                if (
                    sesiones.length > 0
                ) {

                    const atributos =
                        jugador.attributes ||
                        {};

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

                    const ultimaSesionAtributos =
                        ultimaSesion?.attributes ||
                        {};

                    const inicio =
                        ultimaSesionAtributos.start
                            ? new Date(
                                ultimaSesionAtributos.start
                            )
                            : null;

                    const fin =
                        ultimaSesionAtributos.stop
                            ? new Date(
                                ultimaSesionAtributos.stop
                            )
                            : null;

                    const online =
                        Boolean(
                            inicio &&
                            !fin
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
                        inicio
                    ) {

                        ultimaConexion =
                            inicio;
                    }

                    const segundos =
                        calcularTiempoSesiones(
                            sesiones
                        );

                    let segundosUltima =
                        0;

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

                        segundosUltima =
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

                    candidatos.push({

                        id:
                            playerId,

                        name:
                            atributos.name ||
                            jugadorServidor.attributes?.name ||
                            nombreBuscado,

                        serverId:
                            serverIdString,

                        serverName:
                            servidor?.name ||
                            `Servidor ${serverIdString}`,

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
                            segundosUltima,

                        tiempoUltimaSesion:
                            formatearTiempo(
                                segundosUltima
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

                        perfilUrl:
                            `https://www.battlemetrics.com/players/${playerId}`,

                        historialConfirmado:
                            true,

                        origen:
                            "servidor+sesiones"
                    });

                    console.log(
                        `✅ BM ${playerId} → historial confirmado con ${sesiones.length} sesión(es)`
                    );

                } else {

                    /*
                     * MUY IMPORTANTE:
                     *
                     * El jugador ya fue encontrado en el
                     * endpoint específico del servidor.
                     *
                     * Por lo tanto NO lo descartamos porque
                     * /relationships/sessions devuelva 0.
                     */

                    candidatos.push(
                        construirResultadoServidor(
                            jugador,
                            serverIdString,
                            servidor,
                            nombreBuscado
                        )
                    );

                    console.log(
                        `✅ BM ${playerId} → jugador confirmado directamente por servidor ${serverIdString}; sesiones no accesibles`
                    );
                }
            }


            // =================================================
            // ORDENAR CANDIDATOS
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
            // SI HAY MÁS DE UNO
            // =================================================

            if (
                candidatos.length > 1
            ) {

                console.log(
                    `⚠️ BM → ${candidatos.length} perfiles exactos encontrados en ${serverIdString}`
                );
            }


            const jugador =
                candidatos[0];

            console.log(
                "✅ JUGADOR ENCONTRADO DIRECTAMENTE EN SERVIDOR",
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

            return {

                ...jugador,

                candidatos:
                    candidatos.length > 1
                        ? candidatos
                        : []
            };
        }


        // =================================================
        // PASO 2
        // FALLBACK GLOBAL
        // =================================================

        console.log(
            `⚠️ BM → no hubo coincidencia directa en servidor ${serverIdString}; usando búsqueda global como fallback`
        );

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


        // =================================================
        // FALLBACK:
        // SOLO USAMOS SESIONES SI EXISTEN
        // =================================================

        const candidatos =
            [];

        for (
            const jugador
            of perfiles
        ) {

            const playerId =
                String(
                    jugador.id
                );

            console.log(
                `🔎 Fallback BM ${playerId} → servidor ${serverIdString}`
            );

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

            const sesiones =
                await obtenerSesionesServidorJugador(
                    playerId,
                    serverIdString
                );

            if (
                sesiones.length === 0
            ) {

                console.log(
                    `⛔ BM ${playerId} → sin sesiones accesibles en ${serverIdString}`
                );

                continue;
            }

            const ultimaSesion =
                obtenerUltimaSesion(
                    sesiones
                );

            if (
                !ultimaSesion
            ) {
                continue;
            }

            const ultimaAtributos =
                ultimaSesion.attributes ||
                {};

            const inicio =
                ultimaAtributos.start
                    ? new Date(
                        ultimaAtributos.start
                    )
                    : null;

            const fin =
                ultimaAtributos.stop
                    ? new Date(
                        ultimaAtributos.stop
                    )
                    : null;

            const online =
                Boolean(
                    inicio &&
                    !fin
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

            const segundos =
                calcularTiempoSesiones(
                    sesiones
                );

            candidatos.push({

                id:
                    playerId,

                name:
                    atributos.name ||
                    jugador.attributes?.name ||
                    nombreBuscado,

                serverId:
                    serverIdString,

                serverName:
                    servidor?.name ||
                    `Servidor ${serverIdString}`,

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
                    0,

                tiempoUltimaSesion:
                    "0m",

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

                perfilUrl:
                    `https://www.battlemetrics.com/players/${playerId}`,

                historialConfirmado:
                    true,

                origen:
                    "global+sesiones"
            });
        }


        // =================================================
        // NINGÚN PERFIL
        // =================================================

        if (
            candidatos.length === 0
        ) {

            console.log(
                `❌ "${nombreBuscado}" → ningún perfil pudo vincularse al servidor ${serverIdString}`
            );

            return null;
        }


        // =================================================
        // ORDEN
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

    buscarJugadoresEnServidor,

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