const {
    SlashCommandBuilder,
    EmbedBuilder,
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

// ============================================================
// ytdlp-nodejs
// ============================================================

const ytdlpModule = require('ytdlp-nodejs');

// IMPORTANTE:
// En CommonJS el paquete no debe tratarse directamente como constructor.
// La clase está exportada como YtDlp.
const YtDlp =
    ytdlpModule.YtDlp ||
    ytdlpModule.default ||
    ytdlpModule;

if (typeof YtDlp !== 'function') {
    console.error('❌ No se encontró el constructor YtDlp.');
    console.error(
        '📦 Exportaciones disponibles:',
        Object.keys(ytdlpModule || {})
    );
}

// ============================================================
// FFmpeg
// ============================================================

let ffmpegPath;

try {
    ffmpegPath = require('ffmpeg-static');

    console.log('🎬 FFmpeg encontrado:', ffmpegPath);
} catch (error) {
    console.error('❌ No se pudo cargar ffmpeg-static:', error);
    ffmpegPath = 'ffmpeg';
}

// ============================================================
// CONFIGURACIÓN
// ============================================================

const BGUTIL_SERVER_HOME = path.join(
    process.cwd(),
    'bgutil-ytdlp-pot-provider',
    'server'
);

const TEMP_DIR = path.join(os.tmpdir(), 'rustlogix-play');

if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, {
        recursive: true,
    });
}

// ============================================================
// MAPAS POR GUILD
// ============================================================

const players = new Map();
const connections = new Map();
const ytStreams = new Map();
const ffmpegProcesses = new Map();
const resources = new Map();
const cookieFiles = new Map();

// ============================================================
// HELPERS
// ============================================================

function normalizeYouTubeUrl(input) {
    try {
        const url = new URL(input);

        if (
            url.hostname.includes('youtube.com') ||
            url.hostname.includes('youtu.be')
        ) {
            const videoId =
                url.hostname.includes('youtu.be')
                    ? url.pathname.replace('/', '')
                    : url.searchParams.get('v');

            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }
    } catch {
        // Si no es URL válida, devolvemos el input original.
    }

    return input;
}

// ============================================================

function getVideoId(url) {
    try {
        const parsed = new URL(url);

        if (parsed.hostname.includes('youtu.be')) {
            return parsed.pathname.replace('/', '');
        }

        return parsed.searchParams.get('v');
    } catch {
        return null;
    }
}

// ============================================================

function getGuildPlayer(guildId) {
    return players.get(guildId);
}

// ============================================================

async function cleanupGuild(guildId) {
    console.log(`🧹 LIMPIANDO RECURSOS (${guildId})`);

    // ------------------------------
    // Stream yt-dlp
    // ------------------------------

    const ytStream = ytStreams.get(guildId);

    if (ytStream) {
        try {
            ytStream.destroy();
        } catch {}

        ytStreams.delete(guildId);
    }

    // ------------------------------
    // FFmpeg
    // ------------------------------

    const ffmpeg = ffmpegProcesses.get(guildId);

    if (ffmpeg) {
        try {
            ffmpeg.stdin?.destroy();
        } catch {}

        try {
            ffmpeg.stdout?.destroy();
        } catch {}

        try {
            ffmpeg.kill('SIGKILL');
        } catch {}

        ffmpegProcesses.delete(guildId);
    }

    // ------------------------------
    // Resource
    // ------------------------------

    resources.delete(guildId);

    // ------------------------------
    // Player
    // ------------------------------

    const player = players.get(guildId);

    if (player) {
        try {
            player.stop(true);
        } catch {}

        players.delete(guildId);
    }

    // ------------------------------
    // Cookies temporales
    // ------------------------------

    const cookieFile = cookieFiles.get(guildId);

    if (cookieFile) {
        try {
            if (fs.existsSync(cookieFile)) {
                fs.unlinkSync(cookieFile);
            }
        } catch {}

        cookieFiles.delete(guildId);
    }

    // ------------------------------
    // Voice connection
    // ------------------------------

    const connection =
        connections.get(guildId) ||
        getVoiceConnection(guildId);

    if (connection) {
        try {
            connection.destroy();
        } catch {}

        connections.delete(guildId);
    }

    console.log('🧹 Limpieza terminada.');
}

// ============================================================
// COOKIES DE YOUTUBE
// ============================================================

function prepareYouTubeCookies(guildId) {
    const base64 = process.env.YOUTUBE_COOKIES_B64;

    if (!base64) {
        console.log('🍪 YOUTUBE_COOKIES_B64 no configurado.');
        console.log('🍪 yt-dlp funcionará sin cookies.');

        return null;
    }

    try {
        const cookieFile = path.join(
            TEMP_DIR,
            `youtube-cookies-${process.pid}-${guildId}.txt`
        );

        const decoded = Buffer
            .from(base64, 'base64')
            .toString('utf8');

        if (!decoded.trim()) {
            console.log('⚠️ YOUTUBE_COOKIES_B64 está vacío.');
            return null;
        }

        fs.writeFileSync(
            cookieFile,
            decoded,
            {
                encoding: 'utf8',
                mode: 0o600,
            }
        );

        cookieFiles.set(guildId, cookieFile);

        console.log('🍪 Cookies de YouTube preparadas.');
        console.log(`🍪 Archivo temporal: ${cookieFile}`);

        return cookieFile;
    } catch (error) {
        console.error(
            '❌ Error preparando cookies:',
            error
        );

        return null;
    }
}

// ============================================================
// CREAR STREAM DE YOUTUBE
// ============================================================

async function createYouTubeStream(url, guildId) {
    console.log('');
    console.log('==========================================');
    console.log('🎧 CREANDO STREAM DE YOUTUBE');
    console.log('==========================================');
    console.log(`🔗 URL: ${url}`);
    console.log('');

    // --------------------------------------------------------
    // BGUTIL
    // --------------------------------------------------------

    const bgutilExists =
        fs.existsSync(BGUTIL_SERVER_HOME);

    console.log('🤖 PO TOKEN PROVIDER');
    console.log(
        `📁 BGUTIL: ${BGUTIL_SERVER_HOME}`
    );
    console.log(
        `📁 Existe: ${bgutilExists ? 'SÍ' : 'NO'}`
    );

    if (!bgutilExists) {
        throw new Error(
            'No se encontró bgutil-ytdlp-pot-provider/server'
        );
    }

    // --------------------------------------------------------
    // COOKIES
    // --------------------------------------------------------

    const cookieFile =
        prepareYouTubeCookies(guildId);

    // --------------------------------------------------------
    // USER AGENT
    // --------------------------------------------------------

    const userAgent =
        process.env.YOUTUBE_USER_AGENT ||
        null;

    if (userAgent) {
        console.log('🌐 YOUTUBE_USER_AGENT configurado.');
    }

    // --------------------------------------------------------
    // CREAR YTDLP
    // --------------------------------------------------------

    console.log('🎬 Inicializando yt-dlp...');

    let yt;

    try {
        yt = new YtDlp({
            ffmpegPath,
        });

        console.log('✅ yt-dlp listo.');
    } catch (error) {
        console.error(
            '❌ No se pudo inicializar yt-dlp:',
            error
        );

        throw error;
    }

    // --------------------------------------------------------
    // STREAM BUILDER
    // --------------------------------------------------------

    console.log('🚀 Construyendo stream de audio...');

    let streamBuilder;

    try {
        streamBuilder = yt
            .stream(url)
            .filter('audioonly')
            .quality(5)
            .type('opus');

        // ----------------------------------------------------
        // ARGUMENTOS YT-DLP
        // ----------------------------------------------------

        streamBuilder.addArgs(
            '--no-playlist',
            '--no-part',
            '--no-cache-dir',
            '--no-warnings',
            '--quiet',

            // Cliente de YouTube.
            '--extractor-args',
            'youtube:player_client=mweb',

            // PO Token Provider.
            '--extractor-args',
            `youtubepot-bgutilscript:server_home=${BGUTIL_SERVER_HOME}`,

            // Node como runtime JS.
            '--js-runtimes',
            `node:${process.execPath}`
        );

        // ----------------------------------------------------
        // COOKIES
        // ----------------------------------------------------

        if (cookieFile) {
            streamBuilder.addArgs(
                '--cookies',
                cookieFile
            );

            console.log(
                '🍪 Cookies agregadas a yt-dlp.'
            );
        }

        // ----------------------------------------------------
        // USER AGENT
        // ----------------------------------------------------

        if (userAgent) {
            streamBuilder.addArgs(
                '--user-agent',
                userAgent
            );
        }

        console.log('🤖 PO Token configurado.');
        console.log(
            '🤖 Solicitando PO Token mediante bgutil...'
        );

    } catch (error) {
        console.error(
            '❌ Error creando StreamBuilder:',
            error
        );

        throw error;
    }

    // ========================================================
    // MUY IMPORTANTE:
    // streamBuilder NO es el stream de Node.
    // getStream() devuelve el PassThrough real.
    // ========================================================

    let ytStream;

    try {
        ytStream = streamBuilder.getStream();
    } catch (error) {
        console.error(
            '❌ Error obteniendo stream real:',
            error
        );

        throw error;
    }

    if (!ytStream) {
        throw new Error(
            'yt-dlp no devolvió un stream válido.'
        );
    }

    ytStreams.set(guildId, ytStream);

    // --------------------------------------------------------
    // EVENTOS
    // --------------------------------------------------------

    ytStream.on('error', (error) => {
        console.error('');
        console.error(
            '❌ ERROR DEL STREAM YT-DLP'
        );
        console.error(error);

        const player = players.get(guildId);

        if (player) {
            try {
                player.stop();
            } catch {}
        }
    });

    ytStream.on('end', () => {
        console.log(
            '🏁 Stream de YouTube terminado.'
        );

        ytStreams.delete(guildId);
    });

    console.log('🎧 Stream yt-dlp preparado.');

    return ytStream;
}

// ============================================================
// FFMPEG
// ============================================================

function createFFmpegStream(inputStream, guildId) {
    return new Promise((resolve, reject) => {
        console.log('');
        console.log(
            '🎬 INICIANDO FFmpeg'
        );

        const ffmpegArgs = [
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

            'pipe:1',
        ];

        console.log(
            '🎬 FFmpeg:',
            ffmpegPath
        );

        const ffmpeg = spawn(
            ffmpegPath,
            ffmpegArgs,
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

        let stderr = '';
        let resolved = false;

        // ----------------------------------------------------
        // STDERR
        // ----------------------------------------------------

        ffmpeg.stderr.on(
            'data',
            (chunk) => {
                const text =
                    chunk.toString();

                stderr += text;

                if (text.trim()) {
                    console.error(
                        '🎬 FFmpeg:',
                        text.trim()
                    );
                }
            }
        );

        // ----------------------------------------------------
        // ERROR
        // ----------------------------------------------------

        ffmpeg.on(
            'error',
            (error) => {
                console.error(
                    '❌ FFmpeg error:',
                    error
                );

                if (!resolved) {
                    resolved = true;
                    reject(error);
                }
            }
        );

        // ----------------------------------------------------
        // CLOSE
        // ----------------------------------------------------

        ffmpeg.on(
            'close',
            (code) => {
                console.log(
                    `🎬 FFmpeg finalizado. Código: ${code}`
                );

                ffmpegProcesses.delete(
                    guildId
                );

                if (
                    code !== 0 &&
                    !resolved
                ) {
                    resolved = true;

                    reject(
                        new Error(
                            `FFmpeg terminó con código ${code}: ${stderr}`
                        )
                    );
                }
            }
        );

        // ----------------------------------------------------
        // INPUT ERROR
        // ----------------------------------------------------

        inputStream.on(
            'error',
            (error) => {
                console.error(
                    '❌ Error del input de FFmpeg:',
                    error
                );

                try {
                    ffmpeg.stdin.destroy();
                } catch {}

                if (!resolved) {
                    resolved = true;
                    reject(error);
                }
            }
        );

        // ----------------------------------------------------
        // PIPE
        // ----------------------------------------------------

        inputStream.pipe(
            ffmpeg.stdin
        );

        // ----------------------------------------------------
        // DATA
        // ----------------------------------------------------

        let gotData = false;

        ffmpeg.stdout.once(
            'data',
            () => {
                gotData = true;

                console.log(
                    '🎵 FFmpeg está entregando audio.'
                );

                if (!resolved) {
                    resolved = true;
                    resolve(
                        ffmpeg.stdout
                    );
                }
            }
        );

        // ----------------------------------------------------
        // TIMEOUT
        // ----------------------------------------------------

        const timeout = setTimeout(() => {
            if (resolved) {
                return;
            }

            if (!gotData) {
                resolved = true;

                reject(
                    new Error(
                        'FFmpeg no produjo audio dentro del tiempo esperado.'
                    )
                );

                try {
                    ffmpeg.kill(
                        'SIGKILL'
                    );
                } catch {}
            }
        }, 20000);

        ffmpeg.stdout.once(
            'data',
            () => {
                clearTimeout(timeout);
            }
        );
    });
}

// ============================================================
// ESPERAR PLAYING
// ============================================================

function waitForPlaying(
    player,
    guildId,
    timeoutMs = 15000
) {
    return new Promise(
        (resolve, reject) => {
            let finished = false;

            const cleanup = () => {
                player.off(
                    AudioPlayerStatus.Playing,
                    onPlaying
                );

                player.off(
                    'error',
                    onError
                );

                clearTimeout(timeout);
            };

            const onPlaying = () => {
                if (finished) {
                    return;
                }

                finished = true;

                cleanup();

                console.log('');
                console.log(
                    `🎵 AudioPlayer: PLAYING (${guildId})`
                );

                resolve();
            };

            const onError = (error) => {
                if (finished) {
                    return;
                }

                finished = true;

                cleanup();

                reject(error);
            };

            const timeout = setTimeout(() => {
                if (finished) {
                    return;
                }

                finished = true;

                cleanup();

                reject(
                    new Error(
                        'AudioPlayer no llegó a PLAYING dentro del tiempo esperado.'
                    )
                );
            }, timeoutMs);

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
// COMANDO
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
                    .setName('cancion')
                    .setDescription(
                        'URL de YouTube o búsqueda'
                    )
                    .setRequired(true)
        ),

    async execute(interaction) {
        console.log('');
        console.log(
            '🎯 EJECUTANDO /PLAY'
        );
        console.log(
            '=========================================='
        );

        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content:
                    '❌ Este comando solo puede utilizarse dentro de un servidor.',
                ephemeral: true,
            });
        }

        const member =
            interaction.member;

        const voiceChannel =
            member?.voice?.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content:
                    '❌ Primero debes entrar a un canal de voz.',
                ephemeral: true,
            });
        }

        const query =
            interaction.options.getString(
                'cancion'
            );

        if (!query) {
            return interaction.reply({
                content:
                    '❌ Debes indicar una canción o URL de YouTube.',
                ephemeral: true,
            });
        }

        console.log(
            `🔊 Canal de voz: ${voiceChannel.name} (${voiceChannel.id})`
        );

        console.log(
            `🎯 Consulta recibida: ${query}`
        );

        // ----------------------------------------------------
        // NORMALIZAR URL
        // ----------------------------------------------------

        const normalizedUrl =
            normalizeYouTubeUrl(query);

        console.log(
            `🔗 URL normalizada: ${normalizedUrl}`
        );

        const videoId =
            getVideoId(normalizedUrl);

        console.log(
            `🆔 Video ID: ${videoId || 'no detectado'}`
        );

        // ----------------------------------------------------
        // DEFER
        // ----------------------------------------------------

        try {
            await interaction.deferReply();
        } catch (error) {
            console.error(
                '❌ Error haciendo defer:',
                error
            );

            return;
        }

        console.log(
            '✅ Interacción diferida.'
        );

        const guildId =
            guild.id;

        try {
            // =================================================
            // LIMPIAR REPRODUCTOR ANTERIOR
            // =================================================

            if (
                players.has(guildId) ||
                connections.has(guildId)
            ) {
                console.log(
                    '🧹 Existía una reproducción anterior.'
                );

                await cleanupGuild(
                    guildId
                );
            }

            // =================================================
            // PASO 1
            // =================================================

            console.log('');
            console.log(
                '🔊 PASO 1/3 — CONECTANDO A VOZ'
            );

            console.log(
                '🔊 Creando conexión explícita...'
            );

            const connection =
                joinVoiceChannel({
                    channelId:
                        voiceChannel.id,

                    guildId:
                        guildId,

                    adapterCreator:
                        guild.voiceAdapterCreator,

                    // MUY IMPORTANTE:
                    // El bot NO queda ensordecido.
                    selfDeaf: false,
                    selfMute: false,
                });

            connections.set(
                guildId,
                connection
            );

            console.log(
                '🔊 Conexión creada.'
            );

            console.log(
                '⏳ Esperando estado READY de Discord...'
            );

            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                30000
            );

            console.log('');
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

            // =================================================
            // PASO 2
            // =================================================

            console.log('');
            console.log(
                '🎧 PASO 2/3 — PREPARANDO STREAM'
            );

            console.log(
                `🎵 Creando AudioPlayer para ${guildId}...`
            );

            const player =
                createAudioPlayer({
                    behaviors: {
                        noSubscriber:
                            NoSubscriberBehavior.Pause,
                    },
                });

            players.set(
                guildId,
                player
            );

            // -------------------------------------------------
            // EVENTOS DEL PLAYER
            // -------------------------------------------------

            player.on(
                AudioPlayerStatus.Buffering,
                () => {
                    console.log(
                        `⏳ AudioPlayer: BUFFERING (${guildId})`
                    );
                }
            );

            player.on(
                AudioPlayerStatus.Playing,
                () => {
                    console.log(
                        `▶️ AudioPlayer: PLAYING (${guildId})`
                    );
                }
            );

            player.on(
                AudioPlayerStatus.Idle,
                () => {
                    console.log(
                        `⏹️ AudioPlayer: IDLE (${guildId})`
                    );
                }
            );

            player.on(
                'error',
                (error) => {
                    console.error('');
                    console.error(
                        '❌ ERROR DEL AUDIO PLAYER'
                    );
                    console.error(
                        error
                    );
                }
            );

            // -------------------------------------------------
            // CREAR STREAM YOUTUBE
            // -------------------------------------------------

            const ytStream =
                await createYouTubeStream(
                    normalizedUrl,
                    guildId
                );

            console.log(
                '✅ Stream de audio obtenido.'
            );

            // =================================================
            // FFmpeg
            // =================================================

            console.log(
                '🎬 Preparando conversión FFmpeg...'
            );

            const audioStream =
                await createFFmpegStream(
                    ytStream,
                    guildId
                );

            console.log(
                '🎵 Stream FFmpeg listo.'
            );

            // =================================================
            // AUDIO RESOURCE
            // =================================================

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

            resources.set(
                guildId,
                resource
            );

            // =================================================
            // SUSCRIBIR
            // =================================================

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

            // =================================================
            // ESPERAR PLAYING
            // =================================================

            await waitForPlaying(
                player,
                guildId,
                15000
            );

            console.log('');
            console.log(
                '=========================================='
            );
            console.log(
                '🎵 REPRODUCCIÓN INICIADA'
            );
            console.log(
                `🆔 Video: ${videoId || 'YouTube'}`
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

            // =================================================
            // EMBED
            // =================================================

            const embed =
                new EmbedBuilder()
                    .setColor(0x2b2d31)
                    .setTitle(
                        '🎵 Reproduciendo'
                    )
                    .setURL(
                        normalizedUrl
                    )
                    .setDescription(
                        `[Abrir vídeo en YouTube](${normalizedUrl})`
                    )
                    .addFields(
                        {
                            name: '🆔 Vídeo',
                            value:
                                videoId
                                    ? `\`${videoId}\``
                                    : '`YouTube`',
                            inline: true,
                        },
                        {
                            name: '🔊 Canal',
                            value:
                                voiceChannel.name,
                            inline: true,
                        }
                    )
                    .setFooter({
                        text:
                            'RustLogix • Reproductor ligero',
                    });

            await interaction.editReply({
                embeds: [
                    embed,
                ],
            });

            console.log(
                '✅ /play terminado'
            );

            // =================================================
            // CUANDO TERMINE
            // =================================================

            player.once(
                AudioPlayerStatus.Idle,
                async () => {
                    console.log(
                        `🏁 Reproducción terminada (${guildId})`
                    );

                    // Esperamos un poco antes de destruir
                    // para evitar cortes/errores de cierre.
                    setTimeout(
                        async () => {
                            const currentPlayer =
                                players.get(
                                    guildId
                                );

                            if (
                                currentPlayer ===
                                player
                            ) {
                                await cleanupGuild(
                                    guildId
                                );
                            }
                        },
                        1500
                    );
                }
            );

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
                error
            );

            // ------------------------------------------------
            // MENSAJE PARA DISCORD
            // ------------------------------------------------

            let message =
                '❌ No pude reproducir el audio.';

            const errorText =
                String(
                    error?.message ||
                    error ||
                    ''
                );

            if (
                errorText.includes(
                    'Sign in to confirm'
                )
            ) {
                message =
                    '❌ YouTube bloqueó la solicitud. Se necesitan cookies de YouTube o una sesión válida.';
            } else if (
                errorText.includes(
                    'PO Token'
                ) ||
                errorText.includes(
                    'bgutil'
                )
            ) {
                message =
                    '❌ No se pudo obtener el PO Token de YouTube. Revisa que bgutil esté instalado correctamente en Render.';
            } else if (
                errorText.includes(
                    'YtDlp is not a constructor'
                )
            ) {
                message =
                    '❌ Error cargando ytdlp-nodejs. Revisa la instalación de `ytdlp-nodejs@3.4.5`.';
            } else if (
                errorText.includes(
                    'FFmpeg'
                )
            ) {
                message =
                    '❌ FFmpeg no pudo procesar el audio.';
            } else if (
                errorText.includes(
                    'AudioPlayer no llegó a PLAYING'
                )
            ) {
                message =
                    '❌ El audio de YouTube no comenzó a llegar a Discord.';
            }

            try {
                await interaction.editReply({
                    content:
                        message,
                    embeds: [],
                });
            } catch (replyError) {
                console.error(
                    '❌ No se pudo editar la respuesta:',
                    replyError
                );
            }

            // ------------------------------------------------
            // LIMPIAR
            // ------------------------------------------------

            await cleanupGuild(
                guildId
            );
        }
    },
};