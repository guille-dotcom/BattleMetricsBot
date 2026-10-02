const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder
} = require("discord.js");

const MiniGameProfile =
    require("../models/MiniGameProfile");

// ============================================================
// CONFIGURACIÓN
// ============================================================

const MAX_JUGADORES = 10;

const TIEMPO_ESPERA_PARTIDA =
    60 * 1000;

// ============================================================
// PARTIDAS ACTIVAS
// ============================================================

const partidasDados = new Map();

// ============================================================
// COMANDO
// ============================================================

const data = new SlashCommandBuilder()
    .setName("minijuegos")
    .setDescription(
        "🎮 Juega minijuegos interactivos con otros usuarios."
    );

// ============================================================
// PERFIL
// ============================================================

async function obtenerPerfil(
    guildId,
    userId
) {
    let perfil =
        await MiniGameProfile.findOne({
            guildId,
            userId
        });

    if (!perfil) {
        perfil =
            await MiniGameProfile.create({
                guildId,
                userId,
                puntos: 0,
                victorias: 0,
                derrotas: 0,
                partidas: 0
            });
    }

    return perfil;
}

// ============================================================
// MENU PRINCIPAL
// ============================================================

function crearMenuPrincipal() {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎮 RUSTLOGIX ARCADE"
            )
            .setDescription(
                "¡Bienvenido a los minijuegos de RustLogix!\n\n" +
                "Selecciona un juego en el menú de abajo.\n\n" +
                "🎲 **Dados Multijugador**\n" +
                "Juega contra otros usuarios y gana puntos.\n\n" +
                "🏆 **Mis Estadísticas**\n" +
                "Consulta tus puntos, victorias y partidas."
            )
            .setColor(0x5865F2)
            .setFooter({
                text:
                    "RustLogix • Minijuegos"
            });

    const menu =
        new StringSelectMenuBuilder()
            .setCustomId(
                "minijuegos_menu"
            )
            .setPlaceholder(
                "🎮 Selecciona un minijuego"
            )
            .addOptions([
                {
                    label:
                        "Dados Multijugador",
                    description:
                        "Juega dados contra otros jugadores.",
                    value:
                        "dados",
                    emoji:
                        "🎲"
                },
                {
                    label:
                        "Mis Estadísticas",
                    description:
                        "Mira tus puntos y victorias.",
                    value:
                        "estadisticas",
                    emoji:
                        "🏆"
                }
            ]);

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    menu
                )
        ]
    };
}

// ============================================================
// MENU DADOS
// ============================================================

function crearMenuDados() {
    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎲 DADOS MULTIJUGADOR"
            )
            .setDescription(
                "Crea una partida y deja que otros jugadores se unan.\n\n" +
                `👥 Máximo: **${MAX_JUGADORES} jugadores**\n` +
                "⏱️ La partida espera 60 segundos antes de expirar.\n\n" +
                "**Recompensas**\n" +
                "🎮 Participar: **+10 puntos**\n" +
                "🏆 Ganar: **+100 puntos adicionales**\n\n" +
                "Necesitas al menos **2 jugadores** para comenzar."
            )
            .setColor(0xF1C40F)
            .setFooter({
                text:
                    "RustLogix • Dados"
            });

    const crear =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_dados_crear"
            )
            .setLabel(
                "Crear partida"
            )
            .setEmoji("🎲")
            .setStyle(
                ButtonStyle.Primary
            );

    const volver =
        new ButtonBuilder()
            .setCustomId(
                "minijuegos_volver"
            )
            .setLabel(
                "Volver"
            )
            .setEmoji("↩️")
            .setStyle(
                ButtonStyle.Secondary
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    crear,
                    volver
                )
        ]
    };
}

// ============================================================
// MENSAJE DE PARTIDA
// ============================================================

function crearMensajePartida(
    partida
) {
    const jugadoresTexto =
        partida.jugadores
            .map(
                (jugador, index) =>
                    `${index + 1}. <@${jugador.userId}>`
            )
            .join("\n");

    const embed =
        new EmbedBuilder()
            .setTitle(
                "🎲 PARTIDA DE DADOS"
            )
            .setDescription(
                `👑 **Creador:** <@${partida.creadorId}>\n\n` +
                `👥 **Jugadores (${partida.jugadores.length}/${MAX_JUGADORES})**\n` +
                `${jugadoresTexto}\n\n` +
                "🙋 Pulsa **Unirse** para entrar.\n" +
                "🎲 El creador puede iniciar cuando haya al menos 2 jugadores."
            )
            .setColor(0xF1C40F)
            .setFooter({
                text:
                    "La partida expira automáticamente en 60 segundos."
            });

    const unirse =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_dados_unirse_${partida.id}`
            )
            .setLabel(
                "Unirse"
            )
            .setEmoji("🙋")
            .setStyle(
                ButtonStyle.Success
            )
            .setDisabled(
                partida.jugadores.length >=
                    MAX_JUGADORES
            );

    const iniciar =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_dados_iniciar_${partida.id}`
            )
            .setLabel(
                "Iniciar partida"
            )
            .setEmoji("🎲")
            .setStyle(
                ButtonStyle.Primary
            );

    const cancelar =
        new ButtonBuilder()
            .setCustomId(
                `minijuegos_dados_cancelar_${partida.id}`
            )
            .setLabel(
                "Cancelar"
            )
            .setEmoji("❌")
            .setStyle(
                ButtonStyle.Danger
            );

    return {
        embeds: [
            embed
        ],
        components: [
            new ActionRowBuilder()
                .addComponents(
                    unirse,
                    iniciar,
                    cancelar
                )
        ]
    };
}

// ============================================================
// COMANDO EXECUTE
// ============================================================

async function execute(
    interaction
) {
    await interaction.reply(
        crearMenuPrincipal()
    );
}

// ============================================================
// BOTONES
// ============================================================

async function manejarBoton(
    interaction
) {
    const customId =
        interaction.customId;

    // ========================================================
    // VOLVER AL MENU
    // ========================================================

    if (
        customId ===
        "minijuegos_volver"
    ) {
        await interaction.update(
            crearMenuPrincipal()
        );

        return true;
    }

    // ========================================================
    // CREAR PARTIDA
    // ========================================================

    if (
        customId ===
        "minijuegos_dados_crear"
    ) {
        const partidaExistente =
            [...partidasDados.values()]
                .find(
                    partida =>
                        partida.guildId ===
                            interaction.guild.id &&
                        partida.jugadores.some(
                            jugador =>
                                jugador.userId ===
                                interaction.user.id
                        )
                );

        if (
            partidaExistente
        ) {
            await interaction.reply({
                content:
                    "❌ Ya estás participando en una partida de dados.",
                ephemeral: true
            });

            return true;
        }

        const id =
            `${interaction.guild.id}_${Date.now()}_${interaction.user.id}`;

        const partida = {
            id,
            guildId:
                interaction.guild.id,
            canalId:
                interaction.channel.id,
            creadorId:
                interaction.user.id,
            jugadores: [
                {
                    userId:
                        interaction.user.id,
                    nombre:
                        interaction.user.username
                }
            ],
            iniciada:
                false
        };

        partidasDados.set(
            id,
            partida
        );

        await interaction.update(
            crearMensajePartida(
                partida
            )
        );

        setTimeout(
            async () => {
                const partidaActual =
                    partidasDados.get(
                        id
                    );

                if (
                    !partidaActual
                ) {
                    return;
                }

                if (
                    partidaActual.iniciada
                ) {
                    return;
                }

                partidasDados.delete(
                    id
                );

                try {
                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(
                                    "⏰ PARTIDA EXPIRADA"
                                )
                                .setDescription(
                                    "La partida de dados expiró porque no fue iniciada a tiempo."
                                )
                                .setColor(
                                    0xE74C3C
                                )
                                .setFooter({
                                    text:
                                        "RustLogix • Minijuegos"
                                })
                        ],
                        components: []
                    });
                } catch (
                    error
                ) {
                    console.error(
                        "❌ Error cerrando partida de dados:",
                        error.message
                    );
                }
            },
            TIEMPO_ESPERA_PARTIDA
        );

        return true;
    }

    // ========================================================
    // UNIRSE
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_dados_unirse_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_dados_unirse_",
                ""
            );

        const partida =
            partidasDados.get(
                id
            );

        if (
            !partida
        ) {
            await interaction.reply({
                content:
                    "❌ Esta partida ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.iniciada
        ) {
            await interaction.reply({
                content:
                    "❌ La partida ya comenzó.",
                ephemeral: true
            });

            return true;
        }

        const yaEstaDentro =
            partida.jugadores.some(
                jugador =>
                    jugador.userId ===
                    interaction.user.id
            );

        if (
            yaEstaDentro
        ) {
            await interaction.reply({
                content:
                    "⚠️ Ya estás dentro de esta partida.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.jugadores.length >=
            MAX_JUGADORES
        ) {
            await interaction.reply({
                content:
                    "❌ La partida ya está llena.",
                ephemeral: true
            });

            return true;
        }

        partida.jugadores.push({
            userId:
                interaction.user.id,
            nombre:
                interaction.user.username
        });

        await interaction.update(
            crearMensajePartida(
                partida
            )
        );

        return true;
    }

    // ========================================================
    // INICIAR
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_dados_iniciar_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_dados_iniciar_",
                ""
            );

        const partida =
            partidasDados.get(
                id
            );

        if (
            !partida
        ) {
            await interaction.reply({
                content:
                    "❌ Esta partida ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ Solo el creador puede iniciar la partida.",
                ephemeral: true
            });

            return true;
        }

        if (
            partida.jugadores.length <
            2
        ) {
            await interaction.reply({
                content:
                    "❌ Necesitas al menos **2 jugadores** para comenzar.",
                ephemeral: true
            });

            return true;
        }

        partida.iniciada =
            true;

        const resultados =
            [];

        for (
            const jugador of
            partida.jugadores
        ) {
            const dado =
                Math.floor(
                    Math.random() *
                        6
                ) + 1;

            resultados.push({
                userId:
                    jugador.userId,
                nombre:
                    jugador.nombre,
                dado
            });
        }

        const mayor =
            Math.max(
                ...resultados.map(
                    resultado =>
                        resultado.dado
                )
            );

        const ganadores =
            resultados.filter(
                resultado =>
                    resultado.dado ===
                    mayor
            );

        resultados.sort(
            (a, b) =>
                b.dado -
                a.dado
        );

        const textoResultados =
            resultados
                .map(
                    resultado =>
                        `🎲 <@${resultado.userId}> → **${resultado.dado}**`
                )
                .join("\n");

        // ====================================================
        // GUARDAR ESTADISTICAS
        // ====================================================

        for (
            const resultado of
            resultados
        ) {
            const perfil =
                await obtenerPerfil(
                    partida.guildId,
                    resultado.userId
                );

            perfil.partidas += 1;

            // Todos reciben +10 por participar
            perfil.puntos += 10;

            if (
                resultado.dado ===
                mayor
            ) {
                perfil.victorias += 1;

                // Premio adicional al ganador
                if (
                    ganadores.length ===
                    1
                ) {
                    perfil.puntos +=
                        100;
                } else {
                    perfil.puntos +=
                        50;
                }
            } else {
                perfil.derrotas += 1;
            }

            await perfil.save();
        }

        let ganadorTexto;

        if (
            ganadores.length ===
            1
        ) {
            ganadorTexto =
                `🏆 **Ganador:** <@${ganadores[0].userId}>\n` +
                `🎲 Sacó un **${mayor}**\n` +
                `💰 **+110 puntos**`;
        } else {
            ganadorTexto =
                `🏆 **Empate entre ${ganadores.length} jugadores**\n` +
                `🎲 Todos sacaron **${mayor}**\n` +
                `💰 **+60 puntos** para cada ganador`;
        }

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🎲 RESULTADO DE LOS DADOS"
                )
                .setDescription(
                    `${textoResultados}\n\n` +
                    `${ganadorTexto}\n\n` +
                    "🎮 Los demás participantes reciben **+10 puntos**."
                )
                .setColor(
                    0x2ECC71
                )
                .setFooter({
                    text:
                        "RustLogix • Minijuegos"
                });

        partidasDados.delete(
            id
        );

        const volver =
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel(
                    "Volver a Minijuegos"
                )
                .setEmoji("🎮")
                .setStyle(
                    ButtonStyle.Secondary
                );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        volver
                    )
            ]
        });

        return true;
    }

    // ========================================================
    // CANCELAR
    // ========================================================

    if (
        customId.startsWith(
            "minijuegos_dados_cancelar_"
        )
    ) {
        const id =
            customId.replace(
                "minijuegos_dados_cancelar_",
                ""
            );

        const partida =
            partidasDados.get(
                id
            );

        if (
            !partida
        ) {
            await interaction.reply({
                content:
                    "❌ Esta partida ya no existe.",
                ephemeral: true
            });

            return true;
        }

        if (
            interaction.user.id !==
            partida.creadorId
        ) {
            await interaction.reply({
                content:
                    "❌ Solo el creador puede cancelar la partida.",
                ephemeral: true
            });

            return true;
        }

        partidasDados.delete(
            id
        );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "❌ PARTIDA CANCELADA"
                )
                .setDescription(
                    "La partida de dados fue cancelada por el creador."
                )
                .setColor(
                    0xE74C3C
                )
                .setFooter({
                    text:
                        "RustLogix • Minijuegos"
                });

        const volver =
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel(
                    "Volver a Minijuegos"
                )
                .setEmoji("🎮")
                .setStyle(
                    ButtonStyle.Secondary
                );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        volver
                    )
            ]
        });

        return true;
    }

    return false;
}

// ============================================================
// SELECT MENUS
// ============================================================

async function manejarSelectMenu(
    interaction
) {
    if (
        interaction.customId !==
        "minijuegos_menu"
    ) {
        return false;
    }

    const valor =
        interaction.values[0];

    // ========================================================
    // DADOS
    // ========================================================

    if (
        valor ===
        "dados"
    ) {
        await interaction.update(
            crearMenuDados()
        );

        return true;
    }

    // ========================================================
    // ESTADISTICAS
    // ========================================================

    if (
        valor ===
        "estadisticas"
    ) {
        const perfil =
            await obtenerPerfil(
                interaction.guild.id,
                interaction.user.id
            );

        const embed =
            new EmbedBuilder()
                .setTitle(
                    "🏆 MIS ESTADÍSTICAS"
                )
                .setDescription(
                    `👤 **Jugador:** <@${interaction.user.id}>\n\n` +
                    `💰 **Puntos:** ${perfil.puntos}\n` +
                    `🏆 **Victorias:** ${perfil.victorias}\n` +
                    `💀 **Derrotas:** ${perfil.derrotas}\n` +
                    `🎮 **Partidas:** ${perfil.partidas}`
                )
                .setColor(
                    0x5865F2
                )
                .setFooter({
                    text:
                        "RustLogix • Minijuegos"
                });

        const volver =
            new ButtonBuilder()
                .setCustomId(
                    "minijuegos_volver"
                )
                .setLabel(
                    "Volver"
                )
                .setEmoji("↩️")
                .setStyle(
                    ButtonStyle.Secondary
                );

        await interaction.update({
            embeds: [
                embed
            ],
            components: [
                new ActionRowBuilder()
                    .addComponents(
                        volver
                    )
            ]
        });

        return true;
    }

    return false;
}

// ============================================================
// EXPORTAR
// ============================================================

module.exports = {
    data,
    execute,
    manejarBoton,
    manejarSelectMenu
};