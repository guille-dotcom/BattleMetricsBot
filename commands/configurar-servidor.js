const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const ServerConfig = require("../models/ServerConfig"); // Importamos el modelo de MongoDB

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

    // Extrae únicamente los números del texto ingresado
    const match = input.match(/\d+/g);
    const cleanServerId = match ? match[match.length - 1] : null;

    if (!cleanServerId) {
      return await interaction.reply({
        content: "❌ No se pudo encontrar un ID de servidor válido en el enlace o texto ingresado.",
        flags: MessageFlags.Ephemeral
      });
    }

    const guildId = interaction.guild.id;

    try {
      // Guardar o actualizar en MongoDB usando findOneAndUpdate con upsert: true
      await ServerConfig.findOneAndUpdate(
        { guildId: guildId },
        { battleMetricsServerId: cleanServerId },
        { upsert: true, new: true }
      );

      return await interaction.reply({
        content: `✅ Servidor de BattleMetrics configurado correctamente en la base de datos. ID guardado: \`${cleanServerId}\``,
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error("Error al guardar la configuración en MongoDB:", error);
      return await interaction.reply({
        content: "❌ Ocurrió un error al intentar guardar la configuración del servidor en la base de datos.",
        flags: MessageFlags.Ephemeral
      });
    }
  }
};