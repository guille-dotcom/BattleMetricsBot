const { SlashCommandBuilder } = require("discord.js");
const fs = require("fs");
const { trackersFile } = require("../services/trackerService");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("registrar")
        .setDescription("Añade un perfil de BattleMetrics al sistema de alertas automáticas de este canal")
        .addStringOption(option => option.setName("link")
            .setDescription("Link del perfil de BattleMetrics")
            .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const link = interaction.options.getString("link");
        const channelId = interaction.channel.id;

        const match = link.match(/players\/(\d+)/);
        if (!match || !match[1]) {
            return await interaction.editReply("❌ Link inválido. Proporciona un enlace válido de BattleMetrics.");
        }
        const battlemetricsId = match[1];

        try {
            const trackers = JSON.parse(fs.readFileSync(trackersFile, 'utf8'));

            // Registrar con estado inicial offline por defecto (se calibrará en el primer escaneo a los 30s)
            trackers[battlemetricsId] = {
                canalId: channelId,
                ultimoEstado: "offline",
                registradoPor: interaction.user.tag
            };

            fs.writeFileSync(trackersFile, JSON.stringify(trackers, null, 4), 'utf8');

            await interaction.editReply(`✅ El perfil \`${battlemetricsId}\` ha sido registrado con éxito. Recibirás alertas en este canal únicamente cuando pase de **Online ↔ Offline**.`);
        } catch (error) {
            console.error(error);
            await interaction.editReply("❌ Ocurrió un error al guardar el registro.");
        }
    }
};
