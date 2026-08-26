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
                "application/json",

            Accept:
                "application/json"

        };

    }

    return {

        "Content-Type":
            "application/json",

        Accept:
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
// EXTRAER FECHA
// =====================================================

function convertirFecha(valor) {

    if (!valor) {
        return null;
    }

    const fecha =
        valor instanceof Date
            ? valor
            : new Date(valor);

    if (
        isNaN(
            fecha.getTime()
        )
    ) {

        return null;

    }

    return fecha;

}


// =====================================================
// EXTRAER SERVER ID DE SESIÓN
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

        meta.last_seen_at,

        meta.lastConnected,

        meta.lastConnectedAt,

        meta.last_connected,

        meta.last_connected_at

    ];

    for (
        const valor of posibles
    ) {

        const fecha =
            convertirFecha(
                valor
            );

        if (fecha) {
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

    const meta =
        relacion.meta || {};

    const posibles = [

        meta.timePlayed,

        meta.time_played,

        meta.timePlayedSeconds,

        meta.time_played_seconds

    ];

    for (
        const valor of posibles
    ) {

        const numero =
            Number(valor);

        if (
            Number.isFinite(numero) &&
            numero > 0
        ) {

            return numero;

        }

    }

    return 0;

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
            await requestBM(

                "GET",

                `${BM_API}/servers/${serverId}`,

                {

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
// REQUEST GENÉRICO
// =====================================================

async function requestBM(
    method,
    url,
    options = {}
) {

    try {

        return await axios({

            method,

            url,

            headers:
                getHeaders(),

            timeout:
                options.timeout ||
                20000,

            params:
                options.params,

            data:
                options.data

        });

    } catch (error) {

        const status =
            error.response?.status;

        const data =
            error.response?.data;

        console.error(

            `❌ BM ${method} ${url}`,

            status
                ? `→ HTTP ${status}`
                : "",

            data ||
            error.message

        );

        throw error;

    }

}


// =====================================================
// BUSCAR TODOS LOS PERFILES POR SEARCH
//
// IMPORTANTE:
//
// ESTA BÚSQUEDA ES GLOBAL.
//
// NO SE UTILIZA:
// filter[servers]
//
// porque queremos obtener TODOS los perfiles
// exactos con ese nombre, incluidos perfiles históricos
// que puedan no aparecer en la relación actual del servidor.
//
// Después cada perfil se verifica mediante:
//
// 1. GET /players/{id}?include=server
// 2. Historial de sesiones
//
// NO se utiliza:
//
// /players/{id}/servers/{serverId}
// =====================================================

async function ejecutarBusquedaJugadores(
    termino
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

            `📄 BM /players → "${terminoBusqueda}" → página ${pagina} → GLOBAL`

        );

        let response;

        try {

            const params = {

                "filter[search]":
                    terminoBusqueda,

                "page[size]":
                    100

            };

            response =
                await requestBM(

                    "GET",

                    nextUrl,

                    {

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

        nextUrl =
            response.data
                ?.links
                ?.next ||
            null;

        pagina++;

    }

    console.log(

        `📊 BM /players → "${terminoBusqueda}" → ${resultados.length} perfiles únicos`

    );

    return resultados;

}


// =====================================================
// OBTENER SERVIDORES DEL JUGADOR
//
// ÚNICA COMPROBACIÓN DIRECTA DEL PERFIL.
//
// NO se utiliza:
//
// GET /players/{id}/servers/{serverId}
//
// porque BattleMetrics devuelve 400 cuando el jugador
// no tiene historial en ese servidor.
//
// Aquí obtenemos el perfil completo y sus relaciones.
//
// Si la relación no aparece, posteriormente se revisan
// las sesiones para confirmar historial histórico.
// =====================================================

async function obtenerServidoresJugador(
    playerId
) {

    if (!playerId) {

        return {

            jugador:
                null,

            servidores:
                []

        };

    }

    try {

        const response =
            await requestBM(

                "GET",

                `${BM_API}/players/${playerId}`,

                {

                    params: {

                        include:
                            "server"

                    },

                    timeout:
                        15000

                }

            );

        const jugador =
            response.data?.data;

        if (!jugador) {

            return {

                jugador:
                    null,

                servidores:
                    []

            };

        }

        const incluidos =
            response.data?.included ||
            [];

        return {

            jugador,

            servidores:
                incluidos.filter(
                    item =>
                        item?.type ===
                        "server"
                )

        };

    } catch (error) {

        console.error(

            `⚠️ Error obteniendo detalle del jugador ${playerId}:`,

            error.response?.data ||
            error.message

        );

        return {

            jugador:
                null,

            servidores:
                []

        };

    }

}


// =====================================================
// PLAYER IDENTIFIERS
// =====================================================

function crearDocumentoIdentificador(
    tipo,
    identificador
) {

    return {

        data: {

            type:
                "playerIdentifier",

            attributes: {

                type:
                    String(tipo),

                identifier:
                    String(identificador)

            }

        }

    };

}


// =====================================================
// MATCH IDENTIFIER
// =====================================================

async function buscarJugadoresPorIdentificador(
    tipo,
    identificador,
    rapido = true
) {

    if (
        !tipo ||
        identificador === undefined ||
        identificador === null
    ) {

        return [];

    }

    try {

        const endpoint =
            rapido
                ? `${BM_API}/players/quick-match`
                : `${BM_API}/players/match`;

        console.log(

            `🔗 BM → ${rapido ? "quick-match" : "match"} → ${tipo}`

        );

        const response =
            await requestBM(

                "POST",

                endpoint,

                {

                    data:
                        crearDocumentoIdentificador(
                            tipo,
                            identificador
                        ),

                    timeout:
                        15000

                }

            );

        const data =
            response.data?.data;

        if (
            Array.isArray(data)
        ) {

            return data;

        }

        if (
            data &&
            typeof data ===
                "object"
        ) {

            return [data];

        }

        return [];

    } catch (error) {

        console.error(

            `⚠️ Error en playerIdentifiers (${tipo}):`,

            error.response?.data ||
            error.message

        );

        return [];

    }

}


// =====================================================
// RELATED IDENTIFIERS DE UN JUGADOR
// =====================================================

async function obtenerRelatedIdentifiers(
    playerId
) {

    if (!playerId) {
        return [];
    }

    try {

        console.log(

            `🔗 BM → related-identifiers → jugador ${playerId}`

        );

        const response =
            await requestBM(

                "GET",

                `${BM_API}/players/${playerId}/relationships/related-identifiers`,

                {

                    params: {

                        "page[size]":
                            100

                    },

                    timeout:
                        15000

                }

            );

        return (
            response.data?.data ||
            []
        );

    } catch (error) {

        console.error(

            `⚠️ Error obteniendo related-identifiers ${playerId}:`,

            error.response?.data ||
            error.message

        );

        return [];

    }

}


// =====================================================
// PLAYER QUERIES DISPONIBLES
// =====================================================

async function obtenerRelatedPlayerQueries() {

    try {

        console.log(
            "🧠 BM → obteniendo Player Queries disponibles"
        );

        const response =
            await requestBM(

                "GET",

                `${BM_API}/player-queries`,

                {

                    params: {

                        "page[size]":
                            100

                    },

                    timeout:
                        15000

                }

            );

        return (
            response.data?.data ||
            []
        );

    } catch (error) {

        console.error(

            "⚠️ No se pudieron obtener Player Queries:",

            error.response?.data ||
            error.message

        );

        return [];

    }

}


// =====================================================
// EJECUTAR PLAYER QUERY GUARDADA
// =====================================================

async function ejecutarRelatedPlayerQueryGuardada(
    playerId,
    playerQueryId
) {

    if (
        !playerId ||
        !playerQueryId
    ) {

        return [];

    }

    try {

        console.log(

            `🧠 BM → Player Query ${playerQueryId} → jugador ${playerId}`

        );

        const response =
            await requestBM(

                "GET",

                `${BM_API}/players/${playerId}/relationships/player-query/${playerQueryId}`,

                {

                    params: {

                        "page[size]":
                            50

                    },

                    timeout:
                        20000

                }

            );

        return (
            response.data?.data ||
            []
        );

    } catch (error) {

        console.error(

            `⚠️ Error ejecutando Player Query ${playerQueryId} sobre ${playerId}:`,

            error.response?.data ||
            error.message

        );

        return [];

    }

}


// =====================================================
// EXTRAER PLAYER ID DE RESULTADO DE QUERY
// =====================================================

function obtenerPlayerIdDeResultadoQuery(
    resultado
) {

    if (!resultado) {
        return null;
    }

    if (
        resultado.type ===
        "player" &&
        resultado.id
    ) {

        return String(
            resultado.id
        );

    }

    const relaciones =
        resultado.relationships || {};

    const player =
        relaciones.player?.data;

    if (
        player?.id
    ) {

        return String(
            player.id
        );

    }

    const attributes =
        resultado.attributes || {};

    const posibles = [

        attributes.playerId,

        attributes.playerID,

        attributes.player_id

    ];

    for (
        const valor of posibles
    ) {

        if (
            valor !== undefined &&
            valor !== null
        ) {

            return String(
                valor
            );

        }

    }

    return null;

}


// =====================================================
// OBTENER CANDIDATOS
//
// ESTRATEGIA:
//
// 1. Búsqueda GLOBAL por nombre.
// 2. Related identifiers.
// 3. Player Queries.
//
// Luego:
//
// 4. Filtro por nombre exacto.
// 5. Cada perfil se comprueba contra el servidor
//    mediante relación + sesiones.
//
// NO se utiliza ningún endpoint de:
// /players/{id}/servers/{serverId}
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
    // CANDIDATOS ORIGINALES
    //
    // IMPORTANTE:
    //
    // Se guarda esta copia antes de enriquecer,
    // para evitar que los resultados añadidos durante
    // related-identifiers vuelvan a disparar todo
    // el proceso.
    // -------------------------------------------------

    const candidatosIniciales =
        [...candidatos];

    // -------------------------------------------------
    // 2. RELATED IDENTIFIERS
    // -------------------------------------------------

    for (
        const jugador of candidatosIniciales
    ) {

        const identificadores =
            await obtenerRelatedIdentifiers(
                jugador.id
            );

        for (
            const identificador of identificadores
        ) {

            const attributes =
                identificador.attributes ||
                {};

            const tipo =
                attributes.type ||
                attributes.identifierType ||
                identificador.type;

            const valor =
                attributes.identifier ||
                attributes.value;

            if (
                !tipo ||
                valor === undefined ||
                valor === null
            ) {

                continue;

            }

            const relacionados =
                await buscarJugadoresPorIdentificador(
                    tipo,
                    valor,
                    true
                );

            for (
                const relacionado of relacionados
            ) {

                agregarJugadorUnico(
                    candidatos,
                    relacionado
                );

            }

        }

    }

    // -------------------------------------------------
    // 3. PLAYER QUERIES
    // -------------------------------------------------

    try {

        const queries =
            await obtenerRelatedPlayerQueries();

        if (
            Array.isArray(queries) &&
            queries.length > 0
        ) {

            console.log(

                `🧠 BM → ${queries.length} Player Query(s) disponibles`

            );

            for (
                const jugador of candidatosIniciales
            ) {

                for (
                    const query of queries
                ) {

                    const queryId =
                        query?.id;

                    if (!queryId) {
                        continue;
                    }

                    const resultadosQuery =
                        await ejecutarRelatedPlayerQueryGuardada(
                            jugador.id,
                            queryId
                        );

                    for (
                        const resultado of resultadosQuery
                    ) {

                        const playerId =
                            obtenerPlayerIdDeResultadoQuery(
                                resultado
                            );

                        if (!playerId) {
                            continue;
                        }

                        if (
                            resultado.type ===
                            "player"
                        ) {

                            agregarJugadorUnico(
                                candidatos,
                                resultado
                            );

                            continue;

                        }

                        agregarJugadorUnico(
                            candidatos,
                            {

                                type:
                                    "player",

                                id:
                                    playerId,

                                attributes: {}

                            }

                        );

                    }

                }

            }

        } else {

            console.log(
                "ℹ️ BM → no hay Player Queries disponibles para este token"
            );

        }

    } catch (error) {

        console.error(

            "⚠️ Error en Player Queries:",

            error.response?.data ||
            error.message

        );

    }

    console.log(

        `👥 BM → ${candidatos.length} candidato(s) únicos después de todas las búsquedas`

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

        const resultado =
            await obtenerServidoresJugador(
                playerId
            );

        if (!resultado.jugador) {
            return null;
        }

        const jugador =
            resultado.jugador;

        jugador._servidoresIncluidos =
            resultado.servidores;

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
                await requestBM(

                    "GET",

                    nextUrl,

                    {

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

                const fecha =
                    convertirFecha(
                        start
                    );

                return Boolean(
                    fecha
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

                return Boolean(
                    convertirFecha(
                        sesion.attributes?.start
                    )
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

        return convertirFecha(
            atributos.stop
        );

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
        convertirFecha(
            fecha
        );

    if (!fechaReal) {
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
            convertirFecha(
                atributos.start
            );

        if (!inicio) {
            continue;
        }

        const fin =
            atributos.stop
                ? convertirFecha(
                    atributos.stop
                )
                : ahora;

        if (!fin) {
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
    serverId,
    informacionServidor = null
) {

    if (informacionServidor) {

        const atributos =
            informacionServidor.attributes ||
            {};

        const posibles = [

            atributos.timePlayed,

            atributos.time_played,

            atributos.timePlayedSeconds,

            atributos.time_played_seconds

        ];

        for (
            const valor of posibles
        ) {

            const numero =
                Number(valor);

            if (
                Number.isFinite(numero) &&
                numero > 0
            ) {

                return numero;

            }

        }

    }

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
        convertirFecha(
            actual.attributes.start
        );

    if (!inicio) {
        return 0;
    }

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
    relacionServidor = null,
    informacionServidor = null
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
            serverId,
            informacionServidor
        );

    let origenTiempoServidor =
        "battlemetrics.server.relationship";

    if (
        segundosServidor <= 0 &&
        sesiones.length > 0
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
            convertirFecha(
                sesion.attributes?.start
            );

        if (start) {

            if (
                !primeraConexion ||
                start < primeraConexion
            ) {

                primeraConexion =
                    start;

            }

        }

        const stop =
            convertirFecha(
                sesion.attributes?.stop
            );

        if (stop) {

            if (
                !ultimaConexion ||
                stop > ultimaConexion
            ) {

                ultimaConexion =
                    stop;

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
        online
            ? 0
            : calcularMinutosDesde(
                lastSeen
            );

    const tieneRelacionServidor =
        Boolean(
            relacionServidor
        );

    const tieneSesionesServidor =
        sesionesServidor.length > 0;

    const historialConfirmado =
        tieneSesionesServidor ||
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
            "global-search+player-detail+server-relationship+sessions"

    };

}


// =====================================================
// COMPROBAR JUGADOR CONTRA SERVIDOR
//
// IMPORTANTE:
//
// SE ELIMINÓ COMPLETAMENTE:
//
// GET /players/{playerId}/servers/{serverId}
//
// BattleMetrics devuelve HTTP 400 para perfiles que
// no tengan historial directo en ese endpoint.
//
// NUEVO FLUJO:
//
// 1. Obtener perfil completo.
// 2. Revisar relación con el servidor.
// 3. Obtener sesiones.
// 4. Buscar sesiones pertenecientes al servidor.
// 5. Confirmar historial.
// 6. Aplicar Last Seen.
//
// Esto permite encontrar jugadores históricos sin
// depender del endpoint problemático.
// =====================================================

async function comprobarJugadorEnServidor(
    jugador,
    serverId,
    servidorConfigurado
) {

    if (
        !jugador ||
        !jugador.id ||
        !serverId
    ) {

        return null;

    }

    const playerId =
        String(
            jugador.id
        );

    console.log(
        `🔍 BM → comprobando ${playerId} contra servidor ${serverId}`
    );

    // -------------------------------------------------
    // 1. OBTENER DETALLE DEL JUGADOR
    // -------------------------------------------------

    const detalle =
        await obtenerJugador(
            playerId
        );

    const jugadorCompleto =
        detalle ||
        jugador;

    // -------------------------------------------------
    // 2. RELACIÓN DEL JUGADOR CON EL SERVIDOR
    // -------------------------------------------------

    const relacionServidor =
        obtenerRelacionServidor(
            jugadorCompleto,
            serverId
        );

    if (
        relacionServidor
    ) {

        console.log(

            `🎯 ${playerId} → relación jugador/servidor ENCONTRADA`

        );

    } else {

        console.log(

            `ℹ️ ${playerId} → no aparece relación directa con ${serverId}, se revisarán sesiones`

        );

    }

    // -------------------------------------------------
    // 3. SESIONES
    //
    // Se descargan para poder confirmar históricos.
    //
    // Esto es importante:
    //
    // Un jugador puede no aparecer en la relación actual
    // del perfil, pero sí tener sesiones antiguas en el
    // servidor.
    // -------------------------------------------------

    const sesiones =
        await obtenerSesionesJugador(
            playerId
        );

    // -------------------------------------------------
    // 4. ÚLTIMA SESIÓN DEL SERVIDOR
    // -------------------------------------------------

    const ultimaSesionServidor =
        obtenerUltimaSesionEnServidor(
            sesiones,
            serverId
        );

    // -------------------------------------------------
    // 5. LAST SEEN
    // -------------------------------------------------

    let lastSeenServidor =
        obtenerLastSeenDesdeRelacion(
            relacionServidor
        );

    const lastSeenSesion =
        obtenerLastSeenEnServidor(
            sesiones,
            serverId
        );

    if (
        lastSeenSesion
    ) {

        lastSeenServidor =
            lastSeenSesion;

    }

    // -------------------------------------------------
    // 6. ONLINE
    // -------------------------------------------------

    const onlineRelacion =
        obtenerOnlineDesdeRelacion(
            relacionServidor
        );

    let online =
        onlineRelacion;

    const onlineSesion =
        Boolean(

            ultimaSesionServidor &&

            !ultimaSesionServidor.attributes?.stop

        );

    if (
        online === null ||
        online === undefined
    ) {

        online =
            onlineSesion;

    }

    // -------------------------------------------------
    // 7. DEFAULT OFFLINE
    // -------------------------------------------------

    if (
        online === null ||
        online === undefined
    ) {

        online =
            false;

    }

    // -------------------------------------------------
    // 8. CONFIRMAR HISTORIAL
    //
    // IMPORTANTE:
    //
    // Para considerar que el jugador pertenece al
    // servidor basta con:
    //
    // - relación encontrada
    // O
    // - una sesión histórica encontrada.
    //
    // NO dependemos del endpoint eliminado.
    // -------------------------------------------------

    const historialServidor =
        Boolean(

            relacionServidor ||

            ultimaSesionServidor

        );

    if (!historialServidor) {

        console.log(

            `❌ ${playerId} → NO pertenece/no tiene historial confirmado en ${serverId}`

        );

        return null;

    }

    console.log(

        `🎯 ${playerId} → HISTORIAL DEL SERVIDOR CONFIRMADO`

    );

    // -------------------------------------------------
    // 9. LAST SEEN
    // -------------------------------------------------

    const lastSeenMinutes =
        online
            ? 0
            : calcularMinutosDesde(
                lastSeenServidor
            );

    if (online) {

        console.log(
            `🟢 ${playerId} → ONLINE`
        );

    } else {

        if (
            lastSeenMinutes === null
        ) {

            console.log(

                `❌ ${playerId} → sin Last Seen válido`

            );

            return null;

        }

        if (
            lastSeenMinutes >
            MAX_LAST_SEEN_MINUTES
        ) {

            console.log(

                `❌ ${playerId} → descartado por Last Seen (${lastSeenMinutes} min)`

            );

            return null;

        }

        console.log(

            `🔴 ${playerId} → OFFLINE hace ${lastSeenMinutes} min`

        );

    }

    // -------------------------------------------------
    // 10. CONSTRUIR RESULTADO
    // -------------------------------------------------

    const resultado =
        await construirResultadoJugador(

            jugadorCompleto,

            sesiones,

            serverId,

            servidorConfigurado,

            ultimaSesionServidor,

            lastSeenServidor,

            relacionServidor,

            null

        );

    if (!resultado) {
        return null;
    }

    resultado.online =
        online;

    resultado.lastSeenDate =
        lastSeenServidor;

    resultado.lastSeenMinutes =
        online
            ? 0
            : lastSeenMinutes;

    resultado.lastSeenWithinLimit =
        online ||
        (
            lastSeenMinutes !== null &&
            lastSeenMinutes <=
                MAX_LAST_SEEN_MINUTES
        );

    resultado.perfilUrl =
        `https://www.battlemetrics.com/players/${playerId}`;

    return resultado;

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

        // -------------------------------------------------
        // SERVIDOR
        // -------------------------------------------------

        const servidor =
            await obtenerServidor(
                serverIdString
            );

        if (!servidor) {

            console.log(

                `⚠️ No se pudo obtener información del servidor ${serverIdString}`

            );

        }

        // -------------------------------------------------
        // BUSCAR PERFILES
        // -------------------------------------------------

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

        // -------------------------------------------------
        // COMPROBAR CADA PERFIL
        // -------------------------------------------------

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
                `   Nombre: ${perfil.attributes?.name || "Desconocido"}`
            );

            console.log(
                `   ID: ${playerId}`
            );

            const resultado =
                await comprobarJugadorEnServidor(

                    perfil,

                    serverIdString,

                    servidor

                );

            if (!resultado) {
                continue;
            }

            candidatosValidos.push(
                resultado
            );

            console.log(

                `✅ ${playerId} → CANDIDATO VÁLIDO`

            );

        }

        // -------------------------------------------------
        // ORDENAR
        //
        // ONLINE primero.
        // Después Last Seen más reciente.
        // -------------------------------------------------

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

    obtenerServidoresJugador,

    obtenerRelatedIdentifiers,

    buscarJugadoresPorIdentificador,

    obtenerRelatedPlayerQueries,

    ejecutarRelatedPlayerQueryGuardada,

    obtenerPlayerIdDeResultadoQuery

};