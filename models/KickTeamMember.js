const mongoose = require("mongoose");

const KickTeamMemberSchema = new mongoose.Schema(
    {
        guildId: {
            type: String,
            required: true,
            index: true
        },

        nombre: {
            type: String,
            required: true,
            trim: true
        },

        creadoPor: {
            type: String,
            required: true
        }
    },
    {
        timestamps: true
    }
);

KickTeamMemberSchema.index(
    {
        guildId: 1,
        nombre: 1
    },
    {
        unique: true
    }
);

module.exports = mongoose.model(
    "KickTeamMember",
    KickTeamMemberSchema
);