
const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    consultarWardog
} = require("../services/wardogService");

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
            "Busca jugadores online en servidores WARDOG."
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
                            .setTitle("No hay coincidencias online")
                            .setDescription(
                                "No se encontraron perfiles que estén online actualmente en un servidor WARDOG."
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
                .setTitle("Jugadores online en servidores WARDOG")
                .setDescription(
                    `Se encontraron **${perfiles.length}** perfil(es) que cumplen la condición.`
                )
                .setFooter({
                    text: "Datos consultados en BattleMetrics"
                })
                .setTimestamp();

            for (const perfil of perfiles.slice(0, 10)) {
                const servidor = perfil.servidorActual?.nombre ||
                    "Servidor no disponible";

                const duracion = perfil.duracionSesionSegundos !== null &&
                    perfil.duracionSesionSegundos !== undefined
                    ? require("../services/battlemetricsHoursBm")
                        .formatearDuracion(
                            perfil.duracionSesionSegundos
                        )
                    : "No disponible";

                embed.addFields({
                    name: limitarTexto(perfil.nombre, 256),
                    value: [
                        `**Estado:** 🟢 Online`,
                        `**Servidor actual:** ${limitarTexto(servidor, 500)}`,
                        `**Horas registradas en el servidor:** ${limitarTexto(perfil.horasServidor)}`,
                        `**Sesión actual:** ${limitarTexto(duracion)}`,
                        `**Fuente:** ${limitarTexto(perfil.fuenteHoras)}`,
                        `[Perfil BattleMetrics](${perfil.urlBattleMetrics})`,
                        perfil.urlSteam
                            ? `[Perfil Steam](${perfil.urlSteam})`
                            : null
                    ].filter(Boolean).join("\n"),
                    inline: false
                });
            }

            if (perfiles.length > 10) {
                embed.setDescription(
                    `Se encontraron **${perfiles.length}** perfiles online en servidores WARDOG. Se muestran los primeros 10.`
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
