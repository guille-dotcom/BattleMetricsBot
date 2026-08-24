const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    searchBattleMetricsPlayerHistory
} = require("../services/battlemetricsHours.js");

const ServerConfig =
    require("../models/ServerConfig");


// =====================================================
// /BUSCAR
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("buscar")

            .setDescription(
                "Busca un jugador por nombre en BattleMetrics y comprueba su historial en el servidor configurado"
            )

            .addStringOption(
                option =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre del jugador"
                        )
                        .setRequired(true)
            ),


    async execute(interaction) {

        await interaction.deferReply();


        // =================================================
        // NOMBRE
        // =================================================

        const nombre =
            interaction.options
                .getString("nombre")
                .trim();


        if (
            !nombre
        ) {

            return await interaction.editReply(
                "❌ Debes introducir un nombre."
            );
        }


        // =================================================
        // SERVIDOR CONFIGURADO
        // =================================================

        let serverId =
            null;


        try {

            const dbConfig =
                await ServerConfig.findOne({
                    guildId:
                        interaction.guild.id
                });


            if (
                dbConfig &&
                dbConfig.battleMetricsServerId
            ) {

                serverId =
                    String(
                        dbConfig.battleMetricsServerId
                    );
            }

        } catch (error) {

            console.error(
                "❌ Error obteniendo configuración:",
                error.message
            );
        }


        if (
            !serverId
        ) {

            return await interaction.editReply(
                "❌ Este servidor de Discord no tiene un servidor de BattleMetrics configurado."
            );
        }


        console.log(
            `🎯 /buscar "${nombre}" → servidor configurado ${serverId}`
        );


        // =================================================
        // BÚSQUEDA GLOBAL + COMPROBACIÓN SERVIDOR
        // =================================================

        let jugadorBM =
            null;


        try {

            jugadorBM =
                await searchBattleMetricsPlayerHistory(
                    nombre,
                    serverId
                );

        } catch (error) {

            console.error(
                "❌ Error buscando jugador:",
                error.message
            );
        }


        // =================================================
        // NO ENCONTRADO
        // =================================================

        if (
            !jugadorBM
        ) {

            const embedNoEncontrado =
                new EmbedBuilder()

                    .setTitle(
                        "🔍 Jugador no encontrado"
                    )

                    .setColor(
                        "#FF0000"
                    )

                    .setDescription(
                        `No se encontró un perfil de **${nombre}** que tenga historial en el servidor configurado.`
                    )

                    .addFields(

                        {
                            name:
                                "🎮 Servidor consultado",

                            value:
                                `\`${serverId}\``,

                            inline:
                                true
                        },

                        {
                            name:
                                "🔎 Búsqueda",

                            value:
                                `\`${nombre}\``,

                            inline:
                                true
                        },

                        {
                            name:
                                "📡 Método",

                            value:
                                "`Perfil global + historial del servidor`",

                            inline:
                                true
                        }

                    )

                    .setFooter({
                        text:
                            "RustLogix • BattleMetrics"
                    })

                    .setTimestamp();


            return await interaction.editReply({
                embeds:
                    [
                        embedNoEncontrado
                    ]
            });
        }


        // =================================================
        // DATOS DEL RESULTADO
        // =================================================

        const horas =
            Number(
                jugadorBM.horas
            ) || 0;


        const tiempoJugado =
            jugadorBM.tiempoJugado ||
            "0m";


        const primeraConexion =
            jugadorBM.primeraConexion ||
            "No disponible";


        const ultimaConexion =
            jugadorBM.ultimaConexion ||
            "Nunca";


        // =================================================
        // PERFIL BM
        // =================================================

        const perfilUrl =
            `https://www.battlemetrics.com/players/${jugadorBM.id}`;


        const servidorUrl =
            `https://www.battlemetrics.com/servers/rust/${serverId}`;


        // =================================================
        // EMBED
        // =================================================

        const embed =
            new EmbedBuilder()

                .setTitle(
                    `🔎 Jugador encontrado: ${jugadorBM.name}`
                )

                .setColor(
                    "#5865F2"
                )

                .setDescription(
                    `El perfil de BattleMetrics **sí tiene historial en el servidor configurado**, aunque actualmente esté offline.`
                )

                .addFields(

                    // -------------------------------------
                    // SERVIDOR
                    // -------------------------------------

                    {
                        name:
                            "🎮 Servidor",

                        value:
                            `[${jugadorBM.serverName}](${servidorUrl})`,

                        inline:
                            false
                    },


                    // -------------------------------------
                    // BATTLEMETRICS
                    // -------------------------------------

                    {
                        name:
                            "🆔 BattleMetrics",

                        value:
                            `[${jugadorBM.id}](${perfilUrl})`,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // ESTADO
                    // -------------------------------------

                    {
                        name:
                            "🎮 Estado",

                        value:
                            "`🔴 Offline`",

                        inline:
                            true
                    },


                    // -------------------------------------
                    // HORAS
                    // -------------------------------------

                    {
                        name:
                            "📈 Tiempo jugado",

                        value:
                            `\`${tiempoJugado}\``,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // PRIMERA VEZ
                    // -------------------------------------

                    {
                        name:
                            "📅 First Seen",

                        value:
                            `\`${primeraConexion}\``,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // ÚLTIMA VEZ
                    // -------------------------------------

                    {
                        name:
                            "🕐 Last Seen",

                        value:
                            `\`${ultimaConexion}\``,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // SERVER ID
                    // -------------------------------------

                    {
                        name:
                            "🖥️ Server ID",

                        value:
                            `\`${serverId}\``,

                        inline:
                            true
                    }

                )

                .setFooter({
                    text:
                        `RustLogix • BattleMetrics • ${serverId}`
                })

                .setTimestamp();


        // =================================================
        // DUPLICADOS
        // =================================================

        if (
            jugadorBM.candidatos &&
            jugadorBM.candidatos.length > 1
        ) {

            const candidatos =
                jugadorBM.candidatos
                    .slice(0, 5)
                    .map(
                        (jugador, index) =>
                            `**${index + 1}.** ${jugador.name} — BM \`${jugador.id}\` — Last Seen: \`${jugador.ultimaConexion}\``
                    )
                    .join("\n");


            embed.addFields({

                name:
                    "👥 Perfiles coincidentes",

                value:
                    candidatos,

                inline:
                    false
            });
        }


        // =================================================
        // RESPUESTA
        // =================================================

        return await interaction.editReply({

            embeds:
                [
                    embed
                ]

        });
    }
};