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

    const token = process.env.BATTLEMETRICS_TOKEN;

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
            id: String(servidor.id),

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
// BUSCAR PERFILES GLOBALES POR NOMBRE
// =====================================================

async function ejecutarBusquedaJugadores(termino) {

    const resultados = [];

    let nextUrl = `${BM_API}/players`;
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
                        headers: getHeaders(),

                        params:
                            pagina === 1
                                ? {
                                    "filter[search]": termino,
                                    "page[size]": 100
                                }
                                : undefined,

                        timeout: 15000
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
            response.data?.data || [];

        console.log(
            `📊 BM /players → ${jugadores.length} perfiles recibidos`
        );

        for (const jugador of jugadores) {

            if (jugador?.type !== "player") {
                continue;
            }

            const existe =
                resultados.some(
                    resultado =>
                        String(resultado.id) ===
                        String(jugador.id)
                );

            if (!existe) {
                resultados.push(jugador);
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
// BUSCAR JUGADORES DIRECTAMENTE EN EL SERVIDOR
// =====================================================
//
// ESTA ES LA PARTE IMPORTANTE.
//
// BattleMetrics puede no devolver determinados perfiles
// mediante /players aunque el perfil SÍ tenga historial
// en el servidor.
//
// Por eso buscamos directamente:
//
// /servers/{serverId}/players
//
// =====================================================

async function ejecutarBusquedaJugadoresServidor(
    serverId,
    termino
) {

    const resultados = [];

    if (!serverId || !termino) {
        return resultados;
    }

    let nextUrl =
        `${BM_API}/servers/${serverId}/players`;

    let pagina = 1;

    const limitePaginas = 20;

    while (
        nextUrl &&
        pagina <= limitePaginas
    ) {

        console.log(
            `📡 BM /servers/${serverId}/players → "${termino}" → página ${pagina}`
        );

        let response;

        try {

            response =
                await axios.get(
                    nextUrl,
                    {
                        headers: getHeaders(),

                        params:
                            pagina === 1
                                ? {
                                    "filter[search]": termino,
                                    "page[size]": 100
                                }
                                : undefined,

                        timeout: 15000
                    }
                );

        } catch (error) {

            console.error(
                `❌ Error buscando jugadores del servidor ${serverId}:`,
                error.response?.data ||
                error.message
            );

            break;
        }

        const jugadores =
            response.data?.data || [];

        console.log(
            `📊 BM servidor ${serverId} → ${jugadores.length} perfiles recibidos`
        );

        for (const jugador of jugadores) {

            if (!jugador) {
                continue;
            }

            const existe =
                resultados.some(
                    resultado =>
                        String(resultado.id) ===
                        String(jugador.id)
                );

            if (!existe) {
                resultados.push(jugador);
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
//
// Ahora recibe opcionalmente serverId.
//
// Primero busca directamente en el servidor.
// Después usa la búsqueda global como respaldo.
//
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
            normalizarNombre(nombreBuscado);

        const candidatos = [];


        // =================================================
        // 1. BÚSQUEDA DIRECTA EN EL SERVIDOR
        // =================================================

        if (serverId) {

            console.log(
                `🎯 BM → buscando directamente en servidor ${serverId}`
            );

            const encontradosServidor =
                await ejecutarBusquedaJugadoresServidor(
                    serverId,
                    nombreBuscado
                );

            for (const jugador of encontradosServidor) {

                const existe =
                    candidatos.some(
                        resultado =>
                            String(resultado.id) ===
                            String(jugador.id)
                    );

                if (!existe) {
                    candidatos.push(jugador);
                }
            }

            console.log(
                `📊 BM servidor → ${encontradosServidor.length} perfil(es) recibidos`
            );
        }


        // =================================================
        // 2. BÚSQUEDA GLOBAL
        // =================================================

        console.log(
            `🌎 BM → buscando perfiles globales para "${nombreBuscado}"`
        );

        const encontradosGlobal =
            await ejecutarBusquedaJugadores(
                nombreBuscado
            );

        for (const jugador of encontradosGlobal) {

            const existe =
                candidatos.some(
                    resultado =>
                        String(resultado.id) ===
                        String(jugador.id)
                );

            if (!existe) {
                candidatos.push(jugador);
            }
        }


        // =================================================
        // 3. BÚSQUEDA ALTERNATIVA
        // =================================================

        if (candidatos.length === 0) {

            console.log(
                `🔎 BM → no hubo coincidencia inicial, iniciando búsqueda alternativa`
            );

            const partes =
                nombreBuscado
                    .split(/\s+/)
                    .filter(
                        parte =>
                            parte.length >= 2
                    );

            for (const parte of partes) {

                console.log(
                    `🔎 BM → búsqueda alternativa por "${parte}"`
                );


                // -----------------------------------------
                // Servidor
                // -----------------------------------------

                if (serverId) {

                    const resultadosServidor =
                        await ejecutarBusquedaJugadoresServidor(
                            serverId,
                            parte
                        );

                    for (const jugador of resultadosServidor) {

                        const existe =
                            candidatos.some(
                                resultado =>
                                    String(resultado.id) ===
                                    String(jugador.id)
                            );

                        if (!existe) {
                            candidatos.push(jugador);
                        }
                    }
                }


                // -----------------------------------------
                // Global
                // -----------------------------------------

                const resultadosParte =
                    await ejecutarBusquedaJugadores(
                        parte
                    );

                for (const jugador of resultadosParte) {

                    const existe =
                        candidatos.some(
                            resultado =>
                                String(resultado.id) ===
                                String(jugador.id)
                        );

                    if (!existe) {
                        candidatos.push(jugador);
                    }
                }
            }
        }


        // =================================================
        // 4. FILTRAR NOMBRE EXACTO
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

        for (const perfil of resultados) {

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

async function obtenerJugador(playerId) {

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
// OBTENER SESIONES DEL JUGADOR
// =====================================================

async function obtenerSesionesJugador(playerId) {

    try {

        const sesiones = [];

        let nextUrl =
            `${BM_API}/players/${playerId}/relationships/sessions?page[size]=100`;

        let pagina = 1;

        const limitePaginas = 50;

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
                        headers: getHeaders(),
                        timeout: 15000
                    }
                );

            const data =
                response.data?.data || [];

            console.log(
                `📊 BM ${playerId} → página ${pagina}: ${data.length} sesiones`
            );

            if (data.length === 0) {
                break;
            }

            sesiones.push(...data);

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

function obtenerUltimaSesion(sesiones) {

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

                return !isNaN(fecha.getTime());
            }
        );

    if (sesionesValidas.length === 0) {
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

                return !isNaN(fecha.getTime());
            }
        );

    if (sesionesServidor.length === 0) {
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

    if (!ultimaSesion) {
        return null;
    }

    const atributos =
        ultimaSesion.attributes || {};

    if (atributos.stop) {

        const fechaStop =
            new Date(atributos.stop);

        if (isNaN(fechaStop.getTime())) {
            return null;
        }

        return fechaStop;
    }

    return new Date();
}


// =====================================================
// CALCULAR MINUTOS DESDE LAST SEEN
// =====================================================

function calcularMinutosDesde(fecha) {

    if (!fecha) {
        return null;
    }

    const fechaReal =
        fecha instanceof Date
            ? fecha
            : new Date(fecha);

    if (isNaN(fechaReal.getTime())) {
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

    for (const sesion of sesiones || []) {

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
            new Date(atributos.start);

        if (isNaN(inicio.getTime())) {
            continue;
        }

        let fin;

        if (atributos.stop) {

            fin =
                new Date(
                    atributos.stop
                );

        } else {

            fin = ahora;
        }

        if (isNaN(fin.getTime())) {
            continue;
        }

        segundos +=
            Math.max(
                0,
                Math.floor(
                    (fin - inicio) / 1000
                )
            );
    }

    return segundos;
}


// =====================================================
// FORMATEAR TIEMPO
// =====================================================

function formatearTiempo(segundos) {

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
// OBTENER TIMEPLAYED DE SERVIDOR
// =====================================================

function obtenerTimePlayedServidor(
    jugador,
    serverId
) {

    if (!jugador || !serverId) {
        return 0;
    }

    const serverIdString =
        String(serverId);

    const servidores =
        jugador._servidoresIncluidos || [];

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
// OBTENER HORAS TOTALES DEL PERFIL
// =====================================================

function obtenerTiempoTotalPerfil(
    jugador,
    sesiones
) {

    let segundosTotalesBM = 0;

    const servidores =
        jugador?._servidoresIncluidos || [];

    for (const servidor of servidores) {

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

    if (!serverId) {
        return null;
    }

    if (
        servidoresCache &&
        servidoresCache.has(serverId)
    ) {
        return servidoresCache.get(serverId);
    }

    const servidor =
        await obtenerServidor(serverId);

    if (servidoresCache) {
        servidoresCache.set(
            serverId,
            servidor
        );
    }

    return servidor;
}


// =====================================================
// OBTENER DURACIÓN DE LA SESIÓN ACTUAL
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

                if (!start || stop) {
                    return false;
                }

                const inicio =
                    new Date(start);

                return !isNaN(
                    inicio.getTime()
                );
            }
        );

    if (sesionesAbiertas.length === 0) {
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

    let inicioGlobal = null;
    let finGlobal = null;

    if (ultimaSesionGlobal) {

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
    // ONLINE REAL
    // =================================================

    const sesionActualServidor =
        sesiones.find(
            sesion => {

                const sesionServerId =
                    obtenerServerIdDeSesion(
                        sesion
                    );

                if (
                    String(sesionServerId) !==
                    String(serverId)
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

    const online =
        Boolean(
            sesionActualServidor
        );

    // =================================================
    // TIEMPO SESIÓN ACTUAL
    // =================================================

    let segundosSesionActual =
        obtenerDuracionSesionActual(
            sesiones,
            serverId
        );

    if (
        online &&
        segundosSesionActual <= 0 &&
        inicioGlobal &&
        !finGlobal
    ) {

        segundosSesionActual =
            Math.max(
                0,
                Math.floor(
                    (
                        Date.now() -
                        inicioGlobal.getTime()
                    ) / 1000
                )
            );
    }

    // =================================================
    // TIEMPO ÚLTIMA SESIÓN SERVIDOR
    // =================================================

    let segundosUltimaSesionServidor = 0;

    if (ultimaSesionServidor) {

        const inicio =
            ultimaSesionServidor.attributes?.start
                ? new Date(
                    ultimaSesionServidor.attributes.start
                )
                : null;

        const stop =
            ultimaSesionServidor.attributes?.stop
                ? new Date(
                    ultimaSesionServidor.attributes.stop
                )
                : null;

        if (
            inicio &&
            !isNaN(inicio.getTime())
        ) {

            const fin =
                stop &&
                !isNaN(stop.getTime())
                    ? stop
                    : new Date();

            segundosUltimaSesionServidor =
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
    }

    // =================================================
    // HORAS SERVIDOR
    // =================================================

    let segundosServidor =
        obtenerTimePlayedServidor(
            jugador,
            serverId
        );

    let origenTiempoServidor =
        "battlemetrics.meta.timePlayed";

    if (segundosServidor <= 0) {

        segundosServidor =
            calcularTiempoSesiones(
                sesiones,
                serverId
            );

        origenTiempoServidor =
            "sessions.fallback";
    }

    // =================================================
    // HORAS TOTALES
    // =================================================

    const segundosTotal =
        obtenerTiempoTotalPerfil(
            jugador,
            sesiones
        );

    // =================================================
    // PRIMERA CONEXIÓN
    // =================================================

    let primeraConexion = null;

    for (const sesion of sesiones) {

        const inicio =
            sesion.attributes?.start
                ? new Date(
                    sesion.attributes.start
                )
                : null;

        if (
            !inicio ||
            isNaN(inicio.getTime())
        ) {
            continue;
        }

        if (
            !primeraConexion ||
            inicio < primeraConexion
        ) {
            primeraConexion = inicio;
        }
    }

    // =================================================
    // ÚLTIMA CONEXIÓN GLOBAL
    // =================================================

    let ultimaConexion = null;

    for (const sesion of sesiones) {

        const stop =
            sesion.attributes?.stop
                ? new Date(
                    sesion.attributes.stop
                )
                : null;

        if (
            !stop ||
            isNaN(stop.getTime())
        ) {
            continue;
        }

        if (
            !ultimaConexion ||
            stop > ultimaConexion
        ) {
            ultimaConexion = stop;
        }
    }

    if (
        !ultimaConexion &&
        inicioGlobal
    ) {
        ultimaConexion = inicioGlobal;
    }

    // =================================================
    // SERVIDORES DEL PERFIL
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
    // RESULTADO
    // =================================================

    return {

        id: playerId,

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
                    segundosTotal / 3600
                ).toFixed(2)
            ),

        horasTotalesBM:
            Math.floor(
                segundosTotal / 3600
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
                    segundosServidor / 3600
                ).toFixed(2)
            ),

        horasServidorBM:
            Math.floor(
                segundosServidor / 3600
            ),

        origenTiempoServidor,

        ultimaSesionSegundos:
            segundosUltimaSesionServidor,

        tiempoUltimaSesion:
            formatearTiempo(
                segundosUltimaSesionServidor
            ),

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
                        lastSeenMinutos / 60
                    ).toFixed(2)
                )
                : null,

        lastSeenWithinLimit:
            lastSeenMinutos !== null &&
            lastSeenMinutos <=
                MAX_LAST_SEEN_MINUTES,

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
            "server-direct+global+server-timeplayed+server-last-seen"
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

        if (servidor) {

            console.log(
                `🎮 Servidor configurado → ${servidor.name} (${servidor.id})`
            );

        } else {

            console.log(
                `⚠️ No se pudo obtener información del servidor ${serverIdString}`
            );
        }

        // =================================================
        // PERFILES
        // =================================================

        const perfiles =
            await buscarPerfilesPorNombre(
                nombreBuscado,
                serverIdString
            );

        if (perfiles.length === 0) {

            console.log(
                `❌ No existen perfiles encontrados para "${nombreBuscado}"`
            );

            return null;
        }

        console.log(
            `👥 BattleMetrics → ${perfiles.length} perfil(es) candidato(s)`
        );

        const servidoresCache =
            new Map();

        servidoresCache.set(
            serverIdString,
            servidor
        );

        const candidatosDescartados = [];

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
                String(perfilBusqueda.id);

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

            console.log(
                `📥 Perfil ${playerId} → cargando historial...`
            );

            const sesiones =
                await obtenerSesionesJugador(
                    playerId
                );

            if (sesiones.length === 0) {

                console.log(
                    `⚠️ Perfil ${playerId} → no tiene sesiones accesibles`
                );

                candidatosDescartados.push({

                    id: playerId,

                    name: nombrePerfil,

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

            if (!ultimaSesionServidor) {

                console.log(
                    `❌ Perfil ${playerId} → NO tiene historial en el servidor ${serverIdString}`
                );

                candidatosDescartados.push({

                    id: playerId,

                    name: nombrePerfil,

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
                `🎮 Servidor encontrado → ${serverIdString}`
            );

            console.log(
                `🕐 Last Seen → ${formatearFechaChile(lastSeenServidor)}`
            );

            console.log(
                `⏱️ Hace → ${lastSeenMinutos ?? "?"} minutos`
            );

            if (lastSeenMinutos === null) {

                console.log(
                    `❌ Perfil ${playerId} → no se pudo determinar Last Seen`
                );

                candidatosDescartados.push({

                    id: playerId,

                    name: nombrePerfil,

                    motivo:
                        "Last Seen desconocido"
                });

                continue;
            }

            if (
                lastSeenMinutos >
                MAX_LAST_SEEN_MINUTES
            ) {

                console.log(
                    `❌ Perfil ${playerId} DESCARTADO → Last Seen ${lastSeenMinutos} minutos`
                );

                candidatosDescartados.push({

                    id: playerId,

                    name: nombrePerfil,

                    lastSeen:
                        lastSeenServidor,

                    lastSeenMinutes:
                        lastSeenMinutos,

                    motivo:
                        `Last Seen superior a ${MAX_LAST_SEEN_MINUTES} minutos`
                });

                continue;
            }

            // =================================================
            // PERFIL VÁLIDO
            // =================================================

            console.log(
                `✅ PERFIL ${playerId} → Last Seen válido`
            );

            let servidorActividad =
                servidoresCache.get(
                    serverIdString
                );

            if (!servidorActividad) {

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

            if (!resultado) {

                console.log(
                    `⚠️ Perfil ${playerId} → no se pudo construir el resultado`
                );

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
                        lastSeenMinutos / 60
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

            // =================================================
            // LOG
            // =================================================

            console.log(
                `⏱️ SESIÓN ACTUAL → ${resultado.tiempoSesionActual}`
            );

            console.log(
                `⏱️ HORAS SERVIDOR → ${resultado.tiempoServidor}`
            );

            console.log(
                `🌎 HORAS TOTALES PERFIL → ${resultado.tiempoJugado}`
            );

            console.log(
                `📌 Fuente horas servidor → ${resultado.origenTiempoServidor}`
            );

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
                `   Estado: ${resultado.online ? "ONLINE" : "OFFLINE"}`
            );

            console.log(
                `   Sesión actual: ${resultado.tiempoSesionActual}`
            );

            console.log(
                `   Horas servidor: ${resultado.tiempoServidor}`
            );

            console.log(
                `   Horas totales perfil: ${resultado.tiempoJugado}`
            );

            console.log(
                `   Last Seen: ${resultado.lastSeen}`
            );

            console.log(
                `   Hace: ${resultado.lastSeenMinutes} minutos`
            );

            console.log(
                `   Sesiones servidor: ${resultado.sesionesServidor}`
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
                    candidatosDescartados
            };
        }

        // =================================================
        // NINGÚN PERFIL
        // =================================================

        console.log(
            "================================================="
        );

        console.log(
            `❌ NINGÚN PERFIL PARA "${nombreBuscado}" CUMPLE LAS CONDICIONES`
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

    normalizarNombre,

    obtenerTimePlayedServidor,

    obtenerTiempoTotalPerfil,

    obtenerDuracionSesionActual

};