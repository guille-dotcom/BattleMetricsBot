const { SlashCommandBuilder } = require('discord.js');

const {
    joinVoiceChannel,
    entersState,
    VoiceConnectionStatus,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    NoSubscriberBehavior,
    StreamType,
    getVoiceConnection,
} = require('@discordjs/voice');

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { YtDlp } = require('ytdlp-nodejs');
const FFMPEG_PATH = require('ffmpeg-static');


// ============================================================
// CONFIGURACIÓN
// ============================================================

const BGUTIL_SERVER_HOME =
    process.env.BGUTIL_SERVER_HOME ||
    path.join(
        process.cwd(),
        'bgutil-ytdlp-pot-provider',
        'server'
    );

const TEMP_DIR = path.join(
    os.tmpdir(),
    'rustlogix-play'
);

const START_TIMEOUT = 30000;


// ============================================================
// ESTADO
// ============================================================

const guildState = new Map();


// ============================================================
// URL
// ============================================================

function normalizeYouTubeUrl(input) {
    try {
        const url = new URL(input);

        if (url.hostname.includes('youtu.be')) {
            const id = url.pathname.replace(/^\/+/, '').split('/')[0];

            if (id) {
                return `https://www.youtube.com/watch?v=${id}`;
            }
        }

        if (url.hostname.includes('youtube.com')) {
            const id = url.searchParams.get('v');

            if (id) {
                return `https://www.youtube.com/watch?v=${id}`;
            }
        }
    } catch (_) {}

    return input;
}


// ============================================================
// COOKIES
// ============================================================

function prepareCookies(guildId) {
    const base64 = process.env.YOUTUBE_COOKIES_B64;

    if (!base64 || !base64.trim()) {
        console.log('🍪 YOUTUBE_COOKIES_B64 no configurado.');
        return null;
    }

    try {
        fs.mkdirSync(TEMP_DIR, {
            recursive: true,
            mode: 0o700,
        });

        const filePath = path.join(
            TEMP_DIR,
            `youtube-cookies-${process.pid}-${guildId}.txt`
        );

        const buffer = Buffer.from(
            base64.trim(),
            'base64'
        );

        fs.writeFileSync(
            filePath,
            buffer,
            {
                mode: 0o600,
            }
        );

        console.log('🍪 Cookies de YouTube preparadas.');
        console.log(`🍪 Archivo temporal: ${filePath}`);

        return filePath;

    } catch (error) {
        console.error(
            '❌ Error preparando cookies:',
            error.message
        );

        return null;
    }
}


// ============================================================
// LIMPIEZA
// ============================================================

function cleanupGuild(guildId) {
    const state = guildState.get(guildId);

    if (!state) {
        return;
    }

    console.log(
        `🧹 Limpiando recursos (${guildId})`
    );

    if (state.ffmpeg) {
        try {
            state.ffmpeg.kill('SIGKILL');
        } catch (_) {}
    }

    if (state.youtubeStream) {
        try {
            state.youtubeStream.destroy();
        } catch (_) {}
    }

    if (state.player) {
        try {
            state.player.stop(true);
        } catch (_) {}
    }

    if (state.cookieFile) {
        try {
            fs.unlinkSync(
                state.cookieFile
            );
        } catch (_) {}
    }

    guildState.delete(guildId);

    console.log(
        '🧹 Limpieza terminada.'
    );
}


// ============================================================
// YT-DLP
// ============================================================

async function createYouTubeStream(
    url,
    guildId
) {
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

    const bgutilExists =
        fs.existsSync(
            BGUTIL_SERVER_HOME
        );

    console.log('');
    console.log(
        '🤖 PO TOKEN PROVIDER'
    );
    console.log(
        `📁 BGUTIL: ${BGUTIL_SERVER_HOME}`
    );
    console.log(
        `📁 Existe: ${bgutilExists ? 'SÍ' : 'NO'}`
    );

    if (!bgutilExists) {
        throw new Error(
            'No se encontró bgutil-ytdlp-pot-provider/server.'
        );
    }

    const cookieFile =
        prepareCookies(guildId);

    if (cookieFile) {
        console.log(
            '🍪 Cookies agregadas a yt-dlp.'
        );
    }

    console.log(
        '🎬 Inicializando yt-dlp...'
    );

    const yt = new YtDlp();

    console.log(
        '✅ yt-dlp listo.'
    );

    console.log(
        '🚀 Construyendo stream...'
    );

    /*
     * IMPORTANTE:
     *
     * No forzamos mweb.
     *
     * Dejamos que yt-dlp utilice sus clientes
     * actuales y únicamente configuramos bgutil.
     */

    let builder = yt
        .stream(url)
        .filter('audioonly')
        .quality('highest');

    // --------------------------------------------------------
    // Argumentos básicos
    // --------------------------------------------------------

    builder = builder.addArgs(
        '--no-playlist',
        '--no-part',
        '--no-cache-dir',

        /*
         * NO usamos:
         * --quiet
         * --no-warnings
         *
         * Queremos ver el error real.
         */

        '--newline',

        '--js-runtimes',
        `node:${process.execPath}`,

        '--extractor-args',
        `youtubepot-bgutilscript:server_home=${BGUTIL_SERVER_HOME}`
    );

    // --------------------------------------------------------
    // Cookies
    // --------------------------------------------------------

    if (cookieFile) {
        builder = builder.addArgs(
            '--cookies',
            cookieFile
        );
    }

    // --------------------------------------------------------
    // User Agent opcional
    // --------------------------------------------------------

    if (process.env.YOUTUBE_USER_AGENT) {
        builder = builder.addArgs(
            '--user-agent',
            process.env.YOUTUBE_USER_AGENT
        );
    }

    console.log(
        '🤖 PO Token configurado.'
    );

    console.log(
        '🍪 Cookies:',
        cookieFile ? 'SÍ' : 'NO'
    );

    console.log(
        '🔍 Modo diagnóstico yt-dlp: ACTIVADO'
    );

    console.log(
        '🚀 Iniciando stream de yt-dlp...'
    );

    /*
     * getStream() devuelve el stream real
     * generado por yt-dlp.
     */

    const stream =
        builder.getStream();

    const state =
        guildState.get(guildId);

    if (state) {
        state.youtubeStream = stream;
    }

    // --------------------------------------------------------
    // Eventos
    // --------------------------------------------------------

    stream.on(
        'error',
        (error) => {

            console.error('');
            console.error(
                '=========================================='
            );
            console.error(
                '❌ ERROR REAL DE YT-DLP'
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
        }
    );

    stream.on(
        'end',
        () => {
            console.log(
                '🏁 yt-dlp terminó el stream.'
            );
        }
    );

    stream.on(
        'data',
        () => {
            console.log(
                '🎵 yt-dlp está entregando audio.'
            );

            stream.removeAllListeners(
                'data'
            );
        }
    );

    console.log(
        '🎧 Stream yt-dlp preparado.'
    );

    return stream;
}


// ============================================================
// FFMPEG
// ============================================================

function createFFmpegStream(
    inputStream,
    guildId
) {
    return new Promise(
        (resolve, reject) => {

            console.log('');
            console.log(
                '🎬 PREPARANDO FFMPEG'
            );
            console.log(
                `🎬 FFmpeg: ${FFMPEG_PATH}`
            );

            if (!FFMPEG_PATH) {
                reject(
                    new Error(
                        'ffmpeg-static no está disponible.'
                    )
                );

                return;
            }

            const ffmpeg =
                spawn(
                    FFMPEG_PATH,
                    [
                        '-hide_banner',

                        /*
                         * IMPORTANTE:
                         * error para ver exactamente
                         * qué está pasando.
                         */
                        '-loglevel',
                        'warning',

                        '-i',
                        'pipe:0',

                        '-vn',

                        '-c:a',
                        'libopus',

                        '-b:a',
                        '128k',

                        '-ar',
                        '48000',

                        '-ac',
                        '2',

                        '-f',
                        'ogg',

                        'pipe:1',
                    ],
                    {
                        stdio: [
                            'pipe',
                            'pipe',
                            'pipe',
                        ],
                    }
                );

            const state =
                guildState.get(guildId);

            if (state) {
                state.ffmpeg = ffmpeg;
            }

            let resolved = false;
            let firstData = false;

            const timeout =
                setTimeout(
                    () => {

                        if (firstData) {
                            return;
                        }

                        console.error('');
                        console.error(
                            '=========================================='
                        );
                        console.error(
                            '❌ FFmpeg NO RECIBIÓ AUDIO'
                        );
                        console.error(
                            '=========================================='
                        );

                        try {
                            ffmpeg.kill(
                                'SIGKILL'
                            );
                        } catch (_) {}

                        if (!resolved) {
                            resolved = true;

                            reject(
                                new Error(
                                    'FFmpeg no recibió audio de yt-dlp dentro del tiempo esperado.'
                                )
                            );
                        }

                    },
                    START_TIMEOUT
                );

            // ------------------------------------------------
            // AUDIO
            // ------------------------------------------------

            ffmpeg.stdout.once(
                'data',
                () => {

                    firstData = true;

                    clearTimeout(
                        timeout
                    );

                    console.log(
                        '🎵 FFmpeg comenzó a producir audio.'
                    );

                    if (!resolved) {
                        resolved = true;

                        resolve(
                            ffmpeg.stdout
                        );
                    }
                }
            );

            // ------------------------------------------------
            // STDERR
            // ------------------------------------------------

            ffmpeg.stderr.on(
                'data',
                (data) => {

                    const text =
                        data
                            .toString()
                            .trim();

                    if (text) {
                        console.error(
                            `🎬 FFmpeg: ${text}`
                        );
                    }
                }
            );

            // ------------------------------------------------
            // ERROR
            // ------------------------------------------------

            ffmpeg.on(
                'error',
                (error) => {

                    clearTimeout(
                        timeout
                    );

                    console.error(
                        '❌ Error de proceso FFmpeg:',
                        error.message
                    );

                    if (!resolved) {
                        resolved = true;
                        reject(error);
                    }
                }
            );

            // ------------------------------------------------
            // CLOSE
            // ------------------------------------------------

            ffmpeg.on(
                'close',
                (code, signal) => {

                    clearTimeout(
                        timeout
                    );

                    console.log(
                        `🎬 FFmpeg finalizado. Código: ${code} Señal: ${signal || 'ninguna'}`
                    );

                    if (
                        !firstData &&
                        !resolved
                    ) {
                        resolved = true;

                        reject(
                            new Error(
                                `FFmpeg terminó sin producir audio. Código: ${code}`
                            )
                        );
                    }
                }
            );

            // ------------------------------------------------
            // YT-DLP -> FFMPEG
            // ------------------------------------------------

            inputStream.on(
                'error',
                (error) => {

                    console.error('');
                    console.error(
                        '=========================================='
                    );
                    console.error(
                        '❌ ERROR DEL STREAM YT-DLP'
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

                    try {
                        ffmpeg.stdin.destroy(
                            error
                        );
                    } catch (_) {}

                    clearTimeout(
                        timeout
                    );

                    if (!resolved) {
                        resolved = true;
                        reject(error);
                    }
                }
            );

            inputStream.pipe(
                ffmpeg.stdin
            );
        }
    );
}


// ============================================================
// ESPERAR PLAYING
// ============================================================

function waitForPlaying(
    player,
    timeoutMs = 15000
) {
    return new Promise(
        (resolve, reject) => {

            if (
                player.state.status ===
                AudioPlayerStatus.Playing
            ) {
                resolve();
                return;
            }

            const timeout =
                setTimeout(
                    () => {

                        cleanup();

                        reject(
                            new Error(
                                'Discord no comenzó a reproducir el audio.'
                            )
                        );

                    },
                    timeoutMs
                );

            const onPlaying =
                () => {

                    cleanup();
                    resolve();
                };

            const onError =
                (error) => {

                    cleanup();
                    reject(error);
                };

            function cleanup() {

                clearTimeout(
                    timeout
                );

                player.off(
                    AudioPlayerStatus.Playing,
                    onPlaying
                );

                player.off(
                    'error',
                    onError
                );
            }

            player.once(
                AudioPlayerStatus.Playing,
                onPlaying
            );

            player.once(
                'error',
                onError
            );
        }
    );
}


// ============================================================
// EXECUTE
// ============================================================

async function execute(
    interaction
) {

    const guildId =
        interaction.guild.id;

    console.log('');
    console.log(
        '🎯 EJECUTANDO /PLAY'
    );
    console.log(
        '=========================================='
    );

    const voiceChannel =
        interaction.member?.voice?.channel;

    if (!voiceChannel) {

        await interaction.reply({
            content:
                '❌ Debes estar conectado a un canal de voz.',
        });

        return;
    }

    const query =
        interaction.options.getString(
            'consulta'
        );

    if (!query) {

        await interaction.reply({
            content:
                '❌ Debes indicar una canción o URL de YouTube.',
        });

        return;
    }

    const url =
        normalizeYouTubeUrl(
            query
        );

    console.log(
        `🔊 Canal de voz: ${voiceChannel.name} (${voiceChannel.id})`
    );

    console.log(
        `🎯 Consulta recibida: ${query}`
    );

    console.log(
        `🔗 URL normalizada: ${url}`
    );

    try {

        await interaction.deferReply({
            ephemeral: true,
        });

        // ----------------------------------------------------
        // LIMPIAR REPRODUCCIÓN ANTERIOR
        // ----------------------------------------------------

        cleanupGuild(
            guildId
        );

        // ----------------------------------------------------
        // ESTADO
        // ----------------------------------------------------

        guildState.set(
            guildId,
            {
                player: null,
                youtubeStream: null,
                ffmpeg: null,
                cookieFile: null,
            }
        );

        // ----------------------------------------------------
        // VOICE
        // ----------------------------------------------------

        console.log('');
        console.log(
            '🔊 CONECTANDO A VOZ'
        );

        let connection =
            getVoiceConnection(
                guildId
            );

        if (!connection) {

            connection =
                joinVoiceChannel({
                    channelId:
                        voiceChannel.id,

                    guildId,

                    adapterCreator:
                        interaction.guild
                            .voiceAdapterCreator,

                    selfDeaf: false,
                    selfMute: false,
                });
        }

        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            15000
        );

        console.log(
            '🔊 CONECTADO A VOZ CORRECTAMENTE'
        );

        // ----------------------------------------------------
        // PLAYER
        // ----------------------------------------------------

        const player =
            createAudioPlayer({
                behaviors: {
                    noSubscriber:
                        NoSubscriberBehavior.Play,
                },
            });

        const state =
            guildState.get(
                guildId
            );

        state.player =
            player;

        player.on(
            AudioPlayerStatus.Playing,
            () => {
                console.log(
                    '▶️ AUDIO REPRODUCIÉNDOSE'
                );
            }
        );

        player.on(
            AudioPlayerStatus.Buffering,
            () => {
                console.log(
                    '⏳ AUDIO BUFFERING'
                );
            }
        );

        player.on(
            AudioPlayerStatus.Idle,
            () => {
                console.log(
                    '🏁 AUDIO FINALIZADO'
                );
            }
        );

        player.on(
            'error',
            (error) => {

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
            }
        );

        connection.subscribe(
            player
        );

        // ----------------------------------------------------
        // YOUTUBE
        // ----------------------------------------------------

        const youtubeStream =
            await createYouTubeStream(
                url,
                guildId
            );

        // ----------------------------------------------------
        // FFMPEG
        // ----------------------------------------------------

        const audioStream =
            await createFFmpegStream(
                youtubeStream,
                guildId
            );

        // ----------------------------------------------------
        // AUDIO RESOURCE
        // ----------------------------------------------------

        console.log(
            '🎵 Creando AudioResource...'
        );

        const resource =
            createAudioResource(
                audioStream,
                {
                    inputType:
                        StreamType.OggOpus,

                    inlineVolume:
                        false,
                }
            );

        // ----------------------------------------------------
        // PLAY
        // ----------------------------------------------------

        console.log(
            '🔊 Enviando audio a Discord...'
        );

        player.play(
            resource
        );

        await waitForPlaying(
            player,
            15000
        );

        console.log(
            '=========================================='
        );
        console.log(
            '✅ /PLAY FUNCIONANDO'
        );
        console.log(
            '=========================================='
        );

        /*
         * El usuario solo recibe esto.
         */

        await interaction.editReply({
            content:
                '▶️ Reproduciendo.',
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

        cleanupGuild(
            guildId
        );

        try {

            await interaction.editReply({
                content:
                    '❌ No se pudo reproducir la canción.',
            });

        } catch (_) {}
    }
}


// ============================================================
// COMMAND
// ============================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription(
            'Reproduce una canción de YouTube'
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

    async execute(interaction) {
        return execute(
            interaction
        );
    },
};