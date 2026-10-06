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

const YtDlp = require('ytdlp-nodejs');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');


// ============================================================
// CONFIGURACIÓN
// ============================================================

const VOICE_TIMEOUT = 30000;

const BGUTIL_SERVER_HOME = path.join(
    process.cwd(),
    'bgutil-ytdlp-pot-provider',
    'server'
);

const COOKIE_FILE = path.join(
    os.tmpdir(),
    `rustlogix-youtube-cookies-${process.pid}.txt`
);


// ============================================================
// MAPAS POR SERVIDOR
// ============================================================

const players = new Map();
const connections = new Map();
const ytStreams = new Map();
const ffmpegProcesses = new Map();
const resources = new Map();


// ============================================================
// YOUTUBE COOKIES
// ============================================================

function prepareYouTubeCookies() {

    const encoded = process.env.YOUTUBE_COOKIES_B64;

    if (!encoded) {
        console.log('🍪 YOUTUBE_COOKIES_B64 no configurado.');
        console.log('🍪 Continuando sin cookies.');
        return null;
    }

    try {

        const cookies = Buffer
            .from(encoded, 'base64')
            .toString('utf8');

        if (!cookies.trim()) {
            console.log('⚠️ YOUTUBE_COOKIES_B64 está vacío.');
            return null;
        }

        const firstLine = cookies
            .split(/\r?\n/)
            .find(line => line.trim().length > 0);

        if (
            !firstLine ||
            (
                !firstLine.includes('# HTTP Cookie File') &&
                !firstLine.includes('# Netscape HTTP Cookie File')
            )
        ) {

            console.log('⚠️ El archivo de cookies no parece estar en formato Netscape.');

            return null;
        }

        fs.writeFileSync(
            COOKIE_FILE,
            cookies,
            {
                encoding: 'utf8',
                mode: 0o600
            }
        );

        console.log('🍪 Cookies de YouTube preparadas.');
        console.log(`🍪 Archivo temporal: ${COOKIE_FILE}`);

        return COOKIE_FILE;

    } catch (error) {

        console.error('❌ Error preparando cookies:', error.message);

        return null;
    }
}


// ============================================================
// NORMALIZAR URL
// ============================================================

function normalizeYouTubeUrl(input) {

    let value = String(input || '').trim();

    if (!value) {
        return null;
    }

    // youtube.com/watch
    try {

        const url = new URL(value);

        if (
            url.hostname.includes('youtube.com') ||
            url.hostname.includes('youtu.be')
        ) {

            let videoId = null;

            if (url.hostname.includes('youtu.be')) {

                videoId = url.pathname
                    .replace('/', '')
                    .trim();

            } else {

                videoId = url.searchParams.get('v');
            }

            if (videoId) {

                videoId = videoId
                    .replace(/[^a-zA-Z0-9_-]/g, '');

                if (videoId.length >= 6) {

                    return `https://www.youtube.com/watch?v=${videoId}`;
                }
            }
        }

    } catch {
        // Continúa abajo.
    }

    // URL simple de YouTube
    const match = value.match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/
    );

    if (match) {

        return `https://www.youtube.com/watch?v=${match[1]}`;
    }

    return value;
}


// ============================================================
// OBTENER VIDEO ID
// ============================================================

function getVideoId(url) {

    try {

        const parsed = new URL(url);

        const id = parsed.searchParams.get('v');

        if (id) {
            return id;
        }

        if (parsed.hostname.includes('youtu.be')) {

            return parsed.pathname
                .replace('/', '')
                .trim();
        }

    } catch {
        // Ignorar.
    }

    return 'desconocido';
}


// ============================================================
// LIMPIAR RECURSOS
// ============================================================

function cleanupGuild(guildId) {

    console.log('');
    console.log('==========================================');
    console.log(`🧹 LIMPIANDO RECURSOS (${guildId})`);
    console.log('==========================================');

    // --------------------------------------------------------
    // FFmpeg
    // --------------------------------------------------------

    const ffmpeg = ffmpegProcesses.get(guildId);

    if (ffmpeg) {

        try {

            if (!ffmpeg.killed) {
                ffmpeg.kill('SIGKILL');
            }

        } catch {}

        ffmpegProcesses.delete(guildId);
    }


    // --------------------------------------------------------
    // yt-dlp stream
    // --------------------------------------------------------

    const ytStream = ytStreams.get(guildId);

    if (ytStream) {

        try {

            if (typeof ytStream.destroy === 'function') {
                ytStream.destroy();
            }

        } catch {}

        ytStreams.delete(guildId);
    }


    // --------------------------------------------------------
    // Audio player
    // --------------------------------------------------------

    const player = players.get(guildId);

    if (player) {

        try {
            player.stop(true);
        } catch {}

        players.delete(guildId);
    }


    // --------------------------------------------------------
    // Resource
    // --------------------------------------------------------

    resources.delete(guildId);


    // --------------------------------------------------------
    // Voice connection
    // --------------------------------------------------------

    const connection = connections.get(guildId);

    if (connection) {

        try {
            connection.destroy();
        } catch {}

        connections.delete(guildId);

    } else {

        const existing = getVoiceConnection(guildId);

        if (existing) {

            try {
                existing.destroy();
            } catch {}
        }
    }


    // --------------------------------------------------------
    // Cookies temporales
    // --------------------------------------------------------

    try {

        if (fs.existsSync(COOKIE_FILE)) {
            fs.unlinkSync(COOKIE_FILE);
        }

    } catch {}


    console.log('🧹 Limpieza terminada.');
}


// ============================================================
// CREAR CONEXIÓN DE VOZ
// ============================================================

async function connectToVoice(channel) {

    const guildId = channel.guild.id;

    console.log('');
    console.log('🔊 Creando conexión explícita...');

    // Si ya existe una conexión anterior, eliminarla.
    const oldConnection = getVoiceConnection(guildId);

    if (oldConnection) {

        try {
            oldConnection.destroy();
        } catch {}
    }

    const connection = joinVoiceChannel({

        channelId: channel.id,

        guildId: guildId,

        adapterCreator: channel.guild.voiceAdapterCreator,

        selfDeaf: false,

        selfMute: false

    });

    connections.set(guildId, connection);

    console.log('🔊 Conexión creada.');

    console.log('⏳ Esperando estado READY de Discord...');

    await entersState(
        connection,
        VoiceConnectionStatus.Ready,
        VOICE_TIMEOUT
    );

    console.log('');
    console.log('==========================================');
    console.log('🔊 CONECTADO A VOZ CORRECTAMENTE');
    console.log(`🔊 Canal: ${channel.name}`);
    console.log(`🔊 ID: ${channel.id}`);
    console.log('🎧 Ensordecido: NO');
    console.log('🔇 Muteado: NO');
    console.log('==========================================');

    return connection;
}


// ============================================================
// CREAR STREAM YTDLP
// ============================================================

function createYouTubeStream(url, guildId) {

    return new Promise((resolve, reject) => {

        console.log('');
        console.log('==========================================');
        console.log('🎧 CREANDO STREAM DE YOUTUBE');
        console.log('==========================================');

        console.log(`🔗 URL: ${url}`);

        console.log('');
        console.log('🤖 PO TOKEN PROVIDER');
        console.log(`📁 BGUTIL: ${BGUTIL_SERVER_HOME}`);

        const bgutilExists = fs.existsSync(BGUTIL_SERVER_HOME);

        console.log(
            `📁 Existe: ${bgutilExists ? 'SÍ' : 'NO'}`
        );

        if (!bgutilExists) {

            console.log(
                '⚠️ ADVERTENCIA: no se encontró BGUTIL.'
            );
        }


        // ----------------------------------------------------
        // yt-dlp
        // ----------------------------------------------------

        let yt;

        try {

            yt = new YtDlp();

            console.log('🎬 yt-dlp inicializado.');

        } catch (error) {

            console.error(
                '❌ No se pudo inicializar yt-dlp:',
                error.message
            );

            reject(error);
            return;
        }


        // ----------------------------------------------------
        // Cookies
        // ----------------------------------------------------

        const cookieFile = prepareYouTubeCookies();


        // ----------------------------------------------------
        // Crear stream
        // ----------------------------------------------------

        let streamBuilder;

        try {

            streamBuilder = yt
                .stream(url)
                .filter('audioonly')
                .quality(5)
                .type('opus');

        } catch (error) {

            console.error(
                '❌ Error creando stream yt-dlp:',
                error.message
            );

            reject(error);
            return;
        }


        // ----------------------------------------------------
        // Argumentos yt-dlp
        // ----------------------------------------------------

        streamBuilder.addArgs(

            '--no-playlist',

            '--no-part',

            '--no-cache-dir',

            '--no-warnings',

            '--quiet',

            '--no-progress',

            '--extractor-args',
            'youtube:player_client=mweb',

            '--extractor-args',
            `youtubepot-bgutilscript:server_home=${BGUTIL_SERVER_HOME}`,

            '--js-runtimes',
            `node:${process.execPath}`

        );


        // ----------------------------------------------------
        // Cookies opcionales
        // ----------------------------------------------------

        if (cookieFile) {

            streamBuilder.addArgs(
                '--cookies',
                cookieFile
            );

            console.log(
                '🍪 yt-dlp utilizará cookies de YouTube.'
            );

        } else {

            console.log(
                '🍪 yt-dlp funcionará sin cookies.'
            );
        }


        // ----------------------------------------------------
        // User-Agent opcional
        // ----------------------------------------------------

        if (process.env.YOUTUBE_USER_AGENT) {

            streamBuilder.addArgs(
                '--user-agent',
                process.env.YOUTUBE_USER_AGENT
            );

            console.log(
                '🧑‍💻 User-Agent personalizado configurado.'
            );
        }


        console.log('');
        console.log('🚀 Iniciando yt-dlp...');
        console.log('🤖 Solicitando PO Token mediante bgutil...');


        // ----------------------------------------------------
        // Obtener stream
        // ----------------------------------------------------

        let ytStream;

        try {

            ytStream = streamBuilder;

        } catch (error) {

            console.error(
                '❌ Error obteniendo stream:',
                error.message
            );

            reject(error);
            return;
        }


        if (!ytStream) {

            reject(
                new Error('yt-dlp no devolvió ningún stream.')
            );

            return;
        }


        ytStreams.set(guildId, ytStream);


        // ----------------------------------------------------
        // Eventos del stream
        // ----------------------------------------------------

        let resolved = false;

        ytStream.once('readable', () => {

            if (resolved) {
                return;
            }

            resolved = true;

            console.log('📡 Stream yt-dlp tiene datos disponibles.');
            console.log('🎧 Stream de audio obtenido.');

            resolve(ytStream);
        });


        ytStream.once('data', () => {

            if (resolved) {
                return;
            }

            resolved = true;

            console.log('📡 Primer paquete de audio recibido.');
            console.log('🎧 Stream de audio obtenido.');

            resolve(ytStream);
        });


        ytStream.once('error', error => {

            console.error('');
            console.error('==========================================');
            console.error('❌ ERROR EN STREAM YT-DLP');
            console.error('==========================================');
            console.error(error);

            if (!resolved) {

                resolved = true;

                reject(error);
            }
        });


        ytStream.once('end', () => {

            console.log('🏁 Stream yt-dlp terminó.');

            if (!resolved) {

                resolved = true;

                reject(
                    new Error(
                        'yt-dlp terminó sin entregar audio.'
                    )
                );
            }
        });


        ytStream.once('close', () => {

            console.log('🔒 Stream yt-dlp cerrado.');
        });


        // ----------------------------------------------------
        // Timeout de stream
        // ----------------------------------------------------

        setTimeout(() => {

            if (!resolved) {

                resolved = true;

                console.error(
                    '❌ Timeout esperando datos de yt-dlp.'
                );

                try {

                    if (
                        ytStream &&
                        typeof ytStream.destroy === 'function'
                    ) {
                        ytStream.destroy();
                    }

                } catch {}

                reject(
                    new Error(
                        'yt-dlp no entregó audio dentro del tiempo esperado.'
                    )
                );
            }

        }, 30000);
    });
}


// ============================================================
// FFmpeg
// ============================================================

function createFFmpegStream(inputStream, guildId) {

    return new Promise((resolve, reject) => {

        console.log('');
        console.log('==========================================');
        console.log('🎬 INICIANDO FFMPEG');
        console.log('==========================================');

        console.log(`🎬 FFmpeg: ${ffmpegPath}`);

        if (!ffmpegPath) {

            reject(
                new Error(
                    'ffmpeg-static no encontró el ejecutable.'
                )
            );

            return;
        }


        /*
         * Entrada:
         * WebM/Opus desde yt-dlp
         *
         * Salida:
         * OGG/Opus para Discord
         *
         * No almacenamos el audio completo.
         * Todo ocurre por streaming.
         */

        const ffmpeg = spawn(

            ffmpegPath,

            [

                '-hide_banner',

                '-loglevel',
                'error',

                '-i',
                'pipe:0',

                '-vn',

                '-map',
                '0:a:0',

                '-c:a',
                'libopus',

                '-b:a',
                '128k',

                '-vbr',
                'on',

                '-application',
                'audio',

                '-f',
                'ogg',

                'pipe:1'

            ],

            {
                stdio: [
                    'pipe',
                    'pipe',
                    'pipe'
                ]
            }
        );


        ffmpegProcesses.set(
            guildId,
            ffmpeg
        );


        let stderr = '';

        ffmpeg.stderr.on(
            'data',
            chunk => {

                const message =
                    chunk.toString();

                stderr += message;

                console.error(
                    `🎬 FFmpeg: ${message.trim()}`
                );
            }
        );


        ffmpeg.once(
            'error',
            error => {

                console.error(
                    '❌ Error iniciando FFmpeg:',
                    error.message
                );

                ffmpegProcesses.delete(
                    guildId
                );

                reject(error);
            }
        );


        ffmpeg.once(
            'close',
            code => {

                console.log(
                    `🎬 FFmpeg terminó. Código: ${code}`
                );

                ffmpegProcesses.delete(
                    guildId
                );

                if (
                    code !== 0 &&
                    code !== null
                ) {

                    console.error(
                        '❌ FFmpeg terminó con error.'
                    );

                    if (stderr.trim()) {

                        console.error(
                            stderr.trim()
                        );
                    }
                }
            }
        );


        inputStream.on(
            'error',
            error => {

                console.error(
                    '❌ Error del stream de entrada:',
                    error.message
                );

                try {
                    ffmpeg.stdin.destroy();
                } catch {}

                reject(error);
            }
        );


        inputStream.pipe(
            ffmpeg.stdin
        );


        let firstData = false;

        ffmpeg.stdout.once(
            'data',
            () => {

                if (firstData) {
                    return;
                }

                firstData = true;

                console.log(
                    '🎬 FFmpeg está entregando audio.'
                );

                console.log(
                    '🎧 Audio listo para Discord.'
                );

                resolve(
                    ffmpeg.stdout
                );
            }
        );


        setTimeout(() => {

            if (!firstData) {

                console.error(
                    '❌ FFmpeg no entregó audio.'
                );

                try {

                    if (!ffmpeg.killed) {
                        ffmpeg.kill('SIGKILL');
                    }

                } catch {}

                reject(
                    new Error(
                        'FFmpeg no produjo audio.'
                    )
                );
            }

        }, 20000);
    });
}


// ============================================================
// CREAR PLAYER
// ============================================================

function createGuildPlayer(guildId, connection) {

    console.log(
        `🎵 Creando AudioPlayer para ${guildId}...`
    );

    const player = createAudioPlayer({

        behaviors: {

            noSubscriber:
                NoSubscriberBehavior.Pause

        }

    });


    // --------------------------------------------------------
    // IDLE
    // --------------------------------------------------------

    player.on(
        AudioPlayerStatus.Idle,
        () => {

            console.log(
                `⏹️ AudioPlayer: IDLE (${guildId})`
            );
        }
    );


    // --------------------------------------------------------
    // BUFFERING
    // --------------------------------------------------------

    player.on(
        AudioPlayerStatus.Buffering,
        () => {

            console.log(
                `⏳ AudioPlayer: BUFFERING (${guildId})`
            );
        }
    );


    // --------------------------------------------------------
    // PLAYING
    // --------------------------------------------------------

    player.on(
        AudioPlayerStatus.Playing,
        () => {

            console.log('');
            console.log('==========================================');
            console.log('▶️ AudioPlayer: PLAYING');
            console.log(`🏠 Guild: ${guildId}`);
            console.log('🔊 Discord está recibiendo audio.');
            console.log('==========================================');
        }
    );


    // --------------------------------------------------------
    // AUTOPAUSED
    // --------------------------------------------------------

    player.on(
        AudioPlayerStatus.AutoPaused,
        () => {

            console.log(
                `⏸️ AudioPlayer: AUTOPAUSED (${guildId})`
            );
        }
    );


    // --------------------------------------------------------
    // ERROR
    // --------------------------------------------------------

    player.on(
        'error',
        error => {

            console.error('');
            console.error('==========================================');
            console.error('❌ ERROR DEL AUDIO PLAYER');
            console.error('==========================================');

            console.error(error);

            cleanupGuild(guildId);
        }
    );


    // --------------------------------------------------------
    // Suscribir
    // --------------------------------------------------------

    connection.subscribe(player);

    players.set(
        guildId,
        player
    );

    return player;
}


// ============================================================
// ESPERAR PLAYING
// ============================================================

function waitForPlaying(player) {

    return new Promise((resolve, reject) => {

        let finished = false;


        const cleanup = () => {

            player.removeListener(
                AudioPlayerStatus.Playing,
                onPlaying
            );

            player.removeListener(
                'error',
                onError
            );
        };


        const onPlaying = () => {

            if (finished) {
                return;
            }

            finished = true;

            cleanup();

            resolve();
        };


        const onError = error => {

            if (finished) {
                return;
            }

            finished = true;

            cleanup();

            reject(error);
        };


        player.once(
            AudioPlayerStatus.Playing,
            onPlaying
        );

        player.once(
            'error',
            onError
        );


        setTimeout(() => {

            if (finished) {
                return;
            }

            finished = true;

            cleanup();

            reject(
                new Error(
                    'Discord no pasó de BUFFERING a PLAYING.'
                )
            );

        }, 20000);
    });
}


// ============================================================
// COMANDO
// ============================================================

module.exports = {

    data: new SlashCommandBuilder()

        .setName('play')

        .setDescription(
            'Reproduce música de YouTube en tu canal de voz'
        )

        .addStringOption(option =>
            option
                .setName('cancion')
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


        const member =
            interaction.member;


        const voiceChannel =
            member?.voice?.channel;


        if (!voiceChannel) {

            return interaction.reply({

                content:
                    '❌ Debes estar conectado a un canal de voz.',

                ephemeral: true

            });
        }


        let query =
            interaction.options.getString(
                'cancion',
                true
            );


        console.log(
            `🔊 Canal de voz: ${voiceChannel.name} (${voiceChannel.id})`
        );

        console.log(
            `🎯 Consulta recibida: ${query}`
        );


        // ----------------------------------------------------
        // URL
        // ----------------------------------------------------

        const url =
            normalizeYouTubeUrl(query);


        if (!url) {

            return interaction.reply({

                content:
                    '❌ No pude interpretar la URL de YouTube.',

                ephemeral: true

            });
        }


        const videoId =
            getVideoId(url);


        console.log(
            `🔗 URL normalizada: ${url}`
        );

        console.log(
            `🆔 Video ID: ${videoId}`
        );


        // ----------------------------------------------------
        // Defer
        // ----------------------------------------------------

        await interaction.deferReply();


        console.log(
            '✅ Interacción diferida.'
        );


        const guildId =
            interaction.guild.id;


        try {

            // ------------------------------------------------
            // LIMPIAR REPRODUCCIÓN ANTERIOR
            // ------------------------------------------------

            if (
                players.has(guildId) ||
                connections.has(guildId) ||
                ytStreams.has(guildId) ||
                ffmpegProcesses.has(guildId)
            ) {

                console.log(
                    '🧹 Existe reproducción anterior. Limpiando...'
                );

                cleanupGuild(guildId);
            }


            // ------------------------------------------------
            // PASO 1
            // ------------------------------------------------

            console.log('');
            console.log(
                '🔊 PASO 1/3 — CONECTANDO A VOZ'
            );


            const connection =
                await connectToVoice(
                    voiceChannel
                );


            // ------------------------------------------------
            // PASO 2
            // ------------------------------------------------

            console.log('');
            console.log(
                '🎧 PASO 2/3 — PREPARANDO STREAM'
            );


            const player =
                createGuildPlayer(
                    guildId,
                    connection
                );


            // ------------------------------------------------
            // YT-DLP
            // ------------------------------------------------

            const ytStream =
                await createYouTubeStream(
                    url,
                    guildId
                );


            // ------------------------------------------------
            // FFMPEG
            // ------------------------------------------------

            console.log('');
            console.log(
                '🎬 PASANDO AUDIO POR FFMPEG...'
            );


            const ffmpegStream =
                await createFFmpegStream(
                    ytStream,
                    guildId
                );


            // ------------------------------------------------
            // AUDIO RESOURCE
            // ------------------------------------------------

            console.log(
                '🎵 Creando AudioResource...'
            );


            /*
             * FFmpeg entrega OGG/Opus.
             *
             * discord.js/voice puede recibir Opus
             * directamente cuando se especifica
             * StreamType.OggOpus.
             */

            const resource =
                createAudioResource(
                    ffmpegStream,
                    {
                        inputType:
                            StreamType.OggOpus,

                        inlineVolume: false
                    }
                );


            resources.set(
                guildId,
                resource
            );


            // ------------------------------------------------
            // SUBSCRIBE
            // ------------------------------------------------

            console.log(
                '🔊 Suscribiendo player a Discord...'
            );


            player.play(
                resource
            );


            // ------------------------------------------------
            // PASO 3
            // ------------------------------------------------

            console.log('');
            console.log(
                '▶️ PASO 3/3 — ESPERANDO REPRODUCCIÓN'
            );

            console.log(
                '⏳ AudioPlayer: BUFFERING...'
            );


            // ------------------------------------------------
            // ESPERAR PLAYING REAL
            // ------------------------------------------------

            await waitForPlaying(
                player
            );


            // ------------------------------------------------
            // YA ESTÁ SONANDO
            // ------------------------------------------------

            console.log('');
            console.log('==========================================');
            console.log('🎵 REPRODUCCIÓN INICIADA');
            console.log(`🆔 Video: ${videoId}`);
            console.log(`🔊 Canal: ${voiceChannel.name}`);
            console.log('🎧 Ensordecido: NO');
            console.log('🔇 Muteado: NO');
            console.log('==========================================');


            // ------------------------------------------------
            // EMBED
            // ------------------------------------------------

            const embed =
                new EmbedBuilder()

                    .setColor(0x2f3136)

                    .setTitle(
                        '🎵 Reproduciendo'
                    )

                    .setDescription(
                        `[Abrir vídeo en YouTube](${url})`
                    )

                    .addFields(

                        {
                            name: '🆔 Vídeo',
                            value: `\`${videoId}\``,
                            inline: true
                        },

                        {
                            name: '🔊 Canal',
                            value: voiceChannel.name,
                            inline: true
                        }

                    )

                    .setFooter({
                        text:
                            'RustLogix • Reproductor ligero'
                    });


            await interaction.editReply({
                embeds: [embed]
            });


            console.log(
                '✅ /play terminado correctamente.'
            );


        } catch (error) {

            console.error('');
            console.error('==========================================');
            console.error('❌ ERROR EN /PLAY');
            console.error('==========================================');

            console.error(error);


            try {

                await interaction.editReply({

                    content:
                        `❌ No pude reproducir el audio.\n\`\`\`\n${String(error.message || error).slice(0, 1500)}\n\`\`\``,

                    embeds: []

                });

            } catch {}


            cleanupGuild(
                guildId
            );
        }
    }
};