const {
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');

const {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    getVoiceConnection
} = require('@discordjs/voice');

const { YtDlp } = require('ytdlp-nodejs');

const ffmpegPath = require('ffmpeg-static');

// ============================================================
// CONFIGURACIÓN
// ============================================================

const VOICE_CONNECT_TIMEOUT = 15000;

let ytdlp = null;

// Players por servidor
const guildPlayers = new Map();

// Conexiones de voz por servidor
const guildConnections = new Map();

// Recursos de audio
const guildResources = new Map();

// Streams activos
const guildStreams = new Map();

// ============================================================
// INICIALIZAR YT-DLP
// ============================================================

function getYtDlp() {
    if (ytdlp) {
        return ytdlp;
    }

    console.log('🎬 Inicializando yt-dlp...');

    ytdlp = new YtDlp({
        ffmpegPath
    });

    console.log('✅ yt-dlp listo.');

    return ytdlp;
}

// ============================================================
// AUDIO PLAYER
// ============================================================

function getAudioPlayer(guildId) {
    let player = guildPlayers.get(guildId);

    if (player) {
        return player;
    }

    console.log(`🎵 Creando AudioPlayer para guild ${guildId}...`);

    player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play
        }
    });

    player.on(AudioPlayerStatus.Playing, () => {
        console.log(`▶️ AudioPlayer: PLAYING (${guildId})`);
    });

    player.on(AudioPlayerStatus.Buffering, () => {
        console.log(`⏳ AudioPlayer: BUFFERING (${guildId})`);
    });

    player.on(AudioPlayerStatus.Idle, () => {
        console.log(`⏹️ AudioPlayer: IDLE (${guildId})`);

        cleanupGuildStream(guildId);
    });

    player.on('error', (error) => {
        console.error('');
        console.error('==========================================');
        console.error('❌ ERROR DEL AUDIO PLAYER');
        console.error('==========================================');
        console.error(error);
        console.error('==========================================');
        console.error('');

        cleanupGuildStream(guildId);
    });

    guildPlayers.set(guildId, player);

    return player;
}

// ============================================================
// CONEXIÓN DE VOZ
// ============================================================

async function connectToVoiceChannel(voiceChannel) {
    const guildId = voiceChannel.guild.id;

    console.log('');
    console.log('==========================================');
    console.log('🔊 INICIANDO CONEXIÓN DE VOZ');
    console.log('==========================================');
    console.log(`🔊 Canal: ${voiceChannel.name}`);
    console.log(`🔊 Channel ID: ${voiceChannel.id}`);
    console.log(`🏠 Guild ID: ${guildId}`);

    // --------------------------------------------------------
    // Comprobar conexión existente
    // --------------------------------------------------------

    let connection = getVoiceConnection(guildId);

    if (connection) {
        console.log('🔎 Ya existe una conexión de voz.');

        const currentChannelId =
            connection.joinConfig?.channelId;

        if (currentChannelId === voiceChannel.id) {
            console.log('✅ El bot ya está conectado a este canal.');

            guildConnections.set(guildId, connection);

            return connection;
        }

        console.log(
            `🔄 Cambiando de canal: ${currentChannelId} -> ${voiceChannel.id}`
        );

        try {
            connection.destroy();
        } catch (error) {
            console.warn(
                '⚠️ Error destruyendo conexión anterior:',
                error?.message
            );
        }

        guildConnections.delete(guildId);
    }

    // --------------------------------------------------------
    // Crear conexión
    // --------------------------------------------------------

    console.log('🔊 Creando conexión explícita...');

    connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,

        // IMPORTANTE:
        // false = el bot NO entra ensordecido
        selfDeaf: false,

        // false = el bot NO entra muteado
        selfMute: false
    });

    guildConnections.set(guildId, connection);

    console.log('🔊 Conexión creada.');
    console.log('⏳ Esperando estado READY de Discord...');

    try {
        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            VOICE_CONNECT_TIMEOUT
        );

        console.log('==========================================');
        console.log('🔊 CONECTADO A VOZ CORRECTAMENTE');
        console.log(`🔊 Canal: ${voiceChannel.name}`);
        console.log(`🔊 ID: ${voiceChannel.id}`);
        console.log('🎧 Ensordecido: NO');
        console.log('🔇 Muteado: NO');
        console.log('==========================================');

        return connection;

    } catch (error) {
        console.error('');
        console.error('==========================================');
        console.error('❌ NO SE PUDO ESTABLECER LA CONEXIÓN');
        console.error('==========================================');
        console.error(error?.message);
        console.error('');

        try {
            connection.destroy();
        } catch {}

        guildConnections.delete(guildId);

        throw new Error(
            `No se pudo conectar al canal de voz: ${error?.message}`
        );
    }
}

// ============================================================
// OBTENER INFORMACIÓN DEL VIDEO
// ============================================================

async function getVideoInfo(url) {
    const yt = getYtDlp();

    console.log('🔎 Obteniendo información de YouTube...');

    const info = await yt.getInfoAsync(url, {
        flatPlaylist: true
    });

    // --------------------------------------------------------
    // Playlist
    // --------------------------------------------------------

    if (info?.entries && Array.isArray(info.entries)) {
        if (!info.entries.length) {
            throw new Error(
                'La playlist no contiene vídeos.'
            );
        }

        console.log(
            `📋 Playlist detectada: ${info.entries.length} elementos`
        );

        const first = info.entries[0];

        if (first?.url) {
            return {
                url: first.webpage_url || first.url,
                title: first.title || 'Audio de YouTube',
                duration: first.duration || 0,
                thumbnail: first.thumbnail || null,
                uploader:
                    first.uploader ||
                    first.channel ||
                    'YouTube'
            };
        }
    }

    console.log(
        `🎵 Título: ${info?.title || 'Desconocido'}`
    );

    return {
        url,
        title: info?.title || 'Audio de YouTube',
        duration: info?.duration || 0,
        thumbnail: info?.thumbnail || null,
        uploader:
            info?.uploader ||
            info?.channel ||
            'YouTube'
    };
}

// ============================================================
// LIMPIAR STREAM
// ============================================================

function cleanupGuildStream(guildId) {
    const stream = guildStreams.get(guildId);

    if (stream) {
        console.log(
            `🧹 Cerrando stream anterior (${guildId})...`
        );

        try {
            if (typeof stream.destroy === 'function') {
                stream.destroy();
            }
        } catch (error) {
            console.warn(
                '⚠️ Error cerrando stream:',
                error?.message
            );
        }
    }

    guildStreams.delete(guildId);
    guildResources.delete(guildId);
}

// ============================================================
// DETENER AUDIO ANTERIOR
// ============================================================

function stopGuildAudio(guildId) {
    const player = guildPlayers.get(guildId);

    if (player) {
        try {
            player.stop(true);
        } catch {}
    }

    cleanupGuildStream(guildId);
}

// ============================================================
// FORMATEAR DURACIÓN
// ============================================================

function formatDuration(seconds) {
    if (
        !seconds ||
        !Number.isFinite(Number(seconds))
    ) {
        return 'Desconocida';
    }

    seconds = Math.floor(Number(seconds));

    const hours = Math.floor(seconds / 3600);

    const minutes =
        Math.floor((seconds % 3600) / 60);

    const secs =
        seconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// ============================================================
// NORMALIZAR URL YOUTUBE
// ============================================================

function normalizeYouTubeUrl(url) {
    try {
        const parsed = new URL(url);

        // youtube.com/watch?v=...
        if (
            parsed.hostname.includes('youtube.com') &&
            parsed.pathname === '/watch'
        ) {
            const videoId =
                parsed.searchParams.get('v');

            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }

        // youtu.be/...
        if (
            parsed.hostname === 'youtu.be'
        ) {
            const videoId =
                parsed.pathname
                    .replace('/', '')
                    .trim();

            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }

        return url;

    } catch {
        return url;
    }
}

// ============================================================
// CREAR STREAM DE AUDIO
// ============================================================

async function createYouTubeAudioStream(url) {
    const yt = getYtDlp();

    console.log('');
    console.log('==========================================');
    console.log('🎧 CREANDO STREAM DE AUDIO');
    console.log('==========================================');
    console.log(`🔗 URL: ${url}`);

    /*
     * NO descargamos el archivo completo.
     *
     * yt-dlp entrega el audio mediante stream.
     *
     * Esto evita cargar una canción completa en memoria.
     */

    const streamBuilder = yt
        .stream(url, {
            rawArgs: [
                '--no-playlist',
                '--no-part',
                '--no-cache-dir',
                '--quiet',
                '--no-warnings'
            ]
        })
        .filter('audioonly')
        .quality(5)
        .type('opus');

    console.log(
        '🎧 Stream yt-dlp creado.'
    );

    const stream =
        streamBuilder.getStream();

    if (!stream) {
        throw new Error(
            'yt-dlp no devolvió un stream de audio.'
        );
    }

    console.log(
        '✅ Stream de audio obtenido.'
    );

    return stream;
}

// ============================================================
// COMANDO /PLAY
// ============================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription(
            'Reproduce música en tu canal de voz'
        )
        .addStringOption(option =>
            option
                .setName('consulta')
                .setDescription(
                    'URL de YouTube o búsqueda'
                )
                .setRequired(true)
        ),

    async execute(interaction) {

        console.log('');
        console.log('==========================================');
        console.log('🎯 EJECUTANDO /PLAY');
        console.log('==========================================');

        // ----------------------------------------------------
        // CANAL DE VOZ
        // ----------------------------------------------------

        const voiceChannel =
            interaction.member?.voice?.channel;

        if (!voiceChannel) {

            console.log(
                '❌ Usuario no está en un canal de voz.'
            );

            return interaction.reply({
                content:
                    '🔊 Debes estar en un canal de voz para usar `/play`.',
                ephemeral: true
            });
        }

        // ----------------------------------------------------
        // CONSULTA
        // ----------------------------------------------------

        const query =
            interaction.options.getString(
                'consulta'
            );

        console.log(
            `🔊 Canal de voz: ${voiceChannel.name} (${voiceChannel.id})`
        );

        console.log(
            `🎯 Consulta recibida: ${query}`
        );

        // ----------------------------------------------------
        // DEFER
        // ----------------------------------------------------

        try {

            await interaction.deferReply();

            console.log(
                '✅ Interacción diferida.'
            );

        } catch (error) {

            console.error(
                '❌ No se pudo diferir la interacción:',
                error
            );

            return;
        }

        const guildId =
            interaction.guild.id;

        try {

            // =================================================
            // PASO 1
            // =================================================

            console.log('');
            console.log(
                '🔊 PASO 1/4 — CONECTANDO A VOZ'
            );

            const connection =
                await connectToVoiceChannel(
                    voiceChannel
                );

            // =================================================
            // PASO 2
            // =================================================

            console.log('');
            console.log(
                '🔗 PASO 2/4 — PREPARANDO YOUTUBE'
            );

            const normalizedUrl =
                normalizeYouTubeUrl(query);

            console.log(
                `🔗 URL normalizada: ${normalizedUrl}`
            );

            // =================================================
            // PASO 3
            // =================================================

            console.log('');
            console.log(
                '🔎 PASO 3/4 — OBTENIENDO INFORMACIÓN'
            );

            const info =
                await getVideoInfo(
                    normalizedUrl
                );

            console.log(
                `🎵 Título: ${info.title}`
            );

            console.log(
                `⏱️ Duración: ${formatDuration(info.duration)}`
            );

            // =================================================
            // DETENER AUDIO ANTERIOR
            // =================================================

            console.log('');
            console.log(
                '🧹 Limpiando reproducción anterior...'
            );

            stopGuildAudio(guildId);

            // =================================================
            // OBTENER PLAYER
            // =================================================

            const player =
                getAudioPlayer(guildId);

            // =================================================
            // PASO 4
            // =================================================

            console.log('');
            console.log(
                '🎧 PASO 4/4 — INICIANDO STREAM'
            );

            const audioStream =
                await createYouTubeAudioStream(
                    normalizedUrl
                );

            guildStreams.set(
                guildId,
                audioStream
            );

            /*
             * yt-dlp entrega Opus.
             *
             * WebM/Opus puede reproducirse directamente
             * sin tener que pasar el audio por FFmpeg.
             */

            const resource =
                createAudioResource(
                    audioStream,
                    {
                        inputType:
                            StreamType.WebmOpus,

                        metadata: {
                            title: info.title,
                            url: normalizedUrl,
                            duration:
                                info.duration
                        }
                    }
                );

            guildResources.set(
                guildId,
                resource
            );

            // ------------------------------------------------
            // CONECTAR PLAYER A VOZ
            // ------------------------------------------------

            console.log(
                '🔊 Suscribiendo AudioPlayer a Discord...'
            );

            connection.subscribe(
                player
            );

            // ------------------------------------------------
            // REPRODUCIR
            // ------------------------------------------------

            console.log(
                '▶️ Iniciando reproducción...'
            );

            player.play(resource);

            console.log('');
            console.log('==========================================');
            console.log('🎵 REPRODUCCIÓN INICIADA');
            console.log('==========================================');
            console.log(
                `🎵 ${info.title}`
            );
            console.log(
                `🔊 Canal: ${voiceChannel.name}`
            );
            console.log(
                `⏱️ Duración: ${formatDuration(info.duration)}`
            );
            console.log(
                '🎧 Ensordecido: NO'
            );
            console.log(
                '🔇 Muteado: NO'
            );
            console.log(
                '==========================================');

            // =================================================
            // EMBED
            // =================================================

            const embed =
                new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle(
                        '🎵 Reproduciendo'
                    )
                    .setDescription(
                        `[${info.title}](${normalizedUrl})`
                    )
                    .addFields(
                        {
                            name: '🎤 Canal',
                            value:
                                voiceChannel.name,
                            inline: true
                        },
                        {
                            name: '⏱️ Duración',
                            value:
                                formatDuration(
                                    info.duration
                                ),
                            inline: true
                        }
                    )
                    .setFooter({
                        text:
                            'RustLogix • Reproductor ligero'
                    });

            if (info.thumbnail) {
                embed.setThumbnail(
                    info.thumbnail
                );
            }

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {

            console.error('');
            console.error('==========================================');
            console.error('❌ ERROR EN /PLAY');
            console.error('==========================================');
            console.error(
                error?.stack ||
                error?.message ||
                error
            );
            console.error('==========================================');
            console.error('');

            cleanupGuildStream(
                guildId
            );

            try {

                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xe74c3c)
                            .setTitle(
                                '❌ No se pudo reproducir'
                            )
                            .setDescription(
                                `\`${String(
                                    error?.message ||
                                    'Error desconocido'
                                ).slice(0, 1000)}\``
                            )
                            .addFields({
                                name: '🔊 Canal',
                                value:
                                    voiceChannel.name,
                                inline: true
                            })
                    ]
                });

            } catch (replyError) {

                console.error(
                    '❌ No se pudo editar la respuesta:',
                    replyError?.message
                );
            }
        }
    }
};