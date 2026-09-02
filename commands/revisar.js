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

      // 2. Obtener la lista de perfiles vigilados
      const vigilados = await Vigilado.find({ guildId });
      if (vigilados.length === 0) {
        return interaction.editReply({ 
          content: '⚠️ No tienes ningún perfil guardado para vigilar. Usa `/vigilar` para añadir algunos.' 
        });
      }

      const encontradosOnline = [];
      const offline = [];

      // 3. Consultar la lista de servidores activos del jugador usando el endpoint correcto de relaciones
      for (const v of vigilados) {
        try {
          const playerUrl = `https://api.battlemetrics.com/players/${v.battlemetricsId}/servers?include=server`;
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

          const data = await response.json();
          
          let estaConectadoEnEsteServer = false;

          // Revisamos los servidores devueltos en la relación
          if (data.data) {
            for (const rel of data.data) {
              const serverId = rel.relationships?.server?.data?.id || rel.id;
              // Comprobamos si coincide con nuestro servidor y si su estado indica que está jugando ahora mismo
              if (serverId && serverId.toString() === bmServerId.toString()) {
                // Verificamos si la sesión sigue activa (sin fecha de parada o meta online)
                if (rel.attributes && rel.attributes.active === true) {
                  estaConectadoEnEsteServer = true;
                  break;
                }
              }
            }
          }

          // Alternativa por si el 'included' trae el servidor online actual
          if (!estaConectadoEnEsteServer && data.included) {
            const serverInc = data.included.find(item => item.type === 'server' && item.id.toString() === bmServerId.toString());
            // Si el servidor aparece en la lista de incluidos recientes del jugador
            if (serverInc) {
              estaConectadoEnEsteServer = true;
            }
          }

          if (estaConectadoEnEsteServer) {
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