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

      console.log(`[DEBUG] Servidor configurado en base de datos para este Discord: "${bmServerId}" (Tipo: ${typeof bmServerId})`);

      if (!configServer || !bmServerId) {
        return interaction.editReply({ 
          content: '❌ No hay ningún servidor de Rust configurado. Usa `/configurar-servidor` primero.' 
        });
      }

      // 2. Obtener la lista de perfiles vigilados
      const vigilados = await Vigilado.find({ guildId });
      if (vigilados.length === 0) {
        return interaction.editReply({ 
          content: '⚠️ No tienes ningún perfil guardado para vigilar. Usa `/vigilar` para añadir algunos.' 
        });
      }

      const encontradosOnline = [];
      const offline = [];

      // 3. Consultar cada jugador
      for (const v of vigilados) {
        try {
          const playerUrl = `https://api.battlemetrics.com/players/${v.battlemetricsId}?include=server`;
          const response = await fetch(playerUrl, {
            headers: {
              'Authorization': `Bearer ${process.env.BATTLEMETRICS_API_KEY}`
            }
          });

          if (!response.ok) {
            console.log(`[DEBUG] Error en API para el jugador ${v.alias}: Status ${response.status}`);
            offline.push(v.alias);
            continue;
          }

          const playerData = await response.json();
          
          // Extraer IDs de servidor de la respuesta
          const relServerId = playerData.data?.relationships?.server?.data?.id;
          
          let includedServerId = null;
          if (playerData.included) {
            const serverInc = playerData.included.find(item => item.type === 'server');
            if (serverInc) includedServerId = serverInc.id;
          }

          console.log(`[DEBUG] Jugador: ${v.alias} (${v.battlemetricsId})`);
          console.log(`[DEBUG] -> relServerId encontrado: "${relServerId}"`);
          console.log(`[DEBUG] -> includedServerId encontrado: "${includedServerId}"`);

          const isOnlineOnThisServer = 
            (relServerId && relServerId.toString() === bmServerId.toString()) ||
            (includedServerId && includedServerId.toString() === bmServerId.toString());

          if (isOnlineOnThisServer) {
            encontradosOnline.push(v.alias);
          } else {
            offline.push(v.alias);
          }

        } catch (err) {
          console.error(`Error consultando al jugador ${v.alias}:`, err);
          offline.push(v.alias);
        }
      }

      // 4. Crear el Embed con los resultados
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
        content: '❌ Ocurrió un error al consultar la API de BattleMetrics.' 
      });
    }
  },
};