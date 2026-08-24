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
                "Busca un jugador en BattleMetrics y comprueba su historial en el servidor configurado"
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
        // BUSCAR PERFIL + HISTORIAL
        // =================================================

        let jugadorBM = null;


        try {

            jugadorBM =
                await buscarJugadorHistorico(
                    nombre,
                    serverId
                );

        } catch (error) {

            console.error(
                "❌ Error buscando jugador:",
                error
            );

        }


        // =================================================
        // NO ENCONTRADO
        // =================================================

        if (!jugadorBM) {

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        "🔍 Jugador no encontrado"
                    )

                    .setColor(
                        "#FF0000"
                    )

                    .setDescription(
                        `No se encontró un perfil de **${nombre}** que tenga historial reciente en el servidor configurado.`
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
                    [embed]

            });

        }


        // =================================================
        // DATOS DEL JUGADOR
        // =================================================

        const nombreJugador =
            jugadorBM.name ||
            nombre;


        const playerId =
            jugadorBM.id;


        const serverName =
            jugadorBM.serverName ||
            `Servidor ${serverId}`;


        const tiempoJugado =
            jugadorBM.tiempoJugado ||
            "0m";


        // =================================================
        // ESTADO
        // =================================================
        //
        // IMPORTANTE:
        //
        // jugadorBM.online debe representar el estado
        // del jugador en el servidor configurado.
        //
        // =================================================

        const estaOnline =
            Boolean(
                jugadorBM.online
            );


        const estado =
            estaOnline

                ? `🟢 Online · ${tiempoJugado}`

                : "🔴 Offline";


        // =================================================
        // DESCRIPCIÓN DINÁMICA
        // =================================================

        let descripcion;


        if (estaOnline) {

            descripcion =
                `Perfil encontrado en BattleMetrics.\n\n` +

                `El perfil **está actualmente conectado al servidor configurado**.`;

        } else {

            descripcion =
                `Perfil encontrado en BattleMetrics.\n\n` +

                `El perfil **sí tiene historial en el servidor configurado**, aunque actualmente esté offline.`;

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
                    // SERVIDOR
                    // -------------------------------------

                    {

                        name:
                            "🎮 Servidor",

                        value:
                            `[${serverName}](https://www.battlemetrics.com/servers/rust/${serverId})`,

                        inline:
                            false

                    },


                    // -------------------------------------
                    // SERVER ID
                    // -------------------------------------

                    {

                        name:
                            "🆔 Server ID",

                        value:
                            `\`${serverId}\``,

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
                            `[${playerId}](https://www.battlemetrics.com/players/${playerId})`,

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
                            `\`${estado}\``,

                        inline:
                            true

                    },


                    // -------------------------------------
                    // TIEMPO
                    // -------------------------------------

                    {

                        name:
                            "📈 Tiempo en servidor",

                        value:
                            `\`${tiempoJugado}\``,

                        inline:
                            true

                    },


                    // -------------------------------------
                    // SESIONES
                    // -------------------------------------

                    {

                        name:
                            "🔄 Sesiones",

                        value:
                            `\`${jugadorBM.sesiones || 0}\``,

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
                            `\`${jugadorBM.primeraConexion || "No disponible"}\``,

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
                            `\`${jugadorBM.ultimaConexion || "Nunca"}\``,

                        inline:
                            true

                    }

                )

                .setFooter({

                    text:
                        `RustLogix • BattleMetrics • Servidor ${serverId}`

                })

                .setTimestamp();


        // =================================================
        // OTROS PERFILES CON HISTORIAL
        // =================================================

        if (

            jugadorBM.candidatos &&
            jugadorBM.candidatos.length > 0

        ) {

            const lista =
                jugadorBM.candidatos

                    .slice(0, 5)

                    .map(

                        candidato =>

                            `• **${candidato.name}** — BM \`${candidato.id}\``

                    )

                    .join("\n");


            if (lista) {

                embed.addFields({

                    name:
                        "👥 Otros perfiles con historial",

                    value:
                        lista,

                    inline:
                        false

                });

            }

        }


        // =================================================
        // RESPUESTA
        // =================================================

        console.log(
            `✅ /buscar terminado → ${nombreJugador} (${playerId})`
        );


        return await interaction.editReply({

            embeds:
                [embed]

        });

    }

};