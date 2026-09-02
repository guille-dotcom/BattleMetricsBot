const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require("discord.js");

const axios = require("axios");

const ServerConfig = require("../models/ServerConfig");
const Vigilado = require("../models/Vigilado");

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = "https://api.battlemetrics.com";

const REQUEST_TIMEOUT = 30000;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    const headers = {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json"
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
}

// =====================================================
// EXTRAER ID DE BATTLEMETRICS
// =====================================================

function extraerBattleMetricsId(valor) {
    if (!valor) {
        return null;
    }

    const texto = String(valor).trim();

    // ID directo
    if (/^\d+$/.test(texto)) {
        return texto;
    }

    // URL:
    // https://www.battlemetrics.com/players/1201726097
    // https://battlemetrics.com/players/1201726097
    const match = texto.match(
        /battlemetrics\.com\/players\/(\d+)/i
    );

    if (match) {
        return match[1];
    }

    return null;
}

// =====================================================
// OBTENER ID DE SERVIDOR DESDE UN RECURSO
// =====================================================

function obtenerServerId(recurso) {
    if (!recurso) {
        return null;
    }

    // Caso 1:
    // relationships.server.data.id
    const serverRelationship =
        recurso?.relationships?.server?.data?.id;

    if (serverRelationship) {
        return String(serverRelationship);
    }

    // Caso 2:
    // relationships.servers.data[]
    const serversRelationship =
        recurso?.relationships?.servers?.data;

    if (Array.isArray(serversRelationship)) {
        for (const server of serversRelationship) {
            if (server?.id) {
                return String(server.id);
            }
        }
    }

    // Caso 3:
    // attributes.serverId
    const serverAttribute =
        recurso?.attributes?.serverId;

    if (serverAttribute) {
        return String(serverAttribute);
    }

    return null;
}

// =====================================================
// OBTENER TODOS LOS SERVER IDS DE UN RECURSO
// =====================================================

function obtenerTodosLosServerIds(recurso) {
    const ids = new Set();

    if (!recurso) {
        return ids;
    }

    // relationships.server
    const server =
        recurso?.relationships?.server?.data;

    if (server?.id) {
        ids.add(String(server.id));
    }

    // relationships.servers
    const servers =
        recurso?.relationships?.servers?.data;

    if (Array.isArray(servers)) {
        for (const item of servers) {
            if (item?.id) {
                ids.add(String(item.id));
            }
        }
    }

    // attributes.serverId
    if (recurso?.attributes?.serverId) {
        ids.add(
            String(recurso.attributes.serverId)
        );
    }

    return ids;
}

// =====================================================
// OBTENER NOMBRE DEL SERVIDOR
// =====================================================

function obtenerNombreServidor(recurso) {
    return (
        recurso?.attributes?.name ||
        recurso?.attributes?.serverName ||
        "Servidor desconocido"
    );
}

// =====================================================
// DETECTAR SI UNA SESIÓN ESTÁ ACTIVA
// =====================================================

function sesionEstaActiva(session) {
    const attributes = session?.attributes || {};

    // BattleMetrics normalmente utiliza stop para
    // indicar cuándo terminó una sesión.
    if (
        attributes.stop === null ||
        attributes.stop === undefined ||
        attributes.stop === ""
    ) {
        return true;
    }

    // Algunos recursos pueden indicar online.
    if (
        attributes.online === true ||
        attributes.online === "true"
    ) {
        return true;
    }

    return false;
}

// =====================================================
// OBTENER DATOS DEL PLAYER
// =====================================================

async function obtenerPlayer(playerId) {
    console.log(
        `   👤 Consultando perfil BM ${playerId}`
    );

    const response = await axios.get(
        `${BM_API}/players/${encodeURIComponent(playerId)}`,
        {
            headers: getHeaders(),
            timeout: REQUEST_TIMEOUT,
            params: {
                include: "server"
            }
        }
    );

    return response.data;
}

// =====================================================
// OBTENER SESIONES DEL PLAYER
// =====================================================

async function obtenerSesionesPlayer(playerId) {
    console.log(
        `   📡 Consultando sesiones del jugador ${playerId}`
    );

    /*
     * BattleMetrics expone el historial de sesiones
     * mediante el recurso /sessions.
     *
     * No utilizamos page[number], que era precisamente
     * lo que estaba provocando el HTTP 400 del código
     * anterior.
     */

    const response = await axios.get(
        `${BM_API}/sessions`,
        {
            headers: getHeaders(),
            timeout: REQUEST_TIMEOUT,
            params: {
                "filter[players]": playerId,
                "page[size]": 100
            }
        }
    );

    return response.data;
}

// =====================================================
// COMPROBAR PLAYER EN SERVIDOR
// =====================================================

async function comprobarJugadorEnServidor(
    playerId,
    servidorObjetivo
) {
    const resultado = {
        encontrado: false,
        online: false,
        sesiones: [],
        motivo: null
    };

    // =================================================
    // 1. OBTENER PERFIL
    // =================================================

    let playerResponse;

    try {
        playerResponse =
            await obtenerPlayer(playerId);
    } catch (error) {
        if (error.response?.status === 404) {
            resultado.motivo =
                "Perfil BattleMetrics no encontrado";

            return resultado;
        }

        throw error;
    }

    const player =
        playerResponse?.data || null;

    if (!player) {
        resultado.motivo =
            "BattleMetrics no devolvió el perfil";

        return resultado;
    }

    console.log(
        `   ✅ Perfil encontrado: ${player.id}`
    );

    if (player.attributes?.name) {
        console.log(
            `   🏷️ Nombre BM: ${player.attributes.name}`
        );
    }

    // =================================================
    // 2. COMPROBAR RELACIONES DIRECTAS
    // =================================================

    const serverIds =
        obtenerTodosLosServerIds(player);

    if (serverIds.size > 0) {
        console.log(
            `   🎮 Servers asociados al perfil: ${Array.from(serverIds).join(", ")}`
        );
    } else {
        console.log(
            "   ℹ️ El perfil no trae serverId directo."
        );
    }

    // =================================================
    // 3. OBTENER SESIONES
    // =================================================

    let sessionsResponse;

    try {
        sessionsResponse =
            await obtenerSesionesPlayer(playerId);
    } catch (error) {
        /*
         * Si BattleMetrics no permite consultar sesiones
         * con el filtro actual, no damos un falso positivo.
         *
         * El perfil por sí solo NO demuestra que esté
         * actualmente conectado al servidor.
         */

        console.error(
            `   ❌ Error consultando sesiones de ${playerId}`
        );

        if (error.response) {
            console.error(
                `   HTTP: ${error.response.status}`
            );

            console.error(
                "   Respuesta:",
                error.response.data
            );
        }

        resultado.motivo =
            "No fue posible consultar las sesiones del jugador";

        return resultado;
    }

    const sesiones =
        sessionsResponse?.data || [];

    console.log(
        `   📊 Sesiones recibidas: ${sesiones.length}`
    );

    // =================================================
    // 4. REVISAR SESIONES
    // =================================================

    for (const session of sesiones) {
        if (!session) {
            continue;
        }

        const sessionServerIds =
            obtenerTodosLosServerIds(session);

        // =================================================
        // INCLUIDOS / RELATIONSHIPS
        // =================================================

        let coincideServidor = false;

        for (const id of sessionServerIds) {
            if (id === String(servidorObjetivo)) {
                coincideServidor = true;
                break;
            }
        }

        // =================================================
        // BUSCAR SERVER EN ATTRIBUTES
        // =================================================

        if (!coincideServidor) {
            const sessionServerId =
                obtenerServerId(session);

            if (
                sessionServerId ===
                String(servidorObjetivo)
            ) {
                coincideServidor = true;
            }
        }

        if (!coincideServidor) {
            continue;
        }

        // =================================================
        // SERVIDOR CORRECTO
        // =================================================

        resultado.encontrado = true;

        const activa =
            sesionEstaActiva(session);

        const inicio =
            session?.attributes?.start || null;

        const stop =
            session?.attributes?.stop || null;

        resultado.sesiones.push({
            session,
            activa,
            inicio,
            stop
        });

        console.log(
            `   🎮 Sesión encontrada en servidor ${servidorObjetivo}`
        );

        console.log(
            `   📅 Inicio: ${inicio || "desconocido"}`
        );

        console.log(
            `   📅 Fin: ${stop || "sesión activa"}`
        );

        if (activa) {
            resultado.online = true;

            console.log(
                `   🚨 ONLINE CONFIRMADO en ${servidorObjetivo}`
            );

            // Ya tenemos lo que necesitamos.
            break;
        }
    }

    // =================================================
    // 5. RESULTADO FINAL
    // =================================================

    if (!resultado.encontrado) {
        resultado.motivo =
            "No existe una sesión registrada en el servidor objetivo";

        console.log(
            `   💤 No se encontró sesión en ${servidorObjetivo}`
        );
    } else if (!resultado.online) {
        resultado.motivo =
            "El jugador tiene historial en el servidor, pero no hay una sesión activa";

        console.log(
            `   💤 Tiene historial en ${servidorObjetivo}, pero está offline`
        );
    }

    return resultado;
}

// =====================================================
// FORMATEAR DURACIÓN
// =====================================================

function formatearDuracion(inicio, fin = null) {
    if (!inicio) {
        return null;
    }

    const fechaInicio =
        new Date(inicio);

    const fechaFin =
        fin
            ? new Date(fin)
            : new Date();

    if (
        Number.isNaN(
            fechaInicio.getTime()
        ) ||
        Number.isNaN(
            fechaFin.getTime()
        )
    ) {
        return null;
    }

    let segundos = Math.floor(
        (
            fechaFin.getTime() -
            fechaInicio.getTime()
        ) / 1000
    );

    if (segundos < 0) {
        segundos = 0;
    }

    const horas =
        Math.floor(segundos / 3600);

    const minutos =
        Math.floor(
            (segundos % 3600) / 60
        );

    if (horas > 0) {
        return `${horas}h ${minutos}m`;
    }

    return `${minutos}m`;
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName("revisar")
        .setDescription(
            "Revisa si hay algún perfil vigilado conectado en el servidor actual"
        ),

    async execute(interaction) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        const guildId =
            interaction.guild.id;

        const inicio =
            Date.now();

        try {
            console.log(
                "=============================================="
            );

            console.log(
                "🎯 Ejecutando /revisar"
            );

            console.log(
                `🏠 Guild ID: ${guildId}`
            );

            // =================================================
            // 1. SERVIDOR CONFIGURADO
            // =================================================

            const configServer =
                await ServerConfig.findOne({
                    guildId
                });

            const bmServerId =
                configServer?.battleMetricsServerId ||
                configServer?.battlemetricsServerId ||
                configServer?.serverId;

            if (
                !configServer ||
                !bmServerId
            ) {
                return interaction.editReply({
                    content:
                        "❌ No hay ningún servidor de Rust configurado. Usa `/configurar-servidor` primero."
                });
            }

            const servidorObjetivo =
                String(bmServerId).trim();

            console.log(
                `🎮 BattleMetrics Server ID: ${servidorObjetivo}`
            );

            // =================================================
            // 2. PERFILES VIGILADOS
            // =================================================

            const vigilados =
                await Vigilado.find({
                    guildId
                });

            if (
                vigilados.length === 0
            ) {
                return interaction.editReply({
                    content:
                        "⚠️ No tienes ningún perfil guardado para vigilar. Usa `/vigilar` para añadir algunos."
                });
            }

            console.log(
                `👁️ Perfiles vigilados encontrados: ${vigilados.length}`
            );

            // =================================================
            // 3. NORMALIZAR IDS
            // =================================================

            const perfiles = [];

            for (const vigilado of vigilados) {
                const battlemetricsId =
                    extraerBattleMetricsId(
                        vigilado.battlemetricsId
                    );

                console.log(
                    `[DEBUG /revisar] ${vigilado.alias}`
                );

                console.log(
                    `   Guardado en BD: ${vigilado.battlemetricsId}`
                );

                console.log(
                    `   ID BM detectado: ${battlemetricsId}`
                );

                if (!battlemetricsId) {
                    console.warn(
                        `⚠️ ID BattleMetrics inválido para ${vigilado.alias}`
                    );

                    continue;
                }

                perfiles.push({
                    alias:
                        vigilado.alias,

                    battlemetricsId
                });
            }

            if (
                perfiles.length === 0
            ) {
                return interaction.editReply({
                    content:
                        "❌ Ninguno de los perfiles vigilados tiene un ID válido de BattleMetrics."
                });
            }

            console.log(
                "[DEBUG /revisar] IDs que se comprobarán:",
                perfiles.map(
                    perfil =>
                        perfil.battlemetricsId
                )
            );

            // =================================================
            // 4. COMPROBAR CADA PERFIL
            // =================================================

            const resultados =
                [];

            const inicioBM =
                Date.now();

            for (const perfil of perfiles) {
                console.log(
                    "----------------------------------------------"
                );

                console.log(
                    `[DEBUG /revisar] Comprobando ${perfil.alias}`
                );

                console.log(
                    `   ID BM: ${perfil.battlemetricsId}`
                );

                const resultado =
                    await comprobarJugadorEnServidor(
                        perfil.battlemetricsId,
                        servidorObjetivo
                    );

                resultados.push({
                    ...perfil,
                    ...resultado
                });
            }

            const tiempoBM =
                Date.now() -
                inicioBM;

            // =================================================
            // 5. SEPARAR RESULTADOS
            // =================================================

            const encontradosOnline =
                resultados.filter(
                    resultado =>
                        resultado.online === true
                );

            const historialServidor =
                resultados.filter(
                    resultado =>
                        resultado.encontrado === true &&
                        resultado.online === false
                );

            const fuera =
                resultados.filter(
                    resultado =>
                        resultado.encontrado === false
                );

            // =================================================
            // 6. LOG FINAL
            // =================================================

            console.log(
                "=============================================="
            );

            console.log(
                `🎮 Servidor objetivo: ${servidorObjetivo}`
            );

            console.log(
                `👁️ Perfiles comprobados: ${resultados.length}`
            );

            console.log(
                `🚨 Online confirmado: ${encontradosOnline.length}`
            );

            console.log(
                `💤 Historial pero offline: ${historialServidor.length}`
            );

            console.log(
                `❓ Sin sesión en servidor: ${fuera.length}`
            );

            console.log(
                `⏱️ Tiempo BM: ${tiempoBM} ms`
            );

            console.log(
                "=============================================="
            );

            // =================================================
            // 7. CREAR EMBED
            // =================================================

            const embed =
                new EmbedBuilder()
                    .setColor(
                        encontradosOnline.length > 0
                            ? 0xE74C3C
                            : 0x2ECC71
                    )
                    .setTitle(
                        "🔍 Resultado de la Revisión"
                    )
                    .setDescription(
                        `Servidor BattleMetrics: \`${servidorObjetivo}\``
                    )
                    .setTimestamp();

            // =================================================
            // ONLINE
            // =================================================

            if (
                encontradosOnline.length > 0
            ) {
                const textoOnline =
                    encontradosOnline
                        .map(perfil => {
                            const sesionActiva =
                                perfil.sesiones?.find(
                                    sesion =>
                                        sesion.activa
                                );

                            const duracion =
                                sesionActiva
                                    ? formatearDuracion(
                                          sesionActiva.inicio
                                      )
                                    : null;

                            return (
                                `• **${perfil.alias}**` +
                                (
                                    duracion
                                        ? ` — Jugando: **${duracion}**`
                                        : ""
                                )
                            );
                        })
                        .join("\n");

                embed.addFields({
                    name:
                        "🚨 ¡Detectados Online!",
                    value:
                        textoOnline,
                    inline: false
                });
            } else {
                embed.addFields({
                    name:
                        "🟢 Estado",
                    value:
                        "Ningún perfil vigilado se encuentra online en este servidor.",
                    inline: false
                });
            }

            // =================================================
            // HISTORIAL / OFFLINE
            // =================================================

            if (
                historialServidor.length > 0
            ) {
                embed.addFields({
                    name:
                        "💤 Historial en el servidor",
                    value:
                        historialServidor
                            .map(
                                perfil =>
                                    `• ${perfil.alias} — Offline`
                            )
                            .join("\n"),
                    inline: false
                });
            }

            // =================================================
            // SIN SESIÓN
            // =================================================

            if (
                fuera.length > 0
            ) {
                embed.addFields({
                    name:
                        "ℹ️ Sin sesión en este servidor",
                    value:
                        fuera
                            .map(
                                perfil =>
                                    `• ${perfil.alias}`
                            )
                            .join("\n"),
                    inline: false
                });
            }

            // =================================================
            // INFORMACIÓN DE LA CONSULTA
            // =================================================

            embed.addFields({
                name:
                    "📡 BattleMetrics",
                value:
                    `Perfiles comprobados: **${resultados.length}**\n` +
                    `Online confirmado: **${encontradosOnline.length}**\n` +
                    `Tiempo de respuesta: **${tiempoBM} ms**`,
                inline: false
            });

            // =================================================
            // RESPONDER
            // =================================================

            await interaction.editReply({
                embeds: [embed]
            });

            const tiempoTotal =
                Date.now() -
                inicio;

            console.log(
                `✅ /revisar terminado correctamente en ${tiempoTotal} ms`
            );

            console.log(
                "=============================================="
            );
        } catch (error) {
            const tiempoTotal =
                Date.now() -
                inicio;

            console.error(
                "=============================================="
            );

            console.error(
                "❌ ERROR EN /REVISAR"
            );

            console.error(
                `⏱️ Tiempo: ${tiempoTotal} ms`
            );

            console.error(
                `Código: ${error.code || "N/A"}`
            );

            console.error(
                `Mensaje: ${error.message || "Sin mensaje"}`
            );

            if (error.response) {
                console.error(
                    `HTTP BattleMetrics: ${error.response.status}`
                );

                console.error(
                    "Respuesta:",
                    error.response.data
                );
            }

            console.error(
                "=============================================="
            );

            await interaction.editReply({
                content:
                    "❌ Ocurrió un error al procesar la revisión de perfiles en BattleMetrics. Revisa la consola del bot para ver el motivo exacto."
            });
        }
    }
};