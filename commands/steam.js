const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const axios = require("axios");
const ServerConfig = require("../models/ServerConfig");

const BATTLEMETRICS_API = "https://api.battlemetrics.com";
const STEAM_API = "https://api.steampowered.com";
const STEAMWEBAPI_API = "https://www.steamwebapi.com";

const STEAMID64_MIN = 76561197960265728n;
const STEAMID64_MAX = 76561202255233023n;


// =====================================================
// COMPROBAR STEAMID64
// =====================================================

function esSteamID64(valor) {
    if (valor === null || valor === undefined) {
        return false;
    }

    const texto = String(valor).trim();

    if (!/^\d{17}$/.test(texto)) {
        return false;
    }

    try {
        const numero = BigInt(texto);

        return (
            numero >= STEAMID64_MIN &&
            numero <= STEAMID64_MAX
        );
    } catch {
        return false;
    }
}


// =====================================================
// NORMALIZAR NOMBRE
// =====================================================

function normalizarNombre(nombre) {
    return String(nombre || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}


// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getBattleMetricsHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    if (!token) {
        throw new Error(
            "Falta la variable de entorno BATTLEMETRICS_TOKEN."
        );
    }

    return {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        "User-Agent": "RustLogix/1.0"
    };
}


// =====================================================
// OBTENER SERVIDOR CONFIGURADO
// =====================================================

async function obtenerServidorConfigurado(guildId) {
    const config = await ServerConfig.findOne({
        guildId
    });

    if (!config) {
        throw new Error(
            "Este servidor de Discord no tiene una configuración de BattleMetrics."
        );
    }

    let serverId =
        config.serverId ||
        config.battlemetricsServerId ||
        config.battleMetricsServerId;

    if (!serverId) {
        throw new Error(
            "No hay un BattleMetrics Server ID configurado."
        );
    }

    return String(serverId).trim();
}


// =====================================================
// BUSCAR JUGADOR EN BATTLEMETRICS
// =====================================================

async function buscarJugadoresBattleMetrics(
    serverId,
    nombreBuscado
) {
    console.log("");
    console.log("[STEAM] ========================================");
    console.log("[STEAM] BUSCANDO EN BATTLEMETRICS");
    console.log("[STEAM] ========================================");

    console.log(
        `[STEAM] Server ID: ${serverId}`
    );

    console.log(
        `[STEAM] Nombre: "${nombreBuscado}"`
    );

    const url =
        `${BATTLEMETRICS_API}/servers/${encodeURIComponent(serverId)}` +
        "?include=player,identifier";

    console.log(
        `[STEAM] URL: ${url}`
    );

    const response = await axios.get(url, {
        headers: getBattleMetricsHeaders(),
        timeout: 30000,
        validateStatus: () => true
    });

    console.log(
        `[STEAM] BattleMetrics HTTP: ${response.status}`
    );

    if (
        response.status < 200 ||
        response.status >= 300
    ) {
        let detalle = "";

        try {
            detalle = JSON.stringify(response.data);
        } catch {
            detalle = String(response.data || "");
        }

        console.error(
            `[STEAM] Error BattleMetrics: ${response.status}`
        );

        console.error(
            detalle.slice(0, 3000)
        );

        if (response.status === 401) {
            throw new Error(
                "BattleMetrics rechazó el token (401). Revisa BATTLEMETRICS_TOKEN."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "BattleMetrics rechazó el acceso (403). Revisa los permisos del token."
            );
        }

        throw new Error(
            `BattleMetrics respondió HTTP ${response.status}.`
        );
    }

    const included =
        response.data?.included || [];

    console.log(
        `[STEAM] Recursos incluidos: ${included.length}`
    );

    if (!Array.isArray(included)) {
        return [];
    }

    const jugadores =
        included.filter(
            item => item?.type === "player"
        );

    console.log(
        `[STEAM] Players encontrados: ${jugadores.length}`
    );

    const buscado =
        normalizarNombre(nombreBuscado);

    const resultados = [];

    for (const jugador of jugadores) {
        const atributos =
            jugador.attributes || {};

        const nombre =
            atributos.name ||
            atributos.playerName ||
            "";

        if (!nombre) {
            continue;
        }

        if (
            normalizarNombre(nombre) !==
            buscado
        ) {
            continue;
        }

        const playerId =
            String(jugador.id || "").trim();

        if (!playerId) {
            continue;
        }

        resultados.push({
            id: playerId,
            name: nombre,
            attributes: atributos
        });
    }

    console.log(
        `[STEAM] Coincidencias exactas: ${resultados.length}`
    );

    for (const jugador of resultados) {
        console.log(
            `[STEAM] MATCH: ${jugador.id} | ${jugador.name}`
        );
    }

    return resultados;
}


// =====================================================
// OBTENER IDENTIFICADORES DE BATTLEMETRICS
// =====================================================

async function obtenerIdentificadoresBattleMetrics(
    playerId
) {
    console.log("");
    console.log(
        `[STEAM] Obteniendo identifiers de BM: ${playerId}`
    );

    const url =
        `${BATTLEMETRICS_API}/players/${encodeURIComponent(playerId)}` +
        "?include=identifier";

    console.log(
        `[STEAM] URL: ${url}`
    );

    const response = await axios.get(url, {
        headers: getBattleMetricsHeaders(),
        timeout: 30000,
        validateStatus: () => true
    });

    console.log(
        `[STEAM] Player HTTP: ${response.status}`
    );

    if (
        response.status < 200 ||
        response.status >= 300
    ) {
        throw new Error(
            `BattleMetrics respondió HTTP ${response.status} al consultar el jugador.`
        );
    }

    const included =
        response.data?.included || [];

    console.log(
        `[STEAM] Identificadores recibidos: ${included.length}`
    );

    return included;
}


// =====================================================
// EXTRAER STEAMID64 DESDE BATTLEMETRICS
// =====================================================

function extraerSteamID64DeBattleMetrics(
    identificadores
) {
    if (!Array.isArray(identificadores)) {
        return null;
    }

    for (const identificador of identificadores) {
        const atributos =
            identificador?.attributes || {};

        const posiblesValores = [
            atributos.identifier,
            atributos.value,
            atributos.name,
            identificador?.id
        ];

        for (const valor of posiblesValores) {
            if (esSteamID64(valor)) {
                console.log(
                    `[STEAM] SteamID64 encontrado directamente en BM: ${valor}`
                );

                return String(valor).trim();
            }
        }
    }

    return null;
}


// =====================================================
// STEAMWEBAPI
// BUSCAR PERFIL POR NOMBRE
// =====================================================

async function buscarSteamWebAPI(nombre) {
    const apiKey =
        process.env.STEAMWEBAPI_KEY;

    if (!apiKey) {
        throw new Error(
            "Falta la variable de entorno STEAMWEBAPI_KEY."
        );
    }

    console.log("");
    console.log("[STEAMWEBAPI] ========================================");
    console.log("[STEAMWEBAPI] BUSCANDO PERFIL");
    console.log("[STEAMWEBAPI] ========================================");

    console.log(
        `[STEAMWEBAPI] Nombre: "${nombre}"`
    );

    const url =
        `${STEAMWEBAPI_API}/steam/api/profile`;

    console.log(
        `[STEAMWEBAPI] URL: ${url}?id=${encodeURIComponent(nombre)}`
    );

    const response = await axios.get(url, {
        params: {
            id: nombre,
            state: "minimal",
            production: "1"
        },

        headers: {
            "X-Api-Key": apiKey,
            Accept: "application/json"
        },

        timeout: 30000,

        validateStatus: () => true
    });

    console.log(
        `[STEAMWEBAPI] HTTP: ${response.status}`
    );

    if (
        response.status < 200 ||
        response.status >= 300
    ) {
        let detalle = "";

        try {
            detalle =
                JSON.stringify(response.data);
        } catch {
            detalle =
                String(response.data || "");
        }

        console.error(
            `[STEAMWEBAPI] Error HTTP ${response.status}`
        );

        console.error(
            detalle.slice(0, 3000)
        );

        if (response.status === 401) {
            throw new Error(
                "SteamWebAPI rechazó la clave (401). Revisa STEAMWEBAPI_KEY."
            );
        }

        if (response.status === 403) {
            throw new Error(
                "SteamWebAPI rechazó el acceso (403). Revisa tu API key o plan."
            );
        }

        if (response.status === 429) {
            throw new Error(
                "SteamWebAPI alcanzó el límite de solicitudes (429)."
            );
        }

        if (response.status === 404) {
            return null;
        }

        throw new Error(
            `SteamWebAPI respondió HTTP ${response.status}.`
        );
    }

    const data =
        response.data;

    console.log(
        "[STEAMWEBAPI] Respuesta recibida."
    );

    // ================================================
    // LA API PUEDE DEVOLVER EL PERFIL DIRECTAMENTE
    // ================================================

    let perfil = data;

    // ================================================
    // ALGUNAS RESPUESTAS PUEDEN VENIR ENVUELTAS
    // ================================================

    if (
        data?.data &&
        typeof data.data === "object"
    ) {
        perfil = data.data;
    }

    if (
        data?.response?.players &&
        Array.isArray(
            data.response.players
        )
    ) {
        perfil =
            data.response.players[0];
    }

    if (
        data?.players &&
        Array.isArray(data.players)
    ) {
        perfil =
            data.players[0];
    }

    if (
        !perfil ||
        typeof perfil !== "object"
    ) {
        console.log(
            "[STEAMWEBAPI] ❌ Respuesta sin perfil."
        );

        return null;
    }

    // ================================================
    // BUSCAR STEAMID64 EN POSIBLES CAMPOS
    // ================================================

    const posiblesSteamIDs = [
        perfil.steamid,
        perfil.steamid64,
        perfil.steam_id,
        perfil.steam_id64,
        perfil.id
    ];

    let steamId64 = null;

    for (
        const posible of posiblesSteamIDs
    ) {
        if (
            esSteamID64(posible)
        ) {
            steamId64 =
                String(posible).trim();

            break;
        }
    }

    if (!steamId64) {
        console.log(
            "[STEAMWEBAPI] ❌ La respuesta no contiene un SteamID64 válido."
        );

        console.log(
            JSON.stringify(
                perfil
            ).slice(0, 5000)
        );

        return null;
    }

    console.log(
        `[STEAMWEBAPI] ✅ SteamID64: ${steamId64}`
    );

    return {
        steamId64,
        personaname:
            perfil.personaname ||
            perfil.persona_name ||
            perfil.name ||
            nombre,

        accountname:
            perfil.accountname ||
            perfil.account_name ||
            "",

        profileurl:
            perfil.profileurl ||
            perfil.profile_url ||
            perfil.profilesteamurl ||
            "",

        avatar:
            perfil.avatar ||
            perfil.avatarhash ||
            perfil.avatarmedium ||
            "",

        avatarmedium:
            perfil.avatarmedium ||
            perfil.avatar_medium ||
            perfil.avatar ||
            "",

        avatarfull:
            perfil.avatarfull ||
            perfil.avatar_full ||
            perfil.avatar ||
            "",

        personastate:
            perfil.personastate ??
            perfil.persona_state ??
            perfil.onlinestate ??
            0,

        timecreated:
            perfil.timecreated ||
            perfil.time_created ||
            perfil.accountcreated ||
            null,

        visibility:
            perfil.communityvisibilitystate ||
            perfil.visibility ||
            null,

        realname:
            perfil.realname ||
            perfil.real_name ||
            "",

        country:
            perfil.loccountrycode ||
            perfil.country ||
            ""
    };
}


// =====================================================
// STEAM WEB API OFICIAL
// OBTENER PERFIL FINAL
// =====================================================

async function obtenerDatosSteam(
    steamId64
) {
    const apiKey =
        process.env.STEAM_API_KEY;

    if (!apiKey) {
        throw new Error(
            "Falta la variable de entorno STEAM_API_KEY."
        );
    }

    console.log("");
    console.log(
        `[STEAM API] Obteniendo perfil: ${steamId64}`
    );

    const url =
        `${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`;

    const response =
        await axios.get(url, {
            params: {
                key: apiKey,
                steamids: steamId64
            },

            timeout: 30000,

            validateStatus: () => true
        });

    console.log(
        `[STEAM API] HTTP: ${response.status}`
    );

    if (
        response.status < 200 ||
        response.status >= 300
    ) {
        if (
            response.status === 429
        ) {
            throw new Error(
                "Steam API respondió 429. Intenta nuevamente más tarde."
            );
        }

        throw new Error(
            `Steam API respondió HTTP ${response.status}.`
        );
    }

    const players =
        response.data?.response?.players;

    if (
        !Array.isArray(players) ||
        players.length === 0
    ) {
        console.log(
            "[STEAM API] ❌ No devolvió el perfil."
        );

        return null;
    }

    return players[0];
}


// =====================================================
// ESTADO STEAM
// =====================================================

function obtenerEstadoSteam(
    personaState
) {
    switch (Number(personaState)) {
        case 0:
            return "⚫ Desconectado";

        case 1:
            return "🟢 En línea";

        case 2:
            return "🔴 Ocupado";

        case 3:
            return "🟡 Ausente";

        case 4:
            return "🟣 Durmiendo";

        case 5:
            return "🟠 Buscando intercambio";

        case 6:
            return "🔵 Buscando jugar";

        default:
            return "⚫ Desconocido";
    }
}


// =====================================================
// FECHA UNIX
// =====================================================

function formatearFechaUnix(
    timestamp
) {
    if (!timestamp) {
        return "Desconocida";
    }

    const fecha =
        new Date(
            Number(timestamp) * 1000
        );

    if (
        Number.isNaN(
            fecha.getTime()
        )
    ) {
        return "Desconocida";
    }

    return `<t:${Math.floor(
        fecha.getTime() / 1000
    )}:D>`;
}


// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    jugadorBM,
    steamId64,
    steam
) {
    const embed =
        new EmbedBuilder();

    embed.setTitle(
        `🎮 Steam — ${
            steam.personaname ||
            jugadorBM.name
        }`
    );

    embed.setDescription(
        "**Perfil encontrado mediante BattleMetrics + SteamWebAPI**"
    );

    embed.addFields(
        {
            name: "👤 Nombre Steam",
            value:
                steam.personaname ||
                jugadorBM.name ||
                "Desconocido",
            inline: true
        },

        {
            name: "🆔 SteamID64",
            value:
                `\`${steamId64}\``,
            inline: true
        },

        {
            name: "📡 Estado",
            value:
                obtenerEstadoSteam(
                    steam.personastate
                ),
            inline: true
        },

        {
            name: "📅 Cuenta creada",
            value:
                formatearFechaUnix(
                    steam.timecreated
                ),
            inline: true
        },

        {
            name: "🔎 BattleMetrics",
            value:
                jugadorBM.name ||
                "Desconocido",
            inline: true
        }
    );

    if (
        steam.profileurl
    ) {
        embed.addFields({
            name: "🔗 Perfil",
            value:
                steam.profileurl,
            inline: false
        });
    }

    if (
        steam.avatarfull
    ) {
        embed.setThumbnail(
            steam.avatarfull
        );

        embed.setImage(
            steam.avatarfull
        );
    }

    embed.setFooter({
        text:
            "RustLogix • BattleMetrics + Steam"
    });

    embed.setTimestamp();

    return embed;
}


// =====================================================
// COMANDO /STEAM
// =====================================================

module.exports = {
    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un jugador de Steam mediante BattleMetrics"
            )
            .addStringOption(
                option =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre exacto del jugador"
                        )
                        .setRequired(true)
            ),

    async execute(
        interaction
    ) {
        console.log("");
        console.log(
            "🎯 Ejecutando /steam"
        );

        const nombre =
            interaction.options.getString(
                "nombre",
                true
            ).trim();

        if (!nombre) {
            return interaction.reply({
                content:
                    "❌ Debes indicar un nombre.",
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            // =========================================
            // 1. SERVIDOR CONFIGURADO
            // =========================================

            const serverId =
                await obtenerServidorConfigurado(
                    interaction.guildId
                );

            console.log(
                `[STEAM] Servidor configurado: ${serverId}`
            );

            // =========================================
            // 2. BUSCAR EN BATTLEMETRICS
            // =========================================

            const jugadores =
                await buscarJugadoresBattleMetrics(
                    serverId,
                    nombre
                );

            if (
                jugadores.length === 0
            ) {
                return interaction.editReply({
                    content:
                        `❌ No encontré un jugador llamado exactamente \`${nombre}\` en el servidor de BattleMetrics configurado.`
                });
            }

            const jugadorBM =
                jugadores[0];

            console.log("");
            console.log(
                `[STEAM] Jugador BM seleccionado: ${jugadorBM.id} | ${jugadorBM.name}`
            );

            // =========================================
            // 3. INTENTAR OBTENER STEAMID64 DESDE BM
            // =========================================

            let steamId64 = null;

            try {
                const identifiers =
                    await obtenerIdentificadoresBattleMetrics(
                        jugadorBM.id
                    );

                steamId64 =
                    extraerSteamID64DeBattleMetrics(
                        identifiers
                    );
            } catch (error) {
                console.error(
                    "[STEAM] Error obteniendo identifiers:"
                );

                console.error(
                    error?.message ||
                    error
                );
            }

            // =========================================
            // 4. SI BM NO LO TIENE → STEAMWEBAPI
            // =========================================

            let steamWebProfile = null;

            if (!steamId64) {
                console.log("");
                console.log(
                    "[STEAM] BM no tiene SteamID64."
                );

                console.log(
                    "[STEAM] Probando SteamWebAPI..."
                );

                steamWebProfile =
                    await buscarSteamWebAPI(
                        jugadorBM.name
                    );

                if (
                    steamWebProfile
                ) {
                    steamId64 =
                        steamWebProfile.steamId64;
                }
            }

            // =========================================
            // 5. NO ENCONTRADO
            // =========================================

            if (!steamId64) {
                console.log("");
                console.log(
                    "[STEAM] ❌ No se pudo obtener SteamID64."
                );

                return interaction.editReply({
                    content:
                        `❌ Encontré a **${jugadorBM.name}** en BattleMetrics, pero no pude resolver su SteamID64 mediante SteamWebAPI.`
                });
            }

            console.log("");
            console.log(
                `[STEAM] ✅ SteamID64 final: ${steamId64}`
            );

            // =========================================
            // 6. STEAM WEB API
            // =========================================

            const steam =
                await obtenerDatosSteam(
                    steamId64
                );

            if (!steam) {
                return interaction.editReply({
                    content:
                        `⚠️ Encontré el SteamID64 \`${steamId64}\`, pero Steam no devolvió información pública para ese perfil.`
                });
            }

            console.log("");
            console.log(
                `[STEAM] ✅ Perfil obtenido: ${steam.personaname}`
            );

            // =========================================
            // 7. CREAR EMBED
            // =========================================

            const embed =
                crearEmbed(
                    jugadorBM,
                    steamId64,
                    steam
                );

            // =========================================
            // 8. BOTÓN STEAM
            // =========================================

            const row =
                new ActionRowBuilder();

            if (
                steam.profileurl
            ) {
                row.addComponents(
                    new ButtonBuilder()
                        .setLabel(
                            "Ver perfil de Steam"
                        )
                        .setStyle(
                            ButtonStyle.Link
                        )
                        .setURL(
                            steam.profileurl
                        )
                        .setEmoji("🎮")
                );
            }

            // =========================================
            // 9. RESPONDER
            // =========================================

            const respuesta = {
                embeds: [embed]
            };

            if (
                row.components.length > 0
            ) {
                respuesta.components = [
                    row
                ];
            }

            await interaction.editReply(
                respuesta
            );

            console.log("");
            console.log(
                "✅ /steam terminado"
            );
            console.log("");

        } catch (error) {
            console.error("");
            console.error(
                "❌ ERROR /steam:"
            );

            console.error(
                error?.message ||
                error
            );

            console.error("");

            try {
                await interaction.editReply({
                    content:
                        `❌ ${
                            error?.message ||
                            "Ocurrió un error inesperado."
                        }`
                });
            } catch (replyError) {
                console.error(
                    "❌ No se pudo editar la respuesta:",
                    replyError
                );
            }
        }
    }
};