require("dotenv").config();

const axios = require("axios");

const BM_API =
    "https://api.battlemetrics.com";

const TIMEZONE_CHILE =
    "America/Santiago";

const MAX_LAST_SEEN_MINUTES =
    60;

const LIMITE_PAGINAS_BUSQUEDA =
    1000;

const LIMITE_PAGINAS_SESIONES =
    1000;

const LIMITE_PAGINAS_SERVIDOR =
    1000;


// =====================================================
// HEADERS
// =====================================================

function getHeaders() {

    const token =
        process.env.BATTLEMETRICS_TOKEN;

    if (token) {

        return {

            Authorization:
                `Bearer ${token}`,

            "Content-Type":
                "application/json"

        };

    }

    return {

        "Content-Type":
            "application/json"

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

    return String(nombre || "")

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
// SERVER ID DE SESIÓN
// =====================================================

function obtenerServerIdDeSesion(sesion) {

    if (!sesion) {
        return null;
    }

    const relationship =
        sesion.relationships
            ?.server
            ?.data;

    if (relationship?.id) {

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
// SERVIDORES DEL PERFIL
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
// RELACIÓN CON SERVIDOR
// =====================================================

function obtenerRelacionServidor(
    jugador,
    serverId
) {

    if (
        !jugador ||
        !serverId
    ) {

        return null;

    }

    const servidores =
        jugador.relationships
            ?.servers
            ?.data;

    if (!Array.isArray(servidores)) {
        return null;
    }

    return (

        servidores.find(
            servidor =>
                String(
                    servidor?.id
                ) ===
                String(serverId)
        ) ||

        null

    );

}


// =====================================================
// ONLINE DESDE RELACIÓN
// =====================================================

function obtenerOnlineDesdeRelacion(
    relacion
) {

    if (!relacion) {
        return null;
    }

    const meta =
        relacion.meta || {};

    if (
        typeof meta.online ===
        "boolean"
    ) {

        return meta.online;

    }

    return null;

}


// =====================================================
// LAST SEEN DESDE RELACIÓN
// =====================================================

function obtenerLastSeenDesdeRelacion(
    relacion
) {

    if (!relacion) {
        return null;
    }

    const meta =
        relacion.meta || {};

    const posibles = [

        meta.lastSeen,

        meta.lastSeenAt,

        meta.last_seen,

        meta.last_seen_at

    ];

    for (
        const valor of posibles
    ) {

        if (!valor) {
            continue;
        }

        const fecha =
            new Date(valor);

        if (
            !isNaN(
                fecha.getTime()
            )
        ) {

            return fecha;

        }

    }

    return null;

}


// =====================================================
// TIME PLAYED DE RELACIÓN
// =====================================================

function obtenerTimePlayedDeRelacion(
    relacion
) {

    if (!relacion) {
        return 0;
    }

    const tiempo =
        Number(
            relacion.meta?.timePlayed
        ) || 0;

    return Math.max(
        0,
        tiempo
    );

}


// =====================================================
// INFORMACIÓN SERVIDOR
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
// AGREGAR SIN DUPLICADOS
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
                String(
                    resultado.id
                ) ===
                String(
                    jugador.id
                )
        );

    if (!existe) {

        resultados.push(
            jugador
        );

    }

}


// =====================================================
// BUSCAR TODOS LOS PERFILES POR SEARCH
// =====================================================

async function ejecutarBusquedaJugadores(
    termino,
    serverId = null
) {

    const resultados = [];

    const terminoBusqueda =
        String(
            termino || ""
        ).trim();

    if (!terminoBusqueda) {
        return resultados;
    }

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

            if (serverId) {

                params[
                    "filter[servers]"
                ] =
                    String(
                        serverId
                    );

                params.include =
                    "server";

            }

            response =
                await axios.get(

                    nextUrl,

                    {

                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? params
                                : undefined,

                        timeout:
                            20000

                    }

                );

        } catch (error) {

            console.error(

                `❌ Error buscando "${terminoBusqueda}" página ${pagina}:`,

                error.response?.data ||
                error.message

            );

            break;

        }

        const jugadores =
            response.data?.data ||
            [];

        console.log(

            `📊 BM /players → página ${pagina}: ${jugadores.length} perfiles`

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
            response.data
                ?.links
                ?.next;

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

        `📊 BM /players → "${terminoBusqueda}" → ${resultados.length} perfiles únicos`

    );

    return resultados;

}


// =====================================================
// BUSCAR JUGADORES DIRECTAMENTE EN SERVIDOR
// =====================================================

async function obtenerJugadoresDelServidor(
    serverId
) {

    const resultados = [];

    if (!serverId) {
        return resultados;
    }

    let nextUrl =
        `${BM_API}/servers/${serverId}/relationships/players?page[size]=100`;

    let pagina = 1;

    console.log(
        `🎯 BM → recorriendo TODOS los jugadores relacionados con servidor ${serverId}`
    );

    while (
        nextUrl &&
        pagina <= LIMITE_PAGINAS_SERVIDOR
    ) {

        console.log(

            `📡 BM /servers/${serverId}/relationships/players → página ${pagina}`

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
                            20000

                    }

                );

        } catch (error) {

            console.error(

                `❌ Error obteniendo jugadores del servidor ${serverId}, página ${pagina}:`,

                error.response?.data ||
                error.message

            );

            break;

        }

        const jugadores =
            response.data?.data ||
            [];

        console.log(

            `📊 Servidor ${serverId} → página ${pagina}: ${jugadores.length} relaciones`

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
            response.data
                ?.links
                ?.next;

        nextUrl =
            siguiente ||
            null;

        pagina++;

    }

    console.log(

        `🎯 BM → servidor ${serverId} → ${resultados.length} jugador(es) únicos encontrados`

    );

    return resultados;

}


// =====================================================
// OBTENER CANDIDATOS
// =====================================================

async function obtenerCandidatosPorNombre(
    nombre,
    serverId = null
) {

    const candidatos = [];

    const nombreBuscado =
        String(
            nombre || ""
        ).trim();

    if (!nombreBuscado) {
        return candidatos;
    }

    // -------------------------------------------------
    // 1. BÚSQUEDA GLOBAL
    // -------------------------------------------------

    console.log(
        `🌎 BM → búsqueda GLOBAL para "${nombreBuscado}"`
    );

    const globales =
        await ejecutarBusquedaJugadores(
            nombreBuscado
        );

    for (
        const jugador of globales
    ) {

        agregarJugadorUnico(
            candidatos,
            jugador
        );

    }

    // -------------------------------------------------
    // 2. BÚSQUEDA POR SERVIDOR + NOMBRE
    // -------------------------------------------------

    if (serverId) {

        console.log(

            `🎯 BM → búsqueda "${nombreBuscado}" filtrada por servidor ${serverId}`

        );

        const servidor =
            await ejecutarBusquedaJugadores(
                nombreBuscado,
                serverId
            );

        for (
            const jugador of servidor
        ) {

            agregarJugadorUnico(
                candidatos,
                jugador
            );

        }

    }

    // -------------------------------------------------
    // 3. BÚSQUEDA DIRECTA DEL SERVIDOR
    // -------------------------------------------------

    if (serverId) {

        console.log(

            `🔍 BM → búsqueda DIRECTA de jugadores del servidor ${serverId}`

        );

        const jugadoresServidor =
            await obtenerJugadoresDelServidor(
                serverId
            );

        const nombreObjetivo =
            normalizarNombre(
                nombreBuscado
            );

        for (
            const jugador of jugadoresServidor
        ) {

            const nombreJugador =
                normalizarNombre(
                    jugador.attributes?.name
                );

            if (
                nombreJugador ===
                nombreObjetivo
            ) {

                agregarJugadorUnico(
                    candidatos,
                    jugador
                );

            }

        }

    }

    console.log(

        `👥 BM → ${candidatos.length} candidato(s) únicos después de TODAS las búsquedas`

    );

    return candidatos;

}


// =====================================================
// PERFILES EXACTOS
// =====================================================

async function buscarPerfilesPorNombre(
    nombre,
    serverId = null
) {

    try {

        const nombreBuscado =
            String(
                nombre || ""
            ).trim();

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

            `👥 BM → ${candidatos.length} candidatos antes del filtro exacto`

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

            `🔎 BM → ${resultados.length} perfil(es) EXACTOS`

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
// DETALLE JUGADOR
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
// SESIONES
// =====================================================

async function obtenerSesionesJugador(
    playerId
) {

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

                `❌ Error obteniendo sesiones ${playerId}:`,

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
            response.data
                ?.links
                ?.next ||
            null;

        pagina++;

    }

    console.log(

        `📊 BM ${playerId} → ${sesiones.length} sesiones totales`

    );

    return sesiones;

}


// =====================================================
// ÚLTIMA SESIÓN
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

    return validas.sort(

        (a, b) =>

            new Date(
                b.attributes.start
            ).getTime() -

            new Date(
                a.attributes.start
            ).getTime()

    )[0];

}


// =====================================================
// ÚLTIMA SESIÓN SERVIDOR
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

    const server =
        String(serverId);

    const sesionesServidor =
        sesiones.filter(
            sesion => {

                const id =
                    obtenerServerIdDeSesion(
                        sesion
                    );

                if (
                    String(id) !==
                    server
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
// LAST SEEN SESIONES
// =====================================================

function obtenerLastSeenEnServidor(
    sesiones,
    serverId
) {

    const ultima =
        obtenerUltimaSesionEnServidor(
            sesiones,
            serverId
        );

    if (!ultima) {
        return null;
    }

    const atributos =
        ultima.attributes || {};

    if (atributos.stop) {

        const fecha =
            new Date(
                atributos.stop
            );

        if (
            isNaN(
                fecha.getTime()
            )
        ) {

            return null;

        }

        return fecha;

    }

    return new Date();

}


// =====================================================
// MINUTOS
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
// TIEMPO SESIONES
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

        const fin =
            atributos.stop
                ? new Date(
                    atributos.stop
                )
                : ahora;

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

    if (horas > 0) {

        return `${horas}h ${minutos}m`;

    }

    return `${minutos}m`;

}


// =====================================================
// TIMEPLAYED SERVIDOR
// =====================================================

function obtenerTimePlayedServidor(
    jugador,
    serverId
) {

    const relacion =
        obtenerRelacionServidor(
            jugador,
            serverId
        );

    const tiempoRelacion =
        obtenerTimePlayedDeRelacion(
            relacion
        );

    if (
        tiempoRelacion > 0
    ) {

        return tiempoRelacion;

    }

    const servidores =
        jugador?._servidoresIncluidos ||
        [];

    const servidor =
        servidores.find(
            item =>
                String(
                    item.id
                ) ===
                String(serverId)
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

    let total = 0;

    const servidores =
        jugador?._servidoresIncluidos ||
        [];

    for (
        const servidor of servidores
    ) {

        total +=
            Number(
                servidor.meta?.timePlayed
            ) || 0;

    }

    const sesionesTotal =
        calcularTiempoSesiones(
            sesiones
        );

    return Math.max(
        total,
        sesionesTotal
    );

}


// =====================================================
// SESIÓN ACTUAL
// =====================================================

function obtenerDuracionSesionActual(
    sesiones,
    serverId
) {

    if (
        !Array.isArray(sesiones)
    ) {

        return 0;

    }

    const abiertas =
        sesiones.filter(
            sesion => {

                const id =
                    obtenerServerIdDeSesion(
                        sesion
                    );

                if (
                    String(id) !==
                    String(serverId)
                ) {

                    return false;

                }

                return Boolean(

                    sesion.attributes?.start &&
                    !sesion.attributes?.stop

                );

            }
        );

    if (
        abiertas.length === 0
    ) {

        return 0;

    }

    const actual =
        abiertas.sort(

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
            actual.attributes.start
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
    lastSeenServidor,
    relacionServidor = null
) {

    const atributos =
        jugador.attributes || {};

    const playerId =
        String(
            jugador.id
        );

    const onlineSesion =
        Boolean(
            ultimaSesionServidor &&
            !ultimaSesionServidor.attributes?.stop
        );

    const onlineRelacion =
        obtenerOnlineDesdeRelacion(
            relacionServidor
        );

    const online =
        onlineRelacion !== null
            ? onlineRelacion
            : onlineSesion;

    let lastSeen =
        lastSeenServidor;

    if (!lastSeen) {

        lastSeen =
            obtenerLastSeenDesdeRelacion(
                relacionServidor
            );

    }

    if (
        online &&
        !lastSeen
    ) {

        lastSeen =
            new Date();

    }

    const segundosSesionActual =
        obtenerDuracionSesionActual(
            sesiones,
            serverId
        );

    let segundosServidor =
        obtenerTimePlayedServidor(
            jugador,
            serverId
        );

    let origenTiempoServidor =
        "battlemetrics.server.relationship";

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

    const segundosTotal =
        obtenerTiempoTotalPerfil(
            jugador,
            sesiones
        );

    let primeraConexion =
        null;

    let ultimaConexion =
        null;

    for (
        const sesion of sesiones
    ) {

        const start =
            sesion.attributes?.start;

        if (start) {

            const fecha =
                new Date(start);

            if (
                !isNaN(
                    fecha.getTime()
                )
            ) {

                if (
                    !primeraConexion ||
                    fecha < primeraConexion
                ) {

                    primeraConexion =
                        fecha;

                }

            }

        }

        const stop =
            sesion.attributes?.stop;

        if (stop) {

            const fecha =
                new Date(stop);

            if (
                !isNaN(
                    fecha.getTime()
                )
            ) {

                if (
                    !ultimaConexion ||
                    fecha > ultimaConexion
                ) {

                    ultimaConexion =
                        fecha;

                }

            }

        }

    }

    if (
        !ultimaConexion &&
        lastSeen
    ) {

        ultimaConexion =
            lastSeen;

    }

    const servidoresPerfil =
        obtenerServidoresDelPerfil(
            jugador
        );

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

    const lastSeenMinutes =
        calcularMinutosDesde(
            lastSeen
        );

    const tieneRelacionServidor =
        Boolean(
            relacionServidor
        );

    const historialConfirmado =
        sesionesServidor.length > 0 ||
        tieneRelacionServidor;

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
                lastSeen
            ),

        lastSeenDate:
            lastSeen,

        lastSeenMinutes,

        lastSeenHours:
            lastSeenMinutes !== null
                ? Number(
                    (
                        lastSeenMinutes /
                        60
                    ).toFixed(2)
                )
                : null,

        lastSeenWithinLimit:
            online ||
            (
                lastSeenMinutes !== null &&
                lastSeenMinutes <=
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

        historialConfirmado,

        origen:
            "global-search+server-search+server-players+exact-name+server-relationship+sessions+last-seen"

    };

}


// =====================================================
// BUSCAR HISTÓRICOS
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

        const servidor =
            await obtenerServidor(
                serverIdString
            );

        const perfiles =
            await buscarPerfilesPorNombre(
                nombreBuscado,
                serverIdString
            );

        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ No se encontraron perfiles exactos para "${nombreBuscado}"`
            );

            return [];

        }

        console.log(

            `👥 Se revisarán TODOS los ${perfiles.length} perfiles exactos encontrados`

        );

        const candidatosValidos = [];

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

            const detalle =
                await obtenerJugador(
                    playerId
                );

            let jugador =
                detalle ||
                perfil;

            if (
                !jugador.relationships
                    ?.servers
                    ?.data
                    ?.length &&
                perfil.relationships
                    ?.servers
                    ?.data
                    ?.length
            ) {

                jugador = {

                    ...jugador,

                    relationships: {

                        ...(jugador.relationships || {}),

                        servers:
                            perfil.relationships.servers

                    }

                };

            }

            const relacionServidor =
                obtenerRelacionServidor(
                    jugador,
                    serverIdString
                );

            if (
                relacionServidor
            ) {

                console.log(

                    `🎯 ${playerId} → relación encontrada con servidor ${serverIdString}`

                );

                console.log(

                    `   online meta: ${obtenerOnlineDesdeRelacion(relacionServidor)}`

                );

                console.log(

                    `   timePlayed meta: ${obtenerTimePlayedDeRelacion(relacionServidor)}`

                );

            } else {

                console.log(

                    `⚠️ ${playerId} → no aparece relación directa con servidor ${serverIdString}`

                );

            }

            const sesiones =
                await obtenerSesionesJugador(
                    playerId
                );

            const ultimaSesionServidor =
                obtenerUltimaSesionEnServidor(
                    sesiones,
                    serverIdString
                );

            let lastSeenServidor =
                obtenerLastSeenEnServidor(
                    sesiones,
                    serverIdString
                );

            if (!lastSeenServidor) {

                lastSeenServidor =
                    obtenerLastSeenDesdeRelacion(
                        relacionServidor
                    );

            }

            const onlineRelacion =
                obtenerOnlineDesdeRelacion(
                    relacionServidor
                );

            const onlineSesion =
                Boolean(
                    ultimaSesionServidor &&
                    !ultimaSesionServidor.attributes?.stop
                );

            const online =
                onlineRelacion !== null
                    ? onlineRelacion
                    : onlineSesion;

            const lastSeenMinutes =
                online
                    ? 0
                    : calcularMinutosDesde(
                        lastSeenServidor
                    );

            const historialServidor =
                Boolean(
                    ultimaSesionServidor ||
                    relacionServidor
                );

            if (!historialServidor) {

                console.log(

                    `❌ ${playerId} → sin historial/relación en servidor ${serverIdString}`

                );

                continue;

            }

            if (online) {

                console.log(
                    `🟢 ${playerId} → ONLINE`
                );

            } else {

                if (
                    lastSeenMinutes === null ||
                    lastSeenMinutes >
                        MAX_LAST_SEEN_MINUTES
                ) {

                    console.log(

                        `❌ ${playerId} → descartado por Last Seen (${lastSeenMinutes ?? "?"} min)`

                    );

                    continue;

                }

                console.log(

                    `🔴 ${playerId} → OFFLINE hace ${lastSeenMinutes} min`

                );

            }

            const resultado =
                await construirResultadoJugador(

                    jugador,

                    sesiones,

                    serverIdString,

                    servidor,

                    ultimaSesionServidor,

                    lastSeenServidor,

                    relacionServidor

                );

            if (!resultado) {
                continue;
            }

            resultado.online =
                online;

            resultado.lastSeenDate =
                lastSeenServidor;

            resultado.lastSeenMinutes =
                lastSeenMinutes;

            resultado.lastSeenWithinLimit =
                online ||
                (
                    lastSeenMinutes !== null &&
                    lastSeenMinutes <=
                        MAX_LAST_SEEN_MINUTES
                );

            resultado.perfilUrl =
                `https://www.battlemetrics.com/players/${playerId}`;

            candidatosValidos.push(
                resultado
            );

            console.log(

                `✅ ${playerId} → CANDIDATO VÁLIDO`

            );

        }

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

                return (
                    fechaB -
                    fechaA
                );

            }
        );

        console.log(
            "================================================="
        );

        console.log(

            `🎯 /BUSCAR → ${candidatosValidos.length} PERFIL(ES) VÁLIDO(S) DE ${perfiles.length} PERFIL(ES) REVISADOS`

        );

        for (
            const candidato of candidatosValidos
        ) {

            console.log(

                `   ${candidato.id}` +
                ` → ${candidato.online ? "ONLINE" : "OFFLINE"}` +
                ` → Last Seen ${candidato.lastSeenMinutes ?? "?"} min`

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
// COMPATIBILIDAD
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
// COMPATIBILIDAD ANTIGUA
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

    obtenerDuracionSesionActual,

    obtenerRelacionServidor,

    obtenerOnlineDesdeRelacion,

    obtenerLastSeenDesdeRelacion,

    obtenerTimePlayedDeRelacion,

    obtenerJugadoresDelServidor

};