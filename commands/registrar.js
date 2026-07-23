const {
    SlashCommandBuilder,
    MessageFlags
} = require("discord.js");

const fs = require("fs");
const path = require("path");


const file = path.join(
    __dirname,
    "..",
    "data",
    "users.json"
);


module.exports = {


data: new SlashCommandBuilder()

.setName("registrar")

.setDescription(
"Registra tu SteamID"
)


.addStringOption(option =>
    option
    .setName("steamid")
    .setDescription("SteamID64")
    .setRequired(true)
),



async execute(interaction){


try {


await interaction.deferReply({
    flags: MessageFlags.Ephemeral
});



const steamId =
interaction.options.getString(
"steamid"
);



let users = {};



if(fs.existsSync(file)){


users =
JSON.parse(
fs.readFileSync(
file,
"utf8"
)
);


}



users[interaction.user.id] = {


steamId,


discordId:
interaction.user.id,


username:
interaction.user.username,


registrado:
new Date().toISOString()


};



fs.writeFileSync(
file,
JSON.stringify(
users,
null,
2
)
);



await interaction.editReply({

content:
`✅ Registrado correctamente\n\n🎮 SteamID: \`${steamId}\``

});



}catch(error){


console.log(
"ERROR REGISTRAR:",
error
);



await interaction.editReply(
"❌ Error guardando registro"
);



}



}


};