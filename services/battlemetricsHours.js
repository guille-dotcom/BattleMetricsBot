const axios = require("axios");

const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;
const API = "https://api.battlemetrics.com";
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

function formatearDuracion(segundos) {
    segundos = Math.max(0, Number(segundos) || 0);

    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (dias > 0) return `${dias}d ${horas}h ${minutos}m`;
    if (horas > 0) return `${horas}h ${minutos}m`;

    return `${minutos}m`;
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
    } else if (responseData?.data && typeof responseData.data === "object") {
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
        const nombre = String(jugador.attributes?.name || "").trim();
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
// BUSCAR JUGADOR ENTRE LOS JUGADORES DEL SERVIDOR
// ============================================================

async function searchBattleMetricsPlayer(playerName, serverId) {
    if (!playerName || !serverId) return null;

    try {
        console.log(
            `🔎 BM | Buscando "${playerName}" en servidor ${serverId}`
        );

        const response = await axiosBM.get(`/servers/${serverId}`, {
            params: {
                include: "player"
            }
        });

        const jugadores = extraerJugadoresRespuesta(response.data);

        console.log(
            `🔎 BM | Recursos de jugadores recibidos: ${jugadores.length}`
        );

        const buscado = String(playerName).trim().toLowerCase();

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
        const response = await axiosBM.get(`/servers/${id}`, {
            params: {
                include: "game"
            }
        });

        const servidor = response.data?.data;

        if (!servidor) return null;

        const attributes = servidor.attributes || {};
        const gameId = servidor.relationships?.game?.data?.id || "";
        const gameAttribute = attributes.game || "";
        const nombre = attributes.name || `Servidor ${id}`;

        const game = String(gameAttribute || gameId);
        const textoJuego = `${game} ${gameId} ${nombre}`.toLowerCase();

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
            const data = Array.isArray(body.data) ? body.data : [];

            for (const session of data) {
                if (session) {
                    sesionesMap.set(obtenerIdSesion(session), session);
                }
            }

            console.log(
                `📄 BM | Sesiones página ${paginas}: ${data.length}; acumuladas: ${sesionesMap.size}`
            );

            // BattleMetrics suele proporcionar la siguiente página aquí.
            const next = body.links?.next;

            if (next) {
                url = next;
                continue;
            }

            // Si no hay enlace next y la página está llena, intentamos
            // page[number] como alternativa. Si falla, marcamos el
            // historial como incompleto en lugar de fingir que está completo.
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
                    const siguientes = Array.isArray(siguienteBody.data)
                        ? siguienteBody.data
                        : [];

                    if (siguientes.length === 0) {
                        url = null;
                        continue;
                    }

                    for (const session of siguientes) {
                        if (session) {
                            sesionesMap.set(obtenerIdSesion(session), session);
                        }
                    }

                    console.log(
                        `📄 BM | Sesiones página alternativa ${paginas + 1}: ${siguientes.length}; acumuladas: ${sesionesMap.size}`
                    );

                    url = siguienteBody.links?.next || null;

                    // Si la API no devuelve next, no asumimos que el historial
                    // está completo: una página de 100 podría ser solo un tramo.
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

    return { sesiones, completa };
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

    // Método 1: información del jugador en el servidor.
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

    // Método 2: historial de tiempo jugado de ese servidor.
    try {
        const response = await axiosBM.get(
            `/players/${player}/time-played-history/${server}`
        );

        const body = response.data || {};
        const data = Array.isArray(body.data) ? body.data : [];

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
        if (String(obtenerServerIdDeSesion(session)) !== String(serverId)) {
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
// TOP 10 Y TOTAL DE SERVIDORES RUST
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    sesiones,
    servidoresMap
) {
    const servidores = new Map();

    // Servidores conocidos desde la respuesta del jugador.
    for (const servidor of servidoresMap.values()) {
        if (servidor?.id && servidor.esRust) {
            servidores.set(String(servidor.id), servidor);
        }
    }

    // Descubrir todos los servidores presentes en las sesiones recuperadas.
    const idsSesiones = new Set();

    for (const session of sesiones) {
        const id = obtenerServerIdDeSesion(session);
        if (id) idsSesiones.add(String(id));
    }

    for (const id of idsSesiones) {
        if (servidores.has(id)) continue;

        const servidor = await obtenerInfoServidor(id, servidoresMap);

        if (servidor?.esRust) {
            servidores.set(id, servidor);
        }
    }

    const resultados = [];
    let servidoresSinHoras = 0;

    for (const servidor of servidores.values()) {
        const serverId = String(servidor.id);

        let segundos = 0;
        const horas = await obtenerHorasJugadorServidor(playerId, serverId);

        if (horas?.segundos > 0) {
            segundos = Number(horas.segundos) || 0;
        } else {
            // Respaldo solo cuando BattleMetrics no devuelve horas directas.
            segundos = calcularSegundosDeSesiones(sesiones, serverId);
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

    resultados.sort((a, b) => b.segundos - a.segundos);

    const totalSegundos = resultados.reduce(
        (total, servidor) => total + (Number(servidor.segundos) || 0),
        0
    );

    console.log(
        `🏆 BM | Servidores Rust con horas: ${resultados.length}; sin horas: ${servidoresSinHoras}`
    );

    console.log(
        `🧮 BM | Suma de tiempos recuperados: ${segundosAHoras(totalSegundos)}`
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
        console.log(`🎯 BM | Servidor configurado: ${configuredServerId || "NINGUNO"}`);
        console.log("==========================================");

        const playerResponse = await axiosBM.get(`/players/${playerId}`, {
            params: {
                include: "server"
            }
        });

        const player = playerResponse.data?.data;

        if (!player) {
            throw new Error("BattleMetrics no devolvió el jugador.");
        }

        const nombre = player.attributes?.name || "Desconocido";
        const servidoresMap = new Map();

        for (const recurso of playerResponse.data?.included || []) {
            if (recurso?.type !== "server" || !recurso.id) continue;

            const id = String(recurso.id);
            const attributes = recurso.attributes || {};
            const gameId = recurso.relationships?.game?.data?.id || "";
            const game = String(attributes.game || gameId);
            const nombreServidor = attributes.name || `Servidor ${id}`;

            servidoresMap.set(id, {
                id,
                nombre: nombreServidor,
                game,
                esRust: `${game} ${gameId} ${nombreServidor}`.toLowerCase().includes("rust"),
                ip: attributes.ip || null,
                port: attributes.port || null
            });
        }

        const resultadoSesiones = await obtenerTodasLasSesiones(playerId);
        const sesiones = resultadoSesiones.sesiones;
        const sesionesCompletas = resultadoSesiones.completa;

        let sesionActiva = null;
        let sesionActivaRust = null;
        let servidorActualRust = null;

        // Revisar todas las sesiones recuperadas para localizar la activa.
        for (const session of sesiones) {
            if (!esSesionActiva(session)) continue;

            if (!sesionActiva) sesionActiva = session;

            const serverId = obtenerServerIdDeSesion(session);
            if (!serverId) continue;

            let servidor = servidoresMap.get(String(serverId));

            if (!servidor) {
                servidor = await obtenerInfoServidor(serverId, servidoresMap);
            }

            if (servidor?.esRust) {
                sesionActivaRust = session;
                servidorActualRust = servidor;
                break;
            }
        }

        const online = Boolean(sesionActiva);
        const jugando = Boolean(sesionActivaRust);

        // Horas recientes calculadas a partir de las sesiones disponibles.
        let segundosSemana = 0;
        let segundosMes = 0;
        let ultimaConexion = null;

        const ahora = new Date();
        const inicioSemana = new Date(ahora);
        inicioSemana.setDate(inicioSemana.getDate() - inicioSemana.getDay());
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

            // Semana: recortar la sesión al inicio de esta semana.
            if (fin >= inicioSemana) {
                const inicioReal = inicio > inicioSemana ? inicio : inicioSemana;
                segundosSemana += Math.max(
                    0,
                    Math.floor((fin.getTime() - inicioReal.getTime()) / 1000)
                );
            }

            // Mes: recortar la sesión al inicio del mes.
            if (fin >= inicioMes) {
                const inicioReal = inicio > inicioMes ? inicio : inicioMes;
                segundosMes += Math.max(
                    0,
                    Math.floor((fin.getTime() - inicioReal.getTime()) / 1000)
                );
            }

            // Guardar la hora de inicio más reciente como referencia de última actividad.
            if (!ultimaConexion || inicio > ultimaConexion) {
                ultimaConexion = inicio;
            }
        }

        // Horas del servidor configurado solo si hay una sesión activa allí.
        let horasServidorConfigurado = null;
        let jugandoServidorConfigurado = false;

        if (
            configuredServerId &&
            servidorActualRust &&
            String(servidorActualRust.id) === String(configuredServerId)
        ) {
            jugandoServidorConfigurado = true;

            const horasDirectas = await obtenerHorasJugadorServidor(
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

        const resultadoServidores = await obtenerTopServidoresRust(
            playerId,
            sesiones,
            servidoresMap
        );

        const totalSegundos = resultadoServidores.totalSegundos;
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

            const identifiers = Array.isArray(response.data?.data)
                ? response.data.data
                : [];

            for (const item of identifiers) {
                const valor = item.attributes?.identifier ||
                    item.attributes?.name;

                if (valor && !historialNombres.includes(valor)) {
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

            // Suma de los tiempos por servidor que devolvió BattleMetrics.
            horasTotalesBM: totalSegundos,
            totalHoras: segundosAHoras(totalSegundos),
            totalSegundos,

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
            cantidadServidoresRust: resultadoServidores.cantidadServidoresRust,
            servidoresSinHoras: resultadoServidores.servidoresSinHoras,

            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados: resultadoServidores.resultados
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

async function getBattleMetricsHours(playerId, configuredServerId = null) {
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
        horasServidorConfigurado: datos.horasServidorConfigurado,
        sesionesCompletas: datos.sesionesCompletas
    };
}

// ============================================================
// LEADERBOARD DEL SERVIDOR
// ============================================================

async function getServerLeaderboard(serverId) {
    try {
        const response = await axiosBM.get(`/servers/${serverId}`, {
            params: {
                include: "player"
            }
        });

        return extraerJugadoresRespuesta(response.data)
            .map(jugador => ({
                id: String(jugador.id),
                nombre: jugador.attributes?.name || "Desconocido"
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