
const axios = require("axios");

const TOKEN = process.env.BATTLEMETRICS_TOKEN;
const API = "https://api.battlemetrics.com";
const TIMEOUT = 30000;
const MAX_PAGINAS = 200;

const HEADERS = {
    Accept: "application/json",
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
};

const bm = axios.create({
    baseURL: API,
    headers: HEADERS,
    timeout: TIMEOUT
});

// ============================================================
// UTILIDADES
// ============================================================

function segundosAHoras(segundos) {
    segundos = Math.max(0, Number(segundos) || 0);

    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (!horas) return `${minutos}m`;
    if (!minutos) return `${horas}h`;

    return `${horas}h ${minutos}m`;
}

function segundosAHorasRedondeado(segundos) {
    segundos = Math.max(0, Number(segundos) || 0);

    const minutosTotales = Math.round(segundos / 60);
    const horas = Math.floor(minutosTotales / 60);
    const minutos = minutosTotales % 60;

    if (!horas) return `${minutos}m`;
    if (!minutos) return `${horas}h`;

    return `${horas}h ${minutos}m`;
}

function formatearDuracion(segundos) {
    segundos = Math.max(0, Number(segundos) || 0);

    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (dias) return `${dias}d ${horas}h ${minutos}m`;
    if (horas) return `${horas}h ${minutos}m`;

    return `${minutos}m`;
}

function formatearFechaChile(fecha) {
    if (!fecha) return null;

    const timestamp = new Date(fecha);

    if (!Number.isFinite(timestamp.getTime())) return null;

    return timestamp.toLocaleString("es-CL", {
        timeZone: "America/Santiago",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}

function obtenerInicioSemana(fecha = new Date()) {
    const inicio = new Date(fecha);

    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - inicio.getDay());

    return inicio;
}

function obtenerInicioMes(fecha = new Date()) {
    return new Date(
        fecha.getFullYear(),
        fecha.getMonth(),
        1,
        0,
        0,
        0,
        0
    );
}

function obtenerServerId(session) {
    const id = session?.relationships?.server?.data?.id;

    return id !== null && typeof id !== "undefined"
        ? String(id)
        : null;
}

function obtenerInicioSesion(session) {
    const fecha = session?.attributes?.start;

    if (!fecha) return null;

    const timestamp = new Date(fecha).getTime();

    return Number.isFinite(timestamp) ? timestamp : null;
}

function obtenerFinSesion(session, ahora = Date.now()) {
    const attributes = session?.attributes || {};

    if (attributes.stop) {
        const timestamp = new Date(attributes.stop).getTime();

        return Number.isFinite(timestamp) ? timestamp : null;
    }

    // Una sesión sin stop puede ser la sesión en curso.
    // No se considera válida si no tiene fecha de inicio.
    if (
        attributes.stop === null ||
        typeof attributes.stop === "undefined"
    ) {
        return obtenerInicioSesion(session) ? ahora : null;
    }

    return null;
}

function sesionTieneStop(session) {
    const stop = session?.attributes?.stop;

    return stop !== null && typeof stop !== "undefined" && stop !== "";
}

function sesionPareceActiva(session) {
    const inicio = obtenerInicioSesion(session);

    if (!inicio || sesionTieneStop(session)) return false;

    return inicio <= Date.now();
}

function obtenerSegundosSesion(session, desde = null, hasta = null) {
    const inicioOriginal = obtenerInicioSesion(session);

    if (!inicioOriginal) return 0;

    const finOriginal = obtenerFinSesion(session);

    if (!finOriginal || finOriginal <= inicioOriginal) return 0;

    const inicio = desde
        ? Math.max(inicioOriginal, desde.getTime())
        : inicioOriginal;

    const fin = hasta
        ? Math.min(finOriginal, hasta.getTime())
        : finOriginal;

    if (fin <= inicio) return 0;

    return Math.floor((fin - inicio) / 1000);
}

function obtenerSegundosCandidatos(objetos) {
    for (const objeto of objetos) {
        if (!objeto || typeof objeto !== "object") continue;

        const valores = [
            objeto.timePlayed,
            objeto.timeplayed,
            objeto.totalSeconds,
            objeto.totalTime,
            objeto.seconds,
            objeto.time_played,
            objeto.total_seconds
        ];

        for (const valor of valores) {
            if (
                valor !== null &&
                typeof valor !== "undefined" &&
                valor !== "" &&
                Number.isFinite(Number(valor)) &&
                Number(valor) > 0
            ) {
                return Number(valor);
            }
        }
    }

    return 0;
}

function errorBM(error) {
    return error?.response?.data ||
        error?.response?.status ||
        error?.message ||
        error;
}

// ============================================================
// INFORMACIÓN DEL JUGADOR
// ============================================================

async function obtenerJugador(playerId) {
    const response = await bm.get(`/players/${playerId}`);

    const jugador = response.data?.data;

    if (!jugador) {
        throw new Error("BattleMetrics no devolvió el perfil del jugador.");
    }

    return {
        id: String(jugador.id),
        nombre: jugador.attributes?.name || null,
        atributos: jugador.attributes || {}
    };
}

// ============================================================
// RECUPERAR TODAS LAS SESIONES
// ============================================================

async function obtenerSesiones(playerId) {
    const sesiones = new Map();

    let url = `/players/${playerId}/relationships/sessions`;
    let params = { "page[size]": 100 };
    let pagina = 0;
    let completa = true;

    while (url && pagina < MAX_PAGINAS) {
        pagina++;

        try {
            const response = await bm.get(url, { params });
            params = undefined;

            const body = response.data || {};
            const lista = Array.isArray(body.data) ? body.data : [];

            for (const session of lista) {
                if (!session) continue;

                const id = session.id
                    ? String(session.id)
                    : `${obtenerServerId(session) || ""}:${session.attributes?.start || ""}:${session.attributes?.stop || ""}`;

                sesiones.set(id, session);
            }

            console.log(
                `📄 HORASBM | Página ${pagina}: ${lista.length}; acumuladas: ${sesiones.size}`
            );

            if (body.links?.next) {
                url = body.links.next;
            } else if (lista.length >= 100) {
                // Respaldo por número de página si no viene links.next.
                url = `/players/${playerId}/relationships/sessions`;
                params = {
                    "page[size]": 100,
                    "page[number]": pagina + 1
                };
            } else {
                url = null;
            }
        } catch (error) {
            completa = false;

            console.error(
                `❌ HORASBM | Error recuperando sesiones en página ${pagina}:`,
                errorBM(error)
            );

            url = null;
        }
    }

    if (pagina >= MAX_PAGINAS && url) {
        completa = false;
    }

    return {
        sesiones: Array.from(sesiones.values()),
        completa
    };
}

// ============================================================
// INFORMACIÓN DE SERVIDORES
// ============================================================

async function obtenerServidor(serverId, cache) {
    const id = String(serverId);

    if (cache.has(id)) return cache.get(id);

    try {
        const response = await bm.get(`/servers/${id}`, {
            params: { include: "game" }
        });

        const servidor = response.data?.data;

        if (!servidor) return null;

        const attributes = servidor.attributes || {};
        const gameId = servidor.relationships?.game?.data?.id || "";
        const game = String(attributes.game || gameId || "");
        const nombre = attributes.name || `Servidor ${id}`;

        const resultado = {
            id,
            nombre,
            game,
            esRust: `${game} ${gameId} ${nombre}`.toLowerCase().includes("rust")
        };

        cache.set(id, resultado);

        return resultado;
    } catch (error) {
        console.warn(
            `⚠️ HORASBM | No se pudo consultar el servidor ${id}:`,
            error?.response?.status || error.message
        );

        return null;
    }
}

// ============================================================
// HORAS POR SERVIDOR
// ============================================================

async function obtenerHorasServidor(playerId, serverId) {
    try {
        const response = await bm.get(
            `/players/${playerId}/servers/${serverId}`
        );

        const data = response.data?.data || {};

        const segundos = obtenerSegundosCandidatos([
            data.meta,
            data.attributes,
            response.data?.meta
        ]);

        if (segundos > 0) return segundos;
    } catch (error) {
        // Se intenta el endpoint alternativo.
    }

    try {
        const response = await bm.get(
            `/players/${playerId}/time-played-history/${serverId}`
        );

        const body = response.data || {};
        const registros = Array.isArray(body.data) ? body.data : [];

        let segundos = obtenerSegundosCandidatos([
            body.meta,
            body.data?.meta
        ]);

        if (segundos <= 0) {
            for (const registro of registros) {
                segundos += obtenerSegundosCandidatos([
                    registro?.meta,
                    registro?.attributes
                ]);
            }
        }

        if (segundos > 0) return segundos;
    } catch (error) {
        // Sin estadísticas para este servidor.
    }

    return 0;
}

function sumarSesionesServidor(sesiones, serverId) {
    return sesiones.reduce((total, session) => {
        if (obtenerServerId(session) !== String(serverId)) {
            return total;
        }

        return total + obtenerSegundosSesion(session);
    }, 0);
}

async function obtenerEstadisticasServidores(playerId, sesiones, cache) {
    const ids = new Set();

    for (const session of sesiones) {
        const id = obtenerServerId(session);
        if (id) ids.add(id);
    }

    const resultados = [];

    for (const id of ids) {
        const servidor = await obtenerServidor(id, cache);

        if (!servidor?.esRust) continue;

        let segundos = await obtenerHorasServidor(playerId, id);

        if (!segundos) {
            segundos = sumarSesionesServidor(sesiones, id);
        }

        if (segundos > 0) {
            resultados.push({
                id,
                nombre: servidor.nombre,
                game: servidor.game,
                segundos,
                tiempo: segundosAHoras(segundos)
            });
        }
    }

    resultados.sort((a, b) => b.segundos - a.segundos);

    const totalSegundos = resultados.reduce(
        (total, servidor) => total + servidor.segundos,
        0
    );

    return {
        resultados,
        top10: resultados.slice(0, 10),
        totalSegundos,
        cantidadServidoresRust: resultados.length
    };
}

// ============================================================
// ESTADÍSTICAS TEMPORALES A PARTIR DE SESIONES
// ============================================================

function calcularTiempoPeriodo(sesiones, inicio, ahora) {
    return sesiones.reduce(
        (total, session) =>
            total + obtenerSegundosSesion(session, inicio, ahora),
        0
    );
}

function obtenerUltimaActividad(sesiones) {
    let ultima = null;

    for (const session of sesiones) {
        const attributes = session.attributes || {};
        const inicio = obtenerInicioSesion(session);

        const fin = attributes.stop
            ? new Date(attributes.stop).getTime()
            : null;

        const candidato = Number.isFinite(fin) && fin
            ? fin
            : inicio;

        if (
            Number.isFinite(candidato) &&
            candidato &&
            (ultima === null || candidato > ultima)
        ) {
            ultima = candidato;
        }
    }

    return ultima ? new Date(ultima) : null;
}

// ============================================================
// ESTADO DEL JUGADOR
// ============================================================

async function getBattleMetricsHoursBm(playerId) {
    if (!playerId || !/^\d+$/.test(String(playerId))) {
        throw new Error("El ID de BattleMetrics no es válido.");
    }

    console.log("==========================================");
    console.log(`🔎 HORASBM | Consultando jugador ${playerId}`);
    console.log("==========================================");

    const jugador = await obtenerJugador(String(playerId));
    const resultadoSesiones = await obtenerSesiones(String(playerId));
    const sesiones = resultadoSesiones.sesiones;

    const servidoresCache = new Map();

    let sesionActiva = null;
    let servidorActualRust = null;

    // No basta con tener un servidor reciente: debe existir una sesión
    // sin stop y con fecha de inicio válida.
    const activas = sesiones
        .filter(sesionPareceActiva)
        .sort(
            (a, b) =>
                (obtenerInicioSesion(b) || 0) -
                (obtenerInicioSesion(a) || 0)
        );

    for (const session of activas) {
        const serverId = obtenerServerId(session);

        if (!serverId) continue;

        const servidor = await obtenerServidor(
            serverId,
            servidoresCache
        );

        if (servidor?.esRust) {
            sesionActiva = session;
            servidorActualRust = servidor;
            break;
        }
    }

    const ahora = new Date();
    const inicioSemana = obtenerInicioSemana(ahora);
    const inicioMes = obtenerInicioMes(ahora);

    const segundosSemana = calcularTiempoPeriodo(
        sesiones,
        inicioSemana,
        ahora
    );

    const segundosMes = calcularTiempoPeriodo(
        sesiones,
        inicioMes,
        ahora
    );

    const ultimaActividad = obtenerUltimaActividad(sesiones);

    const estadisticasServidores = await obtenerEstadisticasServidores(
        String(playerId),
        sesiones,
        servidoresCache
    );

    const totalSegundos = estadisticasServidores.totalSegundos;
    const totalHoras = segundosAHorasRedondeado(totalSegundos);

    // Si la consulta de sesiones falló, no afirmamos que está offline.
    let estado;

    if (sesionActiva && servidorActualRust) {
        estado = "online";
    } else if (!resultadoSesiones.completa) {
        estado = "desconocido";
    } else {
        estado = "offline";
    }

    const inicioActivo = sesionActiva
        ? obtenerInicioSesion(sesionActiva)
        : null;

    const duracionSesionSegundos =
        inicioActivo && estado === "online"
            ? Math.max(
                0,
                Math.floor((Date.now() - inicioActivo) / 1000)
            )
            : null;

    const resultado = {
        id: String(playerId),
        nombre: jugador.nombre || `Jugador ${playerId}`,
        name: jugador.nombre || `Jugador ${playerId}`,

        estado,
        online: estado === "online",
        jugando: estado === "online",

        servidor: servidorActualRust?.nombre || null,
        servidorActualRust: servidorActualRust
            ? {
                id: servidorActualRust.id,
                nombre: servidorActualRust.nombre,
                game: servidorActualRust.game
            }
            : null,

        duracionSesionSegundos,

        totalSegundos,
        totalHoras,
        horasTotalesBM: totalSegundos,
        horasSemana: segundosAHoras(segundosSemana),
        horasMes: segundosAHoras(segundosMes),

        ultimaConexion: formatearFechaChile(ultimaActividad),

        sesionesCompletas: resultadoSesiones.completa,

        totalOficialDisponible: false,
        fuenteTotal: "suma-servidores",
        totalSegundosServidores: totalSegundos,

        topServidoresRust: estadisticasServidores.top10,
        servidoresEncontrados: estadisticasServidores.resultados,
        cantidadServidoresRust:
            estadisticasServidores.cantidadServidoresRust,

        historialNombres: []
    };

    console.log("==========================================");
    console.log(`👤 HORASBM | Jugador: ${resultado.nombre}`);
    console.log(`🎮 HORASBM | Estado: ${resultado.estado}`);
    console.log(`🌐 HORASBM | Servidor actual: ${resultado.servidor || "No confirmado"}`);
    console.log(`⏱️ HORASBM | Total calculado: ${resultado.totalHoras}`);
    console.log(`🖥️ HORASBM | Servidores con horas: ${resultado.cantidadServidoresRust}`);
    console.log("==========================================");

    return resultado;
}

module.exports = {
    getBattleMetricsHoursBm,
    segundosAHoras,
    segundosAHorasRedondeado,
    formatearDuracion
};