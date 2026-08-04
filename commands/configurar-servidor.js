const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
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
    // Usamos el formato clásico y compatible con cualquier versión de Discord.js
    await interaction.deferReply({ ephemeral: true });

    const input = interaction.options.getString("serverid").trim();

    const match = input.match(/\d+/g);
    const cleanServerId = match ? match[match.length - 1] : null;

    if (!cleanServerId) {
      return await interaction.editReply({
        content: "❌ No se pudo encontrar un ID de servidor válido en el enlace o texto ingresado."
      });
    }

    const guildId = interaction.guild.id;

    try {
      await ServerConfig.findOneAndUpdate(
        { guildId: guildId },
        { battleMetricsServerId: cleanServerId },
        { upsert: true, new: true }
      );

      return await interaction.editReply({
        content: `✅ Servidor de BattleMetrics configurado correctamente en la base de datos. ID guardado: \`${cleanServerId}\``
      });

    } catch (error) {
      console.error("Error al guardar la configuración en MongoDB:", error);
      return await interaction.editReply({
        content: "❌ Ocurrió un error al intentar guardar la configuración del servidor en la base de datos."
      });
    }
  }
};