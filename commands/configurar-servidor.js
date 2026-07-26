const fs = require("fs");
const path = require("path");

module.exports = {
    name: "configurar-servidor",
    description: "Configura el ID del servidor de BattleMetrics",
    async execute(message, args) {
        // 1. Validar que el usuario pase el ID del servidor
        const serverId = args[0];
        if (!serverId) {
            return message.reply("❌ Por favor, proporciona un ID de servidor válido. Ejemplo: `!configurar-servidor 433255`");
        }

        // 2. Ruta hacia tu carpeta data/config.json
        const configPath = path.join(__dirname, "../data/config.json");

        try {
            let config = {};

            // Si el archivo ya existe, lee lo que tiene para no borrar otras configuraciones
            if (fs.existsSync(configPath)) {
                config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
            }

            // Actualiza o inserta el serverId
            config.serverId = serverId;

            // Guarda los cambios en el archivo JSON formateado
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf-8");

            return message.reply(`✅ Servidor de BattleMetrics configurado correctamente con el ID: \`${serverId}\``);

        } catch (error) {
            console.error("Error al guardar la configuración:", error);
            return message.reply("❌ Ocurrió un error al intentar guardar la configuración del servidor.");
        }
    }
};
