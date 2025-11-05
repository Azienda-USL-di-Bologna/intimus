var config = {}
// development, test, prod
config.ENV="development";

config.CLIENT_HASH_NAME="IntimusClients";
config.CLIENT_COMMANDS_QUEUE="IntimusClientCommands";
config.REGISTRATION_QUEUE="IntimusRegistrationQueue";
config.SPARKS_SET="IntimusSparksSet";
config.CLIENT_PRESENCE_SUBSCRIBERS="IntimusClientPresenceSubscribers";
config.PORT=2339;

config.REDIS_HOST="gdml";
config.REDIS_PORT=6379;
config.REDIS_DB=1;
//config.REDIS_AUTH_PASS="Chiexijae|Cha1Va"
config.REDIS_AUTH_PASS=null

// config.SSL={};
// config.SSL.root='certs';
// config.SSL.cert='star.internal.ausl.bologna.it.crt';
// config.SSL.key='star.internal.ausl.bologna.it.key';
// config.SSL.ca=['star.internal.ausl.bologna.it.cabundle.1','star.internal.ausl.bologna.it.cabundle.2'];

module.exports = config;
