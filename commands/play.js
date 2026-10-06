const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const { Player } = require('discord-player');

const {
    YouTubeDlpExtractor,
    setFFmpegPath
} = require('discord-player-youtubedlp');

const ffmpegPath = require('ffmpeg-static');

const {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus
} = require('@discordjs/voice');

let playerPromise = null;

const VOICE_CONNECT_TIMEOUT = 15000;

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

            console.log(
                `🎬 FFmpeg encontrado: ${ffmpegPath}`
            );

            setFFmpegPath(ffmpegPath);

            // ------------------------------------------------
            // Discord Player
            // ------------------------------------------------

            console.log(
                '🎵 Creando instancia de Discord Player...'
            );

            const player = new Player(client, {
                ffmpegPath
            });

            console.log(
                '✅ Discord Player creado.'
            );

            // ------------------------------------------------
            // YouTube-DLP
            // ------------------------------------------------

            console.log(
                '🎵 Registrando extractor YouTube-DLP...'
            );

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

            console.log(
                '✅ Extractor YouTube-DLP registrado.'
            );

            // ------------------------------------------------
            // Eventos
            // ------------------------------------------------

            player.events.on(
                'error',
                (queue, error) => {

                    console.error(
                        '❌ DISCORD PLAYER ERROR'
                    );

                    console.error(
                        '❌ Guild:',
                        queue?.guild?.id
                    );

                    console.error(
                        '❌ Error:',
                        error
                    );

                    console.error(
                        '❌ Stack:',
                        error?.stack
                    );
                }
            );

            player.events.on(
                'playerError',
                (queue, error) => {

                    console.error(
                        '❌ PLAYER ERROR'
                    );

                    console.error(
                        '❌ Guild:',
                        queue?.guild?.id
                    );

                    console.error(
                        '❌ Error:',
                        error
                    );

                    console.error(
                        '❌ Stack:',
                        error?.stack
                    );
                }
            );

            player.events.on(
                'connectionError',
                (queue, error) => {

                    console.error(
                        '❌ CONNECTION ERROR'
                    );

                    console.error(
                        '❌ Guild:',
                        queue?.guild?.id
                    );

                    console.error(
                        '❌ Error:',
                        error
                    );

                    console.error(
                        '❌ Stack:',
                        error?.stack
                    );
                }
            );

            player.events.on(
                'playerStart',
                (queue, track) => {

                    console.log(
                        '▶️ REPRODUCCIÓN INICIADA'
                    );

                    console.log(
                        '🎵 Canción:',
                        track?.title
                    );

                    console.log(
                        '🏠 Guild:',
                        queue?.guild?.id
                    );
                }
            );

            player.events.on(
                'playerFinish',
                (queue, track) => {

                    console.log(
                        '⏹️ REPRODUCCIÓN TERMINADA'
                    );

                    console.log(
                        '🎵 Canción:',
                        track?.title
                    );

                    console.log(
                        '🏠 Guild:',
                        queue?.guild?.id
                    );
                }
            );

            player.events.on(
                'disconnect',
                (queue) => {

                    console.log(
                        '🔌 BOT DESCONECTADO DEL CANAL DE VOZ'
                    );

                    console.log(
                        '🏠 Guild:',
                        queue?.guild?.id
                    );
                }
            );

            player.events.on(
                'emptyQueue',
                (queue) => {

                    console.log(
                        '📭 COLA VACÍA'
                    );

                    console.log(
                        '🏠 Guild:',
                        queue?.guild?.id
                    );
                }
            );

            // ------------------------------------------------
            // Guardar Player
            // ------------------------------------------------

            client.musicPlayer = player;

            console.log(
                '✅ Reproductor de música listo.'
            );

            return player;

        } catch (error) {

            console.error(
                '💥 ERROR INICIALIZANDO EL REPRODUCTOR'
            );

            console.error(
                '💥 Error:',
                error
            );

            console.error(
                '💥 Stack:',
                error?.stack
            );

            playerPromise = null;

            throw error;
        }
    })();

    return await playerPromise;
}

/**
 * ============================================================
 * CONECTAR EXPLÍCITAMENTE AL CANAL DE VOZ
 * ============================================================
 */

async function connectToVoiceChannel(voiceChannel) {

    console.log('');
    console.log(
        '🔊 INICIANDO CONEXIÓN DE VOZ'
    );

    console.log(
        `🔊 Canal: ${voiceChannel.name}`
    );

    console.log(
        `🔊 Channel ID: ${voiceChannel.id}`
    );

    console.log(
        `🏠 Guild ID: ${voiceChannel.guild.id}`
    );

    // --------------------------------------------------------
    // Comprobar si ya está conectado
    // --------------------------------------------------------

    const botVoiceChannelId =
        voiceChannel.guild.members.me?.voice?.channelId;

    if (
        botVoiceChannelId === voiceChannel.id
    ) {

        console.log(
            '✅ El bot ya está conectado a este canal.'
        );

        return null;
    }

    // --------------------------------------------------------
    // Si está conectado a otro canal
    // --------------------------------------------------------

    if (botVoiceChannelId) {

        console.log(
            `🔄 El bot está actualmente en: ${botVoiceChannelId}`
        );

        console.log(
            '🔌 Desconectando conexión anterior...'
        );

        try {

            const oldConnection =
                voiceChannel.guild.members.me?.voice;

            if (oldConnection?.channel) {
                await oldConnection.disconnect();
            }

        } catch (error) {

            console.warn(
                '⚠️ No se pudo desconectar la conexión anterior:',
                error?.message
            );
        }
    }

    // --------------------------------------------------------
    // Crear conexión explícita
    // --------------------------------------------------------

    console.log(
        '🔊 Creando conexión explícita...'
    );

    const connection = joinVoiceChannel({

        channelId: voiceChannel.id,

        guildId: voiceChannel.guild.id,

        adapterCreator:
            voiceChannel.guild.voiceAdapterCreator,

        selfDeaf: true,

        selfMute: false
    });

    console.log(
        '🔊 Conexión creada.'
    );

    // --------------------------------------------------------
    // Esperar READY
    // --------------------------------------------------------

    console.log(
        '⏳ Esperando estado READY de Discord...'
    );

    try {

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            VOICE_CONNECT_TIMEOUT
        );

        console.log(
            '=========================================='
        );

        console.log(
            '🔊 CONECTADO A VOZ CORRECTAMENTE'
        );

        console.log(
            `🔊 Canal: ${voiceChannel.name}`
        );

        console.log(
            `🔊 ID: ${voiceChannel.id}`
        );

        console.log(
            '=========================================='
        );

        return connection;

    } catch (error) {

        console.error(
            '❌ NO SE PUDO ESTABLECER LA CONEXIÓN DE VOZ'
        );

        console.error(
            '❌ Canal:',
            voiceChannel.name
        );

        console.error(
            '❌ Error:',
            error?.message
        );

        try {
            connection.destroy();
        } catch {}

        throw new Error(
            `No se pudo conectar al canal de voz: ${error?.message}`
        );
    }
}

/**
 * ============================================================
 * COMANDO /PLAY
 * ============================================================
 */

module.exports = {

    data: new SlashCommandBuilder()

        .setName('play')

        .setDescription(
            'Reproduce una canción por nombre o enlace'
        )

        .addStringOption(option =>
            option
                .setName('cancion')
                .setDescription(
                    'Nombre de la canción o enlace'
                )
                .setRequired(true)
        ),

    async execute(interaction) {

        console.log('');

        console.log(
            '=========================================='
        );

        console.log(
            '🎯 EJECUTANDO /PLAY'
        );

        console.log(
            '=========================================='
        );

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

            console.log(
                `🎯 Consulta recibida: ${query}`
            );

            // ------------------------------------------------
            // Diferir interacción
            // ------------------------------------------------

            await interaction.deferReply();

            console.log(
                '✅ Interacción diferida.'
            );

            // ------------------------------------------------
            // CONECTAR A VOZ PRIMERO
            // ------------------------------------------------

            console.log('');
            console.log(
                '🔊 PASO 1/3 — CONECTANDO A VOZ'
            );

            await connectToVoiceChannel(
                voiceChannel
            );

            // ------------------------------------------------
            // Obtener Player
            // ------------------------------------------------

            console.log('');
            console.log(
                '🎵 PASO 2/3 — OBTENIENDO PLAYER'
            );

            const player =
                await getPlayer(
                    interaction.client
                );

            console.log(
                '✅ Reproductor obtenido.'
            );

            // ------------------------------------------------
            // Reproducir
            // ------------------------------------------------

            console.log('');
            console.log(
                '▶️ PASO 3/3 — INICIANDO REPRODUCCIÓN'
            );

            console.log(
                `🔗 Query: ${query}`
            );

            console.log(
                `🔊 Voice Channel: ${voiceChannel.id}`
            );

            console.log(
                `🏠 Guild: ${interaction.guild.id}`
            );

            console.log(
                '▶️ Ejecutando player.play()...'
            );

            const result =
                await player.play(
                    voiceChannel,
                    query,
                    {
                        nodeOptions: {

                            metadata:
                                interaction.channel,

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

            const track =
                result?.track;

            if (!track) {

                throw new Error(
                    'player.play() no devolvió ningún track.'
                );
            }

            console.log('');
            console.log(
                '🎵 TRACK OBTENIDO'
            );

            console.log(
                `🎵 Título: ${track.title}`
            );

            console.log(
                `🎵 Autor: ${track.author}`
            );

            console.log(
                `🎵 Duración: ${track.duration}`
            );

            console.log(
                `🔗 URL: ${track.url}`
            );

            // ------------------------------------------------
            // Embed
            // ------------------------------------------------

            const embed =
                new EmbedBuilder()

                    .setColor(0x57F287)

                    .setTitle(
                        '🎵 Canción añadida'
                    )

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
                        },

                        {
                            name: '🔊 Canal',
                            value:
                                voiceChannel.name,
                            inline: true
                        }
                    )

                    .setFooter({
                        text:
                            `Solicitada por ${interaction.user.username}`
                    });

            console.log(
                '📨 Enviando respuesta de Discord...'
            );

            await interaction.editReply({
                embeds: [embed]
            });

            console.log('');
            console.log(
                '=========================================='
            );

            console.log(
                '✅ /PLAY COMPLETADO CORRECTAMENTE'
            );

            console.log(
                `🔊 Bot conectado a: ${voiceChannel.name}`
            );

            console.log(
                `🎵 Reproduciendo: ${track.title}`
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

            console.error(
                '💥 ERROR EN /PLAY'
            );

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
            // NO desconectar el bot si falla la reproducción
            // ------------------------------------------------

            try {

                if (
                    interaction.deferred ||
                    interaction.replied
                ) {

                    await interaction.editReply({
                        content:
                            '❌ No pude encontrar o reproducir esa canción.\n' +
                            '🔊 El bot permanecerá conectado al canal de voz.\n' +
                            '📋 Revisa los logs del bot para ver el error.'
                    });

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