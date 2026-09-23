const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const MAX_OPCIONES = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName("encuesta")
        .setDescription("Crea una encuesta para elegir entre varias opciones")

        .addStringOption(option =>
            option
                .setName("pregunta")
                .setDescription("Pregunta de la encuesta")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("opcion1")
                .setDescription("Primera opción")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("opcion2")
                .setDescription("Segunda opción")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("opcion3")
                .setDescription("Tercera opción")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("opcion4")
                .setDescription("Cuarta opción")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("opcion5")
                .setDescription("Quinta opción")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("opcion6")
                .setDescription("Sexta opción")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("opcion7")
                .setDescription("Séptima opción")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("opcion8")
                .setDescription("Octava opción")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("opcion9")
                .setDescription("Novena opción")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("opcion10")
                .setDescription("Décima opción")
                .setRequired(false)
        ),

    async execute(interaction) {
        try {
            const pregunta =
                interaction.options.getString("pregunta");

            const opciones = [];

            for (let i = 1; i <= MAX_OPCIONES; i++) {
                const opcion =
                    interaction.options.getString(`opcion${i}`);

                if (opcion) {
                    opciones.push(opcion.trim());
                }
            }

            if (opciones.length < 2) {
                return interaction.reply({
                    content:
                        "❌ Necesitas al menos 2 opciones para crear una encuesta.",
                    ephemeral: true
                });
            }

            // Evitar opciones repetidas
            const opcionesUnicas = [
                ...new Set(
                    opciones.map(opcion =>
                        opcion.toLowerCase()
                    )
                )
            ];

            if (opcionesUnicas.length !== opciones.length) {
                return interaction.reply({
                    content:
                        "❌ No puedes tener opciones repetidas.",
                    ephemeral: true
                });
            }

            const votos = {};

            opciones.forEach((_, index) => {
                votos[index] = new Set();
            });

            // ==========================================
            // EMBED
            // ==========================================

            const crearEmbed = () => {
                let descripcion =
                    `### ${pregunta}\n\n`;

                opciones.forEach((opcion, index) => {
                    const cantidad =
                        votos[index].size;

                    descripcion +=
                        `**${index + 1}.** ${opcion} — **${cantidad} voto${cantidad === 1 ? "" : "s"}**\n`;
                });

                descripcion +=
                    `\n👥 **Total de votos:** ${Array.from(
                        { length: opciones.length },
                        (_, index) => votos[index].size
                    ).reduce((a, b) => a + b, 0)}`;

                return new EmbedBuilder()
                    .setTitle("📊 ENCUESTA")
                    .setDescription(descripcion)
                    .setColor(0x5865f2)
                    .addFields({
                        name: "🗳️ Cómo votar",
                        value:
                            "Pulsa el botón correspondiente a tu elección.\n" +
                            "Solo puedes tener un voto activo.",
                        inline: false
                    })
                    .setFooter({
                        text: `Creada por ${interaction.user.tag}`
                    })
                    .setTimestamp();
            };

            // ==========================================
            // BOTONES
            // ==========================================

            const filas = [];

            let filaActual =
                new ActionRowBuilder();

            opciones.forEach((opcion, index) => {

                const boton =
                    new ButtonBuilder()
                        .setCustomId(
                            `encuesta_voto_${interaction.id}_${index}`
                        )
                        .setLabel(
                            `${index + 1}. ${opcion}`.slice(0, 80)
                        )
                        .setStyle(ButtonStyle.Primary);

                if (filaActual.components.length >= 5) {
                    filas.push(filaActual);
                    filaActual =
                        new ActionRowBuilder();
                }

                filaActual.addComponents(boton);
            });

            if (filaActual.components.length > 0) {
                filas.push(filaActual);
            }

            // ==========================================
            // BOTÓN CERRAR
            // ==========================================

            const filaCerrar =
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(
                            `encuesta_cerrar_${interaction.id}`
                        )
                        .setLabel("Cerrar encuesta")
                        .setEmoji("🔒")
                        .setStyle(ButtonStyle.Danger)
                );

            filas.push(filaCerrar);

            // ==========================================
            // ENVIAR ENCUESTA
            // ==========================================

            await interaction.reply({
                embeds: [crearEmbed()],
                components: filas
            });

            const mensaje =
                await interaction.fetchReply();

            // ==========================================
            // COLECCIÓN DE INTERACCIONES
            // ==========================================

            const collector =
                mensaje.createMessageComponentCollector({
                    time: 24 * 60 * 60 * 1000
                });

            collector.on("collect", async buttonInteraction => {

                try {

                    // ======================================
                    // CERRAR ENCUESTA
                    // ======================================

                    if (
                        buttonInteraction.customId ===
                        `encuesta_cerrar_${interaction.id}`
                    ) {

                        if (
                            buttonInteraction.user.id !==
                            interaction.user.id
                        ) {
                            return buttonInteraction.reply({
                                content:
                                    "❌ Solo la persona que creó la encuesta puede cerrarla.",
                                ephemeral: true
                            });
                        }

                        collector.stop("cerrada");

                        const embedFinal =
                            crearEmbed()
                                .setTitle("🔒 ENCUESTA CERRADA")
                                .setColor(0x747f8d)
                                .setFooter({
                                    text:
                                        `Encuesta cerrada por ${interaction.user.tag}`
                                });

                        const componentesDesactivados =
                            filas.map(fila => {

                                const nuevaFila =
                                    new ActionRowBuilder();

                                fila.components.forEach(componente => {

                                    const nuevoBoton =
                                        ButtonBuilder.from(componente)
                                            .setDisabled(true);

                                    nuevaFila.addComponents(
                                        nuevoBoton
                                    );
                                });

                                return nuevaFila;
                            });

                        await buttonInteraction.update({
                            embeds: [embedFinal],
                            components:
                                componentesDesactivados
                        });

                        return;
                    }

                    // ======================================
                    // VOTAR
                    // ======================================

                    const prefijo =
                        `encuesta_voto_${interaction.id}_`;

                    if (
                        !buttonInteraction.customId.startsWith(
                            prefijo
                        )
                    ) {
                        return;
                    }

                    const indice =
                        parseInt(
                            buttonInteraction.customId
                                .replace(prefijo, ""),
                            10
                        );

                    if (
                        Number.isNaN(indice) ||
                        !votos[indice]
                    ) {
                        return buttonInteraction.reply({
                            content:
                                "❌ Esa opción ya no existe.",
                            ephemeral: true
                        });
                    }

                    const usuarioId =
                        buttonInteraction.user.id;

                    // ======================================
                    // QUITAR VOTO ANTERIOR
                    // ======================================

                    for (const indiceOpcion of Object.keys(votos)) {
                        votos[indiceOpcion].delete(
                            usuarioId
                        );
                    }

                    // ======================================
                    // GUARDAR NUEVO VOTO
                    // ======================================

                    votos[indice].add(usuarioId);

                    await buttonInteraction.update({
                        embeds: [crearEmbed()],
                        components: filas
                    });

                } catch (error) {

                    console.error(
                        "[ENCUESTA] Error procesando voto:",
                        error
                    );

                    if (!buttonInteraction.replied &&
                        !buttonInteraction.deferred) {

                        await buttonInteraction.reply({
                            content:
                                "❌ Ocurrió un error procesando tu voto.",
                            ephemeral: true
                        }).catch(() => {});
                    }
                }
            });

            collector.on("end", async (_, motivo) => {

                if (motivo === "cerrada") {
                    return;
                }

                try {

                    const embedFinal =
                        crearEmbed()
                            .setTitle("🔒 ENCUESTA FINALIZADA")
                            .setColor(0x747f8d);

                    const componentesDesactivados =
                        filas.map(fila => {

                            const nuevaFila =
                                new ActionRowBuilder();

                            fila.components.forEach(componente => {

                                nuevaFila.addComponents(
                                    ButtonBuilder
                                        .from(componente)
                                        .setDisabled(true)
                                );
                            });

                            return nuevaFila;
                        });

                    await interaction.editReply({
                        embeds: [embedFinal],
                        components:
                            componentesDesactivados
                    });

                } catch (error) {
                    console.error(
                        "[ENCUESTA] Error finalizando encuesta:",
                        error
                    );
                }
            });

        } catch (error) {

            console.error(
                "[ENCUESTA] Error creando encuesta:",
                error
            );

            if (
                interaction.deferred ||
                interaction.replied
            ) {
                await interaction.editReply(
                    "❌ Error creando la encuesta."
                ).catch(() => {});
            } else {
                await interaction.reply({
                    content:
                        "❌ Error creando la encuesta.",
                    ephemeral: true
                }).catch(() => {});
            }
        }
    }
};