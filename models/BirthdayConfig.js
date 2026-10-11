const mongoose = require("mongoose");

const birthdayConfigSchema =
    new mongoose.Schema(
        {
            guildId: {
                type: String,
                required: true,
                unique: true,
                index: true
            },

            channelId: {
                type: String,
                required: true
            }
        },
        {
            timestamps: true
        }
    );

module.exports =
    mongoose.model(
        "BirthdayConfig",
        birthdayConfigSchema
    );