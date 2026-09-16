const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getSteamIDData
} = require("../services/steamid.js");

// =====================================================
// UTILIDADES
// =====================================================

function escaparTexto(texto) {

    return String(texto || "")
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`");
}

function estadoBan(estaBaneado) {

    return estaBaneado
        ? "🔴 Sí"
        : "🟢 No";
}

function numero(valor) {

    const n =
        Number(valor);

    return Number.isFinite(n)
        ? n
        : 0;
}

// =====================================================
// COMANDO /STEAMID
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("steamid")

            .setDescription(
                "Consulta información de un SteamID64"
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

    async execute(interaction) {

        await interaction.deferReply();

        const steamId =
            interaction.options
                .getString("steamid")
                .trim();

        // =================================================
        // VALIDAR STEAMID64
        // =================================================

        if (
            !/^\d{17}$/.test(steamId)
        ) {

            return await interaction.editReply(
                "❌ Debes introducir un SteamID64 válido de 17 números."
            );
        }

        console.log(
            "=============================================="
        );

        console.log(
            "🎯 Ejecutando /steamid"
        );

        console.log(
            `🆔 SteamID64: ${steamId}`
        );

        console.log(
            "=============================================="
        );

        // =================================================
        // URLS
        // =================================================

        const steamProfileUrl =
            `https://steamcommunity.com/profiles/${steamId}`;

        const steamIdUkUrl =
            `https://steamid.uk/profile/${steamId}`;

        const steamHistoryUrl =
            `https://steamhistory.net/id/${steamId}`;

        // =================================================
        // CONSULTAR STEAMID.UK
        // =================================================

        let steamData;

        try {

            steamData =
                await getSteamIDData(
                    steamId
                );

        } catch (error) {

            console.error(
                "❌ Error SteamID.uk:",
                error.message
            );

            return await interaction.editReply(
                "❌ No se pudo obtener la información desde SteamID.uk."
            );
        }

        // =================================================
        // DATOS
        // =================================================

        const steam2 =
            steamData?.steam2 ||
            "No disponible";

        const steam3 =
            steamData?.steam3 ||
            "No disponible";

        const csgoFriendId =
            steamData?.csgoFriendId ||
            "No disponible";

        const vacBanned =
            Boolean(
                steamData?.vacBanned
            );

        const gameBans =
            numero(
                steamData?.gameBans
            );

        const tradeBan =
            Boolean(
                steamData?.tradeBan
            );

        const communityBan =
            Boolean(
                steamData?.communityBan
            );

        const steamIdBan =
            Boolean(
                steamData?.steamIdBan
            );

        const rustHackReport =
            Boolean(
                steamData?.rustHackReport
            );

        const friendsCount =
            numero(
                steamData?.friendsCount
            );

        const friendsVac =
            numero(
                steamData?.friendsVac
            );

        const friendsGameBan =
            numero(
                steamData?.friendsGameBan
            );

        const friendsTradeBan =
            numero(
                steamData?.friendsTradeBan
            );

        const friendsCommunityBan =
            numero(
                steamData?.friendsCommunityBan
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
                );

        // =================================================
        // IDENTIFICACIÓN
        // =================================================

        embed.addFields(

            {
                name:
                    "🆔 SteamID64",

                value:
                    `\`${steamId}\``,

                inline:
                    false
            },

            {
                name:
                    "Steam2",

                value:
                    `\`${escaparTexto(steam2)}\``,

                inline:
                    false
            },

            {
                name:
                    "Steam3",

                value:
                    `\`${escaparTexto(steam3)}\``,

                inline:
                    false
            },

            {
                name:
                    "CSGO Friend ID",

                value:
                    `\`${escaparTexto(csgoFriendId)}\``,

                inline:
                    false
            }

        );

        // =================================================
        // PERFILES
        // =================================================

        embed.addFields(

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
            }

        );

        // =================================================
        // BANS
        // =================================================

        embed.addFields(

            {
                name:
                    "🛡️ VAC",

                value:
                    vacBanned
                        ? "🔴 Sí"
                        : "🟢 No",

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
                    estadoBan(
                        tradeBan
                    ),

                inline:
                    true
            },

            {
                name:
                    "🏛️ Community Ban",

                value:
                    estadoBan(
                        communityBan
                    ),

                inline:
                    true
            },

            {
                name:
                    "🆔 SteamID Ban",

                value:
                    estadoBan(
                        steamIdBan
                    ),

                inline:
                    true
            },

            {
                name:
                    "🦀 RustHackReport",

                value:
                    estadoBan(
                        rustHackReport
                    ),

                inline:
                    true
            }

        );

        // =================================================
        // AMIGOS
        // =================================================

        embed.addFields(

            {
                name:
                    "👥 Amigos",

                value:
                    `\`${friendsCount}\``,

                inline:
                    true
            },

            {
                name:
                    "👤 Amigos con VAC",

                value:
                    `\`${friendsVac}\``,

                inline:
                    true
            },

            {
                name:
                    "⚠️ Amigos con Game Ban",

                value:
                    `\`${friendsGameBan}\``,

                inline:
                    true
            },

            {
                name:
                    "🚫 Amigos con Trade Ban",

                value:
                    `\`${friendsTradeBan}\``,

                inline:
                    true
            },

            {
                name:
                    "🏛️ Amigos con Community Ban",

                value:
                    `\`${friendsCommunityBan}\``,

                inline:
                    true
            }

        );

        // =================================================
        // FOOTER
        // =================================================

        embed

            .setTimestamp()

            .setFooter({
                text:
                    "RustLogix • SteamID.uk • SteamHistory.net"
            });

        // =================================================
        // RESPUESTA
        // =================================================

        console.log(
            "✅ /steamid terminado"
        );

        return await interaction.editReply({
            embeds: [
                embed
            ]
        });
    }
};