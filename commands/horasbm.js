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
            .setName("horasbm")
            .setDescription(
                "Muestra las horas y estadísticas de BattleMetrics mediante el link del perfil"
            )
            .addStringOption(
                option =>
                    option
                        .setName("link")
                        .setDescription(
                            "Link del perfil de BattleMetrics"
                        )
                        .setRequired(true)
            ),

    // =================================================
    // EXECUTE
    // =================================================

    async execute(interaction) {

        const linkInput =
            interaction.options
                .getString("link")
                ?.trim();

        await interaction.deferReply();

        // =================================================
        // VALIDAR LINK
        // =================================================

        if (!linkInput) {

            return await interaction.editReply(
                "❌ Debes proporcionar un link de perfil de BattleMetrics."
            );

        }

        /*
         * Acepta:
         *
         * https://www.battlemetrics.com/players/123456789
         * https://battlemetrics.com/players/123456789
         *
         * También acepta texto adicional después del ID.
         */

        const match =
            linkInput.match(
                /battlemetrics\.com\/players\/(\d+)/i
            );

        if (!match || !match[1]) {

            return await interaction.editReply(
                "❌ El enlace proporcionado no es válido.\n\n" +
                "Usa un enlace como:\n" +
                "`https://www.battlemetrics.com/players/123456789`"
            );

        }

        const playerId = match[1];

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

            if (!datos) {

                return await interaction.editReply(
                    "❌ No se pudieron encontrar datos para ese jugador en BattleMetrics."
                );

            }

            // =================================================
            // DATOS PRINCIPALES
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
                datos.horasTotalesBM ??
                datos.totalHoras ??
                "0h";

            const horasSemana =
                datos.horasSemana ??
                "0h";

            const horasMes =
                datos.horasMes ??
                "0h";

            const servidoresEncontrados =
                datos.servidoresEncontrados ??
                datos.cantidadServidoresRust ??
                datos.servidores?.rust?.datos
                    ?.servidoresEncontrados ??
                "N/A";

            const online =
                Boolean(datos.online);

            const sesionTexto =
                online
                    ? (
                        datos.jugando ||
                        "Jugando"
                    )
                    : "Offline";

            const tituloServidor =
                online
                    ? "🌐 Servidor Actual"
                    : "🌐 Último Servidor Jugado";

            // =================================================
            // TOP 10 SERVIDORES
            // =================================================

            const top10 =
                Array.isArray(datos.top10)
                    ? datos.top10
                    : Array.isArray(datos.topServidoresRust)
                        ? datos.topServidoresRust
                        : Array.isArray(
                            datos.servidores?.rust?.top10
                        )
                            ? datos.servidores.rust.top10
                            : [];

            let top10Texto =
                "No disponible";

            if (top10.length > 0) {

                top10Texto =
                    top10
                        .slice(0, 10)
                        .map((server, index) => {

                            const serverId =
                                server.id ||
                                server.serverId;

                            const serverName =
                                server.nombre ||
                                server.name ||
                                "Servidor desconocido";

                            const tiempo =
                                server.tiempo ||
                                server.horas ||
                                server.duracion ||
                                "0h";

                            const url =
                                serverId
                                    ? `https://www.battlemetrics.com/servers/${serverId}`
                                    : null;

                            const nombreFormateado =
                                url
                                    ? `[${serverName}](${url})`
                                    : serverName;

                            return (
                                `**${index + 1}.** ` +
                                `${nombreFormateado} — \`${tiempo}\``
                            );

                        })
                        .join("\n");

            }

            // =================================================
            // COLOR
            // =================================================

            const color =
                online
                    ? 0x57F287
                    : 0xED4245;

            // =================================================
            // ID BATTLEMETRICS
            // =================================================

            const battleMetricsId =
                datos.id ||
                playerId;

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
                            `[${nombre}](https://www.battlemetrics.com/players/${battleMetricsId})`,

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
                            `\`${horas}\``,

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
                            `\`${horasSemana}\``,

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
                            `\`${horasMes}\``,

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
                    // TOP 10
                    // =================================================

                    .addFields({
                        name:
                            "🏆 Top 10 servidores de Rust",

                        value:
                            top10Texto,

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
                `✅ /horasbm completado → ${nombre} (${horas})`
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

            } catch (errorRespuesta) {

                console.error(
                    "❌ No se pudo enviar el mensaje de error:",
                    errorRespuesta.message
                );

            }

        }

    }

};