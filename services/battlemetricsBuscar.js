require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";
const TIMEZONE_CHILE = "America/Santiago";

const MAX_LAST_SEEN_MINUTES = 60;

// Páginas máximas para obtener todos los perfiles
const LIMITE_PAGINAS_BUSQUEDA = 20;

// Páginas máximas de sesiones por jugador
const LIMITE_PAGINAS_SESIONES = 50;


// =====================================================
// HEADERS
// =====================================================

function getHeaders() {

    const token = process.env.BATTLEMETRICS_TOKEN;

    if (token) {

        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        };

    }

    return {
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

        if (isNaN(fechaReal.getTime())) {
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
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {

    return String(nombre || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}


// =====================================================
// OBTENER SERVER ID DE UNA SESIÓN
// =====================================================

function obtenerServerIdDeSesion(sesion) {

    if (!sesion) {
        return null;
    }

    const relationship =
        sesion.relationships?.server?.data;

    if (relationship?.id) {
        return String(relationship.id);
    }

    if (sesion.attributes?.serverId) {
        return String(sesion.attributes.serverId);
    }

    return null;
}


// =====================================================
// OBTENER SERVIDORES DEL PERFIL
// =====================================================

function obtenerServidoresDelPerfil(jugador) {

    if (!jugador) {
        return [];
    }

    const servidores =
        jugador.relationships?.servers?.data;

    if (!Array.isArray(servidores)) {
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
                id: String(servidor.id),
                type: servidor.type || "server",
                meta: servidor.meta || {}
            })
        );
}


// =====================================================
// OBTENER INFORMACIÓN DEL SERVIDOR
// =====================================================

async function obtenerServidor(serverId) {

    try {

        if (!serverId) {
            return null;
        }

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers: getHeaders(),
                    timeout: 10000
                }
            );

        const servidor =
            response.data?.data;

        if (!servidor) {
            return null;
        }

        return {

            id:
                String(servidor.id),

            name:
                servidor.attributes?.name ||
                `Servidor ${serverId}`,

            game:
                servidor.attributes?.game ||
                null,

            players:
                servidor.attributes?.players ?? null,

            maxPlayers:
                servidor.attributes?.maxPlayers ?? null

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
// AÑADIR PERFIL SIN DUPLICAR POR ID
// =====================================================

function agregarJugadorUnico(
    resultados,
    jugador
) {

    if (!jugador || !jugador.id) {
        return;
    }

    if (
        jugador.type &&
        jugador.type !== "player"
    ) {
        return;
    }

    const id =
        String(jugador.id);

    const existe =
        resultados.some(
            resultado =>
                String(resultado.id) === id
        );

    if (!existe) {
        resultados.push(jugador);
    }
}


// =====================================================
// BUSCAR EN /PLAYERS
// =====================================================

async function ejecutarBusquedaJugadores(
    termino,
    serverId = null
) {

    const resultados = [];

    if (
        !termino ||
        !String(termino).trim()
    ) {
        return resultados;
    }

    const terminoBusqueda =
        String(termino).trim();

    let nextUrl =
        `${BM_API}/players`;

    let pagina = 1;

    while (
        nextUrl &&
        pagina <= LIMITE_PAGINAS_BUSQUEDA
    ) {

        console.log(
            `📄 BM /players → "${terminoBusqueda}" → página ${pagina}` +
            (
                serverId
                    ? ` → servidor ${serverId}`
                    : " → GLOBAL"
            )
        );

        let response;

        try {

            const params = {

                "filter[search]":
                    terminoBusqueda,

                "page[size]":
                    100

            };

            /*
             * IMPORTANTE:
             *
             * No dependemos de filter[servers]
             * para decidir quién pertenece al servidor.
             *
             * La comprobación definitiva se hace
             * posteriormente mediante las sesiones.
             */

            response =
                await axios.get(
                    nextUrl,
                    {
                        headers: getHeaders(),
                        params:
                            pagina === 1
                                ? params
                                : undefined,
                        timeout: 15000
                    }
                );

        } catch (error) {

            console.error(
                `❌ Error buscando "${terminoBusqueda}" en BM:`,
                error.response?.data ||
                error.message
            );

            break;
        }

        const jugadores =
            response.data?.data || [];

        console.log(
            `📊 BM /players → ${jugadores.length} perfiles recibidos`
        );

        for (
            const jugador of jugadores
        ) {

            agregarJugadorUnico(
                resultados,
                jugador
            );

        }

        const siguiente =
            response.data?.links?.next;

        if (!siguiente) {

            nextUrl = null;

        } else {

            nextUrl = siguiente;

        }

        pagina++;
    }

    console.log(
        `📊 BM /players → "${terminoBusqueda}" → ${resultados.length} perfiles únicos`
    );

    return resultados;
}


// =====================================================
// OBTENER CANDIDATOS POR NOMBRE
// =====================================================
//
// Se hace búsqueda global.
// NO filtramos aquí por servidor.
//
// Esto es intencional:
//
// Puede existir:
//
// 123 → perfil A
// 123 → perfil B
//
// y uno de ellos puede no aparecer mediante
// filter[servers], aunque sí tenga sesiones históricas.
//
// La comprobación definitiva se hace después.
// =====================================================

async function obtenerCandidatosPorNombre(
    nombre
) {

    const candidatos = [];

    const nombreBuscado =
        String(nombre || "").trim();

    if (!nombreBuscado) {
        return candidatos;
    }

    console.log(
        `🌎 BM → búsqueda GLOBAL para "${nombreBuscado}"`
    );

    const resultados =
        await ejecutarBusquedaJugadores(
            nombreBuscado
        );

    for (
        const jugador of resultados
    ) {

        agregarJugadorUnico(
            candidatos,
            jugador
        );

    }

    console.log(
        `👥 BM → ${candidatos.length} candidato(s) globales`
    );

    return candidatos;
}


// =====================================================
// BUSCAR PERFILES POR NOMBRE EXACTO
// =====================================================

async function buscarPerfilesPorNombre(
    nombre,
    serverId = null
) {

    try {

        const nombreBuscado =
            String(nombre || "").trim();

        if (!nombreBuscado) {
            return [];
        }

        const nombreNormalizado =
            normalizarNombre(
                nombreBuscado
            );

        console.log(
            `🔎 BM → buscando TODOS los perfiles con nombre exacto "${nombreBuscado}"`
        );

        const candidatos =
            await obtenerCandidatosPorNombre(
                nombreBuscado
            );

        console.log(
            `👥 BM → ${candidatos.length} candidato(s) antes del filtro exacto`
        );

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
            `🎯 BM → ${resultados.length} perfil(es) EXACTOS encontrados`
        );

        for (
            const perfil of resultados
        ) {

            console.log(
                `   👤 ${perfil.attributes?.name || "Desconocido"} → ${perfil.id}`
            );

        }

        return resultados;

    } catch (error) {

        console.error(
            "❌ Error buscando perfiles:",
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
                    headers: getHeaders(),

                    params: {
                        include: "server"
                    },

                    timeout: 10000
                }
            );

        const jugador =
            response.data?.data ||
            null;

        if (!jugador) {
            return null;
        }

        jugador._servidoresIncluidos =
            response.data?.included
                ?.filter(
                    item =>
                        item?.type === "server"
                ) ||
            [];

        return jugador;

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
// OBTENER SESIONES
// =====================================================

async function obtenerSesionesJugador(
    playerId
) {

    try {

        const sesiones = [];

        let nextUrl =
            `${BM_API}/players/${playerId}/relationships/sessions?page[size]=100`;

        let pagina = 1;

        while (
            nextUrl &&
            pagina <= LIMITE_PAGINAS_SESIONES
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
                            headers: getHeaders(),
                            timeout: 15000
                        }
                    );

            } catch (error) {

                console.error(
                    `❌ Error obteniendo sesiones ${playerId}:`,
                    error.response?.data ||
                    error.message
                );

                break;
            }

            const data =
                response.data?.data || [];

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
            `❌ Error obteniendo sesiones ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// ÚLTIMA SESIÓN GLOBAL
// =====================================================

function obtenerUltimaSesion(
    sesiones
) {

    if (
        !Array.isArray(sesiones) ||
        sesiones.length === 0
    ) {
        return null;
    }

    const validas =
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
        validas.length === 0
    ) {
        return null;
    }

    return (
        [...validas].sort(
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
// ÚLTIMA SESIÓN EN SERVIDOR
// =====================================================

function obtenerUltimaSesionEnServidor(
    sesiones,
    serverId
) {

    if (
        !Array.isArray(sesiones) ||
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
                    String(sesionServerId) !==
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

    return (
        [...sesionesServidor].sort(
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
// LAST SEEN EN SERVIDOR
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

    if (!ultimaSesion) {
        return null;
    }

    const atributos =
        ultimaSesion.attributes || {};

    /*
     * Si no tiene stop significa que sigue online.
     * Para poder mostrar un Last Seen coherente usamos
     * la hora actual.
     */

    if (!atributos.stop) {
        return new Date();
    }

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


// =====================================================
// MINUTOS DESDE
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

    return Math.max(
        0,
        Math.floor(
            (
                Date.now() -
                fechaReal.getTime()
            ) / 60000
        )
    );
}


// =====================================================
// CALCULAR TIEMPO DE SESIONES
// =====================================================

function calcularTiempoSesiones(
    sesiones,
    serverId = null
) {

    let segundos = 0;

    const ahora =
        new Date();

    for (
        const sesion of sesiones || []
    ) {

        if (
            serverId &&
            String(
                obtenerServerIdDeSesion(
                    sesion
                )
            ) !==
            String(serverId)
        ) {
            continue;
        }

        const atributos =
            sesion.attributes || {};

        if (!atributos.start) {
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

        if (atributos.stop) {

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
                        fin.getTime() -
                        inicio.getTime()
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
        Number(segundos) || 0;

    const horas =
        Math.floor(
            segundos / 3600
        );

    const minutos =
        Math.floor(
            (segundos % 3600) / 60
        );

    if (horas > 0) {
        return `${horas}h ${minutos}m`;
    }

    return `${minutos}m`;
}


// =====================================================
// TIME PLAYED SERVIDOR
// =====================================================

function obtenerTimePlayedServidor(
    jugador,
    serverId
) {

    if (
        !jugador ||
        !serverId
    ) {
        return 0;
    }

    const serverIdString =
        String(serverId);

    const servidores =
        jugador._servidoresIncluidos ||
        [];

    const servidor =
        servidores.find(
            item =>
                String(item.id) ===
                serverIdString
        );

    if (!servidor) {
        return 0;
    }

    return Math.max(
        0,
        Number(
            servidor.meta?.timePlayed
        ) || 0
    );
}


// =====================================================
// TIEMPO TOTAL PERFIL
// =====================================================

function obtenerTiempoTotalPerfil(
    jugador,
    sesiones
) {

    let segundosTotalesBM = 0;

    const servidores =
        jugador?._servidoresIncluidos ||
        [];

    for (
        const servidor of servidores
    ) {

        const tiempo =
            Number(
                servidor.meta?.timePlayed
            ) || 0;

        if (tiempo > 0) {
            segundosTotalesBM += tiempo;
        }
    }

    const segundosSesiones =
        calcularTiempoSesiones(
            sesiones
        );

    return Math.max(
        segundosTotalesBM,
        segundosSesiones
    );
}


// =====================================================
// DURACIÓN SESIÓN ACTUAL
// =====================================================

function obtenerDuracionSesionActual(
    sesiones,
    serverId
) {

    if (
        !Array.isArray(sesiones) ||
        !serverId
    ) {
        return 0;
    }

    const serverIdString =
        String(serverId);

    const sesionesAbiertas =
        sesiones.filter(
            sesion => {

                const sesionServerId =
                    obtenerServerIdDeSesion(
                        sesion
                    );

                if (
                    String(sesionServerId) !==
                    serverIdString
                ) {
                    return false;
                }

                const start =
                    sesion.attributes?.start;

                const stop =
                    sesion.attributes?.stop;

                return Boolean(
                    start &&
                    !stop
                );

            }
        );

    if (
        sesionesAbiertas.length === 0
    ) {
        return 0;
    }

    const sesionActual =
        [...sesionesAbiertas].sort(
            (a, b) =>
                new Date(
                    b.attributes.start
                ).getTime() -
                new Date(
                    a.attributes.start
                ).getTime()
        )[0];

    const inicio =
        new Date(
            sesionActual.attributes.start
        );

    return Math.max(
        0,
        Math.floor(
            (
                Date.now() -
                inicio.getTime()
            ) / 1000
        )
    );
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
        jugador.attributes || {};

    const playerId =
        String(jugador.id);

    const ultimaSesionGlobal =
        obtenerUltimaSesion(
            sesiones
        );

    let primeraConexion = null;
    let ultimaConexion = null;

    // =================================================
    // PRIMERA CONEXIÓN
    // =================================================

    for (
        const sesion of sesiones
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
            inicio < primeraConexion
        ) {

            primeraConexion =
                inicio;

        }
    }


    // =================================================
    // ÚLTIMA CONEXIÓN
    // =================================================

    for (
        const sesion of sesiones
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
            !ultimaConexion ||
            stop > ultimaConexion
        ) {

            ultimaConexion =
                stop;

        }
    }


    // =================================================
    // SI ESTÁ ONLINE
    // =================================================

    const online =
        Boolean(
            ultimaSesionServidor &&
            !ultimaSesionServidor.attributes?.stop
        );


    // =================================================
    // SESIÓN ACTUAL
    // =================================================

    const segundosSesionActual =
        obtenerDuracionSesionActual(
            sesiones,
            serverId
        );


    // =================================================
    // TIEMPO EN SERVIDOR
    // =================================================

    let segundosServidor =
        obtenerTimePlayedServidor(
            jugador,
            serverId
        );

    let origenTiempoServidor =
        "battlemetrics.meta.timePlayed";

    if (
        segundosServidor <= 0
    ) {

        segundosServidor =
            calcularTiempoSesiones(
                sesiones,
                serverId
            );

        origenTiempoServidor =
            "sessions.fallback";

    }


    // =================================================
    // TIEMPO TOTAL BM
    // =================================================

    const segundosTotal =
        obtenerTiempoTotalPerfil(
            jugador,
            sesiones
        );


    // =================================================
    // LAST SEEN
    // =================================================

    const lastSeenMinutos =
        calcularMinutosDesde(
            lastSeenServidor
        );


    // =================================================
    // SERVIDORES
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
            String(serverId),

        serverName:
            servidorConfigurado?.name ||
            `Servidor ${serverId}`,

        online,

        sesiones:
            sesiones.length,

        sesionesServidor:
            sesiones.filter(
                sesion =>
                    String(
                        obtenerServerIdDeSesion(
                            sesion
                        )
                    ) ===
                    String(serverId)
            ).length,

        sesionActualSegundos:
            segundosSesionActual,

        tiempoSesionActual:
            formatearTiempo(
                segundosSesionActual
            ),

        tiempoOnline:
            formatearTiempo(
                segundosSesionActual
            ),

        tiempoOnlineSegundos:
            segundosSesionActual,

        timePlayedSeconds:
            segundosTotal,

        tiempoJugado:
            formatearTiempo(
                segundosTotal
            ),

        horasTotales:
            Number(
                (
                    segundosTotal /
                    3600
                ).toFixed(2)
            ),

        horasTotalesBM:
            Math.floor(
                segundosTotal /
                3600
            ),

        timePlayedServerSeconds:
            segundosServidor,

        tiempoServidor:
            formatearTiempo(
                segundosServidor
            ),

        horasServidor:
            Number(
                (
                    segundosServidor /
                    3600
                ).toFixed(2)
            ),

        horasServidorBM:
            Math.floor(
                segundosServidor /
                3600
            ),

        origenTiempoServidor,

        ultimaSesionSegundos:
            ultimaSesionServidor
                ? Math.max(
                    0,
                    Math.floor(
                        (
                            (
                                ultimaSesionServidor.attributes?.stop
                                    ? new Date(
                                        ultimaSesionServidor.attributes.stop
                                    )
                                    : new Date()
                            ).getTime() -
                            new Date(
                                ultimaSesionServidor.attributes.start
                            ).getTime()
                        ) / 1000
                    )
                )
                : 0,

        ultimaSesionInicio:
            formatearFechaChile(
                ultimaSesionServidor?.attributes?.start
            ),

        ultimaSesionFin:
            formatearFechaChile(
                ultimaSesionServidor?.attributes?.stop
            ),

        ultimaSesionServerId:
            String(serverId),

        ultimaSesionServerName:
            servidorConfigurado?.name ||
            `Servidor ${serverId}`,

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
            online ||
            (
                lastSeenMinutos !== null &&
                lastSeenMinutos <=
                    MAX_LAST_SEEN_MINUTES
            ),

        maxLastSeenMinutes:
            MAX_LAST_SEEN_MINUTES,

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
            "global-search+exact-name+sessions+last-seen"

    };
}


// =====================================================
// BUSCAR TODOS LOS JUGADORES HISTÓRICOS
// =====================================================
//
// DEVUELVE TODOS los perfiles que:
//
// 1. Tienen nombre exacto.
// 2. Tienen historial real en el servidor.
// 3. Están ONLINE.
//
// O:
//
// 4. Están OFFLINE hace <= 60 minutos.
//
// IMPORTANTE:
// NO devuelve solamente el primero.
// =====================================================

async function buscarJugadoresHistoricos(
    nombre,
    serverId
) {

    try {

        if (
            !nombre ||
            !String(nombre).trim()
        ) {
            return [];
        }

        if (!serverId) {
            return [];
        }

        const serverIdString =
            String(serverId);

        const nombreBuscado =
            String(nombre).trim();

        console.log(
            "================================================="
        );

        console.log(
            `🔎 /BUSCAR → "${nombreBuscado}"`
        );

        console.log(
            `🎯 Servidor → ${serverIdString}`
        );

        console.log(
            `⏱️ Last Seen máximo → ${MAX_LAST_SEEN_MINUTES} minutos`
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


        // =================================================
        // TODOS LOS PERFILES EXACTOS
        // =================================================

        const perfiles =
            await buscarPerfilesPorNombre(
                nombreBuscado,
                serverIdString
            );

        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ No hay perfiles exactos para "${nombreBuscado}"`
            );

            return [];
        }


        console.log(
            `👥 Se revisarán ${perfiles.length} perfiles EXACTOS`
        );


        const candidatosValidos = [];


        // =================================================
        // REVISAR CADA PERFIL
        // =================================================

        for (
            let indice = 0;
            indice < perfiles.length;
            indice++
        ) {

            const perfil =
                perfiles[indice];

            const playerId =
                String(
                    perfil.id
                );

            console.log(
                "-------------------------------------------------"
            );

            console.log(
                `👤 PERFIL ${indice + 1}/${perfiles.length}`
            );

            console.log(
                `   Nombre: ${perfil.attributes?.name}`
            );

            console.log(
                `   ID: ${playerId}`
            );


            // =================================================
            // DETALLE
            // =================================================

            const detalle =
                await obtenerJugador(
                    playerId
                );

            const jugador =
                detalle ||
                perfil;


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

                console.log(
                    `⚠️ ${playerId} → no tiene sesiones accesibles`
                );

                continue;
            }


            // =================================================
            // ÚLTIMA SESIÓN EN SERVIDOR
            // =================================================

            const ultimaSesionServidor =
                obtenerUltimaSesionEnServidor(
                    sesiones,
                    serverIdString
                );


            // =================================================
            // SIN HISTORIAL EN SERVIDOR
            // =================================================

            if (
                !ultimaSesionServidor
            ) {

                console.log(
                    `❌ ${playerId} → SIN historial en servidor ${serverIdString}`
                );

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


            // =================================================
            // ONLINE
            // =================================================

            const online =
                Boolean(
                    !ultimaSesionServidor.attributes?.stop
                );


            console.log(
                `🎮 ${playerId} → ${online ? "ONLINE" : "OFFLINE"}`
            );

            console.log(
                `🕐 Last Seen → ${formatearFechaChile(lastSeenServidor)}`
            );

            console.log(
                `⏱️ Last Seen → ${lastSeenMinutos} min`
            );


            // =================================================
            // FILTRO 60 MINUTOS
            // =================================================

            if (
                !online &&
                (
                    lastSeenMinutos === null ||
                    lastSeenMinutos >
                        MAX_LAST_SEEN_MINUTES
                )
            ) {

                console.log(
                    `❌ ${playerId} → OFFLINE > ${MAX_LAST_SEEN_MINUTES} min`
                );

                continue;
            }


            // =================================================
            // PERFIL VÁLIDO
            // =================================================

            console.log(
                `✅ ${playerId} → PERFIL VÁLIDO`
            );


            // =================================================
            // CONSTRUIR RESULTADO
            // =================================================

            const resultado =
                await construirResultadoJugador(
                    jugador,
                    sesiones,
                    serverIdString,
                    servidor,
                    ultimaSesionServidor,
                    lastSeenServidor
                );

            if (!resultado) {
                continue;
            }


            // =================================================
            // GARANTIZAR DATOS
            // =================================================

            resultado.lastSeenDate =
                lastSeenServidor;

            resultado.lastSeenMinutes =
                lastSeenMinutos;

            resultado.lastSeenWithinLimit =
                online ||
                (
                    lastSeenMinutos !== null &&
                    lastSeenMinutos <=
                        MAX_LAST_SEEN_MINUTES
                );

            resultado.perfilUrl =
                `https://www.battlemetrics.com/players/${playerId}`;


            // =================================================
            // EVITAR DUPLICADO FINAL
            // =================================================

            const yaExiste =
                candidatosValidos.some(
                    candidato =>
                        String(candidato.id) ===
                        playerId
                );

            if (!yaExiste) {

                candidatosValidos.push(
                    resultado
                );

            }

        }


        // =================================================
        // ORDEN
        // =================================================
        //
        // ONLINE primero.
        //
        // Después OFFLINE más reciente.
        // =================================================

        candidatosValidos.sort(
            (a, b) => {

                if (
                    Boolean(a.online) !==
                    Boolean(b.online)
                ) {

                    return a.online
                        ? -1
                        : 1;
                }

                const fechaA =
                    a.lastSeenDate
                        ? new Date(
                            a.lastSeenDate
                        ).getTime()
                        : 0;

                const fechaB =
                    b.lastSeenDate
                        ? new Date(
                            b.lastSeenDate
                        ).getTime()
                        : 0;

                return fechaB - fechaA;

            }
        );


        // =================================================
        // LOG FINAL
        // =================================================

        console.log(
            "================================================="
        );

        console.log(
            `🎯 /BUSCAR → ${candidatosValidos.length} PERFIL(ES) VÁLIDO(S)`
        );

        for (
            const candidato of candidatosValidos
        ) {

            console.log(
                `   👤 ${candidato.name}` +
                ` → ${candidato.id}` +
                ` → ${candidato.online ? "ONLINE" : "OFFLINE"}` +
                ` → ${candidato.lastSeenMinutes ?? "?"} min`
            );

        }

        console.log(
            "================================================="
        );


        return candidatosValidos;

    } catch (error) {

        console.error(
            "❌ Error buscando jugadores históricos:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// COMPATIBILIDAD ANTIGUA
// =====================================================

async function buscarJugadorHistorico(
    nombre,
    serverId
) {

    const resultados =
        await buscarJugadoresHistoricos(
            nombre,
            serverId
        );

    return resultados.length > 0
        ? resultados[0]
        : null;
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

    buscarJugadoresHistoricos,

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

    normalizarNombre,

    obtenerTimePlayedServidor,

    obtenerTiempoTotalPerfil,

    obtenerDuracionSesionActual

};