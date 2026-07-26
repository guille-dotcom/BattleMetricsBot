const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const fs = require("fs");
const path = require("path");

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
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Solo administradores pueden usarlo

  async execute(interaction) {
    const input = interaction.options.getString("serverid").trim();

    // Extrae únicamente los números del texto ingresado (soporta links completos e IDs puras)
    const match = input.match(/\d+/g);
    const cleanServerId = match ? match[match.length - 1] : null;

    if (!cleanServerId) {
      return await interaction.reply({
        content: "❌ No se pudo encontrar un ID de servidor válido en el enlace o texto ingresado.",
        ephemeral: true
      });
    }

    const configPath = path.join(__dirname, "../data/config.json");

    try {
      // 1. Validar/crear la carpeta data si no existe
      const dirPath = path.dirname(configPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      let config = {};

      // 2. Leer configuración previa si existe
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      }

      // 3. Guardar únicamente el ID numérico extraído
      config.battlemetricsServer = cleanServerId;

      // 4. Escribir en el archivo JSON
      fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf-8");

      return await interaction.reply({
        content: `✅ Servidor de BattleMetrics configurado correctamente. ID guardado: \`${cleanServerId}\``,
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