
const axios = require("axios");

const {
    getBattleMetricsHoursBm,
    formatearDuracion
} = require("./battlemetricsHoursBm");

const API_BM = "https://api.battlemetrics.com";
const API_STEAM = "https://api.steampowered.com";
const TIMEOUT = 20000;
const MAX_PAGINAS_SESIONES = 10;

// Agrega aquí los IDs de TODOS los servidores WARDOGS.
// El nombre visible del servidor no se utiliza para identificarlos.
const SERVIDORES_WARDOGS = new Set([
    "41195439"
]);

function extraerEntrada(entrada) {
    const texto = String(entrada || "").trim();

    if (/^\d{17}$/.test(texto)) {
        return { tipo: "steam", id: texto };
    }

    const enlaceBM = texto.match(
        /battlemetrics\.com\/servers\/(?:wardogs|rust|[^/]+)\/(\d+)/i
    );

    if (enlaceBM) {
        return { tipo: "servidor", id: enlaceBM[1] };
    }

    const perfilBM = texto.match(
        /battlemetrics\.com\/players\/(\d+)/i
    );

    if (perfilBM) {
        return { tipo: "battlemetrics", id: perfilBM[1] };
    }

    if (/^\d+$/.test(texto)) {
        return {
            tipo: texto.length === 17 ? "steam" : "battlemetrics",
            id: texto
        };
    }

    const perfilSteam = texto.match(
        /steamcommunity\.com\/profiles\/(\d{17})/i
    );

    if (perfilSteam) {
        return { tipo: "steam", id: perfilSteam[1] };
    }

    const vanitySteam = texto.match(
        /steamcommunity\.com\/id\/([^/?#]+)/i
    );

    if (vanitySteam) {
        return { tipo: "vanity", id: vanitySteam[1] };
    }

    return null;
}

function cabecerasBM() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );
    }

    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
    };
}

async function resolverVanitySteam(vanity) {
    const key = process.env.STEAM_API_KEY;

    if (!key) {
        throw new Error("Falta STEAM_API_KEY para consultar Steam.");
    }

    const response = await axios.get(
        `${API_STEAM}/ISteamUser/ResolveVanityURL/v1/`,
        {
            params: { key, vanityurl: vanity },
            timeout: TIMEOUT
        }
    );

    const resultado = response.data?.response;
    const steamId = String(resultado?.steamid || "");

    if (Number(resultado?.success) !== 1 || !/^\d{17}$/.test(steamId)) {
        throw new Error("Steam no pudo resolver ese enlace personalizado.");
    }

    return steamId;
}

async function obtenerPerfilSteam(steamId) {
    const key = process.env.STEAM_API_KEY;

    if (!key) {
        throw new Error("Falta STEAM_API_KEY en las variables de entorno.");
    }

    const response = await axios.get(
        `${API_STEAM}/ISteamUser/GetPlayerSummaries/v2/`,
        {
            params: { key, steamids: steamId },
            timeout: TIMEOUT
        }
    );

    const jugador = response.data?.response?.players?.[0];

    if (!jugador) {
        throw new Error("Steam no devolvió el perfil de ese jugador.");
    }

    return {
        steamId: String(jugador.steamid || steamId),
        nombre: jugador.personaname || null,
        url: jugador.profileurl || null
    };
}

async function buscarIdsPorSteam(steamId) {
    const response = await axios.post(
        `${API_BM}/players/match`,
        {
            data: [
                {
                    type: "identifier",
                    attributes: {
                        type: "steamID",
                        identifier: String(steamId)
                    }
                }
            ]
        },
        {
            headers: {
                ...cabecerasBM(),
                "Content-Type": "application/json"
            },
            timeout: TIMEOUT
        }
    );

    const resultados = Array.isArray(response.data?.data)
        ? response.data.data
        : [];

    return [
        ...new Set(
            resultados
                .map(item => item?.relationships?.player?.data?.id)
                .filter(id => /^\d+$/.test(String(id || "")))
                .map(String)
        )
    ];
}

async function buscarIdsPorNombre(nombre) {
    if (!nombre) return [];

    const response = await axios.get(`${API_BM}/players`, {
        params: {
            "filter[search]": nombre,
            "page[size]": 100
        },
        headers: cabecerasBM(),
        timeout: TIMEOUT
    });

    const resultados = Array.isArray(response.data?.data)
        ? response.data.data
        : [];

    return [
        ...new Set(
            resultados
                .map(item => item?.id)
                .filter(id => /^\d+$/.test(String(id || "")))
                .map(String)
        )
    ];
}

async function obtenerServidor(serverId) {
    const id = String(serverId || "");

    if (!/^\d+$/.test(id)) return null;

    const response = await axios.get(`${API_BM}/servers/${id}`, {
        headers: cabecerasBM(),
        timeout: TIMEOUT
    });

    const server = response.data?.data;

    if (!server) return null;

    return {
        id: String(server.id || id),
        nombre: String(server.attributes?.name || "Servidor sin nombre"),
        game: server.relationships?.game?.data?.id || null,
        url: `https://www.battlemetrics.com/servers/wardogs/${id}`
    };
}

/**
 * Devuelve una sesión abierta en un servidor WARDOGS reconocido
 * por su ID. No se basa en el nombre del servidor.
 */
async function obtenerSesionActiva(playerId) {
    let url =
        `${API_BM}/players/${encodeURIComponent(playerId)}/relationships/sessions` +
        "?page[size]=100";

    const visitadas = new Set();
    let paginas = 0;

    while (url && paginas < MAX_PAGINAS_SESIONES) {
        if (visitadas.has(url)) break;

        visitadas.add(url);
        paginas++;

        const response = await axios.get(url, {
            headers: cabecerasBM(),
            timeout: TIMEOUT
        });

        const sesiones = Array.isArray(response.data?.data)
            ? response.data.data
            : [];

        const activas = sesiones
            .filter(sesion =>
                sesion?.attributes?.stop == null &&
                sesion?.attributes?.start
            )
            .sort((a, b) =>
                Date.parse(b.attributes.start) -
                Date.parse(a.attributes.start)
            );

        for (const sesion of activas) {
            const serverId = String(
                sesion.relationships?.server?.data?.id || ""
            );

            if (!SERVIDORES_WARDOGS.has(serverId)) continue;

            const inicio = Date.parse(sesion.attributes.start);

            if (!Number.isFinite(inicio)) continue;

            let servidor;

            try {
                servidor = await obtenerServidor(serverId);
            } catch (error) {
                console.warn(
                    `No se pudo consultar el servidor ${serverId}:`,
                    error.response?.status || error.message
                );
                continue;
            }

            if (!servidor) continue;

            return {
                servidorActual: servidor,
                duracionSesionSegundos: Math.max(
                    0,
                    Math.floor((Date.now() - inicio) / 1000)
                ),
                inicioSesion: sesion.attributes.start
            };
        }

        const siguiente = response.data?.links?.next;

        if (!siguiente) break;

        let urlSiguiente;

        try {
            urlSiguiente = new URL(siguiente, API_BM);
        } catch {
            break;
        }

        if (urlSiguiente.origin !== API_BM) break;

        url = urlSiguiente.toString();
    }

    return null;
}

async function obtenerHorasServidor(playerId, serverId) {
    try {
        const datos = await getBattleMetricsHoursBm(String(playerId));

        const historial = Array.isArray(datos?.servidoresEncontrados)
            ? datos.servidoresEncontrados
            : [];

        const registro = historial.find(
            servidor => String(servidor.id || "") === String(serverId)
        );

        if (registro) {
            if (registro.tiempo) {
                return {
                    texto: String(registro.tiempo),
                    fuente: "Historial de BattleMetrics"
                };
            }

            const segundos = Number(registro.segundos);

            if (Number.isFinite(segundos) && segundos >= 0) {
                return {
                    texto: formatearDuracion(segundos),
                    fuente: "Historial de BattleMetrics"
                };
            }
        }
    } catch (error) {
        console.warn(
            `No se pudieron consultar las horas del perfil ${playerId}:`,
            error.response?.status || error.message
        );
    }

    return {
        texto: "No disponibles",
        fuente: "BattleMetrics no devolvió el historial del servidor"
    };
}

async function consultarCandidato(playerId, nombreSteam, urlSteam) {
    const sesion = await obtenerSesionActiva(String(playerId));

    if (!sesion) return null;

    const horas = await obtenerHorasServidor(
        playerId,
        sesion.servidorActual.id
    );

    return {
        playerId: String(playerId),
        nombre: nombreSteam || `Jugador ${playerId}`,
        estado: "online",
        servidorActual: sesion.servidorActual,
        duracionSesionSegundos: sesion.duracionSesionSegundos,
        horasServidor: horas.texto,
        fuenteHoras: horas.fuente,
        urlBattleMetrics:
            `https://www.battlemetrics.com/players/${playerId}`,
        urlSteam: urlSteam || null
    };
}

async function consultarWardog(entrada) {
    const identificador = extraerEntrada(entrada);

    if (!identificador) {
        throw new Error(
            "Formato no válido. Usa un SteamID64, un enlace de Steam o un perfil de BattleMetrics."
        );
    }

    if (identificador.tipo === "servidor") {
        throw new Error(
            "Has proporcionado un enlace de servidor. Introduce el perfil de Steam o BattleMetrics del jugador."
        );
    }

    if (identificador.tipo === "battlemetrics") {
        const perfil = await consultarCandidato(
            identificador.id,
            null,
            null
        );

        return perfil ? [perfil] : [];
    }

    const steamId = identificador.tipo === "vanity"
        ? await resolverVanitySteam(identificador.id)
        : identificador.id;

    const steam = await obtenerPerfilSteam(steamId);

    let ids;

    try {
        ids = await buscarIdsPorSteam(steam.steamId);
    } catch (error) {
        if ([401, 403].includes(error.response?.status)) {
            throw new Error(
                "BattleMetrics no autorizó la búsqueda por SteamID. Comprueba los permisos del token."
            );
        }

        throw error;
    }

    if (ids.length === 0) {
        try {
            ids = await buscarIdsPorNombre(steam.nombre);
        } catch (error) {
            if ([401, 403].includes(error.response?.status)) {
                throw new Error(
                    "BattleMetrics no autorizó la búsqueda por nombre. Comprueba los permisos del token."
                );
            }

            throw error;
        }
    }

    const perfiles = [];

    for (const id of ids) {
        try {
            const perfil = await consultarCandidato(
                id,
                steam.nombre,
                steam.url
            );

            if (perfil) perfiles.push(perfil);
        } catch (error) {
            console.warn(
                `No se pudo comprobar el perfil BM ${id}:`,
                error.response?.status || error.message
            );
        }
    }

    return perfiles;
}

module.exports = {
    consultarWardog
};
