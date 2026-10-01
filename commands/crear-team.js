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
// SESIONES ACTIVAS
// ============================================================

const sesionesTeam = new Map();

// ============================================================
// OBTENER CLAVE DE SESIÓN
// ============================================================

function obtenerClaveSesion(interaction) {

    return `${interaction.guild.id}_${interaction.user.id}`;
}

// ============================================================
// OBTENER PÁGINA VÁLIDA
// ============================================================

function obtenerPaginaValida(
    pagina,
    totalPaginas
) {

    let paginaNumerica =
        parseInt(
            pagina,
            10
        );

    if (
        Number.isNaN(
            paginaNumerica
        )
    ) {

        paginaNumerica = 0;
    }

    if (
        paginaNumerica < 0
    ) {

        paginaNumerica = 0;
    }

    if (
        paginaNumerica >= totalPaginas
    ) {

        paginaNumerica =
            Math.max(
                0,
                totalPaginas - 1
            );
    }

    return paginaNumerica;
}

// ============================================================
// OBTENER MIEMBROS DE UNA PÁGINA
// ============================================================

async function obtenerDatosPagina(
    guildId,
    pagina
) {

    const guild =
        await require("discord.js")
            .Client
            ? null
            : null;

    return {
        guildId,
        pagina
    };
}

// ============================================================
// CREAR EMBED
// ============================================================

function crearEmbed(
    pagina,
    totalPaginas,
    miembros,
    seleccionados
) {

    const nombresSeleccionados =
        miembros
            .filter(
                miembro =>
                    seleccionados.includes(
                        miembro.id
                    )
            )
            .map(
                miembro =>
                    miembro.displayName
            );

    const cantidadTotal =
        seleccionados.length;

    let descripcion =
        `Selecciona los jugadores que quieres incluir en el Team.\n\n`;

    descripcion +=
        `👥 **Seleccionados:** ${cantidadTotal}/${MAX_MIEMBROS_TEAM}\n`;

    descripcion +=
        `📄 **Página:** ${pagina + 1}/${totalPaginas}\n\n`;

    if (
        nombresSeleccionados.length > 0
    ) {

        descripcion +=
            `### ✅ Seleccionados en esta página\n`;

        descripcion +=
            nombresSeleccionados
                .map(
                    nombre =>
                        `• ${nombre}`
                )
                .join("\n");

    } else {

        descripcion +=
            `### 📋 Jugadores\n`;

        descripcion +=
            `Selecciona uno o varios jugadores en el menú de abajo.`;
    }

    return new EmbedBuilder()
        .setColor(
            0x3498DB
        )
        .setTitle(
            "👥 Crear Team"
        )
        .setDescription(
            descripcion
        )
        .setFooter({
            text:
                "RustLogix • Puedes cambiar de página sin perder tus selecciones"
        });
}

// ============================================================
// CREAR COMPONENTES
// ============================================================

function crearComponentes(
    usuarioId,
    pagina,
    totalPaginas,
    miembros,
    seleccionados
) {

    const filas = [];

    // ========================================================
    // SELECTOR
    // ========================================================

    if (
        miembros.length > 0
    ) {

        const opciones =
            miembros.map(
                miembro => {

                    const nombre =
                        String(
                            miembro.displayName ||
                            miembro.user?.username ||
                            miembro.username ||
                            miembro.id
                        )
                            .slice(
                                0,
                                100
                            );

                    return {
                        label:
                            nombre,

                        value:
                            miembro.id,

                        description:
                            `ID: ${miembro.id}`
                                .slice(
                                    0,
                                    100
                                ),

                        default:
                            seleccionados.includes(
                                miembro.id
                            )
                    };
                }
            );

        const selector =
            new StringSelectMenuBuilder()
                .setCustomId(
                    `crear_team_selector_${usuarioId}_${pagina}`
                )
                .setPlaceholder(
                    "Selecciona jugadores..."
                )
                .setMinValues(
                    0
                )
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

        filas.push(
            new ActionRowBuilder()
                .addComponents(
                    selector
                )
        );
    }

    // ========================================================
    // BOTONES DE PAGINACIÓN
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

    const botonPagina =
        new ButtonBuilder()
            .setCustomId(
                `crear_team_pagina_actual_${usuarioId}_${pagina}`
            )
            .setLabel(
                `Página ${pagina + 1}/${totalPaginas}`
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
                `crear_team_pagina_siguiente_${usuarioId}_${pagina}`
            )
            .setLabel(
                "➡️ Siguiente"
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina >= totalPaginas - 1
            );

    filas.push(
        new ActionRowBuilder()
            .addComponents(
                botonAnterior,
                botonPagina,
                botonSiguiente
            )
    );

    // ========================================================
    // BOTONES CREAR / CANCELAR
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
                seleccionados.length === 0
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

    filas.push(
        new ActionRowBuilder()
            .addComponents(
                botonCrear,
                botonCancelar
            )
    );

    return filas;
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

    if (
        !sesion
    ) {

        return;
    }

    const totalPaginas =
        Math.ceil(
            sesion.miembros.length /
            MIEMBROS_POR_PAGINA
        );

    const paginaValida =
        obtenerPaginaValida(
            pagina,
            totalPaginas
        );

    sesion.pagina =
        paginaValida;

    // ========================================================
    // OBTENER MIEMBROS DE LA PÁGINA ACTUAL
    // ========================================================

    const inicio =
        paginaValida *
        MIEMBROS_POR_PAGINA;

    const fin =
        inicio +
        MIEMBROS_POR_PAGINA;

    const miembrosPagina =
        sesion.miembros.slice(
            inicio,
            fin
        );

    // ========================================================
    // MUY IMPORTANTE:
    // USAMOS LA SELECCIÓN GLOBAL DE LA SESIÓN
    // ========================================================

    const seleccionados =
        Array.from(
            sesion.seleccionados
        );

    const embed =
        crearEmbed(
            paginaValida,
            totalPaginas,
            miembrosPagina,
            seleccionados
        );

    const componentes =
        crearComponentes(
            interaction.user.id,
            paginaValida,
            totalPaginas,
            miembrosPagina,
            seleccionados
        );

    await interaction.update({
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
                "Crea un Team seleccionando jugadores del servidor."
            ),

    // ========================================================
    // EXECUTE
    // ========================================================

    async execute(
        interaction
    ) {

        try {

            await interaction.deferReply({
                ephemeral:
                    true
            });

            // =================================================
            // OBTENER MIEMBROS
            // =================================================

            const miembros =
                await interaction.guild.members.fetch();

            const miembrosValidos =
                Array.from(
                    miembros.values()
                )
                    .filter(
                        miembro =>
                            !miembro.user.bot
                    )
                    .sort(
                        (a, b) =>
                            String(
                                a.displayName
                            ).localeCompare(
                                String(
                                    b.displayName
                                ),
                                "es",
                                {
                                    sensitivity:
                                        "base"
                                }
                            )
                    );

            if (
                miembrosValidos.length === 0
            ) {

                return interaction.editReply({
                    content:
                        "❌ No hay jugadores disponibles para crear un Team."
                });
            }

            // =================================================
            // TOTAL DE PÁGINAS
            // =================================================

            const totalPaginas =
                Math.ceil(
                    miembrosValidos.length /
                    MIEMBROS_POR_PAGINA
                );

            // =================================================
            // CREAR SESIÓN
            // =================================================

            const clave =
                obtenerClaveSesion(
                    interaction
                );

            sesionesTeam.set(
                clave,
                {
                    miembros:
                        miembrosValidos,

                    // =========================================
                    // AQUÍ SE GUARDAN TODOS LOS JUGADORES
                    // DE TODAS LAS PÁGINAS
                    // =========================================

                    seleccionados:
                        new Set(),

                    pagina:
                        0
                }
            );

            // =================================================
            // OBTENER PRIMERA PÁGINA
            // =================================================

            const miembrosPagina =
                miembrosValidos.slice(
                    0,
                    MIEMBROS_POR_PAGINA
                );

            const embed =
                crearEmbed(
                    0,
                    totalPaginas,
                    miembrosPagina,
                    []
                );

            const componentes =
                crearComponentes(
                    interaction.user.id,
                    0,
                    totalPaginas,
                    miembrosPagina,
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

            try {

                if (
                    interaction.deferred ||
                    interaction.replied
                ) {

                    await interaction.editReply({
                        content:
                            "❌ Ocurrió un error al abrir el creador de Teams.",
                        embeds: [],
                        components: []
                    });

                } else {

                    await interaction.reply({
                        content:
                            "❌ Ocurrió un error al abrir el creador de Teams.",
                        ephemeral:
                            true
                    });
                }

            } catch (replyError) {

                console.error(
                    "❌ Error respondiendo /crear-team:",
                    replyError
                );
            }
        }
    },

    // ========================================================
    // SELECT MENU
    // ========================================================

    async manejarSelectMenu(
        interaction
    ) {

        try {

            const clave =
                obtenerClaveSesion(
                    interaction
                );

            const sesion =
                sesionesTeam.get(
                    clave
                );

            if (
                !sesion
            ) {

                return interaction.reply({
                    content:
                        "❌ Esta sesión de creación de Team ya no está activa. Usa `/crear-team` nuevamente.",
                    ephemeral:
                        true
                });
            }

            // =================================================
            // OBTENER PÁGINA DEL SELECTOR
            // =================================================

            const partes =
                interaction.customId.split(
                    "_"
                );

            const pagina =
                parseInt(
                    partes[
                        partes.length - 1
                    ],
                    10
                );

            if (
                Number.isNaN(
                    pagina
                )
            ) {

                return interaction.reply({
                    content:
                        "❌ No se pudo identificar la página actual.",
                    ephemeral:
                        true
                });
            }

            // =================================================
            // MIEMBROS DE ESTA PÁGINA
            // =================================================

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

            // =================================================
            // SELECCIONES REALIZADAS EN ESTA PÁGINA
            // =================================================

            const nuevosSeleccionados =
                interaction.values || [];

            // =================================================
            // LIMPIAR SOLAMENTE LOS MIEMBROS
            // DE ESTA PÁGINA
            //
            // NO TOCAR LOS DE OTRAS PÁGINAS
            // =================================================

            for (
                const id of idsPagina
            ) {

                sesion.seleccionados.delete(
                    id
                );
            }

            // =================================================
            // COMPROBAR LÍMITE GLOBAL
            // =================================================

            const seleccionadosFueraDePagina =
                Array.from(
                    sesion.seleccionados
                );

            const espacioDisponible =
                MAX_MIEMBROS_TEAM -
                seleccionadosFueraDePagina.length;

            if (
                nuevosSeleccionados.length >
                espacioDisponible
            ) {

                // =============================================
                // RESTAURAR EL ESTADO ANTERIOR
                // =============================================

                for (
                    const id of nuevosSeleccionados
                ) {

                    if (
                        espacioDisponible <= 0
                    ) {
                        break;
                    }

                    sesion.seleccionados.add(
                        id
                    );
                }

                // =============================================
                // ACTUALIZAR PANEL
                // =============================================

                const totalPaginas =
                    Math.ceil(
                        sesion.miembros.length /
                        MIEMBROS_POR_PAGINA
                    );

                const paginaValida =
                    obtenerPaginaValida(
                        pagina,
                        totalPaginas
                    );

                const miembrosActuales =
                    sesion.miembros.slice(
                        paginaValida *
                            MIEMBROS_POR_PAGINA,
                        paginaValida *
                            MIEMBROS_POR_PAGINA +
                            MIEMBROS_POR_PAGINA
                    );

                const embed =
                    crearEmbed(
                        paginaValida,
                        totalPaginas,
                        miembrosActuales,
                        Array.from(
                            sesion.seleccionados
                        )
                    );

                const componentes =
                    crearComponentes(
                        interaction.user.id,
                        paginaValida,
                        totalPaginas,
                        miembrosActuales,
                        Array.from(
                            sesion.seleccionados
                        )
                    );

                await interaction.update({
                    embeds: [
                        embed
                    ],
                    components:
                        componentes
                });

                return;
            }

            // =================================================
            // AGREGAR NUEVAS SELECCIONES
            // =================================================

            for (
                const id of nuevosSeleccionados
            ) {

                sesion.seleccionados.add(
                    id
                );
            }

            // =================================================
            // ACTUALIZAR PANEL
            // =================================================

            const totalPaginas =
                Math.ceil(
                    sesion.miembros.length /
                    MIEMBROS_POR_PAGINA
                );

            const paginaValida =
                obtenerPaginaValida(
                    pagina,
                    totalPaginas
                );

            const miembrosActuales =
                sesion.miembros.slice(
                    paginaValida *
                        MIEMBROS_POR_PAGINA,
                    paginaValida *
                        MIEMBROS_POR_PAGINA +
                        MIEMBROS_POR_PAGINA
                );

            const seleccionados =
                Array.from(
                    sesion.seleccionados
                );

            const embed =
                crearEmbed(
                    paginaValida,
                    totalPaginas,
                    miembrosActuales,
                    seleccionados
                );

            const componentes =
                crearComponentes(
                    interaction.user.id,
                    paginaValida,
                    totalPaginas,
                    miembrosActuales,
                    seleccionados
                );

            await interaction.update({
                embeds: [
                    embed
                ],
                components:
                    componentes
            });

        } catch (error) {

            console.error(
                "❌ Error en selector de /crear-team:",
                error
            );

            try {

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {

                    await interaction.reply({
                        content:
                            "❌ Ocurrió un error al seleccionar jugadores.",
                        ephemeral:
                            true
                    });
                }

            } catch (replyError) {

                console.error(
                    "❌ Error respondiendo selector:",
                    replyError
                );
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

            const clave =
                obtenerClaveSesion(
                    interaction
                );

            const sesion =
                sesionesTeam.get(
                    clave
                );

            if (
                !sesion
            ) {

                return interaction.reply({
                    content:
                        "❌ Esta sesión de creación de Team ya no está activa. Usa `/crear-team` nuevamente.",
                    ephemeral:
                        true
                });
            }

            // =================================================
            // ANTERIOR
            // =================================================

            if (
                interaction.customId.startsWith(
                    "crear_team_pagina_anterior_"
                )
            ) {

                const nuevaPagina =
                    Math.max(
                        0,
                        sesion.pagina - 1
                    );

                await actualizarPanel(
                    interaction,
                    nuevaPagina
                );

                return;
            }

            // =================================================
            // SIGUIENTE
            // =================================================

            if (
                interaction.customId.startsWith(
                    "crear_team_pagina_siguiente_"
                )
            ) {

                const totalPaginas =
                    Math.ceil(
                        sesion.miembros.length /
                        MIEMBROS_POR_PAGINA
                    );

                const nuevaPagina =
                    Math.min(
                        totalPaginas - 1,
                        sesion.pagina + 1
                    );

                await actualizarPanel(
                    interaction,
                    nuevaPagina
                );

                return;
            }

            // =================================================
            // CANCELAR
            // =================================================

            if (
                interaction.customId.startsWith(
                    "crear_team_cancelar_"
                )
            ) {

                sesionesTeam.delete(
                    clave
                );

                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(
                                0xED4245
                            )
                            .setTitle(
                                "❌ Creación de Team cancelada"
                            )
                            .setDescription(
                                "La creación del Team fue cancelada."
                            )
                            .setFooter({
                                text:
                                    "RustLogix"
                            })
                    ],
                    components: []
                });

                return;
            }

            // =================================================
            // CONFIRMAR TEAM
            // =================================================

            if (
                interaction.customId.startsWith(
                    "crear_team_confirmar_"
                )
            ) {

                const seleccionados =
                    Array.from(
                        sesion.seleccionados
                    );

                if (
                    seleccionados.length === 0
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
                            `❌ El Team no puede tener más de ${MAX_MIEMBROS_TEAM} jugadores.`,
                        ephemeral:
                            true
                    });
                }

                // =================================================
                // OBTENER MIEMBROS
                // =================================================

                const miembrosSeleccionados =
                    sesion.miembros.filter(
                        miembro =>
                            seleccionados.includes(
                                miembro.id
                            )
                    );

                const nombresSeleccionados =
                    miembrosSeleccionados.map(
                        miembro =>
                            miembro.displayName
                    );

                // =================================================
                // GUARDAR / PROCESAR KICKTEAM
                // =================================================

                for (
                    const miembro of miembrosSeleccionados
                ) {

                    try {

                        await KickTeamMember.findOneAndUpdate(
                            {
                                guildId:
                                    interaction.guild.id,

                                userId:
                                    miembro.id
                            },
                            {
                                guildId:
                                    interaction.guild.id,

                                userId:
                                    miembro.id,

                                username:
                                    miembro.displayName
                            },
                            {
                                upsert:
                                    true,

                                new:
                                    true
                            }
                        );

                    } catch (error) {

                        console.error(
                            `⚠️ Error guardando ${miembro.displayName} en KickTeamMember:`,
                            error.message
                        );
                    }
                }

                // =================================================
                // TEXTO FINAL
                // =================================================

                const textoTeam =
                    `!editcom !team Hola $(user) El team es ${nombresSeleccionados.join(" ")}`;

                const textoCodigo =
                    `\`\`\`${textoTeam}\`\`\``;

                const embed =
                    new EmbedBuilder()
                        .setColor(
                            0x57F287
                        )
                        .setTitle(
                            "✅ Team creado"
                        )
                        .setDescription(
                            `Se seleccionaron **${nombresSeleccionados.length} jugador(es)**.\n\n${textoCodigo}`
                        )
                        .addFields({
                            name:
                                "👥 Jugadores",
                            value:
                                nombresSeleccionados
                                    .map(
                                        nombre =>
                                            `• ${nombre}`
                                    )
                                    .join("\n")
                                    .slice(
                                        0,
                                        1024
                                    )
                        })
                        .setFooter({
                            text:
                                "RustLogix"
                        });

                // =================================================
                // BORRAR SESIÓN
                // =================================================

                sesionesTeam.delete(
                    clave
                );

                await interaction.update({
                    embeds: [
                        embed
                    ],
                    components: []
                });

                return;
            }

        } catch (error) {

            console.error(
                "❌ Error manejando botón de /crear-team:",
                error
            );

            try {

                if (
                    !interaction.replied &&
                    !interaction.deferred
                ) {

                    await interaction.reply({
                        content:
                            "❌ Ocurrió un error procesando el botón.",
                        ephemeral:
                            true
                    });
                }

            } catch (replyError) {

                console.error(
                    "❌ Error respondiendo botón Team:",
                    replyError
                );
            }
        }
    }
};