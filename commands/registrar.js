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
        if (!match) {
            return await interaction.editReply("❌ Link inválido. Proporciona un enlace válido de BattleMetrics.");
        }
        // CORREGIDO: Se extrae el índice [1] para obtener solo los números limpios
        const battlemetricsId = String(match[1]);

        try {
            // Leer el archivo de memoria de forma segura
            let trackers = {};
            if (fs.existsSync(trackersFile)) {
                try {
                    trackers = JSON.parse(fs.readFileSync(trackersFile, 'utf8'));
                } catch {
                    trackers = {};
                }
            }

            // Registrar con estado inicial offline
            trackers[battlemetricsId] = {
                canalId: channelId,
                ultimoEstado: "offline",
                registradoPor: interaction.user.tag
            };

            // Guardar de forma limpia
            fs.writeFileSync(trackersFile, JSON.stringify(trackers, null, 4), 'utf8');

            await interaction.editReply(`✅ El perfil \`${battlemetricsId}\` ha sido registrado con éxito. Recibirás alertas en este canal únicamente cuando pase de **Online ↔ Offline**.`);
        } catch (error) {
            console.error("ERROR EN COMANDO REGISTRAR:", error);
            await interaction.editReply("❌ Ocurrió un error al guardar el registro.");
        }
    }
};
