
const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    consultarWardog
} = require("../services/wardogService");

const {
    formatearDuracion
} = require("../services/battlemetricsHoursBm");

function limitarTexto(texto, maximo = 1024) {
    const valor = String(texto || "No disponible");

    return valor.length > maximo
        ? `${valor.slice(0, maximo - 3)}...`
        : valor;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("wardog")
        .setDescription(
            "Consulta en qué servidor WARDOG está jugando un jugador."
        )
        .addStringOption(option =>
            option
                .setName("perfil")
                .setDescription(
                    "SteamID64, enlace de Steam o perfil de BattleMetrics"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const entrada = interaction.options.getString(
                "perfil",
                true
            );

            const perfiles = await consultarWardog(entrada);

            if (!Array.isArray(perfiles) || perfiles.length === 0) {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xe67e22)
                            .setTitle("No se encontró una sesión activa en WARDOG")
                            .setDescription(
                                "BattleMetrics no confirmó una sesión activa en un servidor cuyo nombre contenga WARDOG. Esto no descarta que el jugador esté conectado si BattleMetrics no registra o no permite consultar esa sesión."
                            )
                    ]
                });

                return;
            }

            const embed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setAuthor({
                    name: "🐺 RustLogix · WARDOG"
                })
                .setTitle("Servidor WARDOG actual")
                .setDescription(
                    `BattleMetrics confirmó ${perfiles.length} perfil(es) con una sesión activa en WARDOG.`
                )
                .setFooter({
                    text: "Sesión activa consultada en BattleMetrics"
                })
                .setTimestamp();

            for (const perfil of perfiles.slice(0, 10)) {
                const servidor = perfil.servidorActual?.nombre ||
                    "Servidor no disponible";

                const duracion =
                    perfil.duracionSesionSegundos !== null &&
                    perfil.duracionSesionSegundos !== undefined
                        ? formatearDuracion(
                            perfil.duracionSesionSegundos
                        )
                        : "No disponible";

                const campos = [
                    "**Estado:** 🟢 Online",
                    `**Servidor donde está jugando:** ${limitarTexto(servidor, 500)}`,
                    `**Tiempo de la sesión actual:** ${limitarTexto(duracion)}`,
                    `**Horas registradas en ese servidor:** ${limitarTexto(perfil.horasServidor)}`,
                    `**Fuente de las horas:** ${limitarTexto(perfil.fuenteHoras)}`,
                    perfil.urlBattleMetrics
                        ? `[Perfil BattleMetrics](${perfil.urlBattleMetrics})`
                        : null,
                    perfil.urlSteam
                        ? `[Perfil Steam](${perfil.urlSteam})`
                        : null
                ].filter(Boolean);

                embed.addFields({
                    name: limitarTexto(perfil.nombre, 256),
                    value: campos.join("\n"),
                    inline: false
                });
            }

            if (perfiles.length > 10) {
                embed.setDescription(
                    `Se encontraron ${perfiles.length} perfiles. Se muestran los primeros 10.`
                );
            }

            await interaction.editReply({
                embeds: [embed]
            });
        } catch (error) {
            console.error(
                "❌ Error ejecutando /wardog:",
                error.response?.data || error.message || error
            );

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xe74c3c)
                        .setTitle("Error al consultar WARDOG")
                        .setDescription(
                            limitarTexto(
                                error.message ||
                                "No se pudo consultar BattleMetrics.",
                                4000
                            )
                        )
                ]
            }).catch(() => {});
        }
    }
};
