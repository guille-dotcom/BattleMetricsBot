const axios = require("axios");

const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

const API = "https://api.battlemetrics.com";

const REQUEST_TIMEOUT = 30000;
const MAX_PAGINAS_SESIONES = 200;

// ============================================================
// OPTIMIZACIÓN
// ============================================================

// Número máximo de consultas simultáneas a BattleMetrics.
// 8 es un buen equilibrio entre velocidad y evitar 429.
const CONCURRENCIA_SERVIDORES = 8;
const CONCURRENCIA_HORAS = 8;

// Cache global de información de servidores.
// La información de un servidor cambia muy poco.
const CACHE_SERVIDORES_TTL = 30 * 60 * 1000; // 30 minutos

const cacheServidoresGlobal = new Map();

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

function segundosAHorasRedondeado(segundos) {
    segundos = Math.max(0, Number(segundos) || 0);

    const minutosTotales = Math.round(segundos / 60);
    const horas = Math.floor(minutosTotales / 60);
    const minutos = minutosTotales % 60;

    if (horas === 0) return `${minutos}m`;
    if (minutos === 0) return `${horas}h`;

    return `${horas}h ${minutos}m`;
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

    return Math.max(
        0,
        Math.floor((ahora - inicio) / 1000)
    );
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

    if (
        a.stop === null ||
        typeof a.stop === "undefined"
    ) {
        return true;
    }

    return (
        a.active === true ||
        a.online === true ||
        a.connected === true
    );
}

function obtenerServerIdDeSesion(session) {
    const id =
        session?.relationships?.server?.data?.id;

    return id !== null &&
        typeof id !== "undefined"
        ? String(id)
        : null;
}

function obtenerIdSesion(session) {
    if (
        session?.id !== null &&
        typeof session?.id !== "undefined"
    ) {
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

        const id = jugador.id
            ? String(jugador.id)
            : "";

        const nombre = String(
            jugador.attributes?.name || ""
        ).trim();

        const clave =
            id || nombre.toLowerCase();

        if (clave && !unicos.has(clave)) {
            unicos.set(clave, jugador);
        }
    }

    return Array.from(unicos.values());
}

function extraerSegundosCandidatos(objetos) {
    for (const objeto of objetos) {
        if (
            !objeto ||
            typeof objeto !== "object"
        ) {
            continue;
        }

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
    return (
        error?.response?.data ||
        error?.response?.status ||
        error?.message ||
        error
    );
}

// ============================================================
// EJECUTAR PROMESAS CON CONCURRENCIA LIMITADA
// ============================================================

async function mapConLimite(
    elementos,
    limite,
    callback
) {
    const lista = Array.from(elementos || []);

    if (lista.length === 0) {
        return [];
    }

    const resultados =
        new Array(lista.length);

    let indice = 0;

    const workers = Array.from(
        {
            length: Math.min(
                limite,
                lista.length
            )
        },
        async () => {
            while (true) {
                const actual = indice++;

                if (actual >= lista.length) {
                    break;
                }

                try {
                    resultados[actual] =
                        await callback(
                            lista[actual],
                            actual
                        );
                } catch (error) {
                    console.warn(
                        "⚠️ BM | Error en worker:",
                        esErrorDeRespuesta(error)
                    );

                    resultados[actual] = null;
                }
            }
        }
    );

    await Promise.all(workers);

    return resultados;
}

// ============================================================
// BUSCAR JUGADOR ENTRE LOS JUGADORES DEL SERVIDOR
// ============================================================

async function searchBattleMetricsPlayer(
    playerName,
    serverId
) {
    if (!playerName || !serverId) {
        return null;
    }

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

        const jugadores =
            extraerJugadoresRespuesta(
                response.data
            );

        console.log(
            `🔎 BM | Recursos de jugadores recibidos: ${jugadores.length}`
        );

        const buscado = String(playerName)
            .trim()
            .toLowerCase();

        const encontrados =
            jugadores.filter(jugador =>
                String(
                    jugador.attributes?.name || ""
                )
                    .trim()
                    .toLowerCase() === buscado
            );

        console.log(
            `🔎 BM | Coincidencias encontradas: ${encontrados.length}`
        );

        if (encontrados.length === 0) {
            return null;
        }

        if (encontrados.length > 1) {
            return {
                duplicate: true,

                players:
                    encontrados.map(jugador => ({
                        id: String(jugador.id),

                        nombre:
                            jugador.attributes?.name ||
                            playerName
                    }))
            };
        }

        return {
            duplicate: false,

            id: String(
                encontrados[0].id
            ),

            nombre:
                encontrados[0]
                    .attributes?.name ||
                playerName
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
// CACHE GLOBAL DE SERVIDORES
// ============================================================

function obtenerServidorCacheGlobal(id) {
    const cache =
        cacheServidoresGlobal.get(
            String(id)
        );

    if (!cache) {
        return null;
    }

    if (
        Date.now() - cache.timestamp >
        CACHE_SERVIDORES_TTL
    ) {
        cacheServidoresGlobal.delete(
            String(id)
        );

        return null;
    }

    return cache.data;
}

function guardarServidorCacheGlobal(
    id,
    servidor
) {
    if (!id || !servidor) return;

    cacheServidoresGlobal.set(
        String(id),
        {
            timestamp: Date.now(),
            data: servidor
        }
    );
}

// ============================================================
// INFORMACIÓN DE SERVIDOR
// ============================================================

async function obtenerInfoServidor(
    serverId,
    cache = new Map()
) {
    if (!serverId) {
        return null;
    }

    const id = String(serverId);

    // Cache de la ejecución actual
    if (cache.has(id)) {
        return cache.get(id);
    }

    // Cache global
    const global =
        obtenerServidorCacheGlobal(id);

    if (global) {
        cache.set(id, global);

        return global;
    }

    try {
        const response = await axiosBM.get(
            `/servers/${id}`,
            {
                params: {
                    include: "game"
                }
            }
        );

        const servidor =
            response.data?.data;

        if (!servidor) {
            return null;
        }

        const attributes =
            servidor.attributes || {};

        const gameId =
            servidor
                .relationships
                ?.game
                ?.data
                ?.id || "";

        const gameAttribute =
            attributes.game || "";

        const nombre =
            attributes.name ||
            `Servidor ${id}`;

        const game = String(
            gameAttribute || gameId
        );

        const textoJuego =
            `${game} ${gameId} ${nombre}`
                .toLowerCase();

        const resultado = {
            id,
            nombre,
            game,

            esRust:
                textoJuego.includes("rust"),

            ip: attributes.ip || null,
            port: attributes.port || null
        };

        cache.set(
            id,
            resultado
        );

        guardarServidorCacheGlobal(
            id,
            resultado
        );

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

async function obtenerTodasLasSesiones(
    playerId
) {
    const sesionesMap = new Map();

    let url =
        `/players/${playerId}/relationships/sessions`;

    let params = {
        "page[size]": 100
    };

    let paginas = 0;
    let completa = true;

    while (
        url &&
        paginas < MAX_PAGINAS_SESIONES
    ) {
        paginas++;

        try {
            const response =
                await axiosBM.get(
                    url,
                    { params }
                );

            params = undefined;

            const body =
                response.data || {};

            const data =
                Array.isArray(body.data)
                    ? body.data
                    : [];

            for (const session of data) {
                if (!session) continue;

                sesionesMap.set(
                    obtenerIdSesion(session),
                    session
                );
            }

            console.log(
                `📄 BM | Sesiones página ${paginas}: ${data.length}; acumuladas: ${sesionesMap.size}`
            );

            const next =
                body.links?.next;

            if (next) {
                url = next;
                continue;
            }

            /*
             * Algunos resultados de BM no traen
             * links.next aunque exista otra página.
             */
            if (data.length >= 100) {
                try {
                    const siguiente =
                        await axiosBM.get(
                            `/players/${playerId}/relationships/sessions`,
                            {
                                params: {
                                    "page[size]": 100,
                                    "page[number]":
                                        paginas + 1
                                }
                            }
                        );

                    const siguienteBody =
                        siguiente.data || {};

                    const siguientes =
                        Array.isArray(
                            siguienteBody.data
                        )
                            ? siguienteBody.data
                            : [];

                    if (
                        siguientes.length === 0
                    ) {
                        url = null;
                        continue;
                    }

                    for (
                        const session
                        of siguientes
                    ) {
                        if (!session) continue;

                        sesionesMap.set(
                            obtenerIdSesion(
                                session
                            ),
                            session
                        );
                    }

                    paginas++;

                    console.log(
                        `📄 BM | Sesiones página ${paginas}: ${siguientes.length}; acumuladas: ${sesionesMap.size}`
                    );

                    url =
                        siguienteBody
                            .links
                            ?.next ||
                        null;

                    if (
                        !url &&
                        siguientes.length >= 100
                    ) {
                        /*
                         * Seguimos manualmente.
                         */
                        url =
                            `/players/${playerId}/relationships/sessions`;

                        params = {
                            "page[size]": 100,
                            "page[number]":
                                paginas + 1
                        };
                    }

                } catch (errorPagina) {
                    completa = false;

                    console.error(
                        `❌ BM | Falló la paginación después de ${sesionesMap.size} sesiones:`,
                        esErrorDeRespuesta(
                            errorPagina
                        )
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

    if (
        paginas >= MAX_PAGINAS_SESIONES &&
        url
    ) {
        completa = false;

        console.warn(
            `⚠️ BM | Se alcanzó el límite de ${MAX_PAGINAS_SESIONES} páginas de sesiones.`
        );
    }

    const sesiones =
        Array.from(
            sesionesMap.values()
        );

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

async function obtenerHorasJugadorServidor(
    playerId,
    serverId,
    cacheHoras = null
) {
    if (!playerId || !serverId) {
        return null;
    }

    const player =
        String(playerId);

    const server =
        String(serverId);

    const cacheKey =
        `${player}:${server}`;

    /*
     * Evita consultar dos veces el mismo
     * servidor durante el mismo /horas.
     */
    if (
        cacheHoras &&
        cacheHoras.has(cacheKey)
    ) {
        return cacheHoras.get(
            cacheKey
        );
    }

    const promesa = (async () => {
        console.log(
            `🎯 BM | Consultando horas: jugador ${player} -> servidor ${server}`
        );

        // ====================================================
        // MÉTODO PRINCIPAL
        // /players/{player}/servers/{server}
        // ====================================================

        try {
            const response =
                await axiosBM.get(
                    `/players/${player}/servers/${server}`
                );

            const data =
                response.data?.data || {};

            const segundos =
                extraerSegundosCandidatos([
                    data.meta,
                    data.attributes,
                    response.data?.meta
                ]);

            if (segundos > 0) {
                console.log(
                    `✅ BM | ${server}: ${segundosAHoras(segundos)}`
                );

                return {
                    id: server,
                    segundos,
                    tiempo:
                        segundosAHoras(
                            segundos
                        ),
                    origen:
                        "player-server"
                };
            }

        } catch (error) {
            console.log(
                `ℹ️ BM | player-server no disponible ${server}:`,
                error?.response?.status ||
                error.message
            );
        }

        // ====================================================
        // RESPALDO
        // Solo se consulta si el método rápido falla.
        // ====================================================

        try {
            const response =
                await axiosBM.get(
                    `/players/${player}/time-played-history/${server}`
                );

            const body =
                response.data || {};

            const data =
                Array.isArray(body.data)
                    ? body.data
                    : [];

            let segundos =
                extraerSegundosCandidatos([
                    body.meta,
                    body.data?.meta
                ]);

            if (segundos <= 0) {
                for (
                    const registro
                    of data
                ) {
                    segundos +=
                        extraerSegundosCandidatos([
                            registro?.meta,
                            registro?.attributes
                        ]);
                }
            }

            if (segundos > 0) {
                console.log(
                    `✅ BM | Historial ${server}: ${segundosAHoras(segundos)}`
                );

                return {
                    id: server,
                    segundos,
                    tiempo:
                        segundosAHoras(
                            segundos
                        ),
                    origen:
                        "time-played-history"
                };
            }

        } catch (error) {
            console.log(
                `ℹ️ BM | Historial no disponible ${server}:`,
                error?.response?.status ||
                error.message
            );
        }

        return null;
    })();

    /*
     * Guardamos la PROMESA, no solo el resultado.
     * Así dos partes del comando que pidan el mismo
     * servidor simultáneamente comparten la petición.
     */
    if (cacheHoras) {
        cacheHoras.set(
            cacheKey,
            promesa
        );
    }

    const resultado =
        await promesa;

    if (cacheHoras) {
        cacheHoras.set(
            cacheKey,
            resultado
        );
    }

    return resultado;
}

// ============================================================
// INDEXAR TIEMPO DE SESIONES POR SERVIDOR
// ============================================================

function crearIndiceSesiones(sesiones) {
    const indice = new Map();

    const ahora = Date.now();

    for (const session of sesiones) {
        const serverId =
            obtenerServerIdDeSesion(
                session
            );

        if (!serverId) continue;

        const a =
            session.attributes || {};

        if (!a.start) continue;

        const inicio =
            new Date(a.start).getTime();

        let fin;

        if (a.stop) {
            fin =
                new Date(a.stop)
                    .getTime();
        } else if (
            esSesionActiva(session)
        ) {
            fin = ahora;
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

        const segundos =
            Math.floor(
                (fin - inicio) / 1000
            );

        indice.set(
            String(serverId),
            (
                indice.get(
                    String(serverId)
                ) || 0
            ) + segundos
        );
    }

    return indice;
}

function calcularSegundosDeSesiones(
    sesionesOIndice,
    serverId
) {
    /*
     * Nuevo método rápido:
     * si recibimos Map, lookup O(1).
     */
    if (
        sesionesOIndice instanceof Map
    ) {
        return (
            sesionesOIndice.get(
                String(serverId)
            ) || 0
        );
    }

    /*
     * Compatibilidad con el método antiguo.
     */
    let total = 0;

    for (
        const session
        of sesionesOIndice || []
    ) {
        if (
            String(
                obtenerServerIdDeSesion(
                    session
                )
            ) !== String(serverId)
        ) {
            continue;
        }

        const a =
            session.attributes || {};

        if (!a.start) continue;

        const inicio =
            new Date(a.start)
                .getTime();

        let fin;

        if (a.stop) {
            fin =
                new Date(a.stop)
                    .getTime();
        } else if (
            esSesionActiva(session)
        ) {
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

        total += Math.floor(
            (fin - inicio) / 1000
        );
    }

    return total;
}

// ============================================================
// TOP Y TOTAL SUMADO DE SERVIDORES RUST
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    sesiones,
    servidoresMap,
    cacheHoras
) {
    const inicioProceso =
        Date.now();

    const servidores =
        new Map();

    // ========================================================
    // SERVIDORES QUE YA VINIERON CON EL PLAYER
    // ========================================================

    for (
        const servidor
        of servidoresMap.values()
    ) {
        if (
            servidor?.id &&
            servidor.esRust
        ) {
            servidores.set(
                String(servidor.id),
                servidor
            );
        }
    }

    // ========================================================
    // IDS DE SERVIDORES ENCONTRADOS EN LAS SESIONES
    // ========================================================

    const idsSesiones =
        new Set();

    for (const session of sesiones) {
        const id =
            obtenerServerIdDeSesion(
                session
            );

        if (id) {
            idsSesiones.add(
                String(id)
            );
        }
    }

    const idsDesconocidos =
        Array.from(idsSesiones)
            .filter(
                id =>
                    !servidoresMap.has(id)
            );

    console.log(
        `⚡ BM | Servidores históricos: ${idsSesiones.size}`
    );

    console.log(
        `⚡ BM | Servidores por identificar: ${idsDesconocidos.length}`
    );

    // ========================================================
    // OPTIMIZACIÓN #1
    // IDENTIFICAR SERVIDORES EN PARALELO
    // ========================================================

    const infoServidores =
        await mapConLimite(
            idsDesconocidos,
            CONCURRENCIA_SERVIDORES,
            async id =>
                obtenerInfoServidor(
                    id,
                    servidoresMap
                )
        );

    for (
        const servidor
        of infoServidores
    ) {
        if (
            servidor?.id &&
            servidor.esRust
        ) {
            servidores.set(
                String(servidor.id),
                servidor
            );
        }
    }

    /*
     * Después de las consultas anteriores,
     * servidoresMap puede contener más servidores Rust.
     */
    for (
        const servidor
        of servidoresMap.values()
    ) {
        if (
            servidor?.id &&
            servidor.esRust
        ) {
            servidores.set(
                String(servidor.id),
                servidor
            );
        }
    }

    console.log(
        `🦀 BM | Servidores Rust detectados: ${servidores.size}`
    );

    // ========================================================
    // ÍNDICE DE SESIONES
    // ========================================================

    const indiceSesiones =
        crearIndiceSesiones(
            sesiones
        );

    // ========================================================
    // OPTIMIZACIÓN #2
    // CONSULTAR HORAS EN PARALELO
    // ========================================================

    const listaServidores =
        Array.from(
            servidores.values()
        );

    const resultadosConsulta =
        await mapConLimite(
            listaServidores,
            CONCURRENCIA_HORAS,

            async servidor => {
                const serverId =
                    String(
                        servidor.id
                    );

                let segundos = 0;

                const horas =
                    await obtenerHorasJugadorServidor(
                        playerId,
                        serverId,
                        cacheHoras
                    );

                if (
                    horas?.segundos > 0
                ) {
                    segundos =
                        Number(
                            horas.segundos
                        ) || 0;
                } else {
                    segundos =
                        calcularSegundosDeSesiones(
                            indiceSesiones,
                            serverId
                        );
                }

                if (segundos <= 0) {
                    return null;
                }

                return {
                    id: serverId,
                    nombre:
                        servidor.nombre,
                    game:
                        servidor.game,
                    segundos,
                    tiempo:
                        segundosAHoras(
                            segundos
                        )
                };
            }
        );

    const resultados =
        resultadosConsulta
            .filter(Boolean);

    const servidoresSinHoras =
        listaServidores.length -
        resultados.length;

    resultados.sort(
        (a, b) =>
            b.segundos -
            a.segundos
    );

    const totalSegundos =
        resultados.reduce(
            (total, servidor) =>
                total +
                (
                    Number(
                        servidor.segundos
                    ) || 0
                ),
            0
        );

    console.log(
        `🏆 BM | Servidores Rust con horas: ${resultados.length}; sin horas: ${servidoresSinHoras}`
    );

    console.log(
        `🧮 BM | Suma por servidor: ${segundosAHoras(totalSegundos)}`
    );

    console.log(
        `⚡ BM | Top calculado en ${Date.now() - inicioProceso} ms`
    );

    return {
        resultados,

        top10:
            resultados.slice(
                0,
                10
            ),

        totalSegundos,

        cantidadServidoresRust:
            resultados.length,

        servidoresSinHoras
    };
}

// ============================================================
// HISTORIAL DE NOMBRES
// ============================================================

async function obtenerHistorialNombres(
    playerId
) {
    const historialNombres = [];

    try {
        const response =
            await axiosBM.get(
                `/players/${playerId}/relationships/identifiers`,
                {
                    params: {
                        "page[size]": 100
                    }
                }
            );

        const identifiers =
            Array.isArray(
                response.data?.data
            )
                ? response.data.data
                : [];

        for (
            const item
            of identifiers
        ) {
            const valor =
                item.attributes?.identifier ||
                item.attributes?.name;

            if (
                valor &&
                !historialNombres.includes(
                    String(valor)
                )
            ) {
                historialNombres.push(
                    String(valor)
                );
            }

            if (
                historialNombres.length >= 3
            ) {
                break;
            }
        }

    } catch (error) {
        console.log(
            "ℹ️ BM | Historial de nombres no disponible:",
            error?.response?.status ||
            error.message
        );
    }

    return historialNombres;
}

// ============================================================
// ESTADÍSTICAS DE SEMANA / MES / ÚLTIMA CONEXIÓN
// ============================================================

function calcularEstadisticasSesiones(
    sesiones
) {
    let segundosSemana = 0;
    let segundosMes = 0;
    let ultimaConexion = null;

    const ahora = new Date();

    const inicioSemana =
        new Date(ahora);

    inicioSemana.setDate(
        inicioSemana.getDate() -
        inicioSemana.getDay()
    );

    inicioSemana.setHours(
        0,
        0,
        0,
        0
    );

    const inicioMes =
        new Date(
            ahora.getFullYear(),
            ahora.getMonth(),
            1,
            0,
            0,
            0,
            0
        );

    for (
        const session
        of sesiones
    ) {
        const a =
            session.attributes || {};

        if (!a.start) continue;

        const inicio =
            new Date(a.start);

        let fin;

        if (a.stop) {
            fin =
                new Date(a.stop);
        } else if (
            esSesionActiva(session)
        ) {
            fin = ahora;
        } else {
            continue;
        }

        if (
            !Number.isFinite(
                inicio.getTime()
            ) ||
            !Number.isFinite(
                fin.getTime()
            ) ||
            fin <= inicio
        ) {
            continue;
        }

        // Semana
        if (fin >= inicioSemana) {
            const inicioReal =
                inicio > inicioSemana
                    ? inicio
                    : inicioSemana;

            segundosSemana +=
                Math.max(
                    0,
                    Math.floor(
                        (
                            fin.getTime() -
                            inicioReal.getTime()
                        ) / 1000
                    )
                );
        }

        // Mes
        if (fin >= inicioMes) {
            const inicioReal =
                inicio > inicioMes
                    ? inicio
                    : inicioMes;

            segundosMes +=
                Math.max(
                    0,
                    Math.floor(
                        (
                            fin.getTime() -
                            inicioReal.getTime()
                        ) / 1000
                    )
                );
        }

        if (
            !ultimaConexion ||
            inicio > ultimaConexion
        ) {
            ultimaConexion =
                inicio;
        }
    }

    return {
        segundosSemana,
        segundosMes,
        ultimaConexion
    };
}

// ============================================================
// ESTADO DEL JUGADOR Y ESTADÍSTICAS
// ============================================================

async function getBattleMetricsPlayerStatus(
    playerId,
    configuredServerId = null
) {
    const inicioTotal =
        Date.now();

    try {
        console.log(
            "=========================================="
        );

        console.log(
            `🔎 BM | Analizando jugador ${playerId}`
        );

        console.log(
            `🎯 BM | Servidor configurado: ${configuredServerId || "NINGUNO"}`
        );

        console.log(
            "⚡ BM | Modo optimizado activado"
        );

        console.log(
            "=========================================="
        );

        // Cache solo para esta ejecución.
        const cacheHoras =
            new Map();

        // ====================================================
        // OPTIMIZACIÓN #3
        // ESTAS CONSULTAS NO DEPENDEN ENTRE SÍ
        // ====================================================

        const [
            playerResponse,
            resultadoSesiones,
            historialNombres
        ] = await Promise.all([
            axiosBM.get(
                `/players/${playerId}`,
                {
                    params: {
                        include: "server"
                    }
                }
            ),

            obtenerTodasLasSesiones(
                playerId
            ),

            obtenerHistorialNombres(
                playerId
            )
        ]);

        const player =
            playerResponse.data?.data;

        if (!player) {
            throw new Error(
                "BattleMetrics no devolvió el jugador."
            );
        }

        const nombre =
            player.attributes?.name ||
            "Desconocido";

        const sesiones =
            resultadoSesiones.sesiones;

        const sesionesCompletas =
            resultadoSesiones.completa;

        // ====================================================
        // SERVIDORES INCLUIDOS CON EL PLAYER
        // ====================================================

        const servidoresMap =
            new Map();

        for (
            const recurso
            of playerResponse.data?.included ||
            []
        ) {
            if (
                recurso?.type !== "server" ||
                !recurso.id
            ) {
                continue;
            }

            const id =
                String(recurso.id);

            const attributes =
                recurso.attributes || {};

            const gameId =
                recurso
                    .relationships
                    ?.game
                    ?.data
                    ?.id || "";

            const game =
                String(
                    attributes.game ||
                    gameId
                );

            const nombreServidor =
                attributes.name ||
                `Servidor ${id}`;

            const servidor = {
                id,

                nombre:
                    nombreServidor,

                game,

                esRust:
                    `${game} ${gameId} ${nombreServidor}`
                        .toLowerCase()
                        .includes("rust"),

                ip:
                    attributes.ip ||
                    null,

                port:
                    attributes.port ||
                    null
            };

            servidoresMap.set(
                id,
                servidor
            );

            guardarServidorCacheGlobal(
                id,
                servidor
            );
        }

        // ====================================================
        // SESIÓN ACTIVA
        // ====================================================

        let sesionActiva = null;
        let sesionActivaRust = null;
        let servidorActualRust = null;

        const sesionesActivas =
            sesiones.filter(
                esSesionActiva
            );

        if (
            sesionesActivas.length > 0
        ) {
            sesionActiva =
                sesionesActivas[0];
        }

        /*
         * Primero comprobamos los servidores que
         * ya conocemos sin hacer peticiones.
         */
        for (
            const session
            of sesionesActivas
        ) {
            const serverId =
                obtenerServerIdDeSesion(
                    session
                );

            if (!serverId) {
                continue;
            }

            const servidor =
                servidoresMap.get(
                    String(serverId)
                );

            if (servidor?.esRust) {
                sesionActivaRust =
                    session;

                servidorActualRust =
                    servidor;

                break;
            }
        }

        /*
         * Si la sesión activa pertenece a un servidor
         * que no venía incluido, consultamos únicamente
         * esos servidores.
         */
        if (
            !sesionActivaRust &&
            sesionesActivas.length > 0
        ) {
            const pendientes =
                sesionesActivas
                    .map(session => ({
                        session,

                        id:
                            obtenerServerIdDeSesion(
                                session
                            )
                    }))
                    .filter(
                        item =>
                            item.id &&
                            !servidoresMap.has(
                                String(
                                    item.id
                                )
                            )
                    );

            const info =
                await mapConLimite(
                    pendientes,
                    CONCURRENCIA_SERVIDORES,

                    async item => ({
                        session:
                            item.session,

                        servidor:
                            await obtenerInfoServidor(
                                item.id,
                                servidoresMap
                            )
                    })
                );

            const encontrado =
                info.find(
                    item =>
                        item?.servidor
                            ?.esRust
                );

            if (encontrado) {
                sesionActivaRust =
                    encontrado.session;

                servidorActualRust =
                    encontrado.servidor;
            }
        }

        const online =
            Boolean(sesionActiva);

        const jugando =
            Boolean(sesionActivaRust);

        const duracionSesionSegundos =
            obtenerDuracionSesion(
                sesionActivaRust
            );

        // ====================================================
        // SERVIDOR CONFIGURADO
        // ====================================================

        const sesionActivaServidorConfigurado =
            configuredServerId &&
            sesionActivaRust &&
            String(
                obtenerServerIdDeSesion(
                    sesionActivaRust
                )
            ) ===
                String(
                    configuredServerId
                )
                ? sesionActivaRust
                : null;

        const duracionSesionConfiguradoSegundos =
            obtenerDuracionSesion(
                sesionActivaServidorConfigurado
            );

        const jugandoServidorConfigurado =
            Boolean(
                configuredServerId &&
                servidorActualRust &&
                String(
                    servidorActualRust.id
                ) ===
                    String(
                        configuredServerId
                    )
            );

        // ====================================================
        // SEMANA / MES / ÚLTIMA CONEXIÓN
        // ====================================================

        const estadisticasSesiones =
            calcularEstadisticasSesiones(
                sesiones
            );

        // ====================================================
        // TOP SERVIDORES
        // ====================================================

        const resultadoServidores =
            await obtenerTopServidoresRust(
                playerId,
                sesiones,
                servidoresMap,
                cacheHoras
            );

        const totalSegundosServidores =
            resultadoServidores
                .totalSegundos;

        /*
         * IMPORTANTE:
         *
         * Ya NO usamos time-played-statistics.
         * El total es directamente la suma de
         * servidores Rust, como decidimos.
         */
        const totalSegundos =
            totalSegundosServidores;

        const totalHoras =
            segundosAHorasRedondeado(
                totalSegundos
            );

        // ====================================================
        // HORAS DEL SERVIDOR CONFIGURADO
        // ====================================================

        let horasServidorConfigurado =
            null;

        if (configuredServerId) {
            /*
             * Primero buscamos el resultado que ya
             * calculó obtenerTopServidoresRust().
             *
             * Esto evita otra llamada HTTP.
             */
            const encontrado =
                resultadoServidores
                    .resultados
                    .find(
                        servidor =>
                            String(
                                servidor.id
                            ) ===
                            String(
                                configuredServerId
                            )
                    );

            if (encontrado) {
                horasServidorConfigurado = {
                    id:
                        String(
                            configuredServerId
                        ),

                    tiempo:
                        encontrado.tiempo,

                    segundos:
                        Number(
                            encontrado.segundos
                        ) || 0
                };

            } else if (
                jugandoServidorConfigurado
            ) {
                /*
                 * Caso raro donde el servidor actual
                 * no entró en el top.
                 */
                const horasDirectas =
                    await obtenerHorasJugadorServidor(
                        playerId,
                        configuredServerId,
                        cacheHoras
                    );

                if (horasDirectas) {
                    horasServidorConfigurado = {
                        id:
                            String(
                                configuredServerId
                            ),

                        tiempo:
                            horasDirectas
                                .tiempo,

                        segundos:
                            Number(
                                horasDirectas
                                    .segundos
                            ) || 0
                    };
                }
            }
        }

        console.log(
            "=========================================="
        );

        console.log(
            "📊 BM | Resultado final"
        );

        console.log(
            `🧮 Total Rust: ${totalHoras}`
        );

        console.log(
            `📌 Fuente del total: suma-servidores`
        );

        console.log(
            `📆 Semana: ${segundosAHoras(estadisticasSesiones.segundosSemana)}`
        );

        console.log(
            `🗓️ Mes: ${segundosAHoras(estadisticasSesiones.segundosMes)}`
        );

        console.log(
            `⚡ Tiempo total consulta: ${Date.now() - inicioTotal} ms`
        );

        console.log(
            "=========================================="
        );

        return {
            id:
                String(playerId),

            nombre,
            name: nombre,

            online,
            jugando,

            // Duración sesión actual
            duracionSesionSegundos,

            duracionSesionConfiguradoSegundos,

            // Total
            horasTotalesBM:
                totalSegundos,

            totalHoras,

            totalSegundos,

            totalSegundosServidores,

            /*
             * Se conserva esta propiedad para que
             * horas.js no tenga que cambiar.
             *
             * false = ya no estamos usando
             * time-played-statistics.
             */
            totalOficialDisponible:
                false,

            fuenteTotal:
                "suma-servidores",

            sesionesCompletas,

            horasSemana:
                segundosAHoras(
                    estadisticasSesiones
                        .segundosSemana
                ),

            horasMes:
                segundosAHoras(
                    estadisticasSesiones
                        .segundosMes
                ),

            ultimaConexion:
                estadisticasSesiones
                    .ultimaConexion
                    ? obtenerFechaChile(
                        estadisticasSesiones
                            .ultimaConexion
                    )
                    : null,

            servidor:
                servidorActualRust
                    ?.nombre ||
                null,

            server:
                servidorActualRust
                    ?.nombre ||
                null,

            servidorActualRust:
                servidorActualRust
                    ? {
                        id:
                            String(
                                servidorActualRust
                                    .id
                            ),

                        nombre:
                            servidorActualRust
                                .nombre,

                        game:
                            servidorActualRust
                                .game
                    }
                    : null,

            horasServidorConfigurado,

            jugandoServidorConfigurado,

            topServidoresRust:
                resultadoServidores
                    .top10,

            servidoresEncontrados:
                resultadoServidores
                    .resultados,

            cantidadServidoresRust:
                resultadoServidores
                    .cantidadServidoresRust,

            servidoresSinHoras:
                resultadoServidores
                    .servidoresSinHoras,

            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados:
                            resultadoServidores
                                .resultados
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
    const datos =
        await getBattleMetricsPlayerStatus(
            playerId,
            configuredServerId
        );

    if (!datos) {
        return null;
    }

    return {
        totalHoras:
            datos.totalHoras,

        horasSemana:
            datos.horasSemana,

        horasMes:
            datos.horasMes,

        ultimaConexion:
            datos.ultimaConexion,

        servidor:
            datos.servidor,

        horasServidorConfigurado:
            datos.horasServidorConfigurado,

        sesionesCompletas:
            datos.sesionesCompletas,

        totalOficialDisponible:
            datos.totalOficialDisponible,

        fuenteTotal:
            datos.fuenteTotal,

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

async function getServerLeaderboard(
    serverId
) {
    try {
        const response =
            await axiosBM.get(
                `/servers/${serverId}`,
                {
                    params: {
                        include: "player"
                    }
                }
            );

        return extraerJugadoresRespuesta(
            response.data
        )
            .map(jugador => ({
                id:
                    String(
                        jugador.id
                    ),

                nombre:
                    jugador
                        .attributes
                        ?.name ||
                    "Desconocido"
            }))
            .filter(
                jugador =>
                    jugador.nombre
            );

    } catch (error) {
        console.error(
            "❌ BM | Error leaderboard:",
            esErrorDeRespuesta(error)
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