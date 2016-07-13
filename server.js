var http = require('http');
var path = require('path');

var async = require('async');
var socketio = require('socket.io');
var express = require('express');
var _ = require('underscore');

var router = express();
var server = http.createServer(router);
var io = socketio.listen(server);

var monk = require('monk');
var db = monk('localhost:27017/wechat');
var chatMessages =db.get('messages');
var users = db.get('users');

// io.set('origins', '*');
// io.set('transports', [ 'websocket', 'polling']);

router.use(express.static(path.resolve(__dirname, 'client')));
router.use(function(req, res, next) {
        // console.log ("inside middleware");
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With");
        res.header("Access-Control-Allow-Headers", "Content-Type");
        res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
        next();
    });
    
var messages = [];
var sockets = [];   

router.get('/jsonpTest', function(req, res){
  res.jsonp([{a:1},{a:2}]);
});

router.get('/getPhotoUrl', function(req, res){
  var username = req.query.username;
  
  users.find({
    username: username
  }
  , function(err, docs){
    if(err) throw err;
    res.jsonp(docs);
  })
});

router.get('/getChatters', function(req, res){
  // console.log("start validating user");
  var username = req.query.username;
  
  async.waterfall([
      function(callback){
          chatMessages.distinct(
            'senderId', 
            {$or: 
              [
                {senderId: username},
                {receiverId: username}
              ]
            },
            callback
          )
      },
      function(chatterIds, callback){
        chatterIds = _.without(chatterIds, username);

        users.find(
          {'username': {$in: chatterIds}}, 
          callback
        );
      }
    ], function(err, result){
      if(err) throw err;
      res.jsonp(result);
  })
});

router.get('/validateUser', function(req, res){
  // console.log("start validating user");
  var username = req.query.username;
  var password = req.query.password;
  
  var user = {
    username: username,
    password: password
  }
  
  console.log(user);
  users.find(user, function(err, docs){
    if(err) throw err;
    console.log(docs);
    res.jsonp(docs);
  })
});

router.get('/register', function(req, res){
  // console.log("start registering");
  var username = req.query.username;
  var email = req.query.email;
  var password = req.query.password;
  
  var user = {
    username: username,
    password: password,
    email: email
  }
  users.insert(user, function(err){
    if(err) throw err;
    console.log("registered new user ", user);
    res.jsonp("User created successfully");
  })
});

router.get('/messages', function(req, res){
  var senderId = req.query.senderId;
  var receiverId = req.query.receiverId;
  console.log('In messages webservice', senderId, receiverId);
  
  if (!senderId || !receiverId) {
    throw new Error('missing parameters senderId or receiverId');
  }
  else{
    chatMessages.find({
      $or: [
          {senderId: senderId, receiverId: receiverId},
          {senderId: receiverId, receiverId: senderId}
        ]
    },
    function(err, docs){
      if (err) throw err;
      console.log('docs', docs);
      console.log('callback function name: ' + req.query.callback);
      res.type('application/javascript');
      res.jsonp(docs);
    })
  }
});

io.on('connection', function (socket) {
  // console.log('a client has been conected');
  socket.on('message', function(msg){
    chatMessages.insert(msg, function(err){
      if (err) throw err;
      console.log('new message: ', msg);
      socket.emit('messageSuccess', {});
    })
  })
});

server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function(){
  var addr = server.address();
  console.log("Chat server listening at", addr.address + ":" + addr.port);
});
