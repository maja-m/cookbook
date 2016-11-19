'use strict';

const request = require('request-promise');
const bcrypt = require('bcryptjs');
const Datastore = require('nedb');
const htmlToText = require('html-to-text');
const db = new Datastore({filename: 'cookbook.db', autoload: true});
db.persistence.setAutocompactionInterval(5000);

let insert = (data) => {
    return new Promise((resolve, reject) => {
        db.insert(data, (error, newDoc) => {
            if (error || !newDoc) {
                reject(error);
            } else {
                resolve(newDoc);
            }
        });
    });
};

let findOne = (query, projection) => {
    return new Promise((resolve, reject) => {
        db.findOne(query, projection, (error, doc) => {
            if (error || !doc) {
                reject(error);
            } else {
                resolve(doc);
            }
        });
    });
};

let update = (query, data) => {
    return new Promise((resolve, reject) => {
        db.update(query, data, {multi: false, returnUpdatedDocs: true}, (error, numAffected, affectedDocuments) => {
            if (error || !numAffected) {
                reject(new Error(error));
            } else {
                resolve(affectedDocuments);
            }
        })
    });
};

exports.register = (username, password) => {
    let hash = bcrypt.hashSync(password, 8);
    let user = {
        "username": username,
        "password": hash,
        "avatar": ""
    };

    return new Promise((resolve, reject) => {
        findOne({"username": username}, {username: 1})
            .then(function (result) { //case in which user already exists in db
                console.log('username already exists');
                resolve(false); //username already exists
            })
            .catch(function (error) {//case in which user does not already exist in db
                console.log(error);

                console.log('Username is free for use');
                insert(user)
                    .then(function () {
                        console.log("USER: " + user);
                        resolve(user);
                    })
                    .catch(function (err) {
                        console.log("PUT FAIL:" + err.body);
                        reject(err);
                    });
            });
    });
};

exports.authenticate = (username, password) => {
    return new Promise((resolve, reject) => {
        findOne({"username": username}, {username: 1, password: 1})
            .then(function (user) {
                console.log('user found');
                var hash = user.password;
                if (bcrypt.compareSync(password, hash)) {
                    resolve(user);
                } else {
                    console.log("PASSWORDS NOT MATCH");
                    resolve(false);
                }
            })
            .catch(function (error) {
                if (error) {
                    console.log(error);
                    reject(error);
                } else {
                    resolve(false);
                }
            });
    });
};

exports.getUser = (username) => {
    return new Promise((resolve, reject) => {
        findOne({"username": username})
            .then(function (user) {
                resolve(user);
            })
            .catch(function (error) {
                reject(new Error(err));
            });
    });
};

exports.addRecipe = (username, url) => {
    let options = {
        uri: 'https://mercury.postlight.com/parser?url=' + url,
        headers: {
            'x-api-key': 'S9l6eG5LPtAQHbYV85cx5tRkw6B1clNwLtNfndp0'
        },
        json: true
    };

    return new Promise((resolve, reject) => {
        request(options)
            .then(data => {
                if (data && data.errorMessage) {
                    reject(new Error(data.errorMessage));}
                else {
                    if (data && data.content && htmlToText.fromString(data.content).trim()) {
                        let id = new Date().getTime();
                        db.update({username: username}, {$set: {['recipes.' + id]: data}}, (error, numReplaced, upsert) => {
                            if (error || numReplaced == 0) {
                                console.log(`Błąd przy dodawaniu przepisu`);
                                reject(new Error(error));
                            } else {
                                console.log(`Dodano przepis: ${data.title}`);
                                resolve(upsert);
                            }
                        });
                    }
                    else {
                        reject(new Error('Sorry, unable to parse the recipe. Try using the manual option.'));
                    }
                }
            })
            .catch(error => reject(new Error(error)));
    });
};

exports.updateRecipe = (username, id, content, title, lead_image_url) => {
    return new Promise((resolve, reject) => {
        let changes = {};
        changes['recipes.' + id + '.content'] = content;
        if (title) {
            changes['recipes.' + id + '.title'] = title;
        }
        if (lead_image_url) {
            changes['recipes.' + id + '.lead_image_url'] = lead_image_url;
        }
        db.update({username: username}, {$set: changes}, (error, numReplaced, upsert) => {
            if (error || numReplaced == 0) {
                console.log(`Błąd przy aktualizacji przepisu`);
                reject(new Error(error));
            } else {
                console.log(`Zaktualizowano przepis!`);
                resolve(upsert);
            }
        });
    })
};
