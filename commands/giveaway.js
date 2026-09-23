const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require("discord.js");

const Giveaway = require("../models/GiveawaySchema");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const DURACION_MAXIMA =
    7 * 24 * 60 * 60 * 1000;

// =====================================================
// MAPA DE COLLECTORS
// =====================================================

const collectorsActivos = new Map();

// =====================================================
// PARSEAR DURACIÓN
// =====================================================

function parsearDuracion(texto) {

    if (!texto) return null;

    const match = texto
        .trim()
        .toLowerCase()
        .match(/^(\d+)\s*(s|m|h|d)$/);

    if (!match) return null;

    const cantidad =
        parseInt(match[1], 10);

    const unidad = match[2];

    if (!cantidad || cantidad <= 0) {
        return null;
    }

    const multiplicadores = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000
    };

    const duracion =
        cantidad * multiplicadores[unidad];

    if (duracion > DURACION_MAXIMA) {
        return null;
    }

    return duracion;
}

// =====================================================
// ELEGIR GANADORES
// =====================================================

function elegirGanadores(
    participantes,
    cantidad
) {

    const copia = [...participantes];

    const ganadores = [];

    while (
        copia.length > 0 &&
        ganadores.length < cantidad
    ) {

        const indice =
            Math.floor(
                Math.random() * copia.length
            );

        const ganador =
            copia.splice(indice, 1)[0];

        ganadores.push(ganador);
    }

    return ganadores;
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbed(giveaway) {

    const fechaFinal =
        Math.floor(
            new Date(
                giveaway.fechaFinal
            ).getTime() / 1000
        );

    // ================================================
    // GIVEAWAY ACTIVO
    // ================================================

    if (
        giveaway.activo &&
        !giveaway.finalizado
    ) {

        return new EmbedBuilder()
            .setTitle("🎉 GIVEAWAY")
            .setDescription(
                `🎁 **Premio:** ${giveaway.premio}\n\n` +

                `👑 **Ganadores:** ${giveaway.ganadorCantidad}\n` +

                `👥 **Participantes:** ${giveaway.participantes.length}\n\n` +

                `⏰ **Termina:** <t:${fechaFinal}:R>\n\n` +

                `🎉 Pulsa **Participar** para entrar al sorteo.`
            )
            .setColor(0xffc107)
            .addFields({
                name: "📋 Información",
                value:
                    "Puedes entrar y salir del giveaway cuando quieras.\n" +
                    "Al finalizar se elegirá el o los ganadores automáticamente.",
                inline: false
            })
            .setFooter({
                text: "RustLogix • Giveaway"
            })
            .setTimestamp();
    }

    // ================================================
    // GIVEAWAY FINALIZADO
    // ================================================

    let textoGanadores =
        "❌ No hubo suficientes participantes.";

    if (
        giveaway.ganadores &&
        giveaway.ganadores.length > 0
    ) {

        textoGanadores =
            giveaway.ganadores
                .map(
                    id => `🎉 <@${id}>`
                )
                .join("\n");
    }

    return new EmbedBuilder()
        .setTitle("🏆 GIVEAWAY FINALIZADO")
        .setDescription(
            `🎁 **Premio:** ${giveaway.premio}\n\n` +

            `👥 **Participantes:** ${giveaway.participantes.length}\n\n` +

            `🏆 **Ganador${giveaway.ganadores.length > 1 ? "es" : ""}:**\n` +

            textoGanadores
        )
        .setColor(0x57f287)
        .setFooter({
            text: "RustLogix • Giveaway"
        })
        .setTimestamp();
}

// =====================================================
// BOTONES ACTIVOS
// =====================================================

function crearBotones(giveaway) {

    const fila =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `giveaway_participar_${giveaway.messageId}`
                    )
                    .setLabel("Participar")
                    .setEmoji("🎉")
                    .setStyle(
                        ButtonStyle.Success
                    ),

                new ButtonBuilder()
                    .setCustomId(
                        `giveaway_cerrar_${giveaway.messageId}`
                    )
                    .setLabel("Finalizar")
                    .setEmoji("🔒")
                    .setStyle(
                        ButtonStyle.Danger
                    )
            );

    return [fila];
}

// =====================================================
// BOTONES FINALIZADOS
// =====================================================

function crearBotonesFinalizados(
    giveaway
) {

    const fila =
        new ActionRowBuilder()
            .addComponents(

                new ButtonBuilder()
                    .setCustomId(
                        `giveaway_finalizado_${giveaway.messageId}`
                    )
                    .setLabel(
                        "Giveaway finalizado"
                    )
                    .setEmoji("🔒")
                    .setStyle(
                        ButtonStyle.Secondary
                    )
                    .setDisabled(true),

                new ButtonBuilder()
                    .setCustomId(
                        `giveaway_reroll_${giveaway.messageId}`
                    )
                    .setLabel("Nuevo ganador")
                    .setEmoji("🔄")
                    .setStyle(
                        ButtonStyle.Primary
                    )
            );

    return [fila];
}

// =====================================================
// FINALIZAR GIVEAWAY
// =====================================================

async function finalizarGiveaway(
    client,
    giveaway
) {

    if (
        !giveaway ||
        giveaway.finalizado
    ) {
        return;
    }

    try {

        const canal =
            await client.channels
                .fetch(giveaway.channelId)
                .catch(() => null);

        if (!canal) {

            console.log(
                `[GIVEAWAY] Canal no encontrado: ${giveaway.channelId}`
            );

            giveaway.activo = false;
            giveaway.finalizado = true;

            await giveaway.save();

            collectorsActivos.delete(
                giveaway.messageId
            );

            return;
        }

        const mensaje =
            await canal.messages
                .fetch(giveaway.messageId)
                .catch(() => null);

        // ============================================
        // ELEGIR GANADORES
        // ============================================

        const ganadores =
            elegirGanadores(
                giveaway.participantes,
                giveaway.ganadorCantidad
            );

        giveaway.ganadores =
            ganadores;

        giveaway.activo = false;
        giveaway.finalizado = true;

        await giveaway.save();

        // ============================================
        // ACTUALIZAR MENSAJE
        // ============================================

        if (mensaje) {

            await mensaje.edit({
                embeds: [
                    crearEmbed(giveaway)
                ],
                components:
                    crearBotonesFinalizados(
                        giveaway
                    )
            }).catch(error => {

                console.error(
                    "[GIVEAWAY] Error actualizando mensaje:",
                    error
                );

            });
        }

        // ============================================
        // ANUNCIAR GANADORES
        // ============================================

        if (
            ganadores.length > 0
        ) {

            const menciones =
                ganadores
                    .map(
                        id => `<@${id}>`
                    )
                    .join(", ");

            await canal.send({
                content:
                    `🎉 **GIVEAWAY FINALIZADO**\n\n` +
                    `🎁 Premio: **${giveaway.premio}**\n` +
                    `🏆 Ganador${ganadores.length > 1 ? "es" : ""}: ${menciones}`
            });

        } else {

            await canal.send({
                content:
                    `❌ El giveaway de **${giveaway.premio}** terminó sin participantes.`
            });
        }

        collectorsActivos.delete(
            giveaway.messageId
        );

        console.log(
            `[GIVEAWAY] Finalizado: ${giveaway.messageId}`
        );

    } catch (error) {

        console.error(
            "[GIVEAWAY] Error finalizando:",
            error
        );
    }
}

// =====================================================
// INICIAR COLLECTOR
// =====================================================

function iniciarCollector(
    client,
    giveaway
) {

    if (
        collectorsActivos.has(
            giveaway.messageId
        )
    ) {
        return;
    }

    const tiempoRestante =
        new Date(
            giveaway.fechaFinal
        ).getTime() - Date.now();

    if (tiempoRestante <= 0) {

        finalizarGiveaway(
            client,
            giveaway
        );

        return;
    }

    // ================================================
    // BUSCAR MENSAJE
    // ================================================

    client.channels
        .fetch(giveaway.channelId)
        .then(async canal => {

            if (!canal) return;

            const mensaje =
                await canal.messages
                    .fetch(giveaway.messageId)
                    .catch(() => null);

            if (!mensaje) {

                console.log(
                    `[GIVEAWAY] No se encontró el mensaje ${giveaway.messageId}`
                );

                return;
            }

            const collector =
                mensaje.createMessageComponentCollector({
                    time: tiempoRestante
                });

            collectorsActivos.set(
                giveaway.messageId,
                collector
            );

            console.log(
                `[GIVEAWAY] Collector iniciado: ${giveaway.messageId}`
            );

            // ========================================
            // BOTONES
            // ========================================

            collector.on(
                "collect",
                async buttonInteraction => {

                    try {

                        const customId =
                            buttonInteraction.customId;

                        // ==================================
                        // PARTICIPAR
                        // ==================================

                        if (
                            customId ===
                            `giveaway_participar_${giveaway.messageId}`
                        ) {

                            // ==================================
                            // RESPONDER INMEDIATAMENTE
                            // ==================================

                            await buttonInteraction.deferReply({
                                flags:
                                    MessageFlags.Ephemeral
                            });

                            const usuarioId =
                                buttonInteraction.user.id;

                            const indice =
                                giveaway.participantes
                                    .indexOf(
                                        usuarioId
                                    );

                            // ==================================
                            // SALIR
                            // ==================================

                            if (indice !== -1) {

                                giveaway.participantes
                                    .splice(
                                        indice,
                                        1
                                    );

                                await giveaway.save();

                                await mensaje.edit({
                                    embeds: [
                                        crearEmbed(
                                            giveaway
                                        )
                                    ],
                                    components:
                                        crearBotones(
                                            giveaway
                                        )
                                });

                                await buttonInteraction.editReply({
                                    content:
                                        "❌ Has salido del giveaway."
                                });

                                console.log(
                                    `[GIVEAWAY] ${usuarioId} salió: ${giveaway.messageId}`
                                );

                            }

                            // ==================================
                            // ENTRAR
                            // ==================================

                            else {

                                giveaway.participantes
                                    .push(
                                        usuarioId
                                    );

                                await giveaway.save();

                                await mensaje.edit({
                                    embeds: [
                                        crearEmbed(
                                            giveaway
                                        )
                                    ],
                                    components:
                                        crearBotones(
                                            giveaway
                                        )
                                });

                                await buttonInteraction.editReply({
                                    content:
                                        "🎉 ¡Ya estás participando!"
                                });

                                console.log(
                                    `[GIVEAWAY] ${usuarioId} participó: ${giveaway.messageId}`
                                );
                            }

                            return;
                        }

                        // ==================================
                        // FINALIZAR
                        // ==================================

                        if (
                            customId ===
                            `giveaway_cerrar_${giveaway.messageId}`
                        ) {

                            // ==================================
                            // RESPONDER INMEDIATAMENTE
                            // ==================================

                            await buttonInteraction.deferReply({
                                flags:
                                    MessageFlags.Ephemeral
                            });

                            // ==================================
                            // COMPROBAR CREADOR
                            // ==================================

                            if (
                                buttonInteraction.user.id !==
                                giveaway.creadorId
                            ) {

                                return await buttonInteraction.editReply({
                                    content:
                                        "❌ Solo quien creó el giveaway puede finalizarlo."
                                });
                            }

                            // ==================================
                            // FINALIZAR
                            // ==================================

                            collector.stop(
                                "manual"
                            );

                            await buttonInteraction.editReply({
                                content:
                                    "🔒 Giveaway finalizado. Se están eligiendo los ganadores..."
                            });

                            return;
                        }

                        // ==================================
                        // REROLL
                        // ==================================

                        if (
                            customId ===
                            `giveaway_reroll_${giveaway.messageId}`
                        ) {

                            // ==================================
                            // RESPONDER INMEDIATAMENTE
                            // ==================================

                            await buttonInteraction.deferReply({
                                flags:
                                    MessageFlags.Ephemeral
                            });

                            // ==================================
                            // COMPROBAR CREADOR
                            // ==================================

                            if (
                                buttonInteraction.user.id !==
                                giveaway.creadorId
                            ) {

                                return await buttonInteraction.editReply({
                                    content:
                                        "❌ Solo quien creó el giveaway puede elegir un nuevo ganador."
                                });
                            }

                            // ==================================
                            // PARTICIPANTES DISPONIBLES
                            // ==================================

                            const candidatos =
                                giveaway.participantes
                                    .filter(
                                        id =>
                                            !giveaway.ganadores.includes(
                                                id
                                            )
                                    );

                            if (
                                candidatos.length === 0
                            ) {

                                return await buttonInteraction.editReply({
                                    content:
                                        "❌ No quedan participantes disponibles para elegir otro ganador."
                                });
                            }

                            // ==================================
                            // ELEGIR NUEVO GANADOR
                            // ==================================

                            const nuevoGanador =
                                elegirGanadores(
                                    candidatos,
                                    1
                                )[0];

                            giveaway.ganadores = [
                                nuevoGanador
                            ];

                            await giveaway.save();

                            await mensaje.edit({
                                embeds: [
                                    crearEmbed(
                                        giveaway
                                    )
                                ],
                                components:
                                    crearBotonesFinalizados(
                                        giveaway
                                    )
                            });

                            await buttonInteraction.editReply({
                                content:
                                    `🔄 Nuevo ganador seleccionado: <@${nuevoGanador}>`
                            });

                            await canal.send({
                                content:
                                    `🔄 **NUEVO GANADOR**\n\n` +
                                    `🎁 Premio: **${giveaway.premio}**\n` +
                                    `🏆 Ganador: <@${nuevoGanador}>`
                            });

                            return;
                        }

                    } catch (error) {

                        console.error(
                            "[GIVEAWAY] Error procesando botón:",
                            error
                        );

                        if (
                            !buttonInteraction.replied &&
                            !buttonInteraction.deferred
                        ) {

                            await buttonInteraction.reply({
                                content:
                                    "❌ Ocurrió un error.",
                                flags:
                                    MessageFlags.Ephemeral
                            }).catch(() => {});
                        }
                    }
                }
            );

            // ========================================
            // TERMINAR COLLECTOR
            // ========================================

            collector.on(
                "end",
                async () => {

                    collectorsActivos.delete(
                        giveaway.messageId
                    );

                    const actualizado =
                        await Giveaway.findById(
                            giveaway._id
                        );

                    if (
                        !actualizado ||
                        actualizado.finalizado
                    ) {
                        return;
                    }

                    await finalizarGiveaway(
                        client,
                        actualizado
                    );
                }
            );

        })
        .catch(error => {

            console.error(
                "[GIVEAWAY] Error iniciando collector:",
                error
            );
        });
}

// =====================================================
// INICIAR GIVEAWAYS DESPUÉS DE REINICIO
// =====================================================

async function iniciarGiveaways(client) {

    try {

        const giveaways =
            await Giveaway.find({
                activo: true,
                finalizado: false
            });

        console.log(
            `[GIVEAWAY] ${giveaways.length} giveaway(s) activo(s) encontrados.`
        );

        for (const giveaway of giveaways) {

            iniciarCollector(
                client,
                giveaway
            );
        }

    } catch (error) {

        console.error(
            "[GIVEAWAY] Error recuperando giveaways:",
            error
        );
    }
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription(
            "Crea un sorteo"
        )

        .addStringOption(option =>
            option
                .setName("premio")
                .setDescription(
                    "Premio del giveaway"
                )
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("duracion")
                .setDescription(
                    "Ejemplo: 30s, 10m, 1h, 2d"
                )
                .setRequired(true)
        )

        .addIntegerOption(option =>
            option
                .setName("ganadores")
                .setDescription(
                    "Cantidad de ganadores"
                )
                .setMinValue(1)
                .setMaxValue(20)
                .setRequired(false)
        ),

    async execute(interaction) {

        try {

            const premio =
                interaction.options.getString(
                    "premio"
                );

            const duracionTexto =
                interaction.options.getString(
                    "duracion"
                );

            const ganadorCantidad =
                interaction.options.getInteger(
                    "ganadores"
                ) || 1;

            // ==========================================
            // VALIDAR DURACIÓN
            // ==========================================

            const duracion =
                parsearDuracion(
                    duracionTexto
                );

            if (!duracion) {

                return interaction.reply({
                    content:
                        "❌ Duración inválida.\n\n" +
                        "Ejemplos: `30s`, `10m`, `1h`, `2d`\n" +
                        "Máximo: `7d`.",
                    flags:
                        MessageFlags.Ephemeral
                });
            }

            // ==========================================
            // FECHAS
            // ==========================================

            const fechaInicio =
                new Date();

            const fechaFinal =
                new Date(
                    Date.now() + duracion
                );

            // ==========================================
            // CREAR DOCUMENTO
            // ==========================================

            const giveaway =
                new Giveaway({

                    guildId:
                        interaction.guild.id,

                    channelId:
                        interaction.channel.id,

                    // ID temporal.
                    // Se reemplaza inmediatamente
                    // por el ID real del mensaje.
                    messageId:
                        interaction.id,

                    creadorId:
                        interaction.user.id,

                    premio,

                    ganadorCantidad,

                    participantes: [],

                    ganadores: [],

                    fechaInicio,

                    fechaFinal,

                    activo: true,

                    finalizado: false

                });

            // ==========================================
            // PUBLICAR MENSAJE
            // ==========================================

            await interaction.reply({

                embeds: [
                    crearEmbed(
                        giveaway
                    )
                ],

                components:
                    crearBotones(
                        giveaway
                    )

            });

            const mensaje =
                await interaction.fetchReply();

            // ==========================================
            // GUARDAR MESSAGE ID REAL
            // ==========================================

            giveaway.messageId =
                mensaje.id;

            await giveaway.save();

            // ==========================================
            // IMPORTANTE:
            // ACTUALIZAR LOS BOTONES CON EL ID REAL
            // ==========================================

            await mensaje.edit({

                embeds: [
                    crearEmbed(
                        giveaway
                    )
                ],

                components:
                    crearBotones(
                        giveaway
                    )

            });

            // ==========================================
            // INICIAR COLLECTOR
            // ==========================================

            iniciarCollector(
                interaction.client,
                giveaway
            );

            console.log(
                `[GIVEAWAY] Creado: ${premio} | ${mensaje.id}`
            );

        } catch (error) {

            console.error(
                "[GIVEAWAY] Error creando giveaway:",
                error
            );

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply({
                    content:
                        "❌ Error creando el giveaway."
                }).catch(() => {});

            } else {

                await interaction.reply({
                    content:
                        "❌ Error creando el giveaway.",
                    flags:
                        MessageFlags.Ephemeral
                }).catch(() => {});
            }
        }
    },

    iniciarGiveaways
};