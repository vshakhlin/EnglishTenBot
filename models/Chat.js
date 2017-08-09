// load the things we need
var mongoose = require('mongoose');
require('mongoose-double')(mongoose);

var SchemaTypes = mongoose.Schema.Types;

// define the schema for our user model
var chatSchema = mongoose.Schema({
    chatId: Number,
    wordPosition: Number,
    timezoneOffset: Number,
	laptitude: {
        type: SchemaTypes.Double
    },
	longitude: {
        type: SchemaTypes.Double
    },
    isActive: Boolean
});

// create the model for chat and expose it to our app
module.exports = mongoose.model('Chat', chatSchema);