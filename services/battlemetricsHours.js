const axios = require("axios");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const API = "https://api.battlemetrics.com";

const HEADERS = {
    Authorization: `Bearer ${process.env.BATTLEMETRICS_TOKEN}`,
    Accept: "application/json"
};

const REQUEST_TIMEOUT = 30000;

const axiosBM = axios.create({
    baseURL: API,
    headers: HEADERS,
    timeout: REQUEST_TIMEOUT
});

const MAX_PAGINAS_SESIONES_SERVIDOR = 100;
const TAMANO_PAGINA_SESIONES = 100;


// ============================================================
// UTILIDADES
// ============================================================

function segundosAHoras(segundos) {
    segundos = Number(segundos) || 0;

    if (segundos <= 0) return "0h";

    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (!horas) return `${minutos}m`;
    if (!minutos) return `${horas}h`;

    return `${horas}h ${minutos}m`;
}

function obtenerFechaChile(fecha) {
    if (!fecha) return null;

    return new Date(fecha).toLocaleString("es-CL", {
        timeZone: "America/Santiago",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}

function normalizarNombre(nombre) {
    return String(nombre || "")
        .normalize("NFC")
        .trim()
        .toLocaleLowerCase("es");
}

function obtenerServerIdDeSesion(session) {
    const id = session?.relationships?.server?.data?.id;
    return id ? String(id) : null;
}

function esSesionActiva(session) {
    const a = session?.attributes;

    if (!a) return false;

    return (
        a.stop == null ||
        a.active === true ||
        a.online === true ||
        a.connected === true
    );
}

function obtenerTiempoSesionActual(session) {
    if (!session?.attributes?.start) return null;

    const inicio = new Date(session.attributes.start).getTime();

    if (!Number.isFinite(inicio) || inicio > Date.now()) {
        return null;
    }

    return Math.floor((Date.now() - inicio) / 1000);
}


// ============================================================
// EXTRAER JUGADORES DE RESPUESTAS BATTLEMETRICS
// ============================================================

function extraerJugadoresRespuesta(responseData) {
    const jugadores = [];

    if (!responseData) return jugadores;

    if (Array.isArray(responseData.data)) {
        jugadores.push(...responseData.data);
    } else if (
        responseData.data &&
        typeof responseData.data === "object" &&
        (
            responseData.data.type === "player" ||
            responseData.data.attributes?.name
        )
    ) {
        jugadores.push(responseData.data);
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
        if (!jugador) continue;

        const id = jugador.id ? String(jugador.id) : null;
        const nombre = jugador.attributes?.name || "";

        const clave = id || normalizarNombre(nombre);

        if (clave && !unicos.has(clave)) {
            unicos.set(clave, jugador);
        }
    }

    return [...unicos.values()];
}


// ============================================================
// NUEVA BÚSQUEDA: SESIONES DEL SERVIDOR CONFIGURADO
//
// IMPORTANTE:
// - No consulta /players?filter[search].
// - No hace búsquedas globales.
// - Solo consulta sesiones del servidor indicado.
// - Sigue links.next para recorrer páginas.
// ============================================================

async function searchBattleMetricsPlayer(playerName, serverId) {
    if (!playerName || !String(playerName).trim() || !serverId) {
        return null;
    }

    const nombreBuscado = normalizarNombre(playerName);
    const servidor = String(serverId).trim();

    console.log(
        `🔎 BM | Buscando "${playerName}" en las sesiones del servidor ${servidor}`
    );

    const jugadoresEncontrados = new Map();
    const urlsVisitadas = new Set();

    let siguienteUrl =
        `/servers/${servidor}/relationships/sessions`;

    let pagina = 0;
    let totalSesiones = 0;

    try {
        while (
            siguienteUrl &&
            pagina < MAX_PAGINAS_SESIONES_SERVIDOR
        ) {
            let response;

            // La primera solicitud lleva los parámetros de paginación.
            if (pagina === 0) {
                response = await axiosBM.get(siguienteUrl, {
                    params: {
                        include: "player",
                        "page[size]": TAMANO_PAGINA_SESIONES
                    }
                });
            } else {
                // BattleMetrics devuelve la URL de la siguiente página.
                response = await axiosBM.get(siguienteUrl);
            }

            const body = response.data || {};
            const sesiones = Array.isArray(body.data)
                ? body.data
                : [];

            totalSesiones += sesiones.length;

            // Jugadores incluidos en la respuesta de sesiones.
            const jugadoresIncluidos = extraerJugadoresRespuesta(body);

            for (const jugador of jugadoresIncluidos) {
                const id = jugador.id
                    ? String(jugador.id)
                    : null;

                const nombre = jugador.attributes?.name || "";

                if (!id || !nombre) continue;

                if (normalizarNombre(nombre) === nombreBuscado) {
                    jugadoresEncontrados.set(id, {
                        id,
                        nombre
                    });
                }
            }

            // También revisamos las relaciones player de cada sesión.
            // Esto cubre respuestas en las que el jugador se referencia
            // en relationships.player.data.
            for (const sesion of sesiones) {
                const relacionJugador =
                    sesion.relationships?.player?.data;

                if (!relacionJugador?.id) continue;

                const idJugador = String(relacionJugador.id);

                const jugadorIncluido = jugadoresIncluidos.find(
                    jugador => String(jugador.id) === idJugador
                );

                if (!jugadorIncluido) {
                    // La relación solo contiene el ID, no el nombre.
                    // No hacemos una búsqueda global para resolverlo.
                    continue;
                }

                const nombre = jugadorIncluido.attributes?.name || "";

                if (normalizarNombre(nombre) === nombreBuscado) {
                    jugadoresEncontrados.set(idJugador, {
                        id: idJugador,
                        nombre
                    });
                }
            }

            console.log(
                `🔎 BM | Página ${pagina + 1}: ${sesiones.length} sesiones; ` +
                `${jugadoresIncluidos.length} jugadores incluidos; ` +
                `${jugadoresEncontrados.size} coincidencias`
            );

            const next = body.links?.next;

            if (!next) {
                siguienteUrl = null;
                break;
            }

            // Evitar bucles si la API devuelve una URL repetida.
            const siguienteNormalizada = String(next);

            if (urlsVisitadas.has(siguienteNormalizada)) {
                console.warn(
                    "⚠️ BM | La paginación devolvió una URL repetida."
                );

                break;
            }

            urlsVisitadas.add(siguienteNormalizada);
            siguienteUrl = siguienteNormalizada;
            pagina++;

            // Si ya hay una coincidencia exacta, podemos devolverla.
            if (jugadoresEncontrados.size > 0) {
                break;
            }
        }

        console.log(
            `📊 BM | Sesiones revisadas en servidor ${servidor}: ${totalSesiones}`
        );

        if (pagina >= MAX_PAGINAS_SESIONES_SERVIDOR && siguienteUrl) {
            console.warn(
                `⚠️ BM | Se alcanzó el límite de ${MAX_PAGINAS_SESIONES_SERVIDOR} páginas.`
            );
        }

        const encontrados = [...jugadoresEncontrados.values()];

        if (encontrados.length === 0) {
            console.log(
                `⚠️ BM | "${playerName}" no aparece en las sesiones devueltas para el servidor ${servidor}.`
            );

            return null;
        }

        if (encontrados.length > 1) {
            return {
                duplicate: true,
                players: encontrados.map(jugador => ({
                    id: jugador.id,
                    attributes: {
                        name: jugador.nombre
                    }
                }))
            };
        }

        console.log(
            `✅ BM | Jugador encontrado en servidor ${servidor}: ` +
            `${encontrados[0].nombre} (${encontrados[0].id})`
        );

        return {
            duplicate: false,
            id: encontrados[0].id,
            nombre: encontrados[0].nombre
        };
    } catch (error) {
        console.error(
            `❌ BM | Error consultando sesiones del servidor ${servidor}:`,
            error.response?.data || error.message
        );

        return null;
    }
}


// ============================================================
// INFORMACIÓN DE UN SERVIDOR
// ============================================================

async function obtenerInfoServidor(serverId, cache = new Map()) {
    if (!serverId) return null;

    const id = String(serverId);

    if (cache.has(id)) {
        return cache.get(id);
    }

    try {
        const response = await axiosBM.get(`/servers/${id}`, {
            params: {
                include: "game"
            }
        });

        const servidor = response.data?.data;

        if (!servidor) return null;

        const attributes = servidor.attributes || {};
        const game = servidor.relationships?.game?.data?.id ||
            attributes.game ||
            "";

        const nombre = attributes.name || `Servidor ${id}`;

        const resultado = {
            id,
            nombre,
            game,
            esRust:
                String(game).toLowerCase().includes("rust") ||
                nombre.toLowerCase().includes("rust"),
            ip: attributes.ip || null,
            port: attributes.port || null
        };

        cache.set(id, resultado);

        return resultado;
    } catch (error) {
        console.error(
            `⚠️ BM | Error obteniendo servidor ${id}:`,
            error.response?.data || error.message
        );

        return null;
    }
}


// ============================================================
// OBTENER TODAS LAS SESIONES DE UN JUGADOR
// ============================================================

async function obtenerTodasLasSesiones(playerId) {
    const sesiones = [];
    const urlsVisitadas = new Set();

    let siguienteUrl =
        `/players/${playerId}/relationships/sessions`;

    let pagina = 0;

    try {
        while (siguienteUrl && pagina < 100) {
            const response = pagina === 0
                ? await axiosBM.get(siguienteUrl, {
                    params: {
                        "page[size]": 100
                    }
                })
                : await axiosBM.get(siguienteUrl);

            const body = response.data || {};
            const datos = Array.isArray(body.data) ? body.data : [];

            sesiones.push(...datos);

            const next = body.links?.next;

            if (!next) break;

            const url = String(next);

            if (urlsVisitadas.has(url)) break;

            urlsVisitadas.add(url);
            siguienteUrl = url;
            pagina++;
        }
    } catch (error) {
        console.error(
            "❌ BM | Error obteniendo sesiones del jugador:",
            error.response?.data || error.message
        );
    }

    console.log(`📊 BM | Sesiones del jugador obtenidas: ${sesiones.length}`);

    return sesiones;
}


// ============================================================
// HORAS DE UN JUGADOR EN UN SERVIDOR CONCRETO
// ============================================================

async function obtenerHorasJugadorServidor(playerId, serverId) {
    if (!playerId || !serverId) return null;

    const player = String(playerId);
    const server = String(serverId);

    try {
        const response = await axiosBM.get(
            `/players/${player}/servers/${server}`
        );

        const data = response.data?.data;
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

        for (const valor of candidatos) {
            const segundos = Number(valor);

            if (Number.isFinite(segundos) && segundos > 0) {
                return {
                    id: server,
                    segundos,
                    tiempo: segundosAHoras(segundos),
                    origen: "player-server"
                };
            }
        }
    } catch (error) {
        console.log(
            `⚠️ BM | Consulta directa de horas no disponible para ${server}:`,
            error.response?.status || error.message
        );
    }

    try {
        const response = await axiosBM.get(
            `/players/${player}/time-played-history/${server}`
        );

        const body = response.data || {};
        const data = Array.isArray(body.data) ? body.data : [];

        let segundos = Number(
            body.meta?.timePlayed ||
            body.meta?.timeplayed ||
            body.meta?.totalSeconds ||
            0
        );

        if (segundos <= 0) {
            for (const registro of data) {
                const a = registro.attributes || {};

                const valor = Number(
                    a.timePlayed ||
                    a.timeplayed ||
                    a.seconds ||
                    a.duration ||
                    a.totalSeconds ||
                    0
                );

                if (valor > 0) {
                    segundos += valor;
                }
            }
        }

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
            `⚠️ BM | Historial de horas no disponible para ${server}:`,
            error.response?.status || error.message
        );
    }

    return null;
}


// ============================================================
// TOTAL DE HORAS DEL OVERVIEW DE BATTLEMETRICS
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
            return 0;
        }

        const rust = estadisticas.find(item =>
            item.relationships?.game?.data?.id === "rust"
        );

        const segundos = Number(rust?.attributes?.timePlayed);

        return Number.isFinite(segundos) && segundos > 0
            ? segundos
            : 0;
    } catch (error) {
        console.error(
            `⚠️ BM | Error obteniendo total del jugador ${playerId}:`,
            error.response?.data || error.message
        );

        return 0;
    }
}


// ============================================================
// TOP DE SERVIDORES RUST A PARTIR DE SESIONES
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    sesiones = [],
    servidoresMap = new Map()
) {
    const acumulados = new Map();
    const ahora = Date.now();

    for (const session of sesiones) {
        const a = session.attributes || {};
        const serverId = obtenerServerIdDeSesion(session);

        if (!serverId || !a.start) continue;

        const inicio = new Date(a.start).getTime();

        if (!Number.isFinite(inicio) || inicio > ahora) continue;

        let fin;

        if (a.stop) {
            fin = new Date(a.stop).getTime();
        } else if (esSesionActiva(session)) {
            fin = ahora;
        } else {
            continue;
        }

        if (!Number.isFinite(fin) || fin <= inicio) continue;

        const segundos = Math.floor((fin - inicio) / 1000);
        const id = String(serverId);

        acumulados.set(
            id,
            (acumulados.get(id) || 0) + segundos
        );
    }

    const encontrados = [];
    let totalSegundos = 0;

    for (const [serverId, segundos] of acumulados.entries()) {
        let servidor = servidoresMap.get(serverId);

        if (!servidor) {
            servidor = await obtenerInfoServidor(
                serverId,
                servidoresMap
            );
        }

        if (!servidor || !servidor.esRust) continue;

        encontrados.push({
            id: String(serverId),
            nombre: servidor.nombre,
            game: servidor.game,
            segundos,
            tiempo: segundosAHoras(segundos)
        });

        totalSegundos += segundos;
    }

    encontrados.sort((a, b) => b.segundos - a.segundos);

    return {
        top10: encontrados.slice(0, 10),
        cantidadServidoresRust: encontrados.length,
        totalSegundos,
        servidoresEncontrados: encontrados
    };
}


// ============================================================
// ESTADO COMPLETO DEL JUGADOR
// ============================================================

async function getBattleMetricsPlayerStatus(
    playerId,
    configuredServerId = null
) {
    try {
        console.log(`🔎 BM | Analizando jugador ${playerId}`);

        const response = await axiosBM.get(`/players/${playerId}`, {
            params: {
                include: "server"
            }
        });

        const player = response.data?.data;

        if (!player) {
            throw new Error("Jugador no encontrado en BattleMetrics");
        }

        const nombre = player.attributes?.name || "Desconocido";

        const totalOverviewBM =
            await obtenerTotalOverviewBattleMetrics(playerId);

        const servidoresMap = new Map();

        for (const recurso of response.data?.included || []) {
            if (recurso.type !== "server" || !recurso.id) continue;

            const id = String(recurso.id);
            const a = recurso.attributes || {};
            const game = a.game || "";
            const nombreServidor = a.name || `Servidor ${id}`;

            servidoresMap.set(id, {
                id,
                nombre: nombreServidor,
                game,
                esRust:
                    String(game).toLowerCase().includes("rust") ||
                    nombreServidor.toLowerCase().includes("rust")
            });
        }

        const sesiones = await obtenerTodasLasSesiones(playerId);

        for (const session of sesiones) {
            const serverId = obtenerServerIdDeSesion(session);

            if (serverId && !servidoresMap.has(serverId)) {
                await obtenerInfoServidor(serverId, servidoresMap);
            }
        }

        let sesionActiva = null;
        let sesionActivaRust = null;
        let servidorActualRust = null;

        for (const session of sesiones) {
            if (!esSesionActiva(session)) continue;

            const serverId = obtenerServerIdDeSesion(session);

            if (!serverId) continue;

            let servidor = servidoresMap.get(serverId);

            if (!servidor) {
                servidor = await obtenerInfoServidor(
                    serverId,
                    servidoresMap
                );
            }

            if (!sesionActiva) {
                sesionActiva = session;
            }

            if (servidor?.esRust) {
                sesionActivaRust = session;
                servidorActualRust = servidor;
                break;
            }
        }

        const online = Boolean(sesionActiva);
        const jugando = servidorActualRust?.nombre || null;
        const sesionActual = sesionActivaRust || sesionActiva;

        const segundosSesionActual = sesionActual
            ? obtenerTiempoSesionActual(sesionActual)
            : null;

        const inicioSemana = new Date();
        inicioSemana.setHours(0, 0, 0, 0);
        inicioSemana.setDate(
            inicioSemana.getDate() -
            ((inicioSemana.getDay() + 6) % 7)
        );

        const inicioMes = new Date();
        inicioMes.setHours(0, 0, 0, 0);
        inicioMes.setDate(1);

        const ahora = new Date();

        let segundosTotalesSesiones = 0;
        let segundosSemana = 0;
        let segundosMes = 0;
        let ultimaConexion = null;

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

            const segundos = Math.floor(
                (fin.getTime() - inicio.getTime()) / 1000
            );

            segundosTotalesSesiones += segundos;

            const inicioSemanaReal = new Date(
                Math.max(inicio.getTime(), inicioSemana.getTime())
            );

            const finSemanaReal = new Date(
                Math.min(fin.getTime(), ahora.getTime())
            );

            if (finSemanaReal > inicioSemanaReal) {
                segundosSemana += Math.floor(
                    (finSemanaReal - inicioSemanaReal) / 1000
                );
            }

            const inicioMesReal = new Date(
                Math.max(inicio.getTime(), inicioMes.getTime())
            );

            const finMesReal = new Date(
                Math.min(fin.getTime(), ahora.getTime())
            );

            if (finMesReal > inicioMesReal) {
                segundosMes += Math.floor(
                    (finMesReal - inicioMesReal) / 1000
                );
            }

            if (!ultimaConexion || fin > ultimaConexion) {
                ultimaConexion = fin;
            }
        }

        let horasServidorConfigurado = null;
        let jugandoServidorConfigurado = false;

        if (
            configuredServerId &&
            servidorActualRust &&
            String(servidorActualRust.id) ===
                String(configuredServerId)
        ) {
            jugandoServidorConfigurado = true;

            horasServidorConfigurado =
                await obtenerHorasJugadorServidor(
                    playerId,
                    configuredServerId
                );
        }

        const resultadoServidores = await obtenerTopServidoresRust(
            playerId,
            sesiones,
            servidoresMap
        );

        let horasTotalesBM = Number(totalOverviewBM) || 0;

        if (horasTotalesBM <= 0) {
            horasTotalesBM =
                resultadoServidores.totalSegundos ||
                segundosTotalesSesiones;
        }

        let historialNombres = [];

        try {
            const identifiersResponse = await axiosBM.get(
                `/players/${playerId}/relationships/identifiers`,
                {
                    params: {
                        "page[size]": 100
                    }
                }
            );

            const identifiers = Array.isArray(
                identifiersResponse.data?.data
            )
                ? identifiersResponse.data.data
                : [];

            historialNombres = identifiers
                .map(item =>
                    item.attributes?.identifier ||
                    item.attributes?.name ||
                    null
                )
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

        return {
            id: String(playerId),
            nombre,
            name: nombre,

            online,
            jugando,

            segundosSesionActual,
            tiempoSesionActual:
                segundosSesionActual != null
                    ? segundosAHoras(segundosSesionActual)
                    : null,

            horasTotalesBM,
            totalHoras: segundosAHoras(horasTotalesBM),
            horasSemana: segundosAHoras(segundosSemana),
            horasMes: segundosAHoras(segundosMes),

            ultimaConexion: ultimaConexion
                ? obtenerFechaChile(ultimaConexion)
                : "Nunca",

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

            cantidadServidoresRust:
                resultadoServidores.cantidadServidoresRust,

            topServidoresRust: resultadoServidores.top10,

            servidoresEncontrados:
                resultadoServidores.servidoresEncontrados,

            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados:
                            resultadoServidores.servidoresEncontrados,
                        cantidad:
                            resultadoServidores.cantidadServidoresRust
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
        servidorActualRust: datos.servidorActualRust,
        cantidadServidoresRust: datos.cantidadServidoresRust,
        topServidoresRust: datos.topServidoresRust,
        servidoresEncontrados: datos.servidoresEncontrados,
        horasServidorConfigurado: datos.horasServidorConfigurado
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
                id: jugador.id,
                nombre: jugador.attributes?.name || "Desconocido"
            }))
            .filter(jugador => jugador.nombre);
    } catch (error) {
        console.error(
            "❌ BM | Error obteniendo leaderboard:",
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