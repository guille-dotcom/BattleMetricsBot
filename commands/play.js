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

let ytdlpInstance = null;

// Ruta donde instalamos bgutil durante el Build Command
const BGUTIL_SERVER_HOME = path.join(
    process.cwd(),
    'bgutil-ytdlp-pot-provider',
    'server'
);

// ============================================================
// YT-DLP
// ============================================================

function getYtDlp() {
    if (ytdlpInstance) {
        return ytdlpInstance;
    }

    console.log('🎬 Inicializando yt-dlp...');

    ytdlpInstance = new YtDlp({
        binaryPath: undefined
    });

    console.log('✅ yt-dlp listo.');

    return ytdlpInstance;
}

// ============================================================
// COOKIES OPCIONALES
// ============================================================

function prepareYouTubeCookies() {
    const base64 = process.env.YOUTUBE_COOKIES_B64;

    if (!base64) {
        console.log('🍪 YOUTUBE_COOKIES_B64 no configurado.');
        console.log('🍪 Continuando sin cookies.');
        return null;
    }

    try {
        console.log('🍪 YOUTUBE_COOKIES_B64 detectado.');
        console.log(`🍪 Tamaño recibido: ${base64.length} caracteres.`);

        const cookieData = Buffer.from(base64, 'base64');

        const firstLines = cookieData
            .toString('utf8')
            .split(/\r?\n/)
            .filter(Boolean)
            .slice(0, 3);

        const validFormat = firstLines.some(line =>
            line.includes('# Netscape HTTP Cookie File') ||
            line.includes('# HTTP Cookie File')
        );

        if (!validFormat) {
            console.log('⚠️ El archivo de cookies no parece tener formato Netscape.');
        } else {
            console.log('✅ Formato Netscape detectado.');
        }

        const cookiePath = path.join(
            os.tmpdir(),
            `rustlogix-youtube-cookies-${process.pid}.txt`
        );

        fs.writeFileSync(cookiePath, cookieData, {
            mode: 0o600
        });

        console.log(`🍪 Archivo de cookies creado: ${cookiePath}`);
        console.log(`🍪 Tamaño decodificado: ${cookieData.length} bytes.`);

        return cookiePath;

    } catch (error) {
        console.error('❌ Error preparando cookies:', error.message);
        return null;
    }
}

// ============================================================
// LIMPIEZA
// ============================================================

function cleanupGuildStream(guildId) {

    const stream = guildStreams.get(guildId);

    if (stream) {
        try {
            if (typeof stream.destroy === 'function') {
                stream.destroy();
            }
        } catch (_) {}

        guildStreams.delete(guildId);
    }

    guildResources.delete(guildId);
}

// ============================================================
// DETENER AUDIO
// ============================================================

function stopGuildAudio(guildId) {

    const player = guildPlayers.get(guildId);

    if (player) {
        try {
            player.stop(true);
        } catch (_) {}
    }

    cleanupGuildStream(guildId);
}

// ============================================================
// URL YOUTUBE
// ============================================================

function normalizeYouTubeUrl(input) {

    try {

        const url = new URL(input);

        if (
            url.hostname.includes('youtube.com') ||
            url.hostname.includes('youtu.be')
        ) {

            // Eliminamos parámetros de playlist/radio
            url.searchParams.delete('list');
            url.searchParams.delete('start_radio');
            url.searchParams.delete('index');
            url.searchParams.delete('pp');

            return url.toString();
        }

    } catch (_) {}

    return input;
}

// ============================================================
// VIDEO ID
// ============================================================

function getYouTubeVideoId(input) {

    try {

        const url = new URL(input);

        if (url.hostname.includes('youtu.be')) {
            return url.pathname.replace('/', '');
        }

        if (url.hostname.includes('youtube.com')) {
            return url.searchParams.get('v');
        }

    } catch (_) {}

    return null;
}

// ============================================================
// DURACIÓN
// ============================================================

function formatDuration(seconds) {

    if (!seconds || !Number.isFinite(seconds)) {
        return 'Desconocida';
    }

    const total = Math.floor(seconds);

    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// ============================================================
// COMANDO
// ============================================================

module.exports = {

    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Reproduce audio de YouTube en tu canal de voz.')
        .addStringOption(option =>
            option
                .setName('consulta')
                .setDescription('URL de YouTube')
                .setRequired(true)
        ),

    async execute(interaction) {

        console.log('');
        console.log('==========================================');
        console.log('🎯 EJECUTANDO /PLAY');
        console.log('==========================================');

        const guild = interaction.guild;

        if (!guild) {
            return interaction.reply({
                content: '❌ Este comando solo puede utilizarse dentro de un servidor.',
                ephemeral: true
            });
        }

        const member = interaction.member;

        const voiceChannel = member?.voice?.channel;

        if (!voiceChannel) {

            return interaction.reply({
                content: '❌ Primero debes entrar a un canal de voz.',
                ephemeral: true
            });
        }

        const query = interaction.options.getString('consulta');

        console.log(`🔊 Canal de voz: ${voiceChannel.name} (${voiceChannel.id})`);
        console.log(`🎯 Consulta recibida: ${query}`);

        await interaction.deferReply();

        console.log('✅ Interacción diferida.');

        // ====================================================
        // URL
        // ====================================================

        const url = normalizeYouTubeUrl(query);

        const videoId = getYouTubeVideoId(url);

        console.log(`🔗 URL normalizada: ${url}`);
        console.log(`🆔 Video ID: ${videoId || 'desconocido'}`);

        if (!videoId) {

            return interaction.editReply(
                '❌ Debes proporcionar una URL válida de YouTube.'
            );
        }

        // ====================================================
        // VOZ
        // ====================================================

        console.log('');
        console.log('🔊 PASO 1/3 — CONECTANDO A VOZ');
        console.log('');

        let connection = getVoiceConnection(guild.id);

        if (connection) {

            console.log('🔊 Ya existe una conexión de voz.');

            if (connection.joinConfig.channelId !== voiceChannel.id) {

                try {
                    connection.destroy();
                } catch (_) {}

                connection = null;
            }
        }

        if (!connection) {

            console.log('🔊 Creando conexión explícita...');

            connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,

                // MUY IMPORTANTE
                selfDeaf: false,
                selfMute: false
            });

            guildConnections.set(guild.id, connection);

            console.log('🔊 Conexión creada.');
        }

        try {

            await entersState(
                connection,
                VoiceConnectionStatus.Ready,
                30000
            );

        } catch (error) {

            console.error('❌ No se pudo conectar a voz:', error);

            try {
                connection.destroy();
            } catch (_) {}

            guildConnections.delete(guild.id);

            return interaction.editReply(
                '❌ No pude conectarme al canal de voz.'
            );
        }

        console.log('');
        console.log('==========================================');
        console.log('🔊 CONECTADO A VOZ CORRECTAMENTE');
        console.log(`🔊 Canal: ${voiceChannel.name}`);
        console.log(`🔊 ID: ${voiceChannel.id}`);
        console.log('🎧 Ensordecido: NO');
        console.log('🔇 Muteado: NO');
        console.log('==========================================');

        // ====================================================
        // PLAYER
        // ====================================================

        console.log('');
        console.log('🎧 PASO 2/3 — PREPARANDO STREAM');

        stopGuildAudio(guild.id);

        console.log(`🎵 Creando AudioPlayer para ${guild.id}...`);

        const player = createAudioPlayer({
            behaviors: {
                noSubscriber: NoSubscriberBehavior.Play
            }
        });

        guildPlayers.set(guild.id, player);

        // ====================================================
        // EVENTOS PLAYER
        // ====================================================

        player.on(
            AudioPlayerStatus.Buffering,
            () => {

                console.log(
                    `⏳ AudioPlayer: BUFFERING (${guild.id})`
                );
            }
        );

        player.on(
            AudioPlayerStatus.Playing,
            () => {

                console.log('');
                console.log('▶️ AudioPlayer: PLAYING');
                console.log(`🎵 Guild: ${guild.id}`);
                console.log('');
            }
        );

        player.on(
            AudioPlayerStatus.Idle,
            () => {

                console.log(
                    `⏹️ AudioPlayer: IDLE (${guild.id})`
                );

                cleanupGuildStream(guild.id);
            }
        );

        player.on(
            'error',
            error => {

                console.error('');
                console.error('==========================================');
                console.error('❌ ERROR DEL AUDIO PLAYER');
                console.error('==========================================');
                console.error(error);
                console.error('==========================================');

                cleanupGuildStream(guild.id);
            }
        );

        // ====================================================
        // YT-DLP
        // ====================================================

        const yt = getYtDlp();

        const cookiePath = prepareYouTubeCookies();

        console.log('');
        console.log('==========================================');
        console.log('🎧 CREANDO STREAM DE YOUTUBE');
        console.log('==========================================');
        console.log(`🔗 URL: ${url}`);

        console.log('');
        console.log('🤖 PO TOKEN PROVIDER');
        console.log(`📁 BGUTIL: ${BGUTIL_SERVER_HOME}`);
        console.log(`📁 Existe: ${fs.existsSync(BGUTIL_SERVER_HOME) ? 'SÍ' : 'NO'}`);

        const streamBuilder = yt
            .stream(url)
            .filter('audioonly')
            .quality(5)
            .type('opus');

        // ====================================================
        // ARGUMENTOS YT-DLP
        // ====================================================

        streamBuilder.addArgs(
            '--no-playlist',
            '--no-part',
            '--no-cache-dir',
            '--no-warnings',
            '--quiet',

            // Cliente recomendado actualmente para PO Tokens
            '--extractor-args',
            'youtube:player-client=mweb',

            // BGUTIL
            '--extractor-args',
            `youtubepot-bgutilscript:server_home=${BGUTIL_SERVER_HOME}`,

            // Runtime JS
            '--js-runtimes',
            `node:${process.execPath}`
        );

        // ====================================================
        // COOKIES OPCIONALES
        // ====================================================

        if (cookiePath) {

            console.log('🍪 yt-dlp utilizará cookies.');

            streamBuilder.addArgs(
                '--cookies',
                cookiePath
            );

        } else {

            console.log(
                '🍪 yt-dlp funcionará sin cookies.'
            );
        }

        // ====================================================
        // USER AGENT OPCIONAL
        // ====================================================

        if (process.env.YOUTUBE_USER_AGENT) {

            console.log('🌐 Usando YOUTUBE_USER_AGENT.');

            streamBuilder.addArgs(
                '--user-agent',
                process.env.YOUTUBE_USER_AGENT
            );
        }

        // ====================================================
        // STREAM
        // ====================================================

        let audioStream;

        try {

            console.log('');
            console.log('🚀 Iniciando yt-dlp...');
            console.log('🤖 Solicitando PO Token mediante bgutil...');
            console.log('');

            audioStream = streamBuilder.getStream();

            guildStreams.set(
                guild.id,
                audioStream
            );

            console.log('🎧 Stream yt-dlp preparado.');
            console.log('⏳ Esperando datos de audio...');

        } catch (error) {

            console.error('');
            console.error('==========================================');
            console.error('❌ ERROR CREANDO STREAM');
            console.error('==========================================');
            console.error(error);
            console.error('==========================================');

            if (cookiePath) {
                try {
                    fs.unlinkSync(cookiePath);
                } catch (_) {}
            }

            return interaction.editReply(
                `❌ No pude obtener el audio de YouTube.\n\`${error.message?.slice(0, 900) || 'Error desconocido'}\``
            );
        }

        // ====================================================
        // AUDIO RESOURCE
        // ====================================================

        console.log('🎵 Creando AudioResource...');

        const resource = createAudioResource(
            audioStream,
            {
                inputType: StreamType.WebmOpus,
                metadata: {
                    videoId,
                    url
                }
            }
        );

        guildResources.set(
            guild.id,
            resource
        );

        // ====================================================
        // SUSCRIBIR
        // ====================================================

        console.log('🔊 Suscribiendo player a Discord...');

        connection.subscribe(player);

        // ====================================================
        // PLAY
        // ====================================================

        console.log('');
        console.log('▶️ PASO 3/3 — REPRODUCIENDO');

        player.play(resource);

        console.log('');
        console.log('==========================================');
        console.log('🎵 REPRODUCCIÓN INICIADA');
        console.log(`🆔 Video: ${videoId}`);
        console.log(`🔊 Canal: ${voiceChannel.name}`);
        console.log('🎧 Ensordecido: NO');
        console.log('🔇 Muteado: NO');
        console.log('==========================================');

        // ====================================================
        // EMBED
        // ====================================================

        const embed = new EmbedBuilder()
            .setTitle('🎵 Reproduciendo')
            .setDescription(
                `[Abrir vídeo en YouTube](${url})`
            )
            .addFields(
                {
                    name: '🆔 Vídeo',
                    value: videoId,
                    inline: true
                },
                {
                    name: '🔊 Canal',
                    value: voiceChannel.name,
                    inline: true
                }
            )
            .setFooter({
                text: 'RustLogix • Reproductor ligero'
            });

        await interaction.editReply({
            embeds: [embed]
        });

        console.log('✅ /play terminado');
        console.log('');

        // ====================================================
        // LIMPIEZA COOKIES
        // ====================================================

        const cleanupCookies = () => {

            if (cookiePath) {

                try {
                    if (fs.existsSync(cookiePath)) {
                        fs.unlinkSync(cookiePath);
                        console.log('🍪 Archivo temporal de cookies eliminado.');
                    }
                } catch (_) {}
            }
        };

        audioStream.once?.('close', cleanupCookies);
        audioStream.once?.('end', cleanupCookies);
        audioStream.once?.('error', cleanupCookies);
    }
};