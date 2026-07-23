const {
    SlashCommandBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");

const file = path.join(
    __dirname,
    "..",
    "data",
    "config.json"
);

module.exports = {

    data: new SlashCommandBuilder()

        .setName("configurar-servidor")

        .setDescription("Configura el servidor BattleMetrics")

        .addStringOption(option =>
            option
                .setName("link")
                .setDescription("Link del servidor BattleMetrics")
                .setRequired(true)
        ),

    async execute(interaction) {

        const link =
            interaction.options.getString("link");

        const match =
            link.match(/servers\/rust\/(\d+)/);

        if (!match) {

            return interaction.reply({

                content:
                    "❌ Link de BattleMetrics inválido",

                flags: 64

            });

        }

        const servidorId = match[1];

        let config = {};

        try {

            if (fs.existsSync(file)) {

                config = JSON.parse(
                    fs.readFileSync(
                        file,
                        "utf8"
                    )
                );

            }

        } catch (error) {

            console.log(
                "ERROR LEYENDO CONFIG:",
                error.message
            );

        }

        // Crear configuración para este servidor de Discord
        if (!config[interaction.guild.id]) {

            config[interaction.guild.id] = {};

        }

        config[interaction.guild.id].battlemetricsServer = servidorId;

        try {

            fs.writeFileSync(
                file,
                JSON.stringify(
                    config,
                    null,
                    2
                )
            );

        } catch (error) {

            console.log(
                "ERROR GUARDANDO CONFIG:",
                error.message
            );

            return interaction.reply({

                content:
                    "❌ Error guardando configuración",

                flags: 64

            });

        }

        await interaction.reply({

            content:
                `✅ Servidor BattleMetrics configurado correctamente.

🌐 BattleMetrics ID: ${servidorId}
🖥️ Servidor Discord: ${interaction.guild.name}`,

            flags: 64

        });

    }

};