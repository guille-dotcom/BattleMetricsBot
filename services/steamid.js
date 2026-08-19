const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getSteamIDData
} = require("../services/steamid.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("steamid")
        .setDescription("Obtiene información de un SteamID")
        .addStringOption(option =>
            option
                .setName("steamid")
                .setDescription("SteamID64 del jugador")
                .setRequired(true)
        ),

    async execute(interaction) {

        await interaction.deferReply();

        const steamId = interaction.options
            .getString("steamid")
            .trim();

        // ==========================================
        // VALIDAR STEAMID64
        // ==========================================

        if (!/^\d{17}$/.test(steamId)) {

            return await interaction.editReply(
                "❌ Debes introducir un SteamID64 válido de 17 números."
            );

        }

        // ==========================================
        // CONSULTAR STEAMID.UK
        // ==========================================

        let data;

        try {

            data = await getSteamIDData(steamId);

        } catch (error) {

            console.error(
                "❌ Error SteamID.uk:",
                error.response?.data || error.message
            );

            return await interaction.editReply(
                "❌ No se pudo obtener la información desde SteamID.uk."
            );

        }

        // ==========================================
        // DATOS
        // ==========================================

        const profile = data.profile || {};
        const bans = data.profile_bans || {};
        const steamData = data.steamid_data || {};
        const watch = data.custom_watch_list || {};

        // ==========================================
        // BANEOS
        // ==========================================

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
            bans.amount_game_bans || "0";

        // ==========================================
        // RUSTHACKREPORT
        // ==========================================

        const rustHack =
            bans.rusthackreport === "1"
                ? "⚠️ Reportado"
                : "✅ No";

        // ==========================================
        // WATCH LIST
        // ==========================================

        const watchList =
            watch.watch_result === "1"
                ? `👁️ Sí — ${watch.category || "Lista personalizada"}`
                : "❌ No";

        // ==========================================
        // EMBED
        // ==========================================

        const embed = new EmbedBuilder()

            .setTitle("🔎 Información SteamID")

            .setColor("#57F287")

            .addFields(

                {
                    name: "🆔 SteamID64",
                    value: `\`${profile.steamid64 || steamId}\``,
                    inline: false
                },

                {
                    name: "Steam2",
                    value: `\`${profile.steamid || "No disponible"}\``,
                    inline: true
                },

                {
                    name: "Steam3",
                    value: `\`${profile.steam3 || "No disponible"}\``,
                    inline: true
                },

                {
                    name: "CSGO Friend ID",
                    value: `\`${profile.csgofriend || "No disponible"}\``,
                    inline: true
                },

                {
                    name: "🔗 Perfil SteamID.uk",
                    value:
                        `[Abrir perfil](${profile.steamidurl || `https://steamid.uk/profile/${steamId}`})`,
                    inline: true
                },

                {
                    name: "📨 Invite URL",
                    value:
                        profile.inviteurl
                            ? `[Invitar](${profile.inviteurl})`
                            : "No disponible",
                    inline: true
                },

                {
                    name: "🛡️ VAC",
                    value: vac,
                    inline: true
                },

                {
                    name: "🔨 Game Bans",
                    value: `\`${gameBans}\``,
                    inline: true
                },

                {
                    name: "🚫 Trade Ban",
                    value: trade,
                    inline: true
                },

                {
                    name: "🏛️ Community Ban",
                    value: community,
                    inline: true
                },

                {
                    name: "🦀 RustHackReport",
                    value: rustHack,
                    inline: true
                },

                {
                    name: "👥 Amigos",
                    value:
                        `\`${steamData.friend_count || "0"}\``,
                    inline: true
                },

                {
                    name: "👤 Amigos con VAC",
                    value:
                        `\`${steamData.vac_banned_friends || "0"}\``,
                    inline: true
                },

                {
                    name: "⚠️ Amigos con Game Ban",
                    value:
                        `\`${steamData.game_banned_friends || "0"}\``,
                    inline: true
                },

                {
                    name: "📜 Historial de nombres",
                    value:
                        `\`${steamData.name_history_count || "0"}\``,
                    inline: true
                },

                {
                    name: "👁️ Watch List",
                    value: watchList,
                    inline: false
                }

            )

            .setTimestamp()

            .setFooter({
                text: "RustLogix • SteamID.uk"
            });

        // ==========================================
        // ENLACE RUSTHACKREPORT
        // ==========================================

        if (
            bans.rusthackreport === "1" &&
            bans.rusthackreport_url
        ) {

            embed.addFields({

                name: "🦀 RustHackReport",

                value:
                    `[Ver reporte](${bans.rusthackreport_url})`,

                inline: false

            });

        }

        // ==========================================
        // RESPUESTA
        // ==========================================

        return await interaction.editReply({

            embeds: [embed]

        });

    }
};