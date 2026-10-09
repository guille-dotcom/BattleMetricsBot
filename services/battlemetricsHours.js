const axios = require("axios");

const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

const API = "https://api.battlemetrics.com";
const WEB_API = "https://www.battlemetrics.com/_api";

const REQUEST_TIMEOUT = 30000;
const MAX_PAGINAS_SESIONES = 200;

const HEADERS = {
    Accept: "application/json",
    ...(BATTLEMETRICS_TOKEN
        ? { Authorization: `Bearer ${BATTLEMETRICS_TOKEN}` }
        : {})
};

const axiosBM = axios.create({
    baseURL: API,
    headers: HEADERS,
    timeout: REQUEST_TIMEOUT
});

const axiosWebBM = axios.create({
    baseURL: WEB_API,
    headers: {
        Accept: "application/json"
    },
    timeout: REQUEST_TIMEOUT
});

// ============================================================
// UTILIDADES
// ============================================================

function segundosAHoras(segundos) {
    segundos = Math.max(0, Number(segundos) || 0);

    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (horas === 0) return `${minutos}m`;
    if (minutos === 0) return `${horas}h`;

    return `${horas}h ${minutos}m`;
}

function segundosAHorasRedondeado(segundos) {
    segundos = Math.max(0, Number(segundos) || 0);

    const minutosTotales = Math.round(segundos / 60);
    const horas = Math.floor(minutosTotales / 60);
    const minutos = minutosTotales % 60;

    if (horas === 0) return `${minutos}m`;
    if (minutos === 0) return `${horas}h`;

    return `${horas}h ${minutos}m`;
}

function formatearDuracion(segundos) {
    segundos = Math.max(0, Number(segundos) || 0);

    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
    if (horas > 0) return `${horas}h ${minutos}m`;

    return `${minutos}m`;
}

function obtenerDuracionSesion(session, ahora = Date.now()) {
    const inicioTexto = session?.attributes?.start;

    if (!inicioTexto) return null;

    const inicio = new Date(inicioTexto).getTime();

    if (!Number.isFinite(inicio) || inicio > ahora) {
        return null;
    }

    if (!esSesionActiva(session)) {
        return null;
    }

    return Math.max(0, Math.floor((ahora - inicio) / 1000));
}

function obtenerFechaChile(fecha) {
    if (!fecha) return null;

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
        return String(fecha);
    }
}

function esSesionActiva(session) {
    const a = session?.attributes;

    if (!a) return false;

    if (a.stop === null || typeof a.stop === "undefined") {
        return true;
    }

    return a.active === true ||
        a.online === true ||
        a.connected === true;
}

function obtenerServerIdDeSesion(session) {
    const id = session?.relationships?.server?.data?.id;

    return id !== null && typeof id !== "undefined"
        ? String(id)
        : null;
}

function obtenerIdSesion(session) {
    if (session?.id !== null && typeof session?.id !== "undefined") {
        return String(session.id);
    }

    const a = session?.attributes || {};

    return [
        obtenerServerIdDeSesion(session) || "",
        a.start || "",
        a.stop || ""
    ].join(":");
}

function extraerJugadoresRespuesta(responseData) {
    const jugadores = [];

    if (Array.isArray(responseData?.data)) {
        jugadores.push(...responseData.data);
    } else if (
        responseData?.data &&
        typeof responseData.data === "object"
    ) {
        if (
            responseData.data.type === "player" ||
            responseData.data.attributes?.name
        ) {
            jugadores.push(responseData.data);
        }
    }

    if (Array.isArray(responseData?.included)) {
        jugadores.push(
            ...responseData.included.filter(
                recurso => recurso?.type === "player"
            )
        );
    }

    const unicos = new Map();

    for (const jugador of jugadores) {
        if (!jugador) continue;

        const id = jugador.id ? String(jugador.id) : "";
        const nombre = String(
            jugador.attributes?.name || ""
        ).trim();

        const clave = id || nombre.toLowerCase();

        if (clave && !unicos.has(clave)) {
            unicos.set(clave, jugador);
        }
    }

    return Array.from(unicos.values());
}

function extraerSegundosCandidatos(objetos) {
    for (const objeto of objetos) {
        if (!objeto || typeof objeto !== "object") continue;

        const candidatos = [
            objeto.timePlayed,
            objeto.timeplayed,
            objeto.totalSeconds,
            objeto.totalTime,
            objeto.seconds,
            objeto.time_played,
            objeto.total_seconds
        ];

        for (const valor of candidatos) {
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

function esErrorDeRespuesta(error) {
    return error?.response?.data ||
        error?.response?.status ||
        error?.message ||
        error;
}

// ============================================================
// ESTADÍSTICAS GLOBALES DE LA WEB DE BATTLEMETRICS
// ============================================================

function obtenerInicioSemanaUTC(fecha) {
    const inicio = new Date(fecha);

    inicio.setUTCHours(0, 0, 0, 0);
    inicio.setUTCDate(
        inicio.getUTCDate() - inicio.getUTCDay()
    );

    return inicio;
}

function obtenerInicioMesUTC(fecha) {
    return new Date(Date.UTC(
        fecha.getUTCFullYear(),
        fecha.getUTCMonth(),
        1,
        0,
        0,
        0,
        0
    ));
}

function sumarHistorialDesde(historial, fechaInicio) {
    if (!Array.isArray(historial)) return 0;

    const inicio = fechaInicio.getTime();

    return historial.reduce((total, registro) => {
        const timestamp = new Date(
            registro?.timestamp
        ).getTime();

        const valor = Number(registro?.value);

        if (
            !Number.isFinite(timestamp) ||
            !Number.isFinite(valor) ||
            timestamp < inicio
        ) {
            return total;
        }

        return total + Math.max(0, valor);
    }, 0);
}

async function obtenerEstadisticasGlobalesJugador(playerId) {
    if (!playerId) return null;

    const ahora = new Date();

    const inicioSemana = obtenerInicioSemanaUTC(ahora);
    const inicioMes = obtenerInicioMesUTC(ahora);

    const inicio = new Date(Math.min(
        inicioSemana.getTime(),
        inicioMes.getTime()
    ));

    try {
        const response = await axiosWebBM.get(
            `/players/${encodeURIComponent(String(playerId))}/time-played-statistics`,
            {
                params: {
                    start: inicio.toISOString(),
                    stop: ahora.toISOString()
                }
            }
        );

        const recursos = Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        const estadisticaRust = recursos.find(recurso => {
            const gameId =
                recurso?.relationships?.game?.data?.id;

            const id = String(recurso?.id || "").toLowerCase();

            return String(gameId || "").toLowerCase() === "rust" ||
                id.endsWith(":rust");
        });

        if (!estadisticaRust) {
            console.warn(
                `⚠️ BM WEB | No se encontraron estadísticas globales de Rust para ${playerId}.`
            );

            return null;
        }

        const attributes = estadisticaRust.attributes || {};
        const totalSegundos = Number(attributes.timePlayed);

        if (
            !Number.isFinite(totalSegundos) ||
            totalSegundos < 0
        ) {
            console.warn(
                "⚠️ BM WEB | timePlayed no contiene un total válido."
            );

            return null;
        }

        const historial = Array.isArray(attributes.history)
            ? attributes.history
            : [];

        const segundosSemana = sumarHistorialDesde(
            historial,
            inicioSemana
        );

        const segundosMes = sumarHistorialDesde(
            historial,
            inicioMes
        );

        console.log("==========================================");
        console.log("🌐 BM WEB | Estadísticas globales de Rust");
        console.log(`👤 Jugador: ${playerId}`);
        console.log(
            `⏱️ Total oficial: ${totalSegundos} segundos`
        );
        console.log(
            `⏱️ Total oficial: ${segundosAHorasRedondeado(totalSegundos)}`
        );
        console.log(
            `📅 Historial diario recibido: ${historial.length} registros`
        );
        console.log(
            `📆 Tiempo esta semana: ${segundosAHoras(segundosSemana)}`
        );
        console.log(
            `🗓️ Tiempo este mes: ${segundosAHoras(segundosMes)}`
        );
        console.log("==========================================");

        return {
            totalSegundos,
            totalHoras: segundosAHorasRedondeado(totalSegundos),
            segundosSemana,
            segundosMes,
            historial,
            firstSeen: attributes.firstSeen || null,
            lastSeen: attributes.lastSeen || null
        };
    } catch (error) {
        console.error(
            "❌ BM WEB | No se pudieron obtener las estadísticas globales:",
            esErrorDeRespuesta(error)
        );

        return null;
    }
}

// ============================================================
// BUSCAR JUGADOR ENTRE LOS JUGADORES DEL SERVIDOR
// ============================================================

async function searchBattleMetricsPlayer(playerName, serverId) {
    if (!playerName || !serverId) return null;

    try {
        console.log(
            `🔎 BM | Buscando "${playerName}" en servidor ${serverId}`
        );

        const response = await axiosBM.get(
            `/servers/${serverId}`,
            {
                params: {
                    include: "player"
                }
            }
        );

        const jugadores = extraerJugadoresRespuesta(response.data);

        console.log(
            `🔎 BM | Recursos de jugadores recibidos: ${jugadores.length}`
        );

        const buscado = String(playerName)
            .trim()
            .toLowerCase();

        const encontrados = jugadores.filter(jugador =>
            String(jugador.attributes?.name || "")
                .trim()
                .toLowerCase() === buscado
        );

        console.log(
            `🔎 BM | Coincidencias encontradas: ${encontrados.length}`
        );

        if (encontrados.length === 0) return null;

        if (encontrados.length > 1) {
            return {
                duplicate: true,
                players: encontrados.map(jugador => ({
                    id: String(jugador.id),
                    nombre: jugador.attributes?.name || playerName
                }))
            };
        }

        return {
            duplicate: false,
            id: String(encontrados[0].id),
            nombre: encontrados[0].attributes?.name || playerName
        };
    } catch (error) {
        console.error(
            "❌ BM | Error buscando jugador:",
            esErrorDeRespuesta(error)
        );

        return null;
    }
}

// ============================================================
// INFORMACIÓN DE SERVIDOR
// ============================================================

async function obtenerInfoServidor(serverId, cache = new Map()) {
    if (!serverId) return null;

    const id = String(serverId);

    if (cache.has(id)) return cache.get(id);

    try {
        const response = await axiosBM.get(
            `/servers/${id}`,
            {
                params: {
                    include: "game"
                }
            }
        );

        const servidor = response.data?.data;

        if (!servidor) return null;

        const attributes = servidor.attributes || {};
        const gameId =
            servidor.relationships?.game?.data?.id || "";

        const gameAttribute = attributes.game || "";
        const nombre = attributes.name || `Servidor ${id}`;

        const game = String(gameAttribute || gameId);

        const textoJuego =
            `${game} ${gameId} ${nombre}`.toLowerCase();

        const resultado = {
            id,
            nombre,
            game,
            esRust: textoJuego.includes("rust"),
            ip: attributes.ip || null,
            port: attributes.port || null
        };

        cache.set(id, resultado);

        return resultado;
    } catch (error) {
        console.warn(
            `⚠️ BM | No se pudo obtener servidor ${id}:`,
            esErrorDeRespuesta(error)
        );

        return null;
    }
}

// ============================================================
// OBTENER TODAS LAS SESIONES DEL JUGADOR
// ============================================================

async function obtenerTodasLasSesiones(playerId) {
    const sesionesMap = new Map();

    let url = `/players/${playerId}/relationships/sessions`;
    let params = { "page[size]": 100 };

    let paginas = 0;
    let completa = true;

    while (url && paginas < MAX_PAGINAS_SESIONES) {
        paginas++;

        try {
            const response = await axiosBM.get(url, { params });

            params = undefined;

            const body = response.data || {};
            const data = Array.isArray(body.data)
                ? body.data
                : [];

            for (const session of data) {
                if (session) {
                    sesionesMap.set(
                        obtenerIdSesion(session),
                        session
                    );
                }
            }

            console.log(
                `📄 BM | Sesiones página ${paginas}: ${data.length}; acumuladas: ${sesionesMap.size}`
            );

            const next = body.links?.next;

            if (next) {
                url = next;
                continue;
            }

            if (data.length >= 100) {
                try {
                    const siguiente = await axiosBM.get(
                        `/players/${playerId}/relationships/sessions`,
                        {
                            params: {
                                "page[size]": 100,
                                "page[number]": paginas + 1
                            }
                        }
                    );

                    const siguienteBody = siguiente.data || {};

                    const siguientes = Array.isArray(
                        siguienteBody.data
                    )
                        ? siguienteBody.data
                        : [];

                    if (siguientes.length === 0) {
                        url = null;
                        continue;
                    }

                    for (const session of siguientes) {
                        if (session) {
                            sesionesMap.set(
                                obtenerIdSesion(session),
                                session
                            );
                        }
                    }

                    console.log(
                        `📄 BM | Sesiones página alternativa ${paginas + 1}: ${siguientes.length}; acumuladas: ${sesionesMap.size}`
                    );

                    url = siguienteBody.links?.next || null;

                    if (!url && siguientes.length >= 100) {
                        completa = false;
                    }
                } catch (errorPagina) {
                    completa = false;

                    console.error(
                        `❌ BM | Falló la paginación después de ${sesionesMap.size} sesiones:`,
                        esErrorDeRespuesta(errorPagina)
                    );

                    url = null;
                }

                continue;
            }

            url = null;
        } catch (error) {
            completa = false;

            console.error(
                `❌ BM | Error obteniendo sesiones, página ${paginas}:`,
                esErrorDeRespuesta(error)
            );

            url = null;
        }
    }

    if (paginas >= MAX_PAGINAS_SESIONES && url) {
        completa = false;

        console.warn(
            `⚠️ BM | Se alcanzó el límite de ${MAX_PAGINAS_SESIONES} páginas de sesiones.`
        );
    }

    const sesiones = Array.from(sesionesMap.values());

    console.log(
        `📊 BM | Sesiones recuperadas: ${sesiones.length}; historial completo: ${completa ? "sí" : "no"}`
    );

    return {
        sesiones,
        completa
    };
}

// ============================================================
// HORAS DEL JUGADOR EN UN SERVIDOR
// ============================================================

async function obtenerHorasJugadorServidor(playerId, serverId) {
    if (!playerId || !serverId) return null;

    const player = String(playerId);
    const server = String(serverId);

    console.log(
        `🎯 BM | Consultando horas directas: jugador ${player} -> servidor ${server}`
    );

    try {
        const response = await axiosBM.get(
            `/players/${player}/servers/${server}`
        );

        const data = response.data?.data || {};

        const segundos = extraerSegundosCandidatos([
            data.meta,
            data.attributes,
            response.data?.meta
        ]);

        if (segundos > 0) {
            console.log(
                `✅ BM | Horas directas ${server}: ${segundosAHoras(segundos)}`
            );

            return {
                id: server,
                segundos,
                tiempo: segundosAHoras(segundos),
                origen: "player-server"
            };
        }
    } catch (error) {
        console.log(
            `ℹ️ BM | Método player-server no disponible para ${server}:`,
            error?.response?.status || error.message
        );
    }

    try {
        const response = await axiosBM.get(
            `/players/${player}/time-played-history/${server}`
        );

        const body = response.data || {};

        const data = Array.isArray(body.data)
            ? body.data
            : [];

        let segundos = extraerSegundosCandidatos([
            body.meta,
            body.data?.meta
        ]);

        if (segundos <= 0) {
            for (const registro of data) {
                segundos += extraerSegundosCandidatos([
                    registro?.meta,
                    registro?.attributes
                ]);
            }
        }

        if (segundos > 0) {
            console.log(
                `✅ BM | Horas desde time-played-history ${server}: ${segundosAHoras(segundos)}`
            );

            return {
                id: server,
                segundos,
                tiempo: segundosAHoras(segundos),
                origen: "time-played-history"
            };
        }
    } catch (error) {
        console.log(
            `ℹ️ BM | Historial de horas no disponible para ${server}:`,
            error?.response?.status || error.message
        );
    }

    return null;
}

// ============================================================
// SUMAR TIEMPO DE SESIONES POR SERVIDOR (RESPALDO)
// ============================================================

function calcularSegundosDeSesiones(sesiones, serverId) {
    let total = 0;

    for (const session of sesiones) {
        if (
            String(obtenerServerIdDeSesion(session)) !==
            String(serverId)
        ) {
            continue;
        }

        const a = session.attributes || {};

        if (!a.start) continue;

        const inicio = new Date(a.start).getTime();

        let fin;

        if (a.stop) {
            fin = new Date(a.stop).getTime();
        } else if (esSesionActiva(session)) {
            fin = Date.now();
        } else {
            continue;
        }

        if (
            !Number.isFinite(inicio) ||
            !Number.isFinite(fin) ||
            fin <= inicio
        ) {
            continue;
        }

        total += Math.floor((fin - inicio) / 1000);
    }

    return total;
}

// ============================================================
// TOP Y TOTAL SUMADO DE SERVIDORES RUST
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    sesiones,
    servidoresMap
) {
    const servidores = new Map();

    for (const servidor of servidoresMap.values()) {
        if (servidor?.id && servidor.esRust) {
            servidores.set(
                String(servidor.id),
                servidor
            );
        }
    }

    const idsSesiones = new Set();

    for (const session of sesiones) {
        const id = obtenerServerIdDeSesion(session);

        if (id) idsSesiones.add(String(id));
    }

    for (const id of idsSesiones) {
        if (servidores.has(id)) continue;

        const servidor = await obtenerInfoServidor(
            id,
            servidoresMap
        );

        if (servidor?.esRust) {
            servidores.set(id, servidor);
        }
    }

    const resultados = [];
    let servidoresSinHoras = 0;

    for (const servidor of servidores.values()) {
        const serverId = String(servidor.id);

        let segundos = 0;

        const horas = await obtenerHorasJugadorServidor(
            playerId,
            serverId
        );

        if (horas?.segundos > 0) {
            segundos = Number(horas.segundos) || 0;
        } else {
            segundos = calcularSegundosDeSesiones(
                sesiones,
                serverId
            );
        }

        if (segundos > 0) {
            resultados.push({
                id: serverId,
                nombre: servidor.nombre,
                game: servidor.game,
                segundos,
                tiempo: segundosAHoras(segundos)
            });
        } else {
            servidoresSinHoras++;
        }
    }

    resultados.sort(
        (a, b) => b.segundos - a.segundos
    );

    const totalSegundos = resultados.reduce(
        (total, servidor) =>
            total + (Number(servidor.segundos) || 0),
        0
    );

    console.log(
        `🏆 BM | Servidores Rust con horas: ${resultados.length}; sin horas: ${servidoresSinHoras}`
    );

    console.log(
        `🧮 BM | Suma por servidor: ${segundosAHoras(totalSegundos)}`
    );

    return {
        resultados,
        top10: resultados.slice(0, 10),
        totalSegundos,
        cantidadServidoresRust: resultados.length,
        servidoresSinHoras
    };
}

// ============================================================
// ESTADO DEL JUGADOR Y ESTADÍSTICAS
// ============================================================

async function getBattleMetricsPlayerStatus(
    playerId,
    configuredServerId = null
) {
    try {
        console.log("==========================================");
        console.log(`🔎 BM | Analizando jugador ${playerId}`);
        console.log(
            `🎯 BM | Servidor configurado: ${configuredServerId || "NINGUNO"}`
        );
        console.log("==========================================");

        const playerResponse = await axiosBM.get(
            `/players/${playerId}`,
            {
                params: {
                    include: "server"
                }
            }
        );

        const player = playerResponse.data?.data;

        if (!player) {
            throw new Error(
                "BattleMetrics no devolvió el jugador."
            );
        }

        const nombre =
            player.attributes?.name || "Desconocido";

        const servidoresMap = new Map();

        for (const recurso of playerResponse.data?.included || []) {
            if (
                recurso?.type !== "server" ||
                !recurso.id
            ) {
                continue;
            }

            const id = String(recurso.id);
            const attributes = recurso.attributes || {};

            const gameId =
                recurso.relationships?.game?.data?.id || "";

            const game = String(
                attributes.game || gameId
            );

            const nombreServidor =
                attributes.name || `Servidor ${id}`;

            servidoresMap.set(id, {
                id,
                nombre: nombreServidor,
                game,
                esRust: `${game} ${gameId} ${nombreServidor}`
                    .toLowerCase()
                    .includes("rust"),
                ip: attributes.ip || null,
                port: attributes.port || null
            });
        }

        const estadisticasGlobales =
            await obtenerEstadisticasGlobalesJugador(playerId);

        const resultadoSesiones =
            await obtenerTodasLasSesiones(playerId);

        const sesiones = resultadoSesiones.sesiones;
        const sesionesCompletas = resultadoSesiones.completa;

        let sesionActiva = null;
        let sesionActivaRust = null;
        let servidorActualRust = null;

        // Buscamos una sesión activa en un servidor Rust.
        for (const session of sesiones) {
            if (!esSesionActiva(session)) continue;

            if (!sesionActiva) {
                sesionActiva = session;
            }

            const serverId =
                obtenerServerIdDeSesion(session);

            if (!serverId) continue;

            let servidor = servidoresMap.get(
                String(serverId)
            );

            if (!servidor) {
                servidor = await obtenerInfoServidor(
                    serverId,
                    servidoresMap
                );
            }

            if (servidor?.esRust) {
                sesionActivaRust = session;
                servidorActualRust = servidor;
                break;
            }
        }

        const online = Boolean(sesionActiva);
        const jugando = Boolean(sesionActivaRust);

        // Duración de la sesión Rust que aparece como activa.
        const duracionSesionSegundos =
            obtenerDuracionSesion(sesionActivaRust);

        // Duración en el servidor configurado, si esa es la sesión activa.
        const sesionActivaServidorConfigurado =
            configuredServerId &&
            sesionActivaRust &&
            String(obtenerServerIdDeSesion(sesionActivaRust)) ===
                String(configuredServerId)
                ? sesionActivaRust
                : null;

        const duracionSesionConfiguradoSegundos =
            obtenerDuracionSesion(
                sesionActivaServidorConfigurado
            );

        // Estadísticas por sesiones: respaldo para semana y mes.
        let segundosSemanaSesiones = 0;
        let segundosMesSesiones = 0;
        let ultimaConexion = null;

        const ahora = new Date();

        const inicioSemana = new Date(ahora);
        inicioSemana.setDate(
            inicioSemana.getDate() - inicioSemana.getDay()
        );
        inicioSemana.setHours(0, 0, 0, 0);

        const inicioMes = new Date(
            ahora.getFullYear(),
            ahora.getMonth(),
            1,
            0,
            0,
            0,
            0
        );

        for (const session of sesiones) {
            const a = session.attributes || {};

            if (!a.start) continue;

            const inicio = new Date(a.start);

            let fin;

            if (a.stop) {
                fin = new Date(a.stop);
            } else if (esSesionActiva(session)) {
                fin = ahora;
            } else {
                continue;
            }

            if (
                !Number.isFinite(inicio.getTime()) ||
                !Number.isFinite(fin.getTime()) ||
                fin <= inicio
            ) {
                continue;
            }

            if (fin >= inicioSemana) {
                const inicioReal =
                    inicio > inicioSemana
                        ? inicio
                        : inicioSemana;

                segundosSemanaSesiones += Math.max(
                    0,
                    Math.floor(
                        (fin.getTime() - inicioReal.getTime()) /
                        1000
                    )
                );
            }

            if (fin >= inicioMes) {
                const inicioReal =
                    inicio > inicioMes
                        ? inicio
                        : inicioMes;

                segundosMesSesiones += Math.max(
                    0,
                    Math.floor(
                        (fin.getTime() - inicioReal.getTime()) /
                        1000
                    )
                );
            }

            if (
                !ultimaConexion ||
                inicio > ultimaConexion
            ) {
                ultimaConexion = inicio;
            }
        }

        // Horas del servidor configurado.
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
                    segundos: Number(horasDirectas.segundos) || 0
                };
            }
        }

        const resultadoServidores =
            await obtenerTopServidoresRust(
                playerId,
                sesiones,
                servidoresMap
            );

        const totalSegundosServidores =
            resultadoServidores.totalSegundos;

        const totalOficialDisponible =
            estadisticasGlobales !== null;

        const totalSegundos = totalOficialDisponible
            ? estadisticasGlobales.totalSegundos
            : totalSegundosServidores;

        const totalHoras = totalOficialDisponible
            ? estadisticasGlobales.totalHoras
            : segundosAHorasRedondeado(totalSegundos);

        const segundosSemana = totalOficialDisponible
            ? estadisticasGlobales.segundosSemana
            : segundosSemanaSesiones;

        const segundosMes = totalOficialDisponible
            ? estadisticasGlobales.segundosMes
            : segundosMesSesiones;

        console.log("==========================================");
        console.log("📊 BM | Comparación de tiempos");
        console.log(
            `🌐 Total global web: ${totalOficialDisponible ? segundosAHorasRedondeado(totalSegundos) : "NO DISPONIBLE"}`
        );
        console.log(
            `🧮 Suma por servidores: ${segundosAHoras(totalSegundosServidores)}`
        );

        if (totalOficialDisponible) {
            const diferencia = totalSegundos -
                totalSegundosServidores;

            console.log(
                `🔍 Diferencia web - servidores: ${segundosAHorasRedondeado(Math.abs(diferencia))} (${diferencia >= 0 ? "+" : "-"}${Math.abs(diferencia)} segundos)`
            );
        }

        console.log(
            `📌 Fuente del total: ${totalOficialDisponible ? "time-played-statistics (web)" : "suma de servidores (respaldo)"}`
        );
        console.log("==========================================");

        const historialNombres = [];

        try {
            const response = await axiosBM.get(
                `/players/${playerId}/relationships/identifiers`,
                {
                    params: {
                        "page[size]": 100
                    }
                }
            );

            const identifiers = Array.isArray(
                response.data?.data
            )
                ? response.data.data
                : [];

            for (const item of identifiers) {
                const valor =
                    item.attributes?.identifier ||
                    item.attributes?.name;

                if (
                    valor &&
                    !historialNombres.includes(valor)
                ) {
                    historialNombres.push(String(valor));
                }

                if (historialNombres.length >= 3) break;
            }
        } catch (error) {
            console.log(
                "ℹ️ BM | Historial de nombres no disponible:",
                error?.response?.status || error.message
            );
        }

        return {
            id: String(playerId),
            nombre,
            name: nombre,

            online,
            jugando,

            // Duración de la sesión Rust activa.
            duracionSesionSegundos,
            duracionSesionConfiguradoSegundos,

            horasTotalesBM: totalSegundos,
            totalHoras,
            totalSegundos,

            totalSegundosServidores,
            totalOficialDisponible,
            fuenteTotal: totalOficialDisponible
                ? "time-played-statistics"
                : "suma-servidores",

            sesionesCompletas,

            horasSemana: segundosAHoras(segundosSemana),
            horasMes: segundosAHoras(segundosMes),

            ultimaConexion: ultimaConexion
                ? obtenerFechaChile(ultimaConexion)
                : null,

            servidor: servidorActualRust?.nombre || null,
            server: servidorActualRust?.nombre || null,

            servidorActualRust: servidorActualRust
                ? {
                    id: String(servidorActualRust.id),
                    nombre: servidorActualRust.nombre,
                    game: servidorActualRust.game
                }
                : null,

            horasServidorConfigurado,
            jugandoServidorConfigurado,

            topServidoresRust: resultadoServidores.top10,
            servidoresEncontrados: resultadoServidores.resultados,
            cantidadServidoresRust:
                resultadoServidores.cantidadServidoresRust,
            servidoresSinHoras:
                resultadoServidores.servidoresSinHoras,

            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados:
                            resultadoServidores.resultados
                    }
                }
            },

            historialNombres
        };
    } catch (error) {
        console.error(
            "❌ BM | Error general obteniendo datos del jugador:",
            esErrorDeRespuesta(error)
        );

        return null;
    }
}

// ============================================================
// OBTENER HORAS RESUMIDAS
// ============================================================

async function getBattleMetricsHours(
    playerId,
    configuredServerId = null
) {
    const datos = await getBattleMetricsPlayerStatus(
        playerId,
        configuredServerId
    );

    if (!datos) return null;

    return {
        totalHoras: datos.totalHoras,
        horasSemana: datos.horasSemana,
        horasMes: datos.horasMes,
        ultimaConexion: datos.ultimaConexion,
        servidor: datos.servidor,
        horasServidorConfigurado:
            datos.horasServidorConfigurado,
        sesionesCompletas: datos.sesionesCompletas,
        totalOficialDisponible:
            datos.totalOficialDisponible,
        fuenteTotal: datos.fuenteTotal,
        totalSegundosServidores:
            datos.totalSegundosServidores,
        duracionSesionSegundos:
            datos.duracionSesionSegundos,
        duracionSesionConfiguradoSegundos:
            datos.duracionSesionConfiguradoSegundos
    };
}

// ============================================================
// LEADERBOARD DEL SERVIDOR
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

        return extraerJugadoresRespuesta(response.data)
            .map(jugador => ({
                id: String(jugador.id),
                nombre:
                    jugador.attributes?.name || "Desconocido"
            }))
            .filter(jugador => jugador.nombre);
    } catch (error) {
        console.error(
            "❌ BM | Error leaderboard:",
            esErrorDeRespuesta(error)
        );

        return [];
    }
}

module.exports = {
    searchBattleMetricsPlayer,
    getBattleMetricsPlayerStatus,
    getBattleMetricsHours,
    getServerLeaderboard
};