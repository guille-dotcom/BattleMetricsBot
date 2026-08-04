const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("ping")
        .setDescription("Muestra el estado del bot"),

    async execute(interaction) {
        try {
            const botPing = Date.now() - interaction.createdTimestamp;
            const apiPing = Math.round(interaction.client.ws.ping);
            const guilds = interaction.client.guilds.cache.size;

            const embed = new EmbedBuilder()
                .setColor("#57F287")
                .setTitle("🛰️ RustLogix")
                .setDescription("🟢 **Estado:** Operativo")
                .addFields(
                    {
                        name: "🤖 Latencia",
                        value: `\`${botPing} ms\``,
                        inline: true
                    },
                    {
                        name: "🌐 API Discord",
                        value: `\`${apiPing} ms\``,
                        inline: true
                    },
                    {
                        name: "🏠 Servidores",
                        value: `\`${guilds}\``,
                        inline: true
                    }
                )
                .setFooter({
                    text: "RustLogix"
                })
                .setTimestamp();

            await interaction.reply({
                embeds: [embed]
            });

        } catch (error) {
            console.error("Error en comando /ping:", error);
            
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "❌ Ocurrió un error al calcular el ping." });
            } else {
                await interaction.reply({ content: "❌ Ocurrió un error al calcular el ping.", ephemeral: true });
            }
        }
    }
};