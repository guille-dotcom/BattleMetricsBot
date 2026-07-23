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
  const users = JSON.parse(fs.readFileSync(file));
  await interaction.deferReply();

  const ranking=[];

  for(const id of Object.keys(users)){
   const u=users[id];
   try{
    const h=await getBattleMetricsHours(u.battlemetricsId);
    ranking.push({discord:u.discord,hours:h.total});
   }catch{}
  }

  ranking.sort((a,b)=>b.hours-a.hours);

  let text="";
  ranking.slice(0,10).forEach((u,i)=>{
   text += `**${i+1}.** ${u.discord} — ${u.hours} h\n`;
  });

  const embed=new EmbedBuilder()
   .setTitle("🏆 Ranking BattleMetrics")
   .setDescription(text || "Sin datos")
   .setColor("Gold");

  interaction.editReply({embeds:[embed]});
 }
};
