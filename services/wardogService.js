const axios = require("axios");

const {
    getBattleMetricsHoursBm,
    formatearDuracion
} = require("./battlemetricsHoursBm");

const API_BM = "https://api.battlemetrics.com";
const API_STEAM =
    "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/";

function extraerEntrada(entrada) {
    const texto = String(entrada || "").trim();

    // SteamID64 escrito directamente.
    if (/^\d{17}$/.test(texto)) {
        return { tipo: "steam", id: texto };
    }

    // ID o enlace de perfil de BattleMetrics.
    const bm = texto.match(
        /(?:https?:\/\/)?(?:www\.)?battlemetrics\.com\/players\/(\d+)/i
    );

    if (bm) {
        return { tipo: "battlemetrics", id: bm[1] };
    }

    // Perfil Steam por SteamID64.
    const steam = texto.match(
        /steamcommunity\.com\/profiles\/(\d{17})/i
    );

    if (steam) {
        return { tipo: "steam", id: steam[1] };
    }

    // Perfil Steam con URL personalizada /id/nombre.
    const vanity = texto.match(
        /steamcommunity\.com\/id\/([^/?#]+)/i
    );

    if (vanity) {
        return { tipo: "vanity", id: vanity[1] };
    }

    return null;
}

async function resolverVanitySteam(vanity) {
    const apiKey = process.env.STEAM_API_KEY;

    if (!apiKey) {
        throw new Error(
            "Falta la variable STEAM_API_KEY para resolver el perfil personalizado de Steam."
        );
    }

    const response = await axios.get(API_STEAM, {
        params: {
            key: apiKey,
            vanityurl: vanity
        },
        timeout: 15000
    });

    const resultado = response.data?.response;

    if (
        Number(resultado?.success) !== 1 ||
        !/^\d{17}$/.test(String(resultado?.steamid || ""))
    ) {
        throw new Error(
            "No se pudo encontrar ese perfil personalizado de Steam."
        );
    }

    return String(resultado.steamid);
}

async function buscarBattleMetricsPorSteam(steamId) {
    const token = process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error(
            "Falta la variable BATTLEMETRICS_TOKEN."
        );
    }

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
                Accept: "application/json",
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`
            },
            timeout: 20000
        }
    );

    const coincidencias = Array.isArray(response.data?.data)
        ? response.data.data
        : [];

    const ids = [
        ...new Set(
            coincidencias
                .map(item => item?.relationships?.player?.data?.id)
                .filter(id => /^\d+$/.test(String(id || "")))
                .map(String)
        )
    ];

    if (!ids.length) {
        throw new Error(
            "BattleMetrics no encontró un perfil asociado a ese SteamID. Comprueba el ID y los permisos de tu API."
        );
    }

    // Si BattleMetrics devuelve perfiles duplicados, consultamos el primero.
    return ids[0];
}

async function consultarWardog(entrada) {
    const identificador = extraerEntrada(entrada);

    if (!identificador) {
        throw new Error(
            "Formato no válido. Usa un SteamID64, un enlace de perfil Steam o un enlace de BattleMetrics."
        );
    }

    let playerId;

    if (identificador.tipo === "battlemetrics") {
        playerId = identificador.id;
    } else {
        const steamId = identificador.tipo === "vanity"
            ? await resolverVanitySteam(identificador.id)
            : identificador.id;

        playerId = await buscarBattleMetricsPorSteam(steamId);
    }

    const datos = await getBattleMetricsHoursBm(playerId);

    if (!datos) {
        throw new Error(
            "BattleMetrics no devolvió datos para ese jugador."
        );
    }

    const servidorActual = datos.servidorActualRust || null;

    let horasServidor = null;
    let fuenteHoras = "No disponibles";

    if (servidorActual) {
        const servidores = Array.isArray(datos.servidoresEncontrados)
            ? datos.servidoresEncontrados
            : [];

        const estadistica = servidores.find(
            servidor =>
                String(servidor.id) === String(servidorActual.id)
        );

        if (
            estadistica &&
            Number.isFinite(Number(estadistica.segundos)) &&
            Number(estadistica.segundos) > 0
        ) {
            horasServidor = estadistica.tiempo ||
                formatearDuracion(estadistica.segundos);

            fuenteHoras = "Historial de BattleMetrics";
        } else if (
            Number.isFinite(Number(datos.duracionSesionSegundos)) &&
            datos.duracionSesionSegundos > 0
        ) {
            horasServidor = formatearDuracion(
                datos.duracionSesionSegundos
            );

            fuenteHoras = "Solo la sesión actual";
        }
    }

    return {
        playerId,
        nombre: datos.nombre || `Jugador ${playerId}`,
        estado: datos.estado || "desconocido",
        servidorActual,
        duracionSesionSegundos: datos.duracionSesionSegundos,
        horasServidor,
        fuenteHoras,
        urlBattleMetrics:
            `https://www.battlemetrics.com/players/${playerId}`
    };
}

module.exports = {
    consultarWardog
};