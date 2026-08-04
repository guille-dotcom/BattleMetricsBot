const { google } = require("googleapis");
const ServerConfig = require("../models/ServerConfig");

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

        // Autenticación mediante la variable de entorno GOOGLE_CREDENTIALS
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
        });

        const sheets = google.sheets({ version: "v4", auth });

        const bmUrlStr = battlemetricsUrl ? String(battlemetricsUrl) : "";
        const bmLink = bmUrlStr.startsWith("http") 
            ? bmUrlStr 
            : `https://www.battlemetrics.com/players/${bmUrlStr}`;
            
        const steamLink = `https://steamcommunity.com/profiles/${steamId64 || ""}`;

        const values = [
            [bmLink, motivo || "", streamMode || "", steamLink]
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: "Hoja 1!A:D",
            valueInputOption: "USER_ENTERED",
            resource: { values },
        });

        return true;
    } catch (error) {
        console.error("Error al guardar en Google Sheets:", error);
        return false;
    }
}

module.exports = { agregarFilaAPlanilla };