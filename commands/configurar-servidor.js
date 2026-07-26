const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("configurar-servidor")
    .setDescription("Configura el ID del servidor de BattleMetrics")
    .addStringOption((option) =>
      option
        .setName("serverid")
        .setDescription("El ID del servidor de BattleMetrics (Ej: 433255)")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo administradores pueden usarlo

  async execute(interaction) {
    const serverId = interaction.options.getString("serverid");
    const configPath = path.join(__dirname, "../data/config.json");

    try {
      // 1. Validar/crear la carpeta data si no existe
      const dirPath = path.dirname(configPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      let config = {};

      // 2. Leer configuración previa
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      }

      // 3. Guardar con la clave exacta que lee tu /horas
      config.battlemetricsServer = serverId;

      // 4. Escribir en el JSON
      fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf-8");

      return await interaction.reply({
        content: `✅ Servidor de BattleMetrics configurado correctamente con el ID: \`${serverId}\``,
        ephemeral: true // Solo lo ve quien ejecuta el comando
      });

    } catch (error) {
      console.error("Error al guardar la configuración:", error);
      return await interaction.reply({
        content: "❌ Ocurrió un error al intentar guardar la configuración del servidor.",
        ephemeral: true
      });
    }
  }
};