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

const { YtDlp } = require('ytdlp-nodejs');
const ffmpegPath = require('ffmpeg-static');

const fs = require('fs');
const os = require('os');
const path = require('path');


// ============================================================
// CONFIGURACIÓN
// ============================================================

const guildPlayers = new Map();
const guildConnections = new Map();
const guildResources = new Map();
const guildStreams = new Map();
const guildCookieFiles = new Map();


// ============================================================
// UTILIDADES
// ============================================================

function normalizeYouTubeUrl(input) {
    if (!input) return null;

    let value = String(input).trim();

    // Si entregan directamente un ID de YouTube
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
        return `https://www.youtube.com/watch?v=${value}`;
    }

    try {
        const url = new URL(value);

        if (
            url.hostname === 'youtube.com' ||
            url.hostname === 'www.youtube.com' ||
            url.hostname === 'm.youtube.com'
        ) {
            const videoId = url.searchParams.get('v');

            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }

        if (url.hostname === 'youtu.be') {
            const videoId = url.pathname.replace('/', '').trim();

            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        }

        return value;
    } catch {
        return value;
    }
}


function getYouTubeVideoId(url) {
    if (!url) return null;

    try {
        const parsed = new URL(url);

        if (parsed.hostname === 'youtu.be') {
            return parsed.pathname.replace('/', '').trim();
        }

        if (
            parsed.hostname === 'youtube.com' ||
            parsed.hostname === 'www.youtube.com' ||
            parsed.hostname === 'm.youtube.com'
        ) {
            return parsed.searchParams.get('v');
        }
    } catch {
        // Nada
    }

    const match = String(url).match(
        /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/
    );

    return match ? match[1] : null;
}


// ============================================================
// COOKIES YOUTUBE
// ============================================================

function prepareYouTubeCookies() {
    const base64 = process.env.YOUTUBE_COOKIES_B64;

    if (!base64) {
        console.log('🍪 YOUTUBE_COOKIES_B64 no configurado.');
        return null;
    }

    try {
        const cookieContent = Buffer
            .from(base64.trim(), 'base64')
            .toString('utf8');

        if (!cookieContent.trim()) {
            console.log('⚠️ YOUTUBE_COOKIES_B64 está vacío.');
            return null;
        }

        // Validación básica del formato Netscape/Mozilla
        const firstLine = cookieContent
            .replace(/^\uFEFF/, '')
            .split(/\r?\n/)
            .find(line => line.trim().length > 0);

        if (
            firstLine !== '# HTTP Cookie File' &&
            firstLine !== '# Netscape HTTP Cookie File'
        ) {
            console.log(
                '⚠️ La cookie no parece estar en formato Netscape/Mozilla.'
            );

            console.log(
                '⚠️ Primera línea detectada:',
                firstLine || '(vacía)'
            );

            return null;
        }

        const filePath = path.join(
            os.tmpdir(),
            `rustlogix-youtube-cookies-${process.pid}.txt`
        );

        fs.writeFileSync(
            filePath,
            cookieContent,
            {
                encoding: 'utf8',
                mode: 0o600,
            }
        );

        console.log('🍪 Cookies de YouTube preparadas.');
        console.log(`🍪 Archivo temporal: ${filePath}`);

        return filePath;

    } catch (error) {
        console.error(
            '❌ Error preparando cookies de YouTube:',
            error.message
        );

        return null;
    }
}


// ============================================================
// LIMPIAR COOKIES
// ============================================================

function cleanupCookieFile(guildId) {
    const cookieFile = guildCookieFiles.get(guildId);

    if (!cookieFile) return;

    try {
        if (fs.existsSync(cookieFile)) {
            fs.unlinkSync(cookieFile);
        }
    } catch (error) {
        console.log(
            '⚠️ No se pudo eliminar archivo de cookies:',
            error.message
        );
    }

    guildCookieFiles.delete(guildId);
}


// ============================================================
// LIMPIAR STREAM
// ============================================================

function cleanupGuildStream(guildId) {
    console.log('');
    console.log('==========================================');
    console.log(`🧹 Cerrando stream (${guildId})...`);

    const stream = guildStreams.get(guildId);

    if (stream) {
        try {
            if (typeof stream.destroy === 'function') {
                stream.destroy();
            }
        } catch (error) {
            console.log(
                '⚠️ Error cerrando stream:',
                error.message
            );
        }
    }

    guildStreams.delete(guildId);

    const resource = guildResources.get(guildId);

    if (resource) {
        try {
            if (
                resource.playStream &&
                typeof resource.playStream.destroy === 'function'
            ) {
                resource.playStream.destroy();
            }
        } catch {
            // Ignorar
        }
    }

    guildResources.delete(guildId);

    cleanupCookieFile(guildId);

    console.log('🧹 Stream limpiado.');
    console.log('==========================================');
}


// ============================================================
// DETENER AUDIO
// ============================================================

function stopGuildAudio(guildId) {
    const player = guildPlayers.get(guildId);

    if (player) {
        try {
            player.stop(true);
        } catch {
            // Ignorar
        }
    }

    cleanupGuildStream(guildId);
}


// ============================================================
// CREAR CONEXIÓN DE VOZ
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

    // Si ya existe una conexión, intentamos reutilizarla
    let connection = getVoiceConnection(guildId);

    if (
        connection &&
        connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
        console.log('🔊 Ya existe conexión de voz.');

        try {
            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                15000
            );

            guildConnections.set(guildId, connection);

            console.log('✅ Conexión existente lista.');

            return connection;

        } catch {
            console.log(
                '⚠️ La conexión existente no está lista. Recreando...'
            );

            try {
                connection.destroy();
            } catch {
                // Ignorar
            }

            guildConnections.delete(guildId);
        }
    }

    console.log('🔊 Creando conexión explícita...');

    connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: guildId,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,

        // MUY IMPORTANTE
        selfDeaf: false,
        selfMute: false,
    });

    guildConnections.set(guildId, connection);

    console.log('🔊 Conexión creada.');
    console.log('⏳ Esperando estado READY de Discord...');

    try {
        await entersState(
            connection,
            VoiceConnectionStatus.Ready,
            20000
        );

        console.log('');
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
        console.error('❌ NO SE PUDO CONECTAR A VOZ');
        console.error('==========================================');
        console.error(error.message);

        try {
            connection.destroy();
        } catch {
            // Ignorar
        }

        guildConnections.delete(guildId);

        throw new Error(
            'No pude conectarme al canal de voz.'
        );
    }
}


// ============================================================
// CREAR PLAYER
// ============================================================

function getOrCreatePlayer(guildId) {
    let player = guildPlayers.get(guildId);

    if (player) {
        return player;
    }

    console.log(
        `🎵 Creando AudioPlayer para ${guildId}...`
    );

    player = createAudioPlayer({
        behaviors: {
            noSubscriber: NoSubscriberBehavior.Play,
        },
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

            // Solo limpiamos si sigue siendo el stream actual
            setTimeout(() => {
                const currentPlayer =
                    guildPlayers.get(guildId);

                if (
                    currentPlayer === player &&
                    player.state.status === AudioPlayerStatus.Idle
                ) {
                    cleanupGuildStream(guildId);
                }
            }, 1000);
        }
    );

    player.on(
        'error',
        (error) => {
            console.error('');
            console.error('==========================================');
            console.error('❌ ERROR DEL AUDIO PLAYER');
            console.error('==========================================');
            console.error(error);
            console.error('==========================================');

            cleanupGuildStream(guildId);
        }
    );

    guildPlayers.set(guildId, player);

    return player;
}


// ============================================================
// CREAR YT-DLP
// ============================================================

function createYtDlp() {
    console.log('🎬 Inicializando yt-dlp...');

    const ytdlp = new YtDlp({
        ffmpegPath,
    });

    console.log('✅ yt-dlp listo.');

    return ytdlp;
}


// ============================================================
// CREAR STREAM DE YOUTUBE
// ============================================================

function createYouTubeStream(ytdlp, url, guildId) {
    console.log('');
    console.log('==========================================');
    console.log('🎧 CREANDO STREAM DE YOUTUBE');
    console.log('==========================================');

    console.log(`🔗 URL: ${url}`);

    const cookieFile = prepareYouTubeCookies();

    if (cookieFile) {
        guildCookieFiles.set(
            guildId,
            cookieFile
        );

        console.log('🍪 yt-dlp utilizará cookies de YouTube.');
    } else {
        console.log(
            '🍪 yt-dlp funcionará sin cookies.'
        );
    }

    /*
     * IMPORTANTE:
     *
     * No usamos getInfoAsync().
     *
     * Eso obligaría a realizar una petición previa
     * de información y en YouTube puede activar
     * inmediatamente el bloqueo anti-bot.
     *
     * Vamos directamente al stream.
     */

    let streamBuilder = ytdlp
        .stream(url)
        .filter('audioonly')
        .quality(5)
        .type('opus');

    // --------------------------------------------------------
    // ARGUMENTOS DIRECTOS DE YT-DLP
    // --------------------------------------------------------

    streamBuilder = streamBuilder.addArgs(
        '--no-playlist',
        '--no-part',
        '--no-cache-dir',
        '--no-warnings',
        '--quiet'
    );

    /*
     * Clientes de YouTube que intentamos utilizar.
     *
     * Si YouTube cambia sus restricciones, las cookies
     * siguen siendo la vía principal de autenticación.
     */
    streamBuilder = streamBuilder.addArgs(
        '--extractor-args',
        'youtube:player_client=tv_simply,tv,web_embedded'
    );

    // --------------------------------------------------------
    // COOKIES
    // --------------------------------------------------------

    if (cookieFile) {
        streamBuilder = streamBuilder.addArgs(
            '--cookies',
            cookieFile
        );
    }

    // --------------------------------------------------------
    // USER AGENT OPCIONAL
    // --------------------------------------------------------

    if (process.env.YOUTUBE_USER_AGENT) {
        streamBuilder = streamBuilder.addArgs(
            '--user-agent',
            process.env.YOUTUBE_USER_AGENT
        );

        console.log(
            '🌐 User-Agent personalizado habilitado.'
        );
    }

    // --------------------------------------------------------
    // EVENTOS
    // --------------------------------------------------------

    streamBuilder.on(
        'start',
        () => {
            console.log(
                '🚀 yt-dlp comenzó a procesar el audio.'
            );
        }
    );

    streamBuilder.on(
        'error',
        (error) => {
            console.error('');
            console.error('==========================================');
            console.error('❌ ERROR DEL STREAM YT-DLP');
            console.error('==========================================');

            const message =
                error?.message ||
                String(error);

            console.error(message);

            if (
                message.includes(
                    'Sign in to confirm you’re not a bot'
                ) ||
                message.includes(
                    "Sign in to confirm you're not a bot"
                ) ||
                message.includes(
                    'Use --cookies-from-browser'
                ) ||
                message.includes(
                    'Use --cookies'
                )
            ) {
                console.error('');
                console.error(
                    '🍪 YOUTUBE ESTÁ BLOQUEANDO LA EXTRACCIÓN.'
                );
                console.error(
                    '🍪 Revisa YOUTUBE_COOKIES_B64 en Render.'
                );
            }

            console.error(
                '=========================================='
            );

            cleanupGuildStream(guildId);
        }
    );

    streamBuilder.on(
        'end',
        () => {
            console.log(
                `🏁 Stream de YouTube terminado (${guildId})`
            );
        }
    );

    const audioStream =
        streamBuilder.getStream();

    if (!audioStream) {
        throw new Error(
            'yt-dlp no pudo crear el stream de audio.'
        );
    }

    audioStream.on(
        'error',
        (error) => {
            console.error('');
            console.error(
                `❌ Error del stream de audio (${guildId}):`
            );
            console.error(error.message);

            cleanupGuildStream(guildId);
        }
    );

    guildStreams.set(
        guildId,
        audioStream
    );

    console.log(
        '🎧 Stream yt-dlp preparado.'
    );

    return audioStream;
}


// ============================================================
// COMANDO /PLAY
// ============================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription(
            'Reproduce música de YouTube en tu canal de voz.'
        )
        .addStringOption(option =>
            option
                .setName('cancion')
                .setDescription(
                    'URL de YouTube o ID del vídeo.'
                )
                .setRequired(true)
        ),

    async execute(interaction) {
        console.log('');
        console.log('==========================================');
        console.log('🎯 EJECUTANDO /PLAY');
        console.log('==========================================');

        const guildId =
            interaction.guild?.id;

        if (!guildId) {
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

        if (!voiceChannel.joinable) {
            return interaction.reply({
                content:
                    '❌ No tengo permisos para entrar a ese canal de voz.',
                ephemeral: true,
            });
        }

        if (!voiceChannel.speakable) {
            return interaction.reply({
                content:
                    '❌ No tengo permiso para hablar en ese canal de voz.',
                ephemeral: true,
            });
        }

        const query =
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

        const youtubeUrl =
            normalizeYouTubeUrl(query);

        const videoId =
            getYouTubeVideoId(youtubeUrl);

        if (!videoId) {
            return interaction.reply({
                content:
                    '❌ No pude reconocer un vídeo de YouTube válido.',
                ephemeral: true,
            });
        }

        console.log(
            `🔗 URL normalizada: ${youtubeUrl}`
        );

        console.log(
            `🆔 Video ID: ${videoId}`
        );

        // ----------------------------------------------------
        // DEFER
        // ----------------------------------------------------

        try {
            await interaction.deferReply();
        } catch (error) {
            console.error(
                '❌ Error haciendo deferReply:',
                error.message
            );

            return;
        }

        console.log(
            '✅ Interacción diferida.'
        );

        // ----------------------------------------------------
        // PASO 1
        // ----------------------------------------------------

        console.log('');
        console.log(
            '🔊 PASO 1/3 — CONECTANDO A VOZ'
        );

        let connection;

        try {
            connection =
                await connectToVoiceChannel(
                    voiceChannel
                );
        } catch (error) {
            console.error(error);

            try {
                await interaction.editReply({
                    content:
                        `❌ No pude conectarme al canal de voz.\n\`${error.message}\``,
                });
            } catch {
                // Ignorar
            }

            return;
        }

        // ----------------------------------------------------
        // PASO 2
        // ----------------------------------------------------

        console.log('');
        console.log(
            '🎧 PASO 2/3 — PREPARANDO STREAM'
        );

        let player;
        let audioStream;

        try {
            player =
                getOrCreatePlayer(guildId);

            console.log(
                '🎬 Inicializando yt-dlp...'
            );

            const ytdlp =
                createYtDlp();

            audioStream =
                createYouTubeStream(
                    ytdlp,
                    youtubeUrl,
                    guildId
                );

            console.log(
                '✅ Stream de audio obtenido.'
            );

        } catch (error) {
            console.error('');
            console.error(
                '❌ ERROR PREPARANDO AUDIO'
            );
            console.error(error);

            cleanupGuildStream(
                guildId
            );

            try {
                await interaction.editReply({
                    content:
                        `❌ No pude obtener el audio de YouTube.\n\`${error.message}\``,
                });
            } catch {
                // Ignorar
            }

            return;
        }

        // ----------------------------------------------------
        // AUDIO RESOURCE
        // ----------------------------------------------------

        let resource;

        try {
            resource =
                createAudioResource(
                    audioStream,
                    {
                        inputType:
                            StreamType.WebmOpus,

                        metadata: {
                            guildId,
                            videoId,
                            url: youtubeUrl,
                        },
                    }
                );

            guildResources.set(
                guildId,
                resource
            );

        } catch (error) {
            console.error(
                '❌ Error creando AudioResource:',
                error
            );

            cleanupGuildStream(
                guildId
            );

            try {
                await interaction.editReply({
                    content:
                        `❌ No pude preparar el audio.\n\`${error.message}\``,
                });
            } catch {
                // Ignorar
            }

            return;
        }

        // ----------------------------------------------------
        // SUBSCRIBE
        // ----------------------------------------------------

        try {
            console.log(
                '🔊 Suscribiendo player a Discord...'
            );

            connection.subscribe(
                player
            );

        } catch (error) {
            console.error(
                '❌ Error suscribiendo AudioPlayer:',
                error
            );

            cleanupGuildStream(
                guildId
            );

            return;
        }

        // ----------------------------------------------------
        // PASO 3
        // ----------------------------------------------------

        console.log('');
        console.log(
            '▶️ PASO 3/3 — REPRODUCIENDO'
        );

        try {
            player.play(
                resource
            );

        } catch (error) {
            console.error(
                '❌ Error iniciando reproducción:',
                error
            );

            cleanupGuildStream(
                guildId
            );

            try {
                await interaction.editReply({
                    content:
                        `❌ No pude iniciar la reproducción.\n\`${error.message}\``,
                });
            } catch {
                // Ignorar
            }

            return;
        }

        // ----------------------------------------------------
        // EMBED
        // ----------------------------------------------------

        const embed =
            new EmbedBuilder()
                .setTitle(
                    'PP RustLogix'
                )
                .setDescription(
                    '[**🎵**](https://discord.com/assets/4bb732e8f1a0286d.svg) **Reproduciendo**\n\n' +
                    `[Abrir vídeo en YouTube](https://www.youtube.com/watch?v=${videoId} "Abrir vídeo en YouTube")\n\n` +
                    '[**🆔**](https://discord.com/assets/e205e5f16fab825d.svg) **Vídeo**\n\n' +
                    `${videoId}\n\n` +
                    '[**🔊**](https://discord.com/assets/6446faea65f88f9b.svg) **Canal**\n\n' +
                    `${voiceChannel.name}`
                )
                .setFooter({
                    text:
                        'RustLogix • Reproductor ligero',
                });

        try {
            await interaction.editReply({
                embeds: [embed],
            });
        } catch (error) {
            console.error(
                '⚠️ No se pudo actualizar el embed:',
                error.message
            );
        }

        console.log('');
        console.log(
            '=========================================='
        );
        console.log(
            '🎵 REPRODUCCIÓN INICIADA'
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

        console.log(
            '✅ /play terminado'
        );
    },
};