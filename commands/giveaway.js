const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const DURACION_MAXIMA = 7 * 24 * 60 * 60 * 1000;

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

    const cantidad = parseInt(match[1], 10);
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
// FORMATEAR DURACIÓN
// =====================================================

function formatearDuracion(ms) {
    const segundos = Math.floor(ms / 1000);

    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor(
        (segundos % 86400) / 3600
    );
    const minutos = Math.floor(
        (segundos % 3600) / 60
    );
    const segs = segundos % 60;

    const partes = [];

    if (dias > 0) {
        partes.push(`${dias}d`);
    }

    if (horas > 0) {
        partes.push(`${horas}h`);
    }

    if (minutos > 0) {
        partes.push(`${minutos}m`);
    }

    if (segs > 0 && dias === 0 && horas === 0) {
        partes.push(`${segs}s`);
    }

    return partes.join(" ") || "0s";
}

// =====================================================
// ELEGIR GANADORES
// =====================================================

function elegirGanadores(participantes, cantidad) {

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
// COMANDO
// =====================================================

module.exports = {

    data: new SlashCommandBuilder()
        .setName("giveaway")
        .setDescription("Crea un sorteo")

        .addStringOption(option =>
            option
                .setName("premio")
                .setDescription("Premio del giveaway")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("duracion")
                .setDescription(
                    "Duración: 30s, 10m, 1h, 2d, etc."
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

            const cantidadGanadores =
                interaction.options.getInteger(
                    "ganadores"
                ) || 1;

            const duracion =
                parsearDuracion(
                    duracionTexto
                );

            // ==========================================
            // VALIDAR DURACIÓN
            // ==========================================

            if (!duracion) {

                return interaction.reply({
                    content:
                        "❌ Duración inválida.\n\n" +
                        "Ejemplos: `30s`, `10m`, `1h`, `2d`\n" +
                        "Máximo: `7d`.",
                    ephemeral: true
                });
            }

            // ==========================================
            // DATOS DEL GIVEAWAY
            // ==========================================

            const participantes =
                new Set();

            const fechaFinal =
                Date.now() + duracion;

            const giveawayId =
                interaction.id;

            let finalizado = false;

            // ==========================================
            // CREAR EMBED
            // ==========================================

            const crearEmbed = (
                cerrado = false,
                ganadoresFinales = []
            ) => {

                let descripcion = "";

                if (!cerrado) {

                    descripcion =
                        `🎁 **Premio:** ${premio}\n\n` +

                        `👑 **Ganadores:** ${cantidadGanadores}\n` +

                        `👥 **Participantes:** ${participantes.size}\n\n` +

                        `⏰ **Termina:** <t:${Math.floor(
                            fechaFinal / 1000
                        )}:R>\n\n` +

                        `🎉 Pulsa el botón de abajo para participar.`;

                } else {

                    descripcion =
                        `🎁 **Premio:** ${premio}\n\n` +

                        `👑 **Ganadores:** ${cantidadGanadores}\n` +

                        `👥 **Participantes:** ${participantes.size}\n\n`;

                    if (
                        ganadoresFinales.length > 0
                    ) {

                        descripcion +=
                            `🏆 **GANADOR${ganadoresFinales.length > 1 ? "ES" : ""}**\n\n`;

                        ganadoresFinales.forEach(
                            id => {
                                descripcion +=
                                    `🎉 <@${id}>\n`;
                            }
                        );

                    } else {

                        descripcion +=
                            "❌ No hubo suficientes participantes.";
                    }
                }

                return new EmbedBuilder()
                    .setTitle(
                        cerrado
                            ? "🏆 GIVEAWAY FINALIZADO"
                            : "🎉 GIVEAWAY"
                    )
                    .setDescription(
                        descripcion
                    )
                    .setColor(
                        cerrado
                            ? 0x57f287
                            : 0xffc107
                    )
                    .setFooter({
                        text:
                            `Creado por ${interaction.user.tag}`
                    })
                    .setTimestamp();
            };

            // ==========================================
            // BOTÓN PARTICIPAR
            // ==========================================

            const crearBotones = (
                desactivado = false
            ) => {

                const fila =
                    new ActionRowBuilder()
                        .addComponents(

                            new ButtonBuilder()
                                .setCustomId(
                                    `giveaway_participar_${giveawayId}`
                                )
                                .setLabel(
                                    "Participar"
                                )
                                .setEmoji("🎉")
                                .setStyle(
                                    ButtonStyle.Success
                                )
                                .setDisabled(
                                    desactivado
                                ),

                            new ButtonBuilder()
                                .setCustomId(
                                    `giveaway_cerrar_${giveawayId}`
                                )
                                .setLabel(
                                    "Finalizar"
                                )
                                .setEmoji("🔒")
                                .setStyle(
                                    ButtonStyle.Danger
                                )
                                .setDisabled(
                                    desactivado
                                )
                        );

                return [fila];
            };

            // ==========================================
            // PUBLICAR
            // ==========================================

            await interaction.reply({
                embeds: [
                    crearEmbed()
                ],
                components: [
                    ...crearBotones()
                ]
            });

            const mensaje =
                await interaction.fetchReply();

            // ==========================================
            // COLLECTOR
            // ==========================================

            const collector =
                mensaje.createMessageComponentCollector({
                    time: duracion
                });

            // ==========================================
            // BOTONES
            // ==========================================

            collector.on(
                "collect",
                async buttonInteraction => {

                    try {

                        // ==================================
                        // PARTICIPAR
                        // ==================================

                        if (
                            buttonInteraction.customId ===
                            `giveaway_participar_${giveawayId}`
                        ) {

                            const usuarioId =
                                buttonInteraction.user.id;

                            // ------------------------------
                            // YA ESTÁ PARTICIPANDO
                            // ------------------------------

                            if (
                                participantes.has(
                                    usuarioId
                                )
                            ) {

                                participantes.delete(
                                    usuarioId
                                );

                                await buttonInteraction.reply({
                                    content:
                                        "❌ Has salido del giveaway.",
                                    ephemeral: true
                                });

                            } else {

                                participantes.add(
                                    usuarioId
                                );

                                await buttonInteraction.reply({
                                    content:
                                        "🎉 ¡Ya estás participando!",
                                    ephemeral: true
                                });
                            }

                            // ------------------------------
                            // ACTUALIZAR CONTADOR
                            // ------------------------------

                            await interaction.editReply({
                                embeds: [
                                    crearEmbed()
                                ],
                                components: [
                                    ...crearBotones()
                                ]
                            });

                            return;
                        }

                        // ==================================
                        // FINALIZAR MANUALMENTE
                        // ==================================

                        if (
                            buttonInteraction.customId ===
                            `giveaway_cerrar_${giveawayId}`
                        ) {

                            if (
                                buttonInteraction.user.id !==
                                interaction.user.id
                            ) {

                                return buttonInteraction.reply({
                                    content:
                                        "❌ Solo quien creó el giveaway puede finalizarlo.",
                                    ephemeral: true
                                });
                            }

                            collector.stop(
                                "manual"
                            );

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
                                ephemeral: true
                            }).catch(() => {});
                        }
                    }
                }
            );

            // ==========================================
            // FINALIZAR
            // ==========================================

            collector.on(
                "end",
                async (_, motivo) => {

                    if (finalizado) {
                        return;
                    }

                    finalizado = true;

                    try {

                        // ------------------------------
                        // ELEGIR GANADORES
                        // ------------------------------

                        const listaParticipantes =
                            [...participantes];

                        const ganadores =
                            elegirGanadores(
                                listaParticipantes,
                                cantidadGanadores
                            );

                        // ------------------------------
                        // ACTUALIZAR MENSAJE
                        // ------------------------------

                        const botonesFinales =
                            new ActionRowBuilder()
                                .addComponents(

                                    new ButtonBuilder()
                                        .setCustomId(
                                            `giveaway_finalizado_${giveawayId}`
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
                                            `giveaway_reroll_${giveawayId}`
                                        )
                                        .setLabel(
                                            "Nuevo ganador"
                                        )
                                        .setEmoji("🔄")
                                        .setStyle(
                                            ButtonStyle.Primary
                                        )
                                );

                        await interaction.editReply({
                            embeds: [
                                crearEmbed(
                                    true,
                                    ganadores
                                )
                            ],
                            components: [
                                botonesFinales
                            ]
                        });

                        // ------------------------------
                        // MENCIÓN GANADORES
                        // ------------------------------

                        if (
                            ganadores.length > 0
                        ) {

                            const menciones =
                                ganadores
                                    .map(
                                        id =>
                                            `<@${id}>`
                                    )
                                    .join(", ");

                            await interaction.channel.send({
                                content:
                                    `🎉 ¡Felicidades ${menciones}!\n` +
                                    `🏆 Has ganado **${premio}**!`
                            });

                        } else {

                            await interaction.channel.send({
                                content:
                                    `❌ El giveaway de **${premio}** terminó sin participantes.`
                            });
                        }

                    } catch (error) {

                        console.error(
                            "[GIVEAWAY] Error finalizando:",
                            error
                        );
                    }
                }
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

                await interaction.editReply(
                    "❌ Error creando el giveaway."
                ).catch(() => {});

            } else {

                await interaction.reply({
                    content:
                        "❌ Error creando el giveaway.",
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};