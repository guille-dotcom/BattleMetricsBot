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


module.exports = {

    data:

        new SlashCommandBuilder()

            .setName("horas")

            .setDescription(
                "Obtiene las horas de BattleMetrics buscando al usuario de Steam en el servidor"
            )

            .addStringOption(
                option =>
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
                    guildId:
                        interaction.guild.id
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
                await getSteamProfile(
                    steamId
                );


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
        //
        // SIEMPRE EN EL SERVIDOR CONFIGURADO
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
                        `⚠️ El jugador **no está online** en el servidor configurado o BattleMetrics no respondió a tiempo.`
                    )

                    .addFields(

                        {
                            name:
                                "🆔 Steam ID",

                            value:
                                `[${steamId}](https://steamcommunity.com/profiles/${steamId})`,

                            inline: true
                        },

                        {
                            name:
                                "📊 Horas Steam",

                            value:
                                horasSteamTexto,

                            inline: true
                        },

                        {
                            name:
                                "🖥️ Estado",

                            value:
                                "`🔴 Desconocido / Offline`",

                            inline: true
                        },

                        {
                            name:
                                "🌍 País",

                            value:
                                paisTexto,

                            inline: true
                        },

                        {
                            name:
                                "🛡️ Baneos",

                            value:
                                `\`${vacTexto}\``,

                            inline: true
                        },

                        {
                            name:
                                "📅 Antigüedad",

                            value:
                                `\`${creacionSteamTexto}\``,

                            inline: true
                        }

                    )

                    .setTimestamp()

                    .setFooter({
                        text:
                            "RustLogix"
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
                embeds: [
                    embedOffline
                ]
            });
        }


        // =====================================================
        // DATOS DETALLADOS BATTLEMETRICS
        //
        // IMPORTANTE:
        // PASAMOS EL SERVIDOR CONFIGURADO.
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
        // DIFERENCIA STEAM / BATTLEMETRICS
        // =====================================================

        const horasBMNum =
            parseFloat(
                datosFinales.horasTotalesBM
            ) || 0;


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
                : 0;


        const horasMes =
            datosFinales.horasMes !== undefined
                ? datosFinales.horasMes
                : 0;


        const ultimaConexion =
            datosFinales.ultimaConexion ||
            "Nunca";


        // =====================================================
        // ESTADO ACTUAL
        // =====================================================

        const estadoActual =
            datosFinales.online

                ? `🟢 Jugando · ${datosFinales.jugando}`

                : "🔴 Offline";


        // =====================================================
        // SERVIDOR ACTUAL
        //
        // SOLO EL SERVIDOR CONFIGURADO
        // =====================================================

        let servidorActualTexto =
            "`🔴 No está jugando en el servidor configurado`";


        if (
            datosFinales.online &&
            datosFinales.servidorActualRust
        ) {

            const servidorActual =
                datosFinales.servidorActualRust;


            // -------------------------------------------------
            // SEGURIDAD:
            // COMPROBAR QUE EL ID ES EXACTAMENTE
            // EL SERVIDOR CONFIGURADO.
            // -------------------------------------------------

            if (
                String(
                    servidorActual.id
                ) ===
                String(
                    serverId
                )
            ) {

                // ---------------------------------------------
                // BUSCAR HORAS HISTÓRICAS POR ID
                //
                // NUNCA POR NOMBRE.
                // ---------------------------------------------

                const servidorHistorico =
                    datosFinales.topServidoresRust &&
                    datosFinales.topServidoresRust.find(
                        servidor =>
                            String(
                                servidor.id
                            ) ===
                            String(
                                serverId
                            )
                    );


                const horasServidorActual =
                    servidorHistorico &&
                    servidorHistorico.tiempo
                        ? servidorHistorico.tiempo
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
                    .map(
                        (servidor, index) => {

                            return (
                                `**${index + 1}.** ` +
                                `[${servidor.nombre}](https://www.battlemetrics.com/servers/${servidor.id})` +
                                ` — \`${servidor.tiempo}\``
                            );
                        }
                    )
                    .join("\n");
        }


        // =====================================================
        // EMBED
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

                .addFields(

                    // -----------------------------------------
                    // SERVIDOR ACTUAL RUST
                    // -----------------------------------------

                    {
                        name:
                            "🎮 Servidor actual",

                        value:
                            servidorActualTexto,

                        inline: false
                    },


                    // -----------------------------------------
                    // TOP 10 SERVIDORES RUST
                    // -----------------------------------------

                    {
                        name:
                            "🏆 Top 10 servidores de Rust",

                        value:
                            topRustTexto,

                        inline: false
                    },


                    // -----------------------------------------
                    // IDENTIFICADORES
                    // -----------------------------------------

                    {
                        name:
                            "🆔 BattleMetrics",

                        value:
                            `[${datosFinales.id}](https://www.battlemetrics.com/players/${datosFinales.id})`,

                        inline: true
                    },

                    {
                        name:
                            "🆔 Steam ID",

                        value:
                            `[${steamId}](https://steamcommunity.com/profiles/${steamId})`,

                        inline: true
                    },


                    // -----------------------------------------
                    // ESTADO
                    // -----------------------------------------

                    {
                        name:
                            "🎮 Estado",

                        value:
                            `\`${estadoActual}\``,

                        inline: true
                    },


                    // -----------------------------------------
                    // HORAS
                    // -----------------------------------------

                    {
                        name:
                            "📈 Horas (BM)",

                        value:
                            `\`${datosFinales.horasTotalesBM}h\``,

                        inline: true
                    },

                    {
                        name:
                            "📊 Horas (Steam)",

                        value:
                            horasSteamTexto,

                        inline: true
                    },

                    {
                        name:
                            "⚖️ Diferencia",

                        value:
                            diferenciaTexto,

                        inline: true
                    },


                    // -----------------------------------------
                    // ACTIVIDAD
                    // -----------------------------------------

                    {
                        name:
                            "📈 Esta Semana",

                        value:
                            `\`${horasSemana}h\``,

                        inline: true
                    },

                    {
                        name:
                            "📆 Este Mes",

                        value:
                            `\`${horasMes}h\``,

                        inline: true
                    },

                    {
                        name:
                            "🕐 Última Conexión",

                        value:
                            `\`${ultimaConexion}\``,

                        inline: true
                    },


                    // -----------------------------------------
                    // STEAM
                    // -----------------------------------------

                    {
                        name:
                            "🌍 País",

                        value:
                            paisTexto,

                        inline: true
                    },

                    {
                        name:
                            "🛡️ Estado Baneos",

                        value:
                            `\`${vacTexto}\``,

                        inline: true
                    },

                    {
                        name:
                            "📅 Antigüedad",

                        value:
                            `\`${creacionSteamTexto}\``,

                        inline: true
                    },


                    // -----------------------------------------
                    // HISTORIAL
                    // -----------------------------------------

                    {
                        name:
                            "📝 Historial de Nombres",

                        value:
                            historialTexto,

                        inline: false
                    }

                )

                .setTimestamp()

                .setFooter({
                    text:
                        "RustLogix"
                });


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
            embeds: [
                embedOnline
            ]
        });
    }
};