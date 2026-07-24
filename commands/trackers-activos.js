const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { trackersFile } = require("../services/trackerService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("trackers-activos")
        .setDescription("Muestra la lista de perfiles de BattleMetrics que se están vigilando en este servidor"),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            if (!fs.existsSync(trackersFile)) {
                return await interaction.editReply("📋 No hay ningún jugador registrado en el sistema actualmente.");
            }

            const trackers = JSON.parse(fs.readFileSync(trackersFile, 'utf8'));
            const playerIds = Object.keys(trackers);

            // Filtrar solo los registrados en el canal actual para mantener orden
            const filtrados = playerIds.filter(id => trackers[id].canalId === interaction.channel.id);

            if (filtrados.length === 0) {
                return await interaction.editReply("📋 No hay jugadores registrados para recibir alertas automáticas en este canal específico.");
            }

            const embed = new EmbedBuilder()
                .setTitle("🔎 Lista de Seguimiento en Segundo Plano")
                .setColor("#5865F2")
                .setDescription("El bot escanea estos perfiles cada 30 segundos y alertará ante cambios de estado.")
                .setTimestamp();

            filtrados.forEach((id, index) => {
                const data = trackers[id];
                embed.addFields({
                    name: `${index + 1}. ID: ${id}`,
                    value: `• **Último Estado:** \`${data.ultimoEstado.toUpperCase()}\`\n• **Añadido por:** ${data.registradoPor}`,
                    inline: false
                });
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error("ERROR EN TRACKERS ACTIVOS:", error);
            await interaction.editReply("❌ Ocurrió un error al cargar la lista de monitoreo.");
        }
    }
};
