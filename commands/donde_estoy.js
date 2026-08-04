const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("donde-estoy")
        .setDescription("Muestra los servidores donde está conectado el bot"),

    async execute(interaction) {
        const USUARIOS_AUTORIZADOS = [
            "585618134447161373",
            "737802401913896993"
        ];

        if (!USUARIOS_AUTORIZADOS.includes(interaction.user.id)) {
            return interaction.reply({
                content: "❌ No tienes permiso para usar este comando.",
                ephemeral: true
            });
        }

        // Diferimos la respuesta para prevenir cualquier bloqueo de tiempo
        await interaction.deferReply({ ephemeral: true });

        try {
            const guilds = interaction.client.guilds.cache;
            let lista = "";

            guilds.forEach(guild => {
                const textoServidor = `🖥️ **${guild.name}**\n👥 Miembros: ${guild.memberCount}\n\n`;
                // Evitamos superar el límite de caracteres de la descripción (4096 caracteres)
                if ((lista + textoServidor).length < 4000) {
                    lista += textoServidor;
                }
            });

            const embed = new EmbedBuilder()
                .setTitle("🤖 RustLogix")
                .setColor("#57F287")
                .setDescription(lista || "No estoy en ningún servidor")
                .addFields({
                    name: "📊 Total de servidores",
                    value: `${guilds.size}`,
                    inline: true
                })
                .setTimestamp()
                .setFooter({
                    text: "RustLogix"
                });

            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error("Error en el comando donde-estoy:", error);
            await interaction.editReply({
                content: "❌ Ocurrió un error al intentar obtener la lista de servidores."
            });
        }
    }
};