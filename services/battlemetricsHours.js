const axios = require("axios");

const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

const API = "https://api.battlemetrics.com";
const WEB_API = "https://www.battlemetrics.com/_api";

const HEADERS = {
    Authorization: `Bearer ${BATTLEMETRICS_TOKEN}`,
    Accept: "application/json"
};

const REQUEST_TIMEOUT = 30000;

const axiosBM = axios.create({
    baseURL: API,
    headers: HEADERS,
    timeout: REQUEST_TIMEOUT
});

const axiosBMWeb = axios.create({
    baseURL: WEB_API,
    headers: HEADERS,
    timeout: REQUEST_TIMEOUT
});


// ============================================================
// UTILIDADES
// ============================================================

function segundosAHoras(segundos) {
    segundos = Number(segundos) || 0;

    if (segundos <= 0) {
        return "0h";
    }

    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (horas === 0) {
        return `${minutos}m`;
    }

    if (minutos === 0) {
        return `${horas}h`;
    }

    return `${horas}h ${minutos}m`;
}

function formatearDuracion(segundos) {
    segundos = Number(segundos) || 0;

    if (segundos <= 0) {
        return "0h";
    }

    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (dias > 0) {
        return `${dias}d ${horas}h ${minutos}m`;
    }

    if (horas > 0) {
        return `${horas}h ${minutos}m`;
    }

    return `${minutos}m`;
}

function obtenerFechaChile(fecha) {
    if (!fecha) {
        return null;
    }

    try {
        return new Date(fecha).toLocaleString("es-CL", {
            timeZone: "America/Santiago",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        });
    } catch {
        return fecha;
    }
}

function obtenerPartesChile(fecha = new Date()) {
    const partes = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Santiago",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(fecha);

    const resultado = {};

    for (const parte of partes) {
        if (parte.type !== "literal") {
            resultado[parte.type] = Number(parte.value);
        }
    }

    return resultado;
}

function crearFechaChile(
    year,
    month,
    day,
    hour = 0,
    minute = 0,
    second = 0
) {
    const utcInicial = new Date(
        Date.UTC(
            year,
            month - 1,
            day,
            hour,
            minute,
            second
        )
    );

    const partes = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Santiago",
        timeZoneName: "shortOffset",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    }).formatToParts(utcInicial);

    const zona =
        partes.find(parte => parte.type === "timeZoneName")?.value ||
        "GMT-3";

    const match = zona.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);

    let offsetMinutos = -180;

    if (match) {
        const signo = match[1] === "-" ? -1 : 1;
        const horas = Number(match[2]) || 0;
        const minutos = Number(match[3]) || 0;

        offsetMinutos = signo * (horas * 60 + minutos);
    }

    return new Date(
        utcInicial.getTime() -
        offsetMinutos * 60 * 1000
    );
}

function obtenerInicioSemanaChile(fecha = new Date()) {
    const partes = obtenerPartesChile(fecha);

    const fechaChile = new Date(
        Date.UTC(
            partes.year,
            partes.month - 1,
            partes.day
        )
    );

    const diaSemana = fechaChile.getUTCDay();
    const diferencia = diaSemana === 0 ? 6 : diaSemana - 1;

    fechaChile.setUTCDate(
        fechaChile.getUTCDate() - diferencia
    );

    return crearFechaChile(
        fechaChile.getUTCFullYear(),
        fechaChile.getUTCMonth() + 1,
        fechaChile.getUTCDate(),
        0,
        0,
        0
    );
}

function obtenerInicioMesChile(fecha = new Date()) {
    const partes = obtenerPartesChile(fecha);

    return crearFechaChile(
        partes.year,
        partes.month,
        1,
        0,
        0,
        0
    );
}


// ============================================================
// SESIONES
// ============================================================

function esSesionActiva(session) {
    if (!session || !session.attributes) {
        return false;
    }

    const a = session.attributes;

    if (a.stop === null || typeof a.stop === "undefined") {
        return true;
    }

    return (
        a.active === true ||
        a.online === true ||
        a.connected === true
    );
}

function obtenerTiempoSesionActual(session) {
    if (!session?.attributes?.start) {
        return null;
    }

    const inicio = new Date(
        session.attributes.start
    ).getTime();

    if (
        !Number.isFinite(inicio) ||
        inicio > Date.now()
    ) {
        return null;
    }

    return Math.floor(
        (Date.now() - inicio) / 1000
    );
}

function obtenerServerIdDeSesion(session) {
    if (!session) {
        return null;
    }

    const id =
        session.relationships?.server?.data?.id;

    return id ? String(id) : null;
}


// ============================================================
// EXTRAER JUGADORES DE RESPUESTAS DE BATTLEMETRICS
// ============================================================

function extraerJugadoresRespuesta(responseData) {
    const jugadores = [];

    if (!responseData) {
        return jugadores;
    }

    if (Array.isArray(responseData.data)) {
        jugadores.push(...responseData.data);
    } else if (
        responseData.data &&
        typeof responseData.data === "object"
    ) {
        if (
            responseData.data.type === "player" ||
            responseData.data.attributes?.name
        ) {
            jugadores.push(responseData.data);
        }
    }

    if (Array.isArray(responseData.included)) {
        for (const recurso of responseData.included) {
            if (recurso?.type === "player") {
                jugadores.push(recurso);
            }
        }
    }

    const unicos = new Map();

    for (const jugador of jugadores) {
        if (!jugador) {
            continue;
        }

        const id = jugador.id
            ? String(jugador.id)
            : null;

        const nombre = jugador.attributes?.name
            ? String(jugador.attributes.name)
            : "";

        const clave = id || nombre.toLowerCase();

        if (clave && !unicos.has(clave)) {
            unicos.set(clave, jugador);
        }
    }

    return Array.from(unicos.values());
}


// ============================================================
// BUSCAR JUGADOR EXCLUSIVAMENTE EN EL SERVIDOR CONFIGURADO
// No realiza búsquedas globales en BattleMetrics.
// ============================================================

async function searchBattleMetricsPlayer(playerName, serverId) {
    if (!playerName || !String(playerName).trim() || !serverId) {
        return null;
    }

    const nombreBuscado = String(playerName)
        .trim()
        .toLowerCase();

    const servidor = String(serverId).trim();

    console.log(
        `🔎 BM | Buscando "${playerName}" exclusivamente en servidor ${servidor}`
    );

    try {
        const response = await axiosBM.get(
            `/servers/${servidor}`,
            {
                params: {
                    include: "player"
                }
            }
        );

        const jugadores = extraerJugadoresRespuesta(
            response.data
        );

        console.log(
            `🔎 BM | Servidor ${servidor}: ${jugadores.length} recursos de jugadores recibidos`
        );

        const encontrados = jugadores.filter(jugador => {
            const nombreBM = String(
                jugador.attributes?.name || ""
            ).trim().toLowerCase();

            return nombreBM === nombreBuscado;
        });

        console.log(
            `🔎 BM | Coincidencias exactas en servidor ${servidor}: ${encontrados.length}`
        );

        if (encontrados.length === 0) {
            console.log(
                `⚠️ BM | "${playerName}" no aparece en los recursos devueltos por el servidor ${servidor}.`
            );

            return null;
        }

        if (encontrados.length > 1) {
            return {
                duplicate: true,
                players: encontrados.map(jugador => ({
                    id: String(jugador.id),
                    attributes: jugador.attributes
                }))
            };
        }

        return {
            duplicate: false,
            id: String(encontrados[0].id),
            nombre:
                encontrados[0].attributes?.name ||
                playerName
        };
    } catch (error) {
        console.error(
            `❌ BM | Error buscando en servidor ${servidor}:`,
            error.response?.data || error.message
        );

        return null;
    }
}


// ============================================================
// INFORMACIÓN DE SERVIDOR
// ============================================================

async function obtenerInfoServidor(serverId, cache = new Map()) {
    if (!serverId) {
        return null;
    }

    const id = String(serverId);

    if (cache.has(id)) {
        return cache.get(id);
    }

    try {
        let response;

        try {
            response = await axiosBM.get(
                `/servers/${id}`,
                {
                    params: {
                        include: "game"
                    }
                }
            );
        } catch {
            response = await axiosBM.get(
                `/servers/${id}`
            );
        }

        const servidor = response.data.data;

        if (!servidor) {
            return null;
        }

        const attributes = servidor.attributes || {};
        const relationships = servidor.relationships || {};

        const gameName =
            relationships.game?.data?.id ||
            attributes.game ||
            "";

        const nombre =
            attributes.name ||
            `Servidor ${id}`;

        const textoGame = String(gameName).toLowerCase();

        const esRust =
            textoGame.includes("rust") ||
            nombre.toLowerCase().includes("rust");

        const timePlayed =
            servidor.meta &&
            typeof servidor.meta.timePlayed !== "undefined"
                ? Number(servidor.meta.timePlayed)
                : 0;

        const resultado = {
            id,
            nombre,
            game: gameName,
            esRust,
            ip: attributes.ip || null,
            port: attributes.port || null,
            timePlayed
        };

        cache.set(id, resultado);

        return resultado;
    } catch (error) {
        console.error(
            `⚠️ BM | No se pudo obtener servidor ${id}:`,
            error.response?.data || error.message
        );

        return null;
    }
}


// ============================================================
// OBTENER TODAS LAS SESIONES DEL JUGADOR
// ============================================================

async function obtenerTodasLasSesiones(playerId) {
    const sesiones = [];

    try {
        let nextUrl =
            `/players/${playerId}/relationships/sessions`;

        let pagina = 0;

        while (nextUrl && pagina < 100) {
            const response = await axiosBM.get(
                nextUrl,
                {
                    params: pagina === 0
                        ? {
                            "page[size]": 100
                        }
                        : undefined
                }
            );

            const data = Array.isArray(response.data.data)
                ? response.data.data
                : [];

            if (data.length === 0) {
                break;
            }

            sesiones.push(...data);

            const total = Number(response.data.meta?.total);

            if (
                Number.isFinite(total) &&
                total >= 0 &&
                sesiones.length >= total
            ) {
                break;
            }

            const next = response.data.links?.next || null;

            if (!next) {
                break;
            }

            nextUrl = next;
            pagina++;
        }
    } catch (error) {
        console.error(
            "❌ BM | Error obteniendo sesiones:",
            error.response?.data || error.message
        );
    }

    console.log(
        `📊 BM | Sesiones obtenidas: ${sesiones.length}`
    );

    return sesiones;
}


// ============================================================
// HORAS DIRECTAS DEL JUGADOR EN UN SERVIDOR
// ============================================================

async function obtenerHorasJugadorServidor(playerId, serverId) {
    if (!playerId || !serverId) {
        return null;
    }

    const player = String(playerId);
    const server = String(serverId);

    console.log(
        `🎯 BM | Consultando horas directas: jugador ${player} -> servidor ${server}`
    );

    // Método 1: relación jugador-servidor.
    try {
        const response = await axiosBM.get(
            `/players/${player}/servers/${server}`
        );

        const data = response.data.data;
        const attributes = data?.attributes || {};
        const meta = data?.meta || {};

        const candidatos = [
            meta.timePlayed,
            meta.timeplayed,
            attributes.timePlayed,
            attributes.timeplayed,
            attributes.seconds,
            attributes.totalTime,
            attributes.totalSeconds
        ];

        let segundos = 0;

        for (const valor of candidatos) {
            if (
                valor !== null &&
                typeof valor !== "undefined" &&
                !isNaN(Number(valor))
            ) {
                segundos = Number(valor);

                if (segundos > 0) {
                    break;
                }
            }
        }

        console.log(
            `🎯 BM | /servers/${server} -> ${segundosAHoras(segundos)}`
        );

        if (segundos > 0) {
            return {
                id: server,
                segundos,
                tiempo: segundosAHoras(segundos),
                origen: "player-server"
            };
        }
    } catch (error) {
        console.log(
            `⚠️ BM | Player server no entregó horas para ${server}:`,
            error.response?.status || error.message
        );
    }

    // Método 2: historial de tiempo jugado.
    try {
        const response = await axiosBM.get(
            `/players/${player}/time-played-history/${server}`
        );

        const data = response.data.data || [];
        const meta = response.data.meta || {};

        let segundos = 0;

        const candidatosMeta = [
            meta.timePlayed,
            meta.timeplayed,
            meta.totalTime,
            meta.totalSeconds,
            meta.seconds
        ];

        for (const valor of candidatosMeta) {
            if (
                valor !== null &&
                typeof valor !== "undefined" &&
                !isNaN(Number(valor))
            ) {
                segundos = Number(valor);

                if (segundos > 0) {
                    break;
                }
            }
        }

        if (segundos <= 0 && Array.isArray(data)) {
            for (const registro of data) {
                const a = registro.attributes || {};

                const valores = [
                    a.timePlayed,
                    a.timeplayed,
                    a.seconds,
                    a.duration,
                    a.totalTime,
                    a.totalSeconds,
                    registro.meta?.timePlayed,
                    registro.meta?.seconds
                ];

                let encontrado = 0;

                for (const valor of valores) {
                    if (
                        valor !== null &&
                        typeof valor !== "undefined" &&
                        !isNaN(Number(valor))
                    ) {
                        encontrado = Number(valor);

                        if (encontrado > 0) {
                            break;
                        }
                    }
                }

                segundos += encontrado;
            }
        }

        console.log(
            `🎯 BM | time-played-history ${server} -> ${segundosAHoras(segundos)}`
        );

        if (segundos > 0) {
            return {
                id: server,
                segundos,
                tiempo: segundosAHoras(segundos),
                origen: "time-played-history"
            };
        }
    } catch (error) {
        console.log(
            `⚠️ BM | time-played-history no disponible para ${server}:`,
            error.response?.status || error.message
        );
    }

    return null;
}


// ============================================================
// TOTAL TIME PLAYED DEL OVERVIEW DE BATTLEMETRICS
// ============================================================

async function obtenerTotalOverviewBattleMetrics(playerId) {
    try {
        const stop = new Date();
        const start = new Date(stop);

        start.setUTCDate(start.getUTCDate() - 30);

        const response = await axiosBM.get(
            `/players/${playerId}/time-played-statistics`,
            {
                params: {
                    start: start.toISOString(),
                    stop: stop.toISOString()
                }
            }
        );

        const estadisticas = response.data?.data;

        if (!Array.isArray(estadisticas)) {
            console.warn(
                `[BM] Estadísticas sin formato válido para ${playerId}`
            );

            return 0;
        }

        const estadisticaRust = estadisticas.find(
            item =>
                item.type === "playerTimePlayedStatistics" &&
                item.relationships?.game?.data?.id === "rust"
        );

        const tiempoJugado = Number(
            estadisticaRust?.attributes?.timePlayed
        );

        if (
            !Number.isFinite(tiempoJugado) ||
            tiempoJugado <= 0
        ) {
            console.warn(
                `[BM] No se encontró un total válido para ${playerId}`
            );

            return 0;
        }

        console.log(
            `[BM] Total de Rust para ${playerId}: ${tiempoJugado} segundos`
        );

        return tiempoJugado;
    } catch (error) {
        console.error(
            `[BM] Error obteniendo el total de horas de ${playerId}:`,
            error.response?.data || error.message
        );

        return 0;
    }
}


// ============================================================
// TOP DE SERVIDORES RUST
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    sesiones = [],
    servidoresMap = new Map()
) {
    const acumulados = new Map();
    const ahora = Date.now();

    for (const session of sesiones) {
        const attributes = session.attributes || {};
        const serverId = obtenerServerIdDeSesion(session);

        if (!serverId || !attributes.start) {
            continue;
        }

        const inicio = new Date(attributes.start).getTime();

        if (
            !Number.isFinite(inicio) ||
            inicio > ahora
        ) {
            continue;
        }

        let fin;

        if (attributes.stop) {
            fin = new Date(attributes.stop).getTime();
        } else if (esSesionActiva(session)) {
            fin = ahora;
        } else {
            continue;
        }

        if (
            !Number.isFinite(fin) ||
            fin <= inicio
        ) {
            continue;
        }

        const segundos = Math.floor(
            (fin - inicio) / 1000
        );

        const id = String(serverId);

        if (!acumulados.has(id)) {
            acumulados.set(id, 0);
        }

        acumulados.set(
            id,
            acumulados.get(id) + segundos
        );
    }

    const servidoresEncontrados = [];
    let totalSegundos = 0;

    for (const [serverId, segundos] of acumulados.entries()) {
        let servidor = servidoresMap.get(serverId);

        if (!servidor) {
            servidor = await obtenerInfoServidor(
                serverId,
                servidoresMap
            );
        }

        if (!servidor) {
            continue;
        }

        const nombre = String(servidor.nombre || "");
        const game = String(servidor.game || "");

        const esRust =
            servidor.esRust === true ||
            game.toLowerCase().includes("rust") ||
            nombre.toLowerCase().includes("rust");

        if (!esRust) {
            continue;
        }

        const registro = {
            id: String(serverId),
            nombre: servidor.nombre || `Servidor ${serverId}`,
            game: servidor.game || "rust",
            segundos,
            tiempo: segundosAHoras(segundos)
        };

        servidoresEncontrados.push(registro);
        totalSegundos += segundos;
    }

    servidoresEncontrados.sort(
        (a, b) => b.segundos - a.segundos
    );

    const top10 = servidoresEncontrados.slice(0, 10);

    console.log(
        `📊 BM | Servidores Rust con sesiones: ${servidoresEncontrados.length}`
    );

    return {
        top10,
        cantidadServidoresRust: servidoresEncontrados.length,
        totalSegundos,
        servidoresEncontrados
    };
}


// ============================================================
// ESTADO DEL JUGADOR
// ============================================================

async function getBattleMetricsPlayerStatus(
    playerId,
    configuredServerId = null
) {
    try {
        console.log("\n==========================================");
        console.log(`🔎 BM | Analizando jugador ${playerId}`);

        console.log(
            `🎯 BM | Servidor configurado: ${
                configuredServerId || "NINGUNO"
            }`
        );

        console.log("==========================================");

        // DATOS DEL JUGADOR
        const playerResponse = await axiosBM.get(
            `/players/${playerId}`,
            {
                params: {
                    include: "server"
                }
            }
        );

        const player = playerResponse.data.data;

        if (!player) {
            throw new Error("Jugador no encontrado");
        }

        const nombre =
            player.attributes?.name || "Desconocido";

        // TOTAL DEL OVERVIEW
        const totalOverviewBM =
            await obtenerTotalOverviewBattleMetrics(playerId);

        // SERVIDORES INCLUIDOS
        const servidoresMap = new Map();

        const included = Array.isArray(
            playerResponse.data.included
        )
            ? playerResponse.data.included
            : [];

        for (const recurso of included) {
            if (
                recurso.type !== "server" ||
                !recurso.id
            ) {
                continue;
            }

            const id = String(recurso.id);
            const attributes = recurso.attributes || {};
            const nombreServidor =
                attributes.name || `Servidor ${id}`;

            const game = attributes.game || "";

            const esRust =
                String(game).toLowerCase().includes("rust") ||
                nombreServidor.toLowerCase().includes("rust");

            const timePlayed =
                recurso.meta &&
                typeof recurso.meta.timePlayed !== "undefined"
                    ? Number(recurso.meta.timePlayed)
                    : 0;

            servidoresMap.set(id, {
                id,
                nombre: nombreServidor,
                game,
                esRust,
                timePlayed
            });
        }

        // SESIONES
        const todasLasSesiones =
            await obtenerTodasLasSesiones(playerId);

        // Completar servidores referenciados en las sesiones.
        for (const session of todasLasSesiones) {
            const serverId =
                obtenerServerIdDeSesion(session);

            if (!serverId) {
                continue;
            }

            const id = String(serverId);

            if (!servidoresMap.has(id)) {
                await obtenerInfoServidor(
                    id,
                    servidoresMap
                );
            }
        }

        // SESIÓN ACTIVA
        let sesionActiva = null;
        let sesionActivaRust = null;
        let servidorActualRust = null;

        for (const session of todasLasSesiones) {
            if (!esSesionActiva(session)) {
                continue;
            }

            const serverId =
                obtenerServerIdDeSesion(session);

            if (!serverId) {
                continue;
            }

            let servidor = servidoresMap.get(
                String(serverId)
            );

            if (!servidor) {
                servidor = await obtenerInfoServidor(
                    serverId,
                    servidoresMap
                );
            }

            if (!sesionActiva) {
                sesionActiva = session;
            }

            if (servidor && servidor.esRust) {
                sesionActivaRust = session;
                servidorActualRust = servidor;
                break;
            }
        }

        // ESTADO Y DURACIÓN DE LA SESIÓN ACTUAL
        const online = Boolean(sesionActiva);

        const jugando =
            sesionActivaRust && servidorActualRust
                ? servidorActualRust.nombre
                : null;

        const sesionActual =
            sesionActivaRust || sesionActiva;

        const segundosSesionActual =
            online && sesionActual
                ? obtenerTiempoSesionActual(sesionActual)
                : null;

        const tiempoSesionActual =
            segundosSesionActual !== null
                ? segundosAHoras(segundosSesionActual)
                : null;

        // HORAS DE SESIONES
        let segundosTotalesSesiones = 0;
        let segundosSemana = 0;
        let segundosMes = 0;
        let ultimaConexion = null;

        const ahoraDate = new Date();

        const inicioSemana =
            obtenerInicioSemanaChile(ahoraDate);

        const inicioMes =
            obtenerInicioMesChile(ahoraDate);

        for (const session of todasLasSesiones) {
            const a = session.attributes || {};

            if (!a.start) {
                continue;
            }

            const inicio = new Date(a.start);

            let fin;

            if (a.stop) {
                fin = new Date(a.stop);
            } else if (esSesionActiva(session)) {
                fin = ahoraDate;
            } else {
                continue;
            }

            if (
                !Number.isFinite(inicio.getTime()) ||
                !Number.isFinite(fin.getTime()) ||
                fin.getTime() <= inicio.getTime()
            ) {
                continue;
            }

            const segundos = Math.floor(
                (fin.getTime() - inicio.getTime()) / 1000
            );

            segundosTotalesSesiones += segundos;

            // Semana actual en horario de Chile.
            if (fin.getTime() > inicioSemana.getTime()) {
                const inicioReal =
                    inicio.getTime() > inicioSemana.getTime()
                        ? inicio
                        : inicioSemana;

                const finReal =
                    fin.getTime() < ahoraDate.getTime()
                        ? fin
                        : ahoraDate;

                if (
                    finReal.getTime() >
                    inicioReal.getTime()
                ) {
                    segundosSemana += Math.floor(
                        (
                            finReal.getTime() -
                            inicioReal.getTime()
                        ) / 1000
                    );
                }
            }

            // Mes actual en horario de Chile.
            if (fin.getTime() > inicioMes.getTime()) {
                const inicioReal =
                    inicio.getTime() > inicioMes.getTime()
                        ? inicio
                        : inicioMes;

                const finReal =
                    fin.getTime() < ahoraDate.getTime()
                        ? fin
                        : ahoraDate;

                if (
                    finReal.getTime() >
                    inicioReal.getTime()
                ) {
                    segundosMes += Math.floor(
                        (
                            finReal.getTime() -
                            inicioReal.getTime()
                        ) / 1000
                    );
                }
            }

            // Última conexión registrada.
            if (
                !ultimaConexion ||
                fin > ultimaConexion
            ) {
                ultimaConexion = fin;
            }
        }

        // HORAS EN EL SERVIDOR CONFIGURADO
        let horasServidorConfigurado = null;
        let jugandoServidorConfigurado = false;

        if (
            configuredServerId &&
            servidorActualRust &&
            String(servidorActualRust.id) ===
                String(configuredServerId)
        ) {
            jugandoServidorConfigurado = true;

            const horasDirectas =
                await obtenerHorasJugadorServidor(
                    playerId,
                    configuredServerId
                );

            if (horasDirectas) {
                horasServidorConfigurado = {
                    id: String(configuredServerId),
                    tiempo: horasDirectas.tiempo,
                    segundos:
                        Number(horasDirectas.segundos) || 0
                };
            }
        }

        // TOP 10 Y SERVIDORES RUST
        const resultadoServidores =
            await obtenerTopServidoresRust(
                playerId,
                todasLasSesiones,
                servidoresMap
            );

        const topServidoresRust =
            resultadoServidores.top10;

        const cantidadServidoresRust =
            resultadoServidores.cantidadServidoresRust;

        // TOTAL DE BATTLEMETRICS
        let horasTotalesBM =
            Number(totalOverviewBM) || 0;

        if (horasTotalesBM <= 0) {
            console.log(
                "⚠️ BM | Overview no entregó total; usando fallback de servidores"
            );

            horasTotalesBM =
                Number(resultadoServidores.totalSegundos) || 0;
        }

        if (horasTotalesBM <= 0) {
            console.log(
                "⚠️ BM | Fallback de servidores vacío; usando sesiones"
            );

            horasTotalesBM = segundosTotalesSesiones;
        }

        console.log(
            `🎯 BM | TOTAL FINAL: ${segundosAHoras(horasTotalesBM)}`
        );

        // HISTORIAL DE NOMBRES
        let historialNombres = [];

        try {
            const identifiersResponse =
                await axiosBM.get(
                    `/players/${playerId}/relationships/identifiers`,
                    {
                        params: {
                            "page[size]": 100
                        }
                    }
                );

            const identifiers = Array.isArray(
                identifiersResponse.data.data
            )
                ? identifiersResponse.data.data
                : [];

            historialNombres = identifiers
                .map(item => {
                    if (item.attributes?.identifier) {
                        return item.attributes.identifier;
                    }

                    if (item.attributes?.name) {
                        return item.attributes.name;
                    }

                    return null;
                })
                .filter(Boolean)
                .filter(
                    (value, index, array) =>
                        array.indexOf(value) === index
                )
                .slice(0, 3);
        } catch {
            console.log(
                "⚠️ BM | Historial de nombres no disponible"
            );
        }

        // SERVIDOR PARA MOSTRAR
        const servidorRespuesta =
            servidorActualRust || null;

        // RESULTADO FINAL
        return {
            id: playerId,
            nombre,
            name: nombre,

            online,
            jugando,

            segundosSesionActual,
            tiempoSesionActual,

            horasTotalesBM,

            totalHoras:
                segundosAHoras(horasTotalesBM),

            horasSemana:
                segundosAHoras(segundosSemana),

            horasMes:
                segundosAHoras(segundosMes),

            ultimaConexion:
                ultimaConexion
                    ? obtenerFechaChile(ultimaConexion)
                    : "Nunca",

            servidor:
                servidorRespuesta
                    ? servidorRespuesta.nombre
                    : null,

            server:
                servidorRespuesta
                    ? servidorRespuesta.nombre
                    : null,

            servidorActualRust:
                servidorRespuesta
                    ? {
                        id: String(servidorRespuesta.id),
                        nombre: servidorRespuesta.nombre,
                        game: servidorRespuesta.game
                    }
                    : null,

            horasServidorConfigurado,
            jugandoServidorConfigurado,

            cantidadServidoresRust,
            topServidoresRust,

            servidoresEncontrados:
                resultadoServidores.servidoresEncontrados,

            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados:
                            resultadoServidores.servidoresEncontrados,

                        cantidad: cantidadServidoresRust
                    }
                }
            },

            historialNombres
        };
    } catch (error) {
        console.error(
            "❌ BM | Error general:",
            error.response?.data || error.message
        );

        return null;
    }
}


// ============================================================
// GET BATTLEMETRICS HOURS
// ============================================================

async function getBattleMetricsHours(
    playerId,
    configuredServerId = null
) {
    const datos =
        await getBattleMetricsPlayerStatus(
            playerId,
            configuredServerId
        );

    if (!datos) {
        return null;
    }

    return {
        totalHoras: datos.totalHoras,
        horasSemana: datos.horasSemana,
        horasMes: datos.horasMes,
        ultimaConexion: datos.ultimaConexion,
        servidor: datos.servidor,
        servidorActualRust: datos.servidorActualRust,
        cantidadServidoresRust: datos.cantidadServidoresRust,
        topServidoresRust: datos.topServidoresRust,
        servidoresEncontrados: datos.servidoresEncontrados,
        horasServidorConfigurado: datos.horasServidorConfigurado
    };
}


// ============================================================
// LEADERBOARD
// ============================================================

async function getServerLeaderboard(serverId) {
    try {
        const response = await axiosBM.get(
            `/servers/${serverId}`,
            {
                params: {
                    include: "player"
                }
            }
        );

        const jugadores =
            extraerJugadoresRespuesta(response.data);

        return jugadores
            .map(jugador => ({
                id: jugador.id,
                nombre:
                    jugador.attributes?.name ||
                    "Desconocido"
            }))
            .filter(jugador => jugador.nombre);
    } catch (error) {
        console.error(
            "❌ BM | Error leaderboard:",
            error.response?.data || error.message
        );

        return [];
    }
}


// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    searchBattleMetricsPlayer,
    getBattleMetricsPlayerStatus,
    getBattleMetricsHours,
    getServerLeaderboard
};