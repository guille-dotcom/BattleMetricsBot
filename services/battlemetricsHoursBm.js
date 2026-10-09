
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

    if (
        attributes.stop === null ||
        typeof attributes.stop === "undefined"
    ) {
        const inicio = obtenerInicioSesion(session);

        return inicio && inicio <= ahora ? ahora : null;
    }

    return null;
}

function sesionTieneStop(session) {
    const stop = session?.attributes?.stop;

    return stop !== null &&
        typeof stop !== "undefined" &&
        stop !== "";
}

function sesionPareceActiva(session) {
    const inicio = obtenerInicioSesion(session);

    return Boolean(
        inicio &&
        inicio <= Date.now() &&
        !sesionTieneStop(session)
    );
}

function obtenerSegundosSesion(
    session,
    desde = null,
    hasta = null
) {
    const inicioOriginal = obtenerInicioSesion(session);

    if (!inicioOriginal) return 0;

    const finOriginal = obtenerFinSesion(session);

    if (!finOriginal || finOriginal <= inicioOriginal) {
        return 0;
    }

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
    const claves = [
        "timePlayed",
        "timeplayed",
        "totalSeconds",
        "totalTime",
        "seconds",
        "time_played",
        "total_seconds"
    ];

    for (const objeto of objetos) {
        if (!objeto || typeof objeto !== "object") continue;

        for (const clave of claves) {
            const valor = objeto[clave];

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
// INFORMACIÓN DE SERVIDORES
// ============================================================

function crearInfoServidor(servidor) {
    if (!servidor?.id) return null;

    const attributes = servidor.attributes || {};
    const gameId =
        servidor.relationships?.game?.data?.id || "";

    const game = String(
        attributes.game || gameId || ""
    );

    const nombre =
        attributes.name || `Servidor ${servidor.id}`;

    const textoJuego =
        `${game} ${gameId} ${nombre}`.toLowerCase();

    return {
        id: String(servidor.id),
        nombre,
        game,
        esRust: textoJuego.includes("rust")
    };
}

// ============================================================
// PERFIL COMPLETO DEL JUGADOR
// ============================================================

async function obtenerJugador(playerId, servidoresCache) {
    /*
     * IMPORTANTE:
     * Recuperamos los servidores incluidos en el perfil.
     * No usamos ServerConfig ni el servidor configurado
     * en RustLogix como filtro.
     */
    const response = await bm.get(`/players/${playerId}`, {
        params: {
            include: "server"
        }
    });

    const jugador = response.data?.data;

    if (!jugador) {
        throw new Error(
            "BattleMetrics no devolvió el perfil del jugador."
        );
    }

    const incluidos = Array.isArray(response.data?.included)
        ? response.data.included
        : [];

    let servidoresIncluidos = 0;

    for (const recurso of incluidos) {
        if (recurso.type !== "server") continue;

        const servidor = crearInfoServidor(recurso);

        if (!servidor) continue;

        servidoresCache.set(servidor.id, servidor);
        servidoresIncluidos++;
    }

    console.log(
        `👤 HORASBM | Perfil: ${jugador.attributes?.name || playerId}`
    );

    console.log(
        `🖥️ HORASBM | Servidores incluidos en el perfil: ${servidoresIncluidos}`
    );

    return {
        id: String(jugador.id),
        nombre: jugador.attributes?.name || null,
        atributos: jugador.attributes || {},
        raw: jugador
    };
}

// ============================================================
// RECUPERAR TODAS LAS SESIONES
// ============================================================

async function obtenerSesiones(playerId) {
    const sesiones = new Map();

    let url = `/players/${playerId}/relationships/sessions`;
    let params = {
        "page[size]": 100
    };

    let pagina = 0;
    let completa = true;

    while (url && pagina < MAX_PAGINAS) {
        pagina++;

        try {
            const response = await bm.get(url, { params });

            params = undefined;

            const body = response.data || {};
            const lista = Array.isArray(body.data)
                ? body.data
                : [];

            for (const session of lista) {
                if (!session) continue;

                const id = session.id
                    ? String(session.id)
                    : [
                        obtenerServerId(session) || "",
                        session.attributes?.start || "",
                        session.attributes?.stop || ""
                    ].join(":");

                sesiones.set(id, session);
            }

            console.log(
                `📄 HORASBM | Página ${pagina}: ${lista.length}; acumuladas: ${sesiones.size}`
            );

            if (body.links?.next) {
                url = body.links.next;
            } else if (lista.length >= 100) {
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
// CONSULTAR SERVIDOR
// ============================================================

async function obtenerServidor(serverId, cache) {
    const id = String(serverId);

    if (cache.has(id)) {
        return cache.get(id);
    }

    try {
        const response = await bm.get(`/servers/${id}`, {
            params: {
                include: "game"
            }
        });

        const servidor = response.data?.data;

        if (!servidor) return null;

        const resultado = crearInfoServidor(servidor);

        if (resultado) {
            cache.set(id, resultado);
        }

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
// HORAS DIRECTAS DEL PERFIL EN CADA SERVIDOR
// ============================================================

async function obtenerHorasServidor(playerId, serverId) {
    // Primer método: estadísticas directas jugador/servidor.
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

        if (segundos > 0) {
            return segundos;
        }
    } catch (error) {
        // Se intenta el endpoint alternativo.
    }

    // Segundo método: historial de tiempo por servidor.
    try {
        const response = await bm.get(
            `/players/${playerId}/time-played-history/${serverId}`
        );

        const body = response.data || {};
        const registros = Array.isArray(body.data)
            ? body.data
            : [];

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

        if (segundos > 0) {
            return segundos;
        }
    } catch (error) {
        // El historial puede no estar disponible.
    }

    return 0;
}

// ============================================================
// RESPALDO: SUMAR SESIONES DE UN SERVIDOR
// ============================================================

function sumarSesionesServidor(sesiones, serverId) {
    return sesiones.reduce((total, session) => {
        if (obtenerServerId(session) !== String(serverId)) {
            return total;
        }

        return total + obtenerSegundosSesion(session);
    }, 0);
}

// ============================================================
// ESTADÍSTICAS Y TOP DE SERVIDORES RUST
// ============================================================

async function obtenerEstadisticasServidores(
    playerId,
    sesiones,
    cache
) {
    const ids = new Set();

    /*
     * Primero se conservan todos los servidores Rust incluidos
     * en el perfil, aunque no aparezcan en las sesiones recibidas.
     */
    for (const servidor of cache.values()) {
        if (servidor.esRust) {
            ids.add(String(servidor.id));
        }
    }

    // También incorporamos servidores del historial de sesiones.
    for (const session of sesiones) {
        const id = obtenerServerId(session);

        if (id) {
            ids.add(id);
        }
    }

    const resultados = [];
    let servidoresConsultados = 0;

    for (const id of ids) {
        let servidor = await obtenerServidor(id, cache);

        /*
         * Si el servidor no puede consultarse, no inventamos
         * su nombre ni asumimos que sea Rust.
         */
        if (!servidor || !servidor.esRust) {
            continue;
        }

        servidoresConsultados++;

        // Se priorizan las estadísticas del propio perfil BM.
        let segundos = await obtenerHorasServidor(
            String(playerId),
            id
        );

        // Respaldo si BM no entrega estadísticas directas.
        if (!segundos) {
            segundos = sumarSesionesServidor(
                sesiones,
                id
            );
        }

        if (segundos <= 0) continue;

        resultados.push({
            id,
            nombre: servidor.nombre,
            game: servidor.game,
            segundos,
            tiempo: segundosAHorasRedondeado(segundos)
        });
    }

    resultados.sort(
        (a, b) => b.segundos - a.segundos
    );

    const totalSegundos = resultados.reduce(
        (total, servidor) => total + servidor.segundos,
        0
    );

    console.log(
        `🖥️ HORASBM | Servidores Rust consultados: ${servidoresConsultados}`
    );

    console.log(
        `🏆 HORASBM | Servidores con horas registradas: ${resultados.length}`
    );

    console.log(
        `⏱️ HORASBM | Total sumado: ${segundosAHorasRedondeado(totalSegundos)}`
    );

    return {
        resultados,
        top10: resultados.slice(0, 10),
        totalSegundos,
        cantidadServidoresRust: resultados.length
    };
}

// ============================================================
// ESTADÍSTICAS SEMANALES Y MENSUALES
// Solo contamos sesiones de servidores identificados como Rust.
// ============================================================

function calcularTiempoPeriodoRust(
    sesiones,
    inicio,
    ahora,
    servidoresCache
) {
    return sesiones.reduce((total, session) => {
        const serverId = obtenerServerId(session);

        if (!serverId) return total;

        const servidor = servidoresCache.get(serverId);

        if (!servidor?.esRust) return total;

        return total + obtenerSegundosSesion(
            session,
            inicio,
            ahora
        );
    }, 0);
}

// ============================================================
// ÚLTIMA ACTIVIDAD
// ============================================================

function obtenerUltimaActividad(sesiones) {
    let ultima = null;

    for (const session of sesiones) {
        const attributes = session.attributes || {};
        const inicio = obtenerInicioSesion(session);

        const fin = attributes.stop
            ? new Date(attributes.stop).getTime()
            : null;

        const candidato =
            Number.isFinite(fin) && fin
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
// FUNCIÓN PRINCIPAL
// ============================================================

async function getBattleMetricsHoursBm(playerId) {
    if (!playerId || !/^\d+$/.test(String(playerId))) {
        throw new Error(
            "El ID de BattleMetrics no es válido."
        );
    }

    playerId = String(playerId);

    console.log("==========================================");
    console.log(`🔎 HORASBM | Consultando perfil ${playerId}`);
    console.log("==========================================");

    const servidoresCache = new Map();

    /*
     * El perfil y sus servidores se consultan primero.
     * No se consulta ServerConfig ni se filtra por el
     * servidor configurado en RustLogix.
     */
    const jugador = await obtenerJugador(
        playerId,
        servidoresCache
    );

    const resultadoSesiones = await obtenerSesiones(
        playerId
    );

    const sesiones = resultadoSesiones.sesiones;

    /*
     * Precargamos también los servidores del historial.
     * Esto permite identificar las sesiones Rust antes
     * de calcular las estadísticas de semana y mes.
     */
    const idsSesiones = new Set();

    for (const session of sesiones) {
        const id = obtenerServerId(session);

        if (id) idsSesiones.add(id);
    }

    for (const id of idsSesiones) {
        await obtenerServidor(id, servidoresCache);
    }

    const ahora = new Date();
    const inicioSemana = obtenerInicioSemana(ahora);
    const inicioMes = obtenerInicioMes(ahora);

    const estadisticasServidores =
        await obtenerEstadisticasServidores(
            playerId,
            sesiones,
            servidoresCache
        );

    const segundosSemana = calcularTiempoPeriodoRust(
        sesiones,
        inicioSemana,
        ahora,
        servidoresCache
    );

    const segundosMes = calcularTiempoPeriodoRust(
        sesiones,
        inicioMes,
        ahora,
        servidoresCache
    );

    const ultimaActividad = obtenerUltimaActividad(
        sesiones
    );

    // ========================================================
    // SESIÓN ACTUAL
    // ========================================================

    const activas = sesiones
        .filter(sesionPareceActiva)
        .sort(
            (a, b) =>
                (obtenerInicioSesion(b) || 0) -
                (obtenerInicioSesion(a) || 0)
        );

    let sesionActiva = null;
    let servidorActualRust = null;
    let haySesionActivaSinServidorConfirmado = false;

    for (const session of activas) {
        const serverId = obtenerServerId(session);

        if (!serverId) {
            haySesionActivaSinServidorConfirmado = true;
            continue;
        }

        const servidor = servidoresCache.get(serverId);

        if (!servidor) {
            haySesionActivaSinServidorConfirmado = true;
            continue;
        }

        if (servidor.esRust) {
            sesionActiva = session;
            servidorActualRust = servidor;
            break;
        }
    }

    let estado;

    if (sesionActiva && servidorActualRust) {
        estado = "online";
    } else if (
        haySesionActivaSinServidorConfirmado ||
        !resultadoSesiones.completa
    ) {
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
                Math.floor(
                    (Date.now() - inicioActivo) / 1000
                )
            )
            : null;

    // ========================================================
    // RESULTADO
    // ========================================================

    const totalSegundos =
        estadisticasServidores.totalSegundos;

    const totalHoras =
        segundosAHorasRedondeado(totalSegundos);

    const resultado = {
        id: playerId,

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

        horasSemana: segundosAHorasRedondeado(
            segundosSemana
        ),

        horasMes: segundosAHorasRedondeado(
            segundosMes
        ),

        ultimaConexion: formatearFechaChile(
            ultimaActividad
        ),

        sesionesCompletas: resultadoSesiones.completa,

        totalOficialDisponible: false,
        fuenteTotal: "suma-servidores-rust",
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
    console.log(
        `🌐 HORASBM | Servidor actual: ${resultado.servidor || "No confirmado"}`
    );
    console.log(`⏱️ HORASBM | Total calculado: ${resultado.totalHoras}`);
    console.log(
        `🖥️ HORASBM | Servidores con horas: ${resultado.cantidadServidoresRust}`
    );
    console.log("==========================================");

    return resultado;
}

module.exports = {
    getBattleMetricsHoursBm,
    segundosAHoras,
    segundosAHorasRedondeado,
    formatearDuracion
};