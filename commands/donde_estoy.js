const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");


module.exports = {

    data: new SlashCommandBuilder()

        .setName("donde-estoy")

        .setDescription(
            "Muestra los servidores donde está conectado el bot"
        ),


    async execute(interaction) {


        const guilds =
            interaction.client.guilds.cache;


        let lista = "";


        guilds.forEach(guild => {

            lista +=
                `🖥️ **${guild.name}**\n` +
                `👥 Miembros: ${guild.memberCount}\n\n`;

        });


        const embed =
            new EmbedBuilder()

                .setTitle("🤖 BattleMetricsBot")

                .setColor("#57F287")

                .setDescription(
                    lista || "No estoy en ningún servidor"
                )

                .addFields({

                    name: "📊 Total de servidores",

                    value:
                        `${guilds.size}`,

                    inline: true

                })

                .setTimestamp()

                .setFooter({

                    text:
                    "BattleMetrics Bot"

                });


        await interaction.reply({

            embeds: [embed]

        });


    }

};