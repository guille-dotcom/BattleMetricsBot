const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getBattleMetricsHours
} = require("../services/battlemetricsHours");


module.exports = {

    data: new SlashCommandBuilder()

        .setName("horasbm")

        .setDescription(
            "Muestra las horas usando un perfil de BattleMetrics"
        )

        .addStringOption(option =>
            option
                .setName("link")
                .setDescription(
                    "Link del perfil BattleMetrics"
                )
                .setRequired(true)
        ),


    async execute(interaction) {

        try {

            console.log("===== INICIO /horasbm =====");


            await interaction.deferReply();


            const link =
                interaction.options.getString("link");


            console.log("LINK:", link);


            const match =
                link.match(/players\/(\d+)/);


            if (!match) {

                return await interaction.editReply(
                    "❌ Link inválido.\n\nEjemplo:\nhttps://www.battlemetrics.com/players/1010507609"
                );

            }


            const battlemetricsId = match[1];


            console.log("ID BM:", battlemetricsId);


            await interaction.editReply(
                "⏱️ Calculando horas..."
            );


            const data =
                await getBattleMetricsHours(
                    battlemetricsId
                );


            console.log("DATOS RECIBIDOS:", data);


            const totalHoras =
                Number(data.totalHoras || 0);


            const nombreJugador =
                data.nombre || "Desconocido";


            let servidoresEncontrados = 0;


            try {

                servidoresEncontrados =
                    data.servidores.rust.datos.servidoresEncontrados || 0;

            } catch {

                servidoresEncontrados = 0;

            }


            const embed =
                new EmbedBuilder()

                    .setTitle("🎮 Perfil BattleMetrics")

                    .setColor("#57F287")

                    .setDescription(
                        `**ID BattleMetrics**\n\`${battlemetricsId}\``
                    )

                    .addFields(

                        {
                            name: "👤 Jugador",
                            value: `${nombreJugador}`,
                            inline: false
                        },

                        {
                            name: "🖥️ Servidores",
                            value: `${servidoresEncontrados}`,
                            inline: true
                        },

                        {
                            name: "⏱️ Horas",
                            value: `${totalHoras.toFixed(2)} horas`,
                            inline: true
                        }

                    )

                    .setTimestamp()

                    .setFooter({
                        text: "BattleMetrics Bot"
                    });


            console.log("ENVIANDO EMBED...");


            await interaction.editReply({

                content: null,
                embeds: [embed]

            });


            console.log("✅ RESPUESTA ENVIADA");


        } catch (error) {


            console.error("ERROR EN /horasbm");
            console.error(error);


            try {


                if (interaction.deferred || interaction.replied) {


                    await interaction.editReply(
                        "❌ Ocurrió un error ejecutando el comando."
                    );


                } else {


                    await interaction.reply({

                        content:
                            "❌ Ocurrió un error ejecutando el comando.",

                        ephemeral:
                            true

                    });


                }


            } catch (err) {

                console.error(
                    "ERROR RESPONDIENDO A DISCORD"
                );

                console.error(err);

            }

        }

    }

};