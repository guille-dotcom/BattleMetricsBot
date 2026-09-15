const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getSteamIDData
} = require("../services/steamid.js");

const {
    getSteamHistory
} = require("../services/steamHistory.js");

// =====================================================
// FORMATEAR FECHA
// =====================================================

function formatearFecha(date) {
    if (!date) {
        return "Fecha desconocida";
    }

    try {
        return new Intl.DateTimeFormat(
            "es-CL",
            {
                timeZone:
                    "America/Santiago",

                day: "2-digit",
                month: "2-digit",
                year: "numeric",

                hour: "2-digit",
                minute: "2-digit"
            }
        ).format(date);

    } catch {
        return date.toLocaleString(
            "es-CL"
        );
    }
}

// =====================================================
// CREAR TEXTO DEL HISTORIAL
// =====================================================

function construirHistorial(
    historicalNames
) {
    if (
        !Array.isArray(
            historicalNames
        ) ||
        historicalNames.length === 0
    ) {
        return "⚠️ No se encontró historial de nombres en SteamHistory.net.";
    }

    const MAX_MOSTRAR = 10;

    const recientes =
        historicalNames.slice(
            0,
            MAX_MOSTRAR
        );

    const lineas =
        recientes.map(
            (item, index) => {
                const fecha =
                    formatearFecha(
                        item.date
                    );

                return (
                    `\`${index + 1}.\` ` +
                    `**${item.name}**\n` +
                    `└ ${fecha}`
                );
            }
        );

    let texto =
        `📊 **Total registrado:** \`${historicalNames.length}\`\n\n` +
        lineas.join("\n");

    if (
        historicalNames.length >
        MAX_MOSTRAR
    ) {
        texto +=
            `\n\n... y \`${historicalNames.length - MAX_MOSTRAR}\` nombre(s) más.`;
    }

    return texto;
}

// =====================================================
// COMANDO /STEAMID
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("steamid")

            .setDescription(
                "Obtiene información detallada de un SteamID"
            )

            .addStringOption(
                option =>
                    option
                        .setName("steamid")
                        .setDescription(
                            "SteamID64 del jugador"
                        )
                        .setRequired(true)
            ),

    async execute(
        interaction
    ) {

        await interaction.deferReply();

        // =================================================
        // OBTENER STEAMID
        // =================================================

        const steamId =
            interaction.options
                .getString(
                    "steamid"
                )
                .trim();

        // =================================================
        // VALIDAR STEAMID64
        // =================================================

        if (
            !/^\d{17}$/.test(
                steamId
            )
        ) {

            return await interaction.editReply(
                "❌ Debes introducir un SteamID64 válido de 17 números."
            );
        }

        // =================================================
        // STEAMID.UK
        // =================================================

        let data;

        try {

            data =
                await getSteamIDData(
                    steamId
                );

        } catch (error) {

            console.error(
                "❌ Error ejecutando /steamid:",
                error.response?.data ||
                error.message
            );

            if (
                error.message?.includes(
                    "STEAMID_API_KEY"
                )
            ) {

                return await interaction.editReply(
                    "❌ El bot no tiene configurada la API Key de SteamID.uk en Render."
                );
            }

            if (
                error.message?.includes(
                    "STEAMID_MYID"
                )
            ) {

                return await interaction.editReply(
                    "❌ El bot no tiene configurado STEAMID_MYID en Render."
                );
            }

            return await interaction.editReply(
                "❌ No se pudo obtener la información desde SteamID.uk."
            );
        }

        // =================================================
        // EXTRAER DATOS STEAMID.UK
        // =================================================

        const profile =
            data.profile || {};

        const bans =
            data.profile_bans || {};

        const steamData =
            data.steamid_data || {};

        const watch =
            data.custom_watch_list || {};

        // =================================================
        // STEAMID64
        // =================================================

        const steamId64 =
            profile.steamid64 ||
            steamId;

        // =================================================
        // STEAM2
        // =================================================

        const steam2 =
            profile.steamid ||
            "No disponible";

        // =================================================
        // STEAM3
        // =================================================

        const steam3 =
            profile.steam3 ||
            "No disponible";

        // =================================================
        // CSGO FRIEND ID
        // =================================================

        const csgoFriend =
            profile.csgofriend ||
            "No disponible";

        // =================================================
        // ENLACES
        // =================================================

        const steamIdUkUrl =
            profile.steamidurl ||
            `https://steamid.uk/profile/${steamId64}`;

        const steamProfileUrl =
            `https://steamcommunity.com/profiles/${steamId64}`;

        const steamHistoryUrl =
            `https://steamhistory.net/id/${steamId64}`;

        // =================================================
        // BANEOS
        // =================================================

        const vac =
            bans.vac === "1"
                ? "⚠️ Sí"
                : "✅ No";

        const trade =
            bans.tradeban === "1"
                ? "⚠️ Sí"
                : "✅ No";

        const community =
            bans.communityban === "1"
                ? "⚠️ Sí"
                : "✅ No";

        const gameBans =
            bans.amount_game_bans ||
            "0";

        const steamIdBan =
            bans.steamid_ban === "1"
                ? "⚠️ Sí"
                : "✅ No";

        // =================================================
        // RUST HACK REPORT
        // =================================================

        const rustHack =
            bans.rusthackreport === "1"
                ? "⚠️ Reportado"
                : "✅ No";

        // =================================================
        // WATCH LIST
        // =================================================

        const watchList =
            watch.watch_result === "1"

                ? `👁️ Sí — ${
                    watch.category ||
                    "Lista personalizada"
                }`

                : "❌ No";

        // =================================================
        // ESTADÍSTICAS DE AMIGOS
        // =================================================

        const friendCount =
            steamData.friend_count ||
            "0";

        const vacFriends =
            steamData.vac_banned_friends ||
            "0";

        const gameBannedFriends =
            steamData.game_banned_friends ||
            "0";

        const tradeBannedFriends =
            steamData.trade_banned_friends ||
            "0";

        const communityBannedFriends =
            steamData.community_banned_friends ||
            "0";

        // =================================================
        // HISTORIAL DE AMIGOS
        // =================================================

        const friendHistory =
            steamData.friend_history_count ||
            "0";

        const friendCountNumber =
            parseInt(
                friendCount,
                10
            ) || 0;

        const friendHistoryNumber =
            parseInt(
                friendHistory,
                10
            ) || 0;

        let friendHistoryTexto;

        if (
            friendCountNumber === 0 &&
            friendHistoryNumber === 0
        ) {

            friendHistoryTexto =
                "🔒 Steam Friends - Private";

        } else {

            friendHistoryTexto =
                `\`${friendHistoryNumber}\``;
        }

        // =================================================
        // STEAMHISTORY.NET
        // =================================================

        let steamHistory;

        try {

            steamHistory =
                await getSteamHistory(
                    steamId64
                );

        } catch (error) {

            console.error(
                "❌ Error SteamHistory:",
                error.message
            );

            steamHistory = {
                names: []
            };
        }

        const historicalNames =
            steamHistory.names || [];

        console.log(
            "📜 STEAMHISTORY.NET:",
            historicalNames
        );

        // =================================================
        // TEXTO HISTORIAL
        // =================================================

        const nameHistoryTexto =
            construirHistorial(
                historicalNames
            );

        // =================================================
        // EMBED
        // =================================================

        const embed =
            new EmbedBuilder()

                .setTitle(
                    "🔎 Información SteamID"
                )

                .setColor(
                    "#57F287"
                )

                .addFields(

                    // =========================================
                    // IDENTIFICADORES
                    // =========================================

                    {
                        name:
                            "🆔 SteamID64",

                        value:
                            `\`${steamId64}\``,

                        inline:
                            false
                    },

                    {
                        name:
                            "Steam2",

                        value:
                            `\`${steam2}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "Steam3",

                        value:
                            `\`${steam3}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "CSGO Friend ID",

                        value:
                            `\`${csgoFriend}\``,

                        inline:
                            true
                    },

                    // =========================================
                    // PERFILES
                    // =========================================

                    {
                        name:
                            "🔗 Perfil SteamID.uk",

                        value:
                            `[Abrir perfil](${steamIdUkUrl})`,

                        inline:
                            true
                    },

                    {
                        name:
                            "🎮 Perfil de Steam",

                        value:
                            `[Abrir perfil](${steamProfileUrl})`,

                        inline:
                            true
                    },

                    {
                        name:
                            "📜 SteamHistory",

                        value:
                            `[Ver historial completo](${steamHistoryUrl})`,

                        inline:
                            true
                    },

                    // =========================================
                    // BANEOS
                    // =========================================

                    {
                        name:
                            "🛡️ VAC",

                        value:
                            vac,

                        inline:
                            true
                    },

                    {
                        name:
                            "🔨 Game Bans",

                        value:
                            `\`${gameBans}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "🚫 Trade Ban",

                        value:
                            trade,

                        inline:
                            true
                    },

                    {
                        name:
                            "🏛️ Community Ban",

                        value:
                            community,

                        inline:
                            true
                    },

                    {
                        name:
                            "🆔 SteamID Ban",

                        value:
                            steamIdBan,

                        inline:
                            true
                    },

                    {
                        name:
                            "🦀 RustHackReport",

                        value:
                            rustHack,

                        inline:
                            true
                    },

                    // =========================================
                    // AMIGOS
                    // =========================================

                    {
                        name:
                            "👥 Amigos",

                        value:
                            `\`${friendCount}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "👤 Amigos con VAC",

                        value:
                            `\`${vacFriends}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "⚠️ Amigos con Game Ban",

                        value:
                            `\`${gameBannedFriends}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "🚫 Amigos con Trade Ban",

                        value:
                            `\`${tradeBannedFriends}\``,

                        inline:
                            true
                    },

                    {
                        name:
                            "🏛️ Amigos con Community Ban",

                        value:
                            `\`${communityBannedFriends}\``,

                        inline:
                            true
                    },

                    // =========================================
                    // HISTORIAL
                    // =========================================

                    {
                        name:
                            `📜 Historial de nombres (${historicalNames.length})`,

                        value:
                            nameHistoryTexto,

                        inline:
                            false
                    },

                    {
                        name:
                            "📚 Historial de amigos",

                        value:
                            friendHistoryTexto,

                        inline:
                            true
                    },

                    // =========================================
                    // WATCH LIST
                    // =========================================

                    {
                        name:
                            "👁️ Watch List",

                        value:
                            watchList,

                        inline:
                            false
                    }
                )

                .setTimestamp()

                .setFooter({
                    text:
                        "RustLogix • SteamHistory.net + SteamID.uk"
                });

        // =================================================
        // RUSTHACKREPORT URL
        // =================================================

        if (
            bans.rusthackreport === "1" &&
            bans.rusthackreport_url
        ) {

            embed.addFields({

                name:
                    "🦀 RustHackReport",

                value:
                    `[Ver reporte](${bans.rusthackreport_url})`,

                inline:
                    false
            });
        }

        // =================================================
        // RESPONDER
        // =================================================

        return await interaction.editReply({

            embeds: [
                embed
            ]

        });
    }
};