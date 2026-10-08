const axios = require("axios");

const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

const API = "https://api.battlemetrics.com";

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


// ============================================================
// CONFIGURACIÓN
// ============================================================

const MAX_PAGINAS = 100;
const CONCURRENCIA_SERVIDORES = 5;


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


// ============================================================
// FECHAS CHILE
// ============================================================

function obtenerPartesChile(fecha = new Date()) {

    const partes =
        new Intl.DateTimeFormat("en-CA", {
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

            resultado[parte.type] =
                Number(parte.value);
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

    const utcInicial =
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
        new Intl.DateTimeFormat("en-US", {
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
        partes.find(
            parte =>
                parte.type === "timeZoneName"
        )?.value || "GMT-3";

    const match =
        zona.match(
            /GMT([+-])(\d{1,2})(?::(\d{2}))?/
        );

    let offsetMinutos = -180;

    if (match) {

        const signo =
            match[1] === "-"
                ? -1
                : 1;

        const horas =
            Number(match[2]) || 0;

        const minutos =
            Number(match[3]) || 0;

        offsetMinutos =
            signo *
            (
                horas * 60 +
                minutos
            );
    }

    return new Date(
        utcInicial.getTime() -
        offsetMinutos * 60 * 1000
    );
}


function obtenerInicioSemanaChile(fecha = new Date()) {

    const partes =
        obtenerPartesChile(fecha);

    const fechaChile =
        new Date(
            Date.UTC(
                partes.year,
                partes.month - 1,
                partes.day
            )
        );

    const diaSemana =
        fechaChile.getUTCDay();

    fechaChile.setUTCDate(
        fechaChile.getUTCDate() -
        diaSemana
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

    const partes =
        obtenerPartesChile(fecha);

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

    const a =
        session.attributes;

    if (
        a.stop === null ||
        typeof a.stop === "undefined"
    ) {
        return true;
    }

    if (
        a.active === true ||
        a.online === true ||
        a.connected === true
    ) {
        return true;
    }

    return false;
}


function obtenerServerIdDeSesion(session) {

    if (!session) {
        return null;
    }

    if (
        session.relationships &&
        session.relationships.server &&
        session.relationships.server.data
    ) {

        return session.relationships.server.data.id
            ? String(
                session.relationships.server.data.id
            )
            : null;
    }

    return null;
}


// ============================================================
// CONCURRENCIA
// ============================================================

async function ejecutarConcurrencia(
    elementos,
    funcion,
    limite = 5
) {

    const resultados =
        new Array(
            elementos.length
        );

    let siguienteIndice = 0;

    async function trabajador() {

        while (true) {

            const indice =
                siguienteIndice++;

            if (
                indice >=
                elementos.length
            ) {
                return;
            }

            try {

                resultados[indice] =
                    await funcion(
                        elementos[indice],
                        indice
                    );

            } catch (error) {

                console.error(
                    "⚠️ BM | Error en tarea concurrente:",
                    error.message
                );

                resultados[indice] = null;
            }
        }
    }

    const cantidadTrabajadores =
        Math.min(
            limite,
            elementos.length
        );

    await Promise.all(
        Array.from(
            {
                length:
                    cantidadTrabajadores
            },
            () =>
                trabajador()
        )
    );

    return resultados;
}


// ============================================================
// EXTRAER JUGADORES
// ============================================================

function extraerJugadoresRespuesta(responseData) {

    const jugadores = [];

    if (!responseData) {
        return jugadores;
    }

    if (Array.isArray(responseData.data)) {

        jugadores.push(
            ...responseData.data
        );

    } else if (
        responseData.data &&
        typeof responseData.data === "object"
    ) {

        if (
            responseData.data.type === "player" ||
            responseData.data.attributes?.name
        ) {

            jugadores.push(
                responseData.data
            );
        }
    }

    if (Array.isArray(responseData.included)) {

        for (
            const recurso of
            responseData.included
        ) {

            if (
                recurso &&
                recurso.type === "player"
            ) {

                jugadores.push(
                    recurso
                );
            }
        }
    }

    const unicos =
        new Map();

    for (
        const jugador of
        jugadores
    ) {

        if (!jugador) {
            continue;
        }

        const id =
            jugador.id
                ? String(jugador.id)
                : null;

        const nombre =
            jugador.attributes &&
            jugador.attributes.name
                ? String(
                    jugador.attributes.name
                )
                : "";

        const clave =
            id ||
            nombre.toLowerCase();

        if (!clave) {
            continue;
        }

        if (!unicos.has(clave)) {

            unicos.set(
                clave,
                jugador
            );
        }
    }

    return Array.from(
        unicos.values()
    );
}


// ============================================================
// BUSCAR JUGADOR EN SERVIDOR
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

        const response =
            await axiosBM.get(
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

        const encontrados = [];

        for (
            const jugador of
            jugadores
        ) {

            const nombreBM =
                jugador.attributes &&
                jugador.attributes.name
                    ? String(
                        jugador.attributes.name
                    ).trim()
                    : "";

            if (
                nombreBM.toLowerCase() ===
                String(playerName)
                    .trim()
                    .toLowerCase()
            ) {

                encontrados.push(
                    jugador
                );
            }
        }

        console.log(
            `🔎 BM | Coincidencias encontradas: ${encontrados.length}`
        );

        if (encontrados.length === 0) {
            return null;
        }

        if (encontrados.length > 1) {

            return {
                duplicate: true,
                players: encontrados
            };
        }

        return {
            duplicate: false,

            id:
                encontrados[0].id,

            nombre:
                encontrados[0].attributes &&
                encontrados[0].attributes.name
                    ? encontrados[0].attributes.name
                    : playerName
        };

    } catch (error) {

        console.error(
            "❌ BM | Error buscando jugador:",
            error.response?.data ||
            error.message
        );

        return null;
    }
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

    const id =
        String(serverId);

    if (cache.has(id)) {
        return cache.get(id);
    }

    try {

        let response;

        try {

            response =
                await axiosBM.get(
                    `/servers/${id}`,
                    {
                        params: {
                            include: "game"
                        }
                    }
                );

        } catch {

            response =
                await axiosBM.get(
                    `/servers/${id}`
                );
        }

        const servidor =
            response.data.data;

        if (!servidor) {
            return null;
        }

        const attributes =
            servidor.attributes || {};

        const relationships =
            servidor.relationships || {};

        let gameName = "";

        if (
            relationships.game &&
            relationships.game.data
        ) {

            gameName =
                relationships.game.data.id || "";
        }

        if (
            !gameName &&
            attributes.game
        ) {

            gameName =
                attributes.game;
        }

        const nombre =
            attributes.name ||
            `Servidor ${id}`;

        const textoGame =
            String(
                gameName
            ).toLowerCase();

        const esRust =
            textoGame.includes("rust") ||
            nombre.toLowerCase().includes("rust");

        const timePlayed =
            servidor.meta &&
            typeof servidor.meta.timePlayed !== "undefined"
                ? Number(
                    servidor.meta.timePlayed
                )
                : 0;

        const resultado = {

            id,

            nombre,

            game:
                gameName,

            esRust,

            ip:
                attributes.ip || null,

            port:
                attributes.port || null,

            timePlayed
        };

        cache.set(
            id,
            resultado
        );

        return resultado;

    } catch (error) {

        console.error(
            `⚠️ BM | No se pudo obtener servidor ${id}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// ============================================================
// COMPROBAR JUGADOR ONLINE
// ============================================================

async function comprobarJugadorEnServidor(
    playerId,
    serverId
) {

    if (!playerId || !serverId) {
        return null;
    }

    try {

        console.log(
            `🔎 BM | Comprobando presencia actual: jugador ${playerId} -> servidor ${serverId}`
        );

        const response =
            await axiosBM.get(
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

        const jugadorEncontrado =
            jugadores.find(
                jugador =>
                    String(
                        jugador.id
                    ) ===
                    String(
                        playerId
                    )
            );

        if (!jugadorEncontrado) {

            console.log(
                `🔴 BM | Jugador ${playerId} NO aparece actualmente en servidor ${serverId}`
            );

            return null;
        }

        const servidor =
            await obtenerInfoServidor(
                serverId
            );

        if (!servidor) {

            return {
                id:
                    String(serverId),

                nombre:
                    `Servidor ${serverId}`,

                game:
                    "rust",

                esRust:
                    true
            };
        }

        console.log(
            `🟢 BM | Jugador ${playerId} ESTÁ ONLINE en ${servidor.nombre} (${serverId})`
        );

        return servidor;

    } catch (error) {

        console.error(
            `⚠️ BM | Error comprobando presencia actual en ${serverId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// ============================================================
// OBTENER TODAS LAS SESIONES
//
// Importante:
// BattleMetrics puede devolver links.next.
// No utilizamos page[number], porque ese parámetro ya dio
// problemas anteriormente.
// ============================================================

async function obtenerTodasLasSesiones(
    playerId
) {

    const sesiones = [];

    let url =
        `/players/${playerId}/relationships/sessions`;

    let params = {
        "page[size]": 100
    };

    const urlsVisitadas =
        new Set();

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS;
        pagina++
    ) {

        try {

            if (
                urlsVisitadas.has(url)
            ) {
                break;
            }

            urlsVisitadas.add(url);

            const response =
                params
                    ? await axiosBM.get(
                        url,
                        { params }
                    )
                    : await axiosBM.get(
                        url
                    );

            const body =
                response.data || {};

            const data =
                Array.isArray(
                    body.data
                )
                    ? body.data
                    : [];

            sesiones.push(
                ...data
            );

            console.log(
                `📊 BM | Sesiones página ${pagina}: ${data.length} | Total: ${sesiones.length}`
            );

            const next =
                body.links &&
                body.links.next
                    ? body.links.next
                    : null;

            if (!next) {
                break;
            }

            url = next;
            params = null;

        } catch (error) {

            console.log(
                `⚠️ BM | Error obteniendo sesiones página ${pagina}:`,
                error.response?.status ||
                error.response?.data ||
                error.message
            );

            break;
        }
    }

    console.log(
        `📊 BM | TOTAL sesiones obtenidas: ${sesiones.length}`
    );

    return sesiones;
}


// ============================================================
// AGREGAR SERVIDOR A MAP
// ============================================================

function agregarServidorAlMap(
    recurso,
    servidoresMap
) {

    if (
        !recurso ||
        !recurso.id
    ) {
        return null;
    }

    if (
        recurso.type &&
        recurso.type !== "server"
    ) {
        return null;
    }

    const id =
        String(
            recurso.id
        );

    const attributes =
        recurso.attributes || {};

    const nombre =
        attributes.name ||
        `Servidor ${id}`;

    const game =
        attributes.game ||
        "";

    const esRust =
        String(game)
            .toLowerCase()
            .includes("rust") ||
        nombre
            .toLowerCase()
            .includes("rust");

    const timePlayed =
        recurso.meta &&
        typeof recurso.meta.timePlayed !== "undefined"
            ? Number(
                recurso.meta.timePlayed
            )
            : 0;

    const existente =
        servidoresMap.get(id);

    /*
     * Si ya tenemos información más completa,
     * intentamos no reemplazarla con una versión peor.
     */

    if (
        existente
    ) {

        servidoresMap.set(
            id,
            {
                ...existente,

                nombre:
                    existente.nombre &&
                    !existente.nombre.startsWith("Servidor ")
                        ? existente.nombre
                        : nombre,

                game:
                    existente.game ||
                    game,

                esRust:
                    existente.esRust ||
                    esRust,

                timePlayed:
                    Math.max(
                        Number(
                            existente.timePlayed
                        ) || 0,
                        timePlayed
                    )
            }
        );

    } else {

        servidoresMap.set(
            id,
            {
                id,

                nombre,

                game,

                esRust,

                timePlayed
            }
        );
    }

    return id;
}


// ============================================================
// OBTENER TODOS LOS SERVIDORES DEL JUGADOR
//
// ESTA ES LA PARTE IMPORTANTE.
//
// Primero pedimos:
// /players/{playerId}/relationships/servers
//
// No usamos page[number].
//
// BattleMetrics puede devolver:
// - data con servidores
// - included con servidores
// - links.next
//
// Si la relación devuelve solamente IDs,
// posteriormente obtenerTopServidoresRust() obtiene
// la información real de cada servidor.
// ============================================================

async function obtenerTodosLosServidoresJugador(
    playerId,
    servidoresMap
) {

    if (!playerId) {
        return 0;
    }

    console.log(
        `\n🔎 BM | OBTENIENDO TODOS LOS SERVIDORES DEL JUGADOR ${playerId}`
    );

    const servidoresEncontrados =
        new Set();

    let url =
        `/players/${playerId}/relationships/servers`;

    let params = {
        "page[size]": 100
    };

    const urlsVisitadas =
        new Set();

    for (
        let pagina = 1;
        pagina <= MAX_PAGINAS;
        pagina++
    ) {

        try {

            if (
                urlsVisitadas.has(url)
            ) {
                break;
            }

            urlsVisitadas.add(url);

            console.log(
                `📡 BM | Consultando servidores página ${pagina}`
            );

            const response =
                params
                    ? await axiosBM.get(
                        url,
                        { params }
                    )
                    : await axiosBM.get(
                        url
                    );

            const body =
                response.data || {};

            const data =
                Array.isArray(
                    body.data
                )
                    ? body.data
                    : [];

            const included =
                Array.isArray(
                    body.included
                )
                    ? body.included
                    : [];

            let encontradosPagina = 0;

            // ------------------------------------------------
            // DATA
            // ------------------------------------------------

            for (
                const recurso of
                data
            ) {

                if (
                    !recurso ||
                    !recurso.id
                ) {
                    continue;
                }

                /*
                 * En este endpoint normalmente data ya contiene
                 * los recursos server.
                 *
                 * Si BattleMetrics entrega otro tipo de recurso,
                 * no lo agregamos como servidor.
                 */

                if (
                    recurso.type &&
                    recurso.type !== "server"
                ) {
                    continue;
                }

                const id =
                    agregarServidorAlMap(
                        recurso,
                        servidoresMap
                    );

                if (id) {

                    if (
                        !servidoresEncontrados.has(id)
                    ) {

                        servidoresEncontrados.add(
                            id
                        );

                        encontradosPagina++;
                    }
                }
            }


            // ------------------------------------------------
            // INCLUDED
            // ------------------------------------------------

            for (
                const recurso of
                included
            ) {

                if (
                    !recurso ||
                    recurso.type !== "server" ||
                    !recurso.id
                ) {
                    continue;
                }

                const id =
                    agregarServidorAlMap(
                        recurso,
                        servidoresMap
                    );

                if (id) {

                    if (
                        !servidoresEncontrados.has(id)
                    ) {

                        servidoresEncontrados.add(
                            id
                        );

                        encontradosPagina++;
                    }
                }
            }

            console.log(
                `📡 BM | Página ${pagina}: ${encontradosPagina} servidores nuevos | Total: ${servidoresEncontrados.size}`
            );


            // ------------------------------------------------
            // NEXT
            // ------------------------------------------------

            const next =
                body.links &&
                body.links.next
                    ? body.links.next
                    : null;

            if (!next) {
                break;
            }

            url = next;
            params = null;

        } catch (error) {

            console.log(
                `⚠️ BM | Error obteniendo servidores página ${pagina}:`,
                error.response?.status ||
                error.response?.data ||
                error.message
            );

            /*
             * IMPORTANTE:
             *
             * No volvemos a intentar con page[number].
             *
             * Ese parámetro ya demostró que puede provocar
             * errores en BattleMetrics.
             */

            break;
        }
    }

    console.log(
        `\n🖥️ BM | SERVIDORES TOTALES ENCONTRADOS: ${servidoresEncontrados.size}`
    );

    return servidoresEncontrados.size;
}


// ============================================================
// HORAS DIRECTAS DEL JUGADOR EN UN SERVIDOR
// ============================================================

async function obtenerHorasJugadorServidor(
    playerId,
    serverId
) {

    if (!playerId || !serverId) {
        return null;
    }

    const player =
        String(playerId);

    const server =
        String(serverId);

    // --------------------------------------------------------
    // MÉTODO 1
    // --------------------------------------------------------

    try {

        const response =
            await axiosBM.get(
                `/players/${player}/servers/${server}`
            );

        const data =
            response.data.data;

        const attributes =
            data &&
            data.attributes
                ? data.attributes
                : {};

        const meta =
            data &&
            data.meta
                ? data.meta
                : {};

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

        for (
            const valor of
            candidatos
        ) {

            if (
                valor !== null &&
                typeof valor !== "undefined" &&
                !isNaN(Number(valor))
            ) {

                segundos =
                    Number(valor);

                if (
                    segundos > 0
                ) {
                    break;
                }
            }
        }

        if (
            segundos > 0
        ) {

            return {

                id:
                    server,

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
            `⚠️ BM | /players/${player}/servers/${server}:`,
            error.response?.status ||
            error.message
        );
    }


    // --------------------------------------------------------
    // MÉTODO 2
    // --------------------------------------------------------

    try {

        const response =
            await axiosBM.get(
                `/players/${player}/time-played-history/${server}`
            );

        const data =
            response.data.data || [];

        const meta =
            response.data.meta || {};

        let segundos = 0;

        const candidatosMeta = [

            meta.timePlayed,

            meta.timeplayed,

            meta.totalTime,

            meta.totalSeconds,

            meta.seconds
        ];

        for (
            const valor of
            candidatosMeta
        ) {

            if (
                valor !== null &&
                typeof valor !== "undefined" &&
                !isNaN(Number(valor))
            ) {

                segundos =
                    Number(valor);

                if (
                    segundos > 0
                ) {
                    break;
                }
            }
        }


        if (
            segundos <= 0 &&
            Array.isArray(data)
        ) {

            for (
                const registro of
                data
            ) {

                const a =
                    registro.attributes || {};

                const valores = [

                    a.timePlayed,

                    a.timeplayed,

                    a.seconds,

                    a.duration,

                    a.totalTime,

                    a.totalSeconds,

                    registro.meta &&
                    registro.meta.timePlayed,

                    registro.meta &&
                    registro.meta.seconds
                ];

                let encontrado = 0;

                for (
                    const valor of
                    valores
                ) {

                    if (
                        valor !== null &&
                        typeof valor !== "undefined" &&
                        !isNaN(Number(valor))
                    ) {

                        encontrado =
                            Number(valor);

                        if (
                            encontrado > 0
                        ) {
                            break;
                        }
                    }
                }

                segundos +=
                    encontrado;
            }
        }

        if (
            segundos > 0
        ) {

            return {

                id:
                    server,

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
            `⚠️ BM | time-played-history ${server}:`,
            error.response?.status ||
            error.message
        );
    }

    return null;
}


// ============================================================
// CREAR MAPA DE HORAS DESDE SESIONES
//
// Esto evita recorrer las sesiones completas para cada servidor.
// ============================================================

function crearMapaHorasSesiones(
    todasLasSesiones
) {

    const mapa =
        new Map();

    for (
        const session of
        todasLasSesiones
    ) {

        const serverId =
            obtenerServerIdDeSesion(
                session
            );

        if (!serverId) {
            continue;
        }

        const a =
            session.attributes || {};

        if (!a.start) {
            continue;
        }

        const inicio =
            new Date(
                a.start
            ).getTime();

        let fin;

        if (a.stop) {

            fin =
                new Date(
                    a.stop
                ).getTime();

        } else if (
            esSesionActiva(
                session
            )
        ) {

            fin =
                Date.now();

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
                (
                    fin -
                    inicio
                ) / 1000
            );

        if (
            segundos <= 0
        ) {
            continue;
        }

        const id =
            String(serverId);

        mapa.set(
            id,
            (
                mapa.get(id) || 0
            ) + segundos
        );
    }

    return mapa;
}


// ============================================================
// TOP 10 SERVIDORES RUST
//
// PASO 1:
// Tenemos TODOS los servidores.
//
// PASO 2:
// Para los que no tengan información completa,
// consultamos /servers/{id}.
//
// PASO 3:
// Filtramos Rust.
//
// PASO 4:
// Consultamos las horas del jugador en TODOS los Rust.
//
// PASO 5:
// Ordenamos.
//
// PASO 6:
// Top 10.
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    todasLasSesiones,
    servidoresMap
) {

    const servidores =
        new Map();

    // --------------------------------------------------------
    // SERVIDORES DESCUBIERTOS
    // --------------------------------------------------------

    for (
        const servidor of
        servidoresMap.values()
    ) {

        if (
            servidor &&
            servidor.id
        ) {

            servidores.set(
                String(
                    servidor.id
                ),
                {
                    ...servidor
                }
            );
        }
    }


    // --------------------------------------------------------
    // SERVIDORES DE SESIONES COMO RESPALDO
    // --------------------------------------------------------

    for (
        const session of
        todasLasSesiones
    ) {

        const serverId =
            obtenerServerIdDeSesion(
                session
            );

        if (!serverId) {
            continue;
        }

        const id =
            String(serverId);

        if (
            servidores.has(id)
        ) {
            continue;
        }

        const servidor =
            await obtenerInfoServidor(
                id,
                servidoresMap
            );

        if (servidor) {

            servidores.set(
                id,
                servidor
            );
        }
    }


    console.log(
        `\n🔎 BM | SERVIDORES TOTALES CANDIDATOS: ${servidores.size}`
    );


    // --------------------------------------------------------
    // ASEGURAR INFORMACIÓN DE LOS SERVIDORES
    // --------------------------------------------------------

    const candidatos =
        Array.from(
            servidores.values()
        );

    const servidoresConInfo =
        await ejecutarConcurrencia(
            candidatos,
            async servidor => {

                /*
                 * Si ya tenemos nombre/game suficientes,
                 * no hacemos otra consulta.
                 */

                if (
                    servidor.nombre &&
                    typeof servidor.esRust !== "undefined"
                ) {

                    return servidor;
                }

                return await obtenerInfoServidor(
                    servidor.id,
                    servidoresMap
                );
            },
            CONCURRENCIA_SERVIDORES
        );


    // --------------------------------------------------------
    // FILTRAR RUST
    // --------------------------------------------------------

    const servidoresRust = [];

    for (
        const servidor of
        servidoresConInfo
    ) {

        if (!servidor) {
            continue;
        }

        const game =
            String(
                servidor.game || ""
            ).toLowerCase();

        const nombre =
            String(
                servidor.nombre || ""
            ).toLowerCase();

        const esRust =
            servidor.esRust === true ||
            game.includes("rust") ||
            nombre.includes("rust");

        if (!esRust) {
            continue;
        }

        servidoresRust.push(
            servidor
        );
    }

    console.log(
        `🎮 BM | SERVIDORES RUST ENCONTRADOS: ${servidoresRust.length}`
    );


    // --------------------------------------------------------
    // MAPA DE SESIONES PARA FALLBACK
    // --------------------------------------------------------

    const mapaHorasSesiones =
        crearMapaHorasSesiones(
            todasLasSesiones
        );


    // --------------------------------------------------------
    // CONSULTAR HORAS DE TODOS LOS SERVIDORES RUST
    // --------------------------------------------------------

    console.log(
        `\n🏆 BM | CONSULTANDO HORAS EN ${servidoresRust.length} SERVIDORES RUST...`
    );

    const resultados =
        await ejecutarConcurrencia(
            servidoresRust,
            async (servidor, indice) => {

                const serverId =
                    String(
                        servidor.id
                    );

                console.log(
                    `📊 BM | [${indice + 1}/${servidoresRust.length}] ${servidor.nombre} (${serverId})`
                );

                // --------------------------------------------
                // HORAS DIRECTAS
                // --------------------------------------------

                const horasJugador =
                    await obtenerHorasJugadorServidor(
                        playerId,
                        serverId
                    );

                let segundos = 0;

                if (
                    horasJugador
                ) {

                    segundos =
                        Number(
                            horasJugador.segundos
                        ) || 0;
                }


                // --------------------------------------------
                // FALLBACK SESIONES
                // --------------------------------------------

                if (
                    segundos <= 0
                ) {

                    segundos =
                        Number(
                            mapaHorasSesiones.get(
                                serverId
                            )
                        ) || 0;

                    if (
                        segundos > 0
                    ) {

                        console.log(
                            `↩️ BM | ${servidor.nombre}: usando sesiones -> ${segundosAHoras(segundos)}`
                        );
                    }
                }


                if (
                    segundos <= 0
                ) {

                    console.log(
                        `⚪ BM | ${servidor.nombre}: 0h`
                    );

                    return null;
                }


                console.log(
                    `✅ BM | ${servidor.nombre}: ${segundosAHoras(segundos)}`
                );

                return {

                    id:
                        serverId,

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

            },
            CONCURRENCIA_SERVIDORES
        );


    // --------------------------------------------------------
    // ELIMINAR NULOS
    // --------------------------------------------------------

    const resultadosValidos =
        resultados.filter(
            Boolean
        );


    // --------------------------------------------------------
    // ORDENAR TODOS LOS SERVIDORES
    // --------------------------------------------------------

    resultadosValidos.sort(
        (a, b) =>
            Number(
                b.segundos || 0
            ) -
            Number(
                a.segundos || 0
            )
    );


    // --------------------------------------------------------
    // TOTAL DE HORAS
    // --------------------------------------------------------

    const totalSegundos =
        resultadosValidos.reduce(
            (
                total,
                servidor
            ) =>
                total +
                (
                    Number(
                        servidor.segundos
                    ) || 0
                ),
            0
        );


    // --------------------------------------------------------
    // CANTIDAD TOTAL DE SERVIDORES RUST
    //
    // IMPORTANTE:
    // Ahora NO depende de resultadosValidos.
    //
    // Si BattleMetrics conoce 89 servidores Rust,
    // devuelve 89 aunque alguno tenga 0 horas recuperables.
    // --------------------------------------------------------

    const cantidadServidores =
        servidoresRust.length;


    // --------------------------------------------------------
    // TOP 10
    // --------------------------------------------------------

    const top10 =
        resultadosValidos.slice(
            0,
            10
        );


    // --------------------------------------------------------
    // LOG FINAL
    // --------------------------------------------------------

    console.log(
        `\n🏆 BM | ================= TOP 10 FINAL =================`
    );

    top10.forEach(
        (servidor, indice) => {

            console.log(
                `${indice + 1}. ${servidor.nombre} (${servidor.id}) -> ${servidor.tiempo}`
            );
        }
    );

    console.log(
        `🏆 BM | ==================================================`
    );

    console.log(
        `🖥️ BM | Todos los servidores Rust encontrados: ${cantidadServidores}`
    );

    console.log(
        `📊 BM | Servidores Rust con horas recuperables: ${resultadosValidos.length}`
    );

    console.log(
        `🧮 BM | Total horas de servidores procesados: ${segundosAHoras(totalSegundos)}`
    );


    return {

        top10,

        totalSegundos,

        cantidadServidores
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

        console.log(
            `\n==========================================`
        );

        console.log(
            `🔎 BM | Analizando jugador ${playerId}`
        );

        console.log(
            `🎯 BM | Servidor configurado: ${
                configuredServerId ||
                "NINGUNO"
            }`
        );

        console.log(
            `==========================================`
        );


        // -----------------------------------------------------
        // PLAYER
        // -----------------------------------------------------

        const playerResponse =
            await axiosBM.get(
                `/players/${playerId}`,
                {
                    params: {
                        include: "server"
                    }
                }
            );

        const player =
            playerResponse.data.data;

        if (!player) {

            throw new Error(
                "Jugador no encontrado"
            );
        }

        const nombre =
            player.attributes &&
            player.attributes.name
                ? player.attributes.name
                : "Desconocido";


        // -----------------------------------------------------
        // SERVIDORES INCLUIDOS
        // -----------------------------------------------------

        const servidoresMap =
            new Map();

        const included =
            Array.isArray(
                playerResponse.data.included
            )
                ? playerResponse.data.included
                : [];

        for (
            const recurso of
            included
        ) {

            if (
                recurso.type !== "server" ||
                !recurso.id
            ) {
                continue;
            }

            agregarServidorAlMap(
                recurso,
                servidoresMap
            );
        }


        // =====================================================
        // OBTENER TODOS LOS SERVIDORES
        // =====================================================

        await obtenerTodosLosServidoresJugador(
            playerId,
            servidoresMap
        );


        // =====================================================
        // COMPROBAR ONLINE DIRECTAMENTE
        // =====================================================

        let servidorActualRust = null;

        let onlinePorServidor =
            false;

        if (
            configuredServerId
        ) {

            const servidorOnline =
                await comprobarJugadorEnServidor(
                    playerId,
                    configuredServerId
                );

            if (servidorOnline) {

                servidorActualRust =
                    servidorOnline;

                onlinePorServidor =
                    true;

                servidoresMap.set(
                    String(
                        configuredServerId
                    ),
                    servidorOnline
                );
            }
        }


        // -----------------------------------------------------
        // SESIONES
        // -----------------------------------------------------

        const todasLasSesiones =
            await obtenerTodasLasSesiones(
                playerId
            );

        console.log(
            `📊 BM | Sesiones totales: ${todasLasSesiones.length}`
        );


        // -----------------------------------------------------
        // SESIÓN ACTIVA COMO RESPALDO
        // -----------------------------------------------------

        let sesionActiva = null;

        let sesionActivaRust = null;

        for (
            const session of
            todasLasSesiones
        ) {

            if (
                !esSesionActiva(
                    session
                )
            ) {
                continue;
            }

            sesionActiva =
                session;

            const serverId =
                obtenerServerIdDeSesion(
                    session
                );

            if (!serverId) {
                continue;
            }

            let servidor =
                servidoresMap.get(
                    String(serverId)
                );

            if (!servidor) {

                servidor =
                    await obtenerInfoServidor(
                        serverId,
                        servidoresMap
                    );
            }

            if (
                servidor &&
                servidor.esRust
            ) {

                sesionActivaRust =
                    session;

                if (
                    !servidorActualRust
                ) {

                    servidorActualRust =
                        servidor;
                }

                break;
            }
        }


        // =====================================================
        // ESTADO
        // =====================================================

        const online =
            onlinePorServidor ||
            !!sesionActiva;

        const jugando =
            servidorActualRust
                ? servidorActualRust.nombre
                : null;


        // =====================================================
        // HORAS DE SESIONES
        // =====================================================

        let segundosTotalesSesiones = 0;

        let segundosSemana = 0;

        let segundosMes = 0;

        let ultimaConexion = null;

        const ahoraDate =
            new Date();

        const inicioSemana =
            obtenerInicioSemanaChile(
                ahoraDate
            );

        const inicioMes =
            obtenerInicioMesChile(
                ahoraDate
            );


        // -----------------------------------------------------
        // RECORRER SESIONES
        // -----------------------------------------------------

        for (
            const session of
            todasLasSesiones
        ) {

            const a =
                session.attributes || {};

            if (!a.start) {
                continue;
            }

            const inicio =
                new Date(
                    a.start
                );

            let fin;

            if (a.stop) {

                fin =
                    new Date(
                        a.stop
                    );

            } else if (
                esSesionActiva(
                    session
                )
            ) {

                fin =
                    ahoraDate;

            } else {

                continue;
            }

            if (
                !Number.isFinite(
                    inicio.getTime()
                ) ||
                !Number.isFinite(
                    fin.getTime()
                )
            ) {
                continue;
            }

            if (
                fin.getTime() <=
                inicio.getTime()
            ) {
                continue;
            }

            const segundos =
                Math.floor(
                    (
                        fin.getTime() -
                        inicio.getTime()
                    ) / 1000
                );

            segundosTotalesSesiones +=
                segundos;


            // -------------------------------------------------
            // SEMANA
            // -------------------------------------------------

            if (
                fin.getTime() >
                inicioSemana.getTime()
            ) {

                const inicioReal =
                    inicio.getTime() >
                    inicioSemana.getTime()
                        ? inicio
                        : inicioSemana;

                const finReal =
                    fin.getTime() <
                    ahoraDate.getTime()
                        ? fin
                        : ahoraDate;

                if (
                    finReal.getTime() >
                    inicioReal.getTime()
                ) {

                    segundosSemana +=
                        Math.floor(
                            (
                                finReal.getTime() -
                                inicioReal.getTime()
                            ) / 1000
                        );
                }
            }


            // -------------------------------------------------
            // MES
            // -------------------------------------------------

            if (
                fin.getTime() >
                inicioMes.getTime()
            ) {

                const inicioReal =
                    inicio.getTime() >
                    inicioMes.getTime()
                        ? inicio
                        : inicioMes;

                const finReal =
                    fin.getTime() <
                    ahoraDate.getTime()
                        ? fin
                        : ahoraDate;

                if (
                    finReal.getTime() >
                    inicioReal.getTime()
                ) {

                    segundosMes +=
                        Math.floor(
                            (
                                finReal.getTime() -
                                inicioReal.getTime()
                            ) / 1000
                        );
                }
            }


            // -------------------------------------------------
            // ÚLTIMA CONEXIÓN
            // -------------------------------------------------

            if (
                !ultimaConexion ||
                inicio > ultimaConexion
            ) {

                ultimaConexion =
                    inicio;
            }
        }


        // =====================================================
        // ONLINE SIN SESIONES
        // =====================================================

        if (
            onlinePorServidor &&
            !ultimaConexion
        ) {

            ultimaConexion =
                ahoraDate;
        }


        // =====================================================
        // HORAS SERVIDOR CONFIGURADO
        // =====================================================

        let horasServidorConfigurado =
            null;

        let jugandoServidorConfigurado =
            false;

        if (
            configuredServerId &&
            servidorActualRust &&
            String(
                servidorActualRust.id
            ) ===
            String(
                configuredServerId
            )
        ) {

            jugandoServidorConfigurado =
                true;

            const horasDirectas =
                await obtenerHorasJugadorServidor(
                    playerId,
                    configuredServerId
                );

            if (
                horasDirectas
            ) {

                horasServidorConfigurado = {

                    id:
                        String(
                            configuredServerId
                        ),

                    tiempo:
                        horasDirectas.tiempo,

                    segundos:
                        Number(
                            horasDirectas.segundos
                        ) || 0
                };
            }
        }


        // =====================================================
        // TOP 10 RUST
        // =====================================================

        const resultadoServidores =
            await obtenerTopServidoresRust(
                playerId,
                todasLasSesiones,
                servidoresMap
            );


        const topServidoresRust =
            resultadoServidores.top10;


        const cantidadServidoresRust =
            resultadoServidores.cantidadServidores;


        // =====================================================
        // TOTAL BM
        // =====================================================

        let horasTotalesBM =
            Number(
                resultadoServidores.totalSegundos
            ) || 0;

        if (
            horasTotalesBM <= 0
        ) {

            horasTotalesBM =
                segundosTotalesSesiones;
        }


        // =====================================================
        // HISTORIAL DE NOMBRES
        // =====================================================

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

            const identifiers =
                Array.isArray(
                    identifiersResponse.data.data
                )
                    ? identifiersResponse.data.data
                    : [];

            historialNombres =
                identifiers
                    .map(
                        item => {

                            if (
                                item.attributes &&
                                item.attributes.identifier
                            ) {

                                return item.attributes.identifier;
                            }

                            if (
                                item.attributes &&
                                item.attributes.name
                            ) {

                                return item.attributes.name;
                            }

                            return null;
                        }
                    )
                    .filter(Boolean)
                    .filter(
                        (
                            value,
                            index,
                            array
                        ) =>
                            array.indexOf(value) ===
                            index
                    )
                    .slice(
                        0,
                        3
                    );

        } catch {

            console.log(
                "⚠️ BM | Historial de nombres no disponible"
            );
        }


        // =====================================================
        // SERVIDOR PARA MOSTRAR
        // =====================================================

        let servidorRespuesta = null;

        if (
            servidorActualRust
        ) {

            servidorRespuesta =
                servidorActualRust;
        }


        // =====================================================
        // RESULTADO
        // =====================================================

        return {

            id:
                playerId,

            nombre,

            name:
                nombre,

            online,

            jugando,

            horasTotalesBM,

            totalHoras:
                segundosAHoras(
                    horasTotalesBM
                ),

            cantidadServidoresRust,

            horasSemana:
                segundosAHoras(
                    segundosSemana
                ),

            horasMes:
                segundosAHoras(
                    segundosMes
                ),

            ultimaConexion:
                ultimaConexion
                    ? obtenerFechaChile(
                        ultimaConexion
                    )
                    : null,

            servidor:
                servidorRespuesta
                    ? servidorRespuesta.nombre
                    : null,

            server:
                servidorRespuesta
                    ? servidorRespuesta.nombre
                    : null,

            servidorActualRust:
                servidorActualRust
                    ? {

                        id:
                            String(
                                servidorActualRust.id
                            ),

                        nombre:
                            servidorActualRust.nombre,

                        game:
                            servidorActualRust.game
                    }
                    : null,

            horasServidorConfigurado,

            jugandoServidorConfigurado,

            topServidoresRust,

            top10:
                topServidoresRust,

            servidoresEncontrados:
                topServidoresRust,

            servidores: {

                rust: {

                    datos: {

                        servidoresEncontrados:
                            topServidoresRust,

                        top10:
                            topServidoresRust
                    }
                }
            },

            historialNombres
        };

    } catch (error) {

        console.error(
            "❌ BM | Error general:",
            error.response?.data ||
            error.message
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

        id:
            datos.id,

        nombre:
            datos.nombre,

        name:
            datos.name,

        online:
            datos.online,

        jugando:
            datos.jugando,

        totalHoras:
            datos.totalHoras,

        horasTotalesBM:
            datos.horasTotalesBM,

        horasSemana:
            datos.horasSemana,

        horasMes:
            datos.horasMes,

        ultimaConexion:
            datos.ultimaConexion,

        servidor:
            datos.servidor,

        server:
            datos.server,

        servidorActualRust:
            datos.servidorActualRust,

        horasServidorConfigurado:
            datos.horasServidorConfigurado,

        jugandoServidorConfigurado:
            datos.jugandoServidorConfigurado,

        cantidadServidoresRust:
            datos.cantidadServidoresRust,

        servidoresEncontrados:
            datos.servidoresEncontrados,

        topServidoresRust:
            datos.topServidoresRust,

        top10:
            datos.topServidoresRust,

        historialNombres:
            datos.historialNombres
    };
}


// ============================================================
// LEADERBOARD
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

        const jugadores =
            extraerJugadoresRespuesta(
                response.data
            );

        return jugadores
            .map(
                jugador => ({

                    id:
                        jugador.id,

                    nombre:
                        jugador.attributes &&
                        jugador.attributes.name
                            ? jugador.attributes.name
                            : "Desconocido"
                })
            )
            .filter(
                jugador =>
                    jugador.nombre
            );

    } catch (error) {

        console.error(
            "❌ BM | Error leaderboard:",
            error.response?.data ||
            error.message
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