const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const KickTeamMember =
    require("../models/KickTeamMember");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("crear-team")
        .setDescription("Crea un Team seleccionando jugadores de la lista."),

    async execute(interaction) {
        try {
            const miembros =
                await KickTeamMember.find({
                    guildId: interaction.guild.id
                })
                    .sort({
                        nombre: 1
                    })
                    .lean();

            if (!miembros.length) {
                return interaction.reply({
                    content:
                        "❌ No hay nombres en la lista.\n\n" +
                        "Primero agrega jugadores con `/team-agregar`.",
                    ephemeral: true
                });
            }

            /*
             * Discord permite un máximo de 25 opciones
             * en un String Select Menu.
             *
             * El Team puede tener hasta 15 miembros.
             */
            const opciones =
                miembros
                    .slice(0, 25)
                    .map(miembro => ({
                        label: miembro.nombre.slice(0, 100),
                        value: String(miembro._id),
                        description: "Seleccionar para el Team"
                    }));

            const selector =
                new StringSelectMenuBuilder()
                    .setCustomId(
                        `crear_team_selector_${interaction.user.id}`
                    )
                    .setPlaceholder(
                        "Selecciona los miembros del Team"
                    )
                    .setMinValues(1)
                    .setMaxValues(
                        Math.min(15, opciones.length)
                    )
                    .addOptions(opciones);

            const filaSelector =
                new ActionRowBuilder()
                    .addComponents(selector);

            const botonCancelar =
                new ButtonBuilder()
                    .setCustomId(
                        `crear_team_cancelar_${interaction.user.id}`
                    )
                    .setLabel("Cancelar")
                    .setStyle(ButtonStyle.Danger);

            const filaBoton =
                new ActionRowBuilder()
                    .addComponents(botonCancelar);

            const embed =
                new EmbedBuilder()
                    .setTitle("🎯 Crear Team")
                    .setDescription(
                        "Selecciona los jugadores que formarán el Team.\n\n" +
                        "👥 Máximo: **15 miembros**."
                    )
                    .setColor(0x5865F2)
                    .setFooter({
                        text: "RustLogix"
                    });

            return interaction.reply({
                embeds: [embed],
                components: [
                    filaSelector,
                    filaBoton
                ]
            });

        } catch (error) {
            console.error(
                "❌ Error en /crear-team:",
                error
            );

            if (interaction.replied || interaction.deferred) {
                return interaction.followUp({
                    content: "❌ Ocurrió un error al abrir el creador de Teams.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: "❌ Ocurrió un error al abrir el creador de Teams.",
                ephemeral: true
            });
        }
    },

    async manejarSelectMenu(interaction) {
        try {
            const prefijo =
                "crear_team_selector_";

            if (!interaction.customId.startsWith(prefijo)) {
                return;
            }

            const usuarioId =
                interaction.customId.substring(
                    prefijo.length
                );

            if (interaction.user.id !== usuarioId) {
                return interaction.reply({
                    content:
                        "❌ Este selector pertenece a otra persona.",
                    ephemeral: true
                });
            }

            const seleccionados =
                interaction.values;

            if (!seleccionados.length) {
                return interaction.reply({
                    content:
                        "❌ Debes seleccionar al menos un miembro.",
                    ephemeral: true
                });
            }

            if (seleccionados.length > 15) {
                return interaction.reply({
                    content:
                        "❌ Un Team puede tener como máximo 15 miembros.",
                    ephemeral: true
                });
            }

            const miembros =
                await KickTeamMember.find({
                    _id: {
                        $in: seleccionados
                    },
                    guildId: interaction.guild.id
                })
                    .lean();

            if (!miembros.length) {
                return interaction.reply({
                    content:
                        "❌ No se encontraron los miembros seleccionados.",
                    ephemeral: true
                });
            }

            const nombres =
                miembros.map(miembro =>
                    miembro.nombre
                );

            const menciones = [];

            for (const nombre of nombres) {
                let miembroDiscord = null;

                try {
                    miembroDiscord =
                        interaction.guild.members.cache.find(
                            member =>
                                member.user.username.toLowerCase() ===
                                nombre.toLowerCase() ||

                                member.displayName.toLowerCase() ===
                                nombre.toLowerCase()
                        );

                    if (!miembroDiscord) {
                        miembroDiscord =
                            await interaction.guild.members
                                .search({
                                    query: nombre,
                                    limit: 10
                                })
                                .then(resultado =>
                                    resultado.find(member =>
                                        member.user.username.toLowerCase() ===
                                        nombre.toLowerCase() ||

                                        member.displayName.toLowerCase() ===
                                        nombre.toLowerCase()
                                    )
                                );
                    }
                } catch (error) {
                    console.error(
                        `⚠️ No se pudo buscar a ${nombre}:`,
                        error
                    );
                }

                if (miembroDiscord) {
                    menciones.push(
                        `<@${miembroDiscord.id}>`
                    );
                } else {
                    menciones.push(
                        `@${nombre}`
                    );
                }
            }

            const creador =
                `<@${interaction.user.id}>`;

            const textoTeam =
                `Hola ${creador}\n\n` +
                `El team es ${menciones.join(" ")}`;

            const embed =
                new EmbedBuilder()
                    .setDescription(textoTeam)
                    .setColor(0x5865F2)
                    .setFooter({
                        text: "RustLogix"
                    });

            await interaction.update({
                embeds: [embed],
                components: []
            });

        } catch (error) {
            console.error(
                "❌ Error en selector de crear-team:",
                error
            );

            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content:
                        "❌ Ocurrió un error al crear el Team.",
                    ephemeral: true
                });
            }
        }
    },

    async manejarBoton(interaction) {
        try {
            if (
                interaction.customId.startsWith(
                    "crear_team_cancelar_"
                )
            ) {
                const usuarioId =
                    interaction.customId.replace(
                        "crear_team_cancelar_",
                        ""
                    );

                if (
                    interaction.user.id !==
                    usuarioId
                ) {
                    return interaction.reply({
                        content:
                            "❌ Este botón pertenece a otra persona.",
                        ephemeral: true
                    });
                }

                return interaction.update({
                    content:
                        "❌ Creación del Team cancelada.",
                    embeds: [],
                    components: []
                });
            }

        } catch (error) {
            console.error(
                "❌ Error en botón de crear-team:",
                error
            );

            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({
                    content:
                        "❌ Ocurrió un error.",
                    ephemeral: true
                });
            }
        }
    }
};