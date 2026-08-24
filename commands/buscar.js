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
                "❌ Error MongoDB:",
                error.message
            );
        }

        // =================================================
        // SIN SERVIDOR
        // =================================================

        if (!serverId) {

            return await interaction.editReply(
                "❌ Este servidor de Discord no tiene un servidor de BattleMetrics configurado."
            );
        }

        console.log(
            `🎯 /buscar "${nombre}" → servidor configurado ${serverId}`
        );

        // =================================================
        // BUSCAR PERFIL + SERVIDOR
        // =================================================

        let jugadorBM = null;

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
                embeds: [embed]
            });
        }

        // =================================================
        // DATOS
        // =================================================

        const nombreJugador =
            jugadorBM.name ||
            nombre;

        const playerId =
            jugadorBM.id;

        const serverName =
            jugadorBM.serverName ||
            `Servidor ${serverId}`;

        const horas =
            Number(
                jugadorBM.horas
            ) || 0;

        const minutos =
            Number(
                jugadorBM.minutos
            ) || 0;

        const tiempoJugado =
            jugadorBM.tiempoJugado ||
            `${horas}h ${minutos}m`;

        const estado =
            jugadorBM.online
                ? `🟢 Online · ${tiempoJugado}`
                : "🔴 Offline";

        // =================================================
        // EMBED
        // =================================================

        const embed =
            new EmbedBuilder()

                .setTitle(
                    `🔎 ${nombreJugador}`
                )

                .setColor(
                    jugadorBM.online
                        ? "#57F287"
                        : "#5865F2"
                )

                .setDescription(
                    `Perfil encontrado en BattleMetrics.\n\n` +
                    `El perfil **sí tiene historial en el servidor configurado**, aunque actualmente esté offline.`
                )

                .addFields(

                    // -------------------------------------
                    // SERVIDOR
                    // -------------------------------------

                    {
                        name:
                            "🎮 Último servidor",

                        value:
                            `[${serverName}](https://www.battlemetrics.com/servers/rust/${serverId})`,

                        inline:
                            false
                    },

                    // -------------------------------------
                    // ID SERVIDOR
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
                    // ID JUGADOR
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
                    // HORAS
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
        // SI HAY VARIOS PERFILES
        // =================================================

        if (
            jugadorBM.candidatos &&
            jugadorBM.candidatos.length > 1
        ) {

            const lista =
                jugadorBM.candidatos
                    .slice(0, 5)
                    .map(
                        candidato =>
                            `• **${candidato.name}** — BM \`${candidato.id}\``
                    )
                    .join("\n");

            embed.addFields({

                name:
                    "👥 Otros perfiles con historial",

                value:
                    lista,

                inline:
                    false
            });
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