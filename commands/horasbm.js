
const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getBattleMetricsHours
} = require("../services/battlemetricsHours");

// ============================================================
// UTILIDADES
// ============================================================

function extraerBattleMetricsId(perfil) {
    if (!perfil || typeof perfil !== "string") {
        return null;
    }

    const texto = perfil.trim();

    // Acepta enlaces completos, enlaces sin www y URLs con parámetros.
    const match = texto.match(
        /(?:https?:\/\/)?(?:www\.)?battlemetrics\.com\/players\/(\d+)(?:[/?#]|$)/i
    );

    return match ? match[1] : null;
}

function formatearDuracionSesion(segundos) {
    const total = Math.max(
        0,
        Math.floor(Number(segundos) || 0)
    );

    const horas = Math.floor(total / 3600);
    const minutos = Math.floor((total % 3600) / 60);

    if (horas > 0) {
        return `${horas} hora${horas !== 1 ? "s" : ""} ${minutos}m`;
    }

    return `${minutos}m`;
}

function limitarTexto(texto, maximo = 1024) {
    const valor = String(texto ?? "No disponible");

    if (valor.length <= maximo) {
        return valor;
    }

    return `${valor.slice(0, maximo - 3)}...`;
}

function formatearEnlaceJugador(nombre, playerId) {
    return `[${nombre}](https://www.battlemetrics.com/players/${playerId})`;
}

function formatearEnlaceServidor(nombre, serverId) {
    if (!serverId) {
        return nombre;
    }

    return `[${nombre}](https://www.battlemetrics.com/servers/${serverId})`;
}

// ============================================================
// COMANDO
// ============================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("horasbm")
        .setDescription(
            "Consulta las horas y la sesión actual de un perfil de BattleMetrics"
        )
        .addStringOption(option =>
            option
                .setName("link")
                .setDescription(
                    "Enlace del perfil de BattleMetrics del jugador"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            // ========================================================
            // OBTENER Y VALIDAR EL ENLACE
            // ========================================================

            const perfil = interaction.options.getString("link", true).trim();

            const playerId = extraerBattleMetricsId(perfil);

            if (!playerId) {
                return interaction.editReply(
                    "❌ El enlace de BattleMetrics no es válido.\n\n" +
                    "Ejemplo:\n" +
                    "https://www.battlemetrics.com/players/1182036750"
                );
            }

            console.log(
                `🔎 /horasbm consultando jugador BattleMetrics: ${playerId}`
            );

            // ========================================================
            // CONSULTAR BATTLEMETRICS
            // ========================================================

            const datos = await getBattleMetricsHours(playerId);

            if (!datos) {
                return interaction.editReply(
                    "❌ No se pudieron obtener los datos de BattleMetrics."
                );
            }

            // ========================================================
            // DATOS BÁSICOS
            // ========================================================

            const nombre =
                datos.nombre ||
                datos.name ||
                `Jugador ${playerId}`;

            const jugadorUrl =
                `https://www.battlemetrics.com/players/${playerId}`;

            // ========================================================
            // SERVIDOR ACTUAL
            // ========================================================

            const servidorActual =
                datos.servidorActualRust ||
                datos.servidorActual ||
                null;

            const servidor =
                datos.servidor ||
                datos.server ||
                servidorActual?.nombre ||
                servidorActual?.name ||
                "Ninguno";

            const servidorId =
                servidorActual?.id ||
                datos.servidorId ||
                datos.serverId ||
                null;

            const servidorTexto =
                servidorId && servidor !== "Ninguno"
                    ? formatearEnlaceServidor(servidor, servidorId)
                    : servidor;

            // ========================================================
            // ESTADO Y DURACIÓN DE LA SESIÓN ACTUAL
            // ========================================================

            let estadoActual = "🔴 Offline";

            const segundosSesion = Number(
                datos.duracionSesionSegundos
            );

            const segundosSesionConfigurado = Number(
                datos.duracionSesionConfiguradoSegundos
            );

            let duracionSesionTexto = null;

            if (
                datos.jugandoServidorConfigurado &&
                Number.isFinite(segundosSesionConfigurado) &&
                segundosSesionConfigurado >= 0
            ) {
                duracionSesionTexto =
                    formatearDuracionSesion(
                        segundosSesionConfigurado
                    );
            } else if (
                datos.jugando &&
                Number.isFinite(segundosSesion) &&
                segundosSesion >= 0
            ) {
                duracionSesionTexto =
                    formatearDuracionSesion(
                        segundosSesion
                    );
            }

            if (datos.jugandoServidorConfigurado) {
                estadoActual = duracionSesionTexto
                    ? `🟢 Jugando · ${duracionSesionTexto}`
                    : "🟢 Jugando";
            } else if (datos.jugando) {
                estadoActual = duracionSesionTexto
                    ? `🟡 Jugando en otro servidor · ${duracionSesionTexto}`
                    : "🟡 Jugando en otro servidor";
            } else if (datos.online) {
                estadoActual = "🟡 Online; servidor Rust no confirmado";
            }

            // ========================================================
            // HORAS TOTALES DE BATTLEMETRICS
            // ========================================================

            const horas =
                datos.totalHoras ||
                datos.horasRust ||
                datos.horas ||
                "0h";

            // ========================================================
            // CANTIDAD DE SERVIDORES
            // ========================================================

            let servidoresJugados = 0;

            if (
                datos.cantidadServidoresRust !== null &&
                typeof datos.cantidadServidoresRust !== "undefined"
            ) {
                const cantidad = Number(
                    datos.cantidadServidoresRust
                );

                if (Number.isFinite(cantidad)) {
                    servidoresJugados = cantidad;
                }
            }

            if (
                servidoresJugados === 0 &&
                Array.isArray(datos.servidoresEncontrados)
            ) {
                servidoresJugados =
                    datos.servidoresEncontrados.length;
            }

            // ========================================================
            // SEMANA Y MES
            // ========================================================

            const semana =
                datos.horasSemana ||
                "0h";

            const mes =
                datos.horasMes ||
                "0h";

            // ========================================================
            // ÚLTIMA CONEXIÓN
            // ========================================================

            const ultimaConexion =
                datos.ultimaConexion ||
                "N/A";

            // ========================================================
            // COLOR DEL EMBED
            // ========================================================

            const color = datos.jugando
                ? 0x57F287
                : datos.online
                    ? 0xFEE75C
                    : 0xED4245;

            // ========================================================
            // EMBED PRINCIPAL
            // ========================================================

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle("🎮 Perfil BattleMetrics")
                .setURL(jugadorUrl)
                .setDescription(
                    `Datos consultados mediante BattleMetrics.\n\n` +
                    `👤 **Jugador:** ${formatearEnlaceJugador(nombre, playerId)}`
                )
                .addFields(
                    {
                        name: "🌐 Servidor actual",
                        value: limitarTexto(servidorTexto),
                        inline: false
                    },
                    {
                        name: "🎮 Estado",
                        value: limitarTexto(estadoActual),
                        inline: false
                    },
                    {
                        name: "📈 Horas BattleMetrics",
                        value: `\`${horas}\``,
                        inline: true
                    },
                    {
                        name: "🖥️ Servidores Rust con horas",
                        value: `\`${servidoresJugados}\``,
                        inline: true
                    },
                    {
                        name: "📈 Esta semana",
                        value: `\`${semana}\``,
                        inline: true
                    },
                    {
                        name: "📆 Este mes",
                        value: `\`${mes}\``,
                        inline: true
                    },
                    {
                        name: "🕐 Última actividad registrada",
                        value: `\`${limitarTexto(ultimaConexion, 200)}\``,
                        inline: true
                    },
                    {
                        name: "🆔 BattleMetrics",
                        value: `[${playerId}](${jugadorUrl})`,
                        inline: true
                    }
                );

            // ========================================================
            // TOP 10 SERVIDORES RUST
            // ========================================================

            const top10 = Array.isArray(datos.top10)
                ? datos.top10
                : Array.isArray(datos.topServidoresRust)
                    ? datos.topServidoresRust
                    : [];

            if (top10.length > 0) {
                const listaTop = top10
                    .slice(0, 10)
                    .map((server, index) => {
                        const id =
                            server.id ||
                            server.serverId ||
                            server.server_id;

                        const nombreServidor =
                            server.nombre ||
                            server.name ||
                            (id
                                ? `Servidor ${id}`
                                : "Servidor desconocido");

                        const tiempo =
                            server.tiempo ||
                            server.horas ||
                            server.duracion ||
                            "0h";

                        const enlace = formatearEnlaceServidor(
                            nombreServidor,
                            id
                        );

                        return (
                            `**${index + 1}.** ${enlace} — \`${tiempo}\``
                        );
                    });

                // Discord permite hasta 1024 caracteres por campo.
                let bloque = "";
                let numeroBloque = 1;

                for (const linea of listaTop) {
                    const siguiente = bloque
                        ? `${bloque}\n${linea}`
                        : linea;

                    if (siguiente.length > 1024) {
                        embed.addFields({
                            name: numeroBloque === 1
                                ? "🏆 Top servidores de Rust"
                                : "🏆 Top servidores de Rust (continuación)",
                            value: bloque,
                            inline: false
                        });

                        numeroBloque++;
                        bloque = linea;
                    } else {
                        bloque = siguiente;
                    }
                }

                if (bloque) {
                    embed.addFields({
                        name: numeroBloque === 1
                            ? "🏆 Top servidores de Rust"
                            : "🏆 Top servidores de Rust (continuación)",
                        value: bloque,
                        inline: false
                    });
                }
            }

            // ========================================================
            // HISTORIAL DE NOMBRES
            // ========================================================

            if (
                Array.isArray(datos.historialNombres) &&
                datos.historialNombres.length > 0
            ) {
                const historial = datos.historialNombres
                    .slice(0, 10)
                    .map(nombreAnterior => `• ${nombreAnterior}`)
                    .join("\n");

                embed.addFields({
                    name: "📝 Historial de nombres",
                    value: limitarTexto(historial),
                    inline: false
                });
            }

            // ========================================================
            // FOOTER Y FECHA
            // ========================================================

            embed.setFooter({
                text: "RustLogix • BattleMetrics"
            });

            embed.setTimestamp();

            // ========================================================
            // RESPUESTA
            // ========================================================

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(
                `✅ /horasbm completado para ${nombre} (${playerId})`
            );
        } catch (error) {
            console.error(
                "❌ Error en /horasbm:",
                error
            );

            await interaction.editReply(
                "❌ Ocurrió un error al consultar BattleMetrics."
            );
        }
    }
};