var mongoURI = "mongodb://heroku_npf5l3vz:82pkinrinvehbnett08u2e88f2@ds029705.mlab.com:29705/heroku_npf5l3vz";
// var mongoURI = "localhost:27017/wechat";

var http = require('http');
var path = require('path');

var async = require('async');
var socketio = require('socket.io');
var express = require('express');
var request = require("request");
var _ = require('underscore');
var loremIpsum = require('lorem-ipsum');

var router = express();
var server = http.createServer(router);
var io = socketio.listen(server);

var monk = require('monk');

var db = monk(mongoURI);
var chatMessages =db.get('messages');
var users = db.get('users');

// io.set('origins', '*');
// io.set('transports', [ 'websocket', 'polling']);

router.use(express.static(path.resolve(__dirname, 'client')));
router.use(function(req, res, next) {
        res.header("Access-Control-Allow-Origin", "*");
        res.header("Access-Control-Allow-Headers", "X-Requested-With");
        res.header("Access-Control-Allow-Headers", "Content-Type");
        res.header("Access-Control-Allow-Methods", "PUT, GET, POST, DELETE, OPTIONS");
        next();
    });
    
var messages = [];
//userId as key, and socket as value
var sockets = {};   

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

router.get('/updatePhotoUrl', function(req, res) {
  var username = req.query.username;
  var photoUrl = req.query.photoUrl;
  console.log('photoUrl', photoUrl);
  
  users.find({
     username: username
  },
  {
    $set: {
      photoUrl: photoUrl
    }
  }
  )
})

router.get('/getChatters', function(req, res){
  var username = req.query.username;
  var ids = [];
  
  //get distinct ids for all past messages
  //can be either senderId or receiverId
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
      function(senderIds, callback){
        ids = ids.concat(senderIds);
        chatMessages.distinct(
            'receiverId', 
            {$or: 
              [
                {senderId: username},
                {receiverId: username}
              ]
            },
            callback
          )
      },
      function(receiverIds, callback){
        var chatterIds = ids.concat(receiverIds);
        chatterIds = _.uniq(chatterIds);
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

router.get('/countNewMessage', function(req, res) {
  var senderId = req.query.senderId;
  var receiverId = req.query.receiverId;
  
  chatMessages.count({senderId: senderId, 
  receiverId: receiverId,
  unread: true}, function(err, docs){
     if(err) throw err;
     res.jsonp(docs)
  })
})

router.get('/validateUser', function(req, res){
  console.log("logging in...");
  
  var username = req.query.username;
  var password = req.query.password;
  
  console.log("username",username);
  
  var user = {
    username: username,
    password: password
  }
  
  users.find(user, function(err, docs){
    if(err) throw err;
    res.jsonp(docs);
  })
});

router.get('/register', function(req, res){
  var username = req.query.username;
  var email = req.query.email;
  var password = req.query.password;
  
  var user = {
    username: username,
    password: password,
    email: email
  }

  async.waterfall([
    function(callback){
      request('https://randomuser.me/api/', callback)
    },
    function(response, body, callback){
        if (!body) return;
        var bodyObj = JSON.parse(body);
        
        var email = bodyObj.results[0].email;
        var photoUrl = bodyObj.results[0].picture.medium;
        
        user.email = email;
        user.photoUrl = photoUrl
        user.description = loremIpsum();
        
        users.insert(user, callback);
    }
  ],function(err){
    if(err) throw err;
    res.jsonp("User created successfully");
  })

});

router.get('/getRecentMsg', function(req, res) {
  var senderId = req.query.senderId;
  var receiverId = req.query.receiverId;
  
  if (!senderId || !receiverId) {
    return;
    // throw new Error('missing parameters senderId or receiverId');
  }
  else{
    chatMessages.find({
      $or: [
          {senderId: senderId, receiverId: receiverId},
          {senderId: receiverId, receiverId: senderId}
        ]
    }, {
      limit: 1,
      sort: {time: -1}
    },
    function(err, docs){
      if (err) throw err;

      res.type('application/javascript');
      res.jsonp(docs);
    })
  }
})

router.get('/messages', function(req, res){
  var senderId = req.query.senderId;
  var receiverId = req.query.receiverId;
  var page = req.query.page;
  var fetchSize = 6;
  
  if (!senderId || !receiverId) {
    throw new Error('missing parameters senderId or receiverId');
  }
  else{
    chatMessages.find({
      $or: [
          {senderId: senderId, receiverId: receiverId},
          {senderId: receiverId, receiverId: senderId}
        ]
    }, {
      limit: fetchSize,
      skip: (page-1) * fetchSize,
      sort: {time: -1}
    },
    function(err, docs){
      if (err) throw err;
      
      // mark all messages as read once enter chat interface
      chatMessages.update(
        {
          senderId: senderId, 
          receiverId: receiverId,
          unread: true}, 
        {
          $set: {
            unread: false
          }
        },{
          multi: true
        })
      
      res.type('application/javascript');
      res.jsonp(docs);
    })
  }
});

router.get('/listUsers', function(req, res) {
    users.find({}, function(err, docs) {
        if (err) throw err; 
        res.jsonp(docs);
    })
})

io.on('connection', function (socket) {
  socket.on('registerSocket', function(id){
    sockets[id.username] = socket;
    socket.username = id.username;
  })
  
  socket.on('disconnect', function () {
    delete sockets[socket.username]
  });
  
  socket.on('sendMessage', function(msg){
    chatMessages.insert(msg, function(err){
      if (err) throw err;
      socket.emit('messageSent', {msg});
      
      //push to receiver
      var receiverId = msg.receiverId;
      var receiverSocket = sockets[receiverId];
      
      if (receiverSocket){
        receiverSocket.emit('receiveMessage', {msg});
      }
    })
  })
});

server.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0", function(){
  var addr = server.address();
  console.log("Chat server listening at", addr.address + ":" + addr.port);
});
