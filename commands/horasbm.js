const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getBattleMetricsHours
} = require("../battlemetricsHours");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("horasbm")
        .setDescription("Consulta las horas y estadísticas de BattleMetrics")
        .addStringOption(option =>
            option
                .setName("perfil")
                .setDescription("Link del perfil de BattleMetrics")
                .setRequired(true)
        ),

    async execute(interaction) {

        await interaction.deferReply();

        try {

            // ============================================================
            // LINK DEL PERFIL
            // ============================================================

            const perfil =
                interaction.options.getString("perfil");

            const match =
                perfil.match(
                    /battlemetrics\.com\/players\/(\d+)/i
                );

            if (!match) {

                return interaction.editReply(
                    "❌ Debes ingresar un enlace válido de BattleMetrics.\n\n" +
                    "Ejemplo:\n" +
                    "https://www.battlemetrics.com/players/103232202"
                );
            }

            const playerId =
                match[1];


            // ============================================================
            // OBTENER DATOS
            // ============================================================

            const datos =
                await getBattleMetricsHours(
                    playerId
                );

            if (!datos) {

                return interaction.editReply(
                    "❌ No se pudieron obtener los datos de BattleMetrics."
                );
            }


            // ============================================================
            // DATOS BÁSICOS
            // ============================================================

            const nombre =
                datos.nombre ||
                datos.name ||
                "Desconocido";

            const jugadorUrl =
                `https://www.battlemetrics.com/players/${playerId}`;


            // ============================================================
            // SERVIDOR ACTUAL
            // ============================================================

            const servidor =
                datos.servidor ||
                datos.server ||
                datos.servidorActualRust?.nombre ||
                "Ninguno";


            // ============================================================
            // SESIÓN ACTUAL
            // ============================================================

            let sesionActual =
                "Offline";

            if (
                datos.online ||
                datos.jugando
            ) {

                sesionActual =
                    datos.jugando ||
                    servidor ||
                    "Jugando";
            }


            // ============================================================
            // HORAS BATTLEMETRICS
            //
            // totalHoras ya viene convertido:
            // "2763h 34m"
            //
            // NO usamos horasTotalesBM porque ese valor son segundos.
            // ============================================================

            const horas =
                datos.totalHoras ||
                "0h";


            // ============================================================
            // SERVIDORES JUGADOS
            //
            // cantidadServidoresRust = cantidad real de servidores.
            //
            // servidoresEncontrados puede contener el array del Top 10,
            // por eso nunca lo mostramos directamente.
            // ============================================================

            let servidoresJugados = 0;

            if (
                datos.cantidadServidoresRust !== null &&
                typeof datos.cantidadServidoresRust !== "undefined"
            ) {

                const cantidad =
                    Number(
                        datos.cantidadServidoresRust
                    );

                if (
                    Number.isFinite(cantidad)
                ) {

                    servidoresJugados =
                        cantidad;
                }
            }

            // Fallback por si cantidadServidoresRust no existe
            if (
                servidoresJugados === 0 &&
                Array.isArray(
                    datos.servidoresEncontrados
                )
            ) {

                servidoresJugados =
                    datos.servidoresEncontrados.length;
            }


            // ============================================================
            // SEMANA
            // ============================================================

            const semana =
                datos.horasSemana ||
                "0h";


            // ============================================================
            // MES
            // ============================================================

            const mes =
                datos.horasMes ||
                "0h";


            // ============================================================
            // ÚLTIMA CONEXIÓN
            // ============================================================

            const ultimaConexion =
                datos.ultimaConexion ||
                "N/A";


            // ============================================================
            // COLOR
            // ============================================================

            const color =
                datos.online
                    ? 0x57F287
                    : 0xED4245;


            // ============================================================
            // EMBED
            // ============================================================

            const embed =
                new EmbedBuilder()
                    .setColor(color)
                    .setTitle("🎮 Perfil BattleMetrics")
                    .addFields(

                        {
                            name: "👤 Jugador",
                            value:
                                `[${nombre}](${jugadorUrl})`,
                            inline: false
                        },

                        {
                            name: "🌐 Servidor Actual",
                            value:
                                servidor,
                            inline: false
                        },

                        {
                            name: "⏱️ Sesión Actual",
                            value:
                                `\`${sesionActual}\``,
                            inline: false
                        },

                        {
                            name: "📈 Horas BattleMetrics",
                            value:
                                `\`${horas}\``,
                            inline: true
                        },

                        {
                            name: "🖥️ Servidores Jugados",
                            value:
                                `\`${servidoresJugados}\``,
                            inline: true
                        },

                        {
                            name: "📅 Esta Semana",
                            value:
                                `\`${semana}\``,
                            inline: true
                        },

                        {
                            name: "📆 Este Mes",
                            value:
                                `\`${mes}\``,
                            inline: true
                        },

                        {
                            name: "🕐 Última Conexión",
                            value:
                                `\`${ultimaConexion}\``,
                            inline: true
                        }
                    );


            // ============================================================
            // TOP 10 SERVIDORES RUST
            // ============================================================

            const top10 =
                Array.isArray(
                    datos.top10
                )
                    ? datos.top10
                    : (
                        Array.isArray(
                            datos.topServidoresRust
                        )
                            ? datos.topServidoresRust
                            : []
                    );


            if (
                top10.length > 0
            ) {

                const listaTop =
                    top10
                        .slice(0, 10)
                        .map(
                            (server, index) => {

                                const serverId =
                                    server.id ||
                                    server.serverId;

                                const serverName =
                                    server.nombre ||
                                    server.name ||
                                    `Servidor ${serverId}`;

                                const tiempo =
                                    server.tiempo ||
                                    server.horas ||
                                    server.duracion ||
                                    "0h";


                                // ----------------------------------------
                                // SIN ID
                                // ----------------------------------------

                                if (!serverId) {

                                    return (
                                        `**${index + 1}.** ` +
                                        `${serverName} — ` +
                                        `\`${tiempo}\``
                                    );
                                }


                                // ----------------------------------------
                                // CON ID
                                // ----------------------------------------

                                const serverUrl =
                                    `https://www.battlemetrics.com/servers/${serverId}`;

                                return (
                                    `**${index + 1}.** ` +
                                    `[${serverName}](${serverUrl})` +
                                    ` — \`${tiempo}\``
                                );
                            }
                        )
                        .join("\n");


                embed.addFields({

                    name:
                        "🏆 Top 10 servidores de Rust",

                    value:
                        listaTop,

                    inline: false
                });
            }


            // ============================================================
            // HISTORIAL DE NOMBRES
            // ============================================================

            if (
                Array.isArray(
                    datos.historialNombres
                ) &&
                datos.historialNombres.length > 0
            ) {

                const historial =
                    datos.historialNombres
                        .slice(0, 10)
                        .map(
                            nombre =>
                                `• ${nombre}`
                        )
                        .join("\n");


                embed.addFields({

                    name:
                        "📝 Historial de nombres",

                    value:
                        historial,

                    inline: false
                });
            }


            // ============================================================
            // FOOTER
            // ============================================================

            embed.setFooter({
                text:
                    "RustLogix • BattleMetrics"
            });

            embed.setTimestamp();


            // ============================================================
            // RESPUESTA
            // ============================================================

            await interaction.editReply({
                embeds: [embed]
            });


            console.log(
                `✅ /horasbm completado para ${nombre} (${playerId})`
            );


        } catch (error) {

            console.error(
                "❌ Error en /horasbm:",
                error
            );

            await interaction.editReply(
                "❌ Ocurrió un error al consultar BattleMetrics."
            );
        }
    }
};