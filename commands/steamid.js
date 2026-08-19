const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getSteamIDData
} = require("../services/steamid.js");


// =====================================================
// COMANDO /STEAMID
// =====================================================

module.exports = {

    data: new SlashCommandBuilder()

        .setName("steamid")

        .setDescription(
            "Obtiene información detallada de un SteamID"
        )

        .addStringOption(option =>
            option

                .setName("steamid")

                .setDescription(
                    "SteamID64 del jugador"
                )

                .setRequired(true)
        ),


    async execute(interaction) {

        await interaction.deferReply();


        // =================================================
        // OBTENER STEAMID INTRODUCIDO
        // =================================================

        const steamId =
            interaction.options
                .getString("steamid")
                .trim();


        // =================================================
        // VALIDAR STEAMID64
        // =================================================

        if (!/^\d{17}$/.test(steamId)) {

            return await interaction.editReply(
                "❌ Debes introducir un SteamID64 válido de 17 números."
            );

        }


        // =================================================
        // CONSULTAR STEAMID.UK
        // =================================================

        let data;

        try {

            data = await getSteamIDData(
                steamId
            );

        } catch (error) {

            console.error(
                "❌ Error ejecutando /steamid:",
                error.response?.data ||
                error.message
            );


            // ---------------------------------------------
            // ERROR DE VARIABLES DE ENTORNO
            // ---------------------------------------------

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


            // ---------------------------------------------
            // ERROR GENERAL
            // ---------------------------------------------

            return await interaction.editReply(
                "❌ No se pudo obtener la información desde SteamID.uk."
            );

        }


        // =================================================
        // EXTRAER DATOS
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
            bans.amount_game_bans || "0";


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
        // PERFIL STEAM
        // =================================================

        const steamId64 =
            profile.steamid64 ||
            steamId;


        const steam2 =
            profile.steamid ||
            "No disponible";


        const steam3 =
            profile.steam3 ||
            "No disponible";


        const csgoFriend =
            profile.csgofriend ||
            "No disponible";


        const steamProfileUrl =
            profile.steamidurl ||
            `https://steamid.uk/profile/${steamId}`;


        const inviteUrl =
            profile.inviteurl ||
            null;


        // =================================================
        // ESTADÍSTICAS
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


        const nameHistory =
            steamData.name_history_count ||
            "0";


        const friendHistory =
            steamData.friend_history_count ||
            "0";


        // =================================================
        // CREAR EMBED
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


                    // -------------------------------------
                    // IDENTIFICACIÓN
                    // -------------------------------------

                    {
                        name: "🆔 SteamID64",

                        value:
                            `\`${steamId64}\``,

                        inline: false
                    },


                    {
                        name: "Steam2",

                        value:
                            `\`${steam2}\``,

                        inline: true
                    },


                    {
                        name: "Steam3",

                        value:
                            `\`${steam3}\``,

                        inline: true
                    },


                    {
                        name: "CSGO Friend ID",

                        value:
                            `\`${csgoFriend}\``,

                        inline: true
                    },


                    // -------------------------------------
                    // ENLACES
                    // -------------------------------------

                    {
                        name: "🔗 Perfil SteamID.uk",

                        value:
                            `[Abrir perfil](${steamProfileUrl})`,

                        inline: true
                    },


                    {
                        name: "📨 Invite URL",

                        value:

                            inviteUrl

                                ? `[Invitar](${inviteUrl})`

                                : "No disponible",

                        inline: true
                    },


                    // -------------------------------------
                    // BANEOS
                    // -------------------------------------

                    {
                        name: "🛡️ VAC",

                        value:
                            vac,

                        inline: true
                    },


                    {
                        name: "🔨 Game Bans",

                        value:
                            `\`${gameBans}\``,

                        inline: true
                    },


                    {
                        name: "🚫 Trade Ban",

                        value:
                            trade,

                        inline: true
                    },


                    {
                        name: "🏛️ Community Ban",

                        value:
                            community,

                        inline: true
                    },


                    {
                        name: "🆔 SteamID Ban",

                        value:
                            steamIdBan,

                        inline: true
                    },


                    {
                        name: "🦀 RustHackReport",

                        value:
                            rustHack,

                        inline: true
                    },


                    // -------------------------------------
                    // AMIGOS
                    // -------------------------------------

                    {
                        name: "👥 Amigos",

                        value:
                            `\`${friendCount}\``,

                        inline: true
                    },


                    {
                        name: "👤 Amigos con VAC",

                        value:
                            `\`${vacFriends}\``,

                        inline: true
                    },


                    {
                        name: "⚠️ Amigos con Game Ban",

                        value:
                            `\`${gameBannedFriends}\``,

                        inline: true
                    },


                    {
                        name: "🚫 Amigos con Trade Ban",

                        value:
                            `\`${tradeBannedFriends}\``,

                        inline: true
                    },


                    {
                        name: "🏛️ Amigos con Community Ban",

                        value:
                            `\`${communityBannedFriends}\``,

                        inline: true
                    },


                    // -------------------------------------
                    // HISTORIAL
                    // -------------------------------------

                    {
                        name: "📜 Historial de nombres",

                        value:
                            `\`${nameHistory}\``,

                        inline: true
                    },


                    {
                        name: "📚 Historial de amigos",

                        value:
                            `\`${friendHistory}\``,

                        inline: true
                    },


                    // -------------------------------------
                    // WATCH LIST
                    // -------------------------------------

                    {
                        name: "👁️ Watch List",

                        value:
                            watchList,

                        inline: false
                    }

                )


                .setTimestamp()


                .setFooter({

                    text:
                        "RustLogix • SteamID.uk"

                });


        // =================================================
        // RUSTHACKREPORT URL
        // =================================================

        if (

            bans.rusthackreport === "1"

            &&

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