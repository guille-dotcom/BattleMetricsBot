const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { getBattleMetricsHours } = require("../services/battlemetricsHours");

const file = path.join(__dirname,"..","data","users.json");

module.exports = {
 data: new SlashCommandBuilder()
  .setName("ranking")
  .setDescription("Ranking de horas BattleMetrics"),

 async execute(interaction){
  if (!fs.existsSync(file)) {
      return await interaction.reply({ content: "❌ No hay datos de usuarios registrados para el ranking.", ephemeral: true });
  }

  const users = JSON.parse(fs.readFileSync(file, "utf-8"));
  await interaction.deferReply();

  const ranking=[];

  for(const id of Object.keys(users)){
   const u = users[id];
   try{
    const h = await getBattleMetricsHours(u.battlemetricsId);
    
    // Validar que h.totalHoras exista y sea un número
    const totalHoras = Number(h.totalHoras || 0);
    const nombreJugador = u.discord || u.nombre || "Desconocido";

    ranking.push({ discord: nombreJugador, hours: totalHoras });
   }catch(err){
       console.log(`Error obteniendo horas para ID ${u.battlemetricsId}:`, err.message);
   }
  }

  ranking.sort((a,b)=>b.hours-a.hours);

  let text="";
  ranking.slice(0,10).forEach((u,i)=>{
   text += `**${i+1}.** ${u.discord} — ${u.hours.toFixed(2)} h\n`;
  });

  const embed=new EmbedBuilder()
   .setTitle("🏆 Ranking BattleMetrics")
   .setDescription(text || "Sin datos disponibles")
   .setColor("Gold")
   .setTimestamp()
   .setFooter({
        text: "RustLogix"
   });

  await interaction.editReply({embeds:[embed]});
 }
};