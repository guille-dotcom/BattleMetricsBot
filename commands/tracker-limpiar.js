const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    leerTrackers,
    guardarTrackers
} = require("../services/trackerService");


module.exports = {

    data: new SlashCommandBuilder()

        .setName("tracker-limpiar")

        .setDescription(
            "Elimina todos los trackers activos de este servidor"
        ),



    async execute(interaction) {


        await interaction.deferReply();



        try {


            const trackers =
            leerTrackers();



            let eliminados = 0;



            for(const id in trackers) {


                if(
                    trackers[id].guildId === interaction.guild.id
                ) {


                    delete trackers[id];

                    eliminados++;


                }

            }



            guardarTrackers(trackers);



            const embed =
            new EmbedBuilder()

            .setTitle(
                "🧹 Trackers limpiados"
            )

            .setDescription(
                `Se eliminaron **${eliminados}** trackers activos de este servidor.`
            )

            .setColor(
                0xff0000
            )

            .setTimestamp();



            await interaction.editReply({

                embeds:[
                    embed
                ]

            });



        } catch(error) {


            console.error(
                "ERROR LIMPIANDO TRACKERS:",
                error
            );


            await interaction.editReply(
                "❌ Error limpiando trackers."
            );


        }

    }

};