var bcrypt = require('bcryptjs'),
    Q = require('q'),
    config = require('./config.js'), //config file contains all tokens and other private info
    db = require('orchestrate')(config.db); //config.db holds Orchestrate token

//used in local-signup strategy
exports.localReg = function (username, password) {
    var deferred = Q.defer();
    var hash = bcrypt.hashSync(password, 8);
    var user = {
        "username": username,
        "password": hash,
        "avatar": "http://handlebarsjs.com/images/handlebars_logo.png"
    };
    //check if username is already assigned in our database
    db.get('local-users', username)
        .then(function (result) { //case in which user already exists in db
            console.log('username already exists');
            deferred.resolve(false); //username already exists
        })
        .fail(function (result) {//case in which user does not already exist in db
            console.log(result.body);
            if (result.body.message == 'The requested items could not be found.') {
                console.log('Username is free for use');
                db.put('local-users', username, user)
                    .then(function () {
                        console.log("USER: " + user);
                        deferred.resolve(user);
                    })
                    .fail(function (err) {
                        console.log("PUT FAIL:" + err.body);
                        deferred.reject(new Error(err.body));
                    });
            } else {
                deferred.reject(new Error(result.body));
            }
        });

    return deferred.promise;
};

//check if user exists
//if user exists check if passwords match (use bcrypt.compareSync(password, hash); // true where 'hash' is password in DB)
//if password matches take into website
//if user doesn't exist or password doesn't match tell them it failed
exports.localAuth = function (username, password) {
    var deferred = Q.defer();

    db.get('local-users', username)
        .then(function (result) {
            console.log("FOUND USER");
            var hash = result.body.password;
            console.log(hash);
            console.log(bcrypt.compareSync(password, hash));
            if (bcrypt.compareSync(password, hash)) {
                deferred.resolve(result.body);      //result.body jest całym użytkownikiem z bazy (JSON)
            } else {
                console.log("PASSWORDS NOT MATCH");
                deferred.resolve(false);
            }
        })
        .fail(function (err) {
            if (err.body.message == 'The requested items could not be found.') {
                console.log("COULD NOT FIND USER IN DB FOR SIGNIN");
                deferred.resolve(false);
            } else {
                deferred.reject(new Error(err));
            }
        });

    return deferred.promise;
};

exports.getUser = function (username) {
    var deferred = Q.defer();

    db.get('local-users', username)
        .then(function (result) {
            deferred.resolve(result.body);
        })
        .fail(function (err) {
            deferred.reject(new Error(err));
        });

    return deferred.promise;
};

exports.addRecipe = function (url) {
    console.log(`Requesting recipe through url: ${url}`);
    var deferred = Q.defer();

    var request = require("request");
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            console.log("Request successful");
            var id = body.title + ' - ' + body.domain;
            db.merge('local-users', 'Maja', {                 //----------------------poprawić usera
                    "recipes": {
                        [id]: body
                    }
                })
                .then(function (result) {
                    console.log("dodano przepis" + id + "pomyślnie");
                    deferred.resolve(result.body);
                })
                .fail(function (err) {
                    console.log("błąd przy dodawaniu przepisu");
                    deferred.reject(new Error(err));
                })
        } else {
            console.log(`Request to url failed. Code: ${response.statusCode}. Error: ${error}`);
        }
    })

    return deferred.promise;
};

exports.getRecipe = function (username) {
    db.get('local-users', username)
        .then(function (result) {
            var hash = result.body.recipe;
            console.log(hash);
            //return hash;
        }).fail(function (err) {
        console.log("buuuuuuuuuuu");
    });
}