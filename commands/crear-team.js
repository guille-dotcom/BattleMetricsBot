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
// SESIONES
// ============================================================

const sesionesTeam = new Map();

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function obtenerClaveSesion(interaction) {

    // La sesión pertenece al mensaje/panel,
    // no al usuario que ejecutó el comando.
    if (interaction.message?.id) {
        return `mensaje_${interaction.message.id}`;
    }

    // Antes de que exista el mensaje usamos
    // guild + canal + usuario temporalmente.
    return `temporal_${interaction.guild.id}_${interaction.channel.id}_${interaction.user.id}`;
}

// ============================================================

function obtenerPaginaValida(
    pagina,
    totalPaginas
) {

    if (totalPaginas <= 0) {
        return 0;
    }

    if (pagina < 0) {
        return 0;
    }

    if (pagina >= totalPaginas) {
        return totalPaginas - 1;
    }

    return pagina;
}

// ============================================================
// EMBED
// ============================================================

function crearEmbed(
    pagina,
    totalPaginas,
    miembros,
    seleccionados
) {

    const inicio =
        pagina *
        MIEMBROS_POR_PAGINA;

    const fin =
        inicio +
        MIEMBROS_POR_PAGINA;

    const miembrosPagina =
        miembros.slice(
            inicio,
            fin
        );

    let listaPagina =
        miembrosPagina
            .map(
                miembro => {

                    const seleccionado =
                        seleccionados.includes(
                            miembro.id
                        );

                    return `${
                        seleccionado
                            ? "☑️"
                            : "⬜"
                    } ${miembro.nombre}`;
                }
            )
            .join("\n");

    if (!listaPagina) {
        listaPagina =
            "No hay jugadores en esta página.";
    }

    return new EmbedBuilder()
        .setTitle("👥 Crear Team")
        .setDescription(
            "Selecciona los jugadores que quieres incluir en el Team.\n\n" +
            "Cualquier persona puede utilizar este panel."
        )
        .addFields(
            {
                name:
                    `Jugadores disponibles — Página ${pagina + 1}/${totalPaginas}`,
                value:
                    listaPagina
            },
            {
                name:
                    "Seleccionados",
                value:
                    `${seleccionados.length}/${MAX_MIEMBROS_TEAM}`
            }
        )
        .setFooter({
            text:
                "RustLogix • Crear Team"
        });
}

// ============================================================
// COMPONENTES
// ============================================================

function crearComponentes(
    panelId,
    pagina,
    totalPaginas,
    miembros,
    seleccionados
) {

    const inicio =
        pagina *
        MIEMBROS_POR_PAGINA;

    const fin =
        inicio +
        MIEMBROS_POR_PAGINA;

    const miembrosPagina =
        miembros.slice(
            inicio,
            fin
        );

    const opciones =
        miembrosPagina.map(
            miembro => ({
                label:
                    miembro.nombre
                        .slice(0, 100),

                value:
                    miembro.id,

                default:
                    seleccionados.includes(
                        miembro.id
                    )
            })
        );

    const selectMenu =
        new StringSelectMenuBuilder()
            .setCustomId(
                `crear_team_selector_${panelId}`
            )
            .setPlaceholder(
                "Selecciona los jugadores..."
            )
            .setMinValues(0)
            .setMaxValues(
                Math.min(
                    MAX_MIEMBROS_TEAM,
                    Math.max(
                        1,
                        opciones.length
                    )
                )
            )
            .addOptions(
                opciones
            );

    const filaSelector =
        new ActionRowBuilder()
            .addComponents(
                selectMenu
            );

    // ========================================================
    // PAGINACIÓN
    // ========================================================

    const botonAnterior =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_anterior_${panelId}`
            )
            .setLabel(
                "Anterior"
            )
            .setEmoji(
                "⬅️"
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina <= 0
            );

    const botonPagina =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_pagina_${panelId}`
            )
            .setLabel(
                `${pagina + 1}/${totalPaginas}`
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                true
            );

    const botonSiguiente =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_siguiente_${panelId}`
            )
            .setLabel(
                "Siguiente"
            )
            .setEmoji(
                "➡️"
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina >= totalPaginas - 1
            );

    const filaPaginas =
        new ActionRowBuilder()
            .addComponents(
                botonAnterior,
                botonPagina,
                botonSiguiente
            );

    // ========================================================
    // CREAR / CANCELAR
    // ========================================================

    const botonCrear =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_confirmar_${panelId}`
            )
            .setLabel(
                "Crear Team"
            )
            .setEmoji(
                "✅"
            )
            .setStyle(
                ButtonStyle.Success
            )
            .setDisabled(
                seleccionados.length === 0
            );

    const botonCancelar =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_cancelar_${panelId}`
            )
            .setLabel(
                "Cancelar"
            )
            .setEmoji(
                "❌"
            )
            .setStyle(
                ButtonStyle.Danger
            );

    const filaFinal =
        new ActionRowBuilder()
            .addComponents(
                botonCrear,
                botonCancelar
            );

    return [
        filaSelector,
        filaPaginas,
        filaFinal
    ];
}

// ============================================================
// ACTUALIZAR PANEL
// ============================================================

async function actualizarPanel(
    interaction,
    sesion,
    pagina
) {

    const totalPaginas =
        Math.ceil(
            sesion.miembros.length /
            MIEMBROS_POR_PAGINA
        );

    pagina =
        obtenerPaginaValida(
            pagina,
            totalPaginas
        );

    sesion.pagina =
        pagina;

    const embed =
        crearEmbed(
            pagina,
            totalPaginas,
            sesion.miembros,
            sesion.seleccionados
        );

    const componentes =
        crearComponentes(
            sesion.panelId,
            pagina,
            totalPaginas,
            sesion.miembros,
            sesion.seleccionados
        );

    return interaction.update({
        embeds: [
            embed
        ],
        components:
            componentes
    });
}

// ============================================================
// COMANDO /CREAR-TEAM
// ============================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName(
                "crear-team"
            )
            .setDescription(
                "Selecciona jugadores para crear un Team."
            ),

    // ========================================================
    // EXECUTE
    // ========================================================

    async execute(
        interaction
    ) {

        try {

            // ==================================================
            // OBTENER SOLO LOS NOMBRES AGREGADOS CON
            // /TEAM-AGREGAR
            // ==================================================

            const jugadores =
                await KickTeamMember.find({
                    guildId:
                        interaction.guild.id
                })
                    .sort({
                        nombre: 1
                    })
                    .lean();

            const miembros =
                jugadores.map(
                    jugador => ({
                        id:
                            String(
                                jugador._id
                            ),

                        nombre:
                            jugador.nombre
                    })
                );

            // ==================================================
            // SI NO HAY JUGADORES
            // ==================================================

            if (
                miembros.length === 0
            ) {

                return interaction.reply({
                    content:
                        "❌ No hay nombres disponibles para crear un Team.\n\n" +
                        "Primero agrega jugadores usando `/team-agregar`.",
                    ephemeral: true
                });

            }

            // ==================================================
            // CALCULAR PÁGINAS
            // ==================================================

            const totalPaginas =
                Math.ceil(
                    miembros.length /
                    MIEMBROS_POR_PAGINA
                );

            // ==================================================
            // RESPONDER PRIMERO PARA OBTENER EL ID DEL MENSAJE
            // ==================================================

            const embed =
                crearEmbed(
                    0,
                    totalPaginas,
                    miembros,
                    []
                );

            // Panel público para todos
            await interaction.reply({
                embeds: [
                    embed
                ]
            });

            const mensaje =
                await interaction.fetchReply();

            // ==================================================
            // LA SESIÓN PERTENECE AL MENSAJE
            // ==================================================

            const panelId =
                mensaje.id;

            const clave =
                `mensaje_${panelId}`;

            sesionesTeam.set(
                clave,
                {
                    panelId:
                        panelId,

                    guildId:
                        interaction.guild.id,

                    channelId:
                        interaction.channel.id,

                    miembros:
                        miembros,

                    seleccionados:
                        [],

                    pagina:
                        0
                }
            );

            // ==================================================
            // AGREGAR LOS COMPONENTES
            // ==================================================

            const componentes =
                crearComponentes(
                    panelId,
                    0,
                    totalPaginas,
                    miembros,
                    []
                );

            await interaction.editReply({
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
                        "❌ Ocurrió un error al crear el panel de Teams.",
                    ephemeral: true
                });

            }

            return interaction.reply({
                content:
                    "❌ Ocurrió un error al crear el panel de Teams.",
                ephemeral: true
            });
        }
    },

    // ========================================================
    // SELECT MENU
    // ========================================================

    async manejarSelectMenu(
        interaction
    ) {

        try {

            const customId =
                interaction.customId;

            const panelId =
                customId.replace(
                    "crear_team_selector_",
                    ""
                );

            const clave =
                `mensaje_${panelId}`;

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

            const totalPaginas =
                Math.ceil(
                    sesion.miembros.length /
                    MIEMBROS_POR_PAGINA
                );

            const pagina =
                obtenerPaginaValida(
                    sesion.pagina,
                    totalPaginas
                );

            // ==================================================
            // MIEMBROS DE LA PÁGINA ACTUAL
            // ==================================================

            const inicio =
                pagina *
                MIEMBROS_POR_PAGINA;

            const fin =
                inicio +
                MIEMBROS_POR_PAGINA;

            const miembrosPagina =
                sesion.miembros.slice(
                    inicio,
                    fin
                );

            const idsPagina =
                new Set(
                    miembrosPagina.map(
                        miembro =>
                            miembro.id
                    )
                );

            // ==================================================
            // VALORES SELECCIONADOS
            // ==================================================

            const valoresNuevos =
                interaction.values || [];

            const valoresNuevosSet =
                new Set(
                    valoresNuevos
                );

            // ==================================================
            // ACTUALIZAR SOLO LOS JUGADORES DE ESTA PÁGINA
            //
            // LOS JUGADORES SELECCIONADOS EN OTRAS PÁGINAS
            // SE CONSERVAN.
            // ==================================================

            sesion.seleccionados =
                sesion.seleccionados.filter(
                    id => {

                        if (
                            !idsPagina.has(
                                id
                            )
                        ) {

                            return true;
                        }

                        return valoresNuevosSet.has(
                            id
                        );
                    }
                );

            // ==================================================
            // AGREGAR NUEVOS JUGADORES
            // ==================================================

            for (
                const id
                of valoresNuevos
            ) {

                if (
                    sesion.seleccionados.includes(
                        id
                    )
                ) {

                    continue;
                }

                if (
                    sesion.seleccionados.length >=
                    MAX_MIEMBROS_TEAM
                ) {

                    break;
                }

                sesion.seleccionados.push(
                    id
                );
            }

            // ==================================================
            // ACTUALIZAR PANEL PARA TODOS
            // ==================================================

            return actualizarPanel(
                interaction,
                sesion,
                pagina
            );

        } catch (error) {

            console.error(
                "❌ Error manejando selector de Team:",
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {

                return interaction.followUp({
                    content:
                        "❌ Ocurrió un error al seleccionar jugadores.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    "❌ Ocurrió un error al seleccionar jugadores.",
                ephemeral: true
            });
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

            // ==================================================
            // SACAR EL PANEL ID DEL BOTÓN
            // ==================================================

            let panelId = null;

            if (
                customId.startsWith(
                    "crear_team_anterior_"
                )
            ) {

                panelId =
                    customId.replace(
                        "crear_team_anterior_",
                        ""
                    );
            }

            else if (
                customId.startsWith(
                    "crear_team_siguiente_"
                )
            ) {

                panelId =
                    customId.replace(
                        "crear_team_siguiente_",
                        ""
                    );
            }

            else if (
                customId.startsWith(
                    "crear_team_confirmar_"
                )
            ) {

                panelId =
                    customId.replace(
                        "crear_team_confirmar_",
                        ""
                    );
            }

            else if (
                customId.startsWith(
                    "crear_team_cancelar_"
                )
            ) {

                panelId =
                    customId.replace(
                        "crear_team_cancelar_",
                        ""
                    );
            }

            else if (
                customId.startsWith(
                    "crear_team_pagina_"
                )
            ) {

                panelId =
                    customId.replace(
                        "crear_team_pagina_",
                        ""
                    );
            }

            if (!panelId) {

                return interaction.reply({
                    content:
                        "❌ No se pudo identificar el panel de Team.",
                    ephemeral: true
                });
            }

            const clave =
                `mensaje_${panelId}`;

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

            // ==================================================
            // ANTERIOR
            // ==================================================

            if (
                customId.startsWith(
                    "crear_team_anterior_"
                )
            ) {

                return actualizarPanel(
                    interaction,
                    sesion,
                    sesion.pagina - 1
                );
            }

            // ==================================================
            // SIGUIENTE
            // ==================================================

            if (
                customId.startsWith(
                    "crear_team_siguiente_"
                )
            ) {

                return actualizarPanel(
                    interaction,
                    sesion,
                    sesion.pagina + 1
                );
            }

            // ==================================================
            // BOTÓN DE PÁGINA
            // ==================================================

            if (
                customId.startsWith(
                    "crear_team_pagina_"
                )
            ) {

                return interaction.deferUpdate();
            }

            // ==================================================
            // CANCELAR
            // ==================================================

            if (
                customId.startsWith(
                    "crear_team_cancelar_"
                )
            ) {

                sesionesTeam.delete(
                    clave
                );

                return interaction.update({
                    content:
                        "❌ Creación de Team cancelada.",
                    embeds: [],
                    components: []
                });
            }

            // ==================================================
            // CREAR TEAM
            // ==================================================

            if (
                customId.startsWith(
                    "crear_team_confirmar_"
                )
            ) {

                if (
                    sesion.seleccionados.length ===
                    0
                ) {

                    return interaction.reply({
                        content:
                            "❌ Debes seleccionar al menos un jugador.",
                        ephemeral: true
                    });
                }

                // ==============================================
                // COPIAR ARRAY PARA CONSERVAR EL ORDEN
                // ==============================================

                const seleccionados =
                    [
                        ...sesion.seleccionados
                    ];

                // ==============================================
                // BUSCAR LOS MIEMBROS EN ESE ORDEN
                // ==============================================

                const miembrosSeleccionados =
                    seleccionados
                        .map(
                            id =>
                                sesion.miembros.find(
                                    miembro =>
                                        miembro.id ===
                                        id
                                )
                        )
                        .filter(Boolean);

                // ==============================================
                // OBTENER NOMBRES
                // ==============================================

                const nombresSeleccionados =
                    miembrosSeleccionados.map(
                        miembro =>
                            miembro.nombre
                    );

                // ==============================================
                // COMANDO FINAL
                //
                // @ DELANTE DE CADA NOMBRE
                // ==============================================

                const textoTeam =
                    `!editcom !team Hola $(user) El team es ${nombresSeleccionados.map(nombre => `@${nombre}`).join(" ")}`;

                // ==============================================
                // ELIMINAR SESIÓN
                // ==============================================

                sesionesTeam.delete(
                    clave
                );

                // ==============================================
                // RESULTADO PÚBLICO
                // ==============================================

                const embedResultado =
                    new EmbedBuilder()
                        .setTitle(
                            "✅ Team creado"
                        )
                        .setDescription(
                            "Team creado correctamente.\n\n" +
                            "Copia y pega este comando:"
                        )
                        .addFields(
                            {
                                name:
                                    "Comando",
                                value:
                                    `\`\`\`\n${textoTeam}\n\`\`\``
                            },
                          {
    name:
        "Jugadores",
    value:
        `\`\`\`\n${nombresSeleccionados
            .join("\n")}\n\`\`\``
}
                        )
                        .setFooter({
                            text:
                                "RustLogix • Crear Team"
                        });

                // ==============================================
                // EL MENSAJE ORIGINAL ES PÚBLICO,
                // POR LO QUE TODOS PODRÁN VER EL RESULTADO.
                // ==============================================

                return interaction.update({
                    embeds: [
                        embedResultado
                    ],
                    components: [],
                    content: null
                });
            }

            return interaction.reply({
                content:
                    "❌ Botón no reconocido.",
                ephemeral: true
            });

        } catch (error) {

            console.error(
                "❌ Error manejando botón de Team:",
                error
            );

            if (
                interaction.replied ||
                interaction.deferred
            ) {

                return interaction.followUp({
                    content:
                        "❌ Ocurrió un error al procesar el Team.",
                    ephemeral: true
                });
            }

            return interaction.reply({
                content:
                    "❌ Ocurrió un error al procesar el Team.",
                ephemeral: true
            });
        }
    }
};