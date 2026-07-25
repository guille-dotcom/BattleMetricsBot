const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    obtenerBattleMetricsId,
    registrarTracker
} = require("../services/trackerService");


const {
    getBattleMetricsPlayerStatus
} = require("../services/battlemetricsSearch");


module.exports = {

    data: new SlashCommandBuilder()

        .setName("tracker")

        .setDescription(
            "Rastrea un jugador de BattleMetrics durante 24 horas"
        )

        .addStringOption(option =>
            option
                .setName("jugador")
                .setDescription(
                    "ID o link de BattleMetrics"
                )
                .setRequired(true)
        ),



    async execute(interaction) {

        await interaction.deferReply();


        const jugador =
            interaction.options.getString("jugador");


        try {


            const battlemetricsId =
                obtenerBattleMetricsId(jugador);



            if(!battlemetricsId){

                return interaction.editReply(
                    "❌ ID o link de BattleMetrics inválido."
                );

            }
const status =
await getBattleMetricsPlayerStatus(
    battlemetricsId
);

const nombre =
status?.name || "Desconocido";


const tracker =
    registrarTracker({

        battlemetricsId,

        nombre,

        canalId: interaction.channel.id,

        guildId: interaction.guild.id,

        registradoPor:
        interaction.user.tag

    });


            const embed =
                new EmbedBuilder()

                .setTitle(
                    "🎯 Tracker creado"
                )

                .setColor(
                    "#57F287"
                )

                .addFields(

                    {
                        name:"🆔 BattleMetrics",
                        value:`\`${battlemetricsId}\``,
                        inline:true
                    },

                    {
                        name:"⏱ Duración",
                        value:"24 horas",
                        inline:true
                    },

                    {
                        name:"👤 Registrado por",
                        value:interaction.user.tag,
                        inline:false
                    }

                )

                .setTimestamp();



            await interaction.editReply({

                embeds:[
                    embed
                ]

            });



        } catch(error){


            console.error(
                "ERROR TRACKER:",
                error
            );


            await interaction.editReply(
                "❌ Error creando tracker."
            );


        }


    }

};