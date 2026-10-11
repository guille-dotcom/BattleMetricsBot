const mongoose = require("mongoose");

const birthdaySchema = new mongoose.Schema(
    {
        guildId: {
            type: String,
            required: true,
            index: true
        },

        nombre: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },

        dia: {
            type: Number,
            required: true,
            min: 1,
            max: 31
        },

        mes: {
            type: Number,
            required: true,
            min: 1,
            max: 12
        },

        anio: {
            type: Number,
            default: null
        },

        // Año en el que ya se envió la felicitación.
        // Evita mensajes duplicados si Render reinicia.
        ultimoAnioFelicitado: {
            type: Number,
            default: null
        }
    },
    {
        timestamps: true
    }
);

// Una persona solo puede tener un cumpleaños
// registrado por servidor.
birthdaySchema.index(
    {
        guildId: 1,
        nombre: 1
    },
    {
        unique: true
    }
);

module.exports =
    mongoose.model(
        "Birthday",
        birthdaySchema
    );