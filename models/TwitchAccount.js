const mongoose = require("mongoose");

const TwitchAccountSchema = new mongoose.Schema(
    {
        // Usuario de Discord que vinculó su cuenta
        discordUserId: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        // Datos públicos de Twitch
        twitchUserId: {
            type: String,
            required: true,
            index: true
        },

        twitchLogin: {
            type: String,
            required: true
        },

        twitchDisplayName: {
            type: String,
            default: ""
        },

        // OAuth de Twitch
        accessToken: {
            type: String,
            required: true
        },

        refreshToken: {
            type: String,
            required: true
        },

        // Momento en que expira el access token
        expiresAt: {
            type: Date,
            required: true
        },

        // Última vez que comprobamos los Drops
        ultimaRevisionDrops: {
            type: Date,
            default: null
        },

        // Último estado conocido de los Drops
        dropsEstado: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },

        // Control para evitar notificaciones repetidas
        notificacionesActivas: {
            type: Boolean,
            default: true
        },

        createdAt: {
            type: Date,
            default: Date.now
        },

        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        collection: "twitchAccounts"
    }
);

// Actualizar updatedAt automáticamente antes de guardar.
// No usamos next(): este middleware es síncrono.
TwitchAccountSchema.pre("save", function () {
    this.updatedAt = new Date();
});

module.exports =
    mongoose.models.TwitchAccount ||
    mongoose.model(
        "TwitchAccount",
        TwitchAccountSchema
    );