var errorHandler = require('express-error-funnel'),
  validator = require('express-validator'),
  handler = require('node-restify-errors'),
  Vottu = require('../../index').Vottu,
  bodyParser = require('body-parser'),
  request = require('supertest'),
  express = require('express'),
  user = fixtures.User[0],
  util = require('util'),
  url = require('url');

Vottu.use(function() {
  this.on('transform', function( doc, ret ) {
    delete ret.password;
  });
});

var fixture = util._extend({
  __v: 0
}, user);
delete fixture.password;

describe('Resource', function() {
  describe('API', function() {
    beforeEach(function() {
      var app = express();

      app.use(bodyParser.json());
      app.use(bodyParser.urlencoded({
        extended: true
      }));

      app.use(validator());

      this.app = app;

      this.agent = request.agent(app);
    });

    describe('Interface', function() {
      before(Factory.fill);

      it('allows custom serialization', function( done ) {
        var index = new Vottu('User').index();

        index.pre('query', function() {
          this.query.select('_id');
          this.query.sort('createdAt');
        });

        this.app.get('/users.:format?', index.exec(function( req, res, next ) {
          return function( err, data ) {
            if (err) {
              return next(err);
            }

            data = data.map(function( user ) {
              return user._id;
            });

            res.header('Content-type', 'application/json');
            res.status(200).send(data);
          };
        }));

        this.app.use(errorHandler);

        this.agent.get('/users.json')
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function( err, res ) {
            if (err) {
              return done(err);
            }

            var users = fixtures.User.sort(function( a, b ) {
              return Date.parse(a.createdAt) - Date.parse(b.createdAt);
            }).slice(0, 10);

            var data = users.map(function( user ) {
              return user._id;
            });

            assert.lengthOf(res.body, data.length);
            assert.deepEqual(res.body, data);
            done();
          });
      });
    });

    describe('#index', function() {
      before(Factory.fill);

      it('sanitizes', function( done ) {
        var index = new Vottu('User').index(),
          floor = new Date();

        floor.setHours(0, 0, 0, 0);
        floor.setDate(floor.getDate() - 2);

        index.on('sanitize', function( req ) {
          req.sanitizeQuery('published').toBoolean();
        });

        index.on('validate', function( req ) {
          assert.propertyVal(req.query, 'published', false);
        });

        this.app.get('/users.:format?', index.exec());
        this.app.use(errorHandler);

        var uri = url.format({
          pathname: '/users',
          query: {
            published: 'false'
          }
        });

        this.agent.get(uri)
          .expect('Content-Type', /json/)
          .expect(200)
          .end(done);

      });

      it('invalidates', function( done ) {
        var index = new Vottu('User').index();

        index.on('validate', function( req ) {
          req.checkQuery('__v').notEmpty();
        });

        this.app.get('/users.:format?', index.exec());
        this.app.use(errorHandler);

        this.agent.get('/users.json')
          .expect('Content-Type', /json/)
          .expect(400)
          .end(done);
      });

      it('hooks query', function( done ) {
        var index = new Vottu('User').index();

        index.pre('query', function() {
          this.query.select('+role');
        });

        index.post('query', function( context, next ) {
          next(new handler.UnauthorizedError());
        });

        this.app.get('/users.:format?', index.exec());
        this.app.use(errorHandler);

        this.agent.get('/users.json')
          .expect('Content-Type', /json/)
          .expect(401)
          .end(done);
      });

      it('documents should transform', function( done ) {
        var index = new Vottu('User').index();

        index.pre('query', function() {
          this.query.select('+updatedAt +createdAt +role');
          this.query.sort('createdAt');
        });

        index.on('transform', function( doc, ret, options ) {
          delete ret._id;
          delete ret.__v;
        });

        this.app.get('/users.:format?', index.exec());
        this.app.use(errorHandler);

        this.agent.get('/users.json')
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function( err, res ) {
            if (err) {
              return done(err);
            }

            var data = fixtures.User.sort(function( a, b ) {
              return Date.parse(a.createdAt) - Date.parse(b.createdAt);
            }).slice(0, 10).map(function( user ) {
              var fixture = util._extend({}, user);

              delete fixture._id;
              delete fixture.password;

              return fixture;
            });

            assert.deepEqual(res.body, data);
            done();
          });
      });

      it('documents should show', function( done ) {
        var index = new Vottu('User').index();

        index.pre('query', function() {
          this.query.select('+updatedAt +createdAt +role');
          this.query.sort('createdAt');
        });

        this.app.get('/users.:format?', index.exec());
        this.app.use(errorHandler);

        this.agent.get('/users.json')
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function( err, res ) {
            if (err) {
              return done(err);
            }

            var data = fixtures.User.sort(function( a, b ) {
              return Date.parse(a.createdAt) - Date.parse(b.createdAt);
            }).slice(0, 10).map(function( user ) {
              var fixture = util._extend({
                __v: 0
              }, user);

              delete fixture.password;

              return fixture;
            });

            assert.deepEqual(res.body, data);
            done();
          });
      });
    });

    describe('#create', function() {
      before(Factory.flush);

      it('invalidates', function( done ) {
        var create = new Vottu('User').create();

        create.on('validate', function( req ) {
          req.checkBody('__v').notEmpty();
        });

        this.app.post('/users.:format?', create.exec());
        this.app.use(errorHandler);

        this.agent.post('/users.json').send(user)
          .expect('Content-Type', /json/)
          .expect(400)
          .end(done);
      });

      it('hooks save', function( done ) {
        var create = new Vottu('User').create();

        create.pre('save', function( next ) {
          next(new handler.UnauthorizedError());
        });

        this.app.post('/users.:format?', create.exec());
        this.app.use(errorHandler);

        this.agent.post('/users.json').send(user)
          .expect('Content-Type', /json/)
          .expect(401)
          .end(done);
      });

      it('document should create', function( done ) {
        var create = new Vottu('User').create();

        this.app.post('/users.:format?', create.exec());
        this.app.use(errorHandler);

        this.agent.post('/users.json').send(user)
          .expect('Content-Type', /json/)
          .expect(200, fixture)
          .end(done);
      });
    });

    describe('#show', function() {
      before(Factory.fill);

      it('invalidates', function( done ) {
        var show = new Vottu('User').show();

        show.on('validate', function( req ) {
          req.checkQuery('__v').notEmpty();
        });

        this.app.get('/users/:id.:format?', show.exec());
        this.app.use(errorHandler);

        this.agent.get('/users/' + user._id)
          .expect('Content-Type', /json/)
          .expect(400)
          .end(done);
      });

      it('hooks query', function( done ) {
        var show = new Vottu('User').show();

        show.pre('query', function() {
          this.query.select('+role');
        });

        show.post('query', function( context, next ) {
          next(new handler.UnauthorizedError());
        });

        this.app.get('/users/:id.:format?', show.exec());
        this.app.use(errorHandler);

        this.agent.get('/users/' + user._id)
          .expect('Content-Type', /json/)
          .expect(401)
          .end(done);
      });


      it('document should transform', function( done ) {
        var show = new Vottu('User').show();

        show.pre('query', function() {
          this.query.select('+updatedAt +createdAt +role');
        });

        show.on('transform', function( doc, ret, options ) {
          delete ret.__v;
          delete ret._id;
        });

        this.app.get('/users/:id.:format?', show.exec());
        this.app.use(errorHandler);

        var fixture = util._extend({}, user);
        delete fixture.password;
        delete fixture._id;

        this.agent.get('/users/' + user._id)
          .expect('Content-Type', /json/)
          .expect(200, fixture)
          .end(done);
      });

      it('document should show', function( done ) {
        var show = new Vottu('User').show();

        show.pre('query', function() {
          this.query.select('+updatedAt +createdAt +role');
        });

        this.app.get('/users/:id.:format?', show.exec());
        this.app.use(errorHandler);

        this.agent.get('/users/' + user._id)
          .expect('Content-Type', /json/)
          .expect(200, fixture)
          .end(done);
      });
    });

    describe('#destroy', function() {
      before(Factory.fill);

      it('invalidates', function( done ) {
        var destroy = new Vottu('User').destroy();

        destroy.on('validate', function( req ) {
          req.checkQuery('__v').notEmpty();
        });

        this.app.delete('/users/:id.:format?', destroy.exec());
        this.app.use(errorHandler);

        this.agent.delete('/users/' + user._id)
          .expect('Content-Type', /json/)
          .expect(400)
          .end(done);
      });

      it('hooks query', function( done ) {
        var destroy = new Vottu('User').destroy();

        destroy.pre('query', function() {
          this.query.select('+role');
        });

        destroy.post('query', function( context, next ) {
          next(new handler.UnauthorizedError());
        });

        this.app.delete('/users/:id.:format?', destroy.exec());
        this.app.use(errorHandler);

        this.agent.delete('/users/' + user._id)
          .expect('Content-Type', /json/)
          .expect(401)
          .end(done);
      });

      it('hooks destroy', function( done ) {
        var destroy = new Vottu('User').destroy();

        destroy.pre('destroy', function( next ) {
          next(new handler.UnauthorizedError());
        });

        this.app.delete('/users/:id.:format?', destroy.exec());
        this.app.use(errorHandler);

        this.agent.delete('/users/' + user._id)
          .expect('Content-Type', /json/)
          .expect(401)
          .end(done);
      });

      it('document should destroy', function( done ) {
        var destroy = new Vottu('User').destroy();

        destroy.pre('query', function() {
          this.query.select('+updatedAt +createdAt +role');
        });

        this.app.delete('/users/:id.:format?', destroy.exec());
        this.app.use(errorHandler);

        this.agent.delete('/users/' + user._id)
          .expect('Content-Type', /json/)
          .expect(200, fixture)
          .end(done);
      });
    });

    describe('#update', function() {
      before(Factory.fill);

      it('invalidates', function( done ) {
        var update = new Vottu('User').update();

        update.on('validate', function( req ) {
          req.checkBody('__v').notEmpty();
        });

        this.app.put('/users/:id.:format?', update.exec());
        this.app.use(errorHandler);

        this.agent.put('/users/' + user._id).send(user)
          .expect('Content-Type', /json/)
          .expect(400)
          .end(done);
      });

      it('hooks query', function( done ) {
        var update = new Vottu('User').update();

        update.pre('query', function() {
          this.query.select('+role');
        });

        update.post('query', function( context, next ) {
          next(new handler.UnauthorizedError());
        });

        this.app.put('/users/:id.:format?', update.exec());
        this.app.use(errorHandler);

        this.agent.put('/users/' + user._id).send(user)
          .expect('Content-Type', /json/)
          .expect(401)
          .end(done);
      });

      it('hooks save', function( done ) {
        var update = new Vottu('User').update();

        update.pre('save', function( next ) {
          next(new handler.UnauthorizedError());
        });

        this.app.put('/users/:id.:format?', update.exec());
        this.app.use(errorHandler);

        this.agent.put('/users/' + user._id).send(user)
          .expect('Content-Type', /json/)
          .expect(401)
          .end(done);
      });

      it('document should update', function( done ) {
        var update = new Vottu('User').update();

        this.app.put('/users/:id.:format?', update.exec());
        this.app.use(errorHandler);

        this.agent.put('/users/' + user._id).send(user)
          .expect('Content-Type', /json/)
          .expect(200)
          .end(done);
      });
    });

    describe('#count', function() {
      before(Factory.fill);

      it('invalidates', function( done ) {
        var count = new Vottu('User').count();

        count.on('validate', function( req ) {
          req.checkQuery('__v').notEmpty();
        });

        this.app.get('/users/count.:format?', count.exec());
        this.app.use(errorHandler);

        this.agent.get('/users/count.:format?')
          .expect('Content-Type', /json/)
          .expect(400)
          .end(done);
      });

      it('hooks query', function( done ) {
        var count = new Vottu('User').count();

        count.pre('query', function() {
          this.query.where({
            role: 'Subscriber'
          });
        });

        this.app.get('/users/count.:format?', count.exec());
        this.app.use(errorHandler);

        this.agent.get('/users/count.:format?')
          .expect('Content-Type', /json/)
          .expect(200)
          .end(done);
      });

      it('documents should count', function( done ) {
        var count = new Vottu('User').count();

        count.pre('query', function() {
          this.query.where({
            role: 'Subscriber'
          });
        });

        this.app.get('/users/count.:format?', count.exec());
        this.app.use(errorHandler);

        this.agent.get('/users/count.:format?')
          .expect('Content-Type', /json/)
          .expect(200)
          .end(function( err, res ) {
            if (err) {
              return done(err);
            }

            assert.property(res.body, 'count');
            assert.operator(res.body.count, '>', 0);
            done();
          });
      });
    });
  });
});