/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * DS208: Avoid top-level this
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// const root = typeof exports !== 'undefined' && exports !== null ? exports : this;
import Houston from '../imports/houston';

Houston._HIDDEN_COLLECTIONS = {'users': Meteor.users, 'meteor_accounts_loginServiceConfiguration': undefined};
const ADDED_COLLECTIONS = {};
// TODO: describe what this is, exactly, and how it differs from Houston._collections.

Houston._publish = (name, func) => Meteor.publish(Houston._houstonize(name), func);

Houston._setup_collection = function(collection) {
  const name = collection._name;
  if (name in ADDED_COLLECTIONS) { return; }

  Houston._setup_collection_methods(collection);

  Houston._publish(name, function(sort, filter, limit, unknown_arg) {
    check(sort, Match.Optional(Object));
    check(filter, Match.Optional(Object));
    check(limit, Match.Optional(Number));
    check(unknown_arg, Match.Any);
    if (!Houston._user_is_admin(this.userId)) {
      this.ready();
      return;
    }
    try {
      return collection.find(filter, {sort, limit});
    } catch (e) {
      return console.log(e);
    }
  });

  collection.find().observe({
    _suppress_initial: true,  // fixes houston for large initial datasets
    added(document) {
      return Houston._collections.collections.update({name}, {
          $inc: {count: 1},
          $addToSet: { fields: {$each: Houston._get_fields([document])}
        }
      });
    },
    changed(document) {
      return Houston._collections.collections.update({name},
        {$addToSet: {fields: {$each: Houston._get_fields([document])}}});
    },
    removed(document) {
      return Houston._collections.collections.update({name}, {$inc: {count: -1}});
    }});

  const fields = Houston._get_fields_from_collection(collection);
  const c = Houston._collections.collections.findOne({name});
  const count = collection.find().count();
  if (c) {
    Houston._collections.collections.update(c._id, {$set: {count, fields}});
  } else {
    Houston._collections.collections.insert({name, count, fields});
  }
  return ADDED_COLLECTIONS[name] = collection;
};

const sync_collections = function() {
  const collections = {};
  // This does not get all collections:
  // const mongoCollections = Mongo.Collection.getAll() || [];
  const mongoCollections = MongoInternals.defaultRemoteCollectionDriver().mongo.db.collections(bound_sync_collections).await();

  _.each(mongoCollections, function(collection){
    let instance = Mongo.Collection.get(collection.s.name);
    if (!instance) {
      try {
        instance = new Mongo.Collection(collection.s.name);
      } catch(e) {
        // Hiding this error because it just means the collection already exists
        // so we can't create it again (we wouldn't want to anyway)
        // console.log('Houston:', e);
      }
    }
    if (instance) {
      collections[collection.s.name] = instance;
    }
  });

  const _sync_collections = function(meh, collections_db) {
    const collection_names = ((() => {
      const result = [];
      _.each(collections_db, function(col){
        if (((col.collectionName.indexOf("system.")) !== 0) &&
           ((col.collectionName.indexOf("houston_")) !== 0)) {
          result.push(col.collectionName);
        }
      });
      return result;
    })());

    return collection_names.forEach(function(name) {
      if (!(name in ADDED_COLLECTIONS) && !(name in Houston._HIDDEN_COLLECTIONS)) {
        if (collections[name] != null) { return Houston._setup_collection(collections[name]); }
      }
    });
  };

  const bound_sync_collections = Meteor.bindEnvironment(_sync_collections, e => console.log(`Failed while syncing collections for reason: ${e}`));

  // MongoInternals is the 'right' solution as of 0.6.5
  const mongo_driver = (typeof MongoInternals !== 'undefined' && MongoInternals !== null ? MongoInternals.defaultRemoteCollectionDriver() : undefined) || Meteor._RemoteCollectionDriver;
  return mongo_driver.mongo.db.collections(bound_sync_collections);
};

// publish our analysis of the app's collections
Houston._publish('collections', function() {
  if (!Houston._user_is_admin(this.userId)) {
    this.ready();
    return;
  }
  return Houston._collections.collections.find();
});

Houston._publish('users', function (){
  return Meteor.users.find({});
});

Meteor.publish(null, function (){
  return Meteor.roles.find({});
});
