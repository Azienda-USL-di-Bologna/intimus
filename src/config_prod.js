var config = {}
// development, test, prod
config.ENV="prod";

config.CLIENT_HASH_NAME="IntimusClients";
config.CLIENT_COMMANDS_QUEUE="IntimusClientCommands";
config.REGISTRATION_QUEUE="IntimusRegistrationQueue";
config.SPARKS_SET="IntimusSparksSet";
config.CLIENT_PRESENCE_SUBSCRIBERS="IntimusClientPresenceSubscribers";
config.PORT=2339;

config.REDIS_HOST="babelavecredisprod01-auslbo.avec.emr.it"

// config.SSL={};
// config.SSL.root='certs';
// config.SSL.cert='star.internal.ausl.bologna.it.crt';
// config.SSL.key='star.internal.ausl.bologna.it.key';
// config.SSL.ca=['star.internal.ausl.bologna.it.cabundle.1','star.internal.ausl.bologna.it.cabundle.2'];

module.exports = config;
