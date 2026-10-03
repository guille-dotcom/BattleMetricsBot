const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    resolverJugadorTracker,
    registrarTracker,
    obtenerServidorConfigurado,
    crearEmbedOnline,
    crearEmbedOtroServidor,
    crearEmbedOffline,
    crearBotonBattleMetrics
} = require("../services/trackerService");

const {
    getBattleMetricsPlayerStatus
} = require("../services/battlemetricsSearch");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("tracker")

        .setDescription(
            "Vigila a un jugador durante 24 horas"
        )

        .addStringOption(option =>
            option
                .setName("jugador")
                .setDescription(
                    "ID/link de BattleMetrics o Steam ID"
                )
                .setRequired(true)
        ),

    async execute(interaction) {

        console.log("🎯 Ejecutando /tracker");

        await interaction.deferReply();

        try {

            // =====================================================
            // ENTRADA
            // =====================================================

            const entrada =
                interaction.options
                    .getString("jugador")
                    .trim();

            // =====================================================
            // RESOLVER JUGADOR
            // =====================================================

            const resultado =
                await resolverJugadorTracker(
                    entrada,
                    interaction.guild.id
                );

            // =====================================================
            // ERRORES DE RESOLUCIÓN
            // =====================================================

            if (
                !resultado ||
                !resultado.ok ||
                !resultado.battlemetricsId
            ) {

                let mensaje =
                    "❌ No se pudo encontrar el jugador.";

                switch (
                    resultado?.error
                ) {

                    case "entrada_invalida":

                        mensaje =
                            "❌ La entrada no es válida. Usa un ID/link de BattleMetrics o un Steam ID de 17 dígitos.";

                        break;

                    case "servidor_no_configurado":

                        mensaje =
                            "❌ Este servidor de Discord no tiene configurado un servidor de BattleMetrics.";

                        break;

                    case "steam_no_encontrado":

                        mensaje =
                            "❌ No se pudo encontrar ese Steam ID.";

                        break;

                    case "jugador_no_encontrado_servidor":

                        mensaje =
                            `❌ No se encontró a **${resultado.nombreSteam || "ese jugador"}** en el servidor de BattleMetrics configurado.`;

                        break;
                }

                return await interaction.editReply(
                    mensaje
                );
            }

            // =====================================================
            // DATOS DEL JUGADOR
            // =====================================================

            const battlemetricsId =
                String(
                    resultado.battlemetricsId
                );

            const nombre =
                resultado.nombre ||
                "Desconocido";

            // =====================================================
            // SERVIDOR CONFIGURADO
            // =====================================================

            const servidorConfigurado =
                await obtenerServidorConfigurado(
                    interaction.guild.id
                );

            if (!servidorConfigurado) {

                return await interaction.editReply(
                    "❌ Este servidor de Discord no tiene configurado un servidor de BattleMetrics."
                );
            }

            // =====================================================
            // OBTENER ESTADO ACTUAL
            // =====================================================

            let status = null;

            try {

                status =
                    await getBattleMetricsPlayerStatus(
                        battlemetricsId
                    );

            } catch (error) {

                console.error(
                    "[TRACKER] Error obteniendo estado inicial:",
                    error
                );

                return await interaction.editReply(
                    "❌ No se pudieron obtener los datos actuales del jugador desde BattleMetrics."
                );
            }

            if (!status) {

                return await interaction.editReply(
                    "❌ No se pudieron obtener los datos actuales del jugador desde BattleMetrics."
                );
            }

            // =====================================================
            // ESTADO ACTUAL
            // =====================================================

            const estaOnline =
                status.online === true;

            const serverIdActual =
                status?.serverId
                    ? String(status.serverId)
                    : null;

            const estaEnServidorConfigurado =
                estaOnline &&
                serverIdActual &&
                String(serverIdActual) ===
                String(servidorConfigurado);

            // =====================================================
            // REGISTRAR TRACKER
            // =====================================================

            const resultadoTracker =
                await registrarTracker({

                    battlemetricsId,

                    nombre:
                        status.name ||
                        nombre,

                    canalId:
                        interaction.channel.id,

                    guildId:
                        interaction.guild.id,

                    registradoPor:
                        interaction.user.tag
                });

            // =====================================================
            // TRACKER YA EXISTENTE
            // =====================================================

            if (
                resultadoTracker &&
                resultadoTracker.existente
            ) {

                const trackerExistente =
                    resultadoTracker.tracker;

                const restante =
                    trackerExistente.expiresAt
                        ? Math.max(
                            0,
                            new Date(
                                trackerExistente.expiresAt
                            ).getTime() -
                            Date.now()
                        )
                        : 0;

                const horasRestantes =
                    Math.floor(
                        restante /
                        (60 * 60 * 1000)
                    );

                const minutosRestantes =
                    Math.floor(
                        (
                            restante %
                            (60 * 60 * 1000)
                        ) /
                        (60 * 1000)
                    );

                const embedExistente =
                    new EmbedBuilder()

                        .setTitle(
                            "⚠️ TRACKER YA ACTIVO"
                        )

                        .setColor(
                            0xfee75c
                        )

                        .setDescription(
                            `**${trackerExistente.nombre || nombre}** ya está siendo vigilado.`
                        )

                        .addFields(

                            {
                                name: "👤 Jugador",

                                value:
                                    `\`${trackerExistente.nombre || nombre}\``,

                                inline: true
                            },

                            {
                                name: "🆔 BattleMetrics",

                                value:
                                    `[${battlemetricsId}](https://www.battlemetrics.com/players/${battlemetricsId})`,

                                inline: true
                            },

                            {
                                name: "🎯 Estado del tracker",

                                value:
                                    "🟢 Activo",

                                inline: true
                            },

                            {
                                name: "⏱ Tiempo restante",

                                value:
                                    `${horasRestantes}h ${minutosRestantes}m`,

                                inline: true
                            },

                            {
                                name: "📡 Canal",

                                value:
                                    `<#${trackerExistente.canalId}>`,

                                inline: true
                            }
                        )

                        .setTimestamp()

                        .setFooter({
                            text:
                                "RustLogix • BattleMetrics Tracker"
                        });

                return await interaction.editReply({

                    embeds: [
                        embedExistente
                    ],

                    components: [
                        crearBotonBattleMetrics(
                            battlemetricsId
                        )
                    ]

                });
            }

            // =====================================================
            // TRACKER NUEVO
            // =====================================================

            const embedConfirmacion =
                new EmbedBuilder()

                    .setTitle(
                        "🎯 TRACKER ACTIVADO"
                    )

                    .setColor(
                        0x5865f2
                    )

                    .setDescription(
                        `Se ha comenzado a vigilar a **${status.name || nombre}** durante **24 horas**.`
                    )

                    .addFields(

                        {
                            name: "👤 Jugador",

                            value:
                                `\`${status.name || nombre}\``,

                            inline: true
                        },

                        {
                            name: "🆔 BattleMetrics",

                            value:
                                `[${battlemetricsId}](https://www.battlemetrics.com/players/${battlemetricsId})`,

                            inline: true
                        },

                        {
                            name: "⏱ Duración",

                            value:
                                "`24 horas`",

                            inline: true
                        },

                        {
                            name: "🎯 Servidor vigilado",

                            value:
                                `\`${servidorConfigurado}\``,

                            inline: true
                        },

                        {
                            name: "📡 Canal",

                            value:
                                `<#${interaction.channel.id}>`,

                            inline: true
                        },

                        {
                            name: "👮 Registrado por",

                            value:
                                `<@${interaction.user.id}>`,

                            inline: true
                        }
                    )

                    .setTimestamp()

                    .setFooter({
                        text:
                            "RustLogix • BattleMetrics Tracker"
                    });

            // =====================================================
            // EMBED DE ESTADO INICIAL
            // =====================================================

            let embedEstado;

            if (
                estaEnServidorConfigurado
            ) {

                embedEstado =
                    crearEmbedOnline(
                        status,
                        resultadoTracker.tracker,
                        servidorConfigurado
                    );

            } else if (
                estaOnline
            ) {

                embedEstado =
                    crearEmbedOtroServidor(
                        status,
                        resultadoTracker.tracker,
                        servidorConfigurado
                    );

            } else {

                embedEstado =
                    crearEmbedOffline(
                        resultadoTracker.tracker,
                        "0m",
                        status?.server ||
                        "Desconocido"
                    );
            }

            // =====================================================
            // RESPUESTA
            // =====================================================

            await interaction.editReply({

                embeds: [
                    embedConfirmacion,
                    embedEstado
                ],

                components: [
                    crearBotonBattleMetrics(
                        battlemetricsId
                    )
                ]

            });

            // =====================================================
            // LOG
            // =====================================================

            console.log(
                `✅ /tracker terminado | ${status.name || nombre} | BM ${battlemetricsId} | ${estaEnServidorConfigurado ? "SERVIDOR CONFIGURADO" : estaOnline ? "OTRO SERVIDOR" : "OFFLINE"}`
            );

        } catch (error) {

            console.error(
                "ERROR TRACKER:",
                error
            );

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply(
                    "❌ Ocurrió un error al configurar el tracker."
                ).catch(
                    () => {}
                );

            } else {

                await interaction.reply(
                    "❌ Ocurrió un error al configurar el tracker."
                ).catch(
                    () => {}
                );
            }
        }
    }
};