'use strict';
//RPUSH ClientCommands '{"dest":"*","command":{"command":"registerClient","params":{"foo":"bar"}}}'
var config = require(__dirname + '/config.js');
var CLIENT_HASH_NAME = config.CLIENT_HASH_NAME;
var CLIENT_COMMANDS_QUEUE = config.CLIENT_COMMANDS_QUEUE;
var REGISTRATION_QUEUE = config.REGISTRATION_QUEUE;
var SPARKS_SET = config.SPARKS_SET;
var CLIENT_PRESENCE_SUBSCRIBERS = config.CLIENT_PRESENCE_SUBSCRIBERS;
var Primus = require('primus')
var http = require('https');
var fs = require('fs')

const winston = require('winston');
require('winston-daily-rotate-file');
const { combine, timestamp, label, printf } = winston.format;

var winstonTransports;
if (config.ENV === "development") {
    winstonTransports =
        new winston.transports.Console();
} else {
    winstonTransports =
        new (winston.transports.DailyRotateFile)({
            filename: __dirname + '/../logs/intimus.log',
            level: 'info',
            datePattern: 'YYYY-MM-DD',
            zippedArchive: true,
            maxFiles: 7
        });
}

/* I file .gz non vengono cancellati dal rotatore, lo faccio a mano */
winstonTransports.on('logRemoved', function(removedFilename) {
    fs.unlink(removedFilename + '.gz', (err) => {
        if (err) log.error(err);
        log.info(removedFilename + '.gz was deleted');
      });
});

const myFormat = printf(({ level, message, label, timestamp }) => {
  return `${timestamp} [${label}] ${level}: ${message}`;
});

const log = winston.createLogger({
    // Change the level on the next line from 'debug' to 'silly' to enable messages logged
    // with the silly logging threshold to be logged to the output.
    level: 'silly',
    format: combine(
        label({ label: 'intimus' }),
        timestamp(),
        myFormat
    ),
    // You can also comment out the line above and uncomment the line below for JSON format
    // format: format.json(),
    transports: [winstonTransports]
    //   transports: [new transports.Console()]
});

//var log=require('winston');
//log.add(log.transports.File, {level:"debug",timestamp:"true",filename:__dirname+'/logs/primus_server.log',maxsize:'5000000'});

var primus = Primus.createServer({
    port: config.PORT,
    transformer: 'engine.io',
    pathname: 'intimus'
});

log.info("intimus_server started");


// UTILE PER PROVARE LA ROTAZIONE DEL LOG =====
/* dataLog(0)
function dataLog(secondsPassed){
    setTimeout(function(){
        let dateNow = new Date();
        log.info(`seconds passed ${secondsPassed} and Time is ${dateNow}`);
        console.log(`${secondsPassed}`);
        if(dataLog != 130){ //when reaches 130 seconds stops logging
              dataLog(++secondsPassed);
        }
    },1000);
} */
// =============================================

/*
var Redis = require("redis"),
   redis = Redis.createClient(6379,'localhost',{retry_max_delay:2000});
var redisq=Redis.createClient(6379,'localhost',{retry_max_delay:2000});
var redisr=Redis.createClient(6379,'localhost',{retry_max_delay:2000});
*/
var Redis = require("redis"),
    redis = Redis.createClient(6379, config.REDIS_HOST, {
        retry_strategy: function (options) {
            return 5000;
        }
    });
var redisq = Redis.createClient(6379, config.REDIS_HOST, {
    retry_strategy: function (options) {
        return 5000;
    }
});
var redisr = Redis.createClient(6379, config.REDIS_HOST, {
    retry_strategy: function (options) {
        return 5000;
    }
});

redis.on("connect", function (event) {redis.select("1",function (event) { redis.del(SPARKS_SET, CLIENT_HASH_NAME, CLIENT_PRESENCE_SUBSCRIBERS) })});
redisq.on("connect", function (event) {
    redisq.select("1", function (event) {
        redisq.del(CLIENT_COMMANDS_QUEUE, function (err, reply) {
            readClientCommands();
        });
    });
});
redisr.on("connect", function (event) {
    redisr.select("1", function (event) {
        redisr.del(REGISTRATION_QUEUE, function (err, reply) {
            handleRegistrationQueue();
        });
    });
});

// Variabile di sincronizzazione per modifica concorrente degli userdata
var user_lock = {};

function init() {

    redis.on("error", function (err) {
        log.error("Redis error handler: " + err, err.stack);
    });

    redisq.on("error", function (err) {
        log.error("Redisq error handler: " + err, err.stack);
    });

    redisr.on("error", function (err) {
        log.error("Redisr error handler: " + err, err.stack);
    });

    primus.on('connection', function (spark) {
        log.info('connection was made from: ' + spark.address);
        log.debug('connection id' + spark.id);

        spark.on('data', function (data) {
            log.debug('received data from the client' + data);
            if (data.command === 'registerClient' && data.params.user) {
                log.debug("Going to register client : " + spark.id);
                data.params.sparkId = spark.id;
                redis.rpush(REGISTRATION_QUEUE, JSON.stringify({
                    action: 'register', data: data.params
                }));
            }
            else if (data.command === "subscribeClientPresence") {
                log.debug("Client " + spark.id + " subscribed for ClientPresence")
                redis.hset(CLIENT_PRESENCE_SUBSCRIBERS, spark.id, spark.id);
            }
            else if (data.command === "unsubscribeClientPresence") {
                log.debug("Client " + spark.id + " UNsubscribed for ClientPresence")
                redis.hdel(CLIENT_PRESENCE_SUBSCRIBERS, spark.id);
            } else {
                log.warn("command : " + JSON.stringfy(data.command));
            }
        });

        //spark.write({message:'pippo'});
    });

    primus.on('disconnection', function (spark) {
        redis.rpush(REGISTRATION_QUEUE, JSON.stringify({ action: 'unregister', data: spark.id }));
        //unregisterClient(spark);
    });
    //redis.del(SPARKS_SET, CLIENT_HASH_NAME, function (err, reply) {
    //    log.info("nella callback di SPARKS_SET e CLIENT_HASH_NAME");
    //});
    //redis.del(CLIENT_HASH_NAME, function (err, reply) {
    //    log.info("nella callback di CLIENT_HASH_NAME");
    //});
    //redis.del(CLIENT_PRESENCE_SUBSCRIBERS);
    //redisq.del(CLIENT_COMMANDS_QUEUE, function (err, reply) {
    //    readClientCommands();
    //});
    //redisr.del(REGISTRATION_QUEUE, function (err, reply) {
    //    handleRegistrationQueue();
    //});


    //CATCH DI TUTTE LE ECCEZIONI
    process.on('uncaughtException', function (err) {
        log.error('Caught exception: ' + err + " " + err.stack);
    });
}

function readClientCommands() {
    //log.info("in readClientCommands");
    redisq.blpop(CLIENT_COMMANDS_QUEUE, 0, function (err, reply) {
        log.info("readClientCommands: " + reply );
        if (reply != null) {
            //log.debug("reply" + reply[1]);
            let command;
            try {
                command = JSON.parse(reply[1]);
            }
            catch (e) {
                log.error("Errore parsando comando JSON");
                process.nextTick(readClientCommands);
                return;
            }

            if ((!command.dest || command.dest.length === 0 || command.dest === "*") ||
                (!command.dest[0].id_persona || command.dest[0].id_persona === "*")
                ) {
                redisq.hgetall(CLIENT_HASH_NAME, function (err, reply) {
                    if (err) {
                        log.error(err);
                        return;
                    }
                    log.info("command.dest: " + JSON.stringify(command.dest));
                    if (command.dest && command.dest[0]) {
                        log.info("command.dest.id_aziende: " + command.dest[0].id_aziende);
                    }
                    let aziende = [];
                    if (command.dest && command.dest[0] && command.dest[0].id_aziende) {
                        aziende = command.dest[0].id_aziende;
                    }
                    let apps = [];
                    if (command.dest && command.dest[0] && command.dest[0].apps) {
                        apps = command.dest[0].apps;
                    }
                    let allAziende = false;
                    if (command.dest && command.dest[0] && command.dest[0].all_aziende) {
                        allAziende = command.dest[0].all_aziende;
                    }
                    for (let user in reply) {
                        log.info("call writeClient for user: " + JSON.stringify(user));
                        writeClient(user, apps, aziende, allAziende, command.command);
                    }
                });
            } else {
                for (let user of command.dest) {
                    //user = JSON.parse(user);
                    //log.info("user for writeClient:", user);
                    log.info("call writeClient for data: " + user.id_persona + " " +  user.apps + " " +  user.id_aziende + " " +  JSON.stringify(command.command) );
                    writeClient(user.id_persona, user.apps, user.id_aziende, true, command.command);
                }
            }
            // dopo la gestione del comando rischeduliamo fa funzione
            process.nextTick(readClientCommands);
        }
        if (err != null) {
            redisq.del(CLIENT_COMMANDS_QUEUE);
            redisq.once('connect', readClientCommands);
        }
    });
}

// scrive un comandi ad un utente sulle app e sulle aziende passate
function writeClient(user, apps, aziende, allAziende, command) {
    log.info("Writing to: " + user + " aziende: " + aziende + " apps: " + apps + " message: " + JSON.stringify(command));
    //  log.info("aziende: " + !aziende? "then": "else" );
    log.info("CLIENT_HASH_NAME: " + CLIENT_HASH_NAME);

    // TODO: manca parte in cui vuoi inviare il messggio a tutti gli utenti di uan o più aziende

    redis.hget(CLIENT_HASH_NAME, user, function (err, reply) {
        log.info("Writing to " + user + " in callback");
        if (err) {
            log.error(err);
            return;
        }
        if (reply == null) {
            log.warn("WriteClient client " + user + " not found!");
            return;
        }
        let sparks = JSON.parse(reply);
        log.info("Spark found for user: " + user + ": " + JSON.stringify(sparks));
        for (let i = 0; i < sparks.length; i++) {
            let spark = primus.spark(sparks[i].sparkId);
            if (spark) {
                log.info("spark: " + spark);
                if (!aziende || aziende.length === 0 || aziende === "*") {
                    log.info("all aziende");
                    if (!apps || apps.length === 0 || apps === "*") {
                        log.info("write command for all aziende and all apps");
                        spark.write(command);
                    } else {
                        log.info("all aziende and not all apps");
                        if (apps.find(app => app === sparks[i].application)) {
                            log.info("write command for all aziende and app: " + sparks[i].application);
                            spark.write(command);
                        }
                    }
                } else {
                    log.info("not all aziende");
                    let sendCommand = false;
                    if (!!allAziende && sparks[i].id_aziende) {
                        log.info("all aziende is true");
                        sendCommand = aziende.filter(x => sparks[i].id_aziende.includes(x)).length > 0;
                        log.info("filter " + JSON.stringify(aziende.filter(x => sparks[i].id_aziende.includes(x))));
                    } else {
                        sendCommand = !!aziende.find(azienda => azienda === sparks[i].id_azienda);
                    }
                    log.info("sendcommand is " + sendCommand);
                    if (sendCommand) {
                        log.info("azienda " + sparks[i].id_azienda + " found");
                        if (!apps || apps.length === 0 || apps === "*") {
                            log.info("write command for azienda " + sparks[i].id_azienda + " and all apps");
                            spark.write(command);
                        } else {
                            log.info("not all aziende and not all apps");
                            if (apps.find(app => app === sparks[i].application)) {
                                log.info("write command for azienda " + sparks[i].id_azienda + " and app: " + sparks[i].application);
                                spark.write(command);
                            }
                        }
                    }
                }
            }
        }
    });
}

function handleRegistrationQueue() {
    redisr.blpop(REGISTRATION_QUEUE, 0, function (err, reply) {
        if (err != null) {
            log.error("Error: " + err);
        }
        if (reply != null) {
            log.debug("handleRegistrationQueue reply: " + reply[1]);
            let command = JSON.parse(reply[1]);
            if (command.action === "register") {
                //REGISTER
                registerClient(command.data)
            } else if (command.action === "unregister") {
                //UNREGISTER
                unregisterClient(command.data)
            } else {
                //ERRORE
                log.error("UNSUPPORTED operation " + command.action + " in handleRegistrationQueue !");
            }
        }
        if (err != null) {
            redisr.del(REGISTRATION_QUEUE);
            redisr.once('connect', handleRegistrationQueue);
        } else {
            process.nextTick(handleRegistrationQueue);
        }
    });
}

function registerClient(data) {
    if (user_lock[data.user]) {
        //c'e' gia' qualcuno ci rischeduliamo
        setImmediate(function () { registerClient(data); });
        return;
    }
    user_lock[data.user] = true;
    redis.hget(CLIENT_HASH_NAME, data.user, function (err, reply) {
        if (reply == null) {
            let sparks = [];
            //data.sparkId=spark.id;
            sparks.push(data);
            redis.hset(CLIENT_HASH_NAME, data.user, JSON.stringify(sparks), function (err, reply) {
                delete user_lock[data.user]; notifyClientPresenceSubscribers();
            });
            redis.hset(SPARKS_SET, data.sparkId, data.user);
            log.info("Client " + data.user + " " + data.sparkId + " registered");
        } else {
            redis.hget(SPARKS_SET, data.sparkId, function (err, setreply) {
                if (setreply) {
                    delete user_lock[data.user];
                    log.info("Client " + data.user + " " + data.sparkId + " already registered");
                } else {
                    let sparks = JSON.parse(reply);
                    //data.sparkId=spark.id;
                    sparks.push(data);
                    redis.hset(CLIENT_HASH_NAME, data.user, JSON.stringify(sparks), function (err, reply) {
                        delete user_lock[data.user];
                        notifyClientPresenceSubscribers();
                    });
                    redis.hset(SPARKS_SET, data.sparkId, data.user);
                    log.info("Client " + data.user + " " + data.sparkId + " registered");
                }
            });
        }
    });
}

function unregisterClient(sparkId) {
    redis.hdel(CLIENT_PRESENCE_SUBSCRIBERS, sparkId);
    redis.hget(SPARKS_SET, sparkId, function (err, user) {
        if (user == null) {
            log.warn("Client " + sparkId + " was not registered");
        }
        else {
            if (user_lock[user]) {
                //c'e' gia' qualcuno ci rischeduliamo
                setImmediate(function () { unregisterClient(sparkId); });
                return;
            }
            user_lock[user] = true;
            redis.hdel(SPARKS_SET, sparkId);
            redis.hget(CLIENT_HASH_NAME, user, function (err, userdata) {
                if (userdata) {
                    let sparks = JSON.parse(userdata);
                    let newsparks = null;
                    for (let i = 0; i < sparks.length; i++) {
                        if (sparks[i].sparkId == sparkId) {
                            newsparks = sparks.splice(i, 1);
                            break;
                        }
                    }
                    if (newsparks) {
                        if (sparks.length !== 0) {
                            //aggiorno gli sparks
                            redis.hset(CLIENT_HASH_NAME, user, JSON.stringify(sparks), function (err, reply) { delete user_lock[user]; notifyClientPresenceSubscribers(); });
                        }
                        else {
                            //rimuovo l'utente che non ha piu' connessioni
                            redis.hdel(CLIENT_HASH_NAME, user, function (err, reply) { delete user_lock[user]; notifyClientPresenceSubscribers(); });
                        }
                        log.info("Client " + user + " " + sparkId + " unregistered");
                    }
                    else {
                        delete user_lock[user];
                        log.warn("Strange spark " + sparkId + " not found for user " + user);
                    }
                }
                else {
                    delete user_lock[user];
                    log.warn("Strange couldn't find userdata for :" + user + " " + sparkId);
                }
            });
        }
    });

}

function notifyClientPresenceSubscribers() {
    redis.hkeys(CLIENT_PRESENCE_SUBSCRIBERS, function (err, reply) {
        if (err) { log.error("Error reading CLIENT_PRESENCE_SUBSCRIBERS"); return; }
        for (let r in reply) {
            let spark = primus.spark(reply[r]);
            if (spark) {
                spark.write({ command: "refreshClientPresence" });
            }
        }

    });
}

init();
