
const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getBattleMetricsHoursBm,
    formatearDuracion
} = require("../services/battlemetricsHoursBm");

function extraerBattleMetricsId(perfil) {
    const texto = String(perfil || "").trim();

    if (/^\d+$/.test(texto)) return texto;

    const coincidencia = texto.match(
        /(?:https?:\/\/)?(?:www\.)?battlemetrics\.com\/players\/(\d+)(?:[/?#]|$)/i
    );

    return coincidencia ? coincidencia[1] : null;
}

function limitarTexto(texto, maximo = 1024) {
    const valor = String(texto || "No disponible");

    return valor.length > maximo
        ? `${valor.slice(0, maximo - 3)}...`
        : valor;
}

function construirListaServidores(servidores) {
    if (!Array.isArray(servidores) || servidores.length === 0) {
        return "No se encontraron servidores con horas registradas.";
    }

    return servidores.slice(0, 10).map((servidor, indice) => {
        const nombre = limitarTexto(servidor.nombre || servidor.id, 90);

        return `**${indice + 1}.** ${nombre} — \`${servidor.tiempo}\``;
    }).join("\n");
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("horasbm")
        .setDescription("Consulta las horas de un jugador en BattleMetrics.")
        .addStringOption(option =>
            option
                .setName("link")
                .setDescription("Enlace del perfil de BattleMetrics")
                .setRequired(true)
        ),

    async execute(interaction) {
        console.log("🎯 Ejecutando /horasbm");

        await interaction.deferReply();

        try {
            const perfil = interaction.options.getString("link", true);
            const playerId = extraerBattleMetricsId(perfil);

            if (!playerId) {
                await interaction.editReply({
                    content:
                        "❌ Enlace no válido. Pega un perfil como https://www.battlemetrics.com/players/123456789"
                });
                return;
            }

            console.log(
                `🔎 HORASBM | Consultando perfil ${playerId}`
            );

            const datos = await getBattleMetricsHoursBm(playerId);

            if (!datos) {
                await interaction.editReply({
                    content:
                        "❌ No se pudieron recuperar los datos de BattleMetrics. Inténtalo de nuevo más tarde."
                });
                return;
            }

            const urlPerfil =
                `https://www.battlemetrics.com/players/${playerId}`;

            let estadoTexto;

            if (datos.estado === "online") {
                const duracion = datos.duracionSesionSegundos !== null
                    ? formatearDuracion(datos.duracionSesionSegundos)
                    : "duración no disponible";

                estadoTexto = `🟢 Jugando Rust · ${duracion}`;
            } else if (datos.estado === "offline") {
                estadoTexto = "🔴 Offline";
            } else {
                estadoTexto =
                    "⚪ Estado desconocido; BattleMetrics no permitió confirmarlo";
            }

            const embed = new EmbedBuilder()
                .setColor(
                    datos.estado === "online"
                        ? 0x2ecc71
                        : datos.estado === "offline"
                            ? 0xe74c3c
                            : 0x95a5a6
                )
                .setAuthor({
                    name: "🎮 Perfil BattleMetrics",
                    url: urlPerfil
                })
                .setDescription(
                    "Datos consultados mediante BattleMetrics."
                )
                .addFields(
                    {
                        name: "👤 Jugador",
                        value: `[${limitarTexto(datos.nombre, 200)}](${urlPerfil})`,
                        inline: false
                    },
                    {
                        name: "🌐 Servidor actual",
                        value: datos.servidorActualRust
                            ? limitarTexto(datos.servidorActualRust.nombre, 1024)
                            : "No se ha podido confirmar un servidor actual.",
                        inline: false
                    },
                    {
                        name: "🎮 Estado",
                        value: estadoTexto,
                        inline: false
                    },
                    {
                        name: "📈 Horas BattleMetrics",
                        value: `\`${datos.totalHoras || "No disponible"}\``,
                        inline: true
                    },
                    {
                        name: "🖥️ Servidores Rust con horas",
                        value: `\`${Number(datos.cantidadServidoresRust) || 0}\``,
                        inline: true
                    },
                    {
                        name: "📈 Esta semana",
                        value: `\`${datos.horasSemana || "No disponible"}\``,
                        inline: true
                    },
                    {
                        name: "📆 Este mes",
                        value: `\`${datos.horasMes || "No disponible"}\``,
                        inline: true
                    },
                    {
                        name: "🕐 Última actividad registrada",
                        value: `\`${datos.ultimaConexion || "No disponible"}\``,
                        inline: true
                    },
                    {
                        name: "🆔 BattleMetrics",
                        value: `[${playerId}](${urlPerfil})`,
                        inline: true
                    },
                    {
                        name: "🏆 Top 10 servidores Rust",
                        value: limitarTexto(
                            construirListaServidores(datos.topServidoresRust),
                            1024
                        ),
                        inline: false
                    }
                )
                .setFooter({
                    text: "RustLogix • BattleMetrics"
                })
                .setTimestamp();

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(
                `✅ /horasbm completado para ${datos.nombre} (${playerId})`
            );
        } catch (error) {
            console.error("❌ Error ejecutando /horasbm:", error);

            await interaction.editReply({
                content:
                    "❌ Ha ocurrido un error consultando BattleMetrics. Revisa los logs del bot para ver el detalle."
            }).catch(() => {});
        }
    }
};