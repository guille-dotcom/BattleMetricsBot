const mongoose = require("mongoose");

const MiniGameProfileSchema = new mongoose.Schema(
    {
        guildId: {
            type: String,
            required: true
        },

        userId: {
            type: String,
            required: true
        },

        puntos: {
            type: Number,
            default: 0
        },

        victorias: {
            type: Number,
            default: 0
        },

        derrotas: {
            type: Number,
            default: 0
        },

        partidas: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

MiniGameProfileSchema.index(
    {
        guildId: 1,
        userId: 1
    },
    {
        unique: true
    }
);

module.exports =
    mongoose.models.MiniGameProfile ||
    mongoose.model(
        "MiniGameProfile",
        MiniGameProfileSchema
    );