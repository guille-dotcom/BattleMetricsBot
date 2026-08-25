require("dotenv").config();

const axios = require("axios");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";
const TIMEZONE_CHILE = "America/Santiago";

const MAX_LAST_SEEN_MINUTES = 60;
const LIMITE_PAGINAS_BUSQUEDA = 20;
const LIMITE_PAGINAS_SESIONES = 50;


// =====================================================
// HEADERS
// =====================================================

function getHeaders() {

    const token = process.env.BATTLEMETRICS_TOKEN;

    return token
        ? {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
        }
        : {
            "Content-Type": "application/json"
        };
}


// =====================================================
// FECHA CHILE
// =====================================================

function formatearFechaChile(fecha) {

    if (!fecha) return "Nunca";

    try {

        const fechaReal =
            fecha instanceof Date
                ? fecha
                : new Date(fecha);

        if (isNaN(fechaReal.getTime())) {
            return "No disponible";
        }

        return new Intl.DateTimeFormat(
            "es-CL",
            {
                timeZone: TIMEZONE_CHILE,
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            }
        ).format(fechaReal);

    } catch (error) {

        console.error(
            "❌ Error formateando fecha:",
            error.message
        );

        return "No disponible";
    }
}


// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {

    return String(nombre || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
}


// =====================================================
// SERVER ID DE SESIÓN
// =====================================================

function obtenerServerIdDeSesion(sesion) {

    if (!sesion) return null;

    const relationship =
        sesion.relationships?.server?.data;

    if (relationship?.id) {
        return String(relationship.id);
    }

    if (sesion.attributes?.serverId) {
        return String(sesion.attributes.serverId);
    }

    return null;
}


// =====================================================
// SERVIDORES DEL PERFIL
// =====================================================

function obtenerServidoresDelPerfil(jugador) {

    if (!jugador) return [];

    const servidores =
        jugador.relationships?.servers?.data;

    if (!Array.isArray(servidores)) {
        return [];
    }

    return servidores
        .filter(
            servidor =>
                servidor &&
                servidor.id
        )
        .map(
            servidor => ({
                id: String(servidor.id),
                type: servidor.type || "server",
                meta: servidor.meta || {}
            })
        );
}


// =====================================================
// OBTENER SERVIDOR
// =====================================================

async function obtenerServidor(serverId) {

    try {

        if (!serverId) return null;

        const response =
            await axios.get(
                `${BM_API}/servers/${serverId}`,
                {
                    headers: getHeaders(),
                    timeout: 10000
                }
            );

        const servidor =
            response.data?.data;

        if (!servidor) return null;

        return {
            id: String(servidor.id),

            name:
                servidor.attributes?.name ||
                `Servidor ${serverId}`,

            game:
                servidor.attributes?.game ||
                null,

            players:
                servidor.attributes?.players ?? null,

            maxPlayers:
                servidor.attributes?.maxPlayers ?? null
        };

    } catch (error) {

        console.error(
            `❌ Error obteniendo servidor ${serverId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// AGREGAR SIN DUPLICADOS
// =====================================================

function agregarJugadorUnico(
    resultados,
    jugador
) {

    if (!jugador || !jugador.id) {
        return;
    }

    if (
        jugador.type &&
        jugador.type !== "player"
    ) {
        return;
    }

    const existe =
        resultados.some(
            resultado =>
                String(resultado.id) ===
                String(jugador.id)
        );

    if (!existe) {
        resultados.push(jugador);
    }
}


// =====================================================
// BUSCAR PLAYERS
// =====================================================

async function ejecutarBusquedaJugadores(
    termino,
    serverId = null
) {

    const resultados = [];

    if (!String(termino || "").trim()) {
        return resultados;
    }

    const terminoBusqueda =
        String(termino).trim();

    let nextUrl =
        `${BM_API}/players`;

    let pagina = 1;

    while (
        nextUrl &&
        pagina <= LIMITE_PAGINAS_BUSQUEDA
    ) {

        console.log(
            `📄 BM /players → "${terminoBusqueda}" → página ${pagina}` +
            (
                serverId
                    ? ` → servidor ${serverId}`
                    : " → GLOBAL"
            )
        );

        try {

            const params =
                pagina === 1
                    ? {
                        "filter[search]":
                            terminoBusqueda,
                        "page[size]":
                            100
                    }
                    : undefined;

            if (
                pagina === 1 &&
                serverId
            ) {

                params["filter[servers]"] =
                    String(serverId);
            }

            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers: getHeaders(),
                        params,
                        timeout: 15000
                    }
                );

            const jugadores =
                response.data?.data || [];

            console.log(
                `📊 BM /players → ${jugadores.length} perfiles recibidos`
            );

            for (const jugador of jugadores) {

                agregarJugadorUnico(
                    resultados,
                    jugador
                );
            }

            nextUrl =
                response.data?.links?.next ||
                null;

            pagina++;

        } catch (error) {

            console.error(
                `❌ Error buscando "${terminoBusqueda}" en BM:`,
                error.response?.data ||
                error.message
            );

            break;
        }
    }

    return resultados;
}


// =====================================================
// CANDIDATOS POR NOMBRE
// =====================================================

async function obtenerCandidatosPorNombre(
    nombre,
    serverId
) {

    const candidatos = [];

    const nombreBuscado =
        String(nombre || "").trim();

    if (!nombreBuscado) {
        return candidatos;
    }

    /*
     * IMPORTANTE:
     * Primero buscamos directamente en el servidor.
     * Esto permite encontrar TODOS los perfiles que
     * tengan el mismo nombre dentro de ese servidor.
     */

    const resultadosServidor =
        await ejecutarBusquedaJugadores(
            nombreBuscado,
            serverId
        );

    for (const jugador of resultadosServidor) {

        agregarJugadorUnico(
            candidatos,
            jugador
        );
    }

    /*
     * Si BattleMetrics no devuelve nada mediante
     * filter[servers], hacemos búsqueda global.
     */

    if (candidatos.length === 0) {

        console.log(
            `🌎 BM → fallback global para "${nombreBuscado}"`
        );

        const resultadosGlobales =
            await ejecutarBusquedaJugadores(
                nombreBuscado
            );

        for (const jugador of resultadosGlobales) {

            agregarJugadorUnico(
                candidatos,
                jugador
            );
        }
    }

    return candidatos;
}


// =====================================================
// BUSCAR PERFILES POR NOMBRE EXACTO
// =====================================================

async function buscarPerfilesPorNombre(
    nombre,
    serverId = null
) {

    try {

        const nombreBuscado =
            String(nombre || "").trim();

        if (!nombreBuscado) {
            return [];
        }

        const nombreNormalizado =
            normalizarNombre(
                nombreBuscado
            );

        const candidatos =
            await obtenerCandidatosPorNombre(
                nombreBuscado,
                serverId
            );

        /*
         * SOLO NOMBRE EXACTO.
         *
         * Esto es importante para evitar que una búsqueda
         * de "123" devuelva "1234", "123_x", etc.
         */

        const resultados =
            candidatos.filter(
                jugador => {

                    const nombreBM =
                        normalizarNombre(
                            jugador.attributes?.name
                        );

                    return (
                        nombreBM ===
                        nombreNormalizado
                    );
                }
            );

        console.log(
            `🔎 BM → ${resultados.length} perfil(es) exactos para "${nombreBuscado}"`
        );

        for (const perfil of resultados) {

            console.log(
                `   👤 ${perfil.attributes?.name || "Desconocido"} → ${perfil.id}`
            );
        }

        return resultados;

    } catch (error) {

        console.error(
            "❌ Error buscando perfiles:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// OBTENER JUGADOR
// =====================================================

async function obtenerJugador(playerId) {

    try {

        const response =
            await axios.get(
                `${BM_API}/players/${playerId}`,
                {
                    headers: getHeaders(),

                    params: {
                        include: "server"
                    },

                    timeout: 10000
                }
            );

        const jugador =
            response.data?.data ||
            null;

        if (!jugador) {
            return null;
        }

        jugador._servidoresIncluidos =
            response.data?.included
                ?.filter(
                    item =>
                        item?.type === "server"
                ) ||
            [];

        return jugador;

    } catch (error) {

        console.error(
            `⚠️ Error obteniendo jugador ${playerId}:`,
            error.response?.data ||
            error.message
        );

        return null;
    }
}


// =====================================================
// SESIONES DEL JUGADOR
// =====================================================

async function obtenerSesionesJugador(
    playerId
) {

    const sesiones = [];

    let nextUrl =
        `${BM_API}/players/${playerId}/relationships/sessions?page[size]=100`;

    let pagina = 1;

    while (
        nextUrl &&
        pagina <= LIMITE_PAGINAS_SESIONES
    ) {

        try {

            const response =
                await axios.get(
                    nextUrl,
                    {
                        headers: getHeaders(),
                        timeout: 15000
                    }
                );

            const data =
                response.data?.data || [];

            if (data.length === 0) {
                break;
            }

            sesiones.push(
                ...data
            );

            nextUrl =
                response.data?.links?.next ||
                null;

            pagina++;

        } catch (error) {

            console.error(
                `❌ Error obteniendo sesiones ${playerId}:`,
                error.response?.data ||
                error.message
            );

            break;
        }
    }

    console.log(
        `📊 BM ${playerId} → ${sesiones.length} sesiones`
    );

    return sesiones;
}


// =====================================================
// ÚLTIMA SESIÓN
// =====================================================

function obtenerUltimaSesion(
    sesiones
) {

    if (
        !Array.isArray(sesiones) ||
        sesiones.length === 0
    ) {
        return null;
    }

    const validas =
        sesiones.filter(
            sesion => {

                const fecha =
                    new Date(
                        sesion.attributes?.start
                    );

                return (
                    sesion.attributes?.start &&
                    !isNaN(fecha.getTime())
                );
            }
        );

    if (!validas.length) {
        return null;
    }

    return [...validas].sort(
        (a, b) =>
            new Date(
                b.attributes.start
            ).getTime() -
            new Date(
                a.attributes.start
            ).getTime()
    )[0];
}


// =====================================================
// ÚLTIMA SESIÓN EN SERVIDOR
// =====================================================

function obtenerUltimaSesionEnServidor(
    sesiones,
    serverId
) {

    if (
        !Array.isArray(sesiones) ||
        !serverId
    ) {
        return null;
    }

    const servidor =
        String(serverId);

    const sesionesServidor =
        sesiones.filter(
            sesion =>
                String(
                    obtenerServerIdDeSesion(
                        sesion
                    )
                ) === servidor &&
                sesion.attributes?.start
        );

    if (!sesionesServidor.length) {
        return null;
    }

    return [...sesionesServidor].sort(
        (a, b) =>
            new Date(
                b.attributes.start
            ).getTime() -
            new Date(
                a.attributes.start
            ).getTime()
    )[0];
}


// =====================================================
// LAST SEEN
// =====================================================

function obtenerLastSeenEnServidor(
    sesiones,
    serverId
) {

    const ultima =
        obtenerUltimaSesionEnServidor(
            sesiones,
            serverId
        );

    if (!ultima) {
        return null;
    }

    if (!ultima.attributes?.stop) {
        return new Date();
    }

    const fecha =
        new Date(
            ultima.attributes.stop
        );

    return isNaN(fecha.getTime())
        ? null
        : fecha;
}


// =====================================================
// MINUTOS DESDE
// =====================================================

function calcularMinutosDesde(
    fecha
) {

    if (!fecha) {
        return null;
    }

    const fechaReal =
        fecha instanceof Date
            ? fecha
            : new Date(fecha);

    if (isNaN(fechaReal.getTime())) {
        return null;
    }

    return Math.max(
        0,
        Math.floor(
            (
                Date.now() -
                fechaReal.getTime()
            ) / 60000
        )
    );
}


// =====================================================
// TIEMPO SESIONES
// =====================================================

function calcularTiempoSesiones(
    sesiones,
    serverId = null
) {

    let segundos = 0;

    const ahora =
        Date.now();

    for (const sesion of sesiones || []) {

        if (
            serverId &&
            String(
                obtenerServerIdDeSesion(
                    sesion
                )
            ) !== String(serverId)
        ) {
            continue;
        }

        const atributos =
            sesion.attributes || {};

        if (!atributos.start) {
            continue;
        }

        const inicio =
            new Date(
                atributos.start
            );

        if (isNaN(inicio.getTime())) {
            continue;
        }

        const fin =
            atributos.stop
                ? new Date(atributos.stop)
                : new Date(ahora);

        if (isNaN(fin.getTime())) {
            continue;
        }

        segundos += Math.max(
            0,
            Math.floor(
                (
                    fin.getTime() -
                    inicio.getTime()
                ) / 1000
            )
        );
    }

    return segundos;
}


// =====================================================
// FORMATEAR TIEMPO
// =====================================================

function formatearTiempo(
    segundos
) {

    segundos =
        Number(segundos) || 0;

    const horas =
        Math.floor(
            segundos / 3600
        );

    const minutos =
        Math.floor(
            (segundos % 3600) / 60
        );

    if (horas > 0) {
        return `${horas}h ${minutos}m`;
    }

    return `${minutos}m`;
}


// =====================================================
// TIMEPLAYED DEL SERVIDOR
// =====================================================

function obtenerTimePlayedServidor(
    jugador,
    serverId
) {

    if (!jugador || !serverId) {
        return 0;
    }

    const servidor =
        (
            jugador._servidoresIncluidos ||
            []
        ).find(
            item =>
                String(item.id) ===
                String(serverId)
        );

    if (!servidor) {
        return 0;
    }

    return Math.max(
        0,
        Number(
            servidor.meta?.timePlayed
        ) || 0
    );
}


// =====================================================
// TIEMPO TOTAL PERFIL
// =====================================================

function obtenerTiempoTotalPerfil(
    jugador,
    sesiones
) {

    let total = 0;

    for (
        const servidor of
        jugador?._servidoresIncluidos || []
    ) {

        total +=
            Number(
                servidor.meta?.timePlayed
            ) || 0;
    }

    return Math.max(
        total,
        calcularTiempoSesiones(
            sesiones
        )
    );
}


// =====================================================
// DURACIÓN SESIÓN ACTUAL
// =====================================================

function obtenerDuracionSesionActual(
    sesiones,
    serverId
) {

    const abiertas =
        (sesiones || []).filter(
            sesion =>
                String(
                    obtenerServerIdDeSesion(
                        sesion
                    )
                ) === String(serverId) &&
                sesion.attributes?.start &&
                !sesion.attributes?.stop
        );

    if (!abiertas.length) {
        return 0;
    }

    const sesion =
        [...abiertas].sort(
            (a, b) =>
                new Date(
                    b.attributes.start
                ).getTime() -
                new Date(
                    a.attributes.start
                ).getTime()
        )[0];

    const inicio =
        new Date(
            sesion.attributes.start
        );

    if (isNaN(inicio.getTime())) {
        return 0;
    }

    return Math.max(
        0,
        Math.floor(
            (
                Date.now() -
                inicio.getTime()
            ) / 1000
        )
    );
}


// =====================================================
// CONSTRUIR RESULTADO
// =====================================================

function construirResultadoJugador(
    jugador,
    sesiones,
    serverId,
    servidorConfigurado,
    ultimaSesionServidor,
    lastSeenServidor
) {

    const atributos =
        jugador.attributes || {};

    const playerId =
        String(jugador.id);

    const online =
        Boolean(
            ultimaSesionServidor &&
            !ultimaSesionServidor.attributes?.stop
        );

    const segundosSesionActual =
        obtenerDuracionSesionActual(
            sesiones,
            serverId
        );

    let segundosServidor =
        obtenerTimePlayedServidor(
            jugador,
            serverId
        );

    let origenTiempoServidor =
        "battlemetrics.meta.timePlayed";

    if (segundosServidor <= 0) {

        segundosServidor =
            calcularTiempoSesiones(
                sesiones,
                serverId
            );

        origenTiempoServidor =
            "sessions.fallback";
    }

    const segundosTotal =
        obtenerTiempoTotalPerfil(
            jugador,
            sesiones
        );

    let primeraConexion = null;
    let ultimaConexion = null;

    for (const sesion of sesiones) {

        const inicio =
            sesion.attributes?.start
                ? new Date(
                    sesion.attributes.start
                )
                : null;

        const stop =
            sesion.attributes?.stop
                ? new Date(
                    sesion.attributes.stop
                )
                : null;

        if (
            inicio &&
            !isNaN(inicio.getTime())
        ) {

            if (
                !primeraConexion ||
                inicio < primeraConexion
            ) {
                primeraConexion = inicio;
            }
        }

        if (
            stop &&
            !isNaN(stop.getTime())
        ) {

            if (
                !ultimaConexion ||
                stop > ultimaConexion
            ) {
                ultimaConexion = stop;
            }
        }
    }

    if (!ultimaConexion && primeraConexion) {
        ultimaConexion = primeraConexion;
    }

    const lastSeenMinutes =
        calcularMinutosDesde(
            lastSeenServidor
        );

    const inicioUltima =
        ultimaSesionServidor?.attributes?.start
            ? new Date(
                ultimaSesionServidor.attributes.start
            )
            : null;

    const finUltima =
        ultimaSesionServidor?.attributes?.stop
            ? new Date(
                ultimaSesionServidor.attributes.stop
            )
            : null;

    return {

        id: playerId,

        name:
            atributos.name ||
            "Desconocido",

        serverId:
            String(serverId),

        serverName:
            servidorConfigurado?.name ||
            `Servidor ${serverId}`,

        online,

        sesiones:
            sesiones.length,

        sesionesServidor:
            sesiones.filter(
                sesion =>
                    String(
                        obtenerServerIdDeSesion(
                            sesion
                        )
                    ) === String(serverId)
            ).length,

        sesionActualSegundos:
            segundosSesionActual,

        tiempoSesionActual:
            formatearTiempo(
                segundosSesionActual
            ),

        tiempoOnline:
            formatearTiempo(
                segundosSesionActual
            ),

        tiempoOnlineSegundos:
            segundosSesionActual,

        timePlayedSeconds:
            segundosTotal,

        tiempoJugado:
            formatearTiempo(
                segundosTotal
            ),

        horasTotales:
            Number(
                (
                    segundosTotal / 3600
                ).toFixed(2)
            ),

        horasTotalesBM:
            Math.floor(
                segundosTotal / 3600
            ),

        timePlayedServerSeconds:
            segundosServidor,

        tiempoServidor:
            formatearTiempo(
                segundosServidor
            ),

        horasServidor:
            Number(
                (
                    segundosServidor / 3600
                ).toFixed(2)
            ),

        horasServidorBM:
            Math.floor(
                segundosServidor / 3600
            ),

        origenTiempoServidor,

        ultimaSesionSegundos:
            ultimaSesionServidor
                ? calcularTiempoSesiones(
                    [ultimaSesionServidor],
                    serverId
                )
                : 0,

        tiempoUltimaSesion:
            ultimaSesionServidor
                ? formatearTiempo(
                    calcularTiempoSesiones(
                        [ultimaSesionServidor],
                        serverId
                    )
                )
                : "0m",

        ultimaSesionInicio:
            formatearFechaChile(
                inicioUltima
            ),

        ultimaSesionFin:
            formatearFechaChile(
                finUltima
            ),

        ultimaSesionServerId:
            String(serverId),

        ultimaSesionServerName:
            servidorConfigurado?.name ||
            `Servidor ${serverId}`,

        lastSeen:
            formatearFechaChile(
                lastSeenServidor
            ),

        lastSeenDate:
            lastSeenServidor,

        lastSeenMinutes,

        lastSeenHours:
            lastSeenMinutes !== null
                ? Number(
                    (
                        lastSeenMinutes / 60
                    ).toFixed(2)
                )
                : null,

        lastSeenWithinLimit:
            online ||
            (
                lastSeenMinutes !== null &&
                lastSeenMinutes <=
                    MAX_LAST_SEEN_MINUTES
            ),

        maxLastSeenMinutes:
            MAX_LAST_SEEN_MINUTES,

        primeraConexion:
            formatearFechaChile(
                primeraConexion
            ),

        ultimaConexion:
            formatearFechaChile(
                ultimaConexion
            ),

        ultimaConexionDate:
            ultimaConexion,

        servidoresPerfil:
            obtenerServidoresDelPerfil(
                jugador
            ).map(
                servidor =>
                    servidor.id
            ),

        cantidadServidoresPerfil:
            obtenerServidoresDelPerfil(
                jugador
            ).length,

        perfilUrl:
            `https://www.battlemetrics.com/players/${playerId}`,

        historialConfirmado:
            true,

        origen:
            "server-search+global-fallback+sessions+server-timeplayed+server-last-seen"
    };
}


// =====================================================
// /BUSCAR
// =====================================================
//
// DEVUELVE TODOS LOS PERFILES VÁLIDOS.
//
// Válido:
//
// 🟢 Online en el servidor configurado.
// 🔴 Offline con Last Seen <= 60 minutos.
//
// Si existen:
//
// 123 → online
// 123 → online
// 123 → offline hace 20 min
// 123 → offline hace 2 horas
//
// devuelve los 3 primeros.
//
// El de 2 horas se descarta.
//
// =====================================================

async function buscarJugadorHistorico(
    nombre,
    serverId
) {

    try {

        if (
            !nombre ||
            !String(nombre).trim() ||
            !serverId
        ) {
            return [];
        }

        const nombreBuscado =
            String(nombre).trim();

        const serverIdString =
            String(serverId);

        console.log(
            "================================================="
        );

        console.log(
            `🔎 /BUSCAR → "${nombreBuscado}"`
        );

        console.log(
            `🎯 Servidor → ${serverIdString}`
        );

        console.log(
            `⏱️ Last Seen máximo → ${MAX_LAST_SEEN_MINUTES} minutos`
        );

        console.log(
            "================================================="
        );

        const servidor =
            await obtenerServidor(
                serverIdString
            );

        const perfiles =
            await buscarPerfilesPorNombre(
                nombreBuscado,
                serverIdString
            );

        if (!perfiles.length) {

            console.log(
                `❌ No se encontraron perfiles exactos para "${nombreBuscado}"`
            );

            return [];
        }

        console.log(
            `👥 Se revisarán ${perfiles.length} perfiles`
        );

        const candidatosValidos = [];

        for (
            let i = 0;
            i < perfiles.length;
            i++
        ) {

            const perfilBusqueda =
                perfiles[i];

            const playerId =
                String(
                    perfilBusqueda.id
                );

            console.log(
                "-------------------------------------------------"
            );

            console.log(
                `👤 PERFIL ${i + 1}/${perfiles.length}`
            );

            console.log(
                `   Nombre: ${perfilBusqueda.attributes?.name}`
            );

            console.log(
                `   ID: ${playerId}`
            );

            const detalle =
                await obtenerJugador(
                    playerId
                );

            const jugador =
                detalle ||
                perfilBusqueda;

            /*
             * Si el detalle no trae relationships,
             * conservamos las del resultado de búsqueda.
             */

            if (
                !jugador.relationships?.servers?.data?.length &&
                perfilBusqueda.relationships?.servers?.data?.length
            ) {

                jugador.relationships = {

                    ...(jugador.relationships || {}),

                    servers:
                        perfilBusqueda.relationships.servers
                };
            }

            const sesiones =
                await obtenerSesionesJugador(
                    playerId
                );

            if (!sesiones.length) {

                console.log(
                    `⚠️ ${playerId} → sin sesiones accesibles`
                );

                continue;
            }

            const ultimaSesionServidor =
                obtenerUltimaSesionEnServidor(
                    sesiones,
                    serverIdString
                );

            /*
             * ESTA ES LA COMPROBACIÓN IMPORTANTE.
             *
             * No basta con que el perfil exista.
             * Tiene que tener una sesión en el servidor
             * configurado.
             */

            if (!ultimaSesionServidor) {

                console.log(
                    `❌ ${playerId} → sin historial en servidor ${serverIdString}`
                );

                continue;
            }

            const online =
                !ultimaSesionServidor.attributes?.stop;

            const lastSeenServidor =
                obtenerLastSeenEnServidor(
                    sesiones,
                    serverIdString
                );

            const lastSeenMinutes =
                calcularMinutosDesde(
                    lastSeenServidor
                );

            console.log(
                `🎮 ${playerId} → ${online ? "ONLINE" : "OFFLINE"}`
            );

            console.log(
                `🕐 Last Seen → ${formatearFechaChile(lastSeenServidor)}`
            );

            console.log(
                `⏱️ Hace → ${lastSeenMinutes ?? "?"} minutos`
            );

            /*
             * ONLINE:
             * siempre válido.
             */

            if (online) {

                console.log(
                    `✅ ${playerId} → ONLINE → VÁLIDO`
                );

            }

            /*
             * OFFLINE:
             * solamente hasta 60 minutos.
             */

            else if (
                lastSeenMinutes !== null &&
                lastSeenMinutes <=
                    MAX_LAST_SEEN_MINUTES
            ) {

                console.log(
                    `✅ ${playerId} → OFFLINE → Last Seen ${lastSeenMinutes} min → VÁLIDO`
                );

            }

            else {

                console.log(
                    `❌ ${playerId} → OFFLINE → Last Seen superior a ${MAX_LAST_SEEN_MINUTES} min → DESCARTADO`
                );

                continue;
            }

            const resultado =
                construirResultadoJugador(
                    jugador,
                    sesiones,
                    serverIdString,
                    servidor,
                    ultimaSesionServidor,
                    lastSeenServidor
                );

            resultado.lastSeenMinutes =
                lastSeenMinutes;

            resultado.lastSeenWithinLimit =
                online ||
                (
                    lastSeenMinutes !== null &&
                    lastSeenMinutes <=
                        MAX_LAST_SEEN_MINUTES
                );

            candidatosValidos.push(
                resultado
            );

            console.log(
                `✅ ${playerId} → AÑADIDO A RESULTADOS`
            );
        }

        /*
         * =================================================
         * ORDEN
         * =================================================
         *
         * Online primero.
         *
         * Si hay varios online:
         * el más reciente primero.
         *
         * Después offline:
         * el Last Seen más reciente primero.
         */

        candidatosValidos.sort(
            (a, b) => {

                if (
                    Boolean(a.online) !==
                    Boolean(b.online)
                ) {

                    return a.online
                        ? -1
                        : 1;
                }

                const fechaA =
                    a.lastSeenDate
                        ? new Date(
                            a.lastSeenDate
                        ).getTime()
                        : 0;

                const fechaB =
                    b.lastSeenDate
                        ? new Date(
                            b.lastSeenDate
                        ).getTime()
                        : 0;

                return fechaB - fechaA;
            }
        );

        console.log(
            "================================================="
        );

        console.log(
            `🎯 RESULTADOS VÁLIDOS → ${candidatosValidos.length}`
        );

        for (const candidato of candidatosValidos) {

            console.log(
                `   ${candidato.online ? "🟢" : "🔴"} ${candidato.name} → ${candidato.id} → ${candidato.online ? "ONLINE" : `${candidato.lastSeenMinutes} min`}`
            );
        }

        console.log(
            "================================================="
        );

        /*
         * IMPORTANTE:
         *
         * YA NO HACEMOS:
         *
         * candidatosValidos[0]
         *
         * porque queremos devolver TODOS.
         */

        return candidatosValidos;

    } catch (error) {

        console.error(
            "❌ Error buscando jugadores históricos:",
            error.response?.data ||
            error.message
        );

        return [];
    }
}


// =====================================================
// COMPATIBILIDAD
// =====================================================

async function searchBattleMetricsPlayerHistory(
    nombre,
    serverId
) {

    return buscarJugadorHistorico(
        nombre,
        serverId
    );
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {

    buscarPerfilesPorNombre,

    obtenerJugador,

    obtenerServidor,

    obtenerSesionesJugador,

    buscarJugadorHistorico,

    searchBattleMetricsPlayerHistory,

    formatearFechaChile,

    calcularTiempoSesiones,

    formatearTiempo,

    obtenerServerIdDeSesion,

    obtenerUltimaSesion,

    obtenerUltimaSesionEnServidor,

    obtenerLastSeenEnServidor,

    calcularMinutosDesde,

    obtenerServidoresDelPerfil,

    normalizarNombre,

    obtenerTimePlayedServidor,

    obtenerTiempoTotalPerfil,

    obtenerDuracionSesionActual
};