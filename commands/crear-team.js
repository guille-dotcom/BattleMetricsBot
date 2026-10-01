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
// SESIONES TEMPORALES
// ============================================================

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
// OBTENER DATOS DE UNA PÁGINA
// ============================================================

async function obtenerDatosPagina(guildId, pagina) {

    const miembros =
        await KickTeamMember.find({
            guildId
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

    if (
        cantidadSeleccionados ===
        MAX_MIEMBROS_TEAM
    ) {
        descripcion +=
            "\n\n⚠️ Has alcanzado el máximo de **25 miembros**.";
    }

    if (
        miembrosPagina.length === 0
    ) {
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
// CREAR COMPONENTES
// ============================================================

function crearComponentes({
    usuarioId,
    pagina,
    totalPaginas,
    miembrosPagina,
    seleccionados
}) {

    // ========================================================
    // SELECTOR
    // ========================================================

    const opciones =
        miembrosPagina.map(
            miembro => {

                const id =
                    String(
                        miembro._id
                    );

                const seleccionado =
                    seleccionados.has(
                        id
                    );

                return {
                    label:
                        String(
                            miembro.nombre
                        ).slice(
                            0,
                            100
                        ),

                    value:
                        id,

                    description:
                        seleccionado
                            ? "✅ Seleccionado"
                            : "Seleccionar para el Team",

                    default:
                        seleccionado
                };
            }
        );

    const selector =
        new StringSelectMenuBuilder()
            .setCustomId(
                `crear_team_selector_${usuarioId}_${pagina}`
            )
            .setPlaceholder(
                "Selecciona los miembros del Team"
            )
            .setMinValues(0)
            .setMaxValues(
                Math.min(
                    MIEMBROS_POR_PAGINA,
                    Math.max(
                        1,
                        opciones.length
                    )
                )
            );

    if (
        opciones.length > 0
    ) {
        selector.addOptions(
            opciones
        );
    }

    const filaSelector =
        new ActionRowBuilder()
            .addComponents(
                selector
            );

    // ========================================================
    // PAGINACIÓN
    // ========================================================

    const botonAnterior =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_pagina_anterior_${usuarioId}_${pagina}`
            )
            .setLabel(
                "⬅️ Anterior"
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina <= 0
            );

    const botonSiguiente =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_pagina_siguiente_${usuarioId}_${pagina}`
            )
            .setLabel(
                "➡️ Siguiente"
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina >=
                totalPaginas - 1
            );

    const filaPaginas =
        new ActionRowBuilder()
            .addComponents(
                botonAnterior,
                botonSiguiente
            );

    // ========================================================
    // CREAR / CANCELAR
    // ========================================================

    const botonCrear =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_confirmar_${usuarioId}`
            )
            .setLabel(
                "✅ Crear Team"
            )
            .setStyle(
                ButtonStyle.Success
            )
            .setDisabled(
                seleccionados.size === 0
            );

    const botonCancelar =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_cancelar_${usuarioId}`
            )
            .setLabel(
                "❌ Cancelar"
            )
            .setStyle(
                ButtonStyle.Danger
            );

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
// ACTUALIZAR PANEL
// ============================================================

async function actualizarPanel(
    interaction,
    pagina
) {

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
                "❌ Esta sesión de creación de Team ya no está disponible. Ejecuta `/crear-team` nuevamente.",
            ephemeral: true
        });
    }

    const datos =
        await obtenerDatosPagina(
            interaction.guild.id,
            pagina
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
            usuarioId:
                interaction.user.id,

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
        embeds: [
            embed
        ],
        components:
            componentes
    });
}

// ============================================================
// COMANDO
// ============================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName(
                "crear-team"
            )
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
                    guildId:
                        interaction.guild.id
                })
                    .sort({
                        nombre: 1
                    })
                    .lean();

            if (
                miembros.length === 0
            ) {

                return interaction.reply({
                    content:
                        "❌ No hay nombres en la lista.\n\n" +
                        "Primero agrega jugadores con `/team-agregar`.",
                    ephemeral:
                        true
                });
            }

            const clave =
                obtenerClaveSesion(
                    interaction
                );

            const seleccionados =
                new Set();

            sesionesTeam.set(
                clave,
                {
                    seleccionados
                }
            );

            const pagina =
                0;

            const totalPaginas =
                Math.max(
                    1,
                    Math.ceil(
                        miembros.length /
                        MIEMBROS_POR_PAGINA
                    )
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
                embeds: [
                    embed
                ],
                components:
                    componentes
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
                    ephemeral:
                        true
                });
            }

            return interaction.reply({
                content:
                    "❌ Ocurrió un error al abrir el creador de Teams.",
                ephemeral:
                    true
            });
        }
    },

    // ========================================================
    // SELECTOR
    // ========================================================

    async manejarSelectMenu(
        interaction
    ) {

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

            const resto =
                interaction.customId.substring(
                    prefijo.length
                );

            const ultimoGuion =
                resto.lastIndexOf("_");

            const usuarioId =
                resto.substring(
                    0,
                    ultimoGuion
                );

            const paginaActual =
                Number(
                    resto.substring(
                        ultimoGuion + 1
                    )
                );

            if (
                interaction.user.id !==
                usuarioId
            ) {

                return interaction.reply({
                    content:
                        "❌ Este selector pertenece a otra persona.",
                    ephemeral:
                        true
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
                        "❌ Esta sesión de creación de Team ya no está disponible. Ejecuta `/crear-team` nuevamente.",
                    ephemeral:
                        true
                });
            }

            const datos =
                await obtenerDatosPagina(
                    interaction.guild.id,
                    paginaActual
                );

            const idsPagina =
                datos.miembrosPagina.map(
                    miembro =>
                        String(
                            miembro._id
                        )
                );

            // =================================================
            // QUITAR SELECCIONES DE ESTA PÁGINA
            // =================================================

            for (
                const id of idsPagina
            ) {

                sesion.seleccionados.delete(
                    id
                );
            }

            // =================================================
            // NUEVAS SELECCIONES
            // =================================================

            const nuevosSeleccionados =
                interaction.values || [];

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
                    ephemeral:
                        true
                });
            }

            for (
                const id of nuevosSeleccionados
            ) {

                sesion.seleccionados.add(
                    String(id)
                );
            }

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
                embeds: [
                    embed
                ],
                components:
                    componentes
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
                    ephemeral:
                        true
                });
            }
        }
    },

    // ========================================================
    // BOTONES
    // ========================================================

    async manejarBoton(
        interaction
    ) {

        try {

            const customId =
                interaction.customId;

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
                    customId.substring(
                        "crear_team_cancelar_".length
                    );

                if (
                    interaction.user.id !==
                    usuarioId
                ) {

                    return interaction.reply({
                        content:
                            "❌ Este botón pertenece a otra persona.",
                        ephemeral:
                            true
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
                    customId.substring(
                        "crear_team_confirmar_".length
                    );

                if (
                    interaction.user.id !==
                    usuarioId
                ) {

                    return interaction.reply({
                        content:
                            "❌ Este botón pertenece a otra persona.",
                        ephemeral:
                            true
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
                        ephemeral:
                            true
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
                        ephemeral:
                            true
                    });
                }

                if (
                    seleccionados.length >
                    MAX_MIEMBROS_TEAM
                ) {

                    return interaction.reply({
                        content:
                            `❌ Un Team puede tener como máximo **${MAX_MIEMBROS_TEAM} jugadores**.`,
                        ephemeral:
                            true
                    });
                }

                // =============================================
                // BUSCAR JUGADORES
                // =============================================

                const miembros =
                    await KickTeamMember.find({
                        _id: {
                            $in:
                                seleccionados
                        },

                        guildId:
                            interaction.guild.id
                    }).lean();

                if (
                    miembros.length ===
                    0
                ) {

                    return interaction.reply({
                        content:
                            "❌ No se encontraron los jugadores seleccionados.",
                        ephemeral:
                            true
                    });
                }

                // =============================================
                // RESPETAR ORDEN
                // =============================================

                const nombresSeleccionados =
                    seleccionados
                        .map(
                            id =>
                                miembros.find(
                                    miembro =>
                                        String(
                                            miembro._id
                                        ) ===
                                        String(id)
                                )
                        )
                        .filter(
                            Boolean
                        )
                        .map(
                            miembro =>
                                `@${miembro.nombre}`
                        );

                if (
                    nombresSeleccionados.length ===
                    0
                ) {

                    return interaction.reply({
                        content:
                            "❌ No se pudieron obtener los nombres seleccionados.",
                        ephemeral:
                            true
                    });
                }

                // =============================================
                // CREAR TEXTO
                // =============================================

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

                // =============================================
                // BORRAR SESIÓN
                // =============================================

                sesionesTeam.delete(
                    clave
                );

                // =============================================
                // MOSTRAR RESULTADO
                // =============================================

                return interaction.update({
                    embeds: [
                        embed
                    ],
                    components: []
                });
            }

            // =================================================
            // PÁGINA ANTERIOR
            // =================================================

            if (
                customId.startsWith(
                    "crear_team_pagina_anterior_"
                )
            ) {

                const prefijo =
                    "crear_team_pagina_anterior_";

                const resto =
                    customId.substring(
                        prefijo.length
                    );

                const ultimoGuion =
                    resto.lastIndexOf("_");

                const usuarioId =
                    resto.substring(
                        0,
                        ultimoGuion
                    );

                const paginaActual =
                    Number(
                        resto.substring(
                            ultimoGuion + 1
                        )
                    );

                if (
                    interaction.user.id !==
                    usuarioId
                ) {

                    return interaction.reply({
                        content:
                            "❌ Este botón pertenece a otra persona.",
                        ephemeral:
                            true
                    });
                }

                const clave =
                    obtenerClaveSesion(
                        interaction
                    );

                if (
                    !sesionesTeam.has(
                        clave
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ Esta sesión ya no está disponible.",
                        ephemeral:
                            true
                    });
                }

                const nuevaPagina =
                    Math.max(
                        0,
                        paginaActual - 1
                    );

                return actualizarPanel(
                    interaction,
                    nuevaPagina
                );
            }

            // =================================================
            // PÁGINA SIGUIENTE
            // =================================================

            if (
                customId.startsWith(
                    "crear_team_pagina_siguiente_"
                )
            ) {

                const prefijo =
                    "crear_team_pagina_siguiente_";

                const resto =
                    customId.substring(
                        prefijo.length
                    );

                const ultimoGuion =
                    resto.lastIndexOf("_");

                const usuarioId =
                    resto.substring(
                        0,
                        ultimoGuion
                    );

                const paginaActual =
                    Number(
                        resto.substring(
                            ultimoGuion + 1
                        )
                    );

                if (
                    interaction.user.id !==
                    usuarioId
                ) {

                    return interaction.reply({
                        content:
                            "❌ Este botón pertenece a otra persona.",
                        ephemeral:
                            true
                    });
                }

                const clave =
                    obtenerClaveSesion(
                        interaction
                    );

                if (
                    !sesionesTeam.has(
                        clave
                    )
                ) {

                    return interaction.reply({
                        content:
                            "❌ Esta sesión ya no está disponible.",
                        ephemeral:
                            true
                    });
                }

                const datos =
                    await obtenerDatosPagina(
                        interaction.guild.id,
                        paginaActual
                    );

                const nuevaPagina =
                    Math.min(
                        datos.totalPaginas - 1,
                        paginaActual + 1
                    );

                return actualizarPanel(
                    interaction,
                    nuevaPagina
                );
            }

        } catch (error) {

            console.error(
                "❌ Error en botón de crear-team:",
                error
            );

            try {

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {

                    return interaction.reply({
                        content:
                            "❌ Ocurrió un error con el creador de Teams.",
                        ephemeral:
                            true
                    });
                }

            } catch (replyError) {

                console.error(
                    "❌ Error respondiendo botón de Team:",
                    replyError.message
                );
            }
        }
    }
};