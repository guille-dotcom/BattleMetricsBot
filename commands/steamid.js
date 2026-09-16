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

function estadoBan(valor) {

    return String(valor) === "1"
        ? "🔴 Sí"
        : "🟢 No";
}

function obtenerNumero(valor) {

    const numero =
        Number(valor);

    return Number.isFinite(numero)
        ? numero
        : 0;
}

// =====================================================
// COMANDO
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

        // ==========================================
        // VALIDAR
        // ==========================================

        if (
            !/^\d{17}$/.test(steamId)
        ) {

            return await interaction.editReply(
                "❌ Debes introducir un SteamID64 válido de 17 números."
            );
        }

        console.log(
            "🎯 Ejecutando /steamid"
        );

        console.log(
            `🆔 SteamID64: ${steamId}`
        );

        console.log(
            "=============================================="
        );

        // ==========================================
        // URLS
        // ==========================================

        const steamProfileUrl =
            `https://steamcommunity.com/profiles/${steamId}`;

        const steamIdUkUrl =
            `https://steamid.uk/profile/${steamId}`;

        const steamHistoryUrl =
            `https://steamhistory.net/id/${steamId}`;

        // ==========================================
        // STEAMID.UK
        // ==========================================

        let data;

        try {

            data =
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

        // ==========================================
        // SECCIONES API
        // ==========================================

        const profile =
            data?.profile || {};

        const bans =
            data?.profile_bans || {};

        const steamidData =
            data?.steamid_data || {};

        // ==========================================
        // IDENTIFICADORES
        // ==========================================

        const steam2 =
            profile?.steamid ||
            "No disponible";

        const steam3 =
            profile?.steam3 ||
            "No disponible";

        const csgoFriend =
            profile?.csgofriend ||
            "No disponible";

        // ==========================================
        // BANS
        // ==========================================

        const vac =
            bans?.vac || "0";

        const gameBans =
            obtenerNumero(
                bans?.amount_game_bans
            );

        const tradeBan =
            bans?.tradeban || "0";

        const communityBan =
            bans?.communityban || "0";

        const steamIdBan =
            bans?.steamid_ban || "0";

        const rustHackReport =
            bans?.rusthackreport || "0";

        // ==========================================
        // AMIGOS
        // ==========================================

        const amigos =
            obtenerNumero(
                steamidData?.friend_count
            );

        const amigosVac =
            obtenerNumero(
                steamidData?.vac_banned_friends
            );

        const amigosGameBan =
            obtenerNumero(
                steamidData?.game_banned_friends
            );

        const amigosTradeBan =
            obtenerNumero(
                steamidData?.trade_banned_friends
            );

        const amigosCommunityBan =
            obtenerNumero(
                steamidData?.community_banned_friends
            );

        // ==========================================
        // EMBED
        // ==========================================

        const embed =
            new EmbedBuilder()

                .setTitle(
                    "🔎 Información SteamID"
                )

                .setColor(
                    "#57F287"
                );

        // ==========================================
        // STEAM IDS
        // ==========================================

        embed.addFields({

            name:
                "🆔 SteamID64",

            value:
                `\`${steamId}\``,

            inline:
                false

        });

        embed.addFields({

            name:
                "Steam2",

            value:
                `\`${escaparTexto(steam2)}\``,

            inline:
                false

        });

        embed.addFields({

            name:
                "Steam3",

            value:
                `\`${escaparTexto(steam3)}\``,

            inline:
                false

        });

        embed.addFields({

            name:
                "CSGO Friend ID",

            value:
                `\`${escaparTexto(csgoFriend)}\``,

            inline:
                false

        });

        // ==========================================
        // PERFILES
        // ==========================================

        embed.addFields({

            name:
                "🔗 Perfil SteamID.uk",

            value:
                `[Abrir perfil](${steamIdUkUrl})`,

            inline:
                true

        });

        embed.addFields({

            name:
                "🎮 Perfil de Steam",

            value:
                `[Abrir perfil](${steamProfileUrl})`,

            inline:
                true

        });

        embed.addFields({

            name:
                "📜 SteamHistory",

            value:
                `[Ver historial completo](${steamHistoryUrl})`,

            inline:
                true

        });

        // ==========================================
        // BANS
        // ==========================================

        embed.addFields({

            name:
                "🛡️ VAC",

            value:
                estadoBan(vac),

            inline:
                true

        });

        embed.addFields({

            name:
                "🔨 Game Bans",

            value:
                `\`${gameBans}\``,

            inline:
                true

        });

        embed.addFields({

            name:
                "🚫 Trade Ban",

            value:
                estadoBan(tradeBan),

            inline:
                true

        });

        embed.addFields({

            name:
                "🏛️ Community Ban",

            value:
                estadoBan(communityBan),

            inline:
                true

        });

        embed.addFields({

            name:
                "🆔 SteamID Ban",

            value:
                estadoBan(steamIdBan),

            inline:
                true

        });

        embed.addFields({

            name:
                "🦀 RustHackReport",

            value:
                estadoBan(rustHackReport),

            inline:
                true

        });

        // ==========================================
        // AMIGOS
        // ==========================================

        embed.addFields({

            name:
                "👥 Amigos",

            value:
                `\`${amigos}\``,

            inline:
                true

        });

        embed.addFields({

            name:
                "👤 Amigos con VAC",

            value:
                `\`${amigosVac}\``,

            inline:
                true

        });

        embed.addFields({

            name:
                "⚠️ Amigos con Game Ban",

            value:
                `\`${amigosGameBan}\``,

            inline:
                true

        });

        embed.addFields({

            name:
                "🚫 Amigos con Trade Ban",

            value:
                `\`${amigosTradeBan}\``,

            inline:
                true

        });

        embed.addFields({

            name:
                "🏛️ Amigos con Community Ban",

            value:
                `\`${amigosCommunityBan}\``,

            inline:
                true

        });

        // ==========================================
        // FOOTER
        // ==========================================

        embed
            .setTimestamp()
            .setFooter({
                text:
                    "RustLogix • SteamID.uk • SteamHistory.net"
            });

        // ==========================================
        // RESPUESTA
        // ==========================================

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