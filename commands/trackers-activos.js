const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags
} = require("discord.js");

const fs = require("fs");

const {
    trackersFile
} = require("../services/trackerService");


module.exports = {

    data: new SlashCommandBuilder()

        .setName("trackers-activos")

        .setDescription(
            "Muestra los perfiles de BattleMetrics que están siendo vigilados"
        ),


    async execute(interaction) {

        try {

            await interaction.deferReply();

            if (!fs.existsSync(trackersFile)) {

                return await interaction.editReply(
                    "📋 No hay ningún tracker activo actualmente."
                );

            }


            const trackers =
                JSON.parse(
                    fs.readFileSync(
                        trackersFile,
                        "utf8"
                    )
                );


            const playerIds =
                Object.keys(trackers);


            const filtrados =
                playerIds.filter(

                    id =>
                        trackers[id].canalId === interaction.channel.id

                );


            if (filtrados.length === 0) {

                return await interaction.editReply(
                    "📋 No hay jugadores siendo trackeados en este canal."
                );

            }


            const embed =
                new EmbedBuilder()

                    .setTitle(
                        "🎯 Trackers Activos"
                    )

                    .setDescription(
                        "Perfiles BattleMetrics actualmente bajo vigilancia."
                    )

                    .setColor(
                        0x5865F2
                    )

                    .setTimestamp();


            const botones = [];

            // Discord permite un máximo de 25 botones por mensaje (5 ActionRows de 5 botones)
            const limiteFiltrados = filtrados.slice(0, 25);


            limiteFiltrados.forEach((id, index) => {

                const data =
                    trackers[id];


                const tiempoRestante =
                    Math.max(
                        0,
                        data.expiraEn - Date.now()
                    );


                const horas =
                    Math.floor(
                        tiempoRestante / 3600000
                    );


                const minutos =
                    Math.floor(
                        (tiempoRestante % 3600000) / 60000
                    );


                embed.addFields({

                    name:
                        `${index + 1}. 👤 ${data.nombre || "Desconocido"}`,

                    value:
`🔗 **Perfil BattleMetrics**
https://www.battlemetrics.com/players/${data.battlemetricsId}

📡 **Estado:** ${(data.ultimoEstado || "desconocido").toUpperCase()}

⏳ **Tracker restante:** ${horas}h ${minutos}m`,

                    inline: false

                });


                botones.push(

                    new ButtonBuilder()

                        .setCustomId(
                            `eliminar_tracker_${id}`
                        )

                        .setLabel(
                            `❌ Eliminar ${data.nombre || id}`.slice(0, 80) // Limite de 80 caracteres en etiqueta
                        )

                        .setStyle(
                            ButtonStyle.Danger
                        )

                );

            });


            const componentes = [];


            for (let i = 0; i < botones.length; i += 5) {

                componentes.push(

                    new ActionRowBuilder()

                        .addComponents(
                            botones.slice(i, i + 5)
                        )

                );

            }


            await interaction.editReply({

                embeds: [

                    embed

                ],

                components:

                    componentes

            });


        } catch (error) {

            console.error(
                "ERROR EN TRACKERS ACTIVOS:",
                error
            );

            if (interaction.deferred || interaction.replied) {

                await interaction.editReply(
                    "❌ Ocurrió un error al cargar los trackers activos."
                );

            } else {

                await interaction.reply({
                    content: "❌ Ocurrió un error al cargar los trackers activos.",
                    flags: MessageFlags.Ephemeral
                });

            }

        }

    }

};