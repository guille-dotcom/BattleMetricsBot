require("dotenv").config();

const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const commands = [];
const commandsPath = path.join(__dirname, "commands");

const commandFiles = fs.readdirSync(commandsPath)
    .filter(file => file.endsWith(".js"));

for (const file of commandFiles) {
    try {
        const command = require(path.join(commandsPath, file));

        console.log(
            "✅ Comando encontrado:",
            command.data.name
        );

        commands.push(
            command.data.toJSON()
        );

    } catch(error) {
        console.log(
            "❌ Error cargando:",
            file
        );
        console.log(error);
    }
}

const rest = new REST({
    version: "10"
}).setToken(
    process.env.TOKEN
);

(async () => {
    try {
        console.log(
            "🔄 Actualizando comandos globales de Discord..."
        );

        await rest.put(
            Routes.applicationCommands(
                "1528900517781045298"
            ),
            {
                body: commands
            }
        );

        console.log(
            "✅ Comandos globales actualizados correctamente"
        );
        console.log(
            `📌 Total comandos registrados: ${commands.length}`
        );

    } catch(error) {
        console.log(
            "❌ Error registrando comandos:"
        );
        console.error(error);
    }
})();