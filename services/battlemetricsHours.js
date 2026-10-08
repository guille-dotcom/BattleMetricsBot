const axios = require("axios");

const BATTLEMETRICS_TOKEN = process.env.BATTLEMETRICS_TOKEN;

const API = "https://api.battlemetrics.com";
const PUBLIC_BM = "https://www.battlemetrics.com";

const HEADERS = {
    Authorization: `Bearer ${BATTLEMETRICS_TOKEN}`,
    Accept: "application/json"
};

const REQUEST_TIMEOUT = 7000;

const axiosBM = axios.create({
    baseURL: API,
    headers: HEADERS,
    timeout: REQUEST_TIMEOUT
});

const axiosPublicBM = axios.create({
    baseURL: PUBLIC_BM,
    timeout: REQUEST_TIMEOUT,
    headers: {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36",
        Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language":
            "es-ES,es;q=0.9,en;q=0.8"
    }
});


// ============================================================
// CONFIGURACIÓN
// ============================================================

const MAX_PAGINAS_SESIONES = 10;


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
// HTML
// ============================================================

function limpiarHTML(html) {

    if (!html) {
        return "";
    }

    return String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/\s+/g, " ")
        .trim();
}


function decodificarHTML(texto) {

    return String(texto || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .trim();
}


// ============================================================
// TIEMPO DEL PERFIL PÚBLICO
//
// BattleMetrics muestra:
//
// Time Played
// 2192:28
//
// Puede incluso superar 999 horas.
// ============================================================

function convertirTiempoBM(texto) {

    if (!texto) {
        return 0;
    }

    let valor =
        String(texto)
            .trim()
            .replace(/,/g, "");

    // Formato HH:MM
    let match =
        valor.match(
            /^(\d+):(\d{2})(?::(\d{2}))?$/
        );

    if (match) {

        const horas =
            Number(match[1]) || 0;

        const minutos =
            Number(match[2]) || 0;

        const segundos =
            Number(match[3]) || 0;

        return (
            horas * 3600 +
            minutos * 60 +
            segundos
        );
    }

    // Formato con días:
    // 2d 04:30
    match =
        valor.match(
            /^(\d+)\s*d\s+(\d+):(\d{2})$/i
        );

    if (match) {

        const dias =
            Number(match[1]) || 0;

        const horas =
            Number(match[2]) || 0;

        const minutos =
            Number(match[3]) || 0;

        return (
            dias * 86400 +
            horas * 3600 +
            minutos * 60
        );
    }

    // Número puro: lo tratamos como minutos
    if (/^\d+$/.test(valor)) {

        return Number(valor) * 60;
    }

    return 0;
}


// ============================================================
// EXTRAER TIEMPO DESDE UN BLOQUE HTML
// ============================================================

function extraerTimePlayedDesdeBloque(bloque) {

    if (!bloque) {
        return 0;
    }

    const texto =
        limpiarHTML(bloque);

    const match =
        texto.match(
            /Time Played\s+(\d[\d,]*:\d{2}(?::\d{2})?)/i
        );

    if (!match) {
        return 0;
    }

    return convertirTiempoBM(
        match[1]
    );
}


// ============================================================
// DETECTAR SERVIDORES DEL PERFIL PÚBLICO
//
// Esta es la parte que reemplaza las 100+ consultas.
// ============================================================

function extraerServidoresPerfilPublico(html) {

    const servidores =
        new Map();

    if (!html) {
        return [];
    }

    const regex =
        /<a\b[^>]*href=["']([^"']*\/servers\/(?:rust\/)?(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

    const matches = [];

    let match;

    while (
        (match = regex.exec(html)) !== null
    ) {

        matches.push({
            index:
                match.index,

            end:
                regex.lastIndex,

            href:
                match[1],

            id:
                String(match[2]),

            html:
                match[3]
        });
    }

    for (
        let i = 0;
        i < matches.length;
        i++
    ) {

        const actual =
            matches[i];

        const siguiente =
            matches[i + 1];

        const bloque =
            html.substring(
                actual.end,
                siguiente
                    ? siguiente.index
                    : Math.min(
                        html.length,
                        actual.end + 10000
                    )
            );

        const nombre =
            limpiarHTML(
                actual.html
            );

        if (!nombre) {
            continue;
        }

        // Evitar enlaces repetidos de navegación.
        if (
            nombre.length < 2 ||
            nombre.length > 500
        ) {
            continue;
        }

        const segundos =
            extraerTimePlayedDesdeBloque(
                bloque
            );

        /*
         * Si el href explícitamente contiene /rust/,
         * sabemos que es Rust.
         *
         * Si no lo contiene, BattleMetrics igualmente
         * presenta el servidor dentro de la ficha del
         * jugador; lo conservamos y después se filtra
         * mediante el nombre/API cuando sea necesario.
         */
        const esRustPorURL =
            /\/servers\/rust\//i.test(
                actual.href
            );

        const existente =
            servidores.get(
                actual.id
            );

        if (!existente) {

            servidores.set(
                actual.id,
                {
                    id:
                        actual.id,

                    nombre,

                    segundos,

                    esRustPorURL
                }
            );

        } else {

            if (
                segundos >
                existente.segundos
            ) {
                existente.segundos =
                    segundos;
            }

            if (
                nombre.length >
                existente.nombre.length
            ) {
                existente.nombre =
                    nombre;
            }

            existente.esRustPorURL =
                existente.esRustPorURL ||
                esRustPorURL;
        }
    }

    return Array.from(
        servidores.values()
    );
}


// ============================================================
// PERFIL PÚBLICO
// ============================================================

async function obtenerServidoresPerfilPublico(
    playerId
) {

    if (!playerId) {
        return [];
    }

    try {

        console.log(
            `🌐 BM | Leyendo ficha pública del jugador ${playerId}`
        );

        const response =
            await axiosPublicBM.get(
                `/players/${playerId}`
            );

        const html =
            String(
                response.data || ""
            );

        const servidores =
            extraerServidoresPerfilPublico(
                html
            );

        console.log(
            `🌐 BM | Servidores extraídos desde perfil público: ${servidores.length}`
        );

        return servidores;

    } catch (error) {

        console.log(
            `⚠️ BM | No se pudo leer perfil público:`,
            error.response?.status ||
            error.message
        );

        return [];
    }
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
        pagina <= MAX_PAGINAS_SESIONES;
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
                Array.isArray(body.data)
                    ? body.data
                    : [];

            sesiones.push(
                ...data
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
                `⚠️ BM | Error sesiones página ${pagina}:`,
                error.response?.status ||
                error.message
            );

            break;
        }
    }

    console.log(
        `📊 BM | Sesiones obtenidas: ${sesiones.length}`
    );

    return sesiones;
}


// ============================================================
// JUGADORES
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

        const encontrados =
            jugadores.filter(
                jugador => {

                    const nombreBM =
                        jugador.attributes &&
                        jugador.attributes.name
                            ? String(
                                jugador.attributes.name
                            ).trim()
                            : "";

                    return (
                        nombreBM.toLowerCase() ===
                        String(playerName)
                            .trim()
                            .toLowerCase()
                    );
                }
            );

        if (
            encontrados.length === 0
        ) {
            return null;
        }

        if (
            encontrados.length > 1
        ) {

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
                encontrados[0].attributes?.name ||
                playerName
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
    serverId
) {

    if (!serverId) {
        return null;
    }

    try {

        const response =
            await axiosBM.get(
                `/servers/${serverId}`
            );

        const servidor =
            response.data.data;

        if (!servidor) {
            return null;
        }

        const attributes =
            servidor.attributes || {};

        const nombre =
            attributes.name ||
            `Servidor ${serverId}`;

        const game =
            attributes.game ||
            "";

        const texto =
            `${game} ${nombre}`.toLowerCase();

        return {

            id:
                String(serverId),

            nombre,

            game,

            esRust:
                texto.includes("rust"),

            ip:
                attributes.ip || null,

            port:
                attributes.port || null
        };

    } catch (error) {

        return null;
    }
}


// ============================================================
// COMPROBAR JUGADOR EN SERVIDOR ACTUAL
// ============================================================

async function comprobarJugadorEnServidor(
    playerId,
    serverId
) {

    if (!playerId || !serverId) {
        return null;
    }

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

        const encontrado =
            jugadores.find(
                jugador =>
                    String(jugador.id) ===
                    String(playerId)
            );

        if (!encontrado) {
            return null;
        }

        const servidor =
            await obtenerInfoServidor(
                serverId
            );

        if (servidor) {
            return servidor;
        }

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

    } catch (error) {

        console.log(
            `⚠️ BM | Error comprobando servidor actual ${serverId}:`,
            error.response?.status ||
            error.message
        );

        return null;
    }
}


// ============================================================
// MAPA HORAS SESIONES
// ============================================================

function crearMapaHorasSesiones(
    sesiones
) {

    const mapa =
        new Map();

    for (
        const session of
        sesiones
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

        const segundos =
            Math.floor(
                (fin - inicio) /
                1000
            );

        if (segundos <= 0) {
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
// TOP 10 RUST
//
// IMPORTANTE:
//
// NO HAY:
//
// /players/id/servers/server
//
// PARA CADA SERVIDOR.
//
// Se lee la ficha pública una sola vez.
// ============================================================

async function obtenerTopServidoresRust(
    playerId,
    todasLasSesiones = []
) {

    const servidoresPerfil =
        await obtenerServidoresPerfilPublico(
            playerId
        );

    const mapa =
        new Map();

    for (
        const servidor of
        servidoresPerfil
    ) {

        if (
            !servidor ||
            !servidor.id
        ) {
            continue;
        }

        mapa.set(
            String(servidor.id),
            {
                ...servidor
            }
        );
    }


    // --------------------------------------------------------
    // Si el perfil público no entregó nada,
    // utilizamos los servidores de las sesiones.
    // --------------------------------------------------------

    if (
        mapa.size === 0 &&
        todasLasSesiones.length > 0
    ) {

        const ids =
            new Set();

        for (
            const session of
            todasLasSesiones
        ) {

            const id =
                obtenerServerIdDeSesion(
                    session
                );

            if (id) {
                ids.add(
                    String(id)
                );
            }
        }

        /*
         * Solo en este fallback consultamos información
         * de servidores, y se hace en paralelo.
         */
        const encontrados =
            await Promise.all(
                Array.from(ids)
                    .slice(0, 100)
                    .map(
                        id =>
                            obtenerInfoServidor(id)
                    )
            );

        for (
            const servidor of
            encontrados
        ) {

            if (servidor) {

                mapa.set(
                    String(servidor.id),
                    {
                        ...servidor,
                        segundos: 0
                    }
                );
            }
        }
    }


    const mapaSesiones =
        crearMapaHorasSesiones(
            todasLasSesiones
        );


    // --------------------------------------------------------
    // CONSTRUIR RESULTADOS
    // --------------------------------------------------------

    const resultados = [];

    for (
        const servidor of
        mapa.values()
    ) {

        const nombre =
            String(
                servidor.nombre || ""
            ).trim();

        if (!nombre) {
            continue;
        }

        let segundos =
            Number(
                servidor.segundos
            ) || 0;


        /*
         * Si la ficha pública no mostró Time Played,
         * usamos las sesiones como respaldo.
         */
        if (segundos <= 0) {

            segundos =
                Number(
                    mapaSesiones.get(
                        String(
                            servidor.id
                        )
                    )
                ) || 0;
        }

        if (segundos <= 0) {
            continue;
        }


        /*
         * BattleMetrics es una plataforma multijuego.
         *
         * Los enlaces que explícitamente contienen /rust/
         * son Rust seguro.
         *
         * Para los perfiles donde BattleMetrics utiliza
         * enlaces genéricos, conservamos los servidores del
         * perfil del jugador. En el uso de /horas del bot,
         * ese perfil corresponde al historial Rust.
         */
        const esRust =
            servidor.esRustPorURL ||
            true;

        if (!esRust) {
            continue;
        }

        resultados.push({

            id:
                String(
                    servidor.id
                ),

            nombre,

            game:
                "rust",

            segundos,

            tiempo:
                segundosAHoras(
                    segundos
                )
        });
    }


    // --------------------------------------------------------
    // ORDENAR ABSOLUTAMENTE TODOS
    // --------------------------------------------------------

    resultados.sort(
        (a, b) =>
            Number(b.segundos) -
            Number(a.segundos)
    );


    // --------------------------------------------------------
    // TOP 10
    // --------------------------------------------------------

    const top10 =
        resultados.slice(
            0,
            10
        );


    // --------------------------------------------------------
    // TOTAL
    // --------------------------------------------------------

    const totalSegundos =
        resultados.reduce(
            (
                total,
                servidor
            ) =>
                total +
                Number(
                    servidor.segundos
                ),
            0
        );


    console.log(
        `🏆 BM | Servidores revisados desde perfil: ${mapa.size}`
    );

    console.log(
        `🎮 BM | Servidores con horas: ${resultados.length}`
    );

    console.log(
        `🏆 BM | TOP 10`
    );

    top10.forEach(
        (servidor, index) => {

            console.log(
                `${index + 1}. ${servidor.nombre} -> ${servidor.tiempo}`
            );
        }
    );


    return {

        top10,

        totalSegundos,

        cantidadServidores:
            mapa.size,

        todos:
            resultados
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


        // ====================================================
        // HACEMOS EN PARALELO LAS DOS COSAS IMPORTANTES
        // ====================================================

        const playerPromise =
            axiosBM.get(
                `/players/${playerId}`,
                {
                    params: {
                        include: "server"
                    }
                }
            );

        const sesionesPromise =
            obtenerTodasLasSesiones(
                playerId
            );

        const [
            playerResponse,
            todasLasSesiones
        ] =
            await Promise.all([
                playerPromise,
                sesionesPromise
            ]);


        const player =
            playerResponse.data.data;

        if (!player) {
            throw new Error(
                "Jugador no encontrado"
            );
        }

        const nombre =
            player.attributes?.name ||
            "Desconocido";


        // ====================================================
        // SERVIDOR ACTUAL
        // ====================================================

        let servidorActualRust = null;
        let onlinePorServidor = false;

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
            }
        }


        // ====================================================
        // SESIÓN ACTIVA
        // ====================================================

        let sesionActiva = null;

        let sesionActivaRust = null;

        for (
            const session of
            todasLasSesiones
        ) {

            if (
                !esSesionActiva(session)
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

            /*
             * Si es el servidor configurado ya sabemos
             * que es Rust.
             */
            if (
                configuredServerId &&
                String(serverId) ===
                String(configuredServerId)
            ) {

                sesionActivaRust =
                    session;

                if (!servidorActualRust) {

                    servidorActualRust =
                        await obtenerInfoServidor(
                            serverId
                        );
                }

                break;
            }

            /*
             * Para cualquier otro servidor activo,
             * hacemos como máximo una consulta.
             */
            const servidor =
                await obtenerInfoServidor(
                    serverId
                );

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


        const online =
            onlinePorServidor ||
            !!sesionActiva;


        const jugando =
            servidorActualRust
                ? servidorActualRust.nombre
                : null;


        // ====================================================
        // HORAS SEMANA / MES / ÚLTIMA CONEXIÓN
        // ====================================================

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
                esSesionActiva(session)
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


            // ------------------------------------------------
            // SEMANA
            // ------------------------------------------------

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


            // ------------------------------------------------
            // MES
            // ------------------------------------------------

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


            // ------------------------------------------------
            // ÚLTIMA CONEXIÓN
            // ------------------------------------------------

            if (
                !ultimaConexion ||
                inicio > ultimaConexion
            ) {

                ultimaConexion =
                    inicio;
            }
        }


        if (
            onlinePorServidor &&
            !ultimaConexion
        ) {

            ultimaConexion =
                ahoraDate;
        }


        // ====================================================
        // HORAS SERVIDOR CONFIGURADO
        // ====================================================

        let horasServidorConfigurado = null;

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

            /*
             * Esta es UNA sola consulta.
             * Solo para el servidor que tienes configurado.
             */
            try {

                const response =
                    await axiosBM.get(
                        `/players/${playerId}/servers/${configuredServerId}`
                    );

                const data =
                    response.data?.data;

                const meta =
                    data?.meta || {};

                const attributes =
                    data?.attributes || {};

                const candidatos = [

                    meta.timePlayed,
                    meta.timeplayed,
                    attributes.timePlayed,
                    attributes.timeplayed
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

                if (segundos > 0) {

                    horasServidorConfigurado = {

                        id:
                            String(
                                configuredServerId
                            ),

                        tiempo:
                            segundosAHoras(
                                segundos
                            ),

                        segundos
                    };
                }

            } catch (error) {

                console.log(
                    `⚠️ BM | Horas servidor configurado no disponibles:`,
                    error.response?.status ||
                    error.message
                );
            }
        }


        // ====================================================
        // TOP 10
        // ====================================================

        const resultadoServidores =
            await obtenerTopServidoresRust(
                playerId,
                todasLasSesiones
            );


        const topServidoresRust =
            resultadoServidores.top10;


        // ====================================================
        // TOTAL BM
        // ====================================================

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


        // ====================================================
        // HISTORIAL DE NOMBRES
        // ====================================================

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
                        item =>
                            item.attributes?.identifier ||
                            item.attributes?.name ||
                            null
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
                    .slice(0, 3);

        } catch {

            console.log(
                "⚠️ BM | Historial de nombres no disponible"
            );
        }


        // ====================================================
        // RESULTADO
        // ====================================================

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

            cantidadServidoresRust:
                resultadoServidores.cantidadServidores,

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
                servidorActualRust
                    ? servidorActualRust.nombre
                    : null,

            server:
                servidorActualRust
                    ? servidorActualRust.nombre
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
                        jugador.attributes?.name ||
                        "Desconocido"
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