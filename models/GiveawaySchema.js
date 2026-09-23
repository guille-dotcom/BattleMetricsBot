const mongoose = require("mongoose");

const giveawaySchema = new mongoose.Schema({

    guildId: {
        type: String,
        required: true
    },

    channelId: {
        type: String,
        required: true
    },

    messageId: {
        type: String,
        required: true,
        unique: true
    },

    creadorId: {
        type: String,
        required: true
    },

    premio: {
        type: String,
        required: true
    },

    ganadorCantidad: {
        type: Number,
        required: true,
        default: 1
    },

    participantes: {
        type: [String],
        default: []
    },

    ganadores: {
        type: [String],
        default: []
    },

    fechaInicio: {
        type: Date,
        default: Date.now
    },

    fechaFinal: {
        type: Date,
        required: true
    },

    activo: {
        type: Boolean,
        default: true
    },

    finalizado: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

module.exports = mongoose.model(
    "Giveaway",
    giveawaySchema
);