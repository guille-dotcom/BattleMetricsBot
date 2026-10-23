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
            "Consulta el servidor actual y las horas jugadas de un jugador de Rust."
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
            const perfil = interaction.options.getString(
                "perfil",
                true
            );

            const datos = await consultarWardog(perfil);

            let color = 0x95a5a6;
            let estadoTexto = "⚪ Estado desconocido";
            let servidorTexto =
                "No se pudo confirmar un servidor Rust actual.";

            if (datos.estado === "online") {
                color = 0x2ecc71;

                const duracion =
                    datos.duracionSesionSegundos !== null &&
                    datos.duracionSesionSegundos !== undefined
                        ? require("../services/battlemetricsHoursBm")
                            .formatearDuracion(
                                datos.duracionSesionSegundos
                            )
                        : "duración no disponible";

                estadoTexto = `🟢 Jugando Rust · ${duracion}`;

                if (datos.servidorActual) {
                    servidorTexto = limitarTexto(
                        datos.servidorActual.nombre
                    );
                }
            } else if (datos.estado === "offline") {
                color = 0xe74c3c;
                estadoTexto = "🔴 Offline";
            }

            const horasTexto = datos.servidorActual
                ? datos.horasServidor || "Sin horas disponibles"
                : "No está conectado a un servidor Rust confirmado.";

            const embed = new EmbedBuilder()
                .setColor(color)
                .setAuthor({
                    name: "🐺 RustLogix · WARDOG",
                    url: datos.urlBattleMetrics
                })
                .setTitle(
                    limitarTexto(datos.nombre, 256)
                )
                .setURL(datos.urlBattleMetrics)
                .setDescription(
                    "Estado actual del jugador y tiempo registrado en su servidor."
                )
                .addFields(
                    {
                        name: "🎮 Estado",
                        value: estadoTexto,
                        inline: false
                    },
                    {
                        name: "🌐 Servidor actual",
                        value: servidorTexto,
                        inline: false
                    },
                    {
                        name: "⏱️ Horas en ese servidor",
                        value: limitarTexto(horasTexto),
                        inline: true
                    },
                    {
                        name: "📊 Fuente del tiempo",
                        value: limitarTexto(datos.fuenteHoras),
                        inline: true
                    },
                    {
                        name: "🆔 Perfil BattleMetrics",
                        value: `[Abrir perfil](${datos.urlBattleMetrics})`,
                        inline: false
                    }
                )
                .setFooter({
                    text: "RustLogix • WARDOG"
                })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });
        } catch (error) {
            console.error(
                "❌ Error ejecutando /wardog:",
                error.response?.data || error.message || error
            );

            await interaction.editReply({
                content: `❌ ${limitarTexto(
                    error.message ||
                    "No se pudo consultar al jugador."
                )}`
            }).catch(() => {});
        }
    }
};