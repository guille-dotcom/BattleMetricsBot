
const axios = require("axios");

const {
    getBattleMetricsHoursBm,
    formatearDuracion
} = require("./battlemetricsHoursBm");

const API_BM = "https://api.battlemetrics.com";
const API_STEAM = "https://api.steampowered.com";

function extraerEntrada(entrada) {
    const texto = String(entrada || "").trim();

    if (/^\d{17}$/.test(texto)) {
        return { tipo: "steam", id: texto };
    }

    const enlaceBM = texto.match(
        /(?:https?:\/\/)?(?:www\.)?battlemetrics\.com\/players\/(\d+)/i
    );

    if (enlaceBM) {
        return { tipo: "battlemetrics", id: enlaceBM[1] };
    }

    if (/^\d+$/.test(texto)) {
        return { tipo: "battlemetrics", id: texto };
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
        throw new Error("Falta BATTLEMETRICS_TOKEN en las variables de entorno.");
    }

    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json"
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
            timeout: 15000
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
            params: {
                key,
                steamids: steamId
            },
            timeout: 15000
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
            headers: cabecerasBM(),
            timeout: 20000
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
        timeout: 20000
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

function servidorEsWardog(servidor) {
    if (!servidor) return false;

    return /\bwardogs?\b/i.test(String(servidor.nombre || ""));
}

function obtenerHorasServidorActual(datos, servidorActual) {
    const servidores = Array.isArray(datos.servidoresEncontrados)
        ? datos.servidoresEncontrados
        : [];

    const historial = servidores.find(
        servidor =>
            String(servidor.id || "") === String(servidorActual.id || "")
    );

    if (historial) {
        const segundos = Number(historial.segundos);

        if (Number.isFinite(segundos) && segundos >= 0) {
            return {
                texto: historial.tiempo || formatearDuracion(segundos),
                fuente: "Historial de BattleMetrics"
            };
        }

        if (historial.tiempo) {
            return {
                texto: String(historial.tiempo),
                fuente: "Historial de BattleMetrics"
            };
        }
    }

    const duracion = Number(datos.duracionSesionSegundos);

    if (Number.isFinite(duracion) && duracion >= 0) {
        return {
            texto: formatearDuracion(duracion),
            fuente: "Sesión actual"
        };
    }

    return {
        texto: "No disponibles",
        fuente: "BattleMetrics no devolvió horas"
    };
}

async function consultarCandidato(playerId, nombreSteam, urlSteam) {
    const datos = await getBattleMetricsHoursBm(String(playerId));

    if (!datos || typeof datos !== "object") return null;

    const servidorActual = datos.servidorActualRust || null;

    // Debe estar online y su servidor actual debe ser WARDOG.
    if (datos.estado !== "online" || !servidorEsWardog(servidorActual)) {
        return null;
    }

    const horas = obtenerHorasServidorActual(datos, servidorActual);

    return {
        playerId: String(playerId),
        nombre: nombreSteam || datos.nombre || `Jugador ${playerId}`,
        steamId: datos.steamId || null,
        urlSteam: urlSteam || null,
        estado: "online",
        servidorActual,
        duracionSesionSegundos: datos.duracionSesionSegundos ?? null,
        horasServidor: horas.texto,
        fuenteHoras: horas.fuente,
        urlBattleMetrics: `https://www.battlemetrics.com/players/${playerId}`
    };
}

async function consultarWardog(entrada) {
    const identificador = extraerEntrada(entrada);

    if (!identificador) {
        throw new Error(
            "Formato no válido. Usa un SteamID64, un enlace de Steam o un perfil de BattleMetrics."
        );
    }

    // Un enlace directo de BattleMetrics también se comprueba contra
    // el estado online y el nombre del servidor actual.
    if (identificador.tipo === "battlemetrics") {
        const perfil = await consultarCandidato(
            identificador.id,
            null,
            null
        );

        if (!perfil) {
            throw new Error(
                "Este perfil no está online en un servidor WARDOG en este momento."
            );
        }

        return [perfil];
    }

    const steamId = identificador.tipo === "vanity"
        ? await resolverVanitySteam(identificador.id)
        : identificador.id;

    const steam = await obtenerPerfilSteam(steamId);
    let ids = [];

    try {
        ids = await buscarIdsPorSteam(steam.steamId);
    } catch (error) {
        const status = error.response?.status;

        if (status === 401 || status === 403) {
            throw new Error(
                "BattleMetrics no autorizó la búsqueda por SteamID. Usa un enlace directo de BattleMetrics o comprueba los permisos del token."
            );
        }

        throw error;
    }

    // Si el endpoint de coincidencia no devuelve perfiles, buscar
    // candidatos por nombre. Después solo pasan los que estén online
    // en un servidor WARDOG.
    if (ids.length === 0) {
        try {
            ids = await buscarIdsPorNombre(steam.nombre);
        } catch (error) {
            const status = error.response?.status;

            if (status === 401 || status === 403) {
                throw new Error(
                    "BattleMetrics no autorizó la búsqueda por nombre. Comprueba los permisos del token."
                );
            }

            throw error;
        }
    }

    if (ids.length === 0) {
        throw new Error(
            `BattleMetrics no devolvió perfiles para ${steam.nombre}.`
        );
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

    // El comando solo devuelve perfiles online en servidores WARDOG.
    return perfiles;
}

module.exports = {
    consultarWardog
};
