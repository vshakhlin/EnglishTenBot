var host = 'localhost';
var port = 27017;
var nameDB = 'englishtenbot';
var user = 'admin';
var password = 'password';

// config/database.js
module.exports = {
    'url' : 'mongodb://' + host + ':' + port + '/' + nameDB
};