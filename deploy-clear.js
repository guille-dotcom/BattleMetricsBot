require("dotenv").config();

const { REST, Routes } = require("discord.js");

const rest = new REST({ version: "10" })
.setToken(process.env.TOKEN);

(async () => {

    try {

        console.log("🗑️ Borrando comandos...");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID,
                process.env.GUILD_ID
            ),
            {
                body: []
            }
        );

        console.log("✅ Comandos borrados correctamente");

    } catch (error) {

        console.error(error);

    }

})();