function registerApi(app) {
    require('./answer')(app);
    require('./auth')(app);
    require('./connect')(app);
    require('./corp')(app);
    require('./client')(app);
    require('./consult-note')(app);
    require('./dashboard')(app);
    require('./day-in-review')(app);
    require('./module')(app);
    require('./mood')(app);
    require('./state')(app);
    require('./user')(app);
    require('./user-status')(app);
    require('./week-schedule')(app);
    
    require('./deploy')(app);
}

module.exports = registerApi;