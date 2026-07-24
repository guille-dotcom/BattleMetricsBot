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



module.exports = {


data: new SlashCommandBuilder()

.setName("tracker")

.setDescription(
    "Comienza el seguimiento de un jugador BattleMetrics durante 24 horas"
)

.addStringOption(option =>

    option
    .setName("id")
    .setDescription("Enlace o ID del jugador BattleMetrics")
    .setRequired(true)

),



async execute(interaction){


await interaction.deferReply();



const inputId =
interaction.options.getString("id");




// ======================
// ID JUGADOR
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
inputId.replace(/\D/g,"");



if(!playerId){

    return interaction.editReply(
        "❌ ID BattleMetrics inválida."
    );

}




const serverId =
"433255";





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

trackers=[];





const guildId =
String(interaction.guild.id);




const activosServidor =
trackers.filter(

t =>
String(t.guildId) === guildId

);




if(activosServidor.length >= 20){

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
// VARIABLES
// ======================


let nombreJugador =
"Jugador desconocido";


let nombreServidor =
"Servidor Rust";


let estado =
"OFFLINE";


let tiempoSesion =
"0:00";






const headers = {

Authorization:

`Bearer ${process.env.BATTLEMETRICS_TOKEN}`,

Accept:

"application/json"

};







try{



// ======================
// JUGADOR
// ======================


const playerResponse =
await axios.get(

`https://api.battlemetrics.com/players/${playerId}`,

{
headers
}

);



if(
playerResponse.data?.data?.attributes?.name
){

nombreJugador =

playerResponse.data.data.attributes.name;

}





// ======================
// SERVIDOR
// ======================


const serverResponse =
await axios.get(

`https://api.battlemetrics.com/servers/${serverId}`,

{
headers
}

);



if(
serverResponse.data?.data?.attributes?.name
){

nombreServidor =

serverResponse.data.data.attributes.name;

}







// ======================
// SESIONES DEL JUGADOR
// ======================


const sessionResponse =
await axios.get(

`https://api.battlemetrics.com/players/${playerId}/relationships/sessions`,

{
headers
}

);



const sesiones =
sessionResponse.data.data || [];





const sesionActiva =
sesiones.find(

s =>

s.attributes?.stop === null

);






if(
sesionActiva &&
sesionActiva.attributes?.start
){


estado =
"ONLINE";



const inicio =
new Date(
sesionActiva.attributes.start
);



const ahora =
new Date();



const diferencia =
ahora - inicio;



const horas =
Math.floor(
diferencia / 3600000
);



const minutos =
Math.floor(
(diferencia % 3600000)
/
60000
);



tiempoSesion =

`${horas}:${minutos.toString().padStart(2,"0")}`;


}




}catch(error){


console.log(

"❌ ERROR BATTLEMETRICS:",

error.response?.data ||

error.message

);


}








// ======================
// GUARDAR
// ======================


const ahora =
Date.now();



const expira =

ahora +

86400000;





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





fs.writeFileSync(

file,

JSON.stringify(
trackers,
null,
2
)

);







// ======================
// EMBED
// ======================


const embed =

new EmbedBuilder()

.setTitle(
"🎮 Tracker BattleMetrics"
)


.setColor(

estado === "ONLINE"

?

"#57F287"

:

"#ED4245"

)


.setDescription(

`👤 **${nombreJugador}**`

)



.addFields(

{

name:"Estado",

value:

estado === "ONLINE"

?

"🟢 ONLINE"

:

"🔴 OFFLINE"

},


{

name:"⏱️ Play Time (Sesión)",

value:

tiempoSesion

},


{

name:"📡 Servidor",

value:

`||${nombreServidor}||`

},


{

name:"⌛ Tracker restante",

value:

"24h 00m"

}

)



.setTimestamp();







await interaction.editReply({

content:

`✅ **Tracker creado correctamente**\n\n`+

`👤 Jugador: **${nombreJugador}**\n`+

`🆔 BattleMetrics ID: \`${playerId}\`\n`+

`📡 Servidor ID: \`${serverId}\`\n`+

`⏳ Duración: 24 horas\n\n`+

`📋 Trackers activos: ${activosServidor.length + 1}/20`,

embeds:[embed]

});



}


};