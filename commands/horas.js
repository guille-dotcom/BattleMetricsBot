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

const ServerConfig =
    require("../models/ServerConfig");


// =====================================================
// DIVIDIR TEXTO PARA CAMPOS DE DISCORD
// Discord permite máximo 1024 caracteres por field.
// =====================================================

function dividirTextoDiscord(texto, maxCaracteres = 1024) {
    const partes = [];
    let actual = "";

    for (const linea of String(texto).split("\n")) {
        const candidato =
            actual.length > 0
                ? `${actual}\n${linea}`
                : linea;

        if (candidato.length > maxCaracteres) {
            if (actual.length > 0) {
                partes.push(actual);
            }

            if (linea.length > maxCaracteres) {
                let restante = linea;

                while (restante.length > maxCaracteres) {
                    partes.push(
                        restante.slice(0, maxCaracteres)
                    );

                    restante =
                        restante.slice(maxCaracteres);
                }

                actual = restante;
            } else {
                actual = linea;
            }
        } else {
            actual = candidato;
        }
    }

    if (actual.length > 0) {
        partes.push(actual);
    }

    return partes;
}


// =====================================================
// COMANDO /HORAS
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("horas")
        .setDescription(
            "Obtiene las horas de BattleMetrics buscando al usuario de Steam en el servidor"
        )
        .addStringOption(option =>
            option
                .setName("steamid")
                .setDescription(
                    "El SteamID del jugador (Ej: 76561198818187993)"
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const steamId =
            interaction.options
                .getString("steamid")
                .trim();

        let serverId = "433255";

        // =====================================================
        // OBTENER SERVIDOR CONFIGURADO
        // =====================================================

        try {
            const dbConfig =
                await ServerConfig.findOne({
                    guildId: interaction.guild.id
                });

            if (
                dbConfig &&
                dbConfig.battleMetricsServerId
            ) {
                serverId =
                    String(
                        dbConfig.battleMetricsServerId
                    );
            }

            console.log(
                `🎯 /horas | Servidor configurado: ${serverId}`
            );
        } catch (error) {
            console.log(
                "Error MongoDB:",
                error.message
            );
        }

        // =====================================================
        // STEAM
        // =====================================================

        let perfilSteam;

        try {
            perfilSteam =
                await getSteamProfile(steamId);
        } catch (err) {
            console.error(
                "Error API Steam:",
                err.message
            );

            return await interaction.editReply(
                "❌ Error al conectar con la API de Steam."
            );
        }

        if (
            !perfilSteam ||
            !perfilSteam.name
        ) {
            return await interaction.editReply(
                "❌ ID no encontrado en Steam."
            );
        }

        // =====================================================
        // DATOS STEAM
        // =====================================================

        const horasSteamNum =
            parseFloat(
                perfilSteam.rustHours
            ) || 0;

        const horasSteamTexto =
            horasSteamNum > 0
                ? `\`${horasSteamNum}h\``
                : "`🔒 Privado`";

        const paisTexto =
            perfilSteam.loccountrycode
                ? `:flag_${perfilSteam.loccountrycode.toLowerCase()}: (${perfilSteam.loccountrycode})`
                : "Desconocido";

        const creacionSteamTexto =
            perfilSteam.creationDate ||
            "No disponible";

        // =====================================================
        // BANEOS
        // =====================================================

        let vacTexto =
            "✅ Sin Baneos";

        if (
            perfilSteam.vacBanned &&
            perfilSteam.gameBansCount > 0
        ) {
            vacTexto =
                "⚠️ VAC & Game";
        } else if (
            perfilSteam.vacBanned
        ) {
            vacTexto =
                "⚠️ Baneo VAC";
        } else if (
            perfilSteam.gameBansCount > 0
        ) {
            vacTexto =
                `${perfilSteam.gameBansCount} Game Ban`;
        }

        // =====================================================
        // BUSCAR EN BATTLEMETRICS
        // =====================================================

        let jugadorBM = null;

        try {
            jugadorBM =
                await searchBattleMetricsPlayer(
                    perfilSteam.name,
                    serverId
                );
        } catch (err) {
            console.error(
                "Error buscando en BattleMetrics:",
                err.message
            );
        }

        // =====================================================
        // NOMBRE DUPLICADO
        // =====================================================

        if (
            jugadorBM &&
            jugadorBM.duplicate
        ) {
            return await interaction.editReply({
                content:
                    `⚠️ El nombre **${perfilSteam.name}** aparece más de una vez en el servidor.\n\n` +
                    `Usa **/horasbm** con el enlace de BattleMetrics del jugador para obtener sus datos exactos.`
            });
        }

        // =====================================================
        // NO ENCONTRADO
        // =====================================================

        if (!jugadorBM) {
            const embedOffline =
                new EmbedBuilder()
                    .setTitle(
                        `🔍 Resultado para: ${perfilSteam.name}`
                    )
                    .setColor("#FF0000")
                    .setDescription(
                        "⚠️ El jugador **no está online** en el servidor configurado o BattleMetrics no respondió a tiempo."
                    )
                    .addFields(
                        {
                            name: "🆔 Steam ID",
                            value:
                                `[${steamId}](https://steamcommunity.com/profiles/${steamId})`,
                            inline: true
                        },
                        {
                            name: "📊 Horas Steam",
                            value: horasSteamTexto,
                            inline: true
                        },
                        {
                            name: "🖥️ Estado",
                            value: "`🔴 Desconocido / Offline`",
                            inline: true
                        },
                        {
                            name: "🌍 País",
                            value: paisTexto,
                            inline: true
                        },
                        {
                            name: "🛡️ Baneos",
                            value: `\`${vacTexto}\``,
                            inline: true
                        },
                        {
                            name: "📅 Antigüedad",
                            value: `\`${creacionSteamTexto}\``,
                            inline: true
                        }
                    )
                    .setTimestamp()
                    .setFooter({
                        text: "RustLogix"
                    });

            if (
                perfilSteam.avatar ||
                perfilSteam.avatarfull
            ) {
                embedOffline.setThumbnail(
                    perfilSteam.avatarfull ||
                    perfilSteam.avatar
                );
            }

            return await interaction.editReply({
                embeds: [embedOffline]
            });
        }

        // =====================================================
        // DATOS DETALLADOS BATTLEMETRICS
        // =====================================================

        let datosFinales = null;

        try {
            datosFinales =
                await getBattleMetricsPlayerStatus(
                    jugadorBM.id,
                    serverId
                );
        } catch (err) {
            console.error(
                "Error obteniendo detalles BattleMetrics:",
                err.message
            );
        }

        if (!datosFinales) {
            return await interaction.editReply(
                "❌ Error al obtener datos detallados de BattleMetrics."
            );
        }

        // =====================================================
        // HORAS BATTLEMETRICS
        // =====================================================

        const horasBMTexto =
            datosFinales.totalHoras ||
            datosFinales.horasTotalesBM ||
            "0h";

        // Acepta, por ejemplo, "3876h 6m".
        const horasBMMatch =
            String(horasBMTexto).match(
                /(\d+)\s*h(?:\s*(\d+)\s*m)?/i
            );

        let horasBMNum = 0;

        if (horasBMMatch) {
            const horas =
                Number(horasBMMatch[1]) || 0;

            const minutos =
                Number(horasBMMatch[2]) || 0;

            horasBMNum =
                horas +
                (minutos / 60);
        }

        const diferenciaTexto =
            horasSteamNum > 0
                ? `\`${Math.abs(
                    horasSteamNum -
                    horasBMNum
                ).toFixed(0)}h\``
                : "`N/A`";

        // =====================================================
        // HISTORIAL DE NOMBRES
        // =====================================================

        const historialTexto =
            datosFinales.historialNombres &&
            datosFinales.historialNombres.length > 0
                ? datosFinales.historialNombres
                    .slice(0, 3)
                    .join(", ")
                : "No disponible";

        // =====================================================
        // ESTADÍSTICAS
        // =====================================================

        const horasSemana =
            datosFinales.horasSemana !== undefined
                ? datosFinales.horasSemana
                : "0h";

        const horasMes =
            datosFinales.horasMes !== undefined
                ? datosFinales.horasMes
                : "0h";

        const ultimaConexion =
            datosFinales.ultimaConexion ||
            "Nunca";

        const cantidadServidoresRust =
            Number(
                datosFinales.cantidadServidoresRust
            ) || 0;

        // =====================================================
        // ESTADO ACTUAL
        // Muestra la duración de la sesión, sin el servidor.
        // =====================================================

        let estadoActual = "🔴 Offline";

        if (datosFinales.online) {
            const tiempoSesion =
                datosFinales.tiempoSesionActual;

            estadoActual =
                tiempoSesion
                    ? `🟢 Jugando ${tiempoSesion}`
                    : "🟢 Jugando";
        }

        // =====================================================
        // SERVIDOR ACTUAL
        // =====================================================

        let servidorActualTexto =
            "`🔴 No está jugando en el servidor configurado`";

        if (
            datosFinales.online &&
            datosFinales.servidorActualRust
        ) {
            const servidorActual =
                datosFinales.servidorActualRust;

            if (
                String(servidorActual.id) ===
                String(serverId)
            ) {
                const horasServidorActual =
                    datosFinales.horasServidorConfigurado &&
                    datosFinales.horasServidorConfigurado.tiempo
                        ? datosFinales.horasServidorConfigurado.tiempo
                        : null;

                servidorActualTexto =
                    `[${servidorActual.nombre}](https://www.battlemetrics.com/servers/${serverId})` +
                    `\n⏱️ ${horasServidorActual || "Horas no disponibles"} en este servidor`;
            } else {
                console.log(
                    `⚠️ /horas | BM devolvió servidor ${servidorActual.id}, pero el configurado es ${serverId}`
                );

                servidorActualTexto =
                    "`🔴 El jugador no está en el servidor configurado`";
            }
        }

        // =====================================================
        // TOP 10 RUST
        // =====================================================

        let topRustTexto =
            "`No hay historial de servidores Rust disponible`";

        if (
            datosFinales.topServidoresRust &&
            datosFinales.topServidoresRust.length > 0
        ) {
            topRustTexto =
                datosFinales.topServidoresRust
                    .slice(0, 10)
                    .map((servidor, index) => {
                        return (
                            `**${index + 1}.** ` +
                            `[${servidor.nombre}](https://www.battlemetrics.com/servers/${servidor.id})` +
                            ` — \`${servidor.tiempo}\``
                        );
                    })
                    .join("\n");
        }

        // =====================================================
        // EMBED PRINCIPAL
        // =====================================================

        const embedOnline =
            new EmbedBuilder()
                .setTitle(
                    `🔍 Resultado para: ${perfilSteam.name}`
                )
                .setColor(
                    datosFinales.online
                        ? "#57F287"
                        : "#FF0000"
                )
                .addFields({
                    name: "🎮 Servidor actual",
                    value: servidorActualTexto,
                    inline: false
                });

        // =====================================================
        // TOP 10
        // =====================================================

        const partesTopRust =
            dividirTextoDiscord(
                topRustTexto,
                1024
            );

        partesTopRust.forEach((parte, index) => {
            embedOnline.addFields({
                name:
                    index === 0
                        ? "🏆 Top 10 servidores de Rust"
                        : "🏆 Top 10 servidores de Rust · continuación",
                value: parte,
                inline: false
            });
        });

        // =====================================================
        // RESTO DEL EMBED
        // =====================================================

        embedOnline.addFields(
            {
                name: "🆔 BattleMetrics",
                value:
                    `[${datosFinales.id}](https://www.battlemetrics.com/players/${datosFinales.id})`,
                inline: true
            },
            {
                name: "🆔 Steam ID",
                value:
                    `[${steamId}](https://steamcommunity.com/profiles/${steamId})`,
                inline: true
            },
            {
                name: "🎮 Estado",
                value: `\`${estadoActual}\``,
                inline: true
            },
            {
                name: "📈 Horas (BM)",
                value: `\`${horasBMTexto}\``,
                inline: true
            },
            {
                name: "📊 Horas (Steam)",
                value: horasSteamTexto,
                inline: true
            },
            {
                name: "⚖️ Diferencia",
                value: diferenciaTexto,
                inline: true
            },
            {
                name: "🖥️ Servidores Rust",
                value: `\`${cantidadServidoresRust}\``,
                inline: true
            },
            {
                name: "📈 Esta Semana",
                value: `\`${horasSemana}\``,
                inline: true
            },
            {
                name: "📆 Este Mes",
                value: `\`${horasMes}\``,
                inline: true
            },
            {
                name: "🕐 Última Conexión",
                value: `\`${ultimaConexion}\``,
                inline: true
            },
            {
                name: "🌍 País",
                value: paisTexto,
                inline: true
            },
            {
                name: "🛡️ Estado Baneos",
                value: `\`${vacTexto}\``,
                inline: true
            },
            {
                name: "📅 Antigüedad",
                value: `\`${creacionSteamTexto}\``,
                inline: true
            },
            {
                name: "📝 Historial de Nombres",
                value: historialTexto,
                inline: false
            }
        );

        // =====================================================
        // AVATAR
        // =====================================================

        if (
            perfilSteam.avatar ||
            perfilSteam.avatarfull
        ) {
            embedOnline.setThumbnail(
                perfilSteam.avatarfull ||
                perfilSteam.avatar
            );
        }

        // =====================================================
        // ENVIAR
        // =====================================================

        return await interaction.editReply({
            embeds: [embedOnline]
        });
    }
};