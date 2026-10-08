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


function esSesionActiva(session) {
    if (!session || !session.attributes) {
        return false;
    }

    const a = session.attributes;

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
            ? String(session.relationships.server.data.id)
            : null;
    }

    return null;
}


// ============================================================
// EXTRAER JUGADORES DE RESPUESTA BATTLEMETRICS
// ============================================================

function extraerJugadoresRespuesta(responseData) {
    const jugadores = [];

    if (!responseData) {
        return jugadores;
    }

    if (Array.isArray(responseData.data)) {
        jugadores.push(...responseData.data);
    }

    else if (
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
            if (
                recurso &&
                recurso.type === "player"
            ) {
                jugadores.push(recurso);
            }
        }
    }

    const unicos = new Map();

    for (const jugador of jugadores) {

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
                ? String(jugador.attributes.name)
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

async function searchBattleMetricsPlayer(playerName, serverId) {
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

        const encontrados = [];

        for (const jugador of jugadores) {

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

        if (!gameName && attributes.game) {
            gameName =
                attributes.game;
        }

        const nombre =
            attributes.name ||
            `Servidor ${id}`;

        const textoGame =
            String(gameName).toLowerCase();

        const esRust =
            textoGame.includes("rust") ||
            nombre.toLowerCase().includes("rust");

        /*
         * IMPORTANTE:
         * Este timePlayed pertenece al servidor,
         * NO se usa como horas del jugador.
         */
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
            game: gameName,
            esRust,
            ip: attributes.ip || null,
            port: attributes.port || null,
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
// OBTENER SESIONES DEL JUGADOR
// ============================================================

async function obtenerTodasLasSesiones(playerId) {

    const sesiones = [];

    try {

        let page = 1;

        while (page <= 50) {

            const response =
                await axiosBM.get(
                    `/players/${playerId}/relationships/sessions`,
                    {
                        params: {
                            "page[size]": 100,
                            "page[number]": page
                        }
                    }
                );

            const data =
                Array.isArray(
                    response.data.data
                )
                    ? response.data.data
                    : [];

            if (data.length === 0) {
                break;
            }

            sesiones.push(
                ...data
            );

            const meta =
                response.data.meta || {};

            const total =
                meta.total ||
                meta.count ||
                null;

            if (
                total &&
                sesiones.length >= total
            ) {
                break;
            }

            if (data.length < 100) {
                break;
            }

            page++;
        }

    } catch (error) {

        console.log(
            "⚠️ BM | Primer método de sesiones falló. Reintentando..."
        );

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

            if (
                Array.isArray(
                    response.data.data
                )
            ) {
                sesiones.push(
                    ...response.data.data
                );
            }

        } catch (error2) {

            console.error(
                "❌ BM | Error obteniendo sesiones:",
                error2.response?.data ||
                error2.message
            );
        }
    }

    return sesiones;
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

        for (const valor of candidatos) {

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

        for (const valor of candidatosMeta) {

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

            for (const registro of data) {

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

                for (const valor of valores) {

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
            `⚠️ BM | time-played-history no disponible para ${server}:`,
            error.response?.status ||
            error.message
        );
    }

    return null;
}


// ============================================================
// TOP 10 SERVIDORES RUST
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    todasLasSesiones,
    servidoresMap
) {

    const servidores = new Map();


    // --------------------------------------------------------
    // SERVIDORES CONOCIDOS
    // --------------------------------------------------------

    for (const servidor of servidoresMap.values()) {

        if (
            servidor &&
            servidor.id &&
            servidor.esRust
        ) {

            servidores.set(
                String(servidor.id),
                {
                    ...servidor
                }
            );
        }
    }


    // --------------------------------------------------------
    // SERVIDORES DE LAS SESIONES
    // --------------------------------------------------------

    for (const session of todasLasSesiones) {

        const serverId =
            obtenerServerIdDeSesion(session);

        if (!serverId) {
            continue;
        }

        const id =
            String(serverId);

        if (servidores.has(id)) {
            continue;
        }

        const servidor =
            await obtenerInfoServidor(
                id,
                servidoresMap
            );

        if (
            servidor &&
            servidor.esRust
        ) {

            servidores.set(
                id,
                servidor
            );
        }
    }


    // --------------------------------------------------------
    // HORAS REALES DEL JUGADOR POR SERVIDOR
    // --------------------------------------------------------

    const resultados = [];

    for (const servidor of servidores.values()) {

        const serverId =
            String(servidor.id);

        /*
         * NO usamos servidor.timePlayed aquí.
         *
         * Ese valor pertenece al servidor y puede
         * representar el tiempo global del servidor.
         *
         * Consultamos directamente las horas del jugador.
         */

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
        // FALLBACK: SUMAR SESIONES SI BM NO ENTREGA
        // ----------------------------------------------------

        if (segundos <= 0) {

            for (const session of todasLasSesiones) {

                const sessionServerId =
                    obtenerServerIdDeSesion(session);

                if (
                    !sessionServerId ||
                    String(sessionServerId) !== serverId
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
                    esSesionActiva(session)
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
                        (fin - inicio) / 1000
                    );
            }
        }


        /*
         * Solo agregamos servidores donde
         * realmente tenemos tiempo del jugador.
         */
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
        }
    }


    // --------------------------------------------------------
    // ORDENAR DE MAYOR A MENOR
    // --------------------------------------------------------

    resultados.sort(
        (a, b) =>
            Number(b.segundos || 0) -
            Number(a.segundos || 0)
    );


    // --------------------------------------------------------
    // TOTAL REAL DE TODOS LOS SERVIDORES
    // --------------------------------------------------------

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


    const top10 =
        resultados.slice(0, 10);


    console.log(
        "🏆 BM | Top servidores calculado:",
        top10
            .map(
                (x, i) =>
                    `${i + 1}. ${x.nombre} -> ${x.tiempo}`
            )
            .join(" | ")
    );


    console.log(
        `🧮 BM | Total real de todos los servidores: ${segundosAHoras(totalSegundos)}`
    );


    return {
        top10,
        totalSegundos
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
                configuredServerId || "NINGUNO"
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
        // SESIÓN ACTIVA
        // -----------------------------------------------------

        let sesionActiva = null;
        let sesionActivaRust = null;
        let servidorActualRust = null;


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

                servidorActualRust =
                    servidor;

                break;
            }
        }


        // -----------------------------------------------------
        // ESTADO
        // -----------------------------------------------------

        const online =
            !!sesionActiva;

        const jugando =
            !!sesionActivaRust;


        // -----------------------------------------------------
        // HORAS DE SESIONES
        // -----------------------------------------------------

        let segundosTotalesSesiones = 0;
        let segundosSemana = 0;
        let segundosMes = 0;
        let ultimaConexion = null;

        const ahoraDate =
            new Date();


        const inicioSemana =
            new Date(
                ahoraDate
            );

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
                ahoraDate.getFullYear(),
                ahoraDate.getMonth(),
                1,
                0,
                0,
                0,
                0
            );


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
                fin >= inicioSemana ||
                inicio >= inicioSemana
            ) {

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


            // -------------------------------------------------
            // MES
            // -------------------------------------------------

            if (
                fin >= inicioMes ||
                inicio >= inicioMes
            ) {

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
        // HORAS DEL SERVIDOR CONFIGURADO
        // =====================================================

        let horasServidorConfigurado = null;

        let jugandoServidorConfigurado = false;


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
        // TOTAL BM REAL
        // =====================================================

        let horasTotalesBM =
            Number(
                resultadoServidores.totalSegundos
            ) || 0;


        /*
         * Solo usamos las sesiones como último respaldo
         * si no conseguimos ningún tiempo directo.
         */

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


        // -----------------------------------------------------
        // SERVIDOR PARA MOSTRAR
        // -----------------------------------------------------

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

            servidoresEncontrados:
                topServidoresRust,

            servidores: {
                rust: {
                    datos: {
                        servidoresEncontrados:
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
            datos.horasServidorConfigurado
    };
}


// ============================================================
// LEADERBOARD
// ============================================================

async function getServerLeaderboard(serverId) {

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