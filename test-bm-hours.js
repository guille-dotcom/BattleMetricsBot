require("dotenv").config();

const axios = require("axios");


const id = "1148804897";


async function test(){

    const url =
        `https://api.battlemetrics.com/players/${id}`;


    const res =
        await axios.get(url);


    console.log(
        JSON.stringify(
            res.data,
            null,
            2
        )
    );

}


test();