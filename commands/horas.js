const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const {
    getSteamProfile
} = require("../services/steam");

const {
    searchBattleMetricsPlayer
} = require("../services/battlemetricsSearch");

const {
    getBattleMetricsHours
} = require("../services/battlemetricsHours");

const fs = require("fs");
const path = require("path");


const configFile = path.join(
    __dirname,
    "..",
    "data",
    "config.json"
);



module.exports = {

data: new SlashCommandBuilder()

.setName("horas")

.setDescription(
    "Muestra las horas usando Steam ID"
)

.addStringOption(option =>
    option
    .setName("steamid")
    .setDescription("Steam ID del jugador")
    .setRequired(true)
),



async execute(interaction){


await interaction.deferReply();



const steamId =
interaction.options.getString("steamid");



try {


    // Obtener perfil Steam

    const steam =
await getSteamProfile(steamId);

if(!steam){

    return interaction.editReply(
        "❌ No se encontró ese Steam ID"
    );

}

console.log(
    "HORAS STEAM:",
    steam.rustHours
);

    



    // Leer servidor configurado

    const config =
    JSON.parse(
        fs.readFileSync(
            configFile,
            "utf8"
        )
    );



    if(!config.battlemetricsServer){

        return interaction.editReply(
            "❌ No hay servidor configurado"
        );

    }



    // Buscar jugador en BM

    const player =
    await searchBattleMetricsPlayer(
        steam.name,
        config.battlemetricsServer
    );



if(player === "DUPLICADO"){

    return interaction.editReply(
`⚠️ **Nombre duplicado**

Hay más de un jugador con ese nombre dentro del servidor configurado.

Usa:
\`/horasbm\`

con el enlace del perfil exacto de BattleMetrics.`
    );

}


if (!player) {

    return interaction.editReply(
`❌ **Jugador no encontrado**

El jugador no está conectado actualmente al servidor configurado.`
    );

}



    // Sacar horas usando ID BM

    const data =
    await getBattleMetricsHours(
        player.id
    );



    const horas =
Number(
    data.totalHoras || 0
);

// Horas de Steam
const steamHoras =
    steam.rustHours !== null
        ? Number(steam.rustHours)
        : null;

// Diferencia entre Steam y BattleMetrics
const diferencia =
    steamHoras !== null
        ? (steamHoras - horas).toFixed(2)
        : "Privado";



    const embed =
    new EmbedBuilder()

    .setTitle(
        "🎮 Perfil Rust"
    )

    .setColor(
        "#57F287"
    )

    .setThumbnail(
        steam.avatar
    )

          .setDescription(
`👤 **${steam.name}**

🆔 **Steam ID:**
\`${steamId}\`

🔗 **BattleMetrics:**
https://www.battlemetrics.com/players/${player.id}`
)





    .addFields(

    {
        name:"⏱️ Horas BattleMetrics",
        value:`**${horas.toFixed(2)} horas**`,
        inline:true
    },

    {
        name:"🎮 Horas Steam",
        value:
            steamHoras !== null
                ? `**${steamHoras.toFixed(2)} horas**`
                : "**Privado**",
        inline:true
    },

    {
        name:"📉 Diferencia",
        value:
            steamHoras !== null
                ? `**${diferencia} horas**`
                : "**Privado**",
        inline:true
    },

    {
        name:"🖥️ Servidores",
        value:`\`${data.servidores.rust.datos.servidoresEncontrados || 0}\``,
        inline:true
    }

)

    .setTimestamp();



    await interaction.editReply({

        embeds:[
            embed
        ]

    });



}catch(error){


    console.log(
        "ERROR HORAS:",
        error
    );


    await interaction.editReply(
        "❌ Error calculando horas"
    );


}


}

};