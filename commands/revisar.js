const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const ServerConfig = require('../models/ServerConfig');
const Vigilado = require('../models/Vigilado');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('revisar')
    .setDescription('Revisa si hay algún perfil vigilado conectado en el servidor actual'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guildId = interaction.guild.id;

    try {
      // 1. Obtener el BattleMetrics Server ID configurado
      const configServer = await ServerConfig.findOne({ guildId });
      const bmServerId = configServer?.battleMetricsServerId || configServer?.battlemetricsServerId || configServer?.serverId;

      if (!configServer || !bmServerId) {
        return interaction.editReply({ 
          content: '❌ No hay ningún servidor de Rust configurado. Usa `/configurar-servidor` primero.' 
        });
      }

      // 2. Obtener la lista de perfiles vigilados en este servidor de Discord
      const vigilados = await Vigilado.find({ guildId });
      if (vigilados.length === 0) {
        return interaction.editReply({ 
          content: '⚠️ No tienes ningún perfil guardado para vigilar. Usa `/vigilar` para añadir algunos.' 
        });
      }

      // 3. Consultar los jugadores conectados actualmente en el servidor configurado de BattleMetrics
      const serverUrl = `https://api.battlemetrics.com/servers/${bmServerId}?include=player`;
      const response = await fetch(serverUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.BATTLEMETRICS_API_KEY}`
        }
      });

      if (!response.ok) {
        return interaction.editReply({ 
          content: '❌ No se pudo conectar con el servidor en BattleMetrics para comprobar los jugadores online.' 
        });
      }

      const serverData = await response.json();
      
      // Extraer los IDs de los jugadores que están online ahora mismo en el servidor
      const idsOnlineEnServidor = new Set();
      if (serverData.included) {
        for (const inc of serverData.included) {
          if (inc.type === 'player') {
            idsOnlineEnServidor.add(inc.id.toString());
          }
        }
      }

      // 4. Cruzar los perfiles vigilados con los jugadores online en el servidor
      const encontradosOnline = [];
      const offline = [];

      for (const v of vigilados) {
        // Comparamos el battlemetricsId guardado con los que están online en el servidor
        if (idsOnlineEnServidor.has(v.battlemetricsId.toString())) {
          encontradosOnline.push(v.alias);
        } else {
          offline.push(v.alias);
        }
      }

      // 5. Crear el Embed con los resultados
      const embed = new EmbedBuilder()
        .setColor(encontradosOnline.length > 0 ? 0xE74C3C : 0x2ECC71)
        .setTitle('🔍 Resultado de la Revisión')
        .setDescription(`Servidor ID: \`${bmServerId}\``)
        .setTimestamp();

      if (encontradosOnline.length > 0) {
        embed.addFields({ 
          name: '🚨 ¡Detectados Online!', 
          value: encontradosOnline.map(alias => `• **${alias}**`).join('\n'),
          inline: false 
        });
      } else {
        embed.addFields({ 
          name: '🟢 Estado', 
          value: 'Ningún perfil vigilado se encuentra online en este servidor.',
          inline: false 
        });
      }

      if (offline.length > 0 && encontradosOnline.length > 0) {
        embed.addFields({ 
          name: '💤 Offline / Fuera', 
          value: offline.map(alias => `• ${alias}`).join('\n'),
          inline: false 
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Detalle del error en /revisar:", error);
      await interaction.editReply({ 
        content: '❌ Ocurrió un error al procesar la revisión de perfiles.' 
      });
    }
  },
};