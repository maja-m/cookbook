'use strict';

var express = require('express'),
    exphbs = require('express-handlebars'),
    logger = require('morgan'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    methodOverride = require('method-override'),
    session = require('express-session'),
    passport = require('passport'),
    handlebars = require('handlebars'),
    sassMiddleware = require('node-sass-middleware'),
    LocalStrategy = require('passport-local'),
    multer  = require('multer');

var storage =   multer.diskStorage({
    destination: function (req, file, callback) {
        callback(null, './uploads');
    },
    filename: function (req, file, callback) {
        let extension = file.originalname.split('.').pop();
        let filename = extension ? `${req.user.username}.${extension}` : req.user.username;
        callback(null, filename);
    }
});
var upload = multer({ storage : storage}).single('userPhoto');

var db = require('./db.js');

var app = express();

//===============PASSPORT===============

passport.serializeUser(function (user, done) {
    console.log(`Serializing user ${user.username}`);
    done(null, user.username);
});

passport.deserializeUser(function (username, done) {
    console.log(`Deserializing user ${username}`);
    var user = db.getUser(username).then(function (user) {
        done(null, user);
    }).catch(function (error) {
        console.error(`Deserializing user ${username} failed`);
        console.error(error);
    });
});

passport.use('local-signin',
    new LocalStrategy(
        {passReqToCallback: true}, //allows us to pass back the request to the callback
        function (req, username, password, done) {
            console.log('local-signin callback');
            db.authenticate(username, password)
                .then(function (user) {
                    if (user) {
                        console.log("LOGGED IN AS: " + user.username);
                        req.session.success = 'You are successfully logged in ' + user.username + '!';
                        done(null, user);
                    }
                    if (!user) {
                        console.log("COULD NOT LOG IN");
                        req.session.error = 'Could not log user in. Please try again.';
                        done(null, user);
                    }
                })
                .catch(function (err) {
                    console.log(err);
                });
        }
    )
);

passport.use('local-signup',
    new LocalStrategy(
        {passReqToCallback: true},
        function (req, username, password, done) {
            db.register(username, password)
                .then(function (user) {
                    if (user) {
                        console.log("REGISTERED: " + user.username);
                        req.session.success = 'You are successfully registered and logged in ' + user.username + '!';
                        done(null, user);
                    }
                    if (!user) {
                        console.log("COULD NOT REGISTER");
                        req.session.error = 'That username is already in use, please try a different one.';
                        done(null, user);
                    }
                })
                .catch(function (err) {
                    console.log(err);
                });
        }
    )
);

//===============EXPRESS================
// Configure Express
app.use(logger('combined'));
app.use(cookieParser());
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(methodOverride('X-HTTP-Method-Override'));
app.use(session({secret: 'supernova', saveUninitialized: true, resave: true}));
app.use(passport.initialize());
app.use(passport.session());

//sass
app.use('/assets', sassMiddleware({
    /* Options */
    src: 'sass',
    dest: 'assets',
    debug: true,
    outputStyle: 'extended',
    log: (severity, key, value) => console.log(`[node-sass-middleware] ${severity}: ${key} => ${value}`)
}));
// Note: you must place sass-middleware *before* `express.static` or else it will not work.
app.use('/assets', express.static('assets'));
app.use('/uploads', express.static('uploads'));
app.use('/vendor/fonts', express.static('node_modules/bootstrap-sass/assets/fonts/bootstrap'));

// Session-persisted message middleware
app.use(function (req, res, next) {
    var err = req.session.error,
        msg = req.session.notice,
        success = req.session.success;

    delete req.session.error;
    delete req.session.success;
    delete req.session.notice;

    if (err) res.locals.error = err;
    if (msg) res.locals.notice = msg;
    if (success) res.locals.success = success;

    next();
});

// Configure express to use handlebars templates
var hbs = exphbs.create({
    defaultLayout: 'main',
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

//===============ROUTES===============

//displays our homepage
app.get('/', function (req, res) {
    if (req.user) {
        res.redirect('/user/' + req.user.username);
    }
    else {
        res.redirect('/signin');
    }
    //res.render('home', {user: req.user});
});

app.get('/user/:username/:tag?', function (req, res) {
    if (req.user && req.params.username == req.user.username) {
        res.render('user', {user: req.user, owner: req.user, tag: req.params.tag});
    }
    else {
        db.getUser(req.params.username)
        .then(function (user) {
            res.render('user', {user: req.user, owner: user, tag: req.params.tag});
        }).catch(function (error) {
            console.error(error);
            res.send(error);
        });
    }

});

//displays our signup page
app.get('/signin', function (req, res) {
    res.render('signin');
});

//sends the request through our local signup strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/local-reg', passport.authenticate('local-signup', {
        successRedirect: '/',
        failureRedirect: '/signin'
    })
);

//sends the request through our local login/signin strategy, and if successful takes user to homepage, otherwise returns then to signin page
app.post('/login', passport.authenticate('local-signin', {
        successRedirect: '/',
        failureRedirect: '/signin'
    })
);

app.post('/newRecipe', function (req, res) {
    var name = req.user.username;
    var uri = req.body.recipeUri;
    var url = uri.toString().substr(0, uri.toString().length - 1);
    db.addRecipe(name, url).then(function () {
        req.session.success = 'The recipe was successfully added!';
        res.redirect('..');
    })
    .catch(function (e) {
        req.session.error = e.message;
        res.redirect('..');
    });
});

app.get('/createRecipe', function (req, res) {
    res.render('create', {user: req.user});
});

app.post('/updateRecipe', function (req, res) {
    var data = req.body;
    db.updateRecipe(req.user.username, data.id, data.content, data.title, data.lead_image_url)
        .then(function () {
            res.send('Updated ' + data.title + '!');
        })
        .catch(function (error) {
            res.send('Error: ' + error);
        });
});

app.post('/updateStars', function (req, res) {
    let data = req.body;
    db.updateStars(data.value, data.id, data.owner)
        .then(function () {
            res.send('Your vote has been saved!');
        })
        .catch(function (error) {
            res.send('Error: ' + error);
        });
});

app.post('/addTags', function (req, res) {
    let data = req.body;
    db.addTags(data.value, data.id, data.owner)
        .then(function () {
            res.send('The tag has been added!');
        })
        .catch(function (error) {
            res.send('Error: ' + error);
        });
});

app.post('/removeTags', function (req, res) {
    let data = req.body;
    db.removeTags(data.value, data.id, data.owner)
        .then(function () {
            res.send('The tag has been removed!');
        })
        .catch(function (error) {
            res.send('Error: ' + error);
        });
});

app.post('/deleteRecipe', function (req, res) {
    var data = req.body;
    db.deleteRecipe(req.user.username, data.id)
        .then(function () {
            res.send('Recipe wa successfully removed!');
        })
        .catch(function (error) {
            res.send('Error: ' + error);
        });
});

app.get('/settings', function (req, res) {
    res.render('settings', {user: req.user, owner: req.user});
});

app.post('/uploadAvatar', function(req,res){
    upload(req,res,function(err) {
        if(err) {
            return res.end("Error uploading file.");
        }
        db.updateAvatar(req.user.username, req.file.filename)
            .then(function () {
                res.redirect('/settings');
            })
            .catch(function (error) {
                res.send('Error: ' + error);
            });
    });
});

app.post('/updatePassword', function(req,res){
    db.updatePassword(req.user.username, req.body.newPassword1)
        .then(function () {
            req.session.success = 'Password was successfully changed!';
            res.redirect('/settings');
        })
        .catch(function (error) {
            res.send('Error: ' + error);
        });
});

app.get('/user/:user/recipe/:id', function (req, res) {
    var chosenId = req.params.id;
    db.getUser(req.params.user)
    .then(function (user) {
        res.render('recipe', {user: req.user, recipe: user.recipes[chosenId], id: req.params.id, owner: user});
    }).catch(function (error) {
        console.error(error);
        res.send(error);
    });
});

//logs user out of site, deleting them from the session, and returns to homepage
app.get('/logout', function (req, res) {
    var name = req.user.username;
    console.log("LOGGING OUT " + req.user.username);
    req.logout();
    res.redirect('/');
    req.session.notice = "You have successfully been logged out " + name + "!";
});

//===============PORT=================
let port = process.env.PORT || 5000; //select your port or let it pull from your .env file
app.listen(port);
console.log("listening on " + port + "!");

handlebars.registerHelper('ifLoggedUser', function(username, urlUsername, options) {
    if(username === urlUsername) {
        console.log('zgadza się');
        return options.fn(this);
    }
    return options.inverse(this);
});

handlebars.registerHelper('getTags', function(recipes, username='.') {
    let tagSet = new Set();
    for(let i in recipes) {
        let recipe = recipes[i];
        if (recipe.tags) {
            let tags = recipe.tags.toString().split(",");
            for(let j in tags) {
                let tag = tags[j];
                if (tag) {
                    tagSet.add(tag);
                }
            }
        }
    }
    console.log(tagSet);
    let tagList = '';
    for(let tag of tagSet) {
        tagList += `<li><a href="/user/${username}/${tag}">${tag}</a></li>`;
    }
    return tagList;
});

handlebars.registerHelper('tagFilter', function(recipe, chosenTag, options) {
    if (!chosenTag) {
        return options.fn(this);
    }
    if (recipe.tags) {
        let tags = recipe.tags.toString().split(",");
        for(let j in tags) {
            let tag = tags[j];
            if (tag) {
                if (tag == chosenTag) {
                    return options.fn(this);
                }
            }
        }
    }
    return options.inverse(this);
});
