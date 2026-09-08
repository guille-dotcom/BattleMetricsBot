const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { google } = require("googleapis");

const ServerConfig = require("../models/ServerConfig");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";
const BM_TOKEN = process.env.BATTLEMETRICS_TOKEN;

// =====================================================
// COMANDO
// =====================================================

module.exports = {

    data: new SlashCommandBuilder()
        .setName("planilla")
        .setDescription(
            "Revisa la planilla y muestra quién está actualmente en el servidor"
        ),

    // =================================================
    // EJECUTAR COMANDO
    // =================================================

    async execute(interaction) {

        console.log("");
        console.log("==============================================");
        console.log("🎯 EJECUTANDO /PLANILLA");
        console.log("==============================================");
        console.log("");

        await interaction.deferReply();

        try {

            const resultado =
                await module.exports.revisarPlanilla(
                    interaction.guild.id
                );

            // ==========================================
            // PLANILLA VACÍA
            // ==========================================

            if (resultado.sinDatos) {

                return interaction.editReply(
                    "❌ **La planilla está vacía.**"
                );
            }

            // ==========================================
            // NO HAY JUGADORES VÁLIDOS
            // ==========================================

            if (resultado.sinJugadores) {

                return interaction.editReply(
                    "❌ **No encontré jugadores válidos en la planilla.**"
                );
            }

            // ==========================================
            // NADIE ESTÁ EN EL SERVIDOR
            // ==========================================

            if (!resultado.encontrados.length) {

                const embed =
                    module.exports.crearEmbedSinJugadores(
                        resultado
                    );

                return interaction.editReply({
                    embeds: [embed]
                });
            }

            // ==========================================
            // JUGADORES ENCONTRADOS
            // ==========================================

            const embeds =
                module.exports.crearEmbedsJugadores(
                    resultado.encontrados,
                    resultado.serverId
                );

            return interaction.editReply({
                embeds
            });

        } catch (error) {

            console.error("");
            console.error("==============================================");
            console.error("❌ [PLANILLA] ERROR");
            console.error("==============================================");
            console.error(error);
            console.error("");

            return interaction.editReply(
                "❌ **Ocurrió un error revisando la planilla.**\n\n" +
                `\`${error.message || "Error desconocido"}\``
            );
        }
    },

    // =================================================
    // REVISAR PLANILLA
    // =================================================

    async revisarPlanilla(guildId) {

        console.log("");
        console.log("==============================================");
        console.log(
            `[PLANILLA] INICIANDO REVISIÓN | Guild: ${guildId}`
        );
        console.log("==============================================");
        console.log("");

        // ==========================================
        // COMPROBAR TOKEN
        // ==========================================

        if (!BM_TOKEN) {

            throw new Error(
                "No existe la variable BATTLEMETRICS_TOKEN en las variables de entorno."
            );
        }

        // ==========================================
        // OBTENER CONFIGURACIÓN DEL SERVIDOR
        // ==========================================

        const config =
            await ServerConfig.findOne({
                guildId
            });

        if (!config) {

            throw new Error(
                "Este servidor no tiene configuración guardada."
            );
        }

        if (!config.sheetId) {

            throw new Error(
                "Este servidor no tiene configurada la planilla."
            );
        }

        if (!config.battleMetricsServerId) {

            throw new Error(
                "Este servidor no tiene configurado el ID de BattleMetrics."
            );
        }

        const serverId =
            String(
                config.battleMetricsServerId
            ).trim();

        console.log(
            `[PLANILLA] Server ID configurado: ${serverId}`
        );

        // ==========================================
        // LEER GOOGLE SHEETS
        // ==========================================

        const rows =
            await obtenerFilasPlanilla(
                config.sheetId
            );

        console.log(
            `[PLANILLA] Filas recibidas: ${rows.length}`
        );

        if (!rows.length) {

            return {
                sinDatos: true,
                sinJugadores: false,
                encontrados: [],
                serverId
            };
        }

        // ==========================================
        // PROCESAR JUGADORES
        // ==========================================

        const jugadores =
            [];

        for (let i = 0; i < rows.length; i++) {

            const fila =
                rows[i] || [];

            const battlemetricsUrl =
                String(
                    fila[0] || ""
                ).trim();

            const motivo =
                String(
                    fila[1] || ""
                ).trim();

            const streamMode =
                String(
                    fila[2] || ""
                ).trim();

            const steamUrl =
                String(
                    fila[3] || ""
                ).trim();

            if (!battlemetricsUrl) {
                continue;
            }

            const playerId =
                extraerBattleMetricsPlayerId(
                    battlemetricsUrl
                );

            if (!playerId) {

                console.log(
                    `[PLANILLA] Fila ${i + 1}: ID BattleMetrics inválido`
                );

                continue;
            }

            jugadores.push({

                rowNumber: i + 1,

                playerId,

                battlemetricsUrl:
                    normalizarBattleMetricsUrl(
                        battlemetricsUrl,
                        playerId
                    ),

                steamUrl:
                    normalizarSteamUrl(
                        steamUrl
                    ),

                motivo,

                streamMode

            });
        }

        console.log(
            `[PLANILLA] Jugadores válidos: ${jugadores.length}`
        );

        if (!jugadores.length) {

            return {
                sinDatos: false,
                sinJugadores: true,
                encontrados: [],
                serverId
            };
        }

        // ==========================================
        // CONSULTAR BATTLEMETRICS
        // ==========================================

        console.log("");
        console.log(
            `[PLANILLA] Consultando servidor BattleMetrics ${serverId}...`
        );

        const jugadoresOnline =
            await obtenerJugadoresServidor(
                serverId
            );

        console.log(
            `[PLANILLA] Jugadores detectados actualmente en el servidor: ${jugadoresOnline.length}`
        );

        // ==========================================
        // CREAR MAPA DE JUGADORES ONLINE
        // ==========================================

        const onlineMap =
            new Map();

        for (const jugador of jugadoresOnline) {

            const id =
                String(
                    jugador.id || ""
                ).trim();

            if (!id) {
                continue;
            }

            onlineMap.set(
                id,
                jugador
            );
        }

        // ==========================================
        // COMPARAR PLANILLA VS ONLINE
        // ==========================================

        const encontrados =
            [];

        for (const jugador of jugadores) {

            const online =
                onlineMap.get(
                    jugador.playerId
                );

            if (!online) {

                console.log(
                    `[PLANILLA] ❌ NO ONLINE: ${jugador.playerId}`
                );

                continue;
            }

            console.log(
                `[PLANILLA] 🟢 ENCONTRADO: ${jugador.playerId}`
            );

            encontrados.push({

                ...jugador,

                nombre:
                    obtenerNombreJugador(
                        online
                    ),

                online: true

            });
        }

        console.log("");
        console.log(
            `[PLANILLA] RESULTADO FINAL: ${encontrados.length} jugador(es)`
        );
        console.log("");

        return {

            sinDatos: false,

            sinJugadores: false,

            encontrados,

            serverId,

            totalFilas:
                rows.length,

            totalJugadoresPlanilla:
                jugadores.length,

            totalJugadoresOnline:
                jugadoresOnline.length

        };
    },

    // =================================================
    // EMBED SIN JUGADORES
    // =================================================

    crearEmbedSinJugadores(resultado) {

        const embed =
            new EmbedBuilder()

                .setTitle(
                    "📋 Revisión de planilla"
                )

                .setDescription(
                    "No hay ningún jugador de la planilla actualmente en el servidor configurado."
                )

                .addFields(

                    {
                        name: "👥 Jugadores en planilla",
                        value:
                            String(
                                resultado.totalJugadoresPlanilla || 0
                            ),
                        inline: true
                    },

                    {
                        name: "🟢 Jugadores online",
                        value:
                            String(
                                resultado.totalJugadoresOnline || 0
                            ),
                        inline: true
                    },

                    {
                        name: "🖥️ Servidor",
                        value:
                            `[BattleMetrics](https://www.battlemetrics.com/servers/${resultado.serverId})`,
                        inline: true
                    }

                )

                .setColor(0xED4245)

                .setTimestamp();

        return embed;
    },

    // =================================================
    // CREAR EMBEDS JUGADORES
    // =================================================

    crearEmbedsJugadores(
        encontrados,
        serverId
    ) {

        const embeds =
            [];

        // Discord permite hasta 25 fields por embed.
        // Dejamos 5 jugadores por embed para mantenerlo limpio.

        const grupos =
            [];

        for (
            let i = 0;
            i < encontrados.length;
            i += 5
        ) {

            grupos.push(
                encontrados.slice(
                    i,
                    i + 5
                )
            );
        }

        for (const grupo of grupos) {

            const embed =
                new EmbedBuilder()

                    .setTitle(
                        "📋 Jugadores encontrados en la planilla"
                    )

                    .setDescription(
                        `Se encontraron **${encontrados.length}** jugador(es) actualmente en el servidor.`
                    )

                    .setColor(0x57F287)

                    .setTimestamp();

            for (const jugador of grupo) {

                const nombre =
                    jugador.nombre ||
                    `Player ${jugador.playerId}`;

                const steam =
                    jugador.steamUrl ||
                    "No configurado";

                const bm =
                    jugador.battlemetricsUrl ||
                    `https://www.battlemetrics.com/players/${jugador.playerId}`;

                const motivo =
                    jugador.motivo ||
                    "Sin motivo";

                const streamMode =
                    jugador.streamMode ||
                    "No especificado";

                embed.addFields({

                    name:
                        `🎯 ${nombre}`,

                    value:

                        `**Motivo:** ${motivo}\n` +

                        `**Stream Mode:** ${streamMode}\n` +

                        `**BattleMetrics:** [Abrir perfil](${bm})\n` +

                        `**Steam:** [Abrir perfil](${steam})`

                });
            }

            embed.setFooter({

                text:
                    `🟢 Actualmente online • Server ID: ${serverId}`

            });

            embeds.push(
                embed
            );
        }

        return embeds;
    }

};

// =====================================================
// GOOGLE SHEETS
// =====================================================

async function obtenerFilasPlanilla(
    spreadsheetId
) {

    const secretFilePath =
        "/etc/secrets/credentials.json";

    const localFilePath =
        path.join(
            __dirname,
            "../credentials.json"
        );

    let keyFile = null;

    if (
        fs.existsSync(
            secretFilePath
        )
    ) {

        keyFile =
            secretFilePath;

    } else if (
        fs.existsSync(
            localFilePath
        )
    ) {

        keyFile =
            localFilePath;

    } else {

        throw new Error(
            "No se encontró credentials.json para Google Sheets."
        );
    }

    console.log(
        `[PLANILLA] Usando credenciales Google: ${keyFile}`
    );

    const auth =
        new google.auth.GoogleAuth({

            keyFile,

            scopes: [
                "https://www.googleapis.com/auth/spreadsheets.readonly"
            ]

        });

    const sheets =
        google.sheets({

            version: "v4",

            auth

        });

    const response =
        await sheets.spreadsheets.values.get({

            spreadsheetId,

            range:
                "Hoja 1!A:D"

        });

    return (
        response.data.values ||
        []
    );
}

// =====================================================
// BATTLEMETRICS
// =====================================================

async function obtenerJugadoresServidor(
    serverId
) {

    const url =
        `${BM_API}/servers/${encodeURIComponent(serverId)}?include=player`;

    console.log(
        `[PLANILLA] GET ${url}`
    );

    try {

        const response =
            await axios.get(
                url,
                {

                    headers: {

                        Authorization:
                            `Bearer ${BM_TOKEN}`,

                        Accept:
                            "application/json"

                    },

                    timeout:
                        30000

                }
            );

        const data =
            response.data;

        if (
            !data ||
            !data.data
        ) {

            throw new Error(
                "BattleMetrics devolvió una respuesta sin datos del servidor."
            );
        }

        const server =
            data.data;

        console.log(
            `[PLANILLA] Servidor recibido: ${server.id}`
        );

        const incluidos =
            Array.isArray(
                data.included
            )
                ? data.included
                : [];

        const jugadores =
            incluidos.filter(
                recurso =>
                    recurso &&
                    recurso.type === "player"
            );

        console.log(
            `[PLANILLA] Included recibidos: ${incluidos.length}`
        );

        console.log(
            `[PLANILLA] Players encontrados en included: ${jugadores.length}`
        );

        return jugadores;

    } catch (error) {

        if (
            error.response
        ) {

            const status =
                error.response.status;

            let detalle =
                "";

            try {

                detalle =
                    JSON.stringify(
                        error.response.data
                    ).slice(
                        0,
                        1000
                    );

            } catch (_) {

                detalle =
                    String(
                        error.response.data || ""
                    );
            }

            if (
                status === 401 ||
                status === 403
            ) {

                throw new Error(
                    `BattleMetrics rechazó el token (${status}). Revisa que BATTLEMETRICS_TOKEN sea correcto y tenga permisos para consultar este servidor.`
                );
            }

            throw new Error(
                `BattleMetrics respondió HTTP ${status}. ${detalle}`
            );
        }

        throw error;
    }
}

// =====================================================
// EXTRAER ID BATTLEMETRICS
// =====================================================

function extraerBattleMetricsPlayerId(
    valor
) {

    if (!valor) {
        return null;
    }

    const texto =
        String(
            valor
        ).trim();

    // URL:
    // https://www.battlemetrics.com/players/1159140549

    const matchUrl =
        texto.match(
            /battlemetrics\.com\/players\/(\d+)/i
        );

    if (matchUrl) {

        return matchUrl[1];
    }

    // Si por alguna razón viene solamente el ID

    const matchId =
        texto.match(
            /^\d+$/
        );

    if (matchId) {

        return matchId[0];
    }

    return null;
}

// =====================================================
// NORMALIZAR BATTLEMETRICS
// =====================================================

function normalizarBattleMetricsUrl(
    valor,
    playerId
) {

    const texto =
        String(
            valor || ""
        ).trim();

    if (
        /^https?:\/\//i.test(
            texto
        )
    ) {

        return texto;
    }

    return (
        `https://www.battlemetrics.com/players/${playerId}`
    );
}

// =====================================================
// NORMALIZAR STEAM
// =====================================================

function normalizarSteamUrl(
    valor
) {

    const texto =
        String(
            valor || ""
        ).trim();

    if (!texto) {

        return "";
    }

    if (
        /^https?:\/\//i.test(
            texto
        )
    ) {

        return texto;
    }

    // Por seguridad, si alguien dejó solo el Steam64ID

    if (
        /^\d+$/.test(
            texto
        )
    ) {

        return (
            `https://steamcommunity.com/profiles/${texto}`
        );
    }

    return texto;
}

// =====================================================
// OBTENER NOMBRE
// =====================================================

function obtenerNombreJugador(
    jugador
) {

    if (
        !jugador
    ) {

        return "Jugador desconocido";
    }

    if (
        jugador.attributes &&
        jugador.attributes.name
    ) {

        return String(
            jugador.attributes.name
        );
    }

    if (
        jugador.attributes &&
        jugador.attributes.playerName
    ) {

        return String(
            jugador.attributes.playerName
        );
    }

    if (
        jugador.name
    ) {

        return String(
            jugador.name
        );
    }

    return (
        `Player ${jugador.id || "desconocido"}`
    );
}