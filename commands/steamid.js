const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getSteamHistory
} = require("../services/steamHistory.js");

// =====================================================
// FORMATEAR FECHA
// =====================================================

function formatearFecha(date) {
    if (!date) {
        return "Fecha desconocida";
    }

    try {
        return new Intl.DateTimeFormat(
            "es-CL",
            {
                timeZone: "America/Santiago",

                day: "2-digit",
                month: "2-digit",
                year: "numeric",

                hour: "2-digit",
                minute: "2-digit"
            }
        ).format(date);

    } catch {
        try {
            return date.toLocaleString("es-CL");
        } catch {
            return "Fecha desconocida";
        }
    }
}

// =====================================================
// ESCAPAR TEXTO PARA DISCORD
// =====================================================

function escaparTexto(texto) {
    return String(texto || "")
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`");
}

// =====================================================
// CREAR TEXTO DEL HISTORIAL
// =====================================================

function construirHistorial(historicalNames) {

    if (
        !Array.isArray(historicalNames) ||
        historicalNames.length === 0
    ) {
        return (
            "⚠️ No se encontró historial de nombres " +
            "en SteamHistory.net."
        );
    }

    const MAX_MOSTRAR = 10;

    const recientes =
        historicalNames.slice(
            0,
            MAX_MOSTRAR
        );

    const lineas =
        recientes.map(
            (item, index) => {

                const nombre =
                    escaparTexto(
                        item.name ||
                        "Nombre desconocido"
                    );

                const fecha =
                    formatearFecha(
                        item.date
                    );

                return (
                    `\`${index + 1}.\` **${nombre}**\n` +
                    `└ ${fecha}`
                );
            }
        );

    let texto =
        `📊 **Total registrado:** ` +
        `\`${historicalNames.length}\`\n\n` +
        lineas.join("\n");

    if (
        historicalNames.length >
        MAX_MOSTRAR
    ) {
        texto +=
            `\n\n... y \`${historicalNames.length - MAX_MOSTRAR}\` ` +
            `nombre(s) más.`;
    }

    return texto;
}

// =====================================================
// COMANDO /STEAMID
// =====================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName("steamid")

            .setDescription(
                "Consulta el historial de nombres de un SteamID64"
            )

            .addStringOption(
                option =>
                    option
                        .setName("steamid")
                        .setDescription(
                            "SteamID64 del jugador"
                        )
                        .setRequired(true)
            ),

    async execute(interaction) {

        await interaction.deferReply();

        // =================================================
        // OBTENER STEAMID
        // =================================================

        const steamId =
            interaction.options
                .getString("steamid")
                .trim();

        // =================================================
        // VALIDAR STEAMID64
        // =================================================

        if (
            !/^\d{17}$/.test(steamId)
        ) {

            return await interaction.editReply(
                "❌ Debes introducir un SteamID64 válido de 17 números."
            );
        }

        // =================================================
        // URLS
        // =================================================

        const steamProfileUrl =
            `https://steamcommunity.com/profiles/${steamId}`;

        const steamHistoryUrl =
            `https://steamhistory.net/id/${steamId}`;

        // =================================================
        // STEAMHISTORY.NET
        // =================================================

        let steamHistory;

        try {

            console.log(
                "=============================================="
            );

            console.log(
                "📜 /steamid → SteamHistory.net"
            );

            console.log(
                `🆔 SteamID64: ${steamId}`
            );

            console.log(
                "=============================================="
            );

            steamHistory =
                await getSteamHistory(
                    steamId
                );

        } catch (error) {

            console.error(
                "❌ Error SteamHistory:",
                error.message
            );

            steamHistory = {
                names: []
            };
        }

        // =================================================
        // HISTORIAL
        // =================================================

        const historicalNames =
            Array.isArray(
                steamHistory?.names
            )
                ? steamHistory.names
                : [];

        console.log(
            "📜 STEAMHISTORY.NET:",
            historicalNames
        );

        // =================================================
        // NOMBRE ACTUAL
        // =================================================

        const nombreActual =
            historicalNames.length > 0
                ? historicalNames[0]?.name
                : null;

        // =================================================
        // TEXTO HISTORIAL
        // =================================================

        const nameHistoryTexto =
            construirHistorial(
                historicalNames
            );

        // =================================================
        // EMBED
        // =================================================

        const embed =
            new EmbedBuilder()

                .setTitle(
                    "🔎 Historial de SteamID"
                )

                .setColor(
                    "#57F287"
                )

                // =========================================
                // IDENTIFICACIÓN
                // =========================================

                .addFields({

                    name:
                        "🆔 SteamID64",

                    value:
                        `\`${steamId}\``,

                    inline:
                        false
                });

        // =================================================
        // NOMBRE ACTUAL
        // =================================================

        if (nombreActual) {

            embed.addFields({

                name:
                    "👤 Nombre actual",

                value:
                    `**${escaparTexto(nombreActual)}**`,

                inline:
                    false
            });
        }

        // =================================================
        // PERFILES
        // =================================================

        embed.addFields(

            {
                name:
                    "🎮 Perfil de Steam",

                value:
                    `[Abrir perfil](${steamProfileUrl})`,

                inline:
                    true
            },

            {
                name:
                    "📜 SteamHistory",

                value:
                    `[Ver historial completo](${steamHistoryUrl})`,

                inline:
                    true
            }

        );

        // =================================================
        // HISTORIAL DE NOMBRES
        // =================================================

        embed.addFields({

            name:
                `📜 Historial de nombres (${historicalNames.length})`,

            value:
                nameHistoryTexto,

            inline:
                false
        });

        // =================================================
        // FOOTER
        // =================================================

        embed

            .setTimestamp()

            .setFooter({

                text:
                    "RustLogix • SteamHistory.net"

            });

        // =================================================
        // RESPONDER
        // =================================================

        return await interaction.editReply({

            embeds: [
                embed
            ]

        });
    }
};