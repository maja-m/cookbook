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
    LocalStrategy = require('passport-local');

var db = require('./db.js');

var app = express();

//===============PASSPORT===============

// Passport session setup.
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

// Use the LocalStrategy within Passport to login/”signin” users.
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
                        req.session.error = 'Could not log user in. Please try again.'; //inform user could not log them in
                        done(null, user);
                    }
                })
                .catch(function (err) {
                    console.log(err);
                });
        }
    )
);

// Use the LocalStrategy within Passport to register/"signup" users.
passport.use('local-signup',
    new LocalStrategy(
        {passReqToCallback: true}, //allows us to pass back the request to the callback
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
                        req.session.error = 'That username is already in use, please try a different one.'; //inform user could not log them in
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
    defaultLayout: 'main', //we will be creating this layout shortly
});
app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');

//===============ROUTES===============

//displays our homepage
app.get('/', function (req, res) {
    res.render('home', {user: req.user});
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
    });
});

app.post('/updateRecipe', function (req, res) {
    var data = req.body;                                        //---------------------databaza
    res.send('Hurra zmieniono ' + data.title);
});

var chosenId;                                                //-----------------------wybiera się dla wszystkich użytkowników...

app.get('/recipe/:id', function (req, res) {
    chosenId = req.params.id;
    //res.redirect('..');                                           //------------------render
    res.render('home', {user: req.user});
})

//logs user out of site, deleting them from the session, and returns to homepage
app.get('/logout', function (req, res) {
    var name = req.user.username;
    console.log("LOGGIN OUT " + req.user.username)
    req.logout();
    res.redirect('/');
    req.session.notice = "You have successfully been logged out " + name + "!";
});

//===============PORT=================
var port = process.env.PORT || 5000; //select your port or let it pull from your .env file
app.listen(port);
console.log("listening on " + port + "!");


handlebars.registerHelper('ifChosen', function (id, options) {
    console.log("Chosen id: " + chosenId);
    if (id === chosenId) {
        return options.fn(this);
    }
    return options.inverse(this);
});
