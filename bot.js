'use strict'

var chats = [];
var chatsIndexed = [];
var fs = require('fs');
var schedule = require('node-schedule');
var TelegramBot = require('node-telegram-bot-api');
var mongoose = require('mongoose');
var request = require('request');

var Chat = require('./models/Chat');

var dictionary = require('./dictionary');

var words = dictionary.words;

var randomPosition = dictionary.randomPosition;

var configDB = require('./config/database.js');

var lastWord = 'zoo';
var filePath = __dirname + '/audio/ogg/' + lastWord + '.ogg';


mongoose.connect(configDB.url, function () {
    console.log("Connection DB success");
    Chat.find({}, function (err, chatModels) {
        if (!err) {
            chats = chatModels;
            for (var chatIndex in chats) {
                chatsIndexed.push(chats[chatIndex].chatId);
            }
        } else {
            throw err;
        }
    });
});

var scheluleJob = schedule.scheduleJob('3 * * * *', function () {
    var dateNow = new Date();
    console.log('Send words! Date now: ' + dateNow);
    for (var chatIndex in chats) {
        // Смещение времени на сервере на +3 часа
        var serverTimezoneOffset = 10800000;
        var chat = chats[chatIndex];

        // Только активным чатам
        if (chat.isActive) {
            // Текущее время на севрере со смещением
            var serverTimeNow = (new Date()).getTime() - serverTimezoneOffset;
            // Клиентское смещение по времени
            var clientTimezoneOffset = chat.timezoneOffset ? chat.timezoneOffset : 0;
            // Клиентское время
            var clientTimeNow = new Date(serverTimeNow + clientTimezoneOffset * 1000);

            if (clientTimeNow.getHours() > 10 && clientTimeNow.getHours() < 21) {
                var nextPositionWord = randomPosition[chat.wordPosition++];
                var nextWord = words[nextPositionWord];
                sendMessageByBot(chat.chatId, getTranslateWord(nextWord));
                chat.save(function (err, savedChat) {

                });
            }
        }
    }
});

var token = 'token_hidden_in_github';
var googleTimezoneAPIKey = 'API_KEY_hidden_in_github';

var bot = new TelegramBot(token, {polling: true});

bot.getMe().then(function (me) {
    console.log('Hello! My name is %s!', me.first_name);
    console.log('I will be sending 10 English words with translation for you during the day (10 am to 8 PM). While supported only Russian version. Your feedback and offer to send in chat ');
    console.log('Привет! Я me.first_name');
    console.log('Я буду отправлять 10 английских слов с переводом для тебя в течении дня (с 10 утра до 8 вечера). Пока поддерживается только русская версия. Свои отзывы и предолжения можно присылать в чат ');
});

bot.on('text', function (msg) {
    var messageChatId = msg.chat.id;
    var messageText = msg.text;
    var messageDate = msg.date;
    var messageUsr = msg.from.username;
    onReceiveText(messageChatId, messageText, messageDate, messageUsr);
});

bot.onText(/\/say (.+)/, function (msg, match) {
    var messageChatId = msg.chat.id;
    var word = match[1];
    console.log(messageChatId);
    console.log(word)

    var filePath = __dirname + '/audio/ogg/' + word + '.ogg';
    fs.stat(filePath, function (err, stat) {
        if (err == null) {
            bot.sendVoice(messageChatId, filePath, {'caption': word});
        }
    });
});

bot.on('location', function (msg) {
    var messageChatId = msg.chat.id;
    var locationLatitude = msg.location.latitude;
    var locationLongitude = msg.location.longitude;

    // Запрос на получение смещения по времени по координатам
    var requestStr = 'https://maps.googleapis.com/maps/api/timezone/json?location=' +
        locationLatitude + ',' + locationLongitude + '&timestamp=' + msg.date + '&key=' + googleTimezoneAPIKey;

    Chat.find({chatId: messageChatId}, function (err, chatModels) {
        if (!err) {
            if (chatModels.length > 0) {
                var chat = chatModels[0];

                request({
                    uri: requestStr,
                    method: 'GET'
                }, function (err, res, page) {
                    var timezoneResult = JSON.parse(page);
                    if (timezoneResult.rawOffset || timezoneResult.dstOffset) {
                        // Сохранение координатов и временого пояса
                        chat.laptitude = locationLatitude;
                        chat.longitude = locationLongitude;
                        chat.timezoneOffset = timezoneResult.rawOffset + timezoneResult.dstOffset;

                        chat.save(function (err, newRecord) {
                            if (!err) {
                                sendMessageByBot(messageChatId, 'Принято. Ваша временная зона: ' + timezoneResult.timeZoneId + ' UTC' +
                                chat.timezoneOffset > 0 ? ('+' + chat.timezoneOffset / 3600) : chat.timezoneOffset / 3600);
                            } else {
                                console.error(err);
                            }
                        });
                    }
                });
            }
        } else {
            throw err;
        }
    });
});

function onReceiveText(messageChatId, messageText, messageDate, messageUsr) {

    if (messageText === '/ping') {
        sendMessageByBot(messageChatId, 'pong');
    } else if (messageText === '/help') {
        sendMessageByBot(messageChatId, 'Каждый час я автоматически присылаю 1 сообщение.\n' +
            'Доступные команды: \n' +
            '[/help](/help) - помощь\n' +
            '[/say](/say) - произнести последнее отправленное слово\n' +
            '[/say](/say) слово - произнести слово, если слова нет в моей базе, ничего не произойдет\n');
    } else if (messageText === '/say') {
        Chat.find({chatId: messageChatId}, function (err, chatModels) {
            if (!err) {
                if (chatModels.length > 0) {
                    var currentChat = chatModels[0];
                    if (currentChat.wordPosition - 1 >= 0) {
                        var lastPositionWord = randomPosition[currentChat.wordPosition - 1];
                        var lastWord = words[lastPositionWord];
                        var filePath = __dirname + '/audio/ogg/' + lastWord + '.ogg';
                        bot.sendVoice(messageChatId, filePath, {'caption': lastWord});
                    }
                }
            } else {
                throw err;
            }
        });
    } else if (messageText === '/start') {
        Chat.find({chatId: messageChatId}, function (err, chatModels) {
            if (!err) {
                var isNew = true;
                var newChat = new Chat({
                    chatId: messageChatId,
                    wordPosition: 0,
                    timezoneOffset: 0,
                    isActive: true
                });

                if (chatModels.length > 0) {
                    isNew = false;
                    newChat = chatModels[0];
                    newChat.isActive = true;
                    var indexChat = chatsIndexed.indexOf(messageChatId);
                    chats[indexChat].isActive = true;
                }

                newChat.save(function (err, newRecord) {
                    if (!err) {
                        if (isNew) {
                            chats.push(newRecord);
                            chatsIndexed.push(newRecord.chatId);
                        }
                        sendMessageByBot(messageChatId, 'Рад приветствовать. ' +
                            'Пожалуйста, вышлете мне свое местоположение. Это нужно, чтобы определить вашу временную зону. ' +
                            'Если вы не сделаете этого, сообщения будут приходить с 10 утра до 8 вечера по UTC. ' +
                            'Сейчас время по UTC: ' + formatTime(getUTCDateTimeNow()));
                    } else {
                        console.error(err);
                    }
                });
            } else {
                throw err;
            }
        });
    } else if (messageText === '/stop') {
        Chat.find({chatId: messageChatId}, function (err, chatModels) {
            if (!err) {
                if (chatModels.length > 0) {
                    var newChat = chatModels[0];
                    newChat.isActive = false;

                    newChat.save(function (err, newRecord) {
                        if (!err) {
                            console.log("disactive chat id: " + messageChatId);
                        } else {
                            console.error(err);
                        }
                    });
                }
            } else {
                throw err;
            }
        });
    }

}

function sendMessageByBot(aChatId, aMessage) {
    bot.sendMessage(aChatId, aMessage, {parse_mode: 'Markdown'});
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getUTCDateTimeNow() {
    // Смещение времени на сервере на +3 часа
    var serverTimezoneOffset = 10800000;

    // Текущее время на севрере со смещением
    var serverTimeNow = (new Date()).getTime() - serverTimezoneOffset;

    return new Date(serverTimeNow);
}

function formatTime(date) {
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var seconds = date.getSeconds();
    hours = hours < 10 ? '0' + hours : hours;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    seconds = seconds < 10 ? '0' + seconds : seconds;
    return hours + ':' + minutes + ':' + seconds;
}

/**
 * Получение перевода слова
 * @param word Слово
 * @returns {string} Перевод
 */
function getTranslateWord(word) {
    var resultMsg = '*' + word + '* `[';
    var path = '/var/www/englishtenbot/'
    var translateFromFile = fs.readFileSync(path + 'words/' + word + '.json', 'utf8');
    var translateJson = JSON.parse(translateFromFile);
    var translateDef = translateJson.def;
    var translateMsg = '';
    var transcription = '';
    for (var tranlatePosIndex in translateDef) {
        var translatePos = translateDef[tranlatePosIndex];
        translateMsg += '\n _' + translatePos.pos + '._';
        for (var translateIndex in translatePos.tr) {
            var translate = translatePos.tr[translateIndex];
            translateMsg += '\n' + (parseInt(translateIndex) + 1) + '. ';
            translateMsg += translate.text;
            for (var synonymIndex in translate.syn) {
                var synonym = translate.syn[synonymIndex];
                translateMsg += ', ' + synonym.text;
            }
        }
        transcription = translatePos.ts;
    }
    resultMsg += transcription + ']`';
    resultMsg += translateMsg;
    return resultMsg;
}