const fs = require("fs-extra");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "data", "users.json");

async function loadUsers() {
    if (!(await fs.pathExists(DB_PATH))) {
        await fs.writeJson(DB_PATH, {}, { spaces: 2 });
    }

    return await fs.readJson(DB_PATH);
}

async function saveUsers(users) {
    await fs.writeJson(DB_PATH, users, {
        spaces: 2
    });
}

async function registerUser(discordId, battlemetricsId) {

    const users = await loadUsers();

    users[discordId] = {

        battlemetricsId,
        lastHours: 0,
        lastUpdate: 0

    };

    await saveUsers(users);

}

async function getUser(discordId) {

    const users = await loadUsers();

    return users[discordId] || null;

}

async function getAllUsers() {

    return await loadUsers();

}

module.exports = {

    registerUser,
    getUser,
    getAllUsers,
    loadUsers,
    saveUsers

};