const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");


module.exports = {


    data: new SlashCommandBuilder()

        .setName("help")

        .setDescription(
            "Muestra la lista de comandos del BattleMetricsBot"
        ),



    async execute(interaction) {


        const embed =
        new EmbedBuilder()

        .setTitle(
            "🎯 BattleMetricsBot - Ayuda"
        )


        .setDescription(
`⚠️ **Antes de usar comandos de servidor ejecuta:**

⚙️ \`/configurar-servidor\`

Configura el servidor de Rust que usará el bot para consultas y estadísticas.`
        )


        .addFields(

            {
                name:"🎯 Sistema Tracker",

                value:
`🎮 **/tracker**
Crea un seguimiento de un jugador BattleMetrics durante 24 horas.

📋 **/trackers-activos**
Muestra los jugadores actualmente bajo vigilancia.

🗑️ **/limpiar-trackers**
Elimina trackers individuales.`
            },


            {
                name:"⏱️ Horas y estadísticas",

                value:
`⏱️ **/horas**
Muestra las horas de jugadores del servidor configurado.

🔎 **/horasbm**
Consulta horas directamente desde BattleMetrics.

🏆 **/ranking**
Muestra el ranking de jugadores del servidor configurado.`
            },


            {
                name:"⚙️ Configuración",

                value:
`⚙️ **/configurar-servidor**
Configura el servidor de Rust.

📝 **/registrar**
Registra jugadores en el sistema.`
            },


            {
                name:"📡 Información",

                value:
`📡 **/ping**
Muestra el estado del bot.`
            }

        )


        .setColor(
            0x5865F2
        )


        .setFooter({

            text:
            "BattleMetricsBot"

        })


        .setTimestamp();



        await interaction.reply({

            embeds:[
                embed
            ]

        });


    }


};