const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Player } = require('discord-player');
const {
    YouTubeDlpExtractor,
    setFFmpegPath
} = require('discord-player-youtubedlp');
const ffmpegPath = require('ffmpeg-static');

let playerPromise = null;

async function getPlayer(client) {
    if (client.musicPlayer) {
        return client.musicPlayer;
    }

    if (!playerPromise) {
        playerPromise = (async () => {
            console.log('🎵 Inicializando reproductor...');

            setFFmpegPath(ffmpegPath);

            const player = new Player(client, {
                ffmpegPath
            });

            console.log('🎵 Registrando extractor YouTube-DLP...');

            await player.extractors.register(YouTubeDlpExtractor, {
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
            });

            client.musicPlayer = player;

            console.log('✅ Reproductor de música listo.');

            return player;
        })();
    }

    return await playerPromise;
}

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
        const voiceChannel = interaction.member.voice.channel;

        if (!voiceChannel) {
            return interaction.reply({
                content: '❌ Debes estar conectado a un canal de voz.',
                ephemeral: true
            });
        }

        const query = interaction.options.getString('cancion', true);

        await interaction.deferReply();

        try {
            console.log(`🎯 Ejecutando /play: ${query}`);

            const player = await getPlayer(interaction.client);

            const { track } = await player.play(
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

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('🎵 Canción añadida')
                .setDescription(
                    `**[${track.title}](${track.url})**`
                )
                .addFields(
                    {
                        name: '👤 Artista',
                        value: track.author || 'Desconocido',
                        inline: true
                    },
                    {
                        name: '⏱️ Duración',
                        value: track.duration || 'Desconocida',
                        inline: true
                    }
                )
                .setFooter({
                    text: `Solicitada por ${interaction.user.username}`
                });

            return interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error('❌ Error en /play:', error);

            return interaction.editReply(
                '❌ No pude encontrar o reproducir esa canción.'
            );
        }
    }
};