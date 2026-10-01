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

// ============================================================
// CONFIGURACIÓN
// ============================================================

const MIEMBROS_POR_PAGINA = 25;
const MAX_MIEMBROS_TEAM = 25;

// ============================================================
// ESTADO TEMPORAL DE LOS TEAMS
// ============================================================

// Guarda las selecciones mientras el usuario navega
// entre las distintas páginas.
//
// La información se mantiene solamente mientras el proceso
// del bot esté funcionando.
const sesionesTeam = new Map();

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function obtenerClaveSesion(interaction) {
    return `${interaction.guild.id}_${interaction.user.id}`;
}

function obtenerPaginaValida(pagina, totalPaginas) {
    if (pagina < 0) {
        return 0;
    }

    if (pagina >= totalPaginas) {
        return Math.max(0, totalPaginas - 1);
    }

    return pagina;
}

// ============================================================
// CREAR EMBED
// ============================================================

function crearEmbed({
    pagina,
    totalPaginas,
    seleccionados,
    miembrosPagina
}) {
    const cantidadSeleccionados =
        seleccionados.size;

    let descripcion =
        "Selecciona los jugadores que formarán el Team.\n\n" +
        `👥 **Seleccionados: ${cantidadSeleccionados}/${MAX_MIEMBROS_TEAM}**\n` +
        `📄 **Página: ${pagina + 1}/${totalPaginas}**`;

    if (cantidadSeleccionados === MAX_MIEMBROS_TEAM) {
        descripcion +=
            "\n\n⚠️ Has alcanzado el máximo de **25 miembros**.";
    }

    if (!miembrosPagina.length) {
        descripcion +=
            "\n\n❌ No hay jugadores en esta página.";
    }

    return new EmbedBuilder()
        .setTitle("🎯 Crear Team")
        .setDescription(descripcion)
        .setColor(0x5865F2)
        .setFooter({
            text: "RustLogix"
        });
}

// ============================================================
// CREAR COMPONENTES DE UNA PÁGINA
// ============================================================

function crearComponentes({
    usuarioId,
    pagina,
    totalPaginas,
    miembrosPagina,
    seleccionados
}) {
    // --------------------------------------------------------
    // SELECTOR
    // --------------------------------------------------------

    const opciones = miembrosPagina.map(miembro => ({
        label: miembro.nombre.slice(0, 100),
        value: String(miembro._id),
        description: seleccionados.has(
            String(miembro._id)
        )
            ? "✅ Seleccionado"
            : "Seleccionar para el Team",
        default: seleccionados.has(
            String(miembro._id)
        )
    }));

    const selector = new StringSelectMenuBuilder()
        .setCustomId(
            `crear_team_selector_${usuarioId}`
        )
        .setPlaceholder(
            "Selecciona los miembros del Team"
        )
        .setMinValues(0)
        .setMaxValues(
            Math.min(
                MIEMBROS_POR_PAGINA,
                opciones.length
            )
        )
        .addOptions(opciones);

    const filaSelector =
        new ActionRowBuilder()
            .addComponents(selector);

    // --------------------------------------------------------
    // PAGINACIÓN
    // --------------------------------------------------------

    const botonAnterior = new ButtonBuilder()
        .setCustomId(
            `crear_team_pagina_anterior_${usuarioId}_${pagina}`
        )
        .setLabel("⬅️ Anterior")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(pagina <= 0);

    const botonSiguiente = new ButtonBuilder()
        .setCustomId(
            `crear_team_pagina_siguiente_${usuarioId}_${pagina}`
        )
        .setLabel("➡️ Siguiente")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(
            pagina >= totalPaginas - 1
        );

    const filaPaginas =
        new ActionRowBuilder()
            .addComponents(
                botonAnterior,
                botonSiguiente
            );

    // --------------------------------------------------------
    // CONFIRMAR / CANCELAR
    // --------------------------------------------------------

    const botonCrear = new ButtonBuilder()
        .setCustomId(
            `crear_team_confirmar_${usuarioId}`
        )
        .setLabel("✅ Crear Team")
        .setStyle(ButtonStyle.Success)
        .setDisabled(
            seleccionados.size === 0
        );

    const botonCancelar = new ButtonBuilder()
        .setCustomId(
            `crear_team_cancelar_${usuarioId}`
        )
        .setLabel("❌ Cancelar")
        .setStyle(ButtonStyle.Danger);

    const filaAcciones =
        new ActionRowBuilder()
            .addComponents(
                botonCrear,
                botonCancelar
            );

    return [
        filaSelector,
        filaPaginas,
        filaAcciones
    ];
}

// ============================================================
// CARGAR DATOS DE UNA PÁGINA
// ============================================================

async function obtenerDatosPagina(guildId, pagina) {
    const miembros = await KickTeamMember.find({
        guildId: guildId
    })
        .sort({
            nombre: 1
        })
        .lean();

    const totalPaginas =
        Math.max(
            1,
            Math.ceil(
                miembros.length /
                MIEMBROS_POR_PAGINA
            )
        );

    const paginaValida =
        obtenerPaginaValida(
            pagina,
            totalPaginas
        );

    const inicio =
        paginaValida *
        MIEMBROS_POR_PAGINA;

    const miembrosPagina =
        miembros.slice(
            inicio,
            inicio + MIEMBROS_POR_PAGINA
        );

    return {
        miembros,
        miembrosPagina,
        pagina: paginaValida,
        totalPaginas
    };
}

// ============================================================
// COMANDO /CREAR-TEAM
// ============================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("crear-team")
        .setDescription(
            "Crea un Team seleccionando jugadores de la lista."
        ),

    // ========================================================
    // EJECUTAR COMANDO
    // ========================================================

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

            const clave =
                obtenerClaveSesion(interaction);

            const seleccionados =
                new Set();

            sesionesTeam.set(
                clave,
                {
                    seleccionados
                }
            );

            const pagina = 0;

            const totalPaginas =
                Math.ceil(
                    miembros.length /
                    MIEMBROS_POR_PAGINA
                );

            const miembrosPagina =
                miembros.slice(
                    0,
                    MIEMBROS_POR_PAGINA
                );

            const embed =
                crearEmbed({
                    pagina,
                    totalPaginas,
                    seleccionados,
                    miembrosPagina
                });

            const componentes =
                crearComponentes({
                    usuarioId:
                        interaction.user.id,
                    pagina,
                    totalPaginas,
                    miembrosPagina,
                    seleccionados
                });

            return interaction.reply({
                embeds: [embed],
                components: componentes
            });

        } catch (error) {
            console.error(
                "❌ Error en /crear-team:",
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {
                return interaction.followUp({
                    content:
                        "❌ Ocurrió un error al abrir el creador de Teams.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    "❌ Ocurrió un error al abrir el creador de Teams.",
                ephemeral: true
            });
        }
    },

    // ========================================================
    // SELECTOR DE JUGADORES
    // ========================================================

    async manejarSelectMenu(interaction) {
        try {
            const prefijo =
                "crear_team_selector_";

            if (
                !interaction.customId.startsWith(
                    prefijo
                )
            ) {
                return;
            }

            const usuarioId =
                interaction.customId.substring(
                    prefijo.length
                );

            if (
                interaction.user.id !==
                usuarioId
            ) {
                return interaction.reply({
                    content:
                        "❌ Este selector pertenece a otra persona.",
                    ephemeral: true
                });
            }

            const clave =
                obtenerClaveSesion(interaction);

            const sesion =
                sesionesTeam.get(clave);

            if (!sesion) {
                return interaction.reply({
                    content:
                        "❌ Esta sesión de creación de Team ya no está disponible. Ejecuta `/crear-team` nuevamente.",
                    ephemeral: true
                });
            }

            // ------------------------------------------------
            // OBTENER LA PÁGINA ACTUAL
            // ------------------------------------------------

            const paginaActual =
                Number(
                    interaction.message
                        .components?.[1]
                        ?.components?.[0]
                        ?.customId
                        ?.match(
                            /_(\d+)$/
                        )?.[1] || 0
                );

            const {
                miembrosPagina,
                pagina,
                totalPaginas
            } =
                await obtenerDatosPagina(
                    interaction.guild.id,
                    paginaActual
                );

            // ------------------------------------------------
            // IDS SELECCIONADOS EN ESTA PÁGINA
            // ------------------------------------------------

            const idsPagina =
                miembrosPagina.map(
                    miembro =>
                        String(
                            miembro._id
                        )
                );

            // Primero quitamos de la selección global
            // los jugadores que pertenecen a esta página.
            //
            // Después agregamos los que el usuario dejó
            // seleccionados actualmente.
            for (
                const id of idsPagina
            ) {
                sesion.seleccionados.delete(id);
            }

            const nuevosSeleccionados =
                interaction.values;

            // Comprobamos el nuevo total.
            const nuevoTotal =
                sesion.seleccionados.size +
                nuevosSeleccionados.length;

            if (
                nuevoTotal >
                MAX_MIEMBROS_TEAM
            ) {
                return interaction.reply({
                    content:
                        `❌ Un Team puede tener como máximo **${MAX_MIEMBROS_TEAM} jugadores**.\n\n` +
                        `Actualmente tienes **${sesion.seleccionados.size}** seleccionados fuera de esta página.`,
                    ephemeral: true
                });
            }

            // Agregar selección actual.
            for (
                const id of nuevosSeleccionados
            ) {
                sesion.seleccionados.add(id);
            }

            const embed =
                crearEmbed({
                    pagina,
                    totalPaginas,
                    seleccionados:
                        sesion.seleccionados,
                    miembrosPagina
                });

            const componentes =
                crearComponentes({
                    usuarioId,
                    pagina,
                    totalPaginas,
                    miembrosPagina,
                    seleccionados:
                        sesion.seleccionados
                });

            return interaction.update({
                embeds: [embed],
                components: componentes
            });

        } catch (error) {
            console.error(
                "❌ Error en selector de crear-team:",
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                return interaction.reply({
                    content:
                        "❌ Ocurrió un error al seleccionar los jugadores.",
                    ephemeral: true
                });
            }
        }
    },

    // ========================================================
    // BOTONES
    // ========================================================

    async manejarBoton(interaction) {
        try {
            const customId =
                interaction.customId;

            // =================================================
            // VERIFICAR QUE SEA UN BOTÓN DE CREAR TEAM
            // =================================================

            if (
                !customId.startsWith(
                    "crear_team_"
                )
            ) {
                return;
            }

            // =================================================
            // CANCELAR
            // =================================================

            if (
                customId.startsWith(
                    "crear_team_cancelar_"
                )
            ) {
                const usuarioId =
                    customId.replace(
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

                const clave =
                    obtenerClaveSesion(
                        interaction
                    );

                sesionesTeam.delete(
                    clave
                );

                return interaction.update({
                    content:
                        "❌ Creación del Team cancelada.",
                    embeds: [],
                    components: []
                });
            }

            // =================================================
            // CREAR TEAM
            // =================================================

            if (
                customId.startsWith(
                    "crear_team_confirmar_"
                )
            ) {
                const usuarioId =
                    customId.replace(
                        "crear_team_confirmar_",
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

                const clave =
                    obtenerClaveSesion(
                        interaction
                    );

                const sesion =
                    sesionesTeam.get(
                        clave
                    );

                if (!sesion) {
                    return interaction.reply({
                        content:
                            "❌ Esta sesión de creación de Team ya no está disponible.",
                        ephemeral: true
                    });
                }

                const seleccionados =
                    Array.from(
                        sesion.seleccionados
                    );

                if (
                    seleccionados.length ===
                    0
                ) {
                    return interaction.reply({
                        content:
                            "❌ Debes seleccionar al menos un jugador.",
                        ephemeral: true
                    });
                }

                if (
                    seleccionados.length >
                    MAX_MIEMBROS_TEAM
                ) {
                    return interaction.reply({
                        content:
                            `❌ Un Team puede tener como máximo ${MAX_MIEMBROS_TEAM} jugadores.`,
                        ephemeral: true
                    });
                }

                // ---------------------------------------------
                // BUSCAR JUGADORES
                // ---------------------------------------------

                const miembros =
                    await KickTeamMember.find({
                        _id: {
                            $in: seleccionados
                        },
                        guildId:
                            interaction.guild.id
                    }).lean();

                if (
                    !miembros.length
                ) {
                    return interaction.reply({
                        content:
                            "❌ No se encontraron los jugadores seleccionados.",
                        ephemeral: true
                    });
                }

                // ---------------------------------------------
                // RESPETAR EL ORDEN DE SELECCIÓN
                // ---------------------------------------------

                const nombresSeleccionados =
                    seleccionados
                        .map(id =>
                            miembros.find(
                                miembro =>
                                    String(
                                        miembro._id
                                    ) ===
                                    String(id)
                            )
                        )
                        .filter(Boolean)
                        .map(
                            miembro =>
                                `@${miembro.nombre}`
                        );

                if (
                    !nombresSeleccionados.length
                ) {
                    return interaction.reply({
                        content:
                            "❌ No se pudieron obtener los nombres seleccionados.",
                        ephemeral: true
                    });
                }

                // ---------------------------------------------
                // CREAR COMANDO KICK
                // ---------------------------------------------

                const textoTeam =
                    `!editcom !team Hola $(user) El team es ${nombresSeleccionados.join(" ")}`;

                const textoCodigo =
                    `\`\`\`${textoTeam}\`\`\``;

                const embed =
                    new EmbedBuilder()
                        .setDescription(
                            textoCodigo
                        )
                        .setColor(
                            0x5865F2
                        )
                        .setFooter({
                            text:
                                "RustLogix"
                        });

                // ---------------------------------------------
                // BORRAR SESIÓN
                // ---------------------------------------------

                sesionesTeam.delete(
                    clave
                );

                // ---------------------------------------------
                // MOSTRAR RESULTADO
                // ---------------------------------------------

                return interaction.update({
                    embeds: [embed],
                    components: []
                });
            }

            // =================================================
            // PAGINA ANTERIOR
            // =================================================

            if (
                customId.startsWith(
                    "crear_team_pagina_anterior_"
                )
            ) {
                const partes =
                    customId.split("_");

                const usuarioId =
                    partes[
                        partes.length - 2
                    ];

                const paginaActual =
                    Number(
                        partes[
                            partes.length - 1
                        ]
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

                const clave =
                    obtenerClaveSesion(
                        interaction
                    );

                const sesion =
                    sesionesTeam.get(
                        clave
                    );

                if (!sesion) {
                    return interaction.reply({
                        content:
                            "❌ Esta sesión ya no está disponible.",
                        ephemeral: true
                    });
                }

                const nuevaPagina =
                    Math.max(
                        0,
                        paginaActual - 1
                    );

                const {
                    miembrosPagina,
                    pagina,
                    totalPaginas
                } =
                    await obtenerDatosPagina(
                        interaction.guild.id,
                        nuevaPagina
                    );

                const embed =
                    crearEmbed({
                        pagina,
                        totalPaginas,
                        seleccionados:
                            sesion.seleccionados,
                        miembrosPagina
                    });

                const componentes =
                    crearComponentes({
                        usuarioId,
                        pagina,
                        totalPaginas,
                        miembrosPagina,
                        seleccionados:
                            sesion.seleccionados
                    });

                return interaction.update({
                    embeds: [embed],
                    components: componentes
                });
            }

            // =================================================
            // PAGINA SIGUIENTE
            // =================================================

            if (
                customId.startsWith(
                    "crear_team_pagina_siguiente_"
                )
            ) {
                const partes =
                    customId.split("_");

                const usuarioId =
                    partes[
                        partes.length - 2
                    ];

                const paginaActual =
                    Number(
                        partes[
                            partes.length - 1
                        ]
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

                const clave =
                    obtenerClaveSesion(
                        interaction
                    );

                const sesion =
                    sesionesTeam.get(
                        clave
                    );

                if (!sesion) {
                    return interaction.reply({
                        content:
                            "❌ Esta sesión ya no está disponible.",
                        ephemeral: true
                    });
                }

                const {
                    totalPaginas
                } =
                    await obtenerDatosPagina(
                        interaction.guild.id,
                        paginaActual
                    );

                const nuevaPagina =
                    Math.min(
                        totalPaginas - 1,
                        paginaActual + 1
                    );

                const datos =
                    await obtenerDatosPagina(
                        interaction.guild.id,
                        nuevaPagina
                    );

                const embed =
                    crearEmbed({
                        pagina:
                            datos.pagina,
                        totalPaginas:
                            datos.totalPaginas,
                        seleccionados:
                            sesion.seleccionados,
                        miembrosPagina:
                            datos.miembrosPagina
                    });

                const componentes =
                    crearComponentes({
                        usuarioId,
                        pagina:
                            datos.pagina,
                        totalPaginas:
                            datos.totalPaginas,
                        miembrosPagina:
                            datos.miembrosPagina,
                        seleccionados:
                            sesion.seleccionados
                    });

                return interaction.update({
                    embeds: [embed],
                    components: componentes
                });
            }

        } catch (error) {
            console.error(
                "❌ Error en botón de crear-team:",
                error
            );

            if (
                !interaction.replied &&
                !interaction.deferred
            ) {
                return interaction.reply({
                    content:
                        "❌ Ocurrió un error con el creador de Teams.",
                    ephemeral: true
                });
            }
        }
    }
};