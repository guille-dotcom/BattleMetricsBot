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
// MAPA DE PANELES PRIVADOS DE CREADORES
// =====================================================

const panelesCreador = new Map();

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
// BOTÓN PÚBLICO
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
                    )
            );

    return [fila];
}

// =====================================================
// PANEL PRIVADO DEL CREADOR - ACTIVO
// =====================================================

function crearPanelCreadorActivo(
    giveaway
) {

    const fila =
        new ActionRowBuilder()
            .addComponents(
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
// PANEL PRIVADO DEL CREADOR - FINALIZADO
// =====================================================

function crearPanelCreadorFinalizado(
    giveaway
) {

    const fila =
        new ActionRowBuilder()
            .addComponents(
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
// EMBED PANEL CREADOR
// =====================================================

function crearEmbedPanelCreador(
    giveaway
) {

    if (
        giveaway.activo &&
        !giveaway.finalizado
    ) {

        return new EmbedBuilder()
            .setTitle("🔧 Control del Giveaway")
            .setDescription(
                `🎁 **Premio:** ${giveaway.premio}\n\n` +
                `👥 **Participantes:** ${giveaway.participantes.length}\n\n` +
                `🔒 Este panel solo lo puede utilizar el creador del giveaway.\n\n` +
                `Pulsa **Finalizar** si quieres terminar el sorteo antes de tiempo.`
            )
            .setColor(0x5865f2)
            .setFooter({
                text: "RustLogix • Control privado"
            })
            .setTimestamp();
    }

    return new EmbedBuilder()
        .setTitle("🔧 Control del Giveaway")
        .setDescription(
            `🎁 **Premio:** ${giveaway.premio}\n\n` +
            `👥 **Participantes:** ${giveaway.participantes.length}\n\n` +
            `🏆 **Ganador${giveaway.ganadores.length > 1 ? "es" : ""}:**\n` +
            (
                giveaway.ganadores.length > 0
                    ? giveaway.ganadores
                        .map(id => `🎉 <@${id}>`)
                        .join("\n")
                    : "❌ Ninguno"
            ) +
            `\n\n🔄 Puedes elegir un nuevo ganador con el botón de abajo.`
        )
        .setColor(0x57f287)
        .setFooter({
            text: "RustLogix • Control privado"
        })
        .setTimestamp();
}

// =====================================================
// ACTUALIZAR PANEL PRIVADO
// =====================================================

async function actualizarPanelCreador(
    giveaway
) {

    const panel =
        panelesCreador.get(
            giveaway.messageId
        );

    if (!panel) {
        return;
    }

    try {

        if (
            giveaway.finalizado
        ) {

            await panel.edit({
                embeds: [
                    crearEmbedPanelCreador(
                        giveaway
                    )
                ],
                components:
                    crearPanelCreadorFinalizado(
                        giveaway
                    )
            });

        } else {

            await panel.edit({
                embeds: [
                    crearEmbedPanelCreador(
                        giveaway
                    )
                ],
                components:
                    crearPanelCreadorActivo(
                        giveaway
                    )
            });
        }

    } catch (error) {

        console.log(
            "[GIVEAWAY] No se pudo actualizar el panel privado:",
            error.message
        );
    }
}

// =====================================================
// REPARAR MENSAJE DE GIVEAWAY
// =====================================================

async function repararMensajeGiveaway(
    client,
    giveaway
) {

    if (
        !giveaway ||
        giveaway.finalizado ||
        !giveaway.activo
    ) {
        return false;
    }

    try {

        const canal =
            await client.channels
                .fetch(
                    giveaway.channelId
                )
                .catch(() => null);

        if (!canal) {

            console.log(
                `[GIVEAWAY] No se pudo reparar: canal ${giveaway.channelId} no encontrado.`
            );

            return false;
        }

        const mensaje =
            await canal.messages
                .fetch(
                    giveaway.messageId
                )
                .catch(() => null);

        if (!mensaje) {

            console.log(
                `[GIVEAWAY] No se pudo reparar: mensaje ${giveaway.messageId} no encontrado.`
            );

            return false;
        }

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

        console.log(
            `[GIVEAWAY] Mensaje reparado: ${giveaway.messageId} | participantes: ${giveaway.participantes.length}`
        );

        return true;

    } catch (error) {

        console.error(
            `[GIVEAWAY] Error reparando ${giveaway.messageId}:`,
            error.message
        );

        return false;
    }
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

        if (mensaje) {

            await mensaje.edit({
                embeds: [
                    crearEmbed(
                        giveaway
                    )
                ],
                components: []
            }).catch(error => {

                console.error(
                    "[GIVEAWAY] Error actualizando mensaje:",
                    error
                );
            });
        }

        await actualizarPanelCreador(
            giveaway
        );

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
// PROCESAR PARTICIPACIÓN
// =====================================================

async function procesarParticipacion(
    buttonInteraction
) {

    await buttonInteraction.deferReply({
        flags:
            MessageFlags.Ephemeral
    });

    try {

        const messageId =
            buttonInteraction.customId.replace(
                "giveaway_participar_",
                ""
            );

        const giveaway =
            await Giveaway.findOne({
                messageId
            });

        if (
            !giveaway
        ) {

            return await buttonInteraction.editReply({
                content:
                    "❌ Este giveaway ya no existe."
            });
        }

        if (
            giveaway.finalizado ||
            !giveaway.activo
        ) {

            return await buttonInteraction.editReply({
                content:
                    "❌ Este giveaway ya ha terminado."
            });
        }

        const usuarioId =
            buttonInteraction.user.id;

        const indice =
            giveaway.participantes.indexOf(
                usuarioId
            );

        const canal =
            await buttonInteraction.client.channels
                .fetch(
                    giveaway.channelId
                )
                .catch(() => null);

        const mensaje =
            canal
                ? await canal.messages
                    .fetch(
                        giveaway.messageId
                    )
                    .catch(() => null)
                : null;

        if (
            indice !== -1
        ) {

            giveaway.participantes.splice(
                indice,
                1
            );

            await giveaway.save();

            if (mensaje) {

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
                }).catch(() => {});
            }

            await actualizarPanelCreador(
                giveaway
            );

            await buttonInteraction.editReply({
                content:
                    "❌ Has salido del giveaway."
            });

            console.log(
                `[GIVEAWAY] ${usuarioId} salió: ${giveaway.messageId}`
            );

            return;
        }

        giveaway.participantes.push(
            usuarioId
        );

        await giveaway.save();

        if (mensaje) {

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
            }).catch(() => {});
        }

        await actualizarPanelCreador(
            giveaway
        );

        await buttonInteraction.editReply({
            content:
                "🎉 ¡Ya estás participando!"
        });

        console.log(
            `[GIVEAWAY] ${usuarioId} participó: ${giveaway.messageId}`
        );

    } catch (error) {

        console.error(
            "[GIVEAWAY] Error en participación:",
            error
        );

        await buttonInteraction.editReply({
            content:
                "❌ Ocurrió un error al participar."
        }).catch(() => {});
    }
}

// =====================================================
// PROCESAR FINALIZAR
// =====================================================

async function procesarFinalizar(
    buttonInteraction
) {

    await buttonInteraction.deferReply({
        flags:
            MessageFlags.Ephemeral
    });

    try {

        const messageId =
            buttonInteraction.customId.replace(
                "giveaway_cerrar_",
                ""
            );

        const giveaway =
            await Giveaway.findOne({
                messageId
            });

        if (
            !giveaway
        ) {

            return await buttonInteraction.editReply({
                content:
                    "❌ Este giveaway ya no existe."
            });
        }

        if (
            buttonInteraction.user.id !==
            giveaway.creadorId
        ) {

            return await buttonInteraction.editReply({
                content:
                    "❌ Solo quien creó el giveaway puede finalizarlo."
            });
        }

        if (
            giveaway.finalizado ||
            !giveaway.activo
        ) {

            return await buttonInteraction.editReply({
                content:
                    "❌ Este giveaway ya está finalizado."
            });
        }

        await buttonInteraction.editReply({
            content:
                "🔒 Giveaway finalizado. Se están eligiendo los ganadores..."
        });

        collectorsActivos.delete(
            giveaway.messageId
        );

        await finalizarGiveaway(
            buttonInteraction.client,
            giveaway
        );

    } catch (error) {

        console.error(
            "[GIVEAWAY] Error procesando finalizar:",
            error
        );

        await buttonInteraction.editReply({
            content:
                "❌ Ocurrió un error al finalizar el giveaway."
        }).catch(() => {});
    }
}

// =====================================================
// PROCESAR REROLL
// =====================================================

async function procesarReroll(
    buttonInteraction
) {

    await buttonInteraction.deferReply({
        flags:
            MessageFlags.Ephemeral
    });

    try {

        const messageId =
            buttonInteraction.customId.replace(
                "giveaway_reroll_",
                ""
            );

        const giveaway =
            await Giveaway.findOne({
                messageId
            });

        if (
            !giveaway
        ) {

            return await buttonInteraction.editReply({
                content:
                    "❌ Este giveaway ya no existe."
            });
        }

        if (
            buttonInteraction.user.id !==
            giveaway.creadorId
        ) {

            return await buttonInteraction.editReply({
                content:
                    "❌ Solo quien creó el giveaway puede elegir un nuevo ganador."
            });
        }

        if (
            !giveaway.finalizado
        ) {

            return await buttonInteraction.editReply({
                content:
                    "❌ El giveaway todavía no ha finalizado."
            });
        }

        const candidatos =
            giveaway.participantes.filter(
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

        const nuevoGanador =
            elegirGanadores(
                candidatos,
                1
            )[0];

        giveaway.ganadores = [
            nuevoGanador
        ];

        await giveaway.save();

        const canal =
            await buttonInteraction.client.channels
                .fetch(
                    giveaway.channelId
                )
                .catch(() => null);

        if (canal) {

            const mensaje =
                await canal.messages
                    .fetch(
                        giveaway.messageId
                    )
                    .catch(() => null);

            if (mensaje) {

                await mensaje.edit({
                    embeds: [
                        crearEmbed(
                            giveaway
                        )
                    ],
                    components: []
                }).catch(() => {});
            }

            await canal.send({
                content:
                    `🔄 **NUEVO GANADOR**\n\n` +
                    `🎁 Premio: **${giveaway.premio}**\n` +
                    `🏆 Nuevo ganador: <@${nuevoGanador}>`
            });
        }

        await actualizarPanelCreador(
            giveaway
        );

        await buttonInteraction.editReply({
            content:
                `🔄 Nuevo ganador seleccionado: <@${nuevoGanador}>`
        });

        console.log(
            `[GIVEAWAY] Nuevo ganador: ${nuevoGanador} | ${giveaway.messageId}`
        );

    } catch (error) {

        console.error(
            "[GIVEAWAY] Error haciendo reroll:",
            error
        );

        await buttonInteraction.editReply({
            content:
                "❌ Ocurrió un error al elegir un nuevo ganador."
        }).catch(() => {});
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

    if (
        tiempoRestante <= 0
    ) {

        finalizarGiveaway(
            client,
            giveaway
        );

        return;
    }

    client.channels
        .fetch(
            giveaway.channelId
        )
        .then(
            async canal => {

                if (!canal) return;

                const mensaje =
                    await canal.messages
                        .fetch(
                            giveaway.messageId
                        )
                        .catch(() => null);

                if (!mensaje) {

                    console.log(
                        `[GIVEAWAY] No se encontró el mensaje ${giveaway.messageId}`
                    );

                    return;
                }

                const collector =
                    mensaje.createMessageComponentCollector({
                        time:
                            tiempoRestante
                    });

                collectorsActivos.set(
                    giveaway.messageId,
                    collector
                );

                console.log(
                    `[GIVEAWAY] Collector iniciado: ${giveaway.messageId}`
                );

                collector.on(
                    "collect",
                    async buttonInteraction => {

                        try {

                            if (
                                buttonInteraction.customId !==
                                `giveaway_participar_${giveaway.messageId}`
                            ) {
                                return;
                            }

                            await procesarParticipacion(
                                buttonInteraction
                            );

                        } catch (error) {

                            console.error(
                                "[GIVEAWAY] Error procesando botón:",
                                error
                            );
                        }
                    }
                );

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

            }
        )
        .catch(
            error => {

                console.error(
                    "[GIVEAWAY] Error iniciando collector:",
                    error
                );
            }
        );
}

// =====================================================
// COLLECTOR DEL PANEL PRIVADO
// =====================================================

function iniciarCollectorPanelCreador(
    panel,
    giveaway
) {

    const collector =
        panel.createMessageComponentCollector({
            time:
                DURACION_MAXIMA + 60 * 60 * 1000
        });

    panelesCreador.set(
        giveaway.messageId,
        panel
    );

    collector.on(
        "collect",
        async buttonInteraction => {

            try {

                const customId =
                    buttonInteraction.customId;

                if (
                    customId ===
                    `giveaway_cerrar_${giveaway.messageId}`
                ) {

                    await procesarFinalizar(
                        buttonInteraction
                    );

                    return;
                }

                if (
                    customId ===
                    `giveaway_reroll_${giveaway.messageId}`
                ) {

                    await procesarReroll(
                        buttonInteraction
                    );

                    return;
                }

            } catch (error) {

                console.error(
                    "[GIVEAWAY] Error en panel privado:",
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
}

// =====================================================
// INICIAR GIVEAWAYS DESPUÉS DE REINICIO
// =====================================================

async function iniciarGiveaways(
    client
) {

    try {

        const giveaways =
            await Giveaway.find({
                activo: true,
                finalizado: false
            });

        console.log(
            `[GIVEAWAY] ${giveaways.length} giveaway(s) activo(s) encontrados.`
        );

        for (
            const giveaway
            of giveaways
        ) {

            // ==========================================
            // REPARAR MENSAJE Y BOTÓN
            // ==========================================

            await repararMensajeGiveaway(
                client,
                giveaway
            );

            // ==========================================
            // INICIAR COLLECTOR
            // ==========================================

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

    data:
        new SlashCommandBuilder()

            .setName("giveaway")

            .setDescription(
                "Crea un sorteo"
            )

            .addStringOption(
                option =>
                    option
                        .setName("premio")
                        .setDescription(
                            "Premio del giveaway"
                        )
                        .setRequired(true)
            )

            .addStringOption(
                option =>
                    option
                        .setName("duracion")
                        .setDescription(
                            "Ejemplo: 30s, 10m, 1h, 2d"
                        )
                        .setRequired(true)
            )

            .addIntegerOption(
                option =>
                    option
                        .setName("ganadores")
                        .setDescription(
                            "Cantidad de ganadores"
                        )
                        .setMinValue(1)
                        .setMaxValue(20)
                        .setRequired(false)
            ),

    async execute(
        interaction
    ) {

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

            const fechaInicio =
                new Date();

            const fechaFinal =
                new Date(
                    Date.now() + duracion
                );

            const giveaway =
                new Giveaway({

                    guildId:
                        interaction.guild.id,

                    channelId:
                        interaction.channel.id,

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

            giveaway.messageId =
                mensaje.id;

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

            iniciarCollector(
                interaction.client,
                giveaway
            );

            const panel =
                await interaction.followUp({

                    embeds: [
                        crearEmbedPanelCreador(
                            giveaway
                        )
                    ],

                    components:
                        crearPanelCreadorActivo(
                            giveaway
                        ),

                    flags:
                        MessageFlags.Ephemeral

                });

            panelesCreador.set(
                giveaway.messageId,
                panel
            );

            iniciarCollectorPanelCreador(
                panel,
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

    iniciarGiveaways,

    procesarParticipacion,

    procesarFinalizar,

    procesarReroll
};