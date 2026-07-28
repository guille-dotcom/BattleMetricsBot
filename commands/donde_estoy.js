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
        const MI_ID = "585618134447161373";

        if (interaction.user.id !== MI_ID) {
            return interaction.reply({
                content: "❌ No tienes permiso para usar este comando.",
                ephemeral: true
            });
        }

        const guilds = interaction.client.guilds.cache;

        let lista = "";

        guilds.forEach(guild => {
            lista +=
                `🖥️ **${guild.name}**\n` +
                `👥 Miembros: ${guild.memberCount}\n\n`;
        });

        const embed = new EmbedBuilder()
            .setTitle("🤖 RustLogix")
            .setColor("#57F287")
            .setDescription(
                lista || "No estoy en ningún servidor"
            )
            .addFields({
                name: "📊 Total de servidores",
                value: `${guilds.size}`,
                inline: true
            })
            .setTimestamp()
            .setFooter({
                text: "RustLogix"
            });

        await interaction.reply({
            embeds: [embed],
            ephemeral: true
        });
    }
};