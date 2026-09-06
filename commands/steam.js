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
const STEAMID_IO_URL = "https://steamid.io/lookup";

const RESULTADOS_POR_PAGINA = 10;

const STEAMID64_MIN = 76561197960265728n;
const STEAMID64_MAX = 76561202255233023n;


// =====================================================
// STEAMID64
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

    serverId = String(serverId).trim();

    return serverId;
}


// =====================================================
// BUSCAR JUGADORES EN EL SERVIDOR DE BATTLEMETRICS
// =====================================================

async function buscarJugadoresBattleMetrics(
    serverId,
    nombreBuscado
) {
    console.log("");
    console.log("[STEAM] ========================================");
    console.log("[STEAM] BUSCANDO EN BATTLEMETRICS");
    console.log("[STEAM] ========================================");
    console.log(`[STEAM] Server ID: ${serverId}`);
    console.log(`[STEAM] Nombre: "${nombreBuscado}"`);

    const url =
        `${BATTLEMETRICS_API}/servers/${encodeURIComponent(serverId)}` +
        "?include=player,identifier";

    console.log(`[STEAM] URL: ${url}`);

    const response = await axios.get(url, {
        headers: getBattleMetricsHeaders(),
        timeout: 30000,
        validateStatus: () => true
    });

    console.log(
        `[STEAM] BattleMetrics HTTP: ${response.status}`
    );

    if (response.status < 200 || response.status >= 300) {
        let detalle = "";

        try {
            detalle = JSON.stringify(response.data);
        } catch {
            detalle = String(response.data || "");
        }

        console.error(
            `[STEAM] Error BattleMetrics: ${response.status}`
        );

        console.error(detalle.slice(0, 3000));

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

    const data = response.data?.data || null;
    const included = response.data?.included || [];

    console.log(
        `[STEAM] Recursos incluidos: ${included.length}`
    );

    if (!Array.isArray(included)) {
        console.log(
            "[STEAM] BattleMetrics no devolvió included."
        );

        return [];
    }

    const jugadores = included.filter(
        item => item?.type === "player"
    );

    console.log(
        `[STEAM] Players encontrados: ${jugadores.length}`
    );

    const buscado = normalizarNombre(nombreBuscado);

    const resultados = [];

    for (const jugador of jugadores) {
        const atributos = jugador.attributes || {};

        const nombre =
            atributos.name ||
            atributos.playerName ||
            "";

        if (!nombre) {
            continue;
        }

        if (normalizarNombre(nombre) !== buscado) {
            continue;
        }

        const playerId = String(
            jugador.id || ""
        ).trim();

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
// OBTENER IDENTIFICADORES DEL PLAYER
// =====================================================

async function obtenerIdentificadoresBattleMetrics(playerId) {
    console.log("");
    console.log(
        `[STEAM] Obteniendo identifiers de BM: ${playerId}`
    );

    const url =
        `${BATTLEMETRICS_API}/players/${encodeURIComponent(playerId)}` +
        "?include=identifier";

    console.log(`[STEAM] URL: ${url}`);

    const response = await axios.get(url, {
        headers: getBattleMetricsHeaders(),
        timeout: 30000,
        validateStatus: () => true
    });

    console.log(
        `[STEAM] Player HTTP: ${response.status}`
    );

    if (response.status < 200 || response.status >= 300) {
        let detalle = "";

        try {
            detalle = JSON.stringify(response.data);
        } catch {
            detalle = String(response.data || "");
        }

        console.error(
            `[STEAM] Error obteniendo player: ${response.status}`
        );

        console.error(detalle.slice(0, 3000));

        throw new Error(
            `BattleMetrics respondió HTTP ${response.status} al consultar el jugador.`
        );
    }

    const included = response.data?.included || [];

    console.log(
        `[STEAM] Identificadores recibidos: ${included.length}`
    );

    return included;
}


// =====================================================
// EXTRAER STEAMID64 DESDE BATTLEMETRICS
// =====================================================

function extraerSteamID64DeBattleMetrics(identificadores) {
    if (!Array.isArray(identificadores)) {
        return null;
    }

    for (const identificador of identificadores) {
        const atributos = identificador?.attributes || {};

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
// BUSCAR STEAMID64 EN STEAMID.IO
// =====================================================

async function buscarSteamIDIo(nombre) {
    console.log("");
    console.log("[STEAMID.IO] ========================================");
    console.log("[STEAMID.IO] BUSCANDO STEAMID64");
    console.log("[STEAMID.IO] ========================================");
    console.log(`[STEAMID.IO] Nombre: "${nombre}"`);

    const url =
        `${STEAMID_IO_URL}/${encodeURIComponent(nombre)}`;

    console.log(`[STEAMID.IO] URL: ${url}`);

    try {
        const response = await axios.get(url, {
            timeout: 30000,
            maxRedirects: 5,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                    "AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/150.0.0.0 Safari/537.36",

                Accept:
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

                "Accept-Language":
                    "en-US,en;q=0.9"
            },

            validateStatus: () => true
        });

        console.log(
            `[STEAMID.IO] HTTP: ${response.status}`
        );

        if (
            response.status < 200 ||
            response.status >= 300
        ) {
            console.log(
                `[STEAMID.IO] ⚠️ HTTP ${response.status}`
            );

            return null;
        }

        const html = String(
            response.data || ""
        );

        console.log(
            `[STEAMID.IO] HTML recibido: ${html.length} caracteres`
        );

        // =================================================
        // BUSCAR ENLACES /PROFILES/STEAMID64
        // =================================================

        const encontrados = [];

        const regexPerfil =
            /\/profiles\/(\d{17})/gi;

        let match;

        while (
            (match = regexPerfil.exec(html)) !== null
        ) {
            const steamId64 = match[1];

            if (!esSteamID64(steamId64)) {
                continue;
            }

            if (!encontrados.includes(steamId64)) {
                encontrados.push(steamId64);
            }
        }

        console.log(
            `[STEAMID.IO] SteamID64 encontrados en enlaces: ${encontrados.length}`
        );

        if (encontrados.length > 0) {
            console.log(
                `[STEAMID.IO] Resultado: ${encontrados[0]}`
            );

            return encontrados[0];
        }

        // =================================================
        // BUSCAR CUALQUIER STEAMID64 EN EL HTML
        // =================================================

        const regexID =
            /7656119\d{10}/g;

        const ids = html.match(regexID) || [];

        for (const id of ids) {
            if (esSteamID64(id)) {
                console.log(
                    `[STEAMID.IO] SteamID64 encontrado en HTML: ${id}`
                );

                return id;
            }
        }

        console.log(
            "[STEAMID.IO] ❌ No se encontró SteamID64."
        );

        return null;

    } catch (error) {
        console.error(
            "[STEAMID.IO] ❌ Error:"
        );

        console.error(
            error?.message || error
        );

        return null;
    }
}


// =====================================================
// OBTENER DATOS DEL STEAM WEB API
// =====================================================

async function obtenerDatosSteam(steamId64) {
    const apiKey = process.env.STEAM_API_KEY;

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

    const response = await axios.get(url, {
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
        if (response.status === 429) {
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
// FORMATEAR ESTADO STEAM
// =====================================================

function obtenerEstadoSteam(personaState) {
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
// FORMATEAR FECHA
// =====================================================

function formatearFechaUnix(timestamp) {
    if (!timestamp) {
        return "Desconocida";
    }

    const fecha = new Date(
        Number(timestamp) * 1000
    );

    if (Number.isNaN(fecha.getTime())) {
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
    const embed = new EmbedBuilder();

    embed.setTitle(
        `🎮 Steam — ${steam.personaname || jugadorBM.name}`
    );

    embed.setDescription(
        `**Perfil encontrado mediante BattleMetrics**`
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

    if (steam.profileurl) {
        embed.addFields({
            name: "🔗 Perfil",
            value: steam.profileurl,
            inline: false
        });
    }

    if (steam.avatarfull) {
        embed.setThumbnail(
            steam.avatarfull
        );
    }

    if (steam.avatarfull) {
        embed.setImage(
            steam.avatarfull
        );
    }

    embed.setFooter({
        text: "RustLogix • BattleMetrics + Steam"
    });

    embed.setTimestamp();

    return embed;
}


// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("steam")
        .setDescription(
            "Busca un jugador de Steam mediante BattleMetrics"
        )
        .addStringOption(option =>
            option
                .setName("nombre")
                .setDescription(
                    "Nombre exacto del jugador"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        console.log("");
        console.log("🎯 Ejecutando /steam");

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
            // =================================================
            // 1. OBTENER SERVER CONFIGURADO
            // =================================================

            const serverId =
                await obtenerServidorConfigurado(
                    interaction.guildId
                );

            console.log(
                `[STEAM] Servidor configurado: ${serverId}`
            );

            // =================================================
            // 2. BUSCAR NOMBRE EN BATTLEMETRICS
            // =================================================

            const jugadores =
                await buscarJugadoresBattleMetrics(
                    serverId,
                    nombre
                );

            if (jugadores.length === 0) {
                return interaction.editReply({
                    content:
                        `❌ No encontré un jugador llamado exactamente \`${nombre}\` en el servidor de BattleMetrics configurado.`
                });
            }

            // =================================================
            // 3. PROCESAR EL PRIMER MATCH
            // =================================================

            const jugadorBM =
                jugadores[0];

            console.log("");
            console.log(
                `[STEAM] Jugador BM seleccionado: ${jugadorBM.id} | ${jugadorBM.name}`
            );

            // =================================================
            // 4. INTENTAR SACAR STEAMID64 DESDE BM
            // =================================================

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
                    error?.message || error
                );
            }

            // =================================================
            // 5. SI BM NO LO TIENE → STEAMID.IO
            // =================================================

            if (!steamId64) {
                console.log("");
                console.log(
                    "[STEAM] BM no tiene SteamID64."
                );

                console.log(
                    "[STEAM] Probando SteamID I/O..."
                );

                steamId64 =
                    await buscarSteamIDIo(
                        jugadorBM.name
                    );
            }

            // =================================================
            // 6. NO ENCONTRADO
            // =================================================

            if (!steamId64) {
                console.log("");
                console.log(
                    "[STEAM] ❌ No se pudo obtener SteamID64."
                );

                return interaction.editReply({
                    content:
                        `❌ Encontré a **${jugadorBM.name}** en BattleMetrics, pero no pude obtener su SteamID64 mediante SteamID I/O.`
                });
            }

            console.log("");
            console.log(
                `[STEAM] ✅ SteamID64 final: ${steamId64}`
            );

            // =================================================
            // 7. STEAM WEB API
            // =================================================

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

            // =================================================
            // 8. CREAR EMBED
            // =================================================

            const embed =
                crearEmbed(
                    jugadorBM,
                    steamId64,
                    steam
                );

            // =================================================
            // 9. BOTÓN
            // =================================================

            const row =
                new ActionRowBuilder();

            if (steam.profileurl) {
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

            // =================================================
            // 10. RESPONDER
            // =================================================

            const respuesta = {
                embeds: [embed]
            };

            if (row.components.length > 0) {
                respuesta.components = [row];
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
                error?.message || error
            );
            console.error("");

            const mensaje =
                error?.message ||
                "Ocurrió un error inesperado.";

            try {
                await interaction.editReply({
                    content:
                        `❌ ${mensaje}`
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