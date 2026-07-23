const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");


const {
    getBattleMetricsHours
} = require("../services/battlemetricsHours");



module.exports = {


data: new SlashCommandBuilder()

.setName("horasbm")

.setDescription(
    "Muestra las horas usando un perfil de BattleMetrics"
)

.addStringOption(option =>
    option
    .setName("link")
    .setDescription(
        "Link del perfil BattleMetrics"
    )
    .setRequired(true)
),



async execute(interaction){


try {

    await interaction.deferReply();

} catch(error){

    console.log(
        "ERROR DEFER:",
        error.message
    );

    return;

}



const link =
interaction.options.getString("link");



const match =
link.match(
    /players\/(\d+)/
);



if(!match){

    return interaction.editReply(
        "❌ Link inválido.\nEjemplo:\nhttps://www.battlemetrics.com/players/1010507609"
    );

}



const battlemetricsId =
match[1];



console.log(
    "BATTLEMETRICS ID:",
    battlemetricsId
);



await interaction.editReply(
    "⏱️ Calculando horas..."
);



let data;


try {


    data =
    await getBattleMetricsHours(
        battlemetricsId
    );


}catch(error){


    console.log(
        "ERROR HORAS BM:",
        error
    );


    return interaction.editReply(
        "❌ Error obteniendo datos de BattleMetrics"
    );


}



const totalHoras =
Number(
    data.totalHoras || 0
);



let servidoresEncontrados = 0;


try {

    servidoresEncontrados =
    data.servidores
    .rust
    .datos
    .servidoresEncontrados;


}catch(error){

    servidoresEncontrados = 0;

}



const embed =
new EmbedBuilder()

.setTitle(
    "🎮 Perfil BattleMetrics Rust"
)

.setColor(
    "#57F287"
)

.setDescription(
`🆔 Perfil BattleMetrics\n\`${battlemetricsId}\``
)

.addFields(

{
    name:"🖥️ Servidores jugados",
    value:`\`${servidoresEncontrados}\``,
    inline:true
},

{
    name:"⏱️ Horas totales",
    value:`**${totalHoras.toFixed(2)} horas**`,
    inline:true
}

)

.setFooter({

text:
"BattleMetrics Rust Bot"

})

.setTimestamp();



await interaction.editReply({

    content:"",
    embeds:[
        embed
    ]

});


}


};