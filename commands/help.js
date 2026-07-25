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


        const configuracion =
        new EmbedBuilder()

        .setTitle(
            "⚙️ CONFIGURACIÓN INICIAL"
        )

        .setDescription(
`⚙️ **/configurar-servidor**

Configura el servidor de Rust que utilizará BattleMetricsBot.

⚠️ Ejecuta este comando primero para habilitar los comandos del servidor.`
        )

        .setColor(0x3498DB);



        const servidor =
        new EmbedBuilder()

        .setTitle(
            "🖥️ COMANDOS DEL SERVIDOR"
        )

        .setDescription(
`⚠️ Estos comandos requieren:

⚙️ **/configurar-servidor**


⏱️ **/horas**

Muestra las horas de jugadores del servidor configurado.


🏆 **/ranking**

Muestra el ranking de jugadores del servidor configurado.`
        )

        .setColor(0xFEE75C);



        const tracker =
        new EmbedBuilder()

        .setTitle(
            "🎯 SISTEMA TRACKER"
        )

        .setDescription(
`🎮 **/tracker**

Crea seguimiento de un jugador BattleMetrics durante 24 horas.


📋 **/trackers-activos**

Muestra los jugadores actualmente bajo vigilancia.


🗑️ **/limpiar-trackers**

Elimina trackers individuales.`
        )

        .setColor(0x57F287);



        const battlemetrics =
        new EmbedBuilder()

        .setTitle(
            "🔎 CONSULTAS BATTLEMETRICS"
        )

        .setDescription(
`🔎 **/horasbm**

Consulta estadísticas directamente desde BattleMetrics.`
        )

        .setColor(0x9B59B6);



        const informacion =
        new EmbedBuilder()

        .setTitle(
            "📡 INFORMACIÓN"
        )

        .setDescription(
`📡 **/ping**

Muestra el estado actual del bot.`
        )

        .setColor(0x95A5A6)

        .setFooter({
            text:"BattleMetricsBot"
        })

        .setTimestamp();



        await interaction.reply({

            embeds:[

                configuracion,
                servidor,
                tracker,
                battlemetrics,
                informacion

            ]

        });


    }

};