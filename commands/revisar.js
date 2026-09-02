const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

const axios = require('axios');

const ServerConfig = require('../models/ServerConfig');
const Vigilado = require('../models/Vigilado');

// =====================================================
// CONFIGURACION
// =====================================================

const BM_API = 'https://api.battlemetrics.com';

const REQUEST_TIMEOUT = 30000;

// 100 jugadores por pagina.
// Revisaremos como maximo 10 paginas = 1000 jugadores.
const MAX_PAGES = 10;

// =====================================================
// HEADERS BATTLEMETRICS
// =====================================================

function getHeaders() {
    const token = process.env.BATTLEMETRICS_TOKEN;

    if (token) {
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    return {
        'Content-Type': 'application/json'
    };
}

// =====================================================
// EXTRAER ID DE BATTLEMETRICS
// =====================================================

function extraerBattleMetricsId(valor) {
    if (!valor) {
        return null;
    }

    const texto = String(valor).trim();

    // Si ya es solamente el ID
    if (/^\d+$/.test(texto)) {
        return texto;
    }

    // Si es una URL de BattleMetrics
    const match = texto.match(
        /battlemetrics\.com\/players\/(\d+)/i
    );

    if (match) {
        return match[1];
    }

    return null;
}

// =====================================================
// OBTENER SERVER ID DEL PLAYER
// =====================================================

function obtenerServerId(player) {
    const serverRelationship =
        player?.relationships?.server?.data?.id;

    if (serverRelationship) {
        return String(serverRelationship);
    }

    const serverAttribute =
        player?.attributes?.serverId;

    if (serverAttribute) {
        return String(serverAttribute);
    }

    return null;
}

// =====================================================
// COMANDO
// =====================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('revisar')
        .setDescription(
            'Revisa si hay algún perfil vigilado conectado en el servidor actual'
        ),

    async execute(interaction) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        const guildId = interaction.guild.id;
        const inicio = Date.now();

        try {
            console.log('==============================================');
            console.log('🎯 Ejecutando /revisar');
            console.log(`🏠 Guild ID: ${guildId}`);

            // =================================================
            // 1. SERVIDOR CONFIGURADO
            // =================================================

            const configServer = await ServerConfig.findOne({
                guildId
            });

            const bmServerId =
                configServer?.battleMetricsServerId ||
                configServer?.battlemetricsServerId ||
                configServer?.serverId;

            if (!configServer || !bmServerId) {
                return interaction.editReply({
                    content:
                        '❌ No hay ningún servidor de Rust configurado. Usa `/configurar-servidor` primero.'
                });
            }

            const servidorObjetivo = String(bmServerId).trim();

            console.log(
                `🎮 BattleMetrics Server ID: ${servidorObjetivo}`
            );

            // =================================================
            // 2. PERFILES VIGILADOS
            // =================================================

            const vigilados = await Vigilado.find({
                guildId
            });

            if (vigilados.length === 0) {
                return interaction.editReply({
                    content:
                        '⚠️ No tienes ningún perfil guardado para vigilar. Usa `/vigilar` para añadir algunos.'
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
                    alias: vigilado.alias,
                    battlemetricsId
                });
            }

            if (perfiles.length === 0) {
                return interaction.editReply({
                    content:
                        '❌ Ninguno de los perfiles vigilados tiene un ID válido de BattleMetrics.'
                });
            }

            const idsBuscados = new Set(
                perfiles.map(
                    perfil => perfil.battlemetricsId
                )
            );

            console.log(
                '[DEBUG /revisar] IDs que se buscan:',
                Array.from(idsBuscados)
            );

            // =================================================
            // 4. CONSULTAR JUGADORES ONLINE DEL SERVIDOR
            // =================================================

            const jugadoresDetectados = new Map();

            let pagina = 1;
            let totalConsultados = 0;

            const inicioBM = Date.now();

            while (pagina <= MAX_PAGES) {
                console.log(
                    `🌐 BattleMetrics página ${pagina}/${MAX_PAGES}`
                );

                const response = await axios.get(
                    `${BM_API}/players`,
                    {
                        headers: getHeaders(),
                        params: {
                            'filter[servers]': servidorObjetivo,
                            'filter[online]': 'true',
                            'page[size]': 100,
                            'page[number]': pagina
                        },
                        timeout: REQUEST_TIMEOUT
                    }
                );

                const jugadores =
                    response.data?.data || [];

                totalConsultados += jugadores.length;

                console.log(
                    `👥 Jugadores recibidos: ${jugadores.length}`
                );

                // =================================================
                // 5. COMPROBAR LOS JUGADORES
                // =================================================

                for (const player of jugadores) {
                    if (!player?.id) {
                        continue;
                    }

                    const playerId = String(player.id);

                    // No nos interesa si no es uno de los vigilados
                    if (!idsBuscados.has(playerId)) {
                        continue;
                    }

                    const serverId =
                        obtenerServerId(player);

                    console.log(
                        `🔎 Perfil vigilado encontrado: ${playerId}`
                    );

                    console.log(
                        `   Server ID informado por BM: ${serverId || 'no disponible'}`
                    );

                    // =================================================
                    // COMPROBACION DEL SERVIDOR
                    // =================================================

                    if (serverId) {
                        if (serverId === servidorObjetivo) {
                            jugadoresDetectados.set(
                                playerId,
                                player
                            );

                            console.log(
                                `🚨 CONFIRMADO: ${playerId} está en ${servidorObjetivo}`
                            );
                        } else {
                            console.log(
                                `⚠️ ${playerId} está en ${serverId}, no en ${servidorObjetivo}`
                            );
                        }
                    } else {
                        // La consulta ya está filtrada por servidor.
                        // Si BM no entrega serverId en el objeto,
                        // usamos el filtro del endpoint como confirmación.

                        jugadoresDetectados.set(
                            playerId,
                            player
                        );

                        console.log(
                            `🚨 CONFIRMADO POR FILTRO: ${playerId} está en ${servidorObjetivo}`
                        );
                    }
                }

                // =================================================
                // 6. SI YA ENCONTRAMOS TODOS, TERMINAMOS
                // =================================================

                if (
                    jugadoresDetectados.size >=
                    idsBuscados.size
                ) {
                    console.log(
                        '✅ Se encontraron todos los perfiles vigilados.'
                    );

                    break;
                }

                // =================================================
                // 7. COMPROBAR SI EXISTE OTRA PAGINA
                // =================================================

                const meta =
                    response.data?.meta || {};

                const total =
                    Number(meta.total || 0);

                const totalPages =
                    Number(
                        meta.last_page ||
                        meta.total_pages ||
                        0
                    );

                if (
                    totalPages > 0 &&
                    pagina >= totalPages
                ) {
                    console.log(
                        'ℹ️ Última página alcanzada según BattleMetrics.'
                    );

                    break;
                }

                if (
                    total > 0 &&
                    pagina * 100 >= total
                ) {
                    console.log(
                        'ℹ️ Se alcanzó el total indicado por BattleMetrics.'
                    );

                    break;
                }

                if (jugadores.length < 100) {
                    console.log(
                        'ℹ️ BattleMetrics devolvió menos de 100 jugadores. Última página.'
                    );

                    break;
                }

                pagina++;
            }

            const tiempoBM =
                Date.now() - inicioBM;

            // =================================================
            // 8. CRUZAR LOS RESULTADOS
            // =================================================

            const encontradosOnline = [];
            const fuera = [];

            for (const perfil of perfiles) {
                if (
                    jugadoresDetectados.has(
                        perfil.battlemetricsId
                    )
                ) {
                    encontradosOnline.push(
                        perfil
                    );
                } else {
                    fuera.push(
                        perfil
                    );
                }
            }

            // =================================================
            // 9. LOG FINAL
            // =================================================

            console.log('==============================================');

            console.log(
                `🎮 Servidor objetivo: ${servidorObjetivo}`
            );

            console.log(
                `📄 Páginas consultadas: ${pagina}`
            );

            console.log(
                `👥 Jugadores consultados: ${totalConsultados}`
            );

            console.log(
                `🚨 Detectados: ${encontradosOnline.length}`
            );

            console.log(
                `💤 Fuera: ${fuera.length}`
            );

            console.log(
                `⏱️ Tiempo BM: ${tiempoBM} ms`
            );

            console.log('==============================================');

            // =================================================
            // 10. CREAR EMBED
            // =================================================

            const embed = new EmbedBuilder()
                .setColor(
                    encontradosOnline.length > 0
                        ? 0xE74C3C
                        : 0x2ECC71
                )
                .setTitle('🔍 Resultado de la Revisión')
                .setDescription(
                    `Servidor BattleMetrics: \`${servidorObjetivo}\``
                )
                .setTimestamp();

            // =================================================
            // ONLINE
            // =================================================

            if (encontradosOnline.length > 0) {
                embed.addFields({
                    name: '🚨 ¡Detectados Online!',
                    value: encontradosOnline
                        .map(
                            perfil =>
                                `• **${perfil.alias}**`
                        )
                        .join('\n'),
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '🟢 Estado',
                    value:
                        'Ningún perfil vigilado se encuentra online en este servidor.',
                    inline: false
                });
            }

            // =================================================
            // FUERA / OFFLINE
            // =================================================

            if (fuera.length > 0) {
                embed.addFields({
                    name: '💤 Offline / Fuera',
                    value: fuera
                        .map(
                            perfil =>
                                `• ${perfil.alias}`
                        )
                        .join('\n'),
                    inline: false
                });
            }

            // =================================================
            // INFORMACION DE LA CONSULTA
            // =================================================

            embed.addFields({
                name: '📡 BattleMetrics',
                value:
                    `Jugadores consultados: **${totalConsultados}**\n` +
                    `Páginas revisadas: **${pagina}**\n` +
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
                Date.now() - inicio;

            console.log(
                `✅ /revisar terminado correctamente en ${tiempoTotal} ms`
            );

            console.log('==============================================');

        } catch (error) {
            const tiempoTotal =
                Date.now() - inicio;

            console.error(
                '=============================================='
            );

            console.error(
                '❌ ERROR EN /REVISAR'
            );

            console.error(
                `⏱️ Tiempo: ${tiempoTotal} ms`
            );

            console.error(
                `Código: ${error.code || 'N/A'}`
            );

            console.error(
                `Mensaje: ${error.message || 'Sin mensaje'}`
            );

            if (error.response) {
                console.error(
                    `HTTP BattleMetrics: ${error.response.status}`
                );

                console.error(
                    'Respuesta:',
                    error.response.data
                );
            }

            console.error(
                '=============================================='
            );

            await interaction.editReply({
                content:
                    '❌ Ocurrió un error al procesar la revisión de perfiles en BattleMetrics. Revisa la consola del bot para ver el motivo exacto.'
            });
        }
    }
};