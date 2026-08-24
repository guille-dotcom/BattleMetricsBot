const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    searchBattleMetricsPlayerHistory,
    getBattleMetricsPlayerStatus
} = require("../services/battlemetricsHours.js");

const ServerConfig =
    require("../models/ServerConfig");


// =====================================================
// COMANDO /BUSCAR
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("buscar")

            .setDescription(
                "Busca un jugador en el historial de BattleMetrics del servidor configurado"
            )

            .addStringOption(
                option =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre del jugador que quieres buscar"
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
        // OBTENER SERVIDOR CONFIGURADO
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
                "❌ Error obteniendo configuración MongoDB:",
                error.message
            );
        }


        // =================================================
        // SERVIDOR NO CONFIGURADO
        // =================================================

        if (
            !serverId
        ) {

            return await interaction.editReply(
                "❌ Este servidor de Discord no tiene un servidor de BattleMetrics configurado."
            );
        }


        console.log(
            `🔎 /buscar "${nombre}" → servidor BM ${serverId}`
        );


        // =================================================
        // BUSCAR EN HISTORIAL DEL SERVIDOR
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
                "❌ Error buscando jugador histórico:",
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
                        `🔍 Jugador no encontrado`
                    )

                    .setColor(
                        "#FF0000"
                    )

                    .setDescription(
                        `No se encontró a **${nombre}** dentro del historial del servidor configurado en BattleMetrics.`
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
                                "📡 Alcance",

                            value:
                                "`Solo este servidor`",

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
        // NOMBRE DUPLICADO
        // =================================================

        if (
            jugadorBM.duplicate
        ) {

            const jugadores =
                jugadorBM.players ||
                [];


            const lista =
                jugadores
                    .slice(0, 10)
                    .map(
                        (jugador, index) => {

                            const nombreJugador =
                                jugador.attributes?.name ||
                                "Desconocido";

                            return (
                                `**${index + 1}.** ${nombreJugador}\n` +
                                `🆔 BM: \`${jugador.id}\`\n` +
                                `🔗 [Perfil](https://www.battlemetrics.com/players/${jugador.id})`
                            );
                        }
                    )
                    .join("\n\n");


            const embedDuplicados =
                new EmbedBuilder()

                    .setTitle(
                        `⚠️ Jugadores encontrados: ${nombre}`
                    )

                    .setColor(
                        "#FFA500"
                    )

                    .setDescription(
                        `BattleMetrics encontró **${jugadores.length} jugadores** con ese nombre dentro del servidor configurado.\n\n` +
                        `Selecciona el jugador correcto usando su ID de BattleMetrics.`
                    )

                    .addFields({

                        name:
                            "👥 Coincidencias",

                        value:
                            lista ||
                            "No disponible",

                        inline:
                            false

                    })

                    .setFooter({
                        text:
                            `Servidor BM: ${serverId}`
                    })

                    .setTimestamp();


            return await interaction.editReply({
                embeds:
                    [
                        embedDuplicados
                    ]
            });
        }


        // =================================================
        // DATOS DEL JUGADOR
        // =================================================

        let datosJugador =
            null;


        try {

            datosJugador =
                await getBattleMetricsPlayerStatus(
                    jugadorBM.id,
                    serverId
                );

        } catch (error) {

            console.error(
                "❌ Error obteniendo datos completos del jugador:",
                error.message
            );
        }


        // =================================================
        // ERROR DATOS DETALLADOS
        // =================================================

        if (
            !datosJugador
        ) {

            return await interaction.editReply(
                "❌ BattleMetrics encontró al jugador, pero no fue posible obtener sus datos detallados."
            );
        }


        // =================================================
        // DATOS BÁSICOS
        // =================================================

        const estado =
            datosJugador.online

                ? `🟢 Online · ${datosJugador.jugando}`

                : "🔴 Offline";


        const horas =
            Number(
                datosJugador.horasTotalesBM
            ) || 0;


        const horasTexto =
            `${horas}h`;


        const primeraConexion =
            datosJugador.primeraConexion ||
            "No disponible";


        const ultimaConexion =
            datosJugador.ultimaConexion ||
            "Nunca";


        const historial =
            datosJugador.historialNombres &&
            datosJugador.historialNombres.length > 0

                ? datosJugador.historialNombres
                    .slice(0, 3)
                    .join(", ")

                : "No disponible";


        // =================================================
        // EMBED
        // =================================================

        const embed =
            new EmbedBuilder()

                .setTitle(
                    `🔎 Jugador encontrado: ${datosJugador.name}`
                )

                .setColor(
                    datosJugador.online
                        ? "#57F287"
                        : "#5865F2"
                )

                .setDescription(
                    `El jugador fue encontrado **dentro del servidor configurado de BattleMetrics**.\n` +
                    `La búsqueda incluye jugadores **offline**.`
                )

                .addFields(

                    // -------------------------------------
                    // SERVIDOR
                    // -------------------------------------

                    {
                        name:
                            "🎮 Servidor",

                        value:
                            datosJugador.server ||
                            `ID ${serverId}`,

                        inline:
                            false
                    },


                    // -------------------------------------
                    // ESTADO
                    // -------------------------------------

                    {
                        name:
                            "🎮 Estado",

                        value:
                            `\`${estado}\``,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // HORAS
                    // -------------------------------------

                    {
                        name:
                            "📈 Horas en este servidor",

                        value:
                            `\`${horasTexto}\``,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // BATTLEMETRICS
                    // -------------------------------------

                    {
                        name:
                            "🆔 BattleMetrics",

                        value:
                            `[${datosJugador.id}](https://www.battlemetrics.com/players/${datosJugador.id})`,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // PRIMERA CONEXIÓN
                    // -------------------------------------

                    {
                        name:
                            "📅 Primera conexión",

                        value:
                            `\`${primeraConexion}\``,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // ÚLTIMA CONEXIÓN
                    // -------------------------------------

                    {
                        name:
                            "🕐 Última conexión",

                        value:
                            `\`${ultimaConexion}\``,

                        inline:
                            true
                    },


                    // -------------------------------------
                    // HISTORIAL
                    // -------------------------------------

                    {
                        name:
                            "📝 Historial de nombres",

                        value:
                            historial,

                        inline:
                            false
                    }

                )

                .setFooter({
                    text:
                        `RustLogix • Servidor BM ${serverId}`
                })

                .setTimestamp();


        // =================================================
        // ENVIAR
        // =================================================

        return await interaction.editReply({

            embeds:
                [
                    embed
                ]

        });
    }
};