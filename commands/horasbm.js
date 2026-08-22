const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getBattleMetricsHours
} = require("../services/battlemetricsHours.js");


// =====================================================
// COMANDO /HORASBM
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName(
                "horasbm"
            )

            .setDescription(
                "Muestra las horas y estadísticas de BattleMetrics mediante el link del perfil"
            )

            .addStringOption(
                option =>
                    option
                        .setName(
                            "link"
                        )

                        .setDescription(
                            "Link del perfil de BattleMetrics"
                        )

                        .setRequired(
                            true
                        )
            ),


    // =================================================
    // EXECUTE
    // =================================================

    async execute(
        interaction
    ) {

        const linkInput =
            interaction.options
                .getString(
                    "link"
                )
                ?.trim();


        await interaction.deferReply();


        // =================================================
        // VALIDAR LINK
        // =================================================

        if (
            !linkInput
        ) {

            return await interaction.editReply(
                "❌ Debes proporcionar un link de perfil de BattleMetrics."
            );
        }


        /*
         * Acepta:
         *
         * https://www.battlemetrics.com/players/123456789
         *
         * https://battlemetrics.com/players/123456789
         *
         * También acepta texto adicional después del ID.
         */

        const match =
            linkInput.match(
                /battlemetrics\.com\/players\/(\d+)/i
            );


        if (
            !match ||
            !match[1]
        ) {

            return await interaction.editReply(
                "❌ El enlace proporcionado no es válido.\n\n" +
                "Usa un enlace como:\n" +
                "`https://www.battlemetrics.com/players/123456789`"
            );
        }


        const playerId =
            match[1];


        // =================================================
        // CONSULTAR BATTLEMETRICS
        // =================================================

        try {

            console.log(
                `🎯 /horasbm solicitado → Player ID: ${playerId}`
            );


            const datos =
                await getBattleMetricsHours(
                    playerId
                );


            if (
                !datos
            ) {

                return await interaction.editReply(
                    "❌ No se pudieron encontrar datos para ese jugador en BattleMetrics."
                );
            }


            // =================================================
            // DATOS
            // =================================================

            const nombre =
                datos.nombre ||
                datos.name ||
                "Desconocido";


            const servidor =
                datos.servidor ||
                datos.server ||
                "Desconocido";


            const horas =
                Number(
                    datos.horasTotalesBM ??
                    datos.totalHoras ??
                    0
                );


            const horasSemana =
                Number(
                    datos.horasSemana ||
                    0
                );


            const horasMes =
                Number(
                    datos.horasMes ||
                    0
                );


            const servidoresEncontrados =
                datos.servidoresEncontrados ??
                datos.servidores?.rust?.datos
                    ?.servidoresEncontrados ??
                "N/A";


            const online =
                Boolean(
                    datos.online
                );


            const sesionTexto =
                online
                    ? (
                        datos.jugando ||
                        "0m"
                    )
                    : "Offline";


            const tituloServidor =
                online
                    ? "🌐 Servidor Actual"
                    : "🌐 Último Servidor Jugado";


            // =================================================
            // COLOR
            // =================================================

            const color =
                online
                    ? 0x57F287
                    : 0xED4245;


            // =================================================
            // EMBED
            // =================================================

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        "🎮 Perfil BattleMetrics"
                    )

                    .setColor(
                        color
                    )


                    // =================================================
                    // JUGADOR
                    // =================================================

                    .addFields({

                        name:
                            "👤 Jugador",

                        value:
                            `[${nombre}](https://www.battlemetrics.com/players/${datos.id || playerId})`,

                        inline:
                            false
                    })


                    // =================================================
                    // SERVIDOR
                    // =================================================

                    .addFields({

                        name:
                            tituloServidor,

                        value:
                            servidor,

                        inline:
                            false
                    })


                    // =================================================
                    // SESIÓN ACTUAL
                    // =================================================

                    .addFields({

                        name:
                            "⏱️ Sesión Actual",

                        value:
                            `\`${sesionTexto}\``,

                        inline:
                            true
                    })


                    // =================================================
                    // HORAS TOTALES
                    // =================================================

                    .addFields({

                        name:
                            "📈 Horas BattleMetrics",

                        value:
                            `\`${horas}h\``,

                        inline:
                            true
                    })


                    // =================================================
                    // SERVIDORES
                    // =================================================

                    .addFields({

                        name:
                            "🖥️ Servidores Jugados",

                        value:
                            `\`${servidoresEncontrados}\``,

                        inline:
                            true
                    })


                    // =================================================
                    // SEMANA
                    // =================================================

                    .addFields({

                        name:
                            "📅 Esta Semana",

                        value:
                            `\`${horasSemana}h\``,

                        inline:
                            true
                    })


                    // =================================================
                    // MES
                    // =================================================

                    .addFields({

                        name:
                            "📆 Este Mes",

                        value:
                            `\`${horasMes}h\``,

                        inline:
                            true
                    })


                    // =================================================
                    // ÚLTIMA CONEXIÓN
                    // =================================================

                    .addFields({

                        name:
                            "🕐 Última Conexión",

                        value:
                            `\`${datos.ultimaConexion || "Nunca"}\``,

                        inline:
                            false
                    })


                    // =================================================
                    // FOOTER
                    // =================================================

                    .setTimestamp()

                    .setFooter({
                        text:
                            "RustLogix • BattleMetrics"
                    });


            // =================================================
            // HISTORIAL DE NOMBRES
            // =================================================

            if (
                Array.isArray(
                    datos.historialNombres
                ) &&
                datos.historialNombres.length > 0
            ) {

                embed.addFields({

                    name:
                        "📝 Historial de nombres",

                    value:
                        datos.historialNombres
                            .map(
                                nombre =>
                                    `• ${nombre}`
                            )
                            .join("\n"),

                    inline:
                        false
                });
            }


            // =================================================
            // RESPUESTA
            // =================================================

            await interaction.editReply({

                embeds: [
                    embed
                ]

            });


            console.log(
                `✅ /horasbm completado → ${nombre} (${horas}h)`
            );


        } catch (error) {

            console.error(
                "❌ Error en comando /horasbm:",
                error.response?.data ||
                error.stack ||
                error.message
            );


            try {

                await interaction.editReply({

                    content:
                        "❌ Ocurrió un error al intentar conectar con BattleMetrics. Inténtalo de nuevo más tarde."

                });

            } catch (
                errorRespuesta
            ) {

                console.error(
                    "❌ No se pudo enviar el mensaje de error:",
                    errorRespuesta.message
                );
            }
        }
    }

};