const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    buscarJugadorHistorico
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
                "Busca jugadores en BattleMetrics y comprueba su actividad reciente en el servidor configurado"
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
            `🎯 /buscar "${nombre}" → servidor configurado ${serverId}`
        );


        // =================================================
        // BUSCAR TODOS LOS PERFILES VÁLIDOS
        // =================================================

        let jugadores = [];


        try {

            jugadores =
                await buscarJugadorHistorico(
                    nombre,
                    serverId
                );

        } catch (error) {

            console.error(
                "❌ Error buscando jugadores:",
                error
            );

        }


        // =================================================
        // NO ENCONTRADO
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
                        `No se encontró un perfil de **${nombre}** que esté conectado al servidor configurado o que haya estado offline durante los últimos **60 minutos**.`
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
                                "`Nombre exacto + sesiones + Last Seen`",

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
        // LOG RESULTADOS
        // =================================================

        console.log(
            `✅ /buscar → ${jugadores.length} perfil(es) válido(s) encontrado(s)`
        );


        // =================================================
        // CREAR EMBEDS
        // =================================================

        const embeds = [];


        for (
            let indice = 0;
            indice < jugadores.length;
            indice++
        ) {

            const jugador =
                jugadores[indice];


            const nombreJugador =
                jugador.name ||
                nombre;


            const playerId =
                jugador.id;


            const estaOnline =
                Boolean(
                    jugador.online
                );


            const estado =
                estaOnline

                    ? `🟢 Online · ${jugador.tiempoSesionActual || "0m"}`

                    : `🔴 Offline · hace ${jugador.lastSeenMinutes ?? "?"} min`;


            // =================================================
            // DESCRIPCIÓN
            // =================================================

            let descripcion;


            if (estaOnline) {

                descripcion =
                    `Perfil **${indice + 1} de ${jugadores.length}** encontrado.\n\n` +
                    `El jugador **está actualmente conectado al servidor configurado**.`;

            } else {

                descripcion =
                    `Perfil **${indice + 1} de ${jugadores.length}** encontrado.\n\n` +
                    `El jugador está **offline**, pero su última actividad en el servidor fue hace **${jugador.lastSeenMinutes ?? "?"} minutos**.`;

            }


            // =================================================
            // EMBED
            // =================================================

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        `🔎 ${nombreJugador}`
                    )

                    .setColor(

                        estaOnline
                            ? "#57F287"
                            : "#5865F2"

                    )

                    .setDescription(
                        descripcion
                    )

                    .addFields(

                        // -------------------------------------
                        // PERFIL
                        // -------------------------------------

                        {

                            name:
                                "🆔 BattleMetrics",

                            value:
                                `[Ver perfil](https://www.battlemetrics.com/players/${playerId})`,

                            inline:
                                false

                        },

                        // -------------------------------------
                        // SERVIDOR
                        // -------------------------------------

                        {

                            name:
                                "🎮 Servidor",

                            value:
                                `[${jugador.serverName || `Servidor ${serverId}`}](https://www.battlemetrics.com/servers/rust/${serverId})`,

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
                        // HORAS SERVIDOR
                        // -------------------------------------

                        {

                            name:
                                "📈 Horas en servidor",

                            value:
                                `\`${jugador.tiempoServidor || "0m"}\``,

                            inline:
                                true

                        },

                        // -------------------------------------
                        // HORAS TOTALES BM
                        // -------------------------------------

                        {

                            name:
                                "🌐 Horas totales BattleMetrics",

                            value:
                                `\`${jugador.tiempoJugado || "0m"}\``,

                            inline:
                                true

                        },

                        // -------------------------------------
                        // SESIONES
                        // -------------------------------------

                        {

                            name:
                                "🔄 Sesiones en servidor",

                            value:
                                `\`${jugador.sesionesServidor || 0}\``,

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
                                `\`${jugador.primeraConexion || "No disponible"}\``,

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
                                `\`${jugador.ultimaConexion || "Nunca"}\``,

                            inline:
                                true

                        },

                        // -------------------------------------
                        // LAST SEEN
                        // -------------------------------------

                        {

                            name:
                                "👁️ Last Seen",

                            value:
                                estaOnline
                                    ? "`Actualmente online`"
                                    : `\`${jugador.lastSeen || "No disponible"}\` · hace \`${jugador.lastSeenMinutes ?? "?"} min\``,

                            inline:
                                false

                        }

                    )

                    .setFooter({

                        text:
                            `RustLogix • BattleMetrics • Perfil ${indice + 1}/${jugadores.length}`

                    })

                    .setTimestamp();


            embeds.push(
                embed
            );
        }


        // =================================================
        // RESPUESTA
        // =================================================
        //
        // Discord permite hasta 10 embeds por mensaje.
        //
        // Si hay más de 10 perfiles válidos, mandamos
        // primero los 10 y después el resto.
        //
        // =================================================

        const MAX_EMBEDS_POR_MENSAJE = 10;


        if (
            embeds.length <=
            MAX_EMBEDS_POR_MENSAJE
        ) {

            console.log(
                `✅ /buscar terminado → ${jugadores.length} perfil(es)`
            );


            return await interaction.editReply({

                embeds

            });

        }


        // =================================================
        // MÁS DE 10 PERFILES
        // =================================================

        const primeraParte =
            embeds.slice(
                0,
                MAX_EMBEDS_POR_MENSAJE
            );


        const resto =
            embeds.slice(
                MAX_EMBEDS_POR_MENSAJE
            );


        await interaction.editReply({

            embeds:
                primeraParte

        });


        for (
            let inicio = 0;
            inicio < resto.length;
            inicio += MAX_EMBEDS_POR_MENSAJE
        ) {

            await interaction.followUp({

                embeds:
                    resto.slice(
                        inicio,
                        inicio +
                        MAX_EMBEDS_POR_MENSAJE
                    )

            });

        }


        console.log(
            `✅ /buscar terminado → ${jugadores.length} perfil(es) en total`
        );

    }

};