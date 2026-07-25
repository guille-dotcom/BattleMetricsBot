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
            "Elimina trackers activos de este servidor"
        )

        .addBooleanOption(option =>
            option
                .setName("confirmar")
                .setDescription(
                    "Confirma el borrado de todos los trackers"
                )
                .setRequired(true)
        ),



    async execute(interaction) {


        await interaction.deferReply();



        try {


            const confirmar =
            interaction.options.getBoolean(
                "confirmar"
            );



            if(!confirmar) {


                return interaction.editReply(
                    "❌ Cancelado. Debes usar `/tracker-limpiar confirmar:true` para borrar los trackers."
                );


            }



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
`Se eliminaron **${eliminados}** trackers activos.

📡 El sistema seguirá funcionando normalmente.`
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