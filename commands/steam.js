const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const { getSteamIDData } = require("../services/steamid");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BATTLEMETRICS_API =
    "https://api.battlemetrics.com";

const STEAM_SUMMARIES_API =
    "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/";

const BATTLEMETRICS_SERVER_ID =
    process.env.BATTLEMETRICS_SERVER_ID || "11378166";

const BATTLEMETRICS_TOKEN =
    process.env.BATTLEMETRICS_TOKEN;

const STEAMWEBAPI_KEY =
    process.env.STEAMWEBAPI_KEY;

// =====================================================
// UTILIDADES
// =====================================================

function normalizarNombre(nombre) {
    return String(nombre || "")
        .trim()
        .toLowerCase();
}

function limpiarTexto(texto) {
    return String(texto || "")
        .replace(/`/g, "'")
        .trim();
}

function valorSeguro(valor, defecto = "0") {
    if (
        valor === undefined ||
        valor === null ||
        valor === ""
    ) {
        return defecto;
    }

    return String(valor);
}

function siOno(valor) {
    return String(valor) === "1"
        ? "Sí"
        : "No";
}

function formatearNumero(valor) {
    const numero = Number(valor);

    if (Number.isNaN(numero)) {
        return valorSeguro(valor);
    }

    return numero.toLocaleString("es-ES");
}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function buscarEnBattleMetrics(nombre) {

    if (!BATTLEMETRICS_TOKEN) {
        throw new Error(
            "Falta BATTLEMETRICS_TOKEN en las variables de entorno."
        );
    }

    console.log(
        "=============================================="
    );

    console.log(
        `[BM] BUSCANDO NOMBRE EXACTO: "${nombre}"`
    );

    console.log(
        `[BM] SERVIDOR: ${BATTLEMETRICS_SERVER_ID}`
    );

    console.log(
        "=============================================="
    );

    const response = await axios.get(
        `${BATTLEMETRICS_API}/servers/${BATTLEMETRICS_SERVER_ID}`,
        {
            params: {
                include: "player,identifier",
                "page[size]": 1000
            },

            headers: {
                Authorization:
                    `Bearer ${BATTLEMETRICS_TOKEN}`,

                Accept:
                    "application/json"
            },

            timeout: 30000
        }
    );

    const body = response.data;

    const included =
        Array.isArray(body?.included)
            ? body.included
            : [];

    console.log(
        `[BM] Recursos incluidos: ${included.length}`
    );

    const jugadores =
        included.filter(
            recurso =>
                recurso &&
                recurso.type === "player"
        );

    console.log(
        `[BM] Jugadores encontrados: ${jugadores.length}`
    );

    const nombreBuscado =
        normalizarNombre(nombre);

    const coincidencias =
        jugadores.filter(
            jugador => {

                const nombreBM =
                    jugador?.attributes?.name;

                return (
                    normalizarNombre(nombreBM) ===
                    nombreBuscado
                );
            }
        );

    console.log(
        `[BM] Coincidencias exactas: ${coincidencias.length}`
    );

    // =================================================
    // EXTRAER STEAMID64
    // =================================================

    const resultados = [];

    for (
        const jugador
        of coincidencias
    ) {

        const playerId =
            String(jugador.id);

        const nombreBM =
            jugador?.attributes?.name ||
            nombre;

        let steamID64 = null;

        // -------------------------------------------------
        // BUSCAR IDENTIFIERS RELACIONADOS CON EL PLAYER
        // -------------------------------------------------

        const identifiers =
            included.filter(
                recurso => {

                    if (
                        recurso?.type !==
                        "identifier"
                    ) {
                        return false;
                    }

                    const playerRelation =
                        recurso?.relationships
                            ?.player
                            ?.data
                            ?.id;

                    return (
                        String(playerRelation) ===
                        playerId
                    );
                }
            );

        console.log(
            `[BM] ${nombreBM} (${playerId}) -> ` +
            `${identifiers.length} identifiers`
        );

        for (
            const identifier
            of identifiers
        ) {

            const posiblesValores = [
                identifier?.attributes?.identifier,
                identifier?.attributes?.value,
                identifier?.attributes?.name,
                identifier?.id
            ];

            for (
                const valor
                of posiblesValores
            ) {

                if (!valor) {
                    continue;
                }

                const texto =
                    String(valor).trim();

                // SteamID64 = 17 dígitos
                if (
                    /^\d{17}$/.test(texto)
                ) {

                    steamID64 =
                        texto;

                    break;
                }
            }

            if (steamID64) {
                break;
            }
        }

        // -------------------------------------------------
        // SEGUNDA COMPROBACIÓN:
        // BUSCAR UN STEAMID64 DENTRO DEL RECURSO DEL PLAYER
        // -------------------------------------------------

        if (!steamID64) {

            const textoPlayer =
                JSON.stringify(
                    jugador
                );

            const encontrados =
                textoPlayer.match(
                    /\b\d{17}\b/g
                );

            if (
                encontrados &&
                encontrados.length
            ) {

                steamID64 =
                    encontrados[0];
            }
        }

        console.log(
            `[BM] ${nombreBM} -> SteamID64: ` +
            `${steamID64 || "NO ENCONTRADO"}`
        );

        resultados.push({
            battlemetricsId:
                playerId,

            nombre:
                nombreBM,

            steamID64
        });
    }

    return resultados;
}

// =====================================================
// STEAM WEB API
// SOLO PARA AVATAR/NOMBRE ACTUAL
// NO PARA BUSCAR POR NOMBRE
// =====================================================

async function obtenerDatosSteam(
    steamIDs
) {

    const resultado =
        new Map();

    if (
        !STEAMWEBAPI_KEY ||
        !steamIDs.length
    ) {
        return resultado;
    }

    try {

        console.log(
            `[STEAM] Obteniendo avatares de ${steamIDs.length} perfiles...`
        );

        const response =
            await axios.get(
                STEAM_SUMMARIES_API,
                {
                    params: {
                        key:
                            STEAMWEBAPI_KEY,

                        steamids:
                            steamIDs.join(",")
                    },

                    timeout: 20000
                }
            );

        const players =
            response?.data
                ?.response
                ?.players;

        if (
            !Array.isArray(players)
        ) {
            return resultado;
        }

        for (
            const player
            of players
        ) {

            if (
                player?.steamid
            ) {

                resultado.set(
                    String(player.steamid),
                    player
                );
            }
        }

        console.log(
            `[STEAM] Avatares obtenidos: ${resultado.size}`
        );

    } catch (error) {

        console.error(
            "[STEAM] Error obteniendo avatares:",
            error.response?.status ||
            error.message
        );
    }

    return resultado;
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(
    resultado,
    steamData,
    steamProfile
) {

    const perfil =
        steamData?.profile || {};

    const bans =
        steamData?.profile_bans || {};

    const datos =
        steamData?.steamid_data || {};

    const watch =
        steamData?.custom_watch_list || {};

    const steamID64 =
        perfil.steamid64 ||
        resultado.steamID64;

    const nombreSteam =
        limpiarTexto(
            steamProfile?.personaname ||
            resultado.nombre ||
            "Steam"
        );

    const avatar =
        steamProfile?.avatarfull ||
        steamProfile?.avatarmedium ||
        steamProfile?.avatar;

    const steamProfileURL =
        steamProfile?.profileurl ||
        `https://steamcommunity.com/profiles/${steamID64}`;

    const steamIDUkURL =
        perfil.steamidurl ||
        `https://steamid.uk/profile/${steamID64}`;

    const embed =
        new EmbedBuilder()
            .setTitle(
                `🎮 ${nombreSteam}`
            )
            .setURL(
                steamProfileURL
            )
            .setColor(
                "#57F287"
            );

    if (avatar) {
        embed.setThumbnail(
            avatar
        );
    }

    embed.addFields(
        {
            name: "🆔 SteamID64",
            value:
                `\`${steamID64}\``,
            inline: false
        },

        {
            name: "Steam2",
            value:
                `\`${valorSeguro(
                    perfil.steamid,
                    "No disponible"
                )}\``,
            inline: true
        },

        {
            name: "Steam3",
            value:
                `\`${valorSeguro(
                    perfil.steam3,
                    "No disponible"
                )}\``,
            inline: true
        },

        {
            name: "CSGO Friend ID",
            value:
                `\`${valorSeguro(
                    perfil.csgofriend,
                    "No disponible"
                )}\``,
            inline: true
        },

        {
            name: "🛡️ VAC",
            value:
                siOno(
                    bans.vac
                ),
            inline: true
        },

        {
            name: "🎮 Game Bans",
            value:
                formatearNumero(
                    bans.amount_game_bans
                ),
            inline: true
        },

        {
            name: "🔄 Trade Ban",
            value:
                siOno(
                    bans.tradeban
                ),
            inline: true
        },

        {
            name: "👥 Community Ban",
            value:
                siOno(
                    bans.communityban
                ),
            inline: true
        },

        {
            name: "🆔 SteamID Ban",
            value:
                siOno(
                    bans.steamid_ban
                ),
            inline: true
        },

        {
            name: "🚨 RustHackReport",
            value:
                siOno(
                    bans.rusthackreport
                ),
            inline: true
        },

        {
            name: "👥 Amigos",
            value:
                formatearNumero(
                    datos.friend_count
                ),
            inline: true
        },

        {
            name: "📜 Historial de nombres",
            value:
                formatearNumero(
                    datos.name_history_count
                ),
            inline: true
        },

        {
            name: "🚫 Amigos VAC",
            value:
                formatearNumero(
                    datos.vac_banned_friends
                ),
            inline: true
        },

        {
            name: "🚫 Amigos Game Ban",
            value:
                formatearNumero(
                    datos.game_banned_friends
                ),
            inline: true
        },

        {
            name: "🚫 Amigos Community Ban",
            value:
                formatearNumero(
                    datos.community_banned_friends
                ),
            inline: true
        },

        {
            name: "🚫 Amigos Trade Ban",
            value:
                formatearNumero(
                    datos.trade_banned_friends
                ),
            inline: true
        }
    );

    if (
        bans.rusthackreport === "1" &&
        bans.rusthackreport_url
    ) {

        embed.addFields({
            name:
                "🔗 RustHackReport",
            value:
                `[Ver reporte](${bans.rusthackreport_url})`,
            inline: false
        });
    }

    if (
        watch.watch_result === "1"
    ) {

        embed.addFields({
            name:
                "👁️ Watch List",
            value:
                `**${limpiarTexto(
                    watch.category ||
                    "Watch List"
                )}**`,
            inline: false
        });
    }

    embed.addFields({
        name: "🔗 Perfiles",
        value:
            `[Steam](${steamProfileURL}) • ` +
            `[SteamID.uk](${steamIDUkURL})`,
        inline: false
    });

    embed.setFooter({
        text:
            `BattleMetrics → SteamID64 → SteamID.uk`
    });

    return embed;
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName("steam")
            .setDescription(
                "Busca un jugador en BattleMetrics y obtiene sus datos de SteamID.uk"
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

    async execute(interaction) {

        const nombre =
            interaction.options.getString(
                "nombre"
            );

        console.log(
            "🎯 Ejecutando /steam"
        );

        console.log(
            `[STEAM] Entrada recibida: "${nombre}"`
        );

        await interaction.deferReply();

        try {

            // =================================================
            // 1. BATTLEMETRICS
            // =================================================

            const jugadores =
                await buscarEnBattleMetrics(
                    nombre
                );

            if (
                !jugadores.length
            ) {

                return interaction.editReply({
                    content:
                        `❌ No encontré ningún jugador con el nombre exacto **${nombre}** en el servidor configurado de BattleMetrics.`
                });
            }

            // =================================================
            // 2. FILTRAR LOS QUE TIENEN STEAMID64
            // =================================================

            const jugadoresConSteam =
                jugadores.filter(
                    jugador =>
                        /^\d{17}$/.test(
                            String(
                                jugador.steamID64 ||
                                ""
                            )
                        )
                );

            if (
                !jugadoresConSteam.length
            ) {

                return interaction.editReply({
                    content:
                        `⚠️ Encontré **${jugadores.length}** jugador(es) en BattleMetrics con el nombre **${nombre}**, pero BattleMetrics no entregó ningún SteamID64 para esos perfiles.`
                });
            }

            // =================================================
            // 3. DEDUPLICAR STEAMID64
            // =================================================

            const mapa =
                new Map();

            for (
                const jugador
                of jugadoresConSteam
            ) {

                if (
                    !mapa.has(
                        jugador.steamID64
                    )
                ) {

                    mapa.set(
                        jugador.steamID64,
                        jugador
                    );
                }
            }

            const jugadoresUnicos =
                Array.from(
                    mapa.values()
                );

            console.log(
                `[STEAM] Perfiles Steam únicos: ${jugadoresUnicos.length}`
            );

            // =================================================
            // 4. OBTENER AVATARES
            // =================================================

            const steamIDs =
                jugadoresUnicos.map(
                    jugador =>
                        jugador.steamID64
                );

            const steamProfiles =
                await obtenerDatosSteam(
                    steamIDs
                );

            // =================================================
            // 5. STEAMID.UK
            // =================================================

            const embeds = [];

            for (
                const jugador
                of jugadoresUnicos
            ) {

                const steamID64 =
                    jugador.steamID64;

                console.log(
                    "----------------------------------------------"
                );

                console.log(
                    `[STEAMID.UK] Consultando ${steamID64}`
                );

                try {

                    const steamData =
                        await getSteamIDData(
                            steamID64
                        );

                    const steamProfile =
                        steamProfiles.get(
                            steamID64
                        );

                    const embed =
                        crearEmbed(
                            jugador,
                            steamData,
                            steamProfile
                        );

                    embeds.push(
                        embed
                    );

                } catch (error) {

                    console.error(
                        `[STEAMID.UK] Error con ${steamID64}:`,
                        error.response?.data ||
                        error.message
                    );

                    // No detenemos los demás perfiles.
                    const embed =
                        new EmbedBuilder()
                            .setTitle(
                                `🎮 ${limpiarTexto(
                                    jugador.nombre
                                )}`
                            )
                            .setColor(
                                "#ED4245"
                            )
                            .addFields(
                                {
                                    name:
                                        "🆔 SteamID64",
                                    value:
                                        `\`${steamID64}\``,
                                    inline: false
                                },
                                {
                                    name:
                                        "⚠️ SteamID.uk",
                                    value:
                                        "No pudo devolver los datos de este perfil.",
                                    inline: false
                                },
                                {
                                    name:
                                        "🔗 Steam",
                                    value:
                                        `[Abrir perfil](https://steamcommunity.com/profiles/${steamID64})`,
                                    inline: false
                                }
                            );

                    const steamProfile =
                        steamProfiles.get(
                            steamID64
                        );

                    if (
                        steamProfile?.avatarfull
                    ) {
                        embed.setThumbnail(
                            steamProfile.avatarfull
                        );
                    }

                    embeds.push(
                        embed
                    );
                }
            }

            // =================================================
            // 6. RESULTADO
            // =================================================

            if (
                !embeds.length
            ) {

                return interaction.editReply({
                    content:
                        "❌ No se pudo obtener información de los perfiles encontrados."
                });
            }

            console.log(
                `[STEAM] Enviando ${embeds.length} perfil(es) a Discord.`
            );

            // Discord permite máximo 10 embeds por mensaje.
            const primerGrupo =
                embeds.slice(
                    0,
                    10
                );

            await interaction.editReply({
                content:
                    `🔎 Resultados para **${nombre}** — ${embeds.length} perfil(es)`,
                embeds:
                    primerGrupo
            });

            // =================================================
            // PERFILES ADICIONALES
            // =================================================

            for (
                let i = 10;
                i < embeds.length;
                i += 10
            ) {

                await interaction.followUp({
                    embeds:
                        embeds.slice(
                            i,
                            i + 10
                        )
                });
            }

            console.log(
                "✅ /steam terminado correctamente."
            );

        } catch (error) {

            console.error(
                "=============================================="
            );

            console.error(
                "❌ ERROR EN /STEAM"
            );

            console.error(
                error.response?.data ||
                error.message ||
                error
            );

            console.error(
                "=============================================="
            );

            const mensaje =
                error.response?.status === 401 ||
                error.response?.status === 403
                    ? "❌ BattleMetrics rechazó la solicitud. Revisa `BATTLEMETRICS_TOKEN`."
                    : error.response?.status === 429
                        ? "⏳ BattleMetrics está limitando las solicitudes. Inténtalo nuevamente en unos momentos."
                        : "❌ Ocurrió un error al consultar BattleMetrics.";

            try {

                await interaction.editReply({
                    content:
                        mensaje
                });

            } catch (discordError) {

                console.error(
                    "❌ No se pudo enviar el error a Discord:",
                    discordError.message
                );
            }
        }
    }
};