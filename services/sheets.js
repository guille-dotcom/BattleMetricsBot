const path = require("path");
const { google } = require("googleapis");
const ServerConfig = require("../models/ServerConfig");

// Función para obtener el ID de la hoja de Google Sheets desde MongoDB
async function obtenerSheetIdDelServidor(guildId) {
    try {
        const config = await ServerConfig.findOne({ guildId });
        if (config && config.sheetId) {
            return config.sheetId;
        }
        return null;
    } catch (e) {
        console.error("Error al leer la config de MongoDB para Sheets:", e);
        return null;
    }
}

async function agregarFilaAPlanilla(guildId, battlemetricsUrl, motivo, streamMode, steamId64) {
    try {
        const spreadsheetId = await obtenerSheetIdDelServidor(guildId);
        if (!spreadsheetId) {
            throw new Error("Este servidor no tiene configurada una planilla de Google Sheets.");
        }

        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, "../credentials.json"),
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const sheets = google.sheets({ version: "v4", auth });

        const bmLink = battlemetricsUrl.startsWith("http") 
            ? battlemetricsUrl 
            : `https://www.battlemetrics.com/players/${battlemetricsUrl}`;
            
        const steamLink = `https://steamcommunity.com/profiles/${steamId64}`;

        const values = [
            [bmLink, motivo || "", streamMode || "", steamLink]
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: "Hoja 1!A:D", // Cambia "Hoja 1" si tu pestaña se llama diferente
            valueInputOption: "USER_ENTERED",
            resource: { values },
        });

        return true;
    } catch (error) {
        console.error("Error al guardar en Google Sheets:", error.message);
        return false;
    }
}

module.exports = { agregarFilaAPlanilla };