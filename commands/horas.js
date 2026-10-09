const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getSteamProfile
} = require("../services/steam.js");

const {
    searchBattleMetricsPlayer,
    getBattleMetricsPlayerStatus
} = require("../services/battlemetricsHours.js");

const ServerConfig = require("../models/ServerConfig");

// ============================================================
// UTILIDADES DEL EMBED
// ============================================================

function limitarTexto(valor, maximo = 1000) {
    const texto = String(valor ?? "").trim();

    if (!texto) {
        return "No disponible";
    }

    if (texto.length <= maximo) {
        return texto;
    }

    return `${texto.slice(0, maximo - 3)}...`;
}

function crearCamposTop10(servidores) {
    if (!Array.isArray(servidores) || servidores.length === 0) {
        return [{
            name: "🏆 Top servidores de Rust",
            value: "No hay historial de servidores Rust disponible.",
            inline: false
        }];
    }

    const lineas = servidores.slice(0, 10).map((servidor, index) => {
        const nombre = limitarTexto(
            servidor.nombre || "Servidor desconocido",
            100
        );

        const id = encodeURIComponent(String(servidor.id || ""));

        const tiempo = limitarTexto(
            servidor.tiempo || "Horas no disponibles",
            30
        );

        if (!id) {
            return `**${index + 1}.** ${nombre} — \`${tiempo}\``;
        }

        return `**${index + 1}.** [${nombre}](https://www.battlemetrics.com/servers/${id}) — \`${tiempo}\``;
    });

    const campos = [];

    for (let i = 0; i < lineas.length; i += 3) {
        campos.push({
            name: i === 0
                ? "🏆 Top servidores de Rust"
                : "🏆 Top servidores de Rust (continuación)",
            value: limitarTexto(
                lineas.slice(i, i + 3).join("\n"),
                1000
            ),
            inline: false
        });
    }

    return campos;
}

function convertirHorasATotal(horasTexto) {
    const texto = String(horasTexto || "");

    const diasMatch = texto.match(/(\d+)\s*d/i);
    const horasMatch = texto.match(/(\d+)\s*h/i);
    const minutosMatch = texto.match(/(\d+)\s*m/i);

    return (
        (Number(diasMatch?.[1]) || 0) * 24 +
        (Number(horasMatch?.[1]) || 0) +
        (Number(minutosMatch?.[1]) || 0) / 60
    );
}

// ============================================================
// DURACIÓN DE LA SESIÓN ACTUAL
// ============================================================

function formatearDuracionSesion(segundos) {
    segundos = Math.max(
        0,
        Math.floor(Number(segundos) || 0)
    );

    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);

    if (horas > 0) {
        return `${horas} hora${horas !== 1 ? "s" : ""} ${minutos}m`;
    }

    return `${minutos}m`;
}

// ============================================================
// COMANDO
// ============================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("horas")
        .setDescription(
            "Consulta las horas de Rust de un jugador mediante Steam y BattleMetrics."
        )
        .addStringOption(option =>
            option
                .setName("steamid")
                .setDescription("SteamID64 del jugador (Ej: 76561198818187993)")
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const steamId = interaction.options
                .getString("steamid")
                .trim();

            if (!/^\d{17}$/.test(steamId)) {
                return interaction.editReply(
                    "❌ Introduce un SteamID64 válido de 17 dígitos."
                );
            }

            // =================================================
            // SERVIDOR CONFIGURADO
            // =================================================

            let serverId = null;

            try {
                const config = await ServerConfig.findOne({
                    guildId: interaction.guild.id
                });

                if (config?.battleMetricsServerId) {
                    serverId = String(config.battleMetricsServerId);
                }
            } catch (error) {
                console.error(
                    "❌ /horas | Error leyendo la configuración:",
                    error.message
                );
            }

            if (!serverId) {
                return interaction.editReply(
                    "❌ No hay un servidor de BattleMetrics configurado para este Discord. Usa `/configurar-servidor` primero."
                );
            }

            console.log(
                `🎯 /horas | Servidor configurado: ${serverId}`
            );

            // =================================================
            // PERFIL STEAM
            // =================================================

            let perfilSteam;

            try {
                perfilSteam = await getSteamProfile(steamId);
            } catch (error) {
                console.error(
                    "❌ /horas | Error consultando Steam:",
                    error.message
                );

                return interaction.editReply(
                    "❌ No se pudo consultar Steam. Inténtalo de nuevo más tarde."
                );
            }

            if (!perfilSteam?.name) {
                return interaction.editReply(
                    "❌ Steam no devolvió un perfil válido para ese ID."
                );
            }

            const nombreSteam = String(perfilSteam.name);

            const horasSteamNum =
                Number.parseFloat(perfilSteam.rustHours) || 0;

            const horasSteamTexto = horasSteamNum > 0
                ? `\`${horasSteamNum.toLocaleString("es-CL")} h\``
                : "`Privadas o no disponibles`";

            const paisTexto = perfilSteam.loccountrycode
                ? `:flag_${String(perfilSteam.loccountrycode).toLowerCase()}: (${perfilSteam.loccountrycode})`
                : "Desconocido";

            const creacionSteamTexto =
                perfilSteam.creationDate || "No disponible";

            // =================================================
            // ESTADO DE BANEO
            // =================================================

            let vacTexto = "✅ Sin baneos detectados";

            if (
                perfilSteam.vacBanned &&
                Number(perfilSteam.gameBansCount) > 0
            ) {
                vacTexto = "⚠️ Baneo VAC y Game Ban";
            } else if (perfilSteam.vacBanned) {
                vacTexto = "⚠️ Baneo VAC";
            } else if (Number(perfilSteam.gameBansCount) > 0) {
                vacTexto = `⚠️ ${perfilSteam.gameBansCount} Game Ban`;
            }

            // =================================================
            // BUSCAR ENTRE LOS JUGADORES DEL SERVIDOR
            // =================================================

            let jugadorBM = null;

            try {
                jugadorBM = await searchBattleMetricsPlayer(
                    nombreSteam,
                    serverId
                );
            } catch (error) {
                console.error(
                    "❌ /horas | Error buscando en BattleMetrics:",
                    error.message
                );
            }

            if (jugadorBM?.duplicate) {
                return interaction.editReply({
                    content:
                        `⚠️ El nombre **${nombreSteam}** coincide con varios jugadores en el servidor configurado.\n\n` +
                        "Para evitar mostrar las horas de otra persona, utiliza `/horasbm` con el enlace exacto del perfil de BattleMetrics."
                });
            }

            if (!jugadorBM?.id) {
                const embedOffline = new EmbedBuilder()
                    .setTitle(`🔍 Resultado para: ${nombreSteam}`)
                    .setColor("#ED4245")
                    .setDescription(
                        "No se encontró una coincidencia exacta entre los jugadores que devuelve BattleMetrics para el servidor configurado. Puede estar desconectado o su nombre de Steam puede ser distinto al registrado en el servidor."
                    )
                    .addFields(
                        {
                            name: "🆔 Steam ID",
                            value: `[${steamId}](https://steamcommunity.com/profiles/${steamId})`,
                            inline: true
                        },
                        {
                            name: "📊 Horas Steam",
                            value: horasSteamTexto,
                            inline: true
                        },
                        {
                            name: "🖥️ Servidor configurado",
                            value: `[Ver servidor](https://www.battlemetrics.com/servers/${serverId})`,
                            inline: true
                        },
                        {
                            name: "🌍 País",
                            value: paisTexto,
                            inline: true
                        },
                        {
                            name: "🛡️ Baneos",
                            value: vacTexto,
                            inline: true
                        },
                        {
                            name: "📅 Antigüedad",
                            value: limitarTexto(creacionSteamTexto, 100),
                            inline: true
                        }
                    )
                    .setTimestamp()
                    .setFooter({
                        text: "RustLogix"
                    });

                const avatar =
                    perfilSteam.avatarfull || perfilSteam.avatar;

                if (avatar) {
                    embedOffline.setThumbnail(avatar);
                }

                return interaction.editReply({
                    embeds: [embedOffline]
                });
            }

            // =================================================
            // DETALLES DE BATTLEMETRICS
            // =================================================

            let datos;

            try {
                datos = await getBattleMetricsPlayerStatus(
                    jugadorBM.id,
                    serverId
                );
            } catch (error) {
                console.error(
                    "❌ /horas | Error obteniendo datos de BattleMetrics:",
                    error.message
                );
            }

            if (!datos) {
                return interaction.editReply(
                    "❌ BattleMetrics no pudo devolver los datos detallados del jugador. Revisa los logs del servicio e inténtalo de nuevo."
                );
            }

            // =================================================
            // HORAS
            // =================================================

            const horasBMTexto =
                datos.totalHoras ||
                datos.totalHorasTexto ||
                datos.horasTotalesTexto ||
                datos.totalHorasFormateadas ||
                datos.totalHorasBMTexto ||
                (
                    typeof datos.totalHorasBM === "string"
                        ? datos.totalHorasBM
                        : null
                ) ||
                (
                    Number(datos.totalSegundos) > 0
                        ? `${Math.floor(Number(datos.totalSegundos) / 3600)}h ${Math.floor((Number(datos.totalSegundos) % 3600) / 60)}m`
                        : "0h"
                );

            const horasBMNum = convertirHorasATotal(horasBMTexto);

            const diferenciaTexto = horasSteamNum > 0
                ? `\`${Math.abs(horasSteamNum - horasBMNum).toFixed(0)} h\``
                : "`N/A`";

            const horasSemana = datos.horasSemana || "No disponible";
            const horasMes = datos.horasMes || "No disponible";
            const ultimaConexion = datos.ultimaConexion || "No disponible";

            // =================================================
            // ESTADO ACTUAL Y DURACIÓN DE SESIÓN
            // =================================================

            let estadoActual = "🔴 Offline";

            /*
             * La duración llega directamente desde
             * battlemetricsHours.js.
             *
             * No buscamos datos.sesiones porque el servicio
             * no necesita devolver el array completo para
             * calcular la duración de la sesión activa.
             */

            const segundosSesionConfigurado = Number(
                datos.duracionSesionConfiguradoSegundos
            );

            const segundosSesionRust = Number(
                datos.duracionSesionSegundos
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
                Number.isFinite(segundosSesionRust) &&
                segundosSesionRust >= 0
            ) {
                duracionSesionTexto =
                    formatearDuracionSesion(
                        segundosSesionRust
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
                estadoActual =
                    "🟡 Online; servidor Rust no confirmado";
            }

            // =================================================
            // SERVIDOR ACTUAL / HORAS DEL SERVIDOR CONFIGURADO
            // =================================================

            let servidorActualTexto =
                "🔴 No hay una sesión activa confirmada en el servidor configurado.";

            if (
                datos.jugandoServidorConfigurado &&
                datos.servidorActualRust &&
                String(datos.servidorActualRust.id) === serverId
            ) {
                const horasServidor =
                    datos.horasServidorConfigurado?.tiempo ||
                    "No disponibles";

                servidorActualTexto =
                    `[${limitarTexto(datos.servidorActualRust.nombre, 150)}]` +
                    `(https://www.battlemetrics.com/servers/${serverId})` +
                    `\n⏱️ Horas en este servidor: **${horasServidor}**`;
            } else if (
                datos.servidorActualRust &&
                String(datos.servidorActualRust.id) !== serverId
            ) {
                const actual = datos.servidorActualRust;

                servidorActualTexto =
                    `🟡 Está en otro servidor Rust: [${limitarTexto(actual.nombre, 150)}]` +
                    `(https://www.battlemetrics.com/servers/${encodeURIComponent(String(actual.id))})`;
            }

            // =================================================
            // TOP 10 SERVIDORES
            // =================================================

            const topServidores = Array.isArray(datos.topServidoresRust)
                ? datos.topServidoresRust
                : [];

            const camposTop = crearCamposTop10(topServidores);

            // =================================================
            // COMPLETITUD DE LOS DATOS
            // =================================================

            let avisoDatos = null;

            if (datos.sesionesCompletas === false) {
                avisoDatos =
                    "⚠️ BattleMetrics no permitió recuperar todas las páginas de sesiones. El total se calcula con los tiempos por servidor recuperados y podría estar incompleto.";
            } else if (Number(datos.servidoresSinHoras) > 0) {
                avisoDatos =
                    `ℹ️ BattleMetrics no devolvió horas para ${datos.servidoresSinHoras} servidor(es). El total incluye únicamente los tiempos recuperados.`;
            }

            // =================================================
            // EMBED
            // =================================================

            const embed = new EmbedBuilder()
                .setTitle(`🔍 Resultado para: ${nombreSteam}`)
                .setColor(
                    datos.jugandoServidorConfigurado
                        ? "#57F287"
                        : datos.online
                            ? "#FEE75C"
                            : "#ED4245"
                )
                .setDescription(
                    avisoDatos ||
                    "Datos consultados mediante Steam y BattleMetrics."
                )
                .addFields(
                    {
                        name: "🎮 Servidor actual",
                        value: limitarTexto(servidorActualTexto, 1000),
                        inline: false
                    },
                    ...camposTop,
                    {
                        name: "🆔 BattleMetrics",
                        value: `[${datos.id}](https://www.battlemetrics.com/players/${encodeURIComponent(String(datos.id))})`,
                        inline: true
                    },
                    {
                        name: "🆔 Steam ID",
                        value: `[${steamId}](https://steamcommunity.com/profiles/${steamId})`,
                        inline: true
                    },
                    {
                        name: "🎮 Estado",
                        value: limitarTexto(estadoActual, 100),
                        inline: true
                    },
                    {
                        name: "📈 Horas Rust (BM)",
                        value: limitarTexto(horasBMTexto, 100),
                        inline: true
                    },
                    {
                        name: "📊 Horas Rust (Steam)",
                        value: limitarTexto(horasSteamTexto, 100),
                        inline: true
                    },
                    {
                        name: "⚖️ Diferencia BM / Steam",
                        value: diferenciaTexto,
                        inline: true
                    },
                    {
                        name: "🖥️ Servidores Rust con horas",
                        value: `\`${Number(datos.cantidadServidoresRust) || topServidores.length}\``,
                        inline: true
                    },
                    {
                        name: "📈 Esta semana",
                        value: limitarTexto(horasSemana, 100),
                        inline: true
                    },
                    {
                        name: "📆 Este mes",
                        value: limitarTexto(horasMes, 100),
                        inline: true
                    },
                    {
                        name: "🕐 Última actividad registrada",
                        value: limitarTexto(ultimaConexion, 100),
                        inline: true
                    },
                    {
                        name: "🌍 País",
                        value: limitarTexto(paisTexto, 100),
                        inline: true
                    },
                    {
                        name: "🛡️ Estado de baneos",
                        value: limitarTexto(vacTexto, 100),
                        inline: true
                    },
                    {
                        name: "📅 Antigüedad de Steam",
                        value: limitarTexto(creacionSteamTexto, 100),
                        inline: true
                    },
                    {
                        name: "📝 Historial de nombres",
                        value: limitarTexto(
                            Array.isArray(datos.historialNombres) &&
                            datos.historialNombres.length > 0
                                ? datos.historialNombres.slice(0, 3).join(", ")
                                : "No disponible",
                            1000
                        ),
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({
                    text: "RustLogix"
                });

            const avatar =
                perfilSteam.avatarfull || perfilSteam.avatar;

            if (avatar) {
                embed.setThumbnail(avatar);
            }

            return interaction.editReply({
                embeds: [embed]
            });
        } catch (error) {
            console.error(
                "❌ ERROR EJECUTANDO /horas:",
                error.stack || error.message
            );

            const mensaje =
                "❌ Ocurrió un error al consultar las horas. Revisa los logs de RustLogix para ver el error exacto.";

            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({
                    content: mensaje,
                    embeds: []
                }).catch(() => null);
            }

            return interaction.reply({
                content: mensaje,
                ephemeral: true
            }).catch(() => null);
        }
    }
};