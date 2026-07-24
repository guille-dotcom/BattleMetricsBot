const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "data", "trackers.json");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("trackers-activos")
    .setDescription("Muestra la lista de jugadores que están siendo monitoreados en este servidor"),

  async execute(interaction) {
    await interaction.deferReply();
    const guildId = String(interaction.guild.id);

    // 1. Leer los trackers desde la base de datos local
    let trackers = [];
    try {
      if (fs.existsSync(file)) {
        trackers = JSON.parse(fs.readFileSync(file, "utf8"));
      }
    } catch (error) {
      console.log("ERROR LEYENDO TRACKERS EN LISTA:", error.message);
    }

    if (!Array.isArray(trackers)) trackers = [];

    // 2. Filtrar solo los trackers que pertenezcan a este servidor de Discord
    const activosServidor = trackers.filter(t => String(t.guildId) === guildId);

    if (activosServidor.length === 0) {
      return interaction.editReply("❌ Actualmente no hay ningún jugador bajo seguimiento en este servidor.");
    }

    // 3. Calcular cuánto tiempo le queda a cada uno para expirar
    function obtenerTiempoRestante(expira) {
      const diferencia = expira - Date.now();
      if (diferencia <= 0) return "Expirando...";
      const horas = Math.floor(diferencia / 3600000);
      const minutos = Math.floor((diferencia % 3600000) / 60000);
      return `${horas}h ${minutos}m`;
    }

    // 4. Construir el diseño de la lista en formato de texto ordenado
    let listaTexto = "";
    activosServidor.forEach((tracker, index) => {
      const estadoEmoji = tracker.lastState === "ONLINE" ? "🟢 ONLINE" : "🔴 OFFLINE";
      listaTexto += `**${index + 1}. ${tracker.playerName}**\n` +
                    `• ID: \`${tracker.playerId}\`\n` +
                    `• Estado actual: ${estadoEmoji}\n` +
                    `• Tiempo restante: \`${obtenerTiempoRestante(tracker.expiresAt)}\`\n\n`;
    });

    // 5. Enviar el recuadro Embed con la lista al canal
    const embed = new EmbedBuilder()
      .setTitle("📋 Jugadores Bajo Monitoreo")
      .setColor("#5865F2") // Color azul Discord institucional
      .setDescription(listaTexto)
      .setFooter({ text: `Total de trackers activos: ${activosServidor.length}/20` })
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }
};
