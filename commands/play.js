const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Player } = require('discord-player');
const {
    YouTubeDlpExtractor,
    setFFmpegPath
} = require('discord-player-youtubedlp');
const ffmpegPath = require('ffmpeg-static');

let playerPromise = null;

/**
 * ============================================================
 * OBTENER / CREAR PLAYER
 * ============================================================
 */

async function getPlayer(client) {
    if (client.musicPlayer) {
        console.log('🎵 Reutilizando reproductor existente.');
        return client.musicPlayer;
    }

    if (playerPromise) {
        console.log('🎵 Esperando inicialización del reproductor...');
        return await playerPromise;
    }

    playerPromise = (async () => {
        try {
            console.log('🎵 Inicializando reproductor...');

            // ------------------------------------------------
            // FFmpeg
            // ------------------------------------------------

            if (!ffmpegPath) {
                throw new Error(
                    'ffmpeg-static no devolvió una ruta válida.'
                );
            }

            console.log(`🎬 FFmpeg encontrado: ${ffmpegPath}`);

            setFFmpegPath(ffmpegPath);

            // ------------------------------------------------
            // Discord Player
            // ------------------------------------------------

            console.log('🎵 Creando instancia de Discord Player...');

            const player = new Player(client, {
                ffmpegPath
            });

            console.log('✅ Discord Player creado.');

            // ------------------------------------------------
            // YouTube-DLP
            // ------------------------------------------------

            console.log('🎵 Registrando extractor YouTube-DLP...');

            await player.extractors.register(
                YouTubeDlpExtractor,
                {
                    searchLimit: 1,
                    playlistSearchLimit: 10,
                    relatedLimit: 0,

                    enableProtocols: true,

                    searchTimeoutMs: 6000,
                    videoTimeoutMs: 7000,
                    playlistTimeoutMs: 15000,
                    ytdlpTimeoutMs: 15000,

                    infoCacheTtlMs: 60000,

                    debug: false
                }
            );

            console.log('✅ Extractor YouTube-DLP registrado.');

            // ------------------------------------------------
            // Eventos del Player
            // ------------------------------------------------

            player.events.on('error', (queue, error) => {
                console.error('❌ DISCORD PLAYER ERROR');
                console.error('❌ Guild:', queue?.guild?.id);
                console.error('❌ Error:', error);
                console.error('❌ Stack:', error?.stack);
            });

            player.events.on('playerError', (queue, error) => {
                console.error('❌ PLAYER ERROR');
                console.error('❌ Guild:', queue?.guild?.id);
                console.error('❌ Error:', error);
                console.error('❌ Stack:', error?.stack);
            });

            player.events.on('connectionError', (queue, error) => {
                console.error('❌ CONNECTION ERROR');
                console.error('❌ Guild:', queue?.guild?.id);
                console.error('❌ Error:', error);
                console.error('❌ Stack:', error?.stack);
            });

            player.events.on('playerStart', (queue, track) => {
                console.log('▶️ REPRODUCCIÓN INICIADA');
                console.log('🎵 Canción:', track?.title);
                console.log('🏠 Guild:', queue?.guild?.id);
            });

            player.events.on('playerFinish', (queue, track) => {
                console.log('⏹️ REPRODUCCIÓN TERMINADA');
                console.log('🎵 Canción:', track?.title);
                console.log('🏠 Guild:', queue?.guild?.id);
            });

            player.events.on('disconnect', (queue) => {
                console.log('🔌 BOT DESCONECTADO DEL CANAL DE VOZ');
                console.log('🏠 Guild:', queue?.guild?.id);
            });

            player.events.on('emptyQueue', (queue) => {
                console.log('📭 COLA VACÍA');
                console.log('🏠 Guild:', queue?.guild?.id);
            });

            // ------------------------------------------------
            // Guardar Player
            // ------------------------------------------------

            client.musicPlayer = player;

            console.log('✅ Reproductor de música listo.');

            return player;

        } catch (error) {
            console.error('💥 ERROR INICIALIZANDO EL REPRODUCTOR');
            console.error('💥 Error:', error);
            console.error('💥 Stack:', error?.stack);

            // Permitir volver a intentarlo posteriormente
            playerPromise = null;

            throw error;
        }
    })();

    return await playerPromise;
}

/**
 * ============================================================
 * COMANDO /PLAY
 * ============================================================
 */

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce una canción por nombre o enlace')
        .addStringOption(option =>
            option
                .setName('cancion')
                .setDescription('Nombre de la canción o enlace')
                .setRequired(true)
        ),

    async execute(interaction) {
        console.log('');
        console.log('==========================================');
        console.log('🎯 EJECUTANDO /PLAY');
        console.log('==========================================');

        try {
            // ------------------------------------------------
            // Comprobar canal de voz
            // ------------------------------------------------

            const voiceChannel =
                interaction.member?.voice?.channel;

            if (!voiceChannel) {
                console.log(
                    '⚠️ Usuario no está conectado a un canal de voz.'
                );

                return interaction.reply({
                    content:
                        '❌ Debes estar conectado a un canal de voz.',
                    ephemeral: true
                });
            }

            console.log(
                `🔊 Canal de voz: ${voiceChannel.name} (${voiceChannel.id})`
            );

            // ------------------------------------------------
            // Obtener búsqueda
            // ------------------------------------------------

            const query =
                interaction.options.getString(
                    'cancion',
                    true
                );

            console.log(`🎯 Consulta recibida: ${query}`);

            await interaction.deferReply();

            console.log('✅ Interacción diferida.');

            // ------------------------------------------------
            // Obtener Player
            // ------------------------------------------------

            console.log('🎵 Solicitando reproductor...');

            const player =
                await getPlayer(interaction.client);

            console.log('✅ Reproductor obtenido.');

            // ------------------------------------------------
            // Reproducir
            // ------------------------------------------------

            console.log('▶️ Intentando ejecutar player.play()...');
            console.log(`🔗 Query: ${query}`);
            console.log(`🔊 Voice Channel: ${voiceChannel.id}`);

            const result = await player.play(
                voiceChannel,
                query,
                {
                    nodeOptions: {
                        metadata: interaction.channel,

                        bufferingTimeout: 15000,

                        leaveOnStop: true,
                        leaveOnStopCooldown: 5000,

                        leaveOnEnd: true,
                        leaveOnEndCooldown: 15000,

                        leaveOnEmpty: true,
                        leaveOnEmptyCooldown: 300000,

                        skipOnNoStream: true
                    }
                }
            );

            console.log(
                '✅ player.play() terminó correctamente.'
            );

            // ------------------------------------------------
            // Track
            // ------------------------------------------------

            const track = result?.track;

            if (!track) {
                throw new Error(
                    'player.play() no devolvió ningún track.'
                );
            }

            console.log('🎵 TRACK OBTENIDO');
            console.log(`🎵 Título: ${track.title}`);
            console.log(`🎵 Autor: ${track.author}`);
            console.log(`🎵 Duración: ${track.duration}`);
            console.log(`🔗 URL: ${track.url}`);

            // ------------------------------------------------
            // Embed
            // ------------------------------------------------

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🎵 Canción añadida')
                .setDescription(
                    `**[${track.title}](${track.url})**`
                )
                .addFields(
                    {
                        name: '👤 Artista',
                        value:
                            track.author ||
                            'Desconocido',
                        inline: true
                    },
                    {
                        name: '⏱️ Duración',
                        value:
                            track.duration ||
                            'Desconocida',
                        inline: true
                    }
                )
                .setFooter({
                    text:
                        `Solicitada por ` +
                        `${interaction.user.username}`
                });

            console.log(
                '📨 Enviando respuesta de Discord...'
            );

            await interaction.editReply({
                embeds: [embed]
            });

            console.log(
                '✅ /play completado correctamente.'
            );

            console.log(
                '=========================================='
            );

            console.log('');

        } catch (error) {
            console.error('');
            console.error(
                '=========================================='
            );
            console.error('💥 ERROR EN /PLAY');
            console.error(
                '=========================================='
            );

            console.error(
                '📛 Nombre:',
                error?.name
            );

            console.error(
                '📛 Mensaje:',
                error?.message
            );

            console.error(
                '📛 Stack:',
                error?.stack
            );

            console.error(
                '📛 Error completo:',
                error
            );

            console.error(
                '=========================================='
            );

            console.error('');

            // ------------------------------------------------
            // Intentar responder a Discord
            // ------------------------------------------------

            try {
                if (
                    interaction.deferred ||
                    interaction.replied
                ) {
                    await interaction.editReply(
                        '❌ No pude encontrar o reproducir esa canción. ' +
                        'Revisa los logs del bot.'
                    );
                } else {
                    await interaction.reply({
                        content:
                            '❌ No pude encontrar o reproducir esa canción.',
                        ephemeral: true
                    });
                }

            } catch (replyError) {
                console.error(
                    '❌ No se pudo enviar el mensaje de error a Discord.'
                );

                console.error(
                    '❌ Error de respuesta:',
                    replyError
                );
            }
        }
    }
};