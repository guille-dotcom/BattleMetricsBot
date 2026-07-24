require("dotenv").config();

const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const axios = require("axios");


const file =
path.join(
    __dirname,
    "..",
    "data",
    "trackers.json"
);



// ======================
// COMANDO
// ======================

module.exports = {


data: new SlashCommandBuilder()

.setName("tracker")

.setDescription(
    "Comienza el seguimiento de un jugador BattleMetrics durante 24 horas"
)

.addStringOption(option =>

    option

    .setName("id")

    .setDescription(
        "Enlace o ID del jugador BattleMetrics"
    )

    .setRequired(true)

),



async execute(interaction){


await interaction.deferReply();



const inputId =
interaction.options.getString("id");



// ======================
// EXTRAER ID BM
// ======================

const match =
inputId.match(
    /players\/(\d+)/
);


const playerId =
match
?
match[1]
:
inputId.replace(
    /\D/g,
    ""
);



if(!playerId){

    return interaction.editReply(
        "❌ ID BattleMetrics inválida."
    );

}



// ======================
// SERVIDOR
// ======================

const serverId =
"433255";



console.log(
    `📡 Tracker servidor ${serverId}`
);




// ======================
// LEER TRACKERS
// ======================

let trackers = [];


try{


if(fs.existsSync(file)){


trackers =
JSON.parse(
    fs.readFileSync(
        file,
        "utf8"
    )
);


}


}catch(error){


console.log(
    "ERROR LEYENDO TRACKERS:",
    error.message
);


}



if(!Array.isArray(trackers))

    trackers = [];





// ======================
// LIMITES
// ======================

const guildId =
String(
    interaction.guild.id
);



const activos =
trackers.filter(

t =>
String(t.guildId) === guildId

);



if(activos.length >= 20){


return interaction.editReply(

"❌ Límite de 20 trackers alcanzado."

);


}





const existe =
trackers.find(

t =>

String(t.guildId) === guildId &&

String(t.playerId) === playerId

);



if(existe){


return interaction.editReply(

"⚠️ Este jugador ya está siendo monitoreado."

);


}






// ======================
// CONSULTA BM
// ======================

let nombreJugador =
"Jugador desconocido";


let estado =
"OFFLINE";


let tiempoSesion =
"0:00";


let nombreServidor =
"Servidor Rust";



const token =
process.env.BATTLEMETRICS_TOKEN;


const headers = {


Authorization:

`Bearer ${token}`,

Accept:

"application/json"


};





try{



// jugador

const resPlayer =
await axios.get(

`https://api.battlemetrics.com/players/${playerId}`,

{
headers
}

);



if(
resPlayer.data?.data?.attributes?.name
){


nombreJugador =
resPlayer.data.data.attributes.name;


}





// servidor

const resServer =
await axios.get(

`https://api.battlemetrics.com/servers/${serverId}`,

{
headers
}

);



if(
resServer.data?.data?.attributes?.name
){


nombreServidor =
resServer.data.data.attributes.name;


}




console.log(

"Jugador encontrado:",

nombreJugador

);





}catch(error){


console.log(

"ERROR CONSULTA BM:",

error.response?.data ||
error.message

);


}







// ======================
// CREAR TRACKER
// ======================


const ahora =
Date.now();


const expira =
ahora +
(
24 *
60 *
60 *
1000
);



const nuevoTracker = {


guildId,


channelId:

String(
interaction.channel.id
),


serverId,


playerId,


playerName:

nombreJugador,


lastState:

estado,


createdAt:

ahora,


expiresAt:

expira


};





trackers.push(
nuevoTracker
);





try{


fs.writeFileSync(

file,

JSON.stringify(
trackers,
null,
2
)

);


}catch(error){


console.log(
"ERROR GUARDANDO:",
error.message
);


return interaction.editReply(

"❌ No se pudo guardar el tracker."

);


}






// ======================
// EMBED
// ======================


const embed =

new EmbedBuilder()


.setTitle(

"🎮 Tracker BattleMetrics"

)


.setColor(

"#ED4245"

)


.setDescription(

`👤 **${nombreJugador}**`

)


.addFields(


{

name:"Estado",

value:"🔴 OFFLINE"

},


{

name:"⏱️ Play Time (Sesión)",

value:tiempoSesion

},


{

name:"📡 Servidor",

value:`||${nombreServidor}||`

},


{

name:"⌛ Tracker restante",

value:"24h 00m"

}


)


.setTimestamp();






await interaction.editReply({


content:

`✅ **Tracker creado correctamente**\n\n` +

`👤 Jugador: **${nombreJugador}**\n` +

`🆔 BattleMetrics ID: \`${playerId}\`\n` +

`📡 Servidor ID: \`${serverId}\`\n` +

`⏳ Duración: 24 horas\n\n` +

`📋 Trackers activos: ${activos.length + 1}/20`,


embeds:[embed]


});



}


};