const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require("discord.js");

const Tracker = require("../models/TrackerSchema");

const TRACKERS_POR_PAGINA = 4;

// =====================================================
// OBTENER TRACKERS DEL CANAL
// =====================================================

async function obtenerTrackers(canalId) {
    return await Tracker.find({
        canalId
    }).sort({
        createdAt: -1
    });
}

// =====================================================
// FORMATEAR TIEMPO RESTANTE
// =====================================================

function obtenerTiempoRestante(expiresAt) {
    const tiempoRestante = Math.max(
        0,
        new Date(expiresAt).getTime() - Date.now()
    );

    const horas = Math.floor(
        tiempoRestante / 3600000
    );

    const minutos = Math.floor(
        (tiempoRestante % 3600000) / 60000
    );

    return `${horas}h ${minutos}m`;
}

// =====================================================
// CREAR EMBED
// =====================================================

function crearEmbedTrackers(
    trackers,
    pagina
) {
    const totalPaginas = Math.max(
        1,
        Math.ceil(
            trackers.length /
            TRACKERS_POR_PAGINA
        )
    );

    const inicio =
        pagina *
        TRACKERS_POR_PAGINA;

    const paginaActual =
        trackers.slice(
            inicio,
            inicio + TRACKERS_POR_PAGINA
        );

    const embed = new EmbedBuilder()
        .setAuthor({
            name:
                "RustLogix • BattleMetrics Tracker"
        })
        .setTitle(
            "🎯 TRACKERS ACTIVOS"
        )
        .setDescription(
            `Actualmente hay **${trackers.length} jugador${trackers.length === 1 ? "" : "es"}** bajo vigilancia en este canal.\n\n` +
            `👁️ El sistema comprobará automáticamente su actividad hasta que cada tracker expire.`
        )
        .setColor(0x5865F2)
        .setTimestamp()
        .setFooter({
            text:
                `RustLogix • Página ${pagina + 1}/${totalPaginas}`
        });

    paginaActual.forEach(
        (data, index) => {

            const estado =
                (
                    data.ultimoEstado ||
                    "desconocido"
                ).toLowerCase();

            let estadoTexto =
                "⚪ DESCONOCIDO";

            if (estado === "online") {
                estadoTexto =
                    "🟢 ONLINE";
            }

            if (estado === "offline") {
                estadoTexto =
                    "🔴 OFFLINE";
            }

            const nombre =
                data.nombre ||
                "Desconocido";

            const servidor =
                data.ultimoServidor ||
                "Desconocido";

            const tiempo =
                obtenerTiempoRestante(
                    data.expiresAt
                );

            const numero =
                inicio + index + 1;

            embed.addFields({
                name:
                    `${numero}. 👤 ${nombre}`,
                value:
                    `📡 **Estado:** ${estadoTexto}\n` +
                    `🎮 **Servidor:** \`${servidor}\`\n` +
                    `⏳ **Tiempo restante:** \`${tiempo}\`\n` +
                    `🆔 **BattleMetrics:** \`${data.battlemetricsId}\``,
                inline: false
            });
        });

    return embed;
}

// =====================================================
// CREAR BOTONES
// =====================================================

function crearComponentes(
    trackers,
    pagina
) {
    const totalPaginas = Math.max(
        1,
        Math.ceil(
            trackers.length /
            TRACKERS_POR_PAGINA
        )
    );

    const inicio =
        pagina *
        TRACKERS_POR_PAGINA;

    const paginaActual =
        trackers.slice(
            inicio,
            inicio + TRACKERS_POR_PAGINA
        );

    const componentes = [];

    // =================================================
    // BOTONES DE CADA JUGADOR
    // =================================================

    for (
        const data of paginaActual
    ) {

        const nombre =
            data.nombre ||
            data.battlemetricsId;

        const fila =
            new ActionRowBuilder();

        fila.addComponents(
            new ButtonBuilder()
                .setLabel("BattleMetrics")
                .setStyle(
                    ButtonStyle.Link
                )
                .setURL(
                    `https://www.battlemetrics.com/players/${data.battlemetricsId}`
                )
                .setEmoji("🔗"),

            new ButtonBuilder()
                .setCustomId(
                    `eliminar_tracker_${data._id}`
                )
                .setLabel(
                    `Eliminar ${nombre}`.slice(
                        0,
                        80
                    )
                )
                .setStyle(
                    ButtonStyle.Danger
                )
                .setEmoji("❌")
        );

        componentes.push(fila);
    }

    // =================================================
    // NAVEGACIÓN
    // =================================================

    const navegacion =
        new ActionRowBuilder();

    navegacion.addComponents(
        new ButtonBuilder()
            .setCustomId(
                `trackers_pagina_${pagina - 1}`
            )
            .setLabel("Anterior")
            .setEmoji("⬅️")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina <= 0
            ),

        new ButtonBuilder()
            .setCustomId(
                "trackers_pagina_actual"
            )
            .setLabel(
                `Página ${pagina + 1}/${totalPaginas}`
            )
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(true),

        new ButtonBuilder()
            .setCustomId(
                `trackers_pagina_${pagina + 1}`
            )
            .setLabel("Siguiente")
            .setEmoji("➡️")
            .setStyle(
                ButtonStyle.Secondary
            )
            .setDisabled(
                pagina >= totalPaginas - 1
            )
    );

    componentes.push(
        navegacion
    );

    return componentes;
}

// =====================================================
// CREAR RESPUESTA
// =====================================================

async function crearRespuesta(
    canalId,
    pagina
) {
    const trackers =
        await obtenerTrackers(
            canalId
        );

    // =================================================
    // SIN TRACKERS
    // =================================================

    if (
        !trackers ||
        trackers.length === 0
    ) {

        const embedVacio =
            new EmbedBuilder()
                .setAuthor({
                    name:
                        "RustLogix • BattleMetrics Tracker"
                })
                .setTitle(
                    "🎯 TRACKERS ACTIVOS"
                )
                .setDescription(
                    "Actualmente no hay ningún jugador siendo vigilado en este canal."
                )
                .setColor(0x5865F2)
                .addFields({
                    name:
                        "👁️ Estado",
                    value:
                        "No hay trackers activos.",
                    inline: false
                })
                .setFooter({
                    text:
                        "RustLogix • Sistema de vigilancia"
                })
                .setTimestamp();

        return {
            content: null,
            embeds: [
                embedVacio
            ],
            components: []
        };
    }

    // =================================================
    // CORREGIR PÁGINA
    // =================================================

    const totalPaginas =
        Math.ceil(
            trackers.length /
            TRACKERS_POR_PAGINA
        );

    if (
        pagina < 0
    ) {
        pagina = 0;
    }

    if (
        pagina >= totalPaginas
    ) {
        pagina =
            totalPaginas - 1;
    }

    // =================================================
    // AVISO DE MÁS TRACKERS
    // =================================================

    const embed =
        crearEmbedTrackers(
            trackers,
            pagina
        );

    const componentes =
        crearComponentes(
            trackers,
            pagina
        );

    return {
        content: null,
        embeds: [
            embed
        ],
        components:
            componentes
    };
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()
            .setName(
                "trackers-activos"
            )
            .setDescription(
                "Muestra los perfiles de BattleMetrics que están siendo vigilados"
            ),

    async execute(
        interaction
    ) {
        try {

            await interaction.deferReply();

            const respuesta =
                await crearRespuesta(
                    interaction.channel.id,
                    0
                );

            await interaction.editReply(
                respuesta
            );

        } catch (error) {

            console.error(
                "ERROR EN TRACKERS ACTIVOS:",
                error
            );

            if (
                interaction.deferred ||
                interaction.replied
            ) {

                await interaction.editReply(
                    "❌ Ocurrió un error al cargar los trackers activos."
                );

            } else {

                await interaction.reply({
                    content:
                        "❌ Ocurrió un error al cargar los trackers activos.",
                    ephemeral: true
                });

            }
        }
    },

    // =================================================
    // MOSTRAR PÁGINA
    // =================================================

    async mostrarPagina(
        interaction,
        pagina
    ) {

        const respuesta =
            await crearRespuesta(
                interaction.channel.id,
                pagina
            );

        await interaction.update(
            respuesta
        );
    }
};