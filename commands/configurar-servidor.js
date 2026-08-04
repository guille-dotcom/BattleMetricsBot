const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const ServerConfig = require("../models/ServerConfig");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("configurar-servidor")
    .setDescription("Configura el servidor de BattleMetrics mediante su link o ID")
    .addStringOption((option) =>
      option
        .setName("serverid")
        .setDescription("El link del servidor o su ID (Ej: https://www.battlemetrics.com/servers/rust/1451019)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const input = interaction.options.getString("serverid").trim();

    const match = input.match(/\d+/g);
    const cleanServerId = match ? match[match.length - 1] : null;

    if (!cleanServerId) {
      return await interaction.reply({
        content: "❌ No se pudo encontrar un ID de servidor válido en el enlace o texto ingresado.",
        flags: [MessageFlags.Ephemeral]
      });
    }

    const guildId = interaction.guild.id;

    try {
      // Guardamos directamente en MongoDB
      await ServerConfig.findOneAndUpdate(
        { guildId: guildId },
        { battleMetricsServerId: cleanServerId },
        { upsert: true, returnDocument: 'after' }
      );

      return await interaction.reply({
        content: `✅ Servidor de BattleMetrics configurado correctamente. ID guardado: \`${cleanServerId}\``,
        flags: [MessageFlags.Ephemeral]
      });

    } catch (error) {
      console.error("Error al guardar la configuración en MongoDB:", error);
      
      // Por si acaso ya se había respondido antes
      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply({
          content: "❌ Ocurrió un error al intentar guardar la configuración en la base de datos."
        });
      }

      return await interaction.reply({
        content: "❌ Ocurrió un error al intentar guardar la configuración en la base de datos.",
        flags: [MessageFlags.Ephemeral]
      });
    }
  }
};