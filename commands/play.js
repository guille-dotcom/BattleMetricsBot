const {
    SlashCommandBuilder,
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
    getVoiceConnection,
} = require('@discordjs/voice');

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const { YtDlp } = require('ytdlp-nodejs');

const FFMPEG_PATH = require('ffmpeg-static');

const players = new Map();
const streams = new Map();
const ffmpegProcesses = new Map();
const cookieFiles = new Map();

const BGUTIL_SERVER_HOME =
    process.env.BGUTIL_SERVER_HOME ||
    path.join(
        process.cwd(),
        'bgutil-ytdlp-pot-provider',
        'server'
    );

const TEMP_DIR = path.join(os.tmpdir(), 'rustlogix-play');

const MAX_START_TIME = 30000;


// ============================================================
// URL
// ============================================================

function normalizeYouTubeUrl(input) {
    try {
        const url = new URL(input);

        if (
            url.hostname.includes('youtube.com') ||
            url.hostname.includes('youtu.be')
        ) {
            const videoId =
                url.searchParams.get('v') ||
                (
                    url.hostname.includes('youtu.be')
                        ? url.pathname.replace('/', '')
                        : null
                );

            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
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

    if (!base64) {
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

        const cookies = Buffer.from(
            base64.trim(),
            'base64'
        );

        fs.writeFileSync(
            filePath,
            cookies,
            {
                mode: 0o600,
            }
        );

        cookieFiles.set(guildId, filePath);

        console.log('🍪 Cookies de YouTube preparadas.');
        console.log(`🍪 Archivo temporal: ${filePath}`);

        return filePath;
    } catch (error) {
        console.error(
            '❌ No se pudieron preparar las cookies:',
            error.message
        );

        return null;
    }
}


// ============================================================
// CLEANUP
// ============================================================

function cleanupGuild(guildId) {
    console.log(`🧹 Limpiando recursos (${guildId})`);

    const ffmpeg = ffmpegProcesses.get(guildId);

    if (ffmpeg) {
        try {
            ffmpeg.kill('SIGKILL');
        } catch (_) {}

        ffmpegProcesses.delete(guildId);
    }

    const stream = streams.get(guildId);

    if (stream) {
        try {
            stream.destroy();
        } catch (_) {}

        streams.delete(guildId);
    }

    const player = players.get(guildId);

    if (player) {
        try {
            player.stop(true);
        } catch (_) {}

        players.delete(guildId);
    }

    const cookieFile = cookieFiles.get(guildId);

    if (cookieFile) {
        try {
            fs.unlinkSync(cookieFile);
        } catch (_) {}

        cookieFiles.delete(guildId);
    }

    console.log('🧹 Limpieza terminada.');
}


// ============================================================
// YT-DLP
// ============================================================

async function createYouTubeStream(url, guildId) {
    console.log('');
    console.log('==========================================');
    console.log('🎧 CREANDO STREAM DE YOUTUBE');
    console.log('==========================================');
    console.log(`🔗 URL: ${url}`);
    console.log('');

    const bgutilExists = fs.existsSync(BGUTIL_SERVER_HOME);

    console.log('🤖 PO TOKEN PROVIDER');
    console.log(`📁 BGUTIL: ${BGUTIL_SERVER_HOME}`);
    console.log(`📁 Existe: ${bgutilExists ? 'SÍ' : 'NO'}`);

    if (!bgutilExists) {
        throw new Error(
            'No se encontró bgutil-ytdlp-pot-provider.'
        );
    }

    const cookieFile = prepareCookies(guildId);

    if (cookieFile) {
        console.log('🍪 Cookies agregadas a yt-dlp.');
    } else {
        console.log('🍪 yt-dlp funcionará sin cookies.');
    }

    console.log('🎬 Inicializando yt-dlp...');

    const yt = new YtDlp();

    console.log('✅ yt-dlp listo.');
    console.log('🚀 Construyendo stream de audio...');

    let builder = yt
        .stream(url)
        .filter('audioonly')
        .quality('highest')
        .type('webm');

    // --------------------------------------------------------
    // IMPORTANTE:
    // bgutil PO Token
    // --------------------------------------------------------

    builder = builder.addArgs(
        '--no-playlist',
        '--no-part',
        '--no-cache-dir',
        '--no-warnings',
        '--quiet',

        '--extractor-args',
        'youtube:player-client=mweb',

        '--extractor-args',
        `youtubepot-bgutilscript:server_home=${BGUTIL_SERVER_HOME}`,

        '--js-runtimes',
        `node:${process.execPath}`
    );

    if (cookieFile) {
        builder = builder.addArgs(
            '--cookies',
            cookieFile
        );
    }

    if (process.env.YOUTUBE_USER_AGENT) {
        builder = builder.addArgs(
            '--user-agent',
            process.env.YOUTUBE_USER_AGENT
        );
    }

    console.log('🤖 PO Token configurado.');

    console.log(
        '🤖 Solicitando PO Token mediante bgutil...'
    );

    const ytStream = builder.getStream();

    streams.set(guildId, ytStream);

    ytStream.on('data', () => {
        // El evento data confirma que YouTube
        // realmente está entregando audio.
    });

    ytStream.on('error', (error) => {
        console.error(
            '❌ ERROR DEL STREAM YT-DLP:',
            error.message
        );
    });

    ytStream.on('end', () => {
        console.log('🏁 Stream de YouTube finalizado.');
    });

    console.log('🎧 Stream yt-dlp preparado.');
    console.log('✅ Stream de audio obtenido.');

    return ytStream;
}


// ============================================================
// FFMPEG
// ============================================================

function createFFmpegStream(inputStream, guildId) {
    return new Promise((resolve, reject) => {

        console.log('');
        console.log('🎬 Preparando conversión FFmpeg...');
        console.log(`🎬 FFmpeg: ${FFMPEG_PATH}`);

        if (!FFMPEG_PATH) {
            reject(
                new Error('FFmpeg no está disponible.')
            );

            return;
        }

        /*
         * YouTube entrega WebM/Opus.
         *
         * Discord acepta Opus, pero usamos FFmpeg para garantizar
         * un flujo compatible y estable con @discordjs/voice.
         */

        const ffmpeg = spawn(
            FFMPEG_PATH,
            [
                '-hide_banner',
                '-loglevel',
                'error',

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

        ffmpegProcesses.set(
            guildId,
            ffmpeg
        );

        let settled = false;
        let firstAudioReceived = false;

        const timeout = setTimeout(() => {

            if (settled) {
                return;
            }

            console.error(
                '❌ FFmpeg no recibió audio dentro del tiempo esperado.'
            );

            try {
                ffmpeg.kill('SIGKILL');
            } catch (_) {}

            reject(
                new Error(
                    'FFmpeg no recibió audio de YouTube.'
                )
            );

        }, MAX_START_TIME);

        ffmpeg.stdout.once('data', () => {

            if (firstAudioReceived) {
                return;
            }

            firstAudioReceived = true;

            console.log(
                '🎵 FFmpeg comenzó a producir audio.'
            );

            clearTimeout(timeout);

            if (!settled) {
                settled = true;
                resolve(ffmpeg.stdout);
            }
        });

        ffmpeg.stderr.on('data', (data) => {

            const message = data
                .toString()
                .trim();

            if (message) {
                console.error(
                    `🎬 FFmpeg: ${message}`
                );
            }
        });

        ffmpeg.on('error', (error) => {

            clearTimeout(timeout);

            if (!settled) {
                settled = true;
                reject(error);
            }
        });

        ffmpeg.on('close', (code, signal) => {

            clearTimeout(timeout);

            console.log(
                `🎬 FFmpeg finalizado. Código: ${code} Señal: ${signal || 'ninguna'}`
            );

            if (
                !firstAudioReceived &&
                !settled
            ) {
                settled = true;

                reject(
                    new Error(
                        `FFmpeg terminó sin producir audio. Código: ${code}`
                    )
                );
            }
        });

        /*
         * Conectamos yt-dlp directamente al stdin de FFmpeg.
         *
         * Esto evita buffers completos en memoria.
         */

        inputStream.pipe(
            ffmpeg.stdin
        );

        inputStream.on('error', (error) => {

            console.error(
                '❌ Error del input de FFmpeg:',
                error.message
            );

            try {
                ffmpeg.stdin.destroy();
            } catch (_) {}

            clearTimeout(timeout);

            if (!settled) {
                settled = true;
                reject(error);
            }
        });
    });
}


// ============================================================
// PLAY
// ============================================================

async function execute(interaction) {

    const guildId = interaction.guild.id;

    console.log('');
    console.log('🎯 EJECUTANDO /PLAY');
    console.log('==========================================');

    const voiceChannel =
        interaction.member?.voice?.channel;

    if (!voiceChannel) {

        await interaction.reply({
            content:
                '❌ Debes estar conectado a un canal de voz.',
            ephemeral: true,
        });

        return;
    }

    const query =
        interaction.options.getString('consulta');

    if (!query) {

        await interaction.reply({
            content:
                '❌ Debes indicar una canción o URL de YouTube.',
            ephemeral: true,
        });

        return;
    }

    const url =
        normalizeYouTubeUrl(query);

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

        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({
                ephemeral: true,
            });
        }

        /*
         * Si ya había reproducción en este servidor,
         * la detenemos antes de comenzar otra.
         */

        cleanupGuild(guildId);

        // ====================================================
        // VOZ
        // ====================================================

        console.log('');
        console.log(
            '🔊 CONECTANDO A VOZ'
        );

        let connection =
            getVoiceConnection(guildId);

        if (!connection) {

            connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId,
                adapterCreator:
                    interaction.guild.voiceAdapterCreator,

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

        // ====================================================
        // AUDIO PLAYER
        // ====================================================

        const player =
            createAudioPlayer({
                behaviors: {
                    noSubscriber:
                        NoSubscriberBehavior.Play,
                },
            });

        players.set(
            guildId,
            player
        );

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
                console.error(
                    '❌ ERROR DEL AUDIO PLAYER:',
                    error
                );
            }
        );

        connection.subscribe(player);

        // ====================================================
        // YOUTUBE
        // ====================================================

        console.log('');
        console.log(
            '🎧 OBTENIENDO AUDIO DE YOUTUBE'
        );

        const youtubeStream =
            await createYouTubeStream(
                url,
                guildId
            );

        // ====================================================
        // FFMPEG
        // ====================================================

        const audioStream =
            await createFFmpegStream(
                youtubeStream,
                guildId
            );

        // ====================================================
        // DISCORD RESOURCE
        // ====================================================

        console.log(
            '🎵 Creando AudioResource...'
        );

        const resource =
            createAudioResource(
                audioStream,
                {
                    inputType:
                        StreamType.OggOpus,

                    inlineVolume: false,
                }
            );

        console.log(
            '🔊 Reproduciendo en Discord...'
        );

        player.play(resource);

        /*
         * No necesitamos mantener la interacción abierta
         * esperando toda la canción.
         */

        await interaction.editReply({
            content: '▶️ Reproduciendo.',
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
        console.error(error);

        cleanupGuild(guildId);

        try {

            if (
                interaction.deferred &&
                !interaction.replied
            ) {
                await interaction.editReply({
                    content:
                        '❌ No se pudo reproducir la canción.',
                });
            }

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
            'Reproduce una canción de YouTube en tu canal de voz'
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
        return execute(interaction);
    },
};