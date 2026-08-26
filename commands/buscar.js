const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    buscarJugadoresHistoricos
} = require("../services/battlemetricsBuscar.js");

const ServerConfig =
    require("../models/ServerConfig");

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("buscar")

            .setDescription(
                "Busca todos los perfiles de un jugador y comprueba su actividad en el servidor configurado"
            )

            .addStringOption(
                option =>
                    option
                        .setName("nombre")
                        .setDescription(
                            "Nombre exacto del jugador"
                        )
                        .setRequired(true)
            ),

    async execute(interaction) {

        await interaction.deferReply();

        const nombre =
            interaction.options
                .getString("nombre")
                ?.trim();

        if (!nombre) {

            return await interaction.editReply(
                "❌ Debes introducir un nombre."
            );

        }

        let serverId = null;

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
                "❌ Error obteniendo configuración del servidor:",
                error.message
            );

        }

        if (!serverId) {

            return await interaction.editReply({

                content:
                    "❌ Este servidor de Discord no tiene un servidor de BattleMetrics configurado."

            });

        }

        console.log(
            "================================================="
        );

        console.log(
            `🎯 Ejecutando /buscar "${nombre}"`
        );

        console.log(
            `🎮 Servidor configurado: ${serverId}`
        );

        console.log(
            "================================================="
        );

        let jugadores = [];

        try {

            jugadores =
                await buscarJugadoresHistoricos(
                    nombre,
                    serverId
                );

        } catch (error) {

            console.error(
                "❌ Error buscando jugadores:",
                error
            );

            jugadores = [];

        }

        // =================================================
        // NINGÚN RESULTADO
        // =================================================

        if (
            !Array.isArray(jugadores) ||
            jugadores.length === 0
        ) {

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        "🔍 Jugador no encontrado"
                    )

                    .setColor(
                        "#FF0000"
                    )

                    .setDescription(
                        `No se encontró ningún perfil de **${nombre}** con actividad reciente en el servidor configurado.`
                    )

                    .addFields(

                        {

                            name:
                                "🎮 Servidor consultado",

                            value:
                                `[BattleMetrics](https://www.battlemetrics.com/servers/rust/${serverId})`,

                            inline:
                                true

                        },

                        {

                            name:
                                "🔎 Nombre",

                            value:
                                `\`${nombre}\``,

                            inline:
                                true

                        },

                        {

                            name:
                                "📡 Método",

                            value:
                                "`Búsqueda global + búsqueda por servidor + jugadores directos del servidor + nombre exacto + sesiones + Last Seen`",

                            inline:
                                false

                        }

                    )

                    .setFooter({

                        text:
                            "RustLogix • BattleMetrics"

                    })

                    .setTimestamp();

            return await interaction.editReply({

                embeds:
                    [embed]

            });

        }

        // =================================================
        // EMBED PRINCIPAL
        // =================================================

        const embed =
            new EmbedBuilder()

                .setTitle(
                    `🔎 Resultados para "${nombre}"`
                )

                .setColor(

                    jugadores.some(
                        jugador =>
                            jugador.online
                    )

                        ? "#57F287"

                        : "#5865F2"

                )

                .setDescription(

                    jugadores.length === 1

                        ? "Se encontró **1 perfil** con actividad reciente en el servidor."

                        : `Se encontraron **${jugadores.length} perfiles** con actividad reciente en el servidor.`

                )

                .addFields({

                    name:
                        "🎮 Servidor consultado",

                    value:
                        `[BattleMetrics](https://www.battlemetrics.com/servers/rust/${serverId})`,

                    inline:
                        false

                });

        // =================================================
        // RESULTADOS
        // =================================================

        const resultadosPorCampo = 5;

        for (
            let inicio = 0;
            inicio < jugadores.length;
            inicio += resultadosPorCampo
        ) {

            const grupo =
                jugadores.slice(
                    inicio,
                    inicio + resultadosPorCampo
                );

            const texto =
                grupo
                    .map(
                        (jugador, posicion) => {

                            const indice =
                                inicio +
                                posicion;

                            const estado =
                                jugador.online

                                    ? `🟢 **Online** · ${jugador.tiempoSesionActual || "0m"}`

                                    : `🔴 **Offline** · hace ${jugador.lastSeenMinutes ?? "?"} min`;

                            const lastSeen =
                                jugador.online

                                    ? "Actualmente conectado"

                                    : jugador.lastSeen ||
                                      "No disponible";

                            return (

                                `${jugador.online ? "🟢" : "🔴"} **Perfil ${indice + 1} — ${jugador.name}**\n` +

                                `🆔 **BattleMetrics:** [${jugador.id}](${jugador.perfilUrl})\n` +

                                `🎮 **Estado:** ${estado}\n` +

                                `📈 **Horas servidor:** \`${jugador.tiempoServidor || "0m"}\`\n` +

                                `🌐 **Horas totales BM:** \`${jugador.tiempoJugado || "0m"}\`\n` +

                                `🔄 **Sesiones servidor:** \`${jugador.sesionesServidor || 0}\`\n` +

                                `📅 **Primera conexión:** \`${jugador.primeraConexion || "No disponible"}\`\n` +

                                `🕐 **Última conexión:** \`${jugador.ultimaConexion || "Nunca"}\`\n` +

                                `⏱️ **Last Seen:** \`${lastSeen}\``

                            );

                        }
                    )
                    .join("\n\n");

            embed.addFields({

                name:
                    `👥 Perfiles ${inicio + 1}-${Math.min(inicio + resultadosPorCampo, jugadores.length)}`,

                value:
                    texto,

                inline:
                    false

            });

        }

        // =================================================
        // CRITERIO
        // =================================================

        if (
            embed.data.fields.length < 25
        ) {

            embed.addFields({

                name:
                    "📡 Criterio de búsqueda",

                value:
                    "Se revisan todos los perfiles exactos que BattleMetrics devuelve mediante búsqueda global, búsqueda por servidor y recorrido directo de los jugadores relacionados con el servidor. Los perfiles se comparan por nombre exacto. Se exige relación o historial en el servidor configurado. Los perfiles offline se muestran únicamente si su último registro está dentro de los **60 minutos**.",

                inline:
                    false

            });

        }

        // =================================================
        // FOOTER
        // =================================================

        embed.setFooter({

            text:
                `RustLogix • BattleMetrics • ${jugadores.length} perfil(es) encontrado(s)`

        });

        embed.setTimestamp();

        // =================================================
        // LOG
        // =================================================

        console.log(
            "================================================="
        );

        console.log(
            `✅ /buscar terminado → ${jugadores.length} perfil(es) válido(s)`
        );

        for (
            const jugador of jugadores
        ) {

            console.log(

                `   👤 ${jugador.name}` +
                ` → ${jugador.id}` +
                ` → ${jugador.online ? "ONLINE" : "OFFLINE"}` +
                ` → Last Seen ${jugador.lastSeenMinutes ?? "?"} min`

            );

        }

        console.log(
            "================================================="
        );

        return await interaction.editReply({

            embeds:
                [embed]

        });

    }

};