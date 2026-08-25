const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    buscarJugadoresHistoricos
} = require("../services/battlemetricsBuscar.js");

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
                "Busca todos los perfiles de un jugador y comprueba su actividad reciente en el servidor configurado"
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


        // =================================================
        // NOMBRE
        // =================================================

        const nombre =
            interaction.options
                .getString("nombre")
                ?.trim();


        if (!nombre) {

            return await interaction.editReply(
                "❌ Debes introducir un nombre."
            );

        }


        // =================================================
        // SERVIDOR CONFIGURADO
        // =================================================

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


        // =================================================
        // SIN SERVIDOR
        // =================================================

        if (!serverId) {

            return await interaction.editReply({

                content:
                    "❌ Este servidor de Discord no tiene un servidor de BattleMetrics configurado."

            });

        }


        // =================================================
        // LOG
        // =================================================

        console.log(
            `🎯 Ejecutando /buscar`
        );

        console.log(
            `🎯 /buscar "${nombre}" → servidor ${serverId}`
        );


        // =================================================
        // BUSCAR TODOS LOS PERFILES VÁLIDOS
        // =================================================

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
        // NINGUNO ENCONTRADO
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
                        `No se encontró ningún perfil de **${nombre}** que esté conectado al servidor configurado o que haya estado offline durante los últimos **60 minutos**.`
                    )

                    .addFields(

                        {

                            name:
                                "🎮 Servidor consultado",

                            value:
                                `[Servidor BattleMetrics](https://www.battlemetrics.com/servers/rust/${serverId})`,

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
                                "`Todos los perfiles + nombre exacto + sesiones + Last Seen`",

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
                    [embed]

            });

        }


        // =================================================
        // CREAR EMBED PRINCIPAL
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

                        ? `Se encontró **1 perfil** que cumple las condiciones de actividad en el servidor configurado.`

                        : `Se encontraron **${jugadores.length} perfiles** con el nombre exacto **${nombre}** que cumplen las condiciones de actividad en el servidor configurado.`

                )

                .addFields({

                    name:
                        "🎮 Servidor consultado",

                    value:
                        `[Servidor BattleMetrics](https://www.battlemetrics.com/servers/rust/${serverId})`,

                    inline:
                        false

                });


        // =================================================
        // AÑADIR CADA PERFIL
        // =================================================

        for (
            let indice = 0;
            indice < jugadores.length;
            indice++
        ) {

            const jugador =
                jugadores[indice];


            // =================================================
            // ESTADO
            // =================================================

            const estado =
                jugador.online

                    ? `🟢 **Online** · ${jugador.tiempoSesionActual || "0m"}`

                    : `🔴 **Offline** · hace ${jugador.lastSeenMinutes ?? "?"} min`;


            // =================================================
            // LAST SEEN
            // =================================================

            const lastSeen =
                jugador.online

                    ? "Actualmente conectado"

                    : jugador.lastSeen ||
                      "No disponible";


            // =================================================
            // CAMPO DEL PERFIL
            // =================================================

            embed.addFields({

                name:
                    `${jugador.online ? "🟢" : "🔴"} ${jugador.name} · Perfil ${indice + 1}`,

                value:

                    `🆔 **BattleMetrics:** [${jugador.id}](${jugador.perfilUrl})\n` +

                    `🎮 **Estado:** ${estado}\n` +

                    `📈 **Horas en servidor:** \`${jugador.tiempoServidor || "0m"}\`\n` +

                    `🌐 **Horas totales BM:** \`${jugador.tiempoJugado || "0m"}\`\n` +

                    `🔄 **Sesiones en servidor:** \`${jugador.sesionesServidor || 0}\`\n` +

                    `📅 **Primera conexión:** \`${jugador.primeraConexion || "No disponible"}\`\n` +

                    `🕐 **Última conexión:** \`${jugador.ultimaConexion || "Nunca"}\`\n` +

                    `⏱️ **Last Seen:** \`${lastSeen}\``,

                inline:
                    false

            });

        }


        // =================================================
        // INFORMACIÓN DEL CRITERIO
        // =================================================

        embed.addFields({

            name:
                "📡 Criterio de búsqueda",

            value:
                "Se revisan **todos los perfiles encontrados por BattleMetrics** con **nombre exacto**. De ellos, se muestran todos los que tengan historial en el servidor configurado y estén **online** o **offline durante un máximo de 60 minutos**.",

            inline:
                false

        });


        // =================================================
        // FOOTER
        // =================================================

        embed.setFooter({

            text:
                `RustLogix • BattleMetrics • ${jugadores.length} perfil(es) encontrado(s)`

        });


        embed.setTimestamp();


        // =================================================
        // LOG FINAL
        // =================================================

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


        // =================================================
        // RESPUESTA
        // =================================================

        return await interaction.editReply({

            embeds:
                [embed]

        });

    }

};