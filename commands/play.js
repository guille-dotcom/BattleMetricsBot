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

// ============================================================
// VARIABLES GLOBALES
// ============================================================

let ytdlp = null;

const guildPlayers = new Map();
const guildConnections = new Map();
const guildResources = new Map();
const guildStreams = new Map();

// ============================================================
// YT-DLP
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

    console.log(
        `🎵 Creando AudioPlayer para ${guildId}...`
    );

    player = createAudioPlayer({
        behaviors: {
            noSubscriber:
                NoSubscriberBehavior.Play
        }
    });

    player.on(
        AudioPlayerStatus.Playing,
        () => {
            console.log(
                `▶️ AudioPlayer: PLAYING (${guildId})`
            );
        }
    );

    player.on(
        AudioPlayerStatus.Buffering,
        () => {
            console.log(
                `⏳ AudioPlayer: BUFFERING (${guildId})`
            );
        }
    );

    player.on(
        AudioPlayerStatus.Idle,
        () => {
            console.log(
                `⏹️ AudioPlayer: IDLE (${guildId})`
            );

            cleanupGuildStream(guildId);
        }
    );

    player.on(
        'error',
        error => {

            console.error('');
            console.error(
                '=========================================='
            );
            console.error(
                '❌ ERROR DEL AUDIO PLAYER'
            );
            console.error(
                '=========================================='
            );
            console.error(
                error?.stack ||
                error?.message ||
                error
            );
            console.error(
                '=========================================='
            );
            console.error('');

            cleanupGuildStream(guildId);
        }
    );

    guildPlayers.set(
        guildId,
        player
    );

    return player;
}

// ============================================================
// CONEXIÓN DE VOZ
// ============================================================

async function connectToVoiceChannel(
    voiceChannel
) {

    const guildId =
        voiceChannel.guild.id;

    console.log('');
    console.log(
        '=========================================='
    );
    console.log(
        '🔊 INICIANDO CONEXIÓN DE VOZ'
    );
    console.log(
        '=========================================='
    );

    console.log(
        `🔊 Canal: ${voiceChannel.name}`
    );

    console.log(
        `🔊 Channel ID: ${voiceChannel.id}`
    );

    console.log(
        `🏠 Guild ID: ${guildId}`
    );

    // --------------------------------------------------------
    // CONEXIÓN EXISTENTE
    // --------------------------------------------------------

    let connection =
        getVoiceConnection(guildId);

    if (connection) {

        const currentChannelId =
            connection.joinConfig?.channelId;

        if (
            currentChannelId ===
            voiceChannel.id
        ) {

            console.log(
                '✅ El bot ya está conectado a este canal.'
            );

            guildConnections.set(
                guildId,
                connection
            );

            return connection;
        }

        console.log(
            '🔄 Cambiando de canal de voz...'
        );

        try {
            connection.destroy();
        } catch {}

        guildConnections.delete(
            guildId
        );
    }

    // --------------------------------------------------------
    // CREAR CONEXIÓN
    // --------------------------------------------------------

    console.log(
        '🔊 Creando conexión explícita...'
    );

    connection = joinVoiceChannel({

        channelId:
            voiceChannel.id,

        guildId,

        adapterCreator:
            voiceChannel.guild
                .voiceAdapterCreator,

        // IMPORTANTE
        // El bot NO entra ensordecido
        selfDeaf: false,

        // El bot NO entra muteado
        selfMute: false
    });

    guildConnections.set(
        guildId,
        connection
    );

    console.log(
        '🔊 Conexión creada.'
    );

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
            '🎧 Ensordecido: NO'
        );

        console.log(
            '🔇 Muteado: NO'
        );

        console.log(
            '=========================================='
        );

        return connection;

    } catch (error) {

        console.error(
            '❌ Error conectando a voz:',
            error?.message
        );

        try {
            connection.destroy();
        } catch {}

        guildConnections.delete(
            guildId
        );

        throw error;
    }
}

// ============================================================
// LIMPIAR STREAM
// ============================================================

function cleanupGuildStream(
    guildId
) {

    const stream =
        guildStreams.get(guildId);

    if (stream) {

        console.log(
            `🧹 Cerrando stream (${guildId})...`
        );

        try {

            if (
                typeof stream.destroy ===
                'function'
            ) {
                stream.destroy();
            }

        } catch {}
    }

    guildStreams.delete(
        guildId
    );

    guildResources.delete(
        guildId
    );
}

// ============================================================
// DETENER AUDIO
// ============================================================

function stopGuildAudio(
    guildId
) {

    const player =
        guildPlayers.get(guildId);

    if (player) {

        try {
            player.stop(true);
        } catch {}
    }

    cleanupGuildStream(
        guildId
    );
}

// ============================================================
// NORMALIZAR YOUTUBE
// ============================================================

function normalizeYouTubeUrl(
    url
) {

    try {

        const parsed =
            new URL(url);

        // youtube.com/watch
        if (
            parsed.hostname.includes(
                'youtube.com'
            ) &&
            parsed.pathname ===
                '/watch'
        ) {

            const videoId =
                parsed.searchParams.get(
                    'v'
                );

            if (videoId) {

                return (
                    'https://www.youtube.com/watch?v=' +
                    videoId
                );
            }
        }

        // youtu.be
        if (
            parsed.hostname ===
            'youtu.be'
        ) {

            const videoId =
                parsed.pathname
                    .replace('/', '')
                    .trim();

            if (videoId) {

                return (
                    'https://www.youtube.com/watch?v=' +
                    videoId
                );
            }
        }

        return url;

    } catch {

        return url;
    }
}

// ============================================================
// EXTRAER VIDEO ID
// ============================================================

function getYouTubeVideoId(
    url
) {

    try {

        const parsed =
            new URL(url);

        if (
            parsed.hostname.includes(
                'youtube.com'
            )
        ) {

            return parsed
                .searchParams
                .get('v');
        }

        if (
            parsed.hostname ===
            'youtu.be'
        ) {

            return parsed
                .pathname
                .replace('/', '')
                .trim();
        }

    } catch {}

    return null;
}

// ============================================================
// STREAM YOUTUBE
// ============================================================

async function createYouTubeAudioStream(
    url
) {

    const yt =
        getYtDlp();

    console.log('');
    console.log(
        '=========================================='
    );

    console.log(
        '🎧 CREANDO STREAM DE YOUTUBE'
    );

    console.log(
        '=========================================='
    );

    console.log(
        `🔗 URL: ${url}`
    );

    /*
     * IMPORTANTE:
     *
     * No usamos:
     *
     *     toBuffer()
     *
     * ni descargamos el archivo completo.
     *
     * El audio se transmite mediante stream.
     */

    const streamBuilder =
        yt.stream(
            url,
            {

                rawArgs: [

                    '--no-playlist',

                    '--no-part',

                    '--no-cache-dir',

                    '--no-warnings',

                    '--quiet',

                    /*
                     * Intentamos utilizar clientes
                     * de YouTube que actualmente
                     * pueden funcionar sin los
                     * mismos requisitos del cliente web.
                     */

                    '--extractor-args',

                    'youtube:player_client=tv_simply,tv,web_embedded'
                ]
            }
        )
        .filter('audioonly')
        .quality(5)
        .type('opus');

    console.log(
        '🎧 Stream yt-dlp preparado.'
    );

    const stream =
        streamBuilder.getStream();

    if (!stream) {

        throw new Error(
            'yt-dlp no devolvió ningún stream.'
        );
    }

    console.log(
        '✅ Stream de audio obtenido.'
    );

    return stream;
}

// ============================================================
// DURACIÓN
// ============================================================

function formatDuration(
    seconds
) {

    if (
        !seconds ||
        !Number.isFinite(
            Number(seconds)
        )
    ) {

        return 'Desconocida';
    }

    seconds =
        Math.floor(
            Number(seconds)
        );

    const hours =
        Math.floor(
            seconds / 3600
        );

    const minutes =
        Math.floor(
            (seconds % 3600) / 60
        );

    const secs =
        seconds % 60;

    if (hours > 0) {

        return (
            `${hours}:` +
            `${String(minutes).padStart(2, '0')}:` +
            `${String(secs).padStart(2, '0')}`
        );
    }

    return (
        `${minutes}:` +
        `${String(secs).padStart(2, '0')}`
    );
}

// ============================================================
// /PLAY
// ============================================================

module.exports = {

    data:
        new SlashCommandBuilder()

            .setName('play')

            .setDescription(
                'Reproduce música en tu canal de voz'
            )

            .addStringOption(
                option =>
                    option
                        .setName('consulta')
                        .setDescription(
                            'URL de YouTube'
                        )
                        .setRequired(true)
            ),

    async execute(
        interaction
    ) {

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

        // ----------------------------------------------------
        // CANAL DE VOZ
        // ----------------------------------------------------

        const voiceChannel =
            interaction.member
                ?.voice
                ?.channel;

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
            interaction.options
                .getString(
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
                '❌ Error deferReply:',
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
                '🔊 PASO 1/3 — CONECTANDO A VOZ'
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
                '🎧 PASO 2/3 — PREPARANDO STREAM'
            );

            const normalizedUrl =
                normalizeYouTubeUrl(
                    query
                );

            console.log(
                `🔗 URL normalizada: ${normalizedUrl}`
            );

            const videoId =
                getYouTubeVideoId(
                    normalizedUrl
                );

            console.log(
                `🆔 Video ID: ${videoId || 'desconocido'}`
            );

            if (!videoId) {

                throw new Error(
                    'La URL proporcionada no parece ser un vídeo válido de YouTube.'
                );
            }

            // ------------------------------------------------
            // DETENER REPRODUCCIÓN ANTERIOR
            // ------------------------------------------------

            stopGuildAudio(
                guildId
            );

            // ------------------------------------------------
            // CREAR PLAYER
            // ------------------------------------------------

            const player =
                getAudioPlayer(
                    guildId
                );

            // ------------------------------------------------
            // CREAR STREAM
            // ------------------------------------------------

            const audioStream =
                await createYouTubeAudioStream(
                    normalizedUrl
                );

            guildStreams.set(
                guildId,
                audioStream
            );

            // ------------------------------------------------
            // AUDIO RESOURCE
            // ------------------------------------------------

            const resource =
                createAudioResource(
                    audioStream,
                    {
                        inputType:
                            StreamType.WebmOpus,

                        metadata: {
                            videoId,
                            url:
                                normalizedUrl
                        }
                    }
                );

            guildResources.set(
                guildId,
                resource
            );

            // ------------------------------------------------
            // SUSCRIBIR PLAYER
            // ------------------------------------------------

            console.log(
                '🔊 Suscribiendo player a Discord...'
            );

            connection.subscribe(
                player
            );

            // =================================================
            // PASO 3
            // =================================================

            console.log('');
            console.log(
                '▶️ PASO 3/3 — REPRODUCIENDO'
            );

            player.play(
                resource
            );

            console.log('');
            console.log(
                '=========================================='
            );

            console.log(
                '🎵 REPRODUCCIÓN INICIADA'
            );

            console.log(
                '=========================================='
            );

            console.log(
                `🆔 Video: ${videoId}`
            );

            console.log(
                `🔊 Canal: ${voiceChannel.name}`
            );

            console.log(
                '🎧 Ensordecido: NO'
            );

            console.log(
                '🔇 Muteado: NO'
            );

            console.log(
                '=========================================='
            );

            // ------------------------------------------------
            // EMBED
            // ------------------------------------------------

            const embed =
                new EmbedBuilder()
                    .setColor(
                        0x2ecc71
                    )
                    .setTitle(
                        '🎵 Reproduciendo'
                    )
                    .setDescription(
                        `[Abrir vídeo en YouTube](${normalizedUrl})`
                    )
                    .addFields({

                        name:
                            '🆔 Vídeo',

                        value:
                            videoId,

                        inline: true

                    }, {

                        name:
                            '🔊 Canal',

                        value:
                            voiceChannel.name,

                        inline: true

                    })
                    .setFooter({
                        text:
                            'RustLogix • Reproductor ligero'
                    });

            await interaction.editReply({
                embeds: [
                    embed
                ]
            });

        } catch (error) {

            console.error('');
            console.error(
                '=========================================='
            );

            console.error(
                '❌ ERROR EN /PLAY'
            );

            console.error(
                '=========================================='
            );

            console.error(
                error?.stack ||
                error?.message ||
                error
            );

            console.error(
                '=========================================='
            );

            console.error('');

            cleanupGuildStream(
                guildId
            );

            // ------------------------------------------------
            // MENSAJE ESPECIAL YOUTUBE
            // ------------------------------------------------

            let errorMessage =
                error?.message ||
                'Error desconocido';

            if (
                errorMessage.includes(
                    'Sign in to confirm'
                ) ||
                errorMessage.includes(
                    'not a bot'
                ) ||
                errorMessage.includes(
                    'LOGIN_REQUIRED'
                )
            ) {

                errorMessage =
                    'YouTube está bloqueando la extracción desde Render. Se necesita configurar autenticación/cookies o un mecanismo de PO Token para ese entorno.';
            }

            try {

                await interaction.editReply({

                    embeds: [

                        new EmbedBuilder()

                            .setColor(
                                0xe74c3c
                            )

                            .setTitle(
                                '❌ No se pudo reproducir'
                            )

                            .setDescription(
                                errorMessage
                            )

                            .addFields({

                                name:
                                    '🔊 Canal',

                                value:
                                    voiceChannel.name,

                                inline: true

                            })

                    ]

                });

            } catch (replyError) {

                console.error(
                    '❌ No se pudo editar respuesta:',
                    replyError?.message
                );
            }
        }
    }
};