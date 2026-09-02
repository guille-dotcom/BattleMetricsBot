const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags
} = require('discord.js');

const axios = require('axios');

const ServerConfig = require('../models/ServerConfig');
const Vigilado = require('../models/Vigilado');

// =====================================================
// CONFIGURACIÓN
// =====================================================

const BM_API = 'https://api.battlemetrics.com';

const REQUEST_TIMEOUT = 30000;

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
            flags: [MessageFlags.Ephemeral]
        });

        const guildId = interaction.guild.id;

        const inicio = Date.now();

        try {

            console.log('==============================================');
            console.log('🎯 Ejecutando /revisar');
            console.log(`🏠 Guild ID: ${guildId}`);

            // =====================================================
            // 1. OBTENER SERVIDOR CONFIGURADO
            // =====================================================

            const configServer = await ServerConfig.findOne({
                guildId
            });

            const bmServerId =
                configServer?.battleMetricsServerId ||
                configServer?.battlemetricsServerId ||
                configServer?.serverId;

            if (!configServer || !bmServerId) {

                console.log(
                    '⚠️ No se encontró un servidor BattleMetrics configurado.'
                );

                return interaction.editReply({
                    content:
                        '❌ No hay ningún servidor de Rust configurado. Usa `/configurar-servidor` primero.'
                });
            }

            console.log(
                `🎮 BattleMetrics Server ID: ${bmServerId}`
            );

            // =====================================================
            // 2. OBTENER PERFILES VIGILADOS
            // =====================================================

            const vigilados = await Vigilado.find({
                guildId
            });

            if (vigilados.length === 0) {

                console.log(
                    '⚠️ No hay perfiles vigilados registrados.'
                );

                return interaction.editReply({
                    content:
                        '⚠️ No tienes ningún perfil guardado para vigilar. Usa `/vigilar` para añadir algunos.'
                });
            }

            console.log(
                `👁️ Perfiles vigilados encontrados: ${vigilados.length}`
            );

            console.log(
                '[DEBUG /revisar] Perfiles:',
                vigilados.map(v => ({
                    alias: v.alias,
                    battlemetricsId: v.battlemetricsId
                }))
            );

            // =====================================================
            // 3. CONSULTAR BATTLEMETRICS
            // =====================================================

            console.log(
                '🌐 Consultando jugadores online en BattleMetrics...'
            );

            const bmInicio = Date.now();

            let response;

            try {

                response = await axios.get(
                    `${BM_API}/players`,
                    {
                        headers: getHeaders(),

                        params: {
                            'filter[servers]': bmServerId,
                            'filter[online]': 'true',
                            'page[size]': 100
                        },

                        timeout: REQUEST_TIMEOUT
                    }
                );

            } catch (bmError) {

                const tiempoBM = Date.now() - bmInicio;

                console.error(
                    `❌ BattleMetrics falló después de ${tiempoBM} ms`
                );

                if (bmError.code === 'ECONNABORTED') {
                    console.error(
                        '⏱️ BattleMetrics superó el timeout configurado.'
                    );
                }

                if (bmError.response) {

                    console.error(
                        '📡 HTTP BattleMetrics:',
                        bmError.response.status
                    );

                    console.error(
                        '📦 Respuesta BattleMetrics:',
                        bmError.response.data
                    );

                } else {

                    console.error(
                        '📡 Sin respuesta HTTP de BattleMetrics.'
                    );

                    console.error(
                        '🔎 Código:',
                        bmError.code
                    );

                    console.error(
                        '🔎 Mensaje:',
                        bmError.message
                    );
                }

                throw bmError;
            }

            const tiempoBM = Date.now() - bmInicio;

            console.log(
                `✅ BattleMetrics respondió en ${tiempoBM} ms`
            );

            console.log(
                `📡 HTTP BattleMetrics: ${response.status}`
            );

            // =====================================================
            // 4. PROCESAR JUGADORES ONLINE
            // =====================================================

            const playersData = response.data?.data || [];

            console.log(
                `👥 Jugadores online recibidos: ${playersData.length}`
            );

            const idsOnlineEnServidor = new Set();

            for (const player of playersData) {

                if (!player?.id) {
                    continue;
                }

                idsOnlineEnServidor.add(
                    String(player.id)
                );
            }

            console.log(
                '[DEBUG /revisar] IDs Online en BM:',
                Array.from(idsOnlineEnServidor)
            );

            // =====================================================
            // 5. CRUZAR PERFILES VIGILADOS
            // =====================================================

            const encontradosOnline = [];
            const offline = [];

            for (const v of vigilados) {

                const battlemetricsId = String(
                    v.battlemetricsId
                );

                if (
                    idsOnlineEnServidor.has(
                        battlemetricsId
                    )
                ) {

                    encontradosOnline.push(
                        v.alias
                    );

                } else {

                    offline.push(
                        v.alias
                    );
                }
            }

            console.log(
                `🚨 Detectados online: ${encontradosOnline.length}`
            );

            console.log(
                `💤 Fuera/offline: ${offline.length}`
            );

            // =====================================================
            // 6. CREAR EMBED
            // =====================================================

            const embed = new EmbedBuilder()
                .setColor(
                    encontradosOnline.length > 0
                        ? 0xE74C3C
                        : 0x2ECC71
                )
                .setTitle('🔍 Resultado de la Revisión')
                .setDescription(
                    `Servidor BattleMetrics: \`${bmServerId}\``
                )
                .setTimestamp();

            // =====================================================
            // ONLINE
            // =====================================================

            if (encontradosOnline.length > 0) {

                embed.addFields({
                    name: '🚨 ¡Detectados Online!',
                    value: encontradosOnline
                        .map(alias => `• **${alias}**`)
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

            // =====================================================
            // OFFLINE / FUERA
            // =====================================================

            if (
                offline.length > 0 &&
                encontradosOnline.length > 0
            ) {

                embed.addFields({
                    name: '💤 Offline / Fuera',
                    value: offline
                        .map(alias => `• ${alias}`)
                        .join('\n'),
                    inline: false
                });
            }

            // =====================================================
            // INFORMACIÓN DE CONSULTA
            // =====================================================

            embed.addFields({
                name: '📡 BattleMetrics',
                value:
                    `Jugadores online consultados: **${playersData.length}**\n` +
                    `Tiempo de respuesta: **${tiempoBM} ms**`,
                inline: false
            });

            // =====================================================
            // RESPONDER
            // =====================================================

            await interaction.editReply({
                embeds: [embed]
            });

            const tiempoTotal = Date.now() - inicio;

            console.log(
                `✅ /revisar terminado correctamente en ${tiempoTotal} ms`
            );

            console.log('==============================================');

        } catch (error) {

            const tiempoTotal = Date.now() - inicio;

            console.error(
                '=============================================='
            );

            console.error(
                '❌ DETALLE DEL ERROR EN /REVISAR'
            );

            console.error(
                `⏱️ Tiempo transcurrido: ${tiempoTotal} ms`
            );

            console.error(
                'Código:',
                error.code || 'N/A'
            );

            console.error(
                'Mensaje:',
                error.message || 'Sin mensaje'
            );

            if (error.response) {

                console.error(
                    'HTTP:',
                    error.response.status
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
                    '❌ Ocurrió un error al procesar la revisión de perfiles en BattleMetrics.\n' +
                    'Revisa la consola del bot para ver el motivo exacto.'
            });
        }
    }
};