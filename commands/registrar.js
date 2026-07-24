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

        // 1. Extraer ID del enlace de manera estricta
        const match = link.match(/players\/(\d+)/);
        if (!match) {
            return await interaction.editReply("❌ Link inválido. Proporciona un enlace válido de BattleMetrics.");
        }
        
        // Extraemos la posición 1 del array de forma segura
        const battlemetricsId = String(match[1]);

        try {
            let trackers = {};

            // 2. Leer el archivo purgando cualquier corrupción anterior de raíz
            if (fs.existsSync(trackersFile)) {
                try {
                    const contenido = fs.readFileSync(trackersFile, 'utf8');
                    trackers = JSON.parse(contenido);
                    
                    // Si por algún motivo el archivo no es un objeto válido, lo reseteamos
                    if (typeof trackers !== 'object' || trackers === null) {
                        trackers = {};
                    }
                } catch {
                    // Si el archivo está roto o corrupto, lo vaciamos para sanarlo
                    trackers = {};
                }
            }

            // 3. Registrar o actualizar los datos del jugador de manera limpia
            trackers[battlemetricsId] = {
                canalId: String(channelId),
                ultimoEstado: "offline",
                registradoPor: String(interaction.user.tag)
            };

            // 4. Escribir el nuevo archivo asegurando un formato plano y limpio sin bucles
            const stringData = JSON.stringify(trackers, null, 4);
            fs.writeFileSync(trackersFile, stringData, 'utf8');

            await interaction.editReply(`✅ El perfil \`${battlemetricsId}\` ha sido registrado con éxito. Recibirás alertas en este canal únicamente cuando pase de **Online ↔ Offline**.`);
        } catch (error) {
            console.error("ERROR EN COMANDO REGISTRAR:", error);
            await interaction.editReply("❌ Ocurrió un error crítico al guardar el registro.");
        }
    }
};
