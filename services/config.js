const fs = require("fs");
const path = require("path");


const file = path.join(
    __dirname,
    "..",
    "data",
    "config.json"
);



function getServerId(){

    if(!fs.existsSync(file)){
        return null;
    }


    const config =
    JSON.parse(
        fs.readFileSync(
            file,
            "utf8"
        )
    );


    return config.serverId;

}


module.exports = {
    getServerId
};