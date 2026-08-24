require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN API
// =====================================================

const BM_API = "https://api.battlemetrics.com";

// =====================================================
// ZONA HORARIA
// =====================================================

const TIMEZONE_CHILE = "America/Santiago";

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
            "Error formateando fecha Chile:",
            error.message
        );

        return "No disponible";
    }
}


// =====================================================
// PARTES FECHA CHILE
// =====================================================

function obtenerPartesFechaChile(fecha) {

    const fechaReal =
        fecha instanceof Date
            ? fecha
            : new Date(fecha);

    const partes =
        new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone: TIMEZONE_CHILE,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            }
        ).formatToParts(fechaReal);

    const resultado = {};

    for (const parte of partes) {

        if (parte.type !== "literal") {
            resultado[parte.type] = Number(parte.value);
        }
    }

    return resultado;
}


// =====================================================
// CHILE -> UTC
// =====================================================

function convertirChileLocalAUTC(
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0
) {

    const aproximacion =
        new Date(
            Date.UTC(
                year,
                month - 1,
                day,
                hour,
                minute,
                second
            )
        );

    const partes =
        obtenerPartesFechaChile(
            aproximacion
        );

    const comoUTC =
        Date.UTC(
            partes.year,
            partes.month - 1,
            partes.day,
            partes.hour,
            partes.minute,
            partes.second
        );

    const objetivo =
        Date.UTC(
            year,
            month - 1,
            day,
            hour,
            minute,
            second
        );

    const diferencia =
        objetivo - comoUTC;

    return new Date(
        aproximacion.getTime() + diferencia
    );
}


// =====================================================
// INICIO SEMANA
// =====================================================

function obtenerInicioSemanaChile(fechaActual) {

    const partes =
        obtenerPartesFechaChile(
            fechaActual
        );

    const fechaChile =
        new Date(
            Date.UTC(
                partes.year,
                partes.month - 1,
                partes.day,
                0,
                0,
                0
            )
        );

    const diaSemana =
        fechaChile.getUTCDay();

    const diasDesdeLunes =
        diaSemana === 0
            ? 6
            : diaSemana - 1;

    fechaChile.setUTCDate(
        fechaChile.getUTCDate() -
        diasDesdeLunes
    );

    return convertirChileLocalAUTC(
        fechaChile.getUTCFullYear(),
        fechaChile.getUTCMonth() + 1,
        fechaChile.getUTCDate(),
        0,
        0,
        0
    );
}


// =====================================================
// INICIO MES
// =====================================================

function obtenerInicioMesChile(fechaActual) {

    const partes =
        obtenerPartesFechaChile(
            fechaActual
        );

    return convertirChileLocalAUTC(
        partes.year,
        partes.month,
        1,
        0,
        0,
        0
    );
}


// =====================================================
// SERVER ID DE SESIÓN
// =====================================================

function obtenerServerIdDeSesion(sesion) {

    if (!sesion) {
        return null;
    }

    const relationshipServer =
        sesion.relationships
            ?.server
            ?.data;

    if (relationshipServer?.id) {
        return String(
            relationshipServer.id
        );
    }

    if (sesion.attributes?.serverId) {
        return String(
            sesion.attributes.serverId
        );
    }

    return null;
}


// =====================================================
// 1. /HORAS
// =====================================================

async function searchBattleMetricsPlayer(
    playerName,
    serverId
) {

    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers: getHeaders(),

                    params: {
                        include: "player"
                    },

                    timeout: 7000
                }
            );

        const players =
            response.data?.included?.filter(
                item =>
                    item.type === "player"
            ) || [];

        const nombreBuscado =
            playerName
                .toLowerCase()
                .trim();

        const encontrados =
            players.filter(
                player => {

                    const nombreBM =
                        player.attributes?.name
                            ?.toLowerCase()
                            .trim();

                    return (
                        nombreBM ===
                        nombreBuscado
                    );
                }
            );

        if (encontrados.length > 1) {

            console.log(
                `⚠️ Nombre duplicado en BM: ${playerName}`
            );

            return {
                duplicate: true,
                players: encontrados
            };
        }

        return encontrados[0] || null;

    } catch (error) {

        console.error(
            "❌ Error buscando jugador en BM:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// 2. BÚSQUEDA GLOBAL
// =====================================================
//
// Busca el perfil por nombre.
// NO filtra por servidor.
// =====================================================

async function buscarJugadoresGlobal(playerName) {

    try {

        const nombre =
            String(playerName || "")
                .trim();

        if (!nombre) {
            return [];
        }

        console.log(
            `🌎 BM búsqueda global: "${nombre}"`
        );

        const encontrados = [];

        let url =
            `${BM_API}/players`;

        let pagina = 1;

        const limitePaginas = 10;

        while (
            url &&
            pagina <= limitePaginas
        ) {

            const response =
                await axios.get(
                    url,
                    {
                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? {
                                    "filter[search]":
                                        nombre,

                                    "page[size]":
                                        100
                                }
                                : undefined,

                        timeout: 8000
                    }
                );

            const jugadores =
                response.data?.data ||
                [];

            console.log(
                `📊 BM página ${pagina}: ${jugadores.length} perfiles`
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
                    jugador.attributes?.name
                        ?.trim()
                        .toLowerCase();

                if (
                    nombreBM !==
                    nombre.toLowerCase()
                ) {
                    continue;
                }

                if (
                    !encontrados.some(
                        existente =>
                            String(
                                existente.id
                            ) ===
                            String(
                                jugador.id
                            )
                    )
                ) {

                    encontrados.push(
                        jugador
                    );
                }
            }

            url =
                response.data?.links?.next ||
                null;

            pagina++;
        }

        console.log(
            `🌎 Perfiles exactos encontrados: ${encontrados.length}`
        );

        return encontrados;

    } catch (error) {

        console.error(
            "❌ Error búsqueda global BM:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// 3. OBTENER SERVIDORES DEL PERFIL
// =====================================================
//
// ESTA ES LA FUNCIÓN CLAVE PARA /BUSCAR.
//
// No asumimos que /players/{id}?include=server
// entregue todo el historial.
// Consultamos la relación servers del perfil.
// =====================================================

async function obtenerServidoresDelJugador(
    playerId
) {

    try {

        const url =
            `${BM_API}/players/${playerId}/relationships/servers`;

        const response =
            await axios.get(
                url,
                {
                    headers:
                        getHeaders(),

                    params: {
                        "page[size]":
                            100
                    },

                    timeout: 8000
                }
            );

        const servidores =
            response.data?.data ||
            [];

        console.log(
            `🎮 BM | Perfil ${playerId}: ${servidores.length} servidores relacionados`
        );

        return servidores;

    } catch (error) {

        console.error(
            `❌ Error obteniendo servidores del perfil ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// 4. OBTENER DATOS DE SERVIDORES INCLUIDOS
// =====================================================

async function obtenerServidorPorId(serverId) {

    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers:
                        getHeaders(),

                    timeout: 7000
                }
            );

        return response.data?.data || null;

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
// 5. SESIONES DE UN SERVIDOR
// =====================================================

async function obtenerSesionesServidor(
    playerId,
    serverId
) {

    try {

        let url =
            `${BM_API}/players/${playerId}/relationships/sessions`;

        let pagina = 1;

        const sesiones = [];

        const limitePaginas = 50;

        while (
            url &&
            pagina <= limitePaginas
        ) {

            const response =
                await axios.get(
                    url,
                    {
                        headers:
                            getHeaders(),

                        params:
                            pagina === 1
                                ? {
                                    "filter[servers]":
                                        String(serverId),

                                    "page[size]":
                                        100
                                }
                                : undefined,

                        timeout: 8000
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

            for (
                const sesion
                of data
            ) {

                const sessionServerId =
                    obtenerServerIdDeSesion(
                        sesion
                    );

                if (
                    String(
                        sessionServerId
                    ) ===
                    String(
                        serverId
                    )
                ) {

                    sesiones.push(
                        sesion
                    );
                }
            }

            url =
                response.data?.links?.next ||
                null;

            pagina++;
        }

        sesiones.sort(
            (a, b) =>
                new Date(
                    b.attributes?.start || 0
                ) -
                new Date(
                    a.attributes?.start || 0
                )
        );

        return sesiones;

    } catch (error) {

        console.error(
            `❌ Error sesiones BM ${playerId}/${serverId}:`,
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// 6. BUSCAR JUGADOR HISTÓRICO
// =====================================================
//
// /BUSCAR:
//
// cyclops
//     ↓
// perfiles globales
//     ↓
// 1179425969
//     ↓
// servidores del perfil
//     ↓
// 2788421
//     ↓
// último registro
//
// =====================================================

async function searchBattleMetricsPlayerHistory(
    playerName,
    serverId
) {

    try {

        if (
            !playerName ||
            !String(playerName).trim()
        ) {
            return null;
        }

        if (!serverId) {
            return null;
        }

        const perfiles =
            await buscarJugadoresGlobal(
                playerName
            );

        if (
            perfiles.length === 0
        ) {

            console.log(
                `❌ BM no encontró perfiles para ${playerName}`
            );

            return null;
        }

        const candidatos = [];

        // =================================================
        // REVISAR CADA PERFIL
        // =================================================

        for (
            const perfil
            of perfiles
        ) {

            const playerId =
                String(
                    perfil.id
                );

            console.log(
                `🔎 BM revisando perfil ${playerId} para servidor ${serverId}`
            );

            // ---------------------------------------------
            // SERVIDORES DEL PERFIL
            // ---------------------------------------------

            const servidoresRelacionados =
                await obtenerServidoresDelJugador(
                    playerId
                );

            const servidorEncontrado =
                servidoresRelacionados.find(
                    servidor =>
                        String(
                            servidor.id
                        ) ===
                        String(
                            serverId
                        )
                );

            // ---------------------------------------------
            // SI NO ESTÁ EN EL PERFIL
            // ---------------------------------------------

            if (
                !servidorEncontrado
            ) {

                console.log(
                    `⛔ Perfil ${playerId}: no aparece servidor ${serverId}`
                );

                continue;
            }

            // ---------------------------------------------
            // DATOS DEL SERVIDOR
            // ---------------------------------------------

            let servidorData =
                servidorEncontrado;

            // Algunos endpoints pueden devolver
            // solamente relationship data.
            // En ese caso consultamos el servidor.

            if (
                !servidorData.attributes
            ) {

                const servidorCompleto =
                    await obtenerServidorPorId(
                        serverId
                    );

                if (
                    servidorCompleto
                ) {
                    servidorData =
                        servidorCompleto;
                }
            }

            // ---------------------------------------------
            // SESIONES
            // ---------------------------------------------

            const sesiones =
                await obtenerSesionesServidor(
                    playerId,
                    serverId
                );

            // ---------------------------------------------
            // ÚLTIMA ACTIVIDAD
            // ---------------------------------------------

            let ultimaActividad = null;

            let ultimaSesion = null;

            if (
                sesiones.length > 0
            ) {

                ultimaSesion =
                    sesiones[0];

                const stop =
                    ultimaSesion.attributes?.stop;

                const start =
                    ultimaSesion.attributes?.start;

                ultimaActividad =
                    stop
                        ? new Date(stop)
                        : start
                            ? new Date(start)
                            : null;
            }

            // ---------------------------------------------
            // META DEL SERVIDOR
            // ---------------------------------------------

            const timePlayedSeconds =
                Number(
                    servidorEncontrado
                        .meta
                        ?.timePlayed
                ) || 0;

            // ---------------------------------------------
            // HORAS
            // ---------------------------------------------

            const horas =
                Math.floor(
                    timePlayedSeconds /
                    3600
                );

            const minutos =
                Math.floor(
                    (
                        timePlayedSeconds %
                        3600
                    ) / 60
                );

            const tiempoJugado =
                horas > 0
                    ? `${horas}h ${minutos}m`
                    : `${minutos}m`;

            // ---------------------------------------------
            // ONLINE
            // ---------------------------------------------

            const online =
                Boolean(
                    ultimaSesion &&
                    !ultimaSesion.attributes?.stop
                );

            // ---------------------------------------------
            // PRIMERA CONEXIÓN
            // ---------------------------------------------

            let primeraConexion = null;

            if (
                sesiones.length > 0
            ) {

                const fechas =
                    sesiones
                        .map(
                            sesion =>
                                sesion.attributes?.start
                                    ? new Date(
                                        sesion.attributes.start
                                    )
                                    : null
                        )
                        .filter(
                            fecha =>
                                fecha &&
                                !isNaN(
                                    fecha.getTime()
                                )
                        );

                if (
                    fechas.length > 0
                ) {

                    primeraConexion =
                        fechas.reduce(
                            (a, b) =>
                                a < b
                                    ? a
                                    : b
                        );
                }
            }

            // ---------------------------------------------
            // SERVIDOR
            // ---------------------------------------------

            const serverName =
                servidorData
                    ?.attributes
                    ?.name ||
                "Desconocido";

            candidatos.push({

                id:
                    playerId,

                name:
                    perfil.attributes?.name ||
                    playerName,

                serverId:
                    String(serverId),

                serverName:
                    serverName,

                online:
                    online,

                horas:
                    horas,

                minutos:
                    minutos,

                tiempoJugado:
                    tiempoJugado,

                primeraConexion:
                    formatearFechaChile(
                        primeraConexion
                    ),

                ultimaConexion:
                    formatearFechaChile(
                        ultimaActividad
                    ),

                ultimaConexionDate:
                    ultimaActividad,

                timePlayedSeconds:
                    timePlayedSeconds,

                sesiones:
                    sesiones.length
            });
        }

        // =================================================
        // NINGÚN PERFIL
        // =================================================

        if (
            candidatos.length === 0
        ) {

            console.log(
                `❌ ${playerName}: ningún perfil tiene el servidor ${serverId}`
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
                        ?.getTime() || 0;

                const fechaB =
                    b.ultimaConexionDate
                        ?.getTime() || 0;

                return (
                    fechaB -
                    fechaA
                );
            }
        );

        const jugador =
            candidatos[0];

        console.log(
            `✅ BM | ${jugador.name} (${jugador.id}) → ${jugador.serverName} (${jugador.serverId})`
        );

        console.log(
            `📅 BM | Última conexión: ${jugador.ultimaConexion}`
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
            "❌ Error en búsqueda histórica BM:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// 7. STATUS COMPLETO
// =====================================================
//
// Mantiene compatibilidad con /HORAS.
// =====================================================

async function getBattleMetricsPlayerStatus(
    playerId,
    targetServerId = null
) {

    try {

        console.log(
            `🔎 BM | Obteniendo status ${playerId}` +
            (
                targetServerId
                    ? ` en ${targetServerId}`
                    : ""
            )
        );

        const playerResponse =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers:
                        getHeaders(),

                    params: {
                        include:
                            "server"
                    },

                    timeout: 8000
                }
            );

        const player =
            playerResponse.data?.data;

        if (!player) {
            return null;
        }

        const playerAttributes =
            player.attributes || {};

        const servidores =
            playerResponse.data?.included?.filter(
                item =>
                    item.type === "server"
            ) || [];

        let segundosTotales = 0;

        if (targetServerId) {

            const servidorObjetivo =
                servidores.find(
                    servidor =>
                        String(
                            servidor.id
                        ) ===
                        String(
                            targetServerId
                        )
                );

            if (servidorObjetivo) {

                segundosTotales =
                    Number(
                        servidorObjetivo
                            .meta
                            ?.timePlayed
                    ) || 0;
            }

        } else {

            for (
                const servidor
                of servidores
            ) {

                segundosTotales +=
                    Number(
                        servidor.meta?.timePlayed
                    ) || 0;
            }
        }

        // =================================================
        // SESIONES
        // =================================================

        let sesiones = [];

        try {

            let url =
                `${BM_API}/players/${playerId}/relationships/sessions`;

            let pagina = 1;

            while (
                url &&
                pagina <= 50
            ) {

                const response =
                    await axios.get(
                        url,
                        {
                            headers:
                                getHeaders(),

                            params:
                                pagina === 1
                                    ? {
                                        "page[size]":
                                            100,

                                        ...(targetServerId
                                            ? {
                                                "filter[servers]":
                                                    String(
                                                        targetServerId
                                                    )
                                            }
                                            : {})
                                    }
                                    : undefined,

                            timeout: 8000
                        }
                    );

                const data =
                    response.data?.data ||
                    [];

                if (!data.length) {
                    break;
                }

                sesiones.push(
                    ...data
                );

                url =
                    response.data?.links?.next ||
                    null;

                pagina++;
            }

        } catch (error) {

            console.error(
                "❌ Error obteniendo sesiones:",
                error.response?.data ||
                error.message
            );
        }

        // =================================================
        // FILTRAR SERVER
        // =================================================

        if (targetServerId) {

            sesiones =
                sesiones.filter(
                    sesion =>
                        String(
                            obtenerServerIdDeSesion(
                                sesion
                            )
                        ) ===
                        String(
                            targetServerId
                        )
                );
        }

        sesiones.sort(
            (a, b) =>
                new Date(
                    b.attributes?.start || 0
                ) -
                new Date(
                    a.attributes?.start || 0
                )
        );

        const ahora =
            new Date();

        const inicioSemana =
            obtenerInicioSemanaChile(
                ahora
            );

        const inicioMes =
            obtenerInicioMesChile(
                ahora
            );

        const sesionActiva =
            sesiones.find(
                sesion =>
                    !sesion.attributes?.stop
            );

        const online =
            Boolean(
                sesionActiva
            );

        let tiempoJugando =
            "0m";

        if (sesionActiva) {

            const inicio =
                new Date(
                    sesionActiva
                        .attributes
                        ?.start
                );

            if (
                !isNaN(
                    inicio.getTime()
                )
            ) {

                const segundos =
                    Math.max(
                        0,
                        Math.floor(
                            (
                                ahora -
                                inicio
                            ) / 1000
                        )
                    );

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

                tiempoJugando =
                    horas > 0
                        ? `${horas}h ${minutos}m`
                        : `${minutos}m`;
            }
        }

        let segundosSesionesTotales = 0;
        let segundosSemana = 0;
        let segundosMes = 0;

        let ultimaConexion = null;
        let primeraConexion = null;

        for (
            const sesion
            of sesiones
        ) {

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

            if (
                !primeraConexion ||
                inicio < primeraConexion
            ) {

                primeraConexion =
                    inicio;
            }

            let fin =
                atributos.stop
                    ? new Date(
                        atributos.stop
                    )
                    : (
                        sesion === sesionActiva
                            ? ahora
                            : null
                    );

            if (
                !fin ||
                isNaN(
                    fin.getTime()
                )
            ) {
                continue;
            }

            const duracion =
                Math.max(
                    0,
                    Math.floor(
                        (
                            fin -
                            inicio
                        ) / 1000
                    )
                );

            segundosSesionesTotales +=
                duracion;

            if (
                fin >= inicioSemana &&
                inicio <= ahora
            ) {

                const inicioReal =
                    inicio < inicioSemana
                        ? inicioSemana
                        : inicio;

                const finReal =
                    fin > ahora
                        ? ahora
                        : fin;

                segundosSemana +=
                    Math.max(
                        0,
                        Math.floor(
                            (
                                finReal -
                                inicioReal
                            ) / 1000
                        )
                    );
            }

            if (
                fin >= inicioMes &&
                inicio <= ahora
            ) {

                const inicioReal =
                    inicio < inicioMes
                        ? inicioMes
                        : inicio;

                const finReal =
                    fin > ahora
                        ? ahora
                        : fin;

                segundosMes +=
                    Math.max(
                        0,
                        Math.floor(
                            (
                                finReal -
                                inicioReal
                            ) / 1000
                        )
                    );
            }

            if (
                atributos.stop
            ) {

                if (
                    !ultimaConexion ||
                    fin > ultimaConexion
                ) {

                    ultimaConexion =
                        fin;
                }
            }
        }

        if (
            segundosSesionesTotales >
            segundosTotales
        ) {

            segundosTotales =
                segundosSesionesTotales;
        }

        const horasTotalesBM =
            Math.floor(
                segundosTotales / 3600
            );

        const horasSemana =
            Math.floor(
                segundosSemana / 3600
            );

        const horasMes =
            Math.floor(
                segundosMes / 3600
            );

        // =================================================
        // SERVIDOR
        // =================================================

        let nombreServidor =
            "Desconocido";

        const servidorActual =
            targetServerId ||
            (
                sesionActiva
                    ? obtenerServerIdDeSesion(
                        sesionActiva
                    )
                    : null
            );

        if (servidorActual) {

            const servidor =
                servidores.find(
                    item =>
                        String(
                            item.id
                        ) ===
                        String(
                            servidorActual
                        )
                );

            if (servidor) {

                nombreServidor =
                    servidor.attributes?.name ||
                    "Desconocido";
            }
        }

        // =================================================
        // HISTORIAL NOMBRES
        // =================================================

        let historialNombres = [];

        try {

            const response =
                await axios.get(
                    `${BM_API}/players/${playerId}/relationships/identifiers`,
                    {
                        headers:
                            getHeaders(),

                        params: {
                            "page[size]":
                                100
                        },

                        timeout: 5000
                    }
                );

            const identifiers =
                response.data?.data ||
                [];

            historialNombres =
                [
                    ...new Set(
                        identifiers
                            .map(
                                identifier =>
                                    identifier
                                        .attributes
                                        ?.identifier
                            )
                            .filter(Boolean)
                    )
                ].slice(0, 3);

        } catch (error) {

            if (
                error.response?.status !==
                405
            ) {

                console.log(
                    "⚠️ No se pudo obtener historial de nombres:",
                    error.message
                );
            }
        }

        return {

            id:
                player.id,

            name:
                playerAttributes.name ||
                "Desconocido",

            online:
                online,

            jugando:
                tiempoJugando,

            horasTotalesBM:
                horasTotalesBM,

            horasSemana:
                horasSemana,

            horasMes:
                horasMes,

            ultimaConexion:
                formatearFechaChile(
                    ultimaConexion
                ),

            primeraConexion:
                formatearFechaChile(
                    primeraConexion
                ),

            server:
                nombreServidor,

            serverId:
                servidorActual,

            historialNombres:
                historialNombres
        };

    } catch (error) {

        console.error(
            "❌ Error obteniendo status BM:",
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// 8. RANKING
// =====================================================

async function getServerLeaderboard(serverId) {

    try {

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers:
                        getHeaders(),

                    params: {
                        include:
                            "player"
                    },

                    timeout: 7000
                }
            );

        const players =
            (
                response.data?.included ||
                []
            ).filter(
                item =>
                    item.type ===
                    "player"
            );

        return players
            .map(
                player => ({

                    id:
                        player.id,

                    name:
                        player.attributes?.name ||
                        "Desconocido",

                    timePlayedSeconds:
                        Number(
                            player.meta?.timePlayed
                        ) || 0
                })
            )
            .sort(
                (a, b) =>
                    b.timePlayedSeconds -
                    a.timePlayedSeconds
            );

    } catch (error) {

        console.error(
            "❌ Error ranking BM:",
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

    searchBattleMetricsPlayer,

    buscarJugadoresGlobal,

    obtenerServidoresDelJugador,

    obtenerServidorPorId,

    obtenerSesionesServidor,

    searchBattleMetricsPlayerHistory,

    getBattleMetricsPlayerStatus,

    getServerLeaderboard

};