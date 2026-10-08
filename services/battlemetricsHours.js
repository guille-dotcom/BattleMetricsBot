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
// OBTENER PARTES DE FECHA EN CHILE
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


// ============================================================
// CONVERTIR FECHA/HORA DE CHILE A UTC
// ============================================================

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


// ============================================================
// INICIO DE SEMANA EN CHILE
// ============================================================

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


// ============================================================
// INICIO DE MES EN CHILE
// ============================================================

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
// COMPROBAR SI EL JUGADOR ESTÁ ONLINE EN SERVIDOR
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
// OBTENER SESIONES DEL JUGADOR
// ============================================================

async function obtenerTodasLasSesiones(
    playerId
) {

    const sesiones = [];

    try {

        const response =
            await axiosBM.get(
                `/players/${playerId}/relationships/sessions`,
                {
                    params: {
                        "page[size]": 100
                    }
                }
            );

        const data =
            Array.isArray(
                response.data.data
            )
                ? response.data.data
                : [];

        sesiones.push(
            ...data
        );

        console.log(
            `📊 BM | Sesiones obtenidas: ${sesiones.length}`
        );

    } catch (error) {

        console.log(
            "⚠️ BM | Endpoint de sesiones no disponible:",
            error.response?.data ||
            error.message
        );
    }

    return sesiones;
}


// ============================================================
// OBTENER TODOS LOS SERVIDORES RELACIONADOS CON EL JUGADOR
//
// IMPORTANTE:
// Esta función es la base del Top 10.
//
// No dependemos solamente de las sesiones.
// Intentamos obtener TODOS los servidores relacionados
// históricamente con el jugador.
//
// Se soportan varias formas de respuesta de BattleMetrics:
// - data = servers
// - included = servers
// - relationships.server
// - links.next para paginación
// ============================================================

async function obtenerTodosLosServidoresJugador(
    playerId,
    servidoresMap
) {

    if (!playerId) {
        return;
    }

    console.log(
        `🔎 BM | Obteniendo TODOS los servidores del jugador ${playerId}`
    );

    const servidoresEncontrados =
        new Set();

    let pagina = 1;

    let siguienteUrl = null;

    const MAX_PAGINAS = 100;

    while (
        pagina <= MAX_PAGINAS
    ) {

        try {

            let response;

            if (siguienteUrl) {

                response =
                    await axiosBM.get(
                        siguienteUrl
                    );

            } else {

                response =
                    await axiosBM.get(
                        `/players/${playerId}/relationships/servers`,
                        {
                            params: {
                                "page[size]": 100,
                                "page[number]": pagina
                            }
                        }
                    );
            }

            const body =
                response.data || {};

            const data =
                Array.isArray(body.data)
                    ? body.data
                    : [];

            const included =
                Array.isArray(body.included)
                    ? body.included
                    : [];

            let servidoresPagina = 0;

            // --------------------------------------------------------
            // DATA
            // --------------------------------------------------------

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

                if (
                    recurso.type &&
                    recurso.type !== "server"
                ) {
                    continue;
                }

                const id =
                    String(
                        recurso.id
                    );

                servidoresEncontrados.add(id);

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

                servidoresPagina++;
            }

            // --------------------------------------------------------
            // INCLUDED
            // --------------------------------------------------------

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
                    String(
                        recurso.id
                    );

                servidoresEncontrados.add(id);

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

                servidoresPagina++;
            }

            console.log(
                `📡 BM | Página ${pagina}: ${servidoresPagina} servidores`
            );

            // --------------------------------------------------------
            // PAGINACIÓN POR LINKS
            // --------------------------------------------------------

            siguienteUrl =
                body.links &&
                body.links.next
                    ? body.links.next
                    : null;

            if (siguienteUrl) {

                pagina++;

                continue;
            }

            // --------------------------------------------------------
            // SI NO HAY LINK NEXT, INTENTAR SIGUIENTE PÁGINA
            // --------------------------------------------------------

            if (
                data.length >= 100 &&
                !siguienteUrl
            ) {

                pagina++;

                continue;
            }

            break;

        } catch (error) {

            /*
             * Algunas versiones de BattleMetrics rechazan
             * page[number].
             *
             * Si ocurre, intentamos una última consulta
             * sin page[number].
             */

            console.log(
                `⚠️ BM | Error obteniendo servidores página ${pagina}:`,
                error.response?.status ||
                error.response?.data ||
                error.message
            );

            if (
                pagina === 1
            ) {

                try {

                    console.log(
                        "🔄 BM | Reintentando servidores sin page[number]"
                    );

                    const response =
                        await axiosBM.get(
                            `/players/${playerId}/relationships/servers`,
                            {
                                params: {
                                    "page[size]": 100
                                }
                            }
                        );

                    const body =
                        response.data || {};

                    const data =
                        Array.isArray(body.data)
                            ? body.data
                            : [];

                    const included =
                        Array.isArray(body.included)
                            ? body.included
                            : [];

                    for (
                        const recurso of
                        [
                            ...data,
                            ...included
                        ]
                    ) {

                        if (
                            !recurso ||
                            recurso.type !== "server" ||
                            !recurso.id
                        ) {
                            continue;
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

                } catch (error2) {

                    console.log(
                        "⚠️ BM | No fue posible obtener relationships/servers:",
                        error2.response?.status ||
                        error2.response?.data ||
                        error2.message
                    );
                }
            }

            break;
        }
    }

    console.log(
        `🖥️ BM | Servidores encontrados mediante relationships/servers: ${servidoresEncontrados.size}`
    );
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

    console.log(
        `🎯 BM | Consultando horas directas: jugador ${player} -> servidor ${server}`
    );


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
            `⚠️ BM | Player server no entregó horas para ${server}:`,
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

                if (segundos > 0) {
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

                        if (encontrado > 0) {
                            break;
                        }
                    }
                }

                segundos +=
                    encontrado;
            }
        }

        console.log(
            `🎯 BM | time-played-history ${server} -> ${segundosAHoras(segundos)}`
        );

        if (segundos > 0) {

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
            `⚠️ BM | time-played-history no disponible para ${server}:`,
            error.response?.status ||
            error.message
        );
    }

    return null;
}


// ============================================================
// TOP 10 SERVIDORES RUST
//
// AHORA:
//
// 1. Se parte de TODOS los servidores encontrados.
// 2. Se identifican los que son Rust.
// 3. Se consultan las horas reales del jugador.
// 4. Se ordenan TODOS.
// 5. Se toman los 10 primeros.
//
// No depende únicamente de las sesiones.
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    todasLasSesiones,
    servidoresMap
) {

    const servidores =
        new Map();


    // --------------------------------------------------------
    // SERVIDORES YA CONOCIDOS
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
    // SERVIDORES DE LAS SESIONES
    //
    // Esto se mantiene como respaldo.
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


    // --------------------------------------------------------
    // ASEGURAR INFORMACIÓN DE TODOS LOS SERVIDORES
    // --------------------------------------------------------

    console.log(
        `🔎 BM | Servidores candidatos para Top 10: ${servidores.size}`
    );

    const servidoresRust = [];

    for (
        const servidor of
        servidores.values()
    ) {

        let info =
            servidor;

        /*
         * Si el servidor no tiene información suficiente,
         * consultamos directamente BattleMetrics.
         */

        if (
            !info.nombre ||
            typeof info.esRust === "undefined"
        ) {

            info =
                await obtenerInfoServidor(
                    servidor.id,
                    servidoresMap
                );
        }

        if (!info) {
            continue;
        }

        /*
         * Rust se identifica principalmente por game.
         * También mantenemos el nombre como respaldo.
         */

        const game =
            String(
                info.game || ""
            ).toLowerCase();

        const nombre =
            String(
                info.nombre || ""
            ).toLowerCase();

        const esRust =
            info.esRust === true ||
            game.includes("rust") ||
            nombre.includes("rust");

        if (!esRust) {
            continue;
        }

        servidoresRust.push(
            info
        );
    }

    console.log(
        `🎮 BM | Servidores Rust candidatos: ${servidoresRust.length}`
    );


    // --------------------------------------------------------
    // OBTENER HORAS DE CADA SERVIDOR
    // --------------------------------------------------------

    const resultados = [];

    let contador = 0;

    for (
        const servidor of
        servidoresRust
    ) {

        contador++;

        const serverId =
            String(
                servidor.id
            );

        console.log(
            `📊 BM | Procesando servidor ${contador}/${servidoresRust.length}: ${servidor.nombre} (${serverId})`
        );

        const horasJugador =
            await obtenerHorasJugadorServidor(
                playerId,
                serverId
            );

        let segundos = 0;

        if (horasJugador) {

            segundos =
                Number(
                    horasJugador.segundos
                ) || 0;
        }


        // ----------------------------------------------------
        // FALLBACK: SUMAR SESIONES
        // ----------------------------------------------------

        if (segundos <= 0) {

            for (
                const session of
                todasLasSesiones
            ) {

                const sessionServerId =
                    obtenerServerIdDeSesion(
                        session
                    );

                if (
                    !sessionServerId ||
                    String(
                        sessionServerId
                    ) !== serverId
                ) {
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

                segundos +=
                    Math.floor(
                        (
                            fin -
                            inicio
                        ) / 1000
                    );
            }
        }


        if (segundos > 0) {

            resultados.push({

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
            });

            console.log(
                `✅ BM | ${servidor.nombre}: ${segundosAHoras(segundos)}`
            );

        } else {

            console.log(
                `⚪ BM | ${servidor.nombre}: 0h`
            );
        }
    }


    // --------------------------------------------------------
    // ORDENAR TODOS LOS SERVIDORES
    // --------------------------------------------------------

    resultados.sort(
        (a, b) =>
            Number(
                b.segundos || 0
            ) -
            Number(
                a.segundos || 0
            )
    );


    // --------------------------------------------------------
    // TOTAL REAL
    // --------------------------------------------------------

    const totalSegundos =
        resultados.reduce(
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
    // CANTIDAD TOTAL
    // --------------------------------------------------------

    const cantidadServidores =
        resultados.length;


    // --------------------------------------------------------
    // TOP 10
    // --------------------------------------------------------

    const top10 =
        resultados.slice(
            0,
            10
        );


    console.log(
        "🏆 BM | TOP 10 FINAL:"
    );

    console.log(
        top10
            .map(
                (x, i) =>
                    `${i + 1}. ${x.nombre} -> ${x.tiempo}`
            )
            .join("\n")
    );


    console.log(
        `🖥️ BM | Cantidad total de servidores Rust: ${cantidadServidores}`
    );

    console.log(
        `🧮 BM | Total real de todos los servidores: ${segundosAHoras(totalSegundos)}`
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

            const id =
                String(
                    recurso.id
                );

            const attributes =
                recurso.attributes || {};

            const nombreServidor =
                attributes.name ||
                `Servidor ${id}`;

            const game =
                attributes.game ||
                "";

            const esRust =
                String(game)
                    .toLowerCase()
                    .includes("rust") ||
                nombreServidor
                    .toLowerCase()
                    .includes("rust");

            const timePlayed =
                recurso.meta &&
                typeof recurso.meta.timePlayed !== "undefined"
                    ? Number(
                        recurso.meta.timePlayed
                    )
                    : 0;

            servidoresMap.set(
                id,
                {

                    id,

                    nombre:
                        nombreServidor,

                    game,

                    esRust,

                    timePlayed
                }
            );
        }


        // =====================================================
        // OBTENER TODOS LOS SERVIDORES DEL JUGADOR
        // =====================================================

        await obtenerTodosLosServidoresJugador(
            playerId,
            servidoresMap
        );


        // =====================================================
        // COMPROBAR ONLINE DIRECTAMENTE EN EL SERVIDOR
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
            `📊 BM | Sesiones: ${todasLasSesiones.length}`
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


        // -----------------------------------------------------
        // PERIODOS CHILE
        // -----------------------------------------------------

        const inicioSemana =
            obtenerInicioSemanaChile(
                ahoraDate
            );

        const inicioMes =
            obtenerInicioMesChile(
                ahoraDate
            );


        console.log(
            `🕐 BM | Inicio semana Chile: ${inicioSemana.toISOString()}`
        );

        console.log(
            `🕐 BM | Inicio mes Chile: ${inicioMes.toISOString()}`
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
        // SI ESTÁ ONLINE Y NO HAY SESIONES
        // =====================================================

        if (
            onlinePorServidor &&
            !ultimaConexion
        ) {

            ultimaConexion =
                ahoraDate;

            console.log(
                `🟢 BM | Online confirmado directamente por servidor. Última conexión establecida a ahora.`
            );
        }


        // =====================================================
        // HORAS DEL SERVIDOR CONFIGURADO
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

            console.log(
                `🎯 BM | Jugador está ONLINE en servidor configurado ${configuredServerId}`
            );


            const horasDirectas =
                await obtenerHorasJugadorServidor(
                    playerId,
                    configuredServerId
                );


            if (horasDirectas) {

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

                console.log(
                    `✅ BM | Horas servidor configurado ${configuredServerId}: ${horasDirectas.tiempo}`
                );

            } else {

                console.log(
                    `⚠️ BM | No se encontraron horas directas para servidor configurado ${configuredServerId}`
                );
            }

        } else {

            if (configuredServerId) {

                console.log(
                    `ℹ️ BM | No se consultan horas específicas del servidor ${configuredServerId} porque el jugador no está actualmente allí`
                );
            }
        }


        // =====================================================
        // TOP 10 RUST + TOTAL
        // =====================================================

        const resultadoServidores =
            await obtenerTopServidoresRust(
                playerId,
                todasLasSesiones,
                servidoresMap
            );


        const topServidoresRust =
            resultadoServidores.top10;


        // =====================================================
        // CANTIDAD SERVIDORES RUST
        // =====================================================

        const cantidadServidoresRust =
            resultadoServidores.cantidadServidores;


        // =====================================================
        // TOTAL BM REAL
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

        } catch (error) {

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

            // =================================================
            // TOP 10
            // =================================================

            topServidoresRust,

            top10:
                topServidoresRust,

            // =================================================
            // COMPATIBILIDAD
            // =================================================

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

        // =====================================================
        // IDENTIFICACIÓN
        // =====================================================

        id:
            datos.id,

        nombre:
            datos.nombre,

        name:
            datos.name,

        // =====================================================
        // ESTADO
        // =====================================================

        online:
            datos.online,

        jugando:
            datos.jugando,

        // =====================================================
        // HORAS
        // =====================================================

        totalHoras:
            datos.totalHoras,

        horasTotalesBM:
            datos.horasTotalesBM,

        horasSemana:
            datos.horasSemana,

        horasMes:
            datos.horasMes,

        // =====================================================
        // ÚLTIMA CONEXIÓN
        // =====================================================

        ultimaConexion:
            datos.ultimaConexion,

        // =====================================================
        // SERVIDOR
        // =====================================================

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

        // =====================================================
        // SERVIDORES RUST
        // =====================================================

        cantidadServidoresRust:
            datos.cantidadServidoresRust,

        servidoresEncontrados:
            datos.servidoresEncontrados,

        // =====================================================
        // TOP 10 SERVIDORES
        // =====================================================

        topServidoresRust:
            datos.topServidoresRust,

        top10:
            datos.topServidoresRust,

        // =====================================================
        // HISTORIAL DE NOMBRES
        // =====================================================

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