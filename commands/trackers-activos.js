const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { trackersFile } = require("../services/trackerService");

module.exports = {

    data: new SlashCommandBuilder()

        .setName("trackers-activos")

        .setDescription(
            "Muestra los perfiles de BattleMetrics que están siendo vigilados"
        ),



    async execute(interaction) {

        await interaction.deferReply();


        try {


            if(!fs.existsSync(trackersFile)) {

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



            if(filtrados.length === 0) {

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



            filtrados.forEach((id, index) => {


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

📡 **Estado:** ${data.ultimoEstado.toUpperCase()}

⏳ **Tracker restante:** ${horas}h ${minutos}m`,

                    inline:false

                });


            });



            await interaction.editReply({

                embeds:[
                    embed
                ]

            });



        } catch(error) {


            console.error(
                "ERROR EN TRACKERS ACTIVOS:",
                error
            );


            await interaction.editReply(
                "❌ Ocurrió un error al cargar los trackers activos."
            );

        }

    }

};