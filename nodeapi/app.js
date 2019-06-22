"use strict";
const wss = require('./config.json');
const util = require('./util.js');
const db = require('./lib/dbscripts.js');

//passwords
const bcrypt = require('bcrypt');
const saltRounds = 12;

//server
const express = require('express');
const app = express();
var server = require('http').Server(app);
const expressPort = 9210;

//cargo cult body-parser
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json());

//sql
const mysql = require('mysql2/promise');

//tcp stuff
const io = require('socket.io')(server);


const pool = mysql.createPool(
    {
        host: wss.env.HOSTNAME,
        user: wss.env.USERNAME,
        password: wss.env.PASSWORD,
        port: wss.env.PORT,
        database: wss.env.DATABASE,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    }
);

var sockets = {};

// Express API
app.post('/api/user/create', (req, res) => {
    var data = req.body;
    try {
        db.createUser(pool, data.email, data.password, data.fullname);
    }
    catch (err) {
        res.status(400);
        throw err;
    }
    res.status(201);
});

app.post('/api/user/login', async (req, res) => {
    var body = req.body;

    const ret = await db.checkUser(pool, body.email.toLowerCase(), body.password);

    if (ret.authenticated) {
        res.status(201).json(ret);
    } else {
        res.status(418).json(ret);
    }
});

app.post('/api/computers/create', async (req, res)=>{
    var ret = await db.createComputer(pool, req.body);
    if(!ret) res.status(400);
    res.status(201).json(ret);
})


app.post('/api/computers/get', async (req, res) => {
    var ret = await db.getComputerInfo(pool, req.body.email);
    if(!ret) res.status(400);
    res.status(201).json(ret);

});


app.post('/api/uses/get', async (req, res)=> {
    var options = req.body;
    const ret = await db.getUsages(pool, options.email, options.computer_name);
    if(!ret) res.status(400).send();
    res.status(201).json(ret);

});

app.post("/api/uses/update", async (req, res) => {
    
    var options = req.body;
    if(typeof options.usages == 'string')
        options.usages = JSON.parse(options.usages);
    console.log(options);
    const ret = await db.updateUsages(pool, options);
    if(!ret) res.status(400).send();
    res.status(201).send();
});

app.get("/test/uses/update", (req, res) => {
    const options = {
        "email": "liam@euclid.ca",
        "computer": "niviane",
        "usages": [
            {
                "usage": "sleep",
                "value": "1"
            },
            {
                "usage": "shutdown",
                "value": "1"
            }
        ]
    };

    db.updateUsages(pool, options);
});

app.post("/api/computers/connect", async (req,res) => {
    var options = req.body;
    const usages = await db.getUsages(pool, options.email, options.computer_name);
    res.send(usages);
});

app.post("/api/actions", async (req, res) => {
    var options = req.body;
    var key = util.makeKey(options.computer_name, options.email);
    if(sockets[key]){
        sockets[key].emit("action", {action:options.action});
    }
});

io.on('connection', function(sock){
    sock.on("computer_connect", function(msg){
        var data = JSON.parse(msg);
        var key = util.makeKey(data.computer_name , data.email_address);
        sockets[key] = sock;
    });
    sock.on("disconnect", function(){console.log( "User disconnected.");})
});

server.listen(expressPort, () => console.log(`Server starting on port ${expressPort}`));
