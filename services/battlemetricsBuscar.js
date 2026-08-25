require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";
const TIMEZONE_CHILE = "America/Santiago";

// Máximo Last Seen permitido cuando está offline.
// 60 = 1 hora.
const MAX_LAST_SEEN_MINUTES = 60;

// Máximo de páginas para /players.
const LIMITE_PAGINAS_BUSQUEDA = 20;

// Máximo de páginas de sesiones.
const LIMITE_PAGINAS_SESIONES = 50;


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
        return String(
            sesion.attributes.serverId
        );
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
// OBTENER METADATA DEL SERVIDOR DESDE EL PERFIL
// =====================================================

function obtenerMetaServidorJugador(
    jugador,
    serverId
) {

    if (
        !jugador ||
        !serverId
    ) {
        return null;
    }

    const serverIdString =
        String(serverId);

    // -------------------------------------------------
    // 1. INCLUDED
    // -------------------------------------------------

    const incluidos =
        jugador._servidoresIncluidos ||
        [];

    const incluido =
        incluidos.find(
            servidor =>
                servidor &&
                String(servidor.id) ===
                serverIdString
        );

    if (incluido) {

        return {
            ...incluido,
            meta:
                incluido.meta ||
                {}
        };
    }

    // -------------------------------------------------
    // 2. RELATIONSHIP
    // -------------------------------------------------

    const relaciones =
        jugador.relationships?.servers?.data;

    if (Array.isArray(relaciones)) {

        const relacion =
            relaciones.find(
                servidor =>
                    servidor &&
                    String(servidor.id) ===
                    serverIdString
            );

        if (relacion) {

            return {
                ...relacion,
                meta:
                    relacion.meta ||
                    {}
            };
        }
    }

    return null;
}


// =====================================================
// OBTENER SERVIDOR
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
// AÑADIR JUGADOR SIN DUPLICADOS
// =====================================================

function agregarJugadorUnico(
    resultados,
    jugador
) {

    if (
        !jugador ||
        !jugador.id
    ) {
        return;
    }

    if (
        jugador.type &&
        jugador.type !== "player"
    ) {
        return;
    }

    const existe =
        resultados.some(
            resultado =>
                String(resultado.id) ===
                String(jugador.id)
        );

    if (!existe) {

        resultados.push(
            jugador
        );
    }
}


// =====================================================
// BUSCAR JUGADORES EN /PLAYERS
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

            const params =
                pagina === 1
                    ? {
                        "filter[search]":
                            terminoBusqueda,

                        "page[size]":
                            100
                    }
                    : undefined;

            if (
                pagina === 1 &&
                serverId
            ) {

                params["filter[servers]"] =
                    String(serverId);

                params.include =
                    "server";
            }

            response =
                await axios.get(
                    nextUrl,
                    {
                        headers:
                            getHeaders(),

                        params,

                        timeout:
                            15000
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
            response.data?.data ||
            [];

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

            nextUrl =
                null;

        } else {

            nextUrl =
                siguiente;
        }

        pagina++;
    }

    console.log(
        `📊 BM /players → "${terminoBusqueda}" → ${resultados.length} perfiles únicos acumulados`
    );

    return resultados;
}


// =====================================================
// OBTENER CANDIDATOS POR NOMBRE
// =====================================================
//
// IMPORTANTE:
//
// Ahora NO usamos únicamente la búsqueda del servidor.
//
// Se hacen:
//
// 1. Búsqueda directa en servidor.
// 2. Búsqueda global.
// 3. Se combinan todos los perfiles.
// 4. Se eliminan duplicados por ID.
//
// Esto permite encontrar:
//
// 123 → perfil A
// 123 → perfil B
// 123 → perfil C
//
// aunque BattleMetrics no entregue todos mediante
// una sola de las consultas.
// =====================================================

async function obtenerCandidatosPorNombre(
    nombre,
    serverId = null
) {

    const candidatos = [];

    const nombreBuscado =
        String(nombre || "").trim();

    if (!nombreBuscado) {
        return candidatos;
    }

    const terminos = [];

    // Nombre completo.
    terminos.push(
        nombreBuscado
    );

    // Partes del nombre.
    const partes =
        nombreBuscado
            .split(/\s+/)
            .map(
                parte =>
                    parte.trim()
            )
            .filter(
                parte =>
                    parte.length >= 2
            );

    for (
        const parte of partes
    ) {

        if (
            !terminos.some(
                termino =>
                    normalizarNombre(
                        termino
                    ) ===
                    normalizarNombre(
                        parte
                    )
            )
        ) {

            terminos.push(
                parte
            );
        }
    }

    // =================================================
    // 1. BÚSQUEDA DIRECTA EN SERVIDOR
    // =================================================

    if (serverId) {

        console.log(
            `🎯 BM → búsqueda directa en servidor ${serverId}`
        );

        for (
            const termino of terminos
        ) {

            const resultados =
                await ejecutarBusquedaJugadores(
                    termino,
                    serverId
                );

            for (
                const jugador of resultados
            ) {

                agregarJugadorUnico(
                    candidatos,
                    jugador
                );
            }
        }
    }

    console.log(
        `🎯 BM → ${candidatos.length} candidato(s) después de búsqueda en servidor`
    );

    // =================================================
    // 2. BÚSQUEDA GLOBAL SIEMPRE
    // =================================================
    //
    // Antes solamente se hacía si la búsqueda de
    // servidor devolvía 0.
    //
    // Eso podía provocar que faltaran perfiles duplicados.
    //
    // Ahora se ejecuta SIEMPRE y se mezclan.
    // =================================================

    console.log(
        `🌎 BM → búsqueda global complementaria para "${nombreBuscado}"`
    );

    for (
        const termino of terminos
    ) {

        const resultados =
            await ejecutarBusquedaJugadores(
                termino
            );

        for (
            const jugador of resultados
        ) {

            agregarJugadorUnico(
                candidatos,
                jugador
            );
        }
    }

    console.log(
        `👥 BM → ${candidatos.length} candidato(s) únicos después de servidor + global`
    );

    return candidatos;
}


// =====================================================
// BUSCAR PERFILES POR NOMBRE
// =====================================================
//
// IMPORTANTE:
// SOLO devuelve coincidencia exacta de nombre.
//
// No se devuelve "1234" cuando se busca "123".
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

        const candidatos =
            await obtenerCandidatosPorNombre(
                nombreBuscado,
                serverId
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
            `🔎 BM → ${resultados.length} perfil(es) con nombre EXACTO "${nombreBuscado}"`
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

                    params: {
                        include:
                            "server"
                    },

                    timeout:
                        10000
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
                        item?.type ===
                        "server"
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
// OBTENER SESIONES DEL JUGADOR
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
                            headers:
                                getHeaders(),

                            timeout:
                                15000
                        }
                    );

            } catch (error) {

                console.error(
                    `❌ Error obteniendo sesiones del jugador ${playerId}:`,
                    error.response?.data ||
                    error.message
                );

                break;
            }

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
// OBTENER ÚLTIMA SESIÓN GLOBAL
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
        !Array.isArray(sesiones) ||
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

                if (!sesionServerId) {
                    return false;
                }

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
// OBTENER LAST SEEN EN SERVIDOR
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
        ultimaSesion.attributes ||
        {};

    if (atributos.stop) {

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

    // Sesión abierta = online.
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
            sesion.attributes ||
            {};

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

    if (
        horas > 0
    ) {

        return `${horas}h ${minutos}m`;
    }

    return `${minutos}m`;
}


// =====================================================
// OBTENER TIMEPLAYED DEL SERVIDOR
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

    const metaServidor =
        obtenerMetaServidorJugador(
            jugador,
            serverId
        );

    if (!metaServidor) {
        return 0;
    }

    return Math.max(
        0,
        Number(
            metaServidor.meta?.timePlayed
        ) || 0
    );
}


// =====================================================
// OBTENER HORAS TOTALES DEL PERFIL
// =====================================================

function obtenerTiempoTotalPerfil(
    jugador,
    sesiones
) {

    let segundosTotalesBM =
        0;

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

        if (
            tiempo > 0
        ) {

            segundosTotalesBM +=
                tiempo;
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
// OBTENER DURACIÓN SESIÓN ACTUAL
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

                if (
                    !start ||
                    stop
                ) {
                    return false;
                }

                const inicio =
                    new Date(start);

                return !isNaN(
                    inicio.getTime()
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
// OBTENER ESTADO REAL DEL SERVIDOR
// =====================================================
//
// Primero intenta usar:
//      server.meta.online
//
// Si no existe, usa las sesiones.
//
// =====================================================

function obtenerEstadoServidorJugador(
    jugador,
    sesiones,
    serverId
) {

    const metaServidor =
        obtenerMetaServidorJugador(
            jugador,
            serverId
        );

    if (
        metaServidor &&
        typeof metaServidor.meta?.online ===
            "boolean"
    ) {

        return Boolean(
            metaServidor.meta.online
        );
    }

    const sesionActual =
        Array.isArray(sesiones)
            ? sesiones.find(
                sesion => {

                    const id =
                        obtenerServerIdDeSesion(
                            sesion
                        );

                    return (
                        String(id) ===
                        String(serverId) &&
                        sesion.attributes?.start &&
                        !sesion.attributes?.stop
                    );
                }
            )
            : null;

    return Boolean(
        sesionActual
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
        jugador.attributes ||
        {};

    const playerId =
        String(
            jugador.id
        );

    const online =
        obtenerEstadoServidorJugador(
            jugador,
            sesiones,
            serverId
        );

    // =================================================
    // SESIÓN ACTUAL
    // =================================================

    let segundosSesionActual =
        obtenerDuracionSesionActual(
            sesiones,
            serverId
        );

    // =================================================
    // TIMEPLAYED DEL SERVIDOR
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
    // TOTAL PERFIL
    // =================================================

    const segundosTotal =
        obtenerTiempoTotalPerfil(
            jugador,
            sesiones
        );

    // =================================================
    // ÚLTIMA SESIÓN GLOBAL
    // =================================================

    const ultimaSesionGlobal =
        obtenerUltimaSesion(
            sesiones
        );

    let inicioGlobal = null;
    let finGlobal = null;

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
    // PRIMERA CONEXIÓN
    // =================================================

    let primeraConexion = null;

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

    let ultimaConexion = null;

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

    if (
        !ultimaConexion &&
        inicioGlobal
    ) {

        ultimaConexion =
            inicioGlobal;
    }

    // =================================================
    // SERVIDORES
    // =================================================

    const servidoresPerfil =
        obtenerServidoresDelPerfil(
            jugador
        );

    // =================================================
    // LAST SEEN
    // =================================================

    const lastSeenMinutos =
        calcularMinutosDesde(
            lastSeenServidor
        );

    const ultimaSesionServidorInicio =
        ultimaSesionServidor?.attributes?.start
            ? new Date(
                ultimaSesionServidor.attributes.start
            )
            : null;

    const ultimaSesionServidorFin =
        ultimaSesionServidor?.attributes?.stop
            ? new Date(
                ultimaSesionServidor.attributes.stop
            )
            : null;

    // =================================================
    // SESIONES DEL SERVIDOR
    // =================================================

    const sesionesServidor =
        sesiones.filter(
            sesion =>
                String(
                    obtenerServerIdDeSesion(
                        sesion
                    )
                ) ===
                String(serverId)
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
            sesionesServidor.length,

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

        tiempoUltimaSesion:
            ultimaSesionServidor
                ? formatearTiempo(
                    Math.max(
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
                )
                : "0m",

        ultimaSesionInicio:
            formatearFechaChile(
                ultimaSesionServidorInicio
            ),

        ultimaSesionFin:
            formatearFechaChile(
                ultimaSesionServidorFin
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
            "server-search+global-search+sessions+server-timeplayed+last-seen"
    };
}


// =====================================================
// BUSCAR JUGADORES HISTÓRICOS
// =====================================================
//
// DEVUELVE TODOS los perfiles válidos.
//
// REGLAS:
//
// 1. Nombre exacto.
// 2. Historial en servidor configurado.
// 3. ONLINE → válido.
// 4. OFFLINE <= 60 min → válido.
// 5. OFFLINE > 60 min → descartado.
//
// Ejemplo:
//
// 123 → online      → DEVOLVER
// 123 → online      → DEVOLVER
// 123 → offline 10m → DEVOLVER
// 123 → offline 45m → DEVOLVER
// 123 → offline 2h  → DESCARTAR
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

        if (!serverId) {
            return null;
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
        // PERFILES
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
                `❌ No se encontraron perfiles con nombre exacto "${nombreBuscado}"`
            );

            return null;
        }

        console.log(
            `👥 Se revisarán ${perfiles.length} perfil(es)`
        );

        const candidatosValidos = [];
        const candidatosDescartados = [];

        // =================================================
        // REVISAR TODOS
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

            // =================================================
            // CONSERVAR RELATIONSHIPS
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
            // SESIONES
            // =================================================

            const sesiones =
                await obtenerSesionesJugador(
                    playerId
                );

            // =================================================
            // ÚLTIMA SESIÓN EN SERVIDOR
            // =================================================

            const ultimaSesionServidor =
                obtenerUltimaSesionEnServidor(
                    sesiones,
                    serverIdString
                );

            // =================================================
            // ESTADO DESDE BM
            // =================================================

            const metaServidor =
                obtenerMetaServidorJugador(
                    jugador,
                    serverIdString
                );

            const onlineMeta =
                metaServidor &&
                typeof metaServidor.meta?.online ===
                    "boolean"
                    ? Boolean(
                        metaServidor.meta.online
                    )
                    : null;

            // =================================================
            // ESTADO DESDE SESIONES
            // =================================================

            const onlineSesion =
                Boolean(
                    sesiones.find(
                        sesion => {

                            const id =
                                obtenerServerIdDeSesion(
                                    sesion
                                );

                            return (
                                String(id) ===
                                serverIdString &&
                                sesion.attributes?.start &&
                                !sesion.attributes?.stop
                            );
                        }
                    )
                );

            const online =
                onlineMeta !== null
                    ? onlineMeta
                    : onlineSesion;

            // =================================================
            // LAST SEEN
            // =================================================

            let lastSeenServidor = null;

            // Primero usamos sesiones.
            if (
                ultimaSesionServidor
            ) {

                const stop =
                    ultimaSesionServidor.attributes?.stop;

                if (stop) {

                    const fechaStop =
                        new Date(stop);

                    if (
                        !isNaN(
                            fechaStop.getTime()
                        )
                    ) {

                        lastSeenServidor =
                            fechaStop;
                    }
                }
            }

            // Si está online, last seen = ahora.
            if (
                online
            ) {

                lastSeenServidor =
                    new Date();
            }

            // =================================================
            // FALLBACK LAST SEEN DE METADATA
            // =================================================

            if (
                !online &&
                !lastSeenServidor
            ) {

                const metaLastSeen =
                    metaServidor?.meta?.lastSeen;

                if (
                    metaLastSeen
                ) {

                    const fecha =
                        new Date(
                            metaLastSeen
                        );

                    if (
                        !isNaN(
                            fecha.getTime()
                        )
                    ) {

                        lastSeenServidor =
                            fecha;
                    }
                }
            }

            const lastSeenMinutos =
                calcularMinutosDesde(
                    lastSeenServidor
                );

            // =================================================
            // DEBE TENER HISTORIAL
            // =================================================

            const tieneHistorial =
                Boolean(
                    ultimaSesionServidor
                ) ||
                Boolean(
                    metaServidor
                );

            if (
                !tieneHistorial
            ) {

                console.log(
                    `❌ ${playerId} → no tiene historial confirmado en ${serverIdString}`
                );

                candidatosDescartados.push({

                    id:
                        playerId,

                    name:
                        nombrePerfil,

                    online:
                        false,

                    lastSeen:
                        null,

                    lastSeenMinutes:
                        null,

                    motivo:
                        "Sin historial en el servidor"
                });

                continue;
            }

            // =================================================
            // VALIDAR ONLINE / OFFLINE
            // =================================================

            if (
                online
            ) {

                console.log(
                    `✅ ${playerId} → ONLINE → VÁLIDO`
                );

            } else if (
                lastSeenMinutos !== null &&
                lastSeenMinutos <=
                    MAX_LAST_SEEN_MINUTES
            ) {

                console.log(
                    `✅ ${playerId} → OFFLINE hace ${lastSeenMinutos} min → VÁLIDO`
                );

            } else {

                console.log(
                    `❌ ${playerId} → OFFLINE hace ${lastSeenMinutos ?? "?"} min → DESCARTADO`
                );

                candidatosDescartados.push({

                    id:
                        playerId,

                    name:
                        nombrePerfil,

                    online:
                        false,

                    lastSeen:
                        lastSeenServidor,

                    lastSeenMinutes:
                        lastSeenMinutos,

                    motivo:
                        `Offline hace más de ${MAX_LAST_SEEN_MINUTES} minutos`
                });

                continue;
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
                    ultimaSesionServidor,
                    lastSeenServidor
                );

            if (!resultado) {
                continue;
            }

            // Forzar valores reales calculados arriba.
            resultado.online =
                online;

            resultado.lastSeenDate =
                lastSeenServidor;

            resultado.lastSeen =
                formatearFechaChile(
                    lastSeenServidor
                );

            resultado.lastSeenMinutes =
                lastSeenMinutos;

            resultado.lastSeenHours =
                lastSeenMinutos !== null
                    ? Number(
                        (
                            lastSeenMinutos /
                            60
                        ).toFixed(2)
                    )
                    : null;

            resultado.lastSeenWithinLimit =
                online ||
                (
                    lastSeenMinutos !== null &&
                    lastSeenMinutos <=
                        MAX_LAST_SEEN_MINUTES
                );

            resultado.maxLastSeenMinutes =
                MAX_LAST_SEEN_MINUTES;

            // =================================================
            // GUARDAR
            // =================================================

            candidatosValidos.push(
                resultado
            );

            console.log(
                `🎯 ${playerId} → AÑADIDO A PERFILES VÁLIDOS`
            );
        }

        // =================================================
        // NINGUNO VÁLIDO
        // =================================================

        if (
            candidatosValidos.length === 0
        ) {

            console.log(
                `❌ Ningún perfil válido para "${nombreBuscado}"`
            );

            return null;
        }

        // =================================================
        // ORDEN
        // =================================================
        //
        // 1. Online primero.
        // 2. Después el Last Seen más reciente.
        //
        // PERO NO SE ELIMINAN LOS DEMÁS.
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
        // INFORMACIÓN DE OTROS
        // =================================================

        const otrosPerfiles =
            candidatosValidos
                .slice(1)
                .map(
                    candidato => ({

                        id:
                            candidato.id,

                        name:
                            candidato.name,

                        online:
                            candidato.online,

                        lastSeen:
                            candidato.lastSeen,

                        lastSeenMinutes:
                            candidato.lastSeenMinutes,

                        perfilUrl:
                            candidato.perfilUrl
                    })
                );

        // =================================================
        // RESULTADO PRINCIPAL
        // =================================================

        const resultadoFinal =
            candidatosValidos[0];

        // =================================================
        // MUY IMPORTANTE
        // =================================================
        //
        // Ahora el resultado contiene TODOS.
        //
        // /buscar utilizará:
        //
        // resultadoFinal.perfilesEncontrados
        //
        // =================================================

        resultadoFinal.perfilesEncontrados =
            candidatosValidos;

        resultadoFinal.perfilesValidos =
            candidatosValidos.length;

        resultadoFinal.perfilesDescartados =
            candidatosDescartados.length;

        resultadoFinal.otrosPerfiles =
            otrosPerfiles;

        resultadoFinal.candidatos = [

            ...otrosPerfiles,

            ...candidatosDescartados
        ];

        resultadoFinal.criterioSeleccion =
            candidatosValidos.length > 1
                ? "todos-los-perfiles-validos"
                : (
                    resultadoFinal.online
                        ? "online"
                        : "last-seen-reciente"
                );

        console.log(
            "================================================="
        );

        console.log(
            `🎯 /BUSCAR → ${candidatosValidos.length} PERFIL(ES) VÁLIDO(S)`
        );

        for (
            const perfil of candidatosValidos
        ) {

            console.log(
                `   ${perfil.online ? "🟢" : "🔴"} ${perfil.name} → ${perfil.id} → ${perfil.lastSeen}`
            );
        }

        console.log(
            "================================================="
        );

        return resultadoFinal;

    } catch (error) {

        console.error(
            "❌ Error buscando jugadores históricos:",
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

    normalizarNombre,

    obtenerTimePlayedServidor,

    obtenerTiempoTotalPerfil,

    obtenerDuracionSesionActual,

    obtenerMetaServidorJugador,

    obtenerEstadoServidorJugador
};